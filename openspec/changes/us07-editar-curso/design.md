## Context

US05 creó las tablas `courses` y `classes` (con `UNIQUE (school_id, normalized_name)` y `UNIQUE (course_id, normalized_name)`), `POST` y `GET /api/courses`, la validación compartida (`test-fixtures/course-fields.json`) y `CreateCoursePage`; US06 rediseñó `/cursos` como tabla o tarjetas con búsqueda. Hoy no existe forma de corregir un curso. US07 añade la edición del nombre y de las clases (proposal.md), con las clases identificadas por su `id` para que los tutores (US09), alumnos (US14) y horarios futuros las referencien sin perderlas al renombrarlas.

Restricciones:

- Producción usa el _pooler_ de Supabase en modo transacción: nada de sesión (`SET`, `LISTEN`, bloqueos de sesión). Los bloqueos de fila dentro de una transacción (`FOR UPDATE`) sí funcionan; ya los usa `SchoolUserRepository.applyChange`.
- El colegio sale siempre de la identidad; todo puerto recibe `schoolId`.
- Contrato primero (`docs/api-spec.yml`), tipos generados, código de error nuevo en el enum y en `ERROR_CODES` a la vez.

## Goals / Non-Goals

**Goals:**

- `GET /api/courses/{id}` y `PUT /api/courses/{id}` con estado final completo, atómico, con identidad estable de las clases.
- Intercambio de nombres y reutilización del nombre de una clase quitada sin errores del índice.
- `409 COURSE_CHANGED` cuando el cuerpo trae una clase que ya no es del curso; last-write-wins en lo demás.
- `/cursos/:id/editar` con el formulario de US05 compartido, «Guardar» solo con cambios reales y la acción «Editar» en el listado.

**Non-Goals:**

- Tutores, alumnos, confirmación al quitar clases, comprobación del nombre en tiempo real, aviso de cambios sin guardar, bloqueo optimista con versión o `updatedAt`, límite de ediciones, borrar cursos.
- Cambios en el modelo de datos: sin migración.

## Decisions

### D1. Un único `PUT` con el estado final, no endpoints por clase

`PUT /api/courses/{id}` recibe `{ name, classes: [{ id?, name }] }` y el servidor calcula la diferencia. Alternativa descartada: `PUT` del curso más `POST`/`DELETE` por clase (la ficha original): varias peticiones no son atómicas (CA10) y el frontend tendría que ordenar y deshacer llamadas. El estado final es además lo que el formulario ya tiene.

### D2. La diferencia la calcula una función pura del dominio, ejecutada dentro de la transacción

`domain/course/courseUpdate.ts` expone `planCourseUpdate(current, requested)`:

- `current`: las clases guardadas del curso (`id`, `name`, `normalizedName`).
- `requested`: el nombre y las clases ya validados y limpios (las nuevas con su UUIDv7 ya generado por el caso de uso con `IdGenerator`).
- Devuelve `{ removed: id[], renamed: { id, name, normalizedName }[], created: NewClass[], nameChanged: boolean }`, o lanza `CourseChanged` si algún `id` pedido no está en `current`.

Una clase con `id` cuyo nombre no cambia en absoluto no aparece en `renamed`; si solo cambian mayúsculas, sí (cambia `name` y no `normalizedName`).

`CourseRepository.update(schoolId, courseId, requested, plan)` abre un `$transaction` interactivo, bloquea la fila del curso, lee sus clases, llama a `plan` y escribe. Es el patrón de `SchoolUserRepository.applyChange` (la regla en el dominio, el invariante en el repositorio). Alternativas descartadas:

- Leer las clases en el caso de uso, fuera de la transacción: otra edición podría cambiar las clases entre la lectura y la escritura, y el `409` dejaría de ser fiable.
- Toda la lógica dentro del repositorio: la regla no se podría probar sin base de datos.

### D3. Bloqueo de la fila del curso

Primera sentencia de la transacción: `SELECT id FROM courses WHERE id = $1 AND school_id = $2 FOR UPDATE` (`$queryRaw`, con parámetros). Sin fila → `CourseNotFound` (inexistente o de otro colegio, indistinguibles). El bloqueo serializa las ediciones del mismo curso (las de otros cursos no esperan) y garantiza que la lista de clases que lee `plan` sigue siendo la real al escribir. Así, de dos `PUT` simultáneos, el segundo ve lo que dejó el primero: si el primero quitó una clase que el segundo renombra, el segundo recibe `COURSE_CHANGED`. Alternativa descartada: nivel `Serializable` con reintentos: más complejo y con errores de serialización que habría que traducir.

