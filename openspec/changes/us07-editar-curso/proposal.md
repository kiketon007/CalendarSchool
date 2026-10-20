## Why

US05 y US06 permiten crear cursos y verlos, pero un error al escribir el nombre o una clase que sobra o que falta solo se arregla hoy borrando datos a mano en la base de datos. US07 (`docs/User_Stories_MVP.md`, ficha enriquecida) cubre la edición que pide el PRD §3.4 («editar los detalles de un curso»): cambiar el nombre del curso y renombrar, añadir o quitar sus clases. Las clases conservan su identidad (`id`) al renombrarse, para que los tutores, alumnos y horarios que lleguen después sigan apuntando a la misma clase.

## What Changes

- **Contrato:** `GET /api/courses/{id}` (un curso con sus clases) y `PUT /api/courses/{id}` (`{ name, classes: [{ id?, name }] }`), los dos con Bearer y para `ADMIN` y `MEMBER`. Código de error nuevo **`COURSE_CHANGED`** (`409`): el cuerpo trae el `id` de una clase que ya no pertenece al curso. El `400` admite el campo `classes[i].id` (`INVALID_FORMAT`, `DUPLICATE`).
- **Backend:** casos de uso `GetCourse` y `UpdateCourse`, validación del `PUT` reutilizando las reglas de US05, y una transacción con el orden borrar → renombrar en dos fases → crear → actualizar el curso, que permite intercambiar nombres de clases y reutilizar el de una clase quitada. Un curso inexistente, de otro colegio o con un `id` que no es UUID responde `404`. Eventos `COURSE_UPDATED` y `COURSE_UPDATE_REJECTED`.
- **Frontend:** página `/cursos/:id/editar` rellenada con el `GET`, con el formulario de US05 extraído a un componente común (`CourseForm`) que usan la creación y la edición; «Guardar» deshabilitado sin cambios reales y durante el envío; «Cancelar»; aviso «Curso «X» actualizado» al volver a `/cursos`; pantallas de curso no disponible (`404`) y de curso cambiado (`409 COURSE_CHANGED`, con «Recargar»).
- **Listado `/cursos`:** la tabla gana la columna «Acciones» con un enlace «Editar» por fila, y cada tarjeta el suyo.
- Sin migración: se usan las tablas e índices únicos de US05.

**Fuera de alcance:** asignar o cambiar el tutor (US09) y los alumnos por clase (US14); confirmación al quitar una clase con alumnos (US14); comprobación del nombre en tiempo real; aviso de cambios sin guardar al salir; bloqueo optimista con `updatedAt`; límite de ediciones por minuto; borrar el curso (US08).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-courses`: el contrato añade `getCourse` y `updateCourse`; nuevos requisitos de lectura de un curso, de edición con identidad estable de las clases y de curso cambiado por otra persona; el nombre único se comprueba también al editar (sin contar el propio curso); acceso, eventos de log, listado (acción «Editar», que deja de ser una acción futura), página de edición, navegación (`aria-current` en la edición), accesibilidad y E2E.
- `api-error-handling`: el código `COURSE_CHANGED` y el `409 COURSE_ALREADY_EXISTS` también en `PUT /api/courses/{id}`.

## Impact

- **Contrato:** `docs/api-spec.yml` (`getCourse`, `updateCourse`, `UpdateCourseRequest`, `COURSE_CHANGED`) y `frontend/src/api/generated/schema.ts`.
- **Backend:** `domain/course/` (`courseRepository.ts`, `courseErrors.ts`), `application/courses/` (`getCourse.ts`, `updateCourse.ts`, `updateCourseRequest.ts`), `infrastructure/prisma/prismaCourseRepository.ts`, `presentation/courses/coursesRouter.ts`, `presentation/http/appError.ts` y `errorHandler.ts`, `app.ts`, `composeApp.ts`, `test/support/appDoubles.ts` y sus tests (unitarios e integración). Sin migración.
- **Frontend:** `services/coursesService.ts`, `components/CourseForm.tsx` (nuevo, extraído de `CreateCoursePage.tsx`), `pages/EditCoursePage.tsx` (nueva), `pages/CoursesPage.tsx`, `App.tsx`, `components/AppHeader.tsx` (si `aria-current` no cubre ya `/cursos/:id/editar`), `i18n/es.json` y `en.json`; E2E `cypress/e2e/courses.cy.ts`.
- **Infraestructura y dependencias:** sin cambios.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `CLAUDE.md` raíz, `README.md`, `docs/backend-standards.md` (colecciones hijas con identidad estable), `MODELO_DATOS.md`, la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y las notas de US08, US09 y US14. La ficha de US07 ya está actualizada en este cambio.
