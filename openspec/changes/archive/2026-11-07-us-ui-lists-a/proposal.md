## Why

US-UI-THEME dejó el tema, `PageHeader` y las clases `cs-`, y US-UI-SHELL el marco con la barra lateral, pero las páginas siguen con la presentación de antes: un `h1` suelto, la búsqueda fuera de contexto y tarjetas sin la estructura de la maqueta. US-UI-LISTS_a (`docs/User_Stories_MVP.md`, ficha común de las US-UI-LISTS y su concreción «US-UI-LISTS_a concretada») aplica el diseño a los dos primeros listados, `/cursos` y `/calendarios`, y fija el patrón que seguirán US-UI-LISTS_b y _c. Lo justifica el PRD §4 (interfaz responsive y WCAG 2.1 AA).

## What Changes

- **Patrón de página de listado** (nuevo): contenedor `Container fluid="xxl"`, `PageHeader` con sobretítulo, descripción y la acción de crear; los avisos y el texto de solo lectura entre la cabecera y el bloque; el bloque del listado como `section.cs-card` con nombre, un `h2` propio, un contador en plural y la búsqueda (si la hay) en su cabecera; los nombres de cada elemento del listado pasan a `h3`.
- **`/cursos`:** adopta el patrón; la búsqueda pasa a la cabecera del bloque con la etiqueta visualmente oculta, un `placeholder` y una lupa decorativa; la tabla toma su nombre del `h2` del bloque («Todos los cursos») en lugar del título de la página; las tarjetas de móvil llevan el nombre en `h3`. La lógica (carga, búsqueda, acciones, borrado, avisos, foco) no cambia.
- **`/calendarios`:** adopta el patrón («Tus calendarios»); cada calendario es un `article.cs-card` con franja y marca decorativas iguales para todos, el nombre en `h3`, «Editar» y «Borrar» con iconos (solo `ADMIN`) y el cuerpo en dos columnas desde 992 px: «Jornada lectiva» (los periodos) y el resumen con «Cursos asignados». La lógica no cambia.
- **Iconos nuevos** de Lucide (ISC): `SearchIcon`, `PencilIcon` y `Trash2Icon`, decorativos.
- **Estilos:** un parcial `styles/_lists.scss` importado por `theme.scss`.
- **i18n:** sobretítulos, descripciones, títulos de bloque, contadores en plural y las etiquetas «Jornada lectiva» y «Cursos asignados»; se elimina `calendars.courses` («Cursos: …»), que sustituye la etiqueta.
- **`PageHeader`** deja de ser un componente sin usar: lo adoptan estas dos páginas.

**Fuera de alcance:** profesores, alumnos, asignaturas y reglas (US-UI-LISTS_b y _c); la portada (US-UI-HOME); los formularios y diálogos (US-UI-REST); de la maqueta, la búsqueda y la paginación de calendarios, la etapa y el color de cada calendario, «Volver al inicio», el nombre del colegio en la descripción, «este año» en el contador y la elevación de las tarjetas al pasar el ratón.

## Capabilities

### New Capabilities
- `list-page-layout`: el patrón común de las páginas de listado (contenedor, cabecera, avisos, bloque con nombre y contador, niveles de encabezado, sin desplazamiento horizontal a 360 y 1280 px con la barra lateral).

### Modified Capabilities
- `school-courses`: la página de listado adopta el patrón; las tarjetas llevan el nombre en `h3` y la tabla se llama como el bloque («Todos los cursos»), no como el título de la página.
- `school-calendars`: la página de listado adopta el patrón; la tarjeta de cada calendario lleva el nombre en `h3`, «Jornada lectiva» y «Cursos asignados».
- `ui-theme`: `PageHeader` deja de estar sin adoptar (lo usan `/cursos` y `/calendarios`).

## Impact

- **Frontend:** `pages/CoursesPage.tsx`, `pages/CalendarsPage.tsx` y sus tests; `components/icons/` (tres iconos); `styles/_lists.scss`, `styles/theme.scss` y `styles/theme.test.ts`; `i18n/es.json` y `en.json`; E2E `courses.cy.ts`, `calendars.cy.ts` y los que busquen el `h2` de una tarjeta de curso o de calendario; `frontend/CLAUDE.md`.
- **Backend, infraestructura, `docs/api-spec.yml` y modelo de datos:** sin cambios. La CSP no cambia.
- **Presupuesto:** el CSS compilado debe seguir por debajo de 33,75 kB en gzip.
