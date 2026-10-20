## Why

Con US05, US06 y US07 un colegio crea, lista y edita sus cursos, pero un curso que sobra (creado por error o que ya no se imparte) solo se quita hoy borrándolo a mano en la base de datos. US08 (`docs/User_Stories_MVP.md`, ficha enriquecida) cubre el borrado que pide el PRD §3.4 («gestión de cursos»): un borrado real, con un diálogo que informa antes de lo que se pierde (las clases del curso y, cuando existan, cuántos alumnos tiene asignados).

## What Changes

- **Contrato:** `GET /api/courses/{id}/impact` (`{ impact: { classCount, studentCount } }`, el impacto de borrar) y `DELETE /api/courses/{id}` (`{ deleted: { classCount, studentCount } }`, lo que se borró de verdad), los dos con Bearer y para `ADMIN` y `MEMBER`. `studentCount` es siempre `0` hasta que existan los alumnos (US14). Sin códigos de error nuevos: lo ajeno o inexistente es `404 NOT_FOUND`.
- **Backend:** casos de uso `GetCourseDeletionImpact` y `DeleteCourse` (evento `COURSE_DELETED` sin nombres) y, en el repositorio, el recuento y el borrado en una transacción con la fila del curso bloqueada (`FOR UPDATE`), para que no se cruce con una edición. Las clases se borran por la cascada que ya existe (`ON DELETE CASCADE`): sin migración.
- **Frontend:** botón «Borrar {curso}» junto a «Editar» en la tabla y en las tarjetas de `/cursos`, y un diálogo de confirmación (`DeleteCourseModal`) que pide el impacto, muestra cuántas clases se borran y, si los hay, cuántos alumnos tiene asignados, y confirma con una guarda contra la doble pulsación. Tras borrar, el curso sale del listado con el aviso «Curso «X» eliminado».

**Fuera de alcance:** papelera o restauración (soft-delete); horarios y tutores en el impacto (US09 y las historias de horarios); segunda confirmación por número de alumnos o por ser el último curso; límite de borrados por minuto; borrado en lote.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-courses`: el contrato añade `getCourseDeletionImpact` y `deleteCourse`; requisitos nuevos de impacto del borrado, de borrado del curso con sus clases y del diálogo de confirmación; se modifican el acceso, los eventos de log (`COURSE_DELETED`), el listado (el botón «Borrar» deja de ser una acción futura y el aviso de borrado), la accesibilidad y el E2E.

## Impact

- **Contrato:** `docs/api-spec.yml` (dos operaciones y los esquemas `CourseImpact`, `CourseImpactResponse` y `CourseDeletedResponse`) y `frontend/src/api/generated/schema.ts`.
- **Backend:** `domain/course/courseRepository.ts` (y el tipo del impacto), `application/courses/` (`getCourseDeletionImpact.ts`, `deleteCourse.ts`), `infrastructure/prisma/prismaCourseRepository.ts`, `presentation/courses/coursesRouter.ts`, `app.ts`, `composeApp.ts`, `test/support/appDoubles.ts` y sus tests (unitarios e integración). Sin migración.
- **Frontend:** `services/coursesService.ts`, `components/DeleteCourseModal.tsx` (nuevo), `pages/CoursesPage.tsx`, `i18n/es.json` y `en.json`; E2E `cypress/e2e/courses.cy.ts`.
- **Infraestructura y dependencias:** sin cambios.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md` raíz, `README.md`, `docs/backend-standards.md` y `docs/frontend-standards.md`, `MODELO_DATOS.md`, la arquitectura y las notas de US09 y US14. La ficha de US08 ya está actualizada en este cambio.
