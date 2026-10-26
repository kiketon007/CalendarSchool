## Context

- **Calendarios como referencia:** US-BASE (`school-calendars`) es el patrón más reciente de un recurso con lectura para los dos roles y escritura solo para `ADMIN`: `calendarsRouter` con `requireRole('ADMIN', logger)` solo en las rutas de escritura, un parser Zod que recorre una tabla compartida (`test-fixtures/calendar-fields.json`), `cleanName`/`normalizeName` (`domain/course/courseNames.ts`), cursos bloqueados en orden de `id` antes de escribir y la traducción del índice único a un error de dominio por su nombre (`violatedUniqueIndex`). Los parsers **ignoran** las propiedades desconocidas (`schoolId`, `id`): el colegio sale de la identidad.
- **Cursos y bloqueos actuales:** la edición y el borrado de un curso lo bloquean `FOR UPDATE` (US07, US08); el alta y la edición de un calendario bloquean sus cursos `FOR UPDATE` en orden de `id` (US-BASE, US-BASE_b); el alta y la edición de un alumno bloquean su curso `FOR SHARE` (US14, US17). `PrismaCourseRepository` lee con `select` explícitos, así que una relación nueva no cambia las respuestas de cursos.
- **Búsqueda en el cliente:** `utils/courseSearch.ts` (`normalizeForSearch`, `matchesCourseSearch`) es la comparación de US06 (sin mayúsculas ni acentos).
- **Modelo antiguo** (`MODELO_DATOS.md` v2.1): `subjects` con `code` único global, `deletedAt`, `createdBy`/`updatedBy` e ids enteros, y dos tablas `subject_courses` y `subject_standard_loads` con la misma clave `(subjectId, courseId)`. No refleja las convenciones del proyecto.
- **Decisiones de producto** (ficha de US-SUBJECT, 2026-10-26): ficha partida en tres; lo de restricciones pasa a US19; cursos del colegio; una sola tabla con las sesiones; código opcional; color de paleta cerrada; escribe solo `ADMIN`; una asignatura puede quedarse sin cursos al borrar un curso; 2 sesiones por defecto.

## Goals / Non-Goals

**Goals:**

- Que el colegio tenga sus asignaturas con los cursos en que se imparten y la carga de cada uno, listas para US19, US-PROF-ASSIGN y la vista del horario (nombre, código y color).
- Escritura solo para `ADMIN` y lectura para los dos roles, con el aislamiento por colegio de siempre.
- Las mismas reglas de validación en backend y frontend, con una tabla de casos compartida.
- Ningún cambio en la API ni en las pantallas de cursos.

**Non-Goals:**

- Editar, inactivar o borrar (US-SUBJECT_b, US-SUBJECT_c); restricciones, prerrelleno y «Usos» (US19); profesores por asignatura (US-PROF-ASSIGN); el efecto de `INACTIVE`; colores libres; paginación o búsqueda en el servidor.

## Decisions

### 1. Modelo: una tabla de unión con la carga y clave primaria compuesta

`subjects` guarda los datos de la asignatura; `subject_courses (subject_id, course_id, sessions_per_week)` guarda a la vez que la asignatura se imparte en el curso y cuántas sesiones lleva. La clave primaria es `(subject_id, course_id)`: la fila solo tiene sentido como pareja, nadie la referencia por id y US-SUBJECT_b la reemplaza entera. Las dos claves ajenas son `ON DELETE CASCADE`: borrar un curso quita sus filas (la asignatura puede quedarse sin cursos, decisión de producto) y borrar una asignatura (US-SUBJECT_c) quita las suyas, sin código. El rango 1–5 va en un `CHECK` escrito a mano (`subject_courses_sessions_per_week_check`, con `--create-only`) y probado con su nombre, como los de `students`.

*Alternativas descartadas:* las dos tablas del modelo antiguo (un curso marcado sin carga, o una carga sin curso, serían estados posibles); un `id` propio en `subject_courses` (una columna y un índice más sin uso); `ON DELETE RESTRICT` desde `courses` (impediría borrar un curso con asignaturas, en contra de la decisión de producto y del borrado de cursos de US08, que no debe cambiar).

### 2. Código: columnas `code` y `normalized_code` con un índice único normal

El código se guarda tal como se escribe (`code`) y en minúsculas (`normalized_code`, con `normalizeCode` de `domain/subject/`), con `@@unique([schoolId, normalizedCode])`. PostgreSQL trata los `NULL` como distintos en un índice único (comportamiento por defecto, `NULLS DISTINCT`), así que las asignaturas sin código no chocan y Prisma expresa el índice sin SQL a mano. Vacío o solo espacios se convierte en `null` en el parser, nunca en `''`, para que no haya dos asignaturas con código vacío en conflicto.

