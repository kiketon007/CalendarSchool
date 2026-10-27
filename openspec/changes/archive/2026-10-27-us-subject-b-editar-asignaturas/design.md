## Context

- **US-SUBJECT (archivada el 2026-10-26)** dejó `subjects` (nombre y código normalizados con índices únicos por colegio, código nulo si no se rellena, enums de tipo, estado y color) y `subject_courses` (clave primaria `(subject_id, course_id)`, `sessions_per_week` de 1 a 5 con `CHECK`, `ON DELETE CASCADE` por los dos lados), `POST` y `GET /api/subjects`, `parseCreateSubjectRequest` con la tabla compartida `test-fixtures/subject-fields.json`, `PrismaSubjectRepository.create` (cursos `FOR SHARE` en orden de `id`, `violatedUniqueIndex` para distinguir los dos `409`), `subjectsRouter` con `requireRole('ADMIN')` solo en el `POST`, y en el frontend `SubjectForm` (ya recibe `initialValues` y `failureMessage`; cursos marcados por `id` y **derivados al pintar** de la lista cargada; «Guardar» deshabilitado mientras los cursos cargan, fallan o no hay ninguno), `SubjectsPage` (filtros y búsqueda en el navegador, resumen de cursos desplegable) y `CreateSubjectPage`.
- **Patrón de edición:** US07, US17 y, sobre todo, US-BASE_b (calendarios), que es el más parecido: `id` validado en el router antes del cuerpo (`parseCalendarId`), `PUT` con el estado final y el parser del alta, puerto `update` que devuelve cómo era y cómo quedó, `404` con el código común `NOT_FOUND` y una respuesta reutilizable, padre `FOR UPDATE` y después la unión de hijos en orden de `id`, `requireChanges` en el formulario y carga única con `StrictMode`.
- **Decisiones de producto** (ficha de US-SUBJECT_b, 2026-10-26): se inactiva desde el campo «Estado»; gana el último guardado; una asignatura sin cursos no se guarda hasta marcar uno y el formulario lo avisa al cargarla; `INACTIVE` sigue sin consecuencias; el color no se propone al editar; un curso que la asignatura ya tenía, desmarcado y vuelto a marcar, recupera sus sesiones originales.

## Goals / Non-Goals

**Goals:**

- Editar nombre, código, tipo, estado, descripción, color y cursos con sus sesiones de una asignatura con las mismas reglas que el alta, solo para `ADMIN`, con lectura para los dos roles.
- Una edición atómica y sin interbloqueos con el alta, otras ediciones, el borrado de cursos y la edición de calendarios.
- Reutilizar `SubjectForm` sin duplicar validación ni maquetación.

**Non-Goals:**

- Borrar asignaturas (US-SUBJECT_c), restricciones (US19), consecuencias de `INACTIVE`, control de versión o aviso de conflictos, historial y duplicar asignaturas.

## Decisions

### 1. Contrato: dos operaciones sobre `/api/subjects/{id}` y ningún código nuevo

`getSubject` (`200 { subject }`) y `updateSubject` (cuerpo `UpdateSubjectRequest`, la misma forma que `CreateSubjectRequest` declarada aparte para que cada operación tenga su nombre en los tipos generados; `200 { subject }`). El `404` es `NOT_FOUND` con la respuesta reutilizable `SubjectNotFound`, como `CalendarNotFound`. Alternativa descartada: un código `SUBJECT_NOT_FOUND`; rompería la convención y obligaría a tocar `ErrorCode`, `ERROR_CODES` y `api-error-handling` sin beneficio para el cliente.

Alternativa descartada para el `GET`: que la página de edición busque la asignatura en `GET /api/subjects`. Un enlace directo o una recarga necesitarían la lista entera, y el `404` de una asignatura borrada se confundiría con un fallo de carga; el `GET` por `id` es el patrón de cursos, alumnos y calendarios.

### 2. Dominio y aplicación

