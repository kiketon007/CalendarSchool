## Why

El colegio ya tiene cursos y clases (US05 a US08), pero no hay forma de registrar a los profesores ni de decir quién tutoriza cada clase: el listado de cursos muestra «Sin tutor» en todas. US09 (`docs/User_Stories_MVP.md`, ficha enriquecida) abre la épica de profesores (PRD §3.2): crear un profesor con su nombre, su apellido, su cargo y, si es tutor, la clase que tutoriza; ver los profesores del colegio; y ver el profesor de cada clase.

## What Changes

- **Contrato:** `POST /api/professors` (`{ firstName, lastName, position?, classId? }`), `GET /api/professors` (el listado), el esquema `Professor` (con `subjects: []`, siempre vacío hasta `US-PROF-ASSIGN`) y `SchoolClass.tutor`, que pasa de `null` a `{ id, firstName, lastName } | null` en todas las respuestas de cursos. Códigos nuevos: `CLASS_ALREADY_HAS_TUTOR` (`409`) y el código de campo `NOT_FOUND`.
- **Datos:** migración nueva con la tabla `professors` y la columna `classes.tutor_id` (nula, **única**, `ON DELETE SET NULL`): un profesor tutoriza como mucho una clase, y borrar un curso o un profesor nunca borra al otro.
- **Backend:** `CreateProfessor` y `ListProfessors`, un repositorio que crea el profesor y le asigna la clase en una transacción con un `UPDATE` condicionado (sin bloqueos), el `tutor` en las lecturas de cursos y el router `professorsRouter` para `ADMIN` y `MEMBER`. Eventos `PROFESSOR_CREATED` y `PROFESSOR_CREATION_REJECTED` sin nombres.
- **Frontend:** `/profesores` (listado mínimo, tabla desde 768 px y tarjetas por debajo), `/profesores/nuevo` (nombre, apellido, cargo y clase) y el enlace «Profesores» en la cabecera. La columna «Tutores» de `/cursos` muestra los nombres y la edición del curso muestra el tutor de cada clase como texto. Editar un curso conserva los tutores.

**Fuera de alcance:** asignaturas (`US-PROF-ASSIGN`), disponibilidad, email y DNI, editar y borrar profesores (US12 y US13), búsqueda y paginación (US10 y US11), elegir el tutor desde la edición del curso (US09_b) y `status` o `deletedAt`.

## Capabilities

### New Capabilities

- `school-professors`: los profesores de un colegio: el contrato de `POST` y `GET /api/professors`, la creación con su clase, las reglas de los campos, el listado ordenado, el acceso de `ADMIN` y `MEMBER`, los eventos de log, las páginas `/profesores` y `/profesores/nuevo`, el enlace «Profesores» de la navegación, la accesibilidad, el diseño adaptable, los textos en i18n y su E2E.

### Modified Capabilities

- `school-courses`: `SchoolClass.tutor` deja de ser siempre `null` en el contrato y en las lecturas de cursos; la columna «Tutores» y la edición muestran el tutor; editar un curso conserva los tutores y borrarlo deja libres a los profesores.
- `api-error-handling`: el código `CLASS_ALREADY_HAS_TUTOR` y los códigos de campo `DUPLICATE` y `NOT_FOUND`.

## Impact

- **Contrato:** `docs/api-spec.yml` (dos operaciones, `Professor`, `TutorSummary`, los códigos nuevos y `SchoolClass.tutor`) y `frontend/src/api/generated/schema.ts`.
- **Backend:** `prisma/schema.prisma` y su migración; `domain/professor/` y `domain/course/course.ts`; `application/professors/`; `infrastructure/prisma/prismaProfessorRepository.ts` y `prismaCourseRepository.ts`; `presentation/professors/professorsRouter.ts`; `app.ts`, `composeApp.ts`, `appError.ts`, `errorHandler.ts`, `validationError.ts` y los dobles de test; `resetDatabase()` y `scripts/e2eData.mjs`.
- **Frontend:** `services/professorsService.ts` y `coursesService.ts`; `validation/professorValidation.ts`; `pages/ProfessorsPage.tsx` y `CreateProfessorPage.tsx`; `pages/CoursesPage.tsx`, `EditCoursePage.tsx` y `components/CourseForm.tsx` (tutor de solo lectura); `components/AppHeader.tsx`, `App.tsx`, `es.json` y `en.json`; E2E `cypress/e2e/professors.cy.ts`.
- **Infraestructura y dependencias:** sin cambios; la migración se aplica con `prisma migrate deploy` en el despliegue.
- **Documentación:** `MODELO_DATOS.md`, estándares, `CLAUDE.md` (los tres), `README.md`, la arquitectura y las fichas de US10 a US13 y `US-PROF-ASSIGN`. La ficha de US09 (y la de US09_b) ya están actualizadas en este cambio.