*Alternativa descartada:* un índice único parcial `WHERE normalized_code IS NOT NULL` (el mismo efecto con SQL escrito a mano que una migración posterior podría borrar).

### 3. Tipo, estado y color como enums de PostgreSQL

`SubjectType`, `SubjectStatus` y `SubjectColor` son enums de Prisma: la base de datos rechaza un valor que no existe y los tipos de TypeScript salen del cliente generado. El color se guarda como **clave** (`blue`…), no como hexadecimal: el aspecto (fondo y texto) vive en el frontend y puede retocarse sin migrar datos. Ampliar la paleta exige una migración (`ALTER TYPE … ADD VALUE`), aceptable para una lista cerrada que cambia poco.

*Alternativas descartadas:* `VARCHAR` con la lista validada solo en la aplicación (un valor desconocido podría colarse por otra vía); guardar el hexadecimal (el contraste dejaría de estar garantizado por la paleta y un retoque obligaría a reescribir filas).

### 4. Contrato y códigos

`CreateSubjectRequest { name, code?, type, status, description?, color, courses: [{ courseId, sessionsPerWeek }] }` (sin propiedades adicionales en el contrato, como el resto de cuerpos), `201 { subject }` y `GET 200 { subjects }`. `Subject { id, name, code, type, status, description, color, courses: [{ id, name, sessionsPerWeek }], createdAt }`, con `code` y `description` siempre presentes (texto o `null`). Dos `409` distintos (`SUBJECT_ALREADY_EXISTS`, `SUBJECT_CODE_ALREADY_EXISTS`) porque el formulario marca un campo distinto en cada caso. Se añade el código de campo genérico `OUT_OF_RANGE` (un número fuera de su intervalo): `INVALID_RANGE` ya significa «el fin no es posterior al inicio» y `INVALID_LENGTH` habla de longitudes; el mensaje «Entre 1 y 5 sesiones» es distinto. Un tipo, un estado o un color que no existe es `INVALID_FORMAT`.

### 5. Validación: parser Zod con tabla compartida

`parseCreateSubjectRequest` (`application/subjects/createSubjectRequest.ts`) devuelve un `{ field, code }` por campo inválido en el orden `name`, `code`, `type`, `status`, `description`, `color`, `courses` y cada `courses[<i>]` (`courseId`, `sessionsPerWeek`). El nombre reutiliza las reglas y la limpieza del nombre de un curso; el código admite letras (también acentuadas y ñ), dígitos, `-` y `/`. El frontend tiene su espejo en `validation/subjectValidation.ts` y los dos recorren `test-fixtures/subject-fields.json`. Las claves de la paleta salen del contrato generado en el frontend y del enum de Prisma en el backend; un test de cada lado comprueba que coinciden con la tabla compartida.

### 6. Transacción y bloqueos en `PrismaSubjectRepository.create`

En un `$transaction`: (1) `SELECT id FROM courses WHERE id = ANY($ids) AND school_id = $school ORDER BY id FOR SHARE` (`$queryRaw`); si falta alguno, se lanza `CourseNotFound` con sus posiciones y no se escribe nada; (2) `INSERT` de la asignatura (la violación de `subjects_school_id_normalized_name_key` se traduce a `SubjectAlreadyExists` y la de `subjects_school_id_normalized_code_key` a `SubjectCodeAlreadyExists`); (3) `createMany` de `subject_courses`. Devuelve la asignatura leída al final de la transacción, con sus cursos.

- **`FOR SHARE` y no `FOR UPDATE`:** el alta no modifica los cursos, solo necesita que no desaparezcan ni cambien mientras escribe. `FOR SHARE` deja que varias altas de asignaturas con los mismos cursos (y altas de alumnos) avancen a la vez, y espera a quien los tenga `FOR UPDATE` (borrado o edición de un curso, alta o edición de un calendario).
- **Sin ciclos de bloqueo:** el alta solo bloquea cursos, siempre en orden de `id`, el mismo orden que los calendarios; el borrado de un curso toma solo ese curso y después borra en cascada filas que el alta aún no ha escrito o que ya están confirmadas. Gana quien bloquee primero; un curso borrado antes da `NOT_FOUND`.
- Los cursos se comprueban **antes** de insertar: un cuerpo con un curso inexistente y un nombre repetido responde `400`, como el alta de un calendario.

### 7. Rutas y roles

