## Why

US14 (`docs/User_Stories_MVP.md`, épica 4, PRD §3.3 «Gestión de alumnos») abre la gestión de alumnos: hoy el colegio tiene cursos, clases y profesores, pero no puede registrar a sus estudiantes, y el diálogo de borrado de cursos (US08) lleva `studentCount` fijo a `0` a la espera de esta historia. Crear alumnos con su curso, su clase y sus datos de comedor es la base de US15–US18 y del servicio de comedor.

## What Changes

- Tabla `students` (migración `add_students`): nombre, apellidos, curso (obligatorio al crear, nulo si el curso se borra), clase opcional del curso, comedor, beca de comedor, tipo de comida y observaciones; claves ajenas a `courses` y `classes` con `ON DELETE SET NULL` y un `CHECK` que impide beca o tipo de comida sin comedor. Sin `status` ni `deleted_at`.
- `POST /api/students`: crea el alumno en el colegio de la identidad (`ADMIN` o `MEMBER`), valida con una tabla de campos compartida con el frontend y comprueba en la transacción que el curso y la clase son del colegio y que la clase es del curso (si no, `400` con `NOT_FOUND` en su campo). Beca o tipo de comida sin comedor dan `400` con el código de campo nuevo **`NOT_ALLOWED`**.
- `GET /api/students`: listado del colegio por apellidos y nombre, **sin** tipo de comida ni observaciones.
- Tipo de comida y observaciones se tratan como **datos sensibles** (posibles datos de salud de menores): nunca en logs ni en el listado; el formulario pide anotar solo lo necesario.
- Eventos `STUDENT_CREATED` y `STUDENT_CREATION_REJECTED`, sin datos personales.
- Borrado de cursos (US08): `studentCount` pasa a ser el número real de alumnos del curso (con y sin clase), en el impacto y dentro de la transacción del borrado; esos alumnos quedan sin curso ni clase y el aviso final dice «quedan sin curso». Quitar una clase al editar un curso deja a sus alumnos en el curso sin clase.
- Frontend: enlace «Alumnos» en la cabecera, listado mínimo `/alumnos` (tabla desde 768 px y tarjetas) y alta `/alumnos/nuevo` con `StudentForm` (clases según el curso, comedor Sí/No sin valor inicial, beca y tipo de comida solo con «Sí», observaciones con contador).

Decisiones validadas por la persona usuaria (2026-10-21) y recogidas en la ficha de US14, que se divide en US14 y **US14_b** (número de alumnos en `/cursos` y confirmación al quitar una clase con alumnos).

**Fuera de alcance:** filtros, búsqueda y paginación del listado (US15, US16); editar (US17) y borrar (US18) alumnos; lo de US14_b; número de identidad o ID interno del alumno (PRD §3.3, sin historia todavía); email y estados del alumno; importación masiva; cifrado o acceso por rol a los datos sensibles; cambios en el borrado de profesores (una clase con alumnos puede quedarse sin tutor).

## Capabilities

### New Capabilities

- `school-students`: alta y listado mínimo de alumnos (contrato, modelo, validación compartida, acceso, eventos, páginas, navegación, datos sensibles, accesibilidad y E2E).

### Modified Capabilities

- `school-courses`: `studentCount` del impacto y del borrado cuenta los alumnos reales del curso; el diálogo dice que quedan sin curso; borrar un curso deja a sus alumnos sin curso ni clase y quitar una clase deja a los suyos sin clase.
- `api-error-handling`: los códigos de campo de los errores de validación ganan `NOT_ALLOWED` (un campo que no se admite por el valor de otro).

## Impact

- **Contrato:** `docs/api-spec.yml` (`createStudent`, `listStudents`, `CreateStudentRequest`, `Student`, `StudentSummary`, `NOT_ALLOWED` y la descripción de `studentCount`); tipos del frontend regenerados.
- **Modelo de datos:** migración `add_students` (modelo `Student` y relaciones inversas en `School`, `Course` y `SchoolClass`); `resetDatabase()` y `scripts/e2eData.mjs` vacían `students`.
- **Backend:** dominio `student`, casos de uso `CreateStudent` y `ListStudents`, `PrismaStudentRepository`, `studentsRouter`, parser con `test-fixtures/student-fields.json`, `PrismaCourseRepository` (recuento real) y raíz de composición.
- **Frontend:** `studentsService`, `studentValidation`, `StudentForm`, `StudentsPage`, `CreateStudentPage`, rutas, `AppHeader`, el aviso de `CoursesPage` e i18n.
- **E2E:** `students.cy.ts` nuevo y `courses.cy.ts` (borrar un curso con alumnos).
- **Documentación:** `MODELO_DATOS.md`, `CLAUDE.md` (los tres), `README.md`, estándares, arquitectura y notas de US14_b, US15, US17 y US18.
