## Why

Desde US-PROF-ASSIGN, las asignaciones de profesores caen en cascada **sin aviso** al marcar una asignatura «No se imparte» en la carga, al desmarcar un curso en una asignatura, al borrar una asignatura o un curso, al quitar una clase y al borrar un profesor. Un usuario puede dejar un curso sin profesores sin darse cuenta. La historia es **US-PROF-ASSIGN_b** de `docs/User_Stories_MVP.md` (épica 6), complemento de US-PROF-ASSIGN, que desarrolla el PRD (qué imparte cada profesor), y sigue el patrón de US19_b, que ya avisa de las reglas de reparto que se pierden.

La exploración del 2026-10-31 decidió:
- **un solo nombre**, «asignaciones de profesores», en todas las pantallas;
- **una sola frase** con las reglas donde ya se avisa de ellas, con piezas pluralizadas unidas con `Intl.ListFormat`;
- **borrar un profesor** enumera sus asignaciones agrupadas por asignatura;
- **quitar una clase** pide confirmación también si solo tiene asignaciones;
- el recuento va en el impacto y en la respuesta del borrado del curso, y en los eventos de los tres borrados.

## What Changes

- **API** (compatible, solo respuestas): un campo nuevo y requerido `assignmentCount` (entero ≥ 0) en:
  - `CourseWorkloadSubject` (`GET` y `PATCH /api/courses/{id}/workload`);
  - `SubjectCourse` (listado, lectura, alta y edición de asignaturas);
  - `SchoolClass` (listado, lectura, alta y edición de cursos);
  - `CourseImpact` (`GET /api/courses/{id}/impact` y el `deleted` de `DELETE /api/courses/{id}`).
  - La respuesta del `DELETE /api/professors/{id}` y la del `DELETE /api/subjects/{id}` **no** cambian. Sin códigos de error ni endpoints nuevos.
- **Log:** `COURSE_DELETED`, `SUBJECT_DELETED` y `PROFESSOR_DELETED` ganan `assignment_count`, contado dentro de la transacción del borrado, sin nombres.
- **Frontend:**
  - carga del curso: el aviso al pasar a «No se imparte» dice reglas y asignaciones en una frase;
  - edición de una asignatura: lo mismo al desmarcar un curso;
  - diálogos de borrar asignatura y curso: un párrafo con las asignaciones;
  - quitar una clase: el diálogo se abre con alumnos, con asignaciones o con los dos, con un párrafo por cada uno;
  - diálogo de borrar profesor: sus asignaciones, agrupadas por asignatura;
  - sin asignaciones, ningún texto nuevo.
- **Sin migraciones:** los recuentos son `_count` de Prisma sobre las relaciones que ya existen.

**Fuera de alcance:**
- Impedir el cambio o pedir una confirmación extra.
- Mostrar el recuento en el listado de asignaturas o de cursos (US-PROF-SUMMARY).
- Añadir recuentos a la respuesta del `DELETE` de la asignatura o del profesor.
- Avisar de horarios generados (US-ALGO).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities
- `course-workload`: `CourseWorkloadSubject.assignmentCount` y el aviso de pérdida al pasar a «No se imparte» con reglas y asignaciones.
- `school-subjects`: `SubjectCourse.assignmentCount`, el aviso al desmarcar un curso, el párrafo del diálogo de borrado y `assignment_count` en `SUBJECT_DELETED`.
- `school-courses`: `SchoolClass.assignmentCount`, `CourseImpact.assignmentCount`, el diálogo de borrar un curso, el diálogo de quitar una clase (también sin alumnos) y `assignment_count` en `COURSE_DELETED`.
- `school-professors`: el diálogo de borrar un profesor enumera sus asignaciones, `assignment_count` en `PROFESSOR_DELETED` y la respuesta del `DELETE` sin cambios.
- `professor-assignments`: el recorrido de extremo a extremo de los avisos.

## Impact

- **Backend:**
  - dominio: `assignmentCount` en los tipos de la carga, de la asignatura en un curso, de la clase y del impacto; los puertos de borrado de asignatura y profesor devuelven el recuento;
  - repositorios Prisma de carga, asignaturas, cursos y profesores;
  - casos de uso de borrado (eventos) y `professorsRouter` (el `DELETE` envía solo `freedClass`).
- **Frontend:**
  - `courseWorkloadService`, `subjectsService` y `coursesService` validan el campo;
  - una utilidad del texto de lo que se pierde con `Intl.ListFormat`;
  - `CourseWorkloadPage` y `courseWorkloadDraft`, `SubjectForm` y `EditSubjectPage`, `DeleteSubjectModal`, `DeleteCourseModal`, `CourseForm` y `ConfirmRemoveClassModal`, `DeleteProfessorModal`;
  - `subjectsTextOf` sale de `ProfessorsPage` a `utils/`;
  - i18n y los E2E.
- **Contrato:** `docs/api-spec.yml`, cuatro esquemas y sus ejemplos; regenerar `schema.ts`.
- **Modelo de datos:** sin cambios.
- **Docs:** `backend/CLAUDE.md` y `frontend/CLAUDE.md`.
- **Infraestructura:** ninguna.
