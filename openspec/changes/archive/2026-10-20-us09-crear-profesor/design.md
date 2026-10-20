## Context

US05 a US08 dejaron los cursos completos: `courses` y `classes` (con `classes.course_id ON DELETE CASCADE`), `coursesRouter` con `requireAuthentication` para `ADMIN` y `MEMBER`, y un contrato en el que `SchoolClass.tutor` vale siempre `null` («el tutor llega con los profesores»). Las notas de US05 a US08 ya fijaron lo que esta historia debe respetar: `classes.tutor_id` nulo, **único** y `ON DELETE SET NULL`; la columna «Tutores» con los nombres; y que editar o borrar un curso no pierda ni bloquee a los profesores (proposal.md).

Restricciones: el _pooler_ de Supabase en modo transacción (nada de sesión), el colegio siempre de la identidad, contrato primero, y las asignaturas todavía no existen (`US-PROF-ASSIGN`): `subjects` es `[]` hasta entonces. Las tablas nuevas heredan los permisos del rol de aplicación por los `DEFAULT PRIVILEGES` de `app-role.sql`, y `resetDatabase()` y la limpieza de los E2E vacían todas las tablas salvo las conservadas, así que no hay que tocarlas.

## Goals / Non-Goals

**Goals:**

- Crear un profesor del colegio, con su cargo y, opcionalmente, la clase que tutoriza, de forma atómica y sin carreras.
- Un listado mínimo de profesores y el tutor visible en las clases, sin romper la edición ni el borrado de cursos.
- Un contrato que ya lleva `subjects: []` para que `US-PROF-ASSIGN` solo cambie cómo se calcula.

**Non-Goals:**

- Asignaturas, disponibilidad, email, DNI, `status`, editar y borrar profesores, búsqueda y paginación, elegir el tutor desde el curso (US09_b).

## Decisions

### D1. Modelo de datos y migración

`professors`: `id` (UUIDv7), `school_id` (FK `schools`, con `@@index`), `first_name` y `last_name` (`varchar(100)`), `position` (enum `ProfessorPosition { DIRECTOR JEFE_ESTUDIOS }`, nulo), `created_at` y `updated_at`. `classes.tutor_id`: `uuid` nulo, FK `professors(id) ON DELETE SET NULL` y `@unique`, es decir, `classes_tutor_id_key`. En Prisma: `SchoolClass.tutor Professor? @relation(fields: [tutorId], references: [id], onDelete: SetNull)` y `Professor.tutoredClass SchoolClass?`. Alternativa descartada: `professors.class_id` (la ficha original), porque deja al profesor como dueño de la relación: una clase solo puede tener un tutor y con `tutor_id` en `classes` el índice único garantiza las dos cosas («un profesor, una clase» y «una clase, un tutor»); el borrado de un curso (`ON DELETE CASCADE`) arrastra la columna con la fila de la clase y no deja referencias colgantes. Tampoco se añade `status` ni `deletedAt` (nadie los usa).

### D2. Dominio

`domain/professor/professor.ts` (`Professor`, `ProfessorPosition`, `TutoredClass`), `professorRepository.ts` (puerto) y `professorErrors.ts` (`ClassNotFound`, `ClassAlreadyHasTutor`). En `domain/course/course.ts`, `SchoolClass.tutor` pasa de `null` a `Tutor | null` con `Tutor { id, firstName, lastName }`. El puerto: `create(schoolId, professor: NewProfessor, classId?: string): Promise<Professor>` (lanza `ClassNotFound` o `ClassAlreadyHasTutor`) y `listBySchool(schoolId): Promise<Professor[]>` (sin ordenar: lo ordena la aplicación).

### D3. Alta con clase: un `UPDATE` condicionado en la transacción del alta

`PrismaProfessorRepository.create` abre un `$transaction`: crea el profesor y, si hay `classId`, ejecuta `schoolClass.updateMany({ where: { id: classId, tutorId: null, course: { schoolId } }, data: { tutorId: professor.id } })`. Un `count` de 1 es el éxito. Con `count` de 0 se distingue por una lectura (la clase existe en el colegio → ya tiene tutor, `ClassAlreadyHasTutor`; no existe o es de otro colegio → `ClassNotFound`) y se lanza dentro de la transacción, que deshace el alta del profesor. El `UPDATE` condicionado es atómico por sí mismo: dos altas simultáneas con la misma clase hacen que una vea `tutor_id IS NULL` y la otra no, así que no hacen falta bloqueos (distinto de la edición del curso, que reescribe varias filas). El índice único queda como red de seguridad. `ClassNotFound` no revela si la clase existe en otro colegio.

### D4. Validación y errores

`createProfessorRequest.ts` valida `body: unknown` con Zod y devuelve un `{ field, code }` por campo. `firstName` y `lastName` reutilizan `USER_FIELD_SCHEMAS` del registro (las mismas reglas, ya cubiertas por su tabla compartida); `position` es un enum opcional (`INVALID_FORMAT` si no lo es, y `null` o ausente es «sin cargo») y `classId` un UUID opcional. `CreateProfessor` convierte `ClassNotFound` en `ValidationError([{ field: 'classId', code: 'NOT_FOUND' }])` (un campo que apunta a algo que no existe), y `ClassAlreadyHasTutor` se propaga a `errorHandler`, que responde `409 CLASS_ALREADY_HAS_TUTOR`. `NOT_FOUND` entra en `FieldErrorCode` (contrato y `validationError.ts`) y `DUPLICATE` se documenta en el contrato junto a él. Una tabla nueva `test-fixtures/professor-fields.json` (leída por `backend/test/support/professorFixtures.ts` y `frontend/src/testSupport/professorFixtures.ts`) cubre los cuatro campos.

