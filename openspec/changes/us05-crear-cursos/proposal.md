## Why

Los cursos y sus clases son la estructura del colegio de la que dependen los alumnos, los tutores y la generación de horarios (PRD §3.4). US05 (`docs/User_Stories_MVP.md`, ficha enriquecida) es la primera historia del módulo funcional: permite a cualquier usuario del colegio crear un curso con sus clases y verlos en un listado mínimo. El tutor pasa a ser opcional (PRD §3.4 actualizado) para romper el ciclo cursos → profesores → asignaturas → cursos: hoy no existen profesores, así que una clase se crea «Sin tutor» y se le asignará con US09 o US07.

## What Changes

- **API (contrato primero):** `POST /api/courses` crea un curso con sus clases en una transacción (`201`, `400 VALIDATION_ERROR`, `401`, `409 COURSE_ALREADY_EXISTS`, `503`) y `GET /api/courses` lista los del colegio de la identidad con sus clases. Ambos para `ADMIN` y `MEMBER`. El campo `tutor` de cada clase va en el contrato, siempre `null` hasta US09.
- **Código de error nuevo** `COURSE_ALREADY_EXISTS` y código de campo nuevo `DUPLICATE` (clase repetida en el mismo curso).
- **Modelo de datos:** tablas nuevas `courses` (único por colegio y nombre normalizado) y `classes` (única por curso y nombre normalizado, en cascada con su curso). Sin `tutor_id`: llega con US09.
- **Validación compartida** de los nombres de curso (1-100) y de clase (1-10, de 1 a 12 clases por curso) en backend y frontend, con una tabla común en `test-fixtures/`.
- **Frontend:** páginas `/cursos` (listado con clases «Sin tutor», vacío con llamada a crear) y `/cursos/nuevo` (formulario con filas de clases, guarda contra el doble envío y errores por campo), bajo el layout autenticado y sin guarda de rol; la cabecera muestra la navegación a todos los roles con «Cursos» (y «Usuarios» solo para `ADMIN`).
- La tarjeta «Gestión de horarios» de la bienvenida **no cambia** (sigue «Próximamente»).

**Fuera de alcance:** asignar tutores, el desplegable de profesores y la regla «un profesor tutoriza una sola clase» (US09, US07); la cascada al borrar un profesor (US13); búsqueda, paginación, fechas, número de alumnos y las acciones de editar y borrar del listado (US06, US07, US08); `academic_year`, `code`, `level` o `status` del curso; columnas de auditoría en la base de datos; activar la tarjeta de la bienvenida.

## Capabilities

### New Capabilities
- `school-courses`: creación y listado de los cursos de un colegio con sus clases: contrato de `POST`/`GET /api/courses`, reglas de los nombres y de unicidad, alta atómica, aislamiento por colegio, concurrencia, eventos de log, las páginas `/cursos` y `/cursos/nuevo`, el enlace «Cursos» de la navegación y su E2E.

### Modified Capabilities
- `frontend-shell`: `/cursos` y `/cursos/nuevo` se añaden como rutas hijas del layout de las páginas autenticadas.
- `api-error-handling`: nuevo `409 COURSE_ALREADY_EXISTS` cuando el nombre del curso ya existe en el colegio.

## Impact

- **Backend:** `domain/course/`, `application/courses/`, `infrastructure/prisma/prismaCourseRepository.ts`, `presentation/courses/coursesRouter.ts`, `app.ts`, `composeApp.ts`, `presentation/http/appError.ts`, `errorHandler.ts`, `test/support/`; migración nueva de Prisma.
- **Frontend:** `services/coursesService.ts`, `validation/courseValidation.ts`, `pages/CoursesPage.tsx`, `pages/CreateCoursePage.tsx`, `App.tsx`, `components/AppHeader.tsx`, `i18n/es.json` y `en.json`; E2E `cypress/e2e/courses.cy.ts`.
- **Contrato:** `docs/api-spec.yml` (dos operaciones, esquemas y el código de error) y `frontend/src/api/generated/schema.ts`.
- **Datos:** migración con `courses` y `classes`; se aplica en producción con el despliegue (`prisma migrate deploy`). La limpieza de tests y del E2E ya vacía todas las tablas salvo las conservadas, así que no cambia.
- **Infraestructura y dependencias:** sin cambios.
- **Documentación:** `MODELO_DATOS.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md` raíz, `README.md` y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md`, DSL). El PRD §3.4 y las fichas de US05, US06, US07, US09 y US13 ya están actualizados en este cambio.
