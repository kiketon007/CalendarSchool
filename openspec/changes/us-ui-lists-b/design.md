## Context

US-UI-LISTS_a dejó el patrón de las páginas de listado (`list-page-layout`): `Container fluid="xxl"`, `PageHeader`, los avisos fuera del bloque y `components/ListSection` (`title`, `titleId`, `count?`, `toolbar?`, `framed`, `children`), con `styles/_lists.scss` (`.cs-list-header`, `.cs-list-count`, `.cs-search`, `.cs-search-icon`, `.cs-list-item`) y `SearchIcon`. `/profesores` (`ProfessorsPage`), `/profesores/resumen` (`ProfessorsSummaryPage`) y `/alumnos` (`StudentsPage`) siguen con `Container as="main" className="py-5"`, el `h1` a mano y, por debajo de 768 px, un `Card` por elemento con el nombre en `h2`. Las tres tienen ya tabla y lista según `useMediaQuery('(min-width: 768px)')`. Profesores y alumnos tienen una única línea de recuento que hace de total y, con búsqueda o filtros, de resultado (`role="status"`), y es también el destino del `scrollIntoView` al cambiar de página; el resumen tiene un recuento `role="status"` que dice cuántos se ven. La maqueta (`app/profesores`, `app/alumnos`) da sobretítulos, descripciones y títulos de bloque; el resumen no tiene maqueta. Es un cambio solo de frontend y de presentación: sin backend, contrato, modelo de datos ni CSP, y por tanto sin impacto en la generación ni en la seguridad (autenticación y aislamiento por colegio intactos).

## Goals / Non-Goals

**Goals:**
- Aplicar el patrón a las tres páginas sin cambiar su lógica (carga, búsqueda, filtros, URL, paginación, borrado, avisos, foco, detalle del resumen).
- Unificar el recuento con `/cursos`: total en la cabecera del bloque y el resultado de buscar o filtrar en su propia línea.
- `axe` limpio, sin desplazamiento horizontal a 360 y 1280 px y el CSS bajo 33,75 kB en gzip.

**Non-Goals:**
- El contenido del detalle desplegable del resumen (`ProfessorLoadDetail`) y sus avisos (`ProfessorLoadWarnings`).
- Los tonos `cs-tone-*` en el estado del resumen; «Volver al inicio»; el formato «Mostrando 1-6 de N» de la paginación; los anchos mínimos de tabla de la maqueta.
- Formularios, disponibilidad y diálogos (US-UI-REST); asignaturas y reglas (US-UI-LISTS_c).

## Decisions

### D1. Reutilizar `ListSection` sin cambiarlo
Las tres páginas usan `ListSection` `framed` (el bloque es una sola `cs-card`; sus elementos son filas, no tarjetas). Los ids de los `h2` son `professors-list-title`, `professors-summary-list-title` y `students-list-title`; la tabla y la `ul` de cada página pasan su `aria-labelledby` (o, en el resumen, su `aria-label`) a ese `h2`.
- **Alternativa descartada:** ampliar `ListSection` con un hueco para los filtros o un `ref` (ver D3 y D4: no hace falta).

### D2. Total en la cabecera, resultado en su línea
`count` de `ListSection` recibe siempre el total de lo cargado: `professors.count` y `students.count` (plurales que ya existen) y `professors.summary.count` con el total del resumen. El texto de resultado se pinta dentro del bloque en un `p` con `role="status"` y `data-testid` de hoy (`professors-count`, `students-count`, `professors-summary-count`), **solo** con búsqueda o filtros activos: «Mostrando N de M …» o el texto sin coincidencias, seguido de «Limpiar…». En el resumen, la línea con filtros dice «Mostrando {shown} de {total} profesores» con una clave nueva `professors.summary.results` (no se reutiliza `professors.search.results` para no acoplar dos páginas).
- **Por qué:** es lo que hace `/cursos` y lo que dice `list-page-layout`; evita que la cabecera cambie de significado al escribir.
- **Consecuencia:** los tests que leían el total en `professors-count`/`students-count` sin filtros pasan a leerlo en la cabecera del bloque (misma intención); con filtros, el `data-testid` sigue en la línea de resultados.
- **Alternativa descartada:** pasar el texto de resultados como `count` (la cabecera no lleva `role="status"` y cambiaría el total por un resultado); poner `role="status"` en el contador de `ListSection` (anunciaría el total en cada carga).

### D3. Cambio de página: la vista va al `h2` del bloque
`changePage` deja de llamar a `listTop.current?.scrollIntoView` sobre la línea de recuento (que sin filtros ya no existe) y pasa a `document.getElementById(LIST_TITLE_ID)?.scrollIntoView({ block: 'start' })`. El foco no se mueve.
- **Alternativa descartada:** un `ref` reenviado por `ListSection` (cambia un componente compartido para un caso de dos páginas); un `ref` en la tabla y otro en la lista (dos destinos según el ancho).

