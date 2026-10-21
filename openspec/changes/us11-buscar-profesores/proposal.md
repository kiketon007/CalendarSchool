## Why

US11 (`docs/User_Stories_MVP.md`, épica 3, PRD §3.3 «Gestión de profesores») pide encontrar rápidamente a un profesor concreto. Tras US10, `/profesores` pagina de 20 en 20 y en un colegio con decenas de profesores hay que pasar páginas para llegar a uno. `/cursos` ya tiene una búsqueda en el navegador (US06) y los profesores necesitan la suya.

## What Changes

- Un campo «Buscar por nombre o apellidos» en `/profesores` (solo si hay profesores, hasta 100 caracteres), que filtra al escribir, en el navegador y sin retraso.
- Coincidencia por **palabras en cualquier orden**: cada palabra del texto debe aparecer en el nombre o en los apellidos, sin distinguir mayúsculas, acentos ni espacios sobrantes («garcia ana» encuentra «García, Ana»).
- El filtro se aplica a todos los profesores y después se pagina; cada cambio del texto vuelve a la página 1. Mientras hay texto, el total pasa a «Mostrando N de M profesores» en un `role="status"`.
- Sin resultados: «No hay profesores que coincidan con «X»» y «Limpiar búsqueda», que vacía el campo y le devuelve el foco.
- Una función pura `matchesProfessorSearch` que reutiliza `normalizeForSearch` de US06.

Decisiones validadas por la persona usuaria (2026-10-21) y recogidas en la ficha de US11.

**Fuera de alcance:** búsqueda por asignatura (`US-PROF-ASSIGN`), por cargo o por tutoría; búsqueda en el servidor (`/api/professors/search`); debounce, spinner y límite de búsquedas por minuto; recarga automática; guardar la búsqueda en la URL o en almacenamiento; tolerancia a erratas.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-professors`: se añade el requisito de la búsqueda; la página de listado deja de excluir la búsqueda; la paginación se aplica al resultado filtrado y vuelve a la primera página al buscar; accesibilidad y E2E cubren la búsqueda.

## Impact

- **Frontend:** `utils/professorSearch.ts` (nuevo), `pages/ProfessorsPage.tsx`, `i18n/es.json` y `en.json`, sus tests y `cypress/e2e/professors.cy.ts`.
- **Backend, contrato (`docs/api-spec.yml`) y modelo de datos:** sin cambios.
- **Infraestructura:** sin cambios.
- **Documentación:** `frontend/CLAUDE.md`, `docs/frontend-standards.md` (búsqueda por palabras), `README.md`, arquitectura y la nota de `US-PROF-ASSIGN`.