- `domain/subject/subjectErrors.ts` gana `SubjectNotFound`. El puerto `SubjectRepository` gana `findById(schoolId, id): Promise<Subject | null>` y `update(schoolId, id, changes): Promise<{ before: Subject; after: Subject } | null>` (`null` si la asignatura no es del colegio), con `changes` igual a `NewSubject` sin `id` (`SubjectChanges`).
- `GetSubject` convierte `null` en `SubjectNotFound` y devuelve los cursos ordenados con `byName` (el mismo orden que el alta y el listado).
- `parseUpdateSubjectRequest` delega en `parseCreateSubjectRequest` (mismas reglas y mismo orden de errores; la tabla compartida sigue siendo la fuente).
- `UpdateSubject`: parsea el cuerpo (un `400` no toca el repositorio ni registra nada, como en el alta), llama a `update`, convierte `null` en `SubjectNotFound` con `SUBJECT_UPDATE_REJECTED` (`not_found`), `SubjectCoursesNotFound` en el `400` de `courses[<i>].courseId` (`course_not_found`), y `SubjectAlreadyExists` y `SubjectCodeAlreadyExists` en sus `409` (`duplicate_name` y `duplicate_code`). Con éxito registra siempre `SUBJECT_UPDATED` (como `CALENDAR_UPDATED`, también con `changed_fields: []`) y devuelve `after` con los cursos ordenados por `byName`.
- **`changed_fields` y recuentos** son una función pura de dominio (`subjectChanges(before, after)`, en `domain/subject/`), porque tienen varias ramas: nombre y código exactos (cambiar mayúsculas es un cambio), tipo, estado, descripción y color por igualdad, y `courses` si cambia el conjunto de `(curso, sesiones)`; `courses_added` y `courses_removed` son diferencias de conjuntos de ids y `courses_changed`, los cursos de los dos lados con otras sesiones.
- `parseSubjectId` en `presentation/subjects/` (como `parseCalendarId`): un `id` que no es UUID lanza `SubjectNotFound` sin llegar al caso de uso. El `PUT` monta `requireRole('ADMIN')` antes, así que el orden es rol → `id` → cuerpo → asignatura → cursos → nombre y código.

### 3. Transacción y bloqueos en `PrismaSubjectRepository.update`

Dentro de `$transaction`:

1. `SELECT id FROM subjects WHERE id = $1 AND school_id = $2 FOR UPDATE`. Si no hay fila, `null` antes de tocar nada (una asignatura inexistente gana a un curso inexistente).
2. `SELECT id FROM courses WHERE school_id = $2 AND (id = ANY($3) OR id IN (SELECT course_id FROM subject_courses WHERE subject_id = $1)) ORDER BY id FOR SHARE`: la unión de los cursos pedidos y de los que tiene hoy, en orden de `id`. Si falta alguno de los pedidos, `SubjectCoursesNotFound` con sus posiciones.
3. Leer la asignatura como era (`before`), ya con sus cursos estables.
4. `update` de los campos con nombre y código normalizados (la violación de un índice único se traduce con `violatedUniqueIndex` en `SubjectAlreadyExists` o `SubjectCodeAlreadyExists`; la propia asignatura no choca consigo misma porque es la misma fila).
5. `deleteMany` de sus filas de `subject_courses` y `createMany` de las recibidas.
6. Releer (`after`).

- **`FOR SHARE` y no `FOR UPDATE` en los cursos:** la edición no modifica los cursos, solo necesita que no desaparezcan mientras escribe, como el alta. Incluir los actuales evita que el borrado de uno de ellos (curso `FOR UPDATE` → cascada sobre `subject_courses`) se cruce con el `deleteMany` del paso 5.
- **Sin ciclos de bloqueo:** el alta bloquea solo cursos (`FOR SHARE`, por `id`); la edición, su asignatura y después cursos en el mismo orden; dos ediciones de asignaturas distintas bloquean asignaturas distintas y comparten los `FOR SHARE`; el borrado de un curso y la edición de un calendario toman cursos `FOR UPDATE` en orden de `id` y nunca una asignatura. Ninguna transacción espera por una asignatura mientras retiene un curso.
- **Gana el último:** dos ediciones de la misma asignatura se serializan en el paso 1; la segunda lee el estado que dejó la primera y lo reemplaza entero, así que nunca queda una mezcla de cursos.
- **Alternativa descartada:** aplicar diferencias a `subject_courses` (insertar, actualizar y borrar fila a fila) para conservar `created_at`. Nada referencia hoy esas filas y el reemplazo es más simple y atómico; si US19 las referencia, se revisará allí (riesgo anotado).

### 4. Rutas y roles

`GET /:id` con solo `requireAuthentication` (montado ya en el router) y `PUT /:id` con `requireRole('ADMIN')` delante, como el `POST`. Las dos con `no-store` (lo pone `noStore` a toda la API).

### 5. Frontend

