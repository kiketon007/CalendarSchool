## Why

US14_b (`docs/User_Stories_MVP.md`, épica 4, PRD §3.3 «Gestión de alumnos») cierra lo que US14 dejó pendiente en los cursos: hoy `/cursos` no dice cuántos alumnos tiene cada curso ni cada clase, y en la edición de un curso se puede quitar una clase con alumnos sin ningún aviso, dejándolos sin clase sin darse cuenta. Con la tabla `students` ya en producción, los números y la confirmación son baratos y evitan errores al reorganizar las clases.

## What Changes

- Contrato: `SchoolClass` gana `studentCount` (alumnos de la clase) y `Course` gana `studentCount` (alumnos del curso, con y sin clase), obligatorios en todas las respuestas con un curso (`GET /api/courses`, `GET /api/courses/{id}`, `POST /api/courses` con ceros y `PUT /api/courses/{id}` contados tras guardar). El `PUT` los ignora si llegan. Los alumnos sin clase no viajan: el frontend los calcula como el total menos la suma de las clases.
- Backend: `PrismaCourseRepository` cuenta los alumnos en la misma consulta del listado, la lectura y la edición (`_count` de Prisma), sin una consulta por curso. Sin migración.
- `/cursos`: columna «Alumnos» («25» o «25 (3 sin clase)») y el número de cada clase en «Clases» («A (12), B (10)»), en tabla y tarjetas.
- Edición del curso: cada clase existente muestra su número de alumnos (solo lectura); quitar una clase existente con alumnos abre un diálogo de confirmación con el número («quedarán en el curso sin clase»); cancelar la deja, confirmar la quita del formulario. Nada se guarda hasta «Guardar». Una clase nueva o sin alumnos se quita sin preguntar, como hoy.
- Dos tests que hoy comprueban que `/cursos` **no** muestra «alumnos» (`CoursesPage.test.tsx` y `courses.cy.ts`) cambian a propósito.

Decisiones validadas por la persona usuaria (2026-10-22) y recogidas en la ficha: el total muestra «(N sin clase)» solo si hay alguno, y la confirmación usa el número que cargó la edición (el `PUT` no cuenta los alumnos que deja sin clase).

**Fuera de alcance:** listar los alumnos de una clase o moverlos entre clases desde el curso; contar en el `PUT` los alumnos que quedan sin clase; bloquear el guardado si el número cambió; números de alumnos en `/alumnos` o `/profesores`; cambios en el borrado de cursos (US08/US14) y en los eventos de log.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-courses`: el contrato y las respuestas de cursos llevan `studentCount` por curso y por clase; el listado de `/cursos` muestra los alumnos; la edición muestra el número de cada clase y pide confirmación al quitar una clase con alumnos; el E2E de cursos lo cubre.

## Impact

- **Contrato:** `docs/api-spec.yml` (`SchoolClass.studentCount`, `Course.studentCount` y las descripciones de `createCourse`, `listCourses`, `getCourse` y `updateCourse`); tipos del frontend regenerados y `api/schema.test.ts`.
- **Modelo de datos:** sin cambios (los índices `students_course_id_idx` y `students_class_id_idx` ya existen).
- **Backend:** tipos del dominio de cursos, `PrismaCourseRepository` (selects y `create`), los dobles de test y los tests de integración de cursos.
- **Frontend:** `coursesService` (validación de los números), `CoursesPage`, `CourseForm`, `EditCoursePage`, un componente nuevo `ConfirmRemoveClassModal`, fixtures de cursos de los tests e i18n.
- **E2E:** `courses.cy.ts`.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `ARQUITECTURA_COMPLETA.md` y las notas de las historias que hereden algo.
