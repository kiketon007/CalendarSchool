## Why

US-UI-LISTS_a y US-UI-LISTS_b llevaron `/cursos`, `/calendarios`, `/profesores`, `/profesores/resumen` y `/alumnos` al patrón de las páginas de listado (`list-page-layout`: `PageHeader`, `ListSection`, `styles/_lists.scss`). Quedan `/asignaturas` y `/reglas` con la presentación anterior: un `h1` suelto, los filtros y el recuento fuera de contexto y tarjetas `Card` con el nombre en `h2`. US-UI-LISTS_c (`docs/User_Stories_MVP.md`, ficha común de las US-UI-LISTS y su concreción «US-UI-LISTS_c concretada») las lleva al mismo patrón y cierra el grupo de historias de listados. Lo justifica el PRD §4 (interfaz responsive y WCAG 2.1 AA).

## What Changes

- **`/asignaturas`:** adopta el patrón: cabecera con el sobretítulo «Plan académico», la descripción y «Crear asignatura» (solo `ADMIN`, como hoy); el texto de solo lectura del `MEMBER` y los avisos quedan fuera del bloque; el bloque «Catálogo de asignaturas» con el contador «N asignaturas» contiene los filtros (búsqueda con lupa, tipo y estado), una línea nueva «Mostrando N de M asignaturas» (o «No hay asignaturas que coincidan» con un «Limpiar filtros» nuevo) solo con filtros activos, y la lista: cada asignatura pasa de `Card` a una fila (`li.cs-list-item`, con su `article`) con el nombre en `h3`. El despliegue de los cursos, los permisos, el borrado y el foco no cambian.
- **`/reglas`:** adopta el patrón: sobretítulo «Generador de horarios» y la descripción de hoy, sin acciones; el bloque «Reglas del colegio» con el contador «N reglas» contiene los filtros (búsqueda con lupa, tipo, curso y «Solo con avisos»), la línea de resultados (que pasa de «N reglas» siempre visible a «Mostrando N de M reglas» solo con filtros activos) y la tabla, que se llama como el bloque, sin `responsive` y con celdas partibles; por debajo de 768 px cada regla es una fila con la asignatura en `h3`. Los enlaces, los avisos y los filtros no cambian.
- **Patrón:** el requisito común nombra también `/asignaturas` y `/reglas`, y el de filtros y resultados las incluye entre las páginas de varios controles.
- **i18n:** sobretítulos, descripción de asignaturas, títulos de bloque, el contador de asignaturas con plural, las líneas de resultados y «Limpiar filtros» de asignaturas.

**Fuera de alcance:** la portada (US-UI-HOME); formularios, cuadrículas, la carga horaria y los diálogos (US-UI-REST); los tonos `cs-tone-*` en las insignias; de la maqueta, «Volver al inicio», el buscador global, la paginación («Mostrando 1-5 de N»), la línea «Configurada para el curso 2026 / 2027», los tipos de regla que la API no tiene («Máximo de sesiones», «Días preferentes»), los avisos como número y los datos de ejemplo. Sin cambios de backend.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `list-page-layout`: el patrón se aplica también a `/asignaturas` y `/reglas`, que tienen sus filtros dentro del bloque.
- `school-subjects`: el listado adopta el patrón; las tarjetas pasan a filas con el nombre en `h3`, el total va en la cabecera del bloque y, con filtros, una línea de resultados con «Limpiar filtros».
- `constraints-list`: la página adopta el patrón; la tabla se llama como el bloque, las tarjetas pasan a filas con la asignatura en `h3`, el total va en la cabecera del bloque y el recuento pasa a ser la línea de resultados, solo con filtros.

## Impact

- **Frontend:** `pages/SubjectsPage.tsx`, `pages/ConstraintsPage.tsx` y sus tests; `i18n/es.json` y `en.json`; E2E `subjects.cy.ts`, `constraints.cy.ts` y cualquier otro que busque el `h2` de una asignatura o el recuento de reglas (`workload.cy.ts`, `courses.cy.ts`, por comprobar); `frontend/CLAUDE.md`. Se reutilizan `PageHeader`, `ListSection`, `SearchIcon` y `styles/_lists.scss`.
- **Backend, infraestructura, `docs/api-spec.yml` y modelo de datos:** sin cambios. La CSP no cambia.
- **Presupuesto:** el CSS compilado debe seguir por debajo de 33,75 kB en gzip (hoy 31,31 kB).
