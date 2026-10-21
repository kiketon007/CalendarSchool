## Why

US10 (`docs/User_Stories_MVP.md`, épica 3, PRD §3.3 «Gestión de profesores») pide un listado completo del personal docente. US09 ya construyó `/profesores` con un listado mínimo, pero sin total ni paginación, y con una columna «Clase» que no dice que el profesor es tutor. Con decenas de profesores por colegio, la lista larga cuesta de recorrer, y US11 (búsqueda) necesita una paginación sobre la que filtrar.

## What Changes

- La página `/profesores` muestra el total («N profesores», con singular) encima del listado cuando hay profesores.
- La columna «Clase» pasa a llamarse **«Tutoría»** y muestra «Tutor de 1º Primaria A» o «Sin tutoría» (en gris), en la tabla y en las tarjetas. **BREAKING** solo de textos visibles: cambian los que comprobaban los tests y el E2E de US09.
- **Paginación en el navegador**, 20 por página, solo con más de 20 profesores: una navegación accesible con «Anterior», «Página X de N» y «Siguiente», con los extremos deshabilitados, el cambio anunciado y el foco conservado. La página vive solo en el estado de la página.
- Un componente reutilizable de paginación y una función pura `paginate`, para que US11 y otros listados la reutilicen.
- Los nombres largos se parten en varias líneas, sin desplazamiento horizontal a 360 px.

Decisiones validadas por la persona usuaria (2026-10-21) y recogidas en la ficha de US10.

**Fuera de alcance:** búsqueda (US11); asignaturas y filtro por asignatura (`US-PROF-ASSIGN`); botones Editar y Borrar (US12, US13); estados del profesor (`ACTIVE`); paginación en el servidor; recarga automática (sondeo o WebSocket); guardar la página en la URL o en almacenamiento; truncar nombres con tooltip.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-professors`: el requisito «Página de listado de profesores» cambia la columna «Clase» por «Tutoría» y añade el total y la paginación en el navegador; el de accesibilidad añade la navegación de la paginación; el E2E añade la paginación.

## Impact

- **Frontend:** `pages/ProfessorsPage.tsx`, un componente nuevo `components/Pagination.tsx`, una función pura de paginación (`utils/pagination.ts`), `i18n/es.json` y `en.json`, sus tests y `cypress/e2e/professors.cy.ts`.
- **Backend, contrato (`docs/api-spec.yml`) y modelo de datos:** sin cambios. `GET /api/professors` ya devuelve todos los profesores del colegio, ordenados, con `tutoredClass`.
- **Infraestructura:** sin cambios.
- **Documentación:** `frontend/CLAUDE.md`, `docs/frontend-standards.md` (paginación en el navegador) y las notas de US11, US12, US13 y `US-PROF-ASSIGN`.
