## Why

US-UI-LISTS_a aplicó el diseño de la maqueta a `/cursos` y `/calendarios` y dejó el patrón de las páginas de listado (`list-page-layout`: `PageHeader`, `ListSection`, `styles/_lists.scss`). Los listados de profesores, el resumen de carga y los alumnos siguen con la presentación anterior: un `h1` suelto, la búsqueda y el recuento fuera de contexto y tarjetas `Card` con el nombre en `h2`. US-UI-LISTS_b (`docs/User_Stories_MVP.md`, ficha común de las US-UI-LISTS y su concreción «US-UI-LISTS_b concretada») los lleva al mismo patrón. Lo justifica el PRD §4 (interfaz responsive y WCAG 2.1 AA).

## What Changes

- **`/profesores`:** adopta el patrón: cabecera con el sobretítulo «Equipo docente», la descripción, «Resumen de carga» y «Crear profesor»; el bloque «Equipo docente» con el contador «N profesores» y la búsqueda en su cabecera (etiqueta visualmente oculta, `placeholder` y lupa, como en `/cursos`); la línea «Mostrando N de M profesores» o «sin coincidencias» pasa a una línea propia dentro del bloque; la tabla se llama como el bloque; por debajo de 768 px cada profesor es una fila (`li.cs-list-item`) con el nombre en `h3`. La lógica (carga, búsqueda, paginación, acciones, borrado, avisos, foco) no cambia.
- **`/profesores/resumen`:** adopta el patrón: sobretítulo «Carga lectiva» y la descripción de hoy; el aviso de clases sin profesor y «todas asignadas» quedan fuera del bloque; el bloque «Carga por profesor» con el contador contiene los filtros, el recuento, el vacío y la tabla o la lista, con el nombre de cada profesor en `h3`. El detalle desplegable, los avisos y el estado (`Badge` con icono y texto) no cambian.
- **`/alumnos`:** adopta el patrón: sobretítulo «Comunidad escolar», la descripción y «Crear alumno»; el bloque «Alumnado» con el contador; `StudentFilters` (búsqueda y cuatro desplegables, con sus etiquetas visibles y sus ayudas) va dentro del bloque, encima del listado, con una lupa en el campo de búsqueda; la línea de resultados va dentro del bloque; filas con el nombre en `h3`. Los filtros en la URL, el texto de búsqueda solo en memoria y el resto de la lógica no cambian.
- **Patrón:** el requisito común deja de nombrar solo `/cursos` y `/calendarios`; se añade cómo encajan los filtros y la línea de resultados en el bloque y a dónde lleva la vista el cambio de página (al principio del bloque).
- **i18n:** sobretítulos, descripciones y títulos de bloque de las tres páginas (los contadores con plural ya existen).

**Fuera de alcance:** asignaturas y reglas (US-UI-LISTS_c); la portada (US-UI-HOME); formularios, la disponibilidad y los diálogos (US-UI-REST); el contenido del detalle desplegable del resumen; los tonos `cs-tone-*` en el estado del resumen; de la maqueta, «Volver al inicio», el buscador global, «Mostrando 1-6 de N» en la paginación, los datos de ejemplo y los anchos mínimos de tabla. Sin cambios de backend.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `list-page-layout`: el patrón se aplica también a `/profesores`, `/profesores/resumen` y `/alumnos`; se añaden los filtros y la línea de resultados dentro del bloque y el desplazamiento al bloque al cambiar de página.
- `school-professors`: el listado adopta el patrón; las tarjetas pasan a filas con el nombre en `h3`, la tabla se llama como el bloque, la búsqueda lleva la etiqueta visualmente oculta con `placeholder` y el total queda en la cabecera del bloque, con los resultados en su propia línea.
- `professor-load-summary`: la página adopta el patrón; el aviso de clases sin profesor queda fuera del bloque, la tabla se llama como el bloque y cada profesor de la lista lleva el nombre en `h3`.
- `school-students`: el listado adopta el patrón; filas con el nombre en `h3`, el total en la cabecera del bloque, la línea de resultados de los filtros dentro del bloque y, al cambiar de página, la vista va al bloque.

## Impact

- **Frontend:** `pages/ProfessorsPage.tsx`, `pages/ProfessorsSummaryPage.tsx`, `pages/StudentsPage.tsx` y sus tests; `components/StudentFilters.tsx` (lupa en el campo de búsqueda) y su test; `i18n/es.json` y `en.json`; E2E `professors.cy.ts`, `professorsSummary.cy.ts`, `students.cy.ts` y cualquier otro que busque el `h2` de una tarjeta de profesor o de alumno; `frontend/CLAUDE.md`. Se reutilizan `PageHeader`, `ListSection`, `SearchIcon` y `styles/_lists.scss`.
- **Backend, infraestructura, `docs/api-spec.yml` y modelo de datos:** sin cambios. La CSP no cambia.
- **Presupuesto:** el CSS compilado debe seguir por debajo de 33,75 kB en gzip (hoy 31,31 kB).
