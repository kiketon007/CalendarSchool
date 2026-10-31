## Why

Para generar horarios, el motor tiene que saber **quién** imparte cada asignatura en cada clase (HC6 y las variables por clase de US-ALGO). Hoy hay cursos con clases y tutores, asignaturas con su carga por curso (US19) y profesores con su disponibilidad (US-PROF-AVAIL), pero nada los une. La historia es **US-PROF-ASSIGN** de `docs/User_Stories_MVP.md` (épica 6), que desarrolla el PRD (líneas 28, 37, 111 y 180: quién es especialista de qué y qué imparte cada profesor).

La exploración del 2026-10-31 decidió tres cosas:
- **Se asigna por (asignatura, clase):** la tutora de 1º A y el tutor de 1º B dan Lengua en el mismo curso.
- **Las sesiones no se repiten:** salen de `subject_courses.sessions_per_week`.
- **Se edita en una matriz por curso**, con un `PUT` que lleva el estado final.

Los avisos de pérdida en otras pantallas son de **US-PROF-ASSIGN_b**.

## What Changes

- **Modelo:** tabla nueva `professor_assignments`, con un profesor por asignatura y clase. Lleva claves ajenas compuestas a `subject_courses` y a `classes (id, course_id)`, las dos en cascada, y en cascada también desde `professors`. Hace falta un índice único nuevo `(id, course_id)` en `classes`. Una migración.
- **API:**
  - `GET` y `PUT /api/courses/{id}/assignments` para `ADMIN` y `MEMBER`.
  - El `PUT` lleva el estado final de la matriz del curso y gana el último. Responde `400` con `NOT_FOUND` o `DUPLICATE` por posición y `404` si el curso no existe.
  - `Professor.subjects`, hasta ahora siempre `[]`, se llena con lo asignado: `{ subjectId, subjectName, courseId, courseName, classId, className, sessionsPerWeek }`. El cambio es compatible.
  - No hay códigos de error nuevos.
- **Frontend:**
  - la página `/cursos/:id/profesores`, una matriz con las asignaturas del curso en filas y sus clases en columnas, con un `select` por celda en el que va marcado el tutor de cada clase;
  - el botón «Asignar al tutor» por clase;
  - los recuentos de celdas sin profesor y de sesiones por profesor;
  - tarjetas a 360 px;
  - el enlace «Profesores» en `/cursos`;
  - en el listado de profesores, la columna «Asignaturas» y la búsqueda también por asignatura.

**Correcciones a la ficha**, ya aplicadas y validadas el 2026-10-31:
- por clase en lugar de por varios cursos;
- sin campo de sesiones;
- sin «mismatch» ni duplicados;
- sin listado global ni formulario;
- la sobrecarga, a US-PROF-SUMMARY;
- los avisos de pérdida, a US-PROF-ASSIGN_b;
- caracteres corruptos y CA rotos corregidos.

**Fuera de alcance:**
- Repartir las sesiones de una asignatura en una clase entre dos profesores.
- Las especialidades del profesor.
- Editar las asignaturas desde el formulario del profesor.
- La carga total, la sobrecarga y los avisos frente a la disponibilidad (US-PROF-SUMMARY).
- Los avisos de pérdida (US-PROF-ASSIGN_b).
- Los horarios en `NEEDS_REVIEW` (US-ALGO).

## Capabilities

### New Capabilities
- `professor-assignments`: la tabla de asignaciones, el `GET` y el `PUT` por curso con su validación, bloqueos, cascadas y eventos, y la página de la matriz del curso.

### Modified Capabilities
- `school-professors`: `Professor.subjects` deja de estar siempre vacío, el listado gana la columna «Asignaturas» y la búsqueda incluye las asignaturas.
- `school-courses`: el listado de cursos enlaza los profesores de cada curso.

## Impact

- **Backend:**
  - `schema.prisma` y una migración;
  - `domain/assignment/`, con tipos y puerto;
  - `application/assignments/`, con `GetCourseAssignments`, `UpdateCourseAssignments`, su parser y una función pura de diferencias;
  - un repositorio Prisma nuevo y `assignmentsRouter`;
  - `subjects` en `PrismaProfessorRepository`.
- **Frontend:**
  - `courseAssignmentsService`;
  - `professorsService`, que valida `subjects`;
  - `CourseAssignmentsPage`, con su ruta;
  - los enlaces en `CoursesPage`;
  - la columna y la búsqueda en `ProfessorsPage`, con `utils/personSearch.ts`;
  - i18n.
- **Contrato:** `docs/api-spec.yml`, con dos operaciones, `CourseAssignments`, `UpdateCourseAssignmentsRequest` y `ProfessorSubject`.
- **Docs:**
  - `MODELO_DATOS.md`: la tabla nueva sustituye a `professor_subjects` y `professor_assignments` de la v2.1;
  - README, los `CLAUDE.md` y la arquitectura;
  - la especificación del motor: HC6 y las variables por clase.
- **Infraestructura:** ninguna. La migración se aplica en el despliegue habitual.
