## Context

`/cursos` (`pages/CoursesPage.tsx`) y `/calendarios` (`pages/CalendarsPage.tsx`) cuelgan ya del marco de US-UI-SHELL, pero pintan su cabecera a mano (`h1` y botón en un `div`), con `Container as="main" className="py-5"`. Cursos tiene tabla desde 768 px y tarjetas `Card` por debajo (US06), con la búsqueda suelta encima; calendarios pinta un `Card as="article"` por calendario, sin búsqueda ni paginación. `PageHeader`, `.cs-card`, `.cs-eyebrow` y `.cs-tone-*` existen desde US-UI-THEME y no los usa ninguna página. La maqueta (`app/cursos`, `app/calendario`) muestra el patrón: sobretítulo, título, descripción y acción; una tarjeta con «Todos los cursos», un contador y la búsqueda, y la tabla dentro; en calendarios, la cabecera del bloque en su propia tarjeta y una tarjeta por calendario debajo. Es un cambio solo de frontend y de presentación: sin backend, contrato, modelo de datos ni CSP, y por tanto sin impacto en la generación ni en la seguridad (la autenticación y el aislamiento por colegio no se tocan).

## Goals / Non-Goals

**Goals:**
- Aplicar el diseño a los dos listados sin cambiar su lógica ni la intención de sus tests.
- Dejar un componente de bloque reutilizable para US-UI-LISTS_b y _c.
- Mantener `axe` limpio, sin desplazamiento horizontal a 360 y 1280 px y el CSS bajo 33,75 kB en gzip.

**Non-Goals:**
- Búsqueda, paginación, etapa o color en calendarios; «Volver al inicio»; el nombre del colegio en las descripciones; la elevación al pasar el ratón.
- Formularios, diálogos y el resto de páginas (otras US-UI).

## Decisions

### D1. Un componente `ListSection` para el bloque
`components/ListSection.tsx`, presentacional y sin textos propios: `title`, `titleId`, `count?` (el texto ya traducido del contador; sin él no se pinta), `toolbar?` (la búsqueda), `framed` (por defecto `true`) y `children`. Pinta `section[aria-labelledby]` con la cabecera (`h2` y contador a la izquierda, `toolbar` a la derecha desde `sm` y debajo por debajo). Con `framed` la `section` es la `cs-card` y el contenido va dentro; sin `framed`, solo la cabecera es una `cs-card` y el contenido va debajo, con separación (`d-grid gap-3` lo pone la página).
- **Por qué:** las seis páginas de las LISTS repiten la misma cabecera; un componente evita copiar el marcado seis veces y se prueba una vez (estructura, contador opcional, `toolbar` opcional, `axe`).
- **Alternativa descartada:** marcado a mano en cada página (más duplicación, el patrón se desvía entre páginas); clase CSS sola (no fija el `aria-labelledby` ni el orden de los encabezados).

### D2. Cabecera con `PageHeader` y contenedor `fluid="xxl"`
Las dos páginas pasan su `h1` a `PageHeader` (mismo `id`, `titleRef` y `tabIndex={-1}`) con `eyebrow`, `description` y `actions` (el `Link` de crear; en calendarios solo para `ADMIN`). `main` es `Container as="main" fluid="xxl" className="py-4 py-lg-5 px-3 px-lg-4"`: ocupa el ancho útil junto a la barra lateral hasta 1400 px y se queda en 1320 px, como la maqueta.
- **Alternativa descartada:** el `Container` normal, que a 1280 px limita a 1140 px el contenido aunque haya sitio y no coincide con la maqueta; una clase propia `.cs-page` (CSS que Bootstrap ya da).

### D3. Encabezados: `h2` del bloque y `h3` de cada elemento
El bloque lleva un `h2` («Todos los cursos», «Tus calendarios»), así que el nombre de cada tarjeta de curso (móvil) y de cada calendario pasa a `h3`. La tabla de cursos pasa su `aria-labelledby` del `h1` al `h2` del bloque (`courses-list-title`) y el `ul` de tarjetas también.
- **Consecuencia:** unas treinta búsquedas `heading { level: 2 }` de `CoursesPage.test.tsx` y `CalendarsPage.test.tsx` pasan a nivel 3, y los E2E `courses.cy.ts` (`cy.contains('h2', …)`) y `calendars.cy.ts` (`article h2`) a `h3`. Se revisan además los E2E que buscan esas tarjetas desde otras specs.
- **Alternativa descartada:** dejar `h2` en las tarjetas con el título del bloque también como `h2` (el título del bloque y los elementos quedarían al mismo nivel) o sin título de bloque (la maqueta lo tiene y la región necesita nombre).

### D4. La búsqueda de cursos en la cabecera del bloque
El `Form.Group` con `controlId="course-search"` va en el `toolbar` de `ListSection`. `Form.Label visuallyHidden` conserva el nombre «Buscar por nombre»; el `Form.Control` lleva `placeholder` con el mismo texto (`courses.search.label`, sin clave nueva) y va en un envoltorio `.cs-search` con `SearchIcon` (`aria-hidden`) posicionado a la izquierda y relleno izquierdo en el campo. El `role="status"` de resultados, «Limpiar búsqueda» y el foco no cambian y van dentro del bloque, encima de la tabla.
- **Alternativa descartada:** etiqueta visible encima (la maqueta no la tiene y rompe la cabecera compacta); solo `aria-label` (se pierde el `label` asociado que usan los tests con `getByLabelText`).