### D4. Orden de escrituras y renombrado en dos fases

Dentro de la transacción, tras `plan`:

1. `update` del curso con `name` y `normalized_name` (Prisma renueva `updated_at`, también cuando solo cambian las clases). Va primero: si el nombre ya lo tiene otro curso del colegio, falla sin haber escrito nada más.
2. `deleteMany` de `removed` (con `courseId` en el `where`, por defensa).
3. Fase 1: cada clase de `renamed` cuyo `normalizedName` cambia pasa a un nombre temporal `#<i>` (`i`, su posición entre las que cambian) en `name` y `normalized_name`. `#` no es un carácter válido, así que nunca coincide con un nombre real, y cabe en `varchar(10)` con 12 clases como máximo.
4. Fase 2: cada clase de `renamed` toma su nombre definitivo.
5. `createMany` de `created`.
6. Lectura final del curso con `LIST_FIELDS` para la respuesta.

Borrar primero permite reutilizar el nombre de una clase quitada; la fase temporal permite el intercambio A↔B. El índice `UNIQUE (course_id, normalized_name)` no es diferible (Prisma crea índices, no restricciones `DEFERRABLE`), por eso el orden. Alternativas descartadas: borrar y recrear todas las clases (pierde la identidad, que es la decisión central) y rechazar los intercambios (regla arbitraria para el usuario).

Si nada cambia (`plan` vacío y el mismo nombre), no se escribe nada: `200` con el estado actual y sin evento `COURSE_UPDATED`.

### D5. Errores y su traducción

- `CourseNotFound` y `CourseChanged`, nuevos en `domain/course/courseErrors.ts`; `errorHandler` los traduce a `404 NOT_FOUND` y `409 COURSE_CHANGED`.
- La violación de `courses_school_id_normalized_name_key` al actualizar el curso se traduce a `CourseAlreadyExists` como en `create` (mismo `violatedUniqueIndex`); la transacción se deshace entera.
- Una violación del índice de clases no debería ocurrir (la validación impide duplicados y el bloqueo, cambios ajenos); si ocurre, se propaga como `500`, porque sería un error de programación.
- Un `id` de curso que no es un UUID: el router responde `404` sin llamar al caso de uso, con `z.uuid()` como `usersRouter`.
- `translateDatabaseErrors` envuelve la transacción completa (`503`).

### D6. Validación del cuerpo

`application/courses/updateCourseRequest.ts` (`parseUpdateCourseRequest`) reutiliza las piezas de `createCourseRequest.ts` (se extrae la validación de `name` y de la lista de clases a funciones compartidas dentro del módulo) y añade, por clase, `id` opcional: si está presente debe ser un UUID (`INVALID_FORMAT`) y no repetirse (`DUPLICATE`, desde la segunda aparición). Devuelve `{ name, classes: [{ id?: string, name }] }`. El fichero de ejemplos `course-fields.json` no cambia: el `id` no es un campo del formulario y solo lo valida el backend.

### D7. Casos de uso

- `GetCourse` (`{ schoolId, courseId }`) → `CourseRepository.findById` → `CourseNotFound` si no está; ordena las clases con el mismo `Intl.Collator` que `ListCourses` (se extrae `sortClasses`/`byName` a un módulo compartido de `application/courses/`).
- `UpdateCourse` (`{ schoolId, actorId, courseId, body }`): valida (`ValidationError`), genera los `id` de las clases sin `id`, normaliza, llama a `courseRepository.update` con `planCourseUpdate` y ordena las clases de la respuesta. Registra `COURSE_UPDATED` (`classes_added`, `classes_removed`, `classes_renamed` desde el plan, que el repositorio devuelve junto al curso) o `COURSE_UPDATE_REJECTED` (`reason: duplicate | changed`). Los nombres no van al log. Un `CourseNotFound` no se registra (como el `404` de usuarios).

### D8. Contrato

