## Why

Las sesiones semanales de cada asignatura en cada curso (`subject_courses.sessions_per_week`) solo se ven y se cambian asignatura a asignatura, así que nadie puede comprobar si la carga de un curso cabe en las sesiones de su calendario antes de generar el horario, que es la primera causa de un horario imposible. US19 (`docs/User_Stories_MVP.md`, «Carga horaria por curso», enriquecida tras la exploración del 2026-10-29) da la vista por curso con su balance. Lo justifica el PRD (§3.5: las cargas horarias por asignatura según cursos parametrizan la generación; el administrador las configura y el miembro las ve) y es la base de las reglas de reparto de US19_b–US19_d y de HC1 del motor (US-ALGO-RUN).

## What Changes

- `GET /api/courses/{id}/workload` (`ADMIN` y `MEMBER`): el curso, su calendario (`{ id, name, sessionsPerDay }` o `null`), todas las asignaturas del colegio por nombre con `sessionsPerWeek` (o `null` si no se imparten en el curso), `assignedSessions`, `availableSessions` (sesiones al día × 5, o `null`) y `warnings` con los códigos `COURSE_WITHOUT_CALENDAR` y `WORKLOAD_EXCEEDS_SLOTS`, calculados al leer. `404 NOT_FOUND` (`CourseNotFound`) sin distinguir el caso.
- `PATCH /api/courses/{id}/workload` (solo `ADMIN`, `403` antes de leer el `id` y el cuerpo): `{ changes: [{ subjectId, sessionsPerWeek: 1..5 | null }] }` con **solo las filas que cambian**; crea, actualiza o borra filas de `subject_courses` sin tocar las demás (conservan su `created_at`). Responde `200` con la carga releída. Nunca rechaza porque no quepa: solo avisa.
- Bloqueos en el mismo orden que la edición de una asignatura: las asignaturas de `changes` `FOR UPDATE` en orden de `id` y después el curso `FOR SHARE`; el calendario no se bloquea.
- Eventos `COURSE_WORKLOAD_UPDATED` (`school_id`, `actor_id`, `course_id`, `subjects_added`, `subjects_removed`, `subjects_changed`) y `COURSE_WORKLOAD_UPDATE_REJECTED` (`reason: not_found | subject_not_found`), sin nombres ni códigos.
- Frontend: enlace «Carga horaria» en cada tarjeta de `/cursos` (los dos roles) y página `/cursos/:id/carga` con el balance («{asignadas} de {disponibles} sesiones a la semana», barra decorativa y avisos) y, para el `ADMIN`, la matriz Asignatura | Sesiones con «Guardar» solo con cambios; el `MEMBER` ve el balance y las asignaturas que se imparten, sin editar.
- Una función pura del dominio (`workloadWarnings`) calcula los avisos, para que US19_b–US20 la amplíen.
- Sin migraciones ni códigos de error nuevos; un enum nuevo en el contrato (`WorkloadWarningCode`).

**Fuera de alcance:** las reglas de reparto (máximo por día y bloques en US19_b, franjas prohibidas en US19_c y preferidas en US19_d), el listado de reglas (US20), cargas por clase, copiar la carga de otro curso, asignar el calendario desde esta página y la disponibilidad de los profesores (US-PROF-AVAIL).

## Capabilities

### New Capabilities

- `course-workload`: la carga horaria de un curso (lectura con balance y avisos, escritura por diferencias sobre `subject_courses` solo para `ADMIN`), su página, su contrato, sus eventos de log y sus E2E.

### Modified Capabilities

- `school-courses`: la página de listado de cursos gana el enlace «Carga horaria» en cada tarjeta, para los dos roles.

## Impact

- **Contrato (`docs/api-spec.yml`):** `getCourseWorkload`, `updateCourseWorkload`, `CourseWorkload`, `CourseWorkloadSubject`, `UpdateCourseWorkloadRequest`, `WorkloadWarning` y `WorkloadWarningCode`; tipos regenerados del frontend.
- **Backend:** `domain/workload` (modelo, puerto y `workloadWarnings`), `application/workload` (`GetCourseWorkload`, `UpdateCourseWorkload` y el parser), `infrastructure/prisma/prismaCourseWorkloadRepository.ts`, `presentation/workload/workloadRouter.ts`, `app.ts`, `composeApp.ts` y dobles de test.
- **Frontend:** `courseWorkloadService`, `CourseWorkloadPage`, `WorkloadBalance`, `CoursesPage` (enlace), `App.tsx` (ruta), i18n y un E2E nuevo.
- **Modelo de datos:** sin cambios de esquema; `subject_courses` pasa a tener dos caminos de escritura (documentado en `MODELO_DATOS.md`). **Infraestructura:** sin cambios.
