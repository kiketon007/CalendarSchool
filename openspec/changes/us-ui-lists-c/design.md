## Context

US-UI-LISTS_a y _b dejaron el patrón de las páginas de listado (`list-page-layout`): `Container fluid="xxl"`, `PageHeader`, los avisos fuera del bloque y `components/ListSection` (`title`, `titleId`, `count?`, `toolbar?`, `framed`, `children`), con `styles/_lists.scss` (`.cs-list-header`, `.cs-list-count`, `.cs-search`, `.cs-search-wide`, `.cs-search-icon`, `.cs-list-item`) y `SearchIcon`. En `/alumnos` (`StudentFilters`), los filtros con etiqueta visible van dentro del bloque y la búsqueda lleva la lupa en un `div.cs-search.cs-search-wide` bajo su `Form.Label`.

Las dos páginas que quedan:
- **`/asignaturas` (`SubjectsPage`):** `Container as="main" className="py-5"`, el `h1` a mano (con `titleRef`), un `Form role="search"` con búsqueda, tipo y estado, y una `Card as="article"` por asignatura con el nombre en `h2` (`SubjectCard`). No cambia por ancho y no tiene recuento: sin coincidencias dice «No hay asignaturas que coincidan» en un `role="status"`, sin «Limpiar filtros».
- **`/reglas` (`ConstraintsPage`):** igual de contenedor y `h1` (`id="constraints-title"`, sin ref), un `Form role="search"` con búsqueda, tipo, curso y «Solo con avisos», el recuento «N reglas» siempre visible (`role="status"`, `constraints-count`), tabla desde 768 px con `aria-labelledby` al `h1` y una `Card` por regla debajo con la asignatura en `h2`.

La maqueta (`app/asignaturas`, `app/reglas`) da sobretítulos, descripción y títulos de bloque. Es un cambio solo de frontend y de presentación: sin backend, contrato, modelo de datos ni CSP, y por tanto sin impacto en la generación ni en la seguridad (autenticación, permisos por rol y aislamiento por colegio intactos).

## Goals / Non-Goals

**Goals:**
- Aplicar el patrón a las dos páginas sin cambiar su lógica (carga, filtros, despliegue de cursos, permisos, borrado, avisos, foco, enlaces de cada regla).
- Unificar el recuento: total en la cabecera del bloque y el resultado de filtrar en su propia línea, solo con filtros.
- `axe` limpio, sin desplazamiento horizontal a 360 y 1280 px y el CSS bajo 33,75 kB en gzip.

**Non-Goals:**
- Paginación (la maqueta la tiene; hoy no existe y la API entrega la lista entera).
- Los tonos `cs-tone-*` en las insignias; «Volver al inicio»; la línea «Configurada para el curso…»; los tipos de regla o los avisos numéricos de la maqueta.
- Formularios, cuadrículas, carga horaria y diálogos (US-UI-REST); la portada (US-UI-HOME).

## Decisions

### D1. Reutilizar `ListSection` sin cambiarlo
Las dos páginas usan `ListSection` `framed` (el bloque es una sola `cs-card` y sus elementos son filas). Ids de los `h2`: `subjects-list-title` y `constraints-list-title` (constantes `LIST_TITLE_ID`). La `ul` de asignaturas, la tabla de reglas y la `ul` de reglas pasan su `aria-labelledby` a ese `h2`; la `ul` de reglas deja su `aria-label` (`constraints.list`, que se conserva sin uso solo si otro sitio la usa; si no, se borra con su paridad en `en.json`).
- **Alternativa descartada:** `framed={false}` en asignaturas con una tarjeta por asignatura como en la maqueta y en `/calendarios`. Los calendarios son pocos y cada tarjeta es grande; las asignaturas son un catálogo filtrable con un recuento y una línea de resultados que deben ir dentro del bloque, y con tarjetas sueltas los filtros quedarían fuera de cualquier superficie o en una tarjeta propia. Las filas `cs-list-item` son lo que ya usan cursos, profesores y alumnos por debajo de 768 px.

### D2. Total en la cabecera, resultado en su línea
- **Asignaturas:** `count` = `subjects.count` (plural nuevo, `count_one`/`_other`) con el total cargado. Con `hasActiveSubjectFilters(filters)` (nueva en `utils/subjectFilters.ts`, con la misma regla que `hasActiveFilters` de reglas: una búsqueda de solo espacios no limita), un `p role="status"` con `data-testid="subjects-count"` dice `subjects.results` («Mostrando {{shown}} de {{total}} asignaturas») o, sin coincidencias, `subjects.noMatches` seguido de un `Button` «Limpiar filtros» (`subjects.filters.clear`, `outline-secondary`, fuera del `p`) que vacía los filtros y enfoca la búsqueda (`searchRef` nuevo).
- **Reglas:** `count` = `constraints.count` con el total. `constraints-count` pasa a pintarse solo con `hasActiveFilters(filters)` y dice `constraints.results` («Mostrando {{shown}} de {{total}} reglas») o `constraints.noMatches`; «Limpiar filtros» no cambia.
- **Por qué:** es lo que exige el requisito «Filtros y resultados dentro del bloque»; la cabecera no cambia de significado al filtrar.
- **Consecuencia:** los tests que leían el número de reglas en `constraints-count` sin filtros pasan a leer el total en `.cs-list-count`; con filtros, en la línea con su nuevo texto. Hoy «No hay asignaturas que coincidan» es un `p role="status"` suelto: pasa a ser el contenido de la línea de resultados (mismo texto y mismo rol).
- **Alternativa descartada:** dejar `/asignaturas` sin línea de resultados (incumpliría el requisito común); poner el total en `role="status"` (lo anunciaría en cada carga).

