## Why

US05 dejó en `/cursos` un listado mínimo: un bloque por curso con sus clases «Sin tutor». US06 (`docs/User_Stories_MVP.md`, ficha enriquecida) lo convierte en el listado completo que pide el PRD §3.4 («ver el listado completo de cursos y sus clases asociadas»): una tabla en escritorio y tarjetas en móvil con las clases, el tutor y la fecha de creación, y una búsqueda por nombre para encontrar un curso rápido. Solo muestra lo que ya existe: los botones de editar y borrar, el nombre del tutor, los alumnos y el horario los añadirán sus historias.

## What Changes

- **Contrato:** `Course` gana `createdAt` (ISO 8601, obligatorio) en `GET /api/courses` y en el `201` de `POST /api/courses`. Aditivo; no hay parámetros ni endpoints nuevos.
- **Backend:** el repositorio devuelve la fecha de creación que guarda la base de datos (también al crear) y el router la serializa en ISO 8601.
- **Frontend `/cursos`:** tabla (Curso | Clases | Tutores | Creado) desde 768 px y una tarjeta por curso por debajo, sin acordeón ni modal; «2 clases: A, B», «Sin tutor» y la fecha con el formato del idioma activo.
- **Búsqueda en el navegador** por el nombre del curso, al escribir, sin distinguir mayúsculas, acentos ni espacios sobrantes, con «Mostrando N de M cursos», un estado sin resultados y «Limpiar búsqueda». Sin paginación ni búsqueda en el servidor.
- Se mantienen de US05 «Crear curso», el aviso de curso creado, la carga única, el error con «Reintentar» y el estado vacío.

**Fuera de alcance:** paginación y búsqueda en el servidor; Editar y Borrar (US07, US08); el nombre del tutor (US09, US07); el número de alumnos (US14); «Ver horario» (US-ALGO-VIEW); recarga automática; guardar la búsqueda en la URL o en almacenamiento.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-courses`: el contrato y las respuestas de `POST` y `GET /api/courses` incluyen `createdAt`; la página de listado pasa a tabla y tarjetas con la fecha y la búsqueda en el navegador; la accesibilidad y el E2E cubren las dos presentaciones y la búsqueda.

## Impact

- **Contrato:** `docs/api-spec.yml` (`Course.createdAt`) y `frontend/src/api/generated/schema.ts`.
- **Backend:** `domain/course/course.ts`, `infrastructure/prisma/prismaCourseRepository.ts`, `presentation/courses/coursesRouter.ts` y sus tests (unitarios e integración). Sin migración: `courses.created_at` ya existe.
- **Frontend:** `services/coursesService.ts`, `pages/CoursesPage.tsx`, un hook `hooks/useMediaQuery.ts`, una función pura de búsqueda, `i18n/es.json` y `en.json`, y los tests de `CoursesPage` de US05; E2E `cypress/e2e/courses.cy.ts`.
- **Infraestructura y dependencias:** sin cambios.
- **Documentación:** `frontend/CLAUDE.md`, `backend/CLAUDE.md`, `docs/frontend-standards.md` (si la técnica responsive es una regla nueva), `README.md` y la arquitectura. La ficha de US06 y las notas de US07, US08, US09, US14 y US-ALGO-VIEW ya están actualizadas en este cambio.