`subjectsRouter` monta `requireAuthentication` en todas sus rutas y `requireRole('ADMIN', logger)` solo en `POST /`, antes del handler: un `MEMBER` recibe `403` sin que se valide el cuerpo. `GET /` no lleva `requireRole`. Se monta en `api` en `app.ts` antes de `notFoundHandler`. Los casos de uso (`CreateSubject`, `ListSubjects`) reciben el colegio y el autor de la identidad y emiten los eventos.

### 8. Lectura y orden

`listBySchool` lee las asignaturas con sus `subject_courses` y el curso (`{ id, name }`); `ListSubjects` ordena las asignaturas por nombre y los cursos de cada una por nombre con `compareText`. Sin paginación: un colegio tiene pocas decenas de asignaturas.

### 9. Frontend

- `utils/subjectColors.ts` (puro): la paleta en orden (`blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray`), con el fondo y el color de texto de cada clave; `defaultSubjectColor(usedColors)` y `contrastRatio(foreground, background)` (luminancia relativa de WCAG), con un test que exige 4,5:1 en las 12. `SubjectColorSwatch` pinta la muestra con su nombre accesible.
- `utils/subjectFilters.ts` (puro): `matchesSubjectFilters(subject, { type, status, query })`, que reutiliza `normalizeForSearch` para el nombre y el código. Los filtros viven en el estado de la página, no en la URL: no hay página de detalle a la que volver (cuando llegue la edición, US-SUBJECT_b decidirá si conservarlos, como en alumnos).
- `SubjectForm` (reutilizable en US-SUBJECT_b con `initialValues` y `onSubmit`): el color como grupo de radios con muestra y nombre; los cursos como casillas y, en cada curso marcado, un `select` de 1 a 5 (2 al marcarlo; un `select` impide escribir valores fuera de rango, aunque la validación sigue cubriéndolos para el servidor). Sin cursos, «Primero crea los cursos» y «Guardar» deshabilitado.
- `CreateSubjectPage` (bajo `RequireRole role="ADMIN"`) pide los cursos (`coursesService.list`) y las asignaturas (`subjectsService.list`, para el color propuesto) una vez cada uno; si falla alguna, un aviso con «Reintentar». Con el `201` navega a `/asignaturas` con `{ subjectCreated }`.
- `SubjectsPage`: carga única, filtros y búsqueda, una lista de asignaturas (cada una con su nombre como `h2`, para navegar por encabezados) que a 360 px apila sus datos; el resumen de cursos es un botón con `aria-expanded` y `aria-controls`. «Crear asignatura» solo para `ADMIN` (leído de la sesión: decide el backend).
- `AppHeader` gana «Asignaturas» entre «Calendario» y «Usuarios».

### 10. Documentación del modelo

`MODELO_DATOS.md` sustituye las secciones `subjects` y `subject_courses` del modelo antiguo por las reales y elimina `subject_standard_loads`; `professor_subjects` queda para US-PROF-ASSIGN. La arquitectura pasa «Asignaturas» a implementado (sección 0 de `ARQUITECTURA_COMPLETA.md`, parte A de `DIAGRAMA_C4.md` y el DSL).

## Risks / Trade-offs

- **[Una migración posterior borra el `CHECK`]** → test de esquema que exige el nombre de la restricción y revisión del SQL de cada `migrate dev`.
- **[Interbloqueos con cursos y calendarios]** → el alta solo bloquea cursos, `FOR SHARE` y en orden de `id`; tests de concurrencia (alta contra borrado de un curso y contra la edición de un calendario que se lleva ese curso).
- **[Asignaturas sin cursos]** → intencionado; el listado las marca con «Sin cursos» y US-SUBJECT_b exige marcar uno para guardar.
- **[La paleta es un enum]** → añadir un color exige migración; aceptable para una lista cerrada.
- **[Contraste]** → los colores de texto están fijados por clave y un test los comprueba; el color nunca va solo, siempre con su nombre.
- **Seguridad:** el colegio sale de la identidad; los cursos se comprueban dentro del colegio; la escritura exige `ADMIN` en el backend aunque el frontend oculte el botón; los eventos no llevan nombres, códigos ni descripciones.
- **Rendimiento:** pocas filas por colegio; el listado es una consulta con una relación anidada. No afecta al motor de generación (aún no existe).

## Migration Plan

La migración `add_subjects` (tres enums, dos tablas y el `CHECK`) se aplica en el despliegue con `prisma migrate deploy`, antes de publicar el backend. Es aditiva y no toca tablas existentes: el backend anterior sigue funcionando con ella. Rollback: desplegar el commit anterior; las tablas se quedan sin usarse (no se deshacen migraciones en producción).

## Open Questions

Ninguna: las decisiones de producto están validadas en la ficha de US-SUBJECT.