- `GET /api/courses/{id}` (`getCourse`) y `PUT /api/courses/{id}` (`updateCourse`), con el parámetro `id` (`string`, sin `format: uuid` en el parámetro de ruta, porque un id inválido también es `404` y no `400`).
- `UpdateCourseRequest`: `name` y `classes[]` con `id` opcional (`format: uuid`) y `name`.
- Respuestas: las reutilizables de `components.responses` (`Unauthorized`, `ValidationError`, `DatabaseUnavailable`) y una nueva `CourseNotFound` (como `UserNotFound` e `InvitationNotFound`: otro colegio, inexistente o id que no es UUID, sin distinguir el caso); `409` con descripción de `COURSE_ALREADY_EXISTS` y `COURSE_CHANGED`. `COURSE_CHANGED` al enum `ErrorCode`.

### D9. Frontend: `CourseForm` común y página de edición

- `components/CourseForm.tsx` se extrae de `CreateCoursePage`: recibe `initialValues` (`name`, `classes: { id?, name }[]`), `onSubmit(values)` asíncrono que devuelve el resultado ya interpretado (errores de campo, nombre ocupado o error general), `submitDisabled?` y los textos del título los pone la página. Conserva todo lo de US05: filas con `key` estable (y ahora el `id` de la clase, si lo tiene), máximo 12, sin quitar la última, foco en el primer inválido, `aria-*`, guarda síncrona. Los tests de `CreateCoursePage` siguen pasando sin cambiar su comportamiento observable.
- `pages/EditCoursePage.tsx`: lee `:id` con `useParams`, pide el curso una vez (patrón `requestedAttempt`/`mounted` de `CoursesPage`), y pinta cargando, no disponible, error con «Reintentar» o el formulario. «Guardar» se deshabilita si `hasCourseChanges(initial, current)` es falso: compara el nombre y la lista de `{ id, name }` con los valores limpiados (`trim` y espacios colapsados, la misma limpieza que la validación) y en orden. Con `COURSE_CHANGED` muestra el aviso y «Recargar», que vuelve a pedir el curso y remonta el formulario con una `key` nueva (descarta lo escrito).
- `coursesService.get(authorizedFetch, id)` → `loaded | notFound | unauthenticated | unavailable`; `coursesService.update(authorizedFetch, id, values)` → `updated | validationError | alreadyExists | courseChanged | notFound | unauthenticated | unavailable`. Nunca lanzan.
- `CoursesPage`: columna «Acciones» y enlace en las tarjetas (`<Link className="btn btn-sm btn-outline-primary">` con `aria-label` «Editar {nombre}»); el aviso de llegada acepta `{ courseUpdated: <texto> }` además de `{ courseCreated }`.
- `App.tsx`: ruta `/cursos/:id/editar` bajo `AuthenticatedLayout`. `AppHeader` no cambia: el `NavLink` a `/cursos` ya se marca activo en sus subrutas (sin `end`); un test lo fija.

### D10. Rendimiento y seguridad

- La transacción hace como mucho ~30 sentencias (12 clases) y bloquea una sola fila: corta. El `GET` es una consulta con las clases incluidas.
- El aislamiento por colegio está en el `SELECT … FOR UPDATE` (curso) y en el `courseId` de cada escritura de clases; un `id` de clase de otro curso nunca se escribe, porque `plan` lo rechaza antes.
- Sin efecto sobre el rendimiento del solver de horarios (no existe aún).

## Risks / Trade-offs

- [Last-write-wins sobrescribe en silencio un cambio de nombre ajeno] → Aceptado en la ficha; el `409` cubre el caso que perdería o resucitaría datos (clases borradas).
- [El nombre temporal `#<i>` queda visible si la transacción se interrumpe] → Imposible: la transacción es atómica; si falla, se deshace todo.
- [Timeout por defecto de las transacciones interactivas de Prisma (5 s)] → Muy por encima de lo que tardan ~30 sentencias; con la base de datos lenta, el error de transacción se traduce como fallo de conexión o termina en `500`. Se comprueba en el test de base de datos no disponible.
- [La extracción de `CourseForm` rompe la creación] → Los tests de `CreateCoursePage` y el E2E de US05 se ejecutan sin cambios antes de añadir la edición.
- [El `NavLink` deja de marcar «Cursos» si alguien añade `end`] → Test explícito de `aria-current` en `/cursos/<id>/editar`.

## Migration Plan

Sin migración de datos. Despliegue normal desde `main` (CI, `prisma migrate deploy` sin migraciones nuevas, smoke test). Vuelta atrás: revertir la PR; no hay cambios de esquema que deshacer.

## Open Questions

Ninguna: las decisiones de alcance, identidad, concurrencia y página están validadas (ficha de US07).