### D5. Filas de cursos en móvil sin tarjetas anidadas
Con el bloque como `cs-card`, cada curso por debajo de 768 px deja de ser un `Card` dentro de otra tarjeta y pasa a ser un `li.cs-list-item` (separador inferior, relleno vertical) con el `h3`, el `dl` y las acciones. La tabla usa los estilos del tema (`$table-*` de US-UI-THEME) y `Table` sin `responsive`: las celdas pueden partirse y las acciones ya llevan `flex-wrap`.
- **Alternativa descartada:** mantener `Card` (tarjeta en tarjeta, más bordes que contenido).

### D6. Tarjeta de calendario
`ListSection framed={false}`: la cabecera es una `cs-card` y debajo un `div.d-grid.gap-3` con un `article.cs-card.cs-calendar-card` por calendario (`aria-labelledby` a su `h3`, `text-break`). La franja superior es un `::before` del `article` en lavanda y la marca es un `span.cs-calendar-mark.cs-tone-lavender` con `CalendarDaysIcon`, los dos decorativos e iguales para todos. Las acciones (`PencilIcon` y `Trash2Icon` `aria-hidden` delante del texto) van a la derecha del nombre desde `sm` y debajo por debajo. El cuerpo es una rejilla `row` con dos columnas desde `lg` (`col-lg-7` y `col-lg-5`): «Jornada lectiva» (`p.cs-eyebrow`-like en gris, `.cs-section-label`) sobre un panel `.cs-day-panel` (fondo `#fafaff`) con la `ul` de periodos en dos columnas desde `sm` (CSS grid; el orden de lectura sigue siendo el de la lista), y en la otra columna el resumen y «Cursos asignados» con los nombres unidos por comas o «Sin cursos asignados». La clave `calendars.courses` («Cursos: …») se elimina, porque la etiqueta la sustituye.
- **Etiquetas:** «Jornada lectiva» y «Cursos asignados» son párrafos (no encabezados) para no añadir niveles; la lista de periodos conserva su `aria-label` («Periodos de {nombre}»).
- **Alternativa descartada:** `Card` de react-bootstrap (el borde y el radio ya los da `cs-card`); un color por calendario rotando tonos (sería un dato inventado: la API no tiene color).

### D7. Estilos en `styles/_lists.scss`
Parcial importado por `theme.scss` tras `_shell`: `.cs-list-header` (cabecera del bloque), `.cs-search` (lupa e indentado), `.cs-list-item`, `.cs-calendar-card` (posición y franja), `.cs-calendar-mark`, `.cs-section-label` (12 px, mayúsculas, `#5b6478`), `.cs-day-panel` y `.cs-period-list`. Solo colores ya probados o nuevos con su prueba de contraste en `theme.test.ts` (`#5b6478` sobre `#fafaff` y blanco, ≥ 4,5:1). Sin estilos en línea (CSP).

### D8. Iconos
`SearchIcon`, `PencilIcon` y `Trash2Icon` se copian de Lucide (los mismos trazos que el `lucide-react` de la maqueta, licencia ISC ya incluida en `components/icons/LUCIDE-LICENSE.txt`) con la misma forma que los de US-UI-SHELL (`IconProps`, `aria-hidden`, `focusable="false"`).

### D9. Textos
Nuevas claves en `es.json` y `en.json`: `courses.eyebrow`, `courses.description`, `courses.listTitle`, `courses.count_one`/`_other`; `calendars.eyebrow`, `calendars.description`, `calendars.listTitle`, `calendars.count_one`/`_other`, `calendars.dayLabel`, `calendars.coursesLabel`. Se elimina `calendars.courses`. `locales.test.ts` exige la paridad.

## Risks / Trade-offs

- **[Muchos tests cambian de nivel de encabezado]** → cambio mecánico y en un paso propio; la intención (encontrar la tarjeta por su nombre) no cambia. Se ejecuta la suite completa y el E2E entero.
- **[La tabla de cursos puede desbordar a 1280 px con nombres largos de tutores]** → sin `nowrap`, las celdas se parten; el E2E mide `scrollWidth` de la tabla con los datos de prueba a 1280 px.
- **[La rejilla de periodos en dos columnas se lee en orden de filas]** → el orden del DOM sigue siendo el de la jornada; la rejilla solo coloca visualmente, y por debajo de 576 px es una columna.
- **[El CSS crece]** → el parcial es pequeño; se mide el gzip antes y después y se anota (límite 33,75 kB).
- **[Texto oculto de la búsqueda]** → la etiqueta sigue existiendo para tecnologías de apoyo y el `placeholder` la repite a la vista; `axe` lo comprueba.

## Migration Plan

Despliegue normal del frontend por CI. Sin datos ni contrato: se revierte con el commit.

## Open Questions

Ninguna.
