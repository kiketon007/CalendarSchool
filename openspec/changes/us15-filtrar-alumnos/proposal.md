## Why

US15 (`docs/User_Stories_MVP.md`, épica 4, PRD §3.3 «Gestión de alumnos») convierte el listado mínimo de US14 en una herramienta para gestionar grupos: hoy `/alumnos` muestra todos los alumnos del colegio de una vez, sin total, sin búsqueda, sin filtros y sin páginas, y con unos cientos de alumnos encontrar a uno o ver quién come en el comedor de un curso exige recorrer la lista a mano. Absorbe también US16 (buscar por nombre o apellidos), que no tiene contenido propio.

## What Changes

- `/alumnos` gana un total («N alumnos»), una paginación de 20 en 20 (el componente de US10) y una barra de filtros combinables: búsqueda por nombre o apellidos (la regla de US11), curso (con «Sin curso»), clase (solo con un curso elegido, con «Sin clase»), comedor y beca (solo con comedor).
- Mientras hay filtros, «Mostrando N de M alumnos»; sin coincidencias, «No hay alumnos que coincidan con los filtros» con «Limpiar filtros».
- **Novedad en el proyecto:** curso, clase, comedor, beca y página se guardan en la URL (`/alumnos?curso=…&clase=…&comedor=si&beca=no&pagina=2`), con `replace`; los valores desconocidos u obsoletos se ignoran sin error. El **texto de búsqueda no va en la URL** (nombres de menores: historial del navegador y enlaces copiados).
- La búsqueda por palabras de US11 se generaliza para personas (profesores y alumnos), sin cambiar su comportamiento en `/profesores`.

Decisiones validadas por la persona usuaria (2026-10-22) y recogidas en la ficha: filtrado y paginación en el navegador, un solo campo de búsqueda, filtros en la URL sin el texto buscado.

**Fuera de alcance:** cambios en `GET /api/students`, en el backend o en la base de datos; los botones «Editar» y «Borrar» por fila (US17 y US18); la actualización automática del listado; filtrar o mostrar el tipo de comida o las observaciones (datos sensibles); estados del alumno; filtrar por una clase sin elegir antes su curso.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-students`: la página de listado gana total, paginación, búsqueda, filtros por curso, clase, comedor y beca, sus estados y la lectura y escritura de los filtros en la URL; el E2E de alumnos los cubre.

## Impact

- **Contrato, backend y base de datos:** sin cambios.
- **Frontend:** `pages/StudentsPage.tsx`; una utilidad nueva de filtros de alumnos (`utils/studentFilters.ts`: parámetros de la URL, opciones y aplicación de los filtros); la búsqueda por palabras de `utils/professorSearch.ts` pasa a una utilidad de personas usada también por `ProfessorsPage`; textos `students.*` en `es.json` y `en.json`.
- **Reutiliza:** `components/Pagination`, `utils/pagination.ts`, `normalizeForSearch` y `hooks/useMediaQuery`.
- **E2E:** `cypress/e2e/students.cy.ts`.
- **Documentación:** `frontend/CLAUDE.md`, `docs/frontend-standards.md` (filtros en la URL) y las notas de US16, US17 y US18.