- `subjectsService.get(authorizedFetch, id)` (`loaded`, `notFound`, `unauthenticated`, `unavailable`) y `update(authorizedFetch, id, input)` (`updated`, `validationError`, `alreadyExists`, `codeAlreadyExists`, `notFound`, `forbidden`, `unauthenticated`, `unavailable`), con el `id` codificado, validando la forma de la respuesta con el mismo validador de `Subject` del listado y sin lanzar nunca.
- `validation/subjectValidation.ts` gana `subjectDraftFrom(subject)` (la asignatura cargada como `SubjectDraft`: `null` a `''`) y `hasSubjectChanges(initial, current)`, que compara **lo que se enviaría** (`toCreateSubjectInput` de los dos: nombre limpio, código y descripción recortados con vacío igual a `null`) y los cursos como conjunto de `(courseId, sessionsPerWeek)`, sin depender del orden.
- `SubjectForm` gana `requireChanges` (prop opcional que el alta no usa). Con ella, «Guardar» está deshabilitado mientras `hasSubjectChanges(initialValues, borrador que se enviaría)` sea falso; el borrador que se enviaría ya se deriva al pintar de la lista cargada, así que un curso de la asignatura que desapareció al recargar cuenta como cambio. Al marcar un curso, sus sesiones son las de `initialValues` si la asignatura ya lo tenía y 2 si no (en el alta `initialValues.courses` está vacío, así que no cambia nada). El aviso «Esta asignatura no tiene cursos: marca al menos uno para guardarla» se pinta bajo la lista de cursos si `initialValues.courses` está vacío y `requireChanges` está activa, ligado por `aria-describedby`; la validación del envío sigue exigiendo un curso. Mientras los cursos cargan o fallan, «Guardar» sigue deshabilitado como en el alta, así que no hace falta el truco de calendarios de enviar los cursos iniciales.
- `pages/EditSubjectPage.tsx` bajo `RequireRole role="ADMIN"`: pide la asignatura y los cursos una vez cada uno (una `ref` del intento pedido para `StrictMode`, como `EditCalendarPage`), **no monta el formulario hasta tener los dos** (el formulario lee sus valores iniciales al montarse), lo monta con `key` del intento, traduce cada resultado del `update` como dice la spec y navega a `/asignaturas` con `replace` y `{ subjectUpdated }`.
- `SubjectsPage` añade «Editar» (un `Link` con clases `btn`, `aria-label` «Editar {nombre}») en cada tarjeta si el rol es `ADMIN` y lee `subjectUpdated` con la misma guarda de tipo que `subjectCreated`.

## Risks / Trade-offs

- **[Se pierde la edición de otra persona]** → aceptado por la persona usuaria (gana el último); el estado final nunca es una mezcla (bloqueo de la fila de la asignatura y reemplazo completo).
- **[Interbloqueos]** → orden fijo (asignatura, después cursos `FOR SHARE` por `id`) y tests de concurrencia contra otra edición, el alta, el borrado de un curso y la edición de un calendario.
- **[Dos ediciones que intercambian nombres o códigos a la vez]** (A pasa a llamarse como B y B como A en el mismo instante) → cada `UPDATE` espera por el índice único de la otra fila y PostgreSQL aborta una por interbloqueo, que hoy sería un `500`. Es el mismo caso que ya existe en cursos y calendarios, exige dos administradores cruzando nombres en el mismo milisegundo y la otra edición se guarda; se acepta y no se prueba. Un intercambio en dos `PUT` seguidos da el `409` esperado.
- **[El reemplazo de `subject_courses` refresca `created_at`]** → hoy nada lo usa; si US19 referencia esas filas, habrá que pasar a aplicar diferencias.
- **[`SubjectForm` crece con props de edición]** → props opcionales con el alta como caso por defecto, y tests de los dos modos.
- **Seguridad:** el colegio sale de la identidad; la asignatura y los cursos se filtran por colegio en las consultas de bloqueo; la escritura exige `ADMIN` antes de leer nada; el `404` no distingue una asignatura de otro colegio; los eventos no llevan nombres, códigos ni descripciones.
- **Rendimiento:** una edición toca una asignatura y como mucho 100 filas de `subject_courses`; la lectura por `id` es una consulta con una relación. No afecta a la generación de horarios.

## Migration Plan

Sin migraciones. Despliegue normal (el paso `prisma migrate deploy` no aplicará nada). Vuelta atrás: revertir la PR; no deja datos que limpiar.

## Open Questions

Ninguna.