### D4. Dónde va la búsqueda
- **`/profesores`:** un solo campo; va en el `toolbar` de `ListSection` igual que en `/cursos`: `Form.Group controlId="professor-search" className="cs-search"`, `Form.Label visuallyHidden`, `placeholder` con `professors.search.label`, `SearchIcon` con `cs-search-icon`, el mismo `ref`, `maxLength` y `type="search"`.
- **`/alumnos` y `/profesores/resumen`:** varios controles con etiqueta visible y ayudas; van **dentro** del bloque como primer hijo, debajo de la cabecera. `StudentFilters` añade solo la lupa: el `Form.Group` de la búsqueda lleva `cs-search` sin ancho fijo (clase modificadora `cs-search-wide`, `width: 100%` en todos los anchos) y el `SearchIcon`; su etiqueta sigue visible. El formulario del resumen no cambia de marcado.
- **Por qué:** la cabecera del bloque solo tiene sitio para un campo; mover cuatro desplegables con ayudas a la derecha del título rompería la cabecera a 1026 px y obligaría a ocultar etiquetas que hoy son visibles (la spec de alumnos las exige).
- **Consecuencia en alumnos:** con la etiqueta visible encima del campo, el icono se centra respecto al campo, no al grupo: `.cs-search-icon` usa `top: 50%` del contenedor, así que en `StudentFilters` el icono y el `Form.Control` van en un `div.cs-search` propio, debajo del `Form.Label`.
- **Alternativa descartada:** la búsqueda de alumnos en la cabecera y los desplegables dentro (separa controles que funcionan juntos: «Limpiar filtros» los vacía todos).

### D5. Filas de móvil sin tarjetas anidadas
Como en `/cursos`: cada `li` pasa de `Card` a `li.cs-list-item` con el `h3` (`h5 text-break`), el `dl` y las acciones (en alumnos, las acciones dejan de ir en un `Card.Footer` y van tras el `dl` con `mt-3`). En el resumen, el `li.cs-list-item` contiene el `h3`, el `dl`, los avisos, las acciones y, desplegado, el detalle, en el orden de hoy. La `ul` deja `d-grid gap-3` por `list-unstyled mb-0` (el separador lo pone `.cs-list-item`).

### D6. Tablas a 1280 px con la barra lateral
`Table` sin `responsive` (ya no lo llevan), sin `nowrap`; `text-break` en el nombre y en las asignaturas (profesores y resumen) y en los avisos del resumen; acciones en `d-flex flex-wrap gap-2` (profesores y alumnos) y `d-grid gap-1` (resumen, como hoy). Con ≈1026 px útiles menos el relleno de la tarjeta, las 7 columnas del resumen son el caso límite: el E2E mide `scrollWidth` de la tabla con los datos de su spec.
- **Alternativa descartada:** `responsive` (desplazamiento propio en escritorio, que la spec prohíbe); ocultar columnas (cambia el contenido).

### D7. Cabeceras
- **Profesores:** `eyebrow` «Equipo docente», `description`, `actions` con los dos `Link` de hoy en un `div.d-flex.flex-wrap.gap-2` (`btn-outline-primary` y `btn-primary`), `titleRef` de hoy.
- **Resumen:** `eyebrow` «Carga lectiva», `description` = `professors.summary.intro` (la clave se conserva), sin `actions`; `titleRef` no se pasa (hoy no hay foco programático y el `h1` no tenía `tabIndex`; `PageHeader` lo añade igualmente, sin efecto visible). El aviso `unassigned` (`Alert role="region"` con su `h2`) y el texto «todas asignadas» quedan entre la cabecera y el bloque; ese `h2` y el del bloque quedan al mismo nivel, bajo el `h1`.
- **Alumnos:** `eyebrow` «Comunidad escolar», `description`, `actions` con «Crear alumno».

### D8. Estado del resumen
Se conserva el `Badge` con icono y texto. Los tonos `cs-tone-*` (lavanda, melocotón, menta, amarillo) no tienen rojo para `EXCEEDS` y mezclarlos con un `danger` daría dos sistemas de color en la misma columna. El texto ya hace de pista principal.

### D9. Textos
Nuevas claves en `es.json` y `en.json`: `professors.eyebrow` («Equipo docente»), `professors.description`, `professors.listTitle` («Equipo docente»); `professors.summary.eyebrow` («Carga lectiva»), `professors.summary.listTitle` («Carga por profesor»), `professors.summary.results` («Mostrando {{shown}} de {{total}} profesores»); `students.eyebrow` («Comunidad escolar»), `students.description`, `students.listTitle` («Alumnado»). Sin claves eliminadas. `locales.test.ts` exige la paridad.

### D10. Estilos
Solo una regla nueva en `_lists.scss`: `.cs-search-wide { width: 100%; }` también desde `sm` (la búsqueda de alumnos ocupa todo el ancho, como en la maqueta). Sin colores nuevos, así que `theme.test.ts` solo comprueba que la clase existe.

## Risks / Trade-offs

- **[Tests que leen el total en la línea de recuento]** → paso propio por página; los que comprueban «N profesores»/«N alumnos» sin filtros pasan a buscar en la región del bloque; con filtros no cambian.
- **[El resumen a 1280 px puede desbordar con muchos avisos o cursos]** → celdas partibles y E2E que mide la tabla; si desborda con los datos de la spec, se revisa en el paso del E2E antes de seguir (no se añade `responsive`).
- **[Encabezados del resumen]** → el `h2` del aviso de clases sin profesor y el del bloque son hermanos; `axe` lo comprueba con y sin el aviso.
- **[`scrollIntoView` por id]** → si el bloque no existe (vacío) no hay paginación, así que no se llama; en jsdom se simula como hoy.
- **[El CSS crece]** → una regla; se mide el gzip y se anota.

## Migration Plan

Despliegue normal del frontend por CI. Sin datos ni contrato: se revierte con el commit.

## Open Questions

Ninguna.