### D3. Filtros dentro del bloque, con lupa
En las dos páginas el `Form role="search"` va como primer hijo del bloque, debajo de su cabecera, con su `aria-label` de hoy y la misma rejilla (`row g-3 mb-4`). La búsqueda conserva el `Form.Label` visible y el `controlId` (`subjects-search`, `constraints-search`); el `Form.Control` y `SearchIcon` (`cs-search-icon`, `aria-hidden`) van en un `div.cs-search.cs-search-wide` debajo de la etiqueta, como en `StudentFilters` (el icono se centra respecto al campo, no al grupo). Los desplegables y la casilla no cambian.
- **Alternativa descartada:** la búsqueda en el `toolbar` de la cabecera y los desplegables dentro (separa controles que «Limpiar filtros» vacía juntos y obligaría a ocultar una etiqueta que hoy es visible).

### D4. Fila de una asignatura
`SubjectCard` pasa a `SubjectItem`: un `li.cs-list-item` con un `article aria-labelledby={titleId}` dentro (se conserva el `article` nombrado, que usan los E2E y los tests). Dentro del `article`, una cabecera `d-flex flex-column flex-sm-row justify-content-between align-items-sm-start gap-2` con, a la izquierda, la muestra de color, el `h3` (`h5 mb-0 text-break`) y el código, y las insignias debajo; a la derecha (solo `ADMIN`), «Editar» y «Borrar» en `d-flex flex-wrap gap-2 flex-shrink-0`. Debajo, la descripción, el resumen desplegable o «Sin cursos», como hoy. La `ul` es `list-unstyled mb-0` (el separador lo pone `.cs-list-item`). Una sola presentación en todos los anchos.
- **Por qué `flex-sm-row`:** la maqueta pone las acciones a la derecha desde 640 px; con 360 px no caben junto a un nombre largo y pasan debajo.

### D5. Tabla y filas de reglas
- **Tabla:** `Table hover` sin `responsive` (ya no lo lleva) y `aria-labelledby={LIST_TITLE_ID}`; `text-break` en la celda de la asignatura y en la de los avisos; el enlace de cada fila no cambia. Seis columnas a ≈1026 px útiles menos el relleno de la tarjeta: el E2E mide `scrollWidth` con una asignatura de nombre largo, código, avisos y su enlace.
- **Lista (< 768 px):** cada regla es un `li.cs-list-item` con el `h3` (`h5 text-break`) de la asignatura, el `dl` de hoy, los avisos y el enlace (`mt-2`); sin `Card`.

### D6. Cabeceras
- **Asignaturas:** `PageHeader` con `eyebrow` «Plan académico», `title`, `titleId` `subjects-title` (nuevo: hoy el `h1` no tiene `id`; `PageHeader` lo exige), `titleRef` de hoy, `description` y, solo con `isAdmin`, `actions` con «Crear asignatura». El texto de solo lectura y los avisos quedan entre la cabecera y el bloque.
- **Reglas:** `eyebrow` «Generador de horarios», `titleId` `constraints-title`, `description` = `constraints.intro` (se conserva la clave), sin `actions` ni `titleRef`.

### D7. Insignias
Se conservan las de hoy: tipo `bg-body-secondary text-body-emphasis`, estado `bg-success-subtle`/`bg-secondary-subtle` y «Inactiva» `Badge bg="secondary"` en reglas. Ya tienen texto y contraste; los `cs-tone-*` no aportan un estado nuevo.

### D8. Textos
Nuevas claves en `es.json` y `en.json`: `subjects.eyebrow` («Plan académico»), `subjects.description` («Organiza las materias, su modalidad y la carga lectiva del colegio.»), `subjects.listTitle` («Catálogo de asignaturas»), `subjects.count_one`/`_other` («{{count}} asignatura(s)»), `subjects.results` («Mostrando {{shown}} de {{total}} asignaturas»), `subjects.filters.clear` («Limpiar filtros»); `constraints.eyebrow` («Generador de horarios»), `constraints.listTitle` («Reglas del colegio»), `constraints.results` («Mostrando {{shown}} de {{total}} reglas»). `constraints.list` se borra si deja de usarse. `locales.test.ts` exige la paridad.

### D9. Estilos
Sin reglas nuevas: `.cs-search`, `.cs-search-wide`, `.cs-search-icon`, `.cs-list-item` y las utilidades de Bootstrap bastan. Si al medir a 360 px hiciera falta una regla, se añade en `_lists.scss` con su test en `theme.test.ts` y se anota el gzip.

## Risks / Trade-offs

- **[Tests que buscan `h2` o el recuento de reglas]** → paso propio por página; los que buscan el nombre de una asignatura o regla en nivel 2 pasan a nivel 3, y los que leen «N reglas» sin filtros, a `.cs-list-count` (misma intención). E2E: `article h2` → `article h3` en `subjects.cy.ts`; `grep` de `h2` y de `constraints-count` en los demás specs.
- **[La tabla de reglas a 1280 px con avisos largos]** → celdas partibles y E2E que la mide; si desborda con los datos del E2E, se revisa en ese paso antes de seguir (no se añade `responsive`).
- **[«Limpiar filtros» nuevo en asignaturas]** → es comportamiento nuevo (pequeño); se prueba como en reglas: quita los tres filtros y enfoca la búsqueda.
- **[`id` nuevo del `h1` de asignaturas]** → ningún test lo usa hoy; no choca con otros ids.
- **[El CSS crece]** → sin reglas nuevas previstas; se mide el gzip y se anota.

## Migration Plan

Despliegue normal del frontend por CI. Sin datos ni contrato: se revierte con el commit.

## Open Questions

Ninguna.