### D5. Lecturas de cursos con tutor

`prismaCourseRepository` añade `tutor: { select: { id, firstName, lastName } }` a `LIST_FIELDS` (las clases) y `EDIT_FIELDS` los hereda; `toCourse` lo mapea. `create` devuelve `tutor: null` (las clases nacen sin tutor) y `update` lee el estado final con el mismo `select`, de modo que el `PUT` devuelve los tutores sin tocarlos: la actualización de clases solo escribe `name` y `normalized_name` y no menciona `tutor_id`. `planCourseUpdate` y los tipos `CurrentClass`/`RequestedClass` no cambian. El orden de las clases sigue siendo el de la aplicación.

### D6. Listado de profesores

`ListProfessors` ordena por apellido y después por nombre con el mismo `Intl.Collator('es', { numeric: true, sensitivity: 'base' })` de los cursos (`byName` se generaliza a una comparación por varias claves en un módulo de `application/professors/`). El repositorio hace una consulta con la clase y su curso (`tutoredClass: { select: { id, name, course: { select: { id, name } } } }`) y la aplana a `tutoredClass: { id, name, courseId, courseName }`. `subjects` es `[]`, devuelto por el mapeo con un comentario que apunta a `US-PROF-ASSIGN`.

### D7. Contrato

`CreateProfessorRequest`, `Professor`, `TutoredClass`, `TutorSummary`, `ProfessorResponse` y `ProfessorListResponse`. `SchoolClass.tutor` pasa a `anyOf: [{ type: 'null' }, { $ref: TutorSummary }]` (OpenAPI 3.1). `POST /api/professors` declara `201`, `400`, `401`, `409`, `500` y `503`. Códigos nuevos: `CLASS_ALREADY_HAS_TUTOR` en `ErrorCode` (y `ERROR_CODES` a la vez, comprobado por `appError.test.ts`) y `NOT_FOUND` en `FieldErrorCode`. `subjects` es un array de objetos sin propiedades definidas todavía (se concretarán en `US-PROF-ASSIGN`).

### D8. Frontend

- **Servicios:** `professorsService` (`list`, `create`: `loaded | created | validationError | classHasTutor | unauthenticated | unavailable`, nunca lanzan) y `coursesService` valida `tutor === null || { id, firstName, lastName }` en lugar de exigir `null`.
- **Validación:** `professorValidation.ts` reutiliza `validateField` del registro para el nombre y el apellido y añade cargo y clase; recorre `professor-fields.json`.
- **`CreateProfessorPage`:** su propio formulario (`Form`, no `CourseForm`: no hay filas). Pide `coursesService.list` para las clases libres (`tutor === null`), agrupadas por curso con `optgroup`, con la misma guarda síncrona, foco y errores por campo. Si la carga de cursos falla, el campo de la clase se desactiva con un aviso y el formulario sigue sirviendo sin clase.
- **`ProfessorsPage`:** la misma técnica de `/cursos`: `useMediaQuery`, tabla o tarjetas, carga única con `StrictMode`, «Reintentar», vacío y aviso de llegada (`professorCreated` en el estado de la navegación).
- **Cursos:** `CoursesPage` prepara la etiqueta «Tutores» (`A: Ana García, B: Luis Pérez` o «Sin tutor»); `EditCoursePage` pasa a `CourseForm` el nombre del tutor de cada clase en `initialValues` aparte (`tutorName`), no en el `CourseDraft`: se pinta como texto en la fila, no entra en `hasCourseChanges` ni en el cuerpo del `PUT`.
- **Navegación:** «Profesores» en `AppHeader` y las dos rutas en `App.tsx`.

### D9. Observabilidad y orden de limpieza

`PROFESSOR_CREATED` (`school_id`, `actor_id`, `professor_id`, `has_class`, `position`) y `PROFESSOR_CREATION_REJECTED` (`reason: class_has_tutor | class_not_found`), nunca nombres. En las guías de limpieza de datos de producción, `professors` se borra antes que `schools` (la FK), y las clases siguen cayendo con su curso.

## Risks / Trade-offs

- [El cambio de `SchoolClass.tutor` en el contrato rompe el servicio de cursos y sus tests] → Se cambian a la vez, empezando por el contrato y los tipos generados; el servicio sigue validando la forma.
- [La asignación de clase a dos profesores a la vez] → El `UPDATE` condicionado decide; solo uno gana; el índice único es la red de seguridad.
- [`subjects: []` constante] → Documentado en el contrato y en la ficha de `US-PROF-ASSIGN`; los tests lo fijan.
- [La migración añade una columna con índice único a una tabla con datos de producción] → Sin datos previos en `tutor_id` (todos nulos); `UNIQUE` permite varios nulos en PostgreSQL. Se comprueba en el log de despliegue, como en US05.
- [Los tests que fijan `tutor: null`] → Se actualizan; siguen siendo ciertos para las clases sin tutor.

## Migration Plan

La migración (`professors` y `classes.tutor_id`) la aplica `prisma migrate deploy` en el despliegue, antes de publicar el backend, como la de US05. Vuelta atrás: revertir la PR y borrar a mano la tabla y la columna si ya se aplicó (los datos creados son solo profesores).

## Open Questions

Ninguna: el alcance, la división en US09 y US09_b, `subjects: []`, la clase en la ficha del profesor y el listado mínimo están validados (ficha de US09).
