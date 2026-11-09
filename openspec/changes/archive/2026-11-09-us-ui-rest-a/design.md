## Context

`/horarios` (`pages/ScheduleReadinessPage.tsx`) se construyó en US-ALGO-CHECK, US-ALGO-RUN y US-ALGO-CONFIRM con Bootstrap sin tema. Hoy tiene:
- un `Container` sin `fluid` y un `h1` a mano con la introducción;
- el aviso de borrador descartado y `OfficialScheduleSummary`;
- el veredicto (`p role="status"` con `✓` o `✕`) y su nota;
- el panel `ScheduleGenerationPanel`, un `section.card.card-body` de unas 660 líneas con el `h2`, los estados (carga, error, en curso, completada, fallida, cancelada), `CompletedOffer`, la casilla y los botones;
- los grupos de problemas, cada uno un `section` con `h2` y una `ul` de `ReadinessIssueItem` (`li` sueltos).

`ScheduleScoreSummary` (el desglose, una `dl` en `row` con `col-sm-5 col-md-4`) lo comparten el panel y la cabecera de `ScheduleDraftPage`.

Del tema ya existen `PageHeader`, `ListSection`, `.cs-card`, `.cs-eyebrow`, `.cs-tone-*`, `.cs-list-item`, `.cs-calendar-card` (franja superior con `::before`), `$day-panel-bg` y `.cs-feature-icon` (el cuadro de icono de la portada). La maqueta (`docsMIO/horarios.png`) muestra la página con el colegio listo y una generación completada. No muestra la generación en curso, fallida ni cancelada ni los problemas; se deducen del patrón.

Es un cambio solo de frontend y de presentación: sin backend, contrato, modelo de datos ni CSP, y por tanto sin impacto en el rendimiento de la generación ni en la seguridad (autenticación, permisos por rol y aislamiento por colegio intactos).

## Goals / Non-Goals

**Goals:**
- Llevar `/horarios` al diseño de la maqueta sin cambiar la lógica del panel ni de la comprobación.
- Que el estado de la generación se vea de un vistazo (insignia) y siempre con texto.
- `axe` limpio, sin desplazamiento horizontal a 360 y 1280 px y CSS bajo 33,75 kB en gzip.

**Non-Goals:**
- El chip y la tarjeta «Curso 2026 / 2027», «···» y «Configuración» (datos fijos o inexistentes).
- Las demás pantallas de horarios (US-UI-REST_b), formularios, carga horaria, disponibilidad y pantallas públicas.
- Cambiar el sondeo, la cancelación, el foco o los textos de los estados.

## Decisions

### D1. Una capacidad nueva con requisitos añadidos
`schedule-page-layout` solo añade presentación. No se reescriben (`MODIFIED`) los requisitos largos de `schedule-readiness` y `schedule-generation`, porque su comportamiento no cambia y copiarlos enteros arriesgaría perder detalle al archivar. Los `data-testid` de la página, del veredicto y del panel se conservan, así que las specs y los tests existentes siguen siendo ciertos.

### D2. Cabecera y contenedor
`Container as="main" fluid="xxl" className="py-4 py-lg-5 px-3 px-lg-4"` y `PageHeader` con `eyebrow` `schedule.readiness.eyebrow`, `titleId` `schedule-readiness-title` (hoy el `h1` no tiene `id`) y `description` = `schedule.readiness.intro`. Esa clave pierde su segunda frase («Cada problema lleva un enlace a donde se arregla.») en `es.json` y `en.json`: la maqueta no la tiene y cada problema ya muestra su enlace. Sin `titleRef` ni acciones: ninguna acción de la página devuelve el foco al título.

### D3. Veredicto
El `p role="status"` conserva su `data-testid`, su texto y su clase de color. Delante del texto va un `span.cs-verdict-icon` con el glifo de hoy (`✓` o `✕`, `aria-hidden`), un círculo de 2 rem: con `cs-tone-mint` si se puede generar y con `bg-danger-subtle` si no (el texto ya usa `text-danger-emphasis`). Se mantienen los glifos y no se añade un icono SVG: ya existen, son decorativos y no hace falta otro fichero.

### D4. El estado de una generación completada, en una sola función
`CompletedOffer` decide hoy, dentro del panel, si el horario de la generación es el borrador vigente, el oficial o ninguno. La insignia necesita la misma decisión, así que se extrae a `utils/generationStatus.ts`:
- `completedKind(generation, overview)` devuelve `'draft'`, `'official'` o `'gone'`, con la misma lógica de hoy (`overview === null` cuenta como borrador).
- `generationBadge(generation, overview)` devuelve `{ tone, key } | null` según la tabla de la spec, y `generationEyebrow(generation)` devuelve `'running'`, `'last'` o `null`.

`CompletedOffer` pasa a usar `completedKind`, de modo que el panel y la insignia no pueden discrepar. Son funciones puras con tests de tabla; el panel solo las pinta.
- **Alternativa descartada:** repetir los `if` en el JSX de la insignia. Duplicaría la regla y dejaría una insignia «Borrador listo» al lado del texto «Este borrador ya no existe» si alguna vez divergieran.

### D5. Tarjeta del panel
`section.card.card-body` pasa a `section.cs-card.cs-generation-card` (mismo `aria-labelledby`, `ref` y `data-testid`). La franja es el `::before` del mismo patrón que `.cs-calendar-card` (0,25 rem, `position: absolute`, `overflow: hidden`) con `linear-gradient(90deg, $brand, #f8c7b4)`; es decorativa y no lleva transición. La cabecera es un `div.cs-generation-header` (flex, `flex-wrap`, `justify-content: space-between`) con el sobretítulo (`p.cs-eyebrow mb-1`) y el `h2` a la izquierda y la insignia a la derecha.
- **Insignia:** `span.cs-status-badge` más un tono: `cs-tone-lavender`, `cs-tone-mint` o `cs-tone-yellow` (con contraste AA ya comprobado en el tema) o `bg-danger-subtle text-danger-emphasis` para «Sin horario». Pastilla (`border-radius: 999px`, 0,75 rem, 700). La marca `✓` decorativa solo va en las menta. Claves nuevas `schedule.generation.eyebrow.{running,last}` y `schedule.generation.badge.{running,improving,draft,official,gone,failed,cancelled}`.
- **Alternativa descartada:** el `Badge` de react-bootstrap. No tiene los tonos del tema y obligaría a elegir un `bg` de Bootstrap distinto del resto de pastillas.

### D6. Resultado de la generación completada
- **Línea de sesiones:** `Trans` con `i18nKey="schedule.generation.completed"` y `count`, y un componente `<count>` que pinta un `span.cs-highlight` (color primario). Las claves `completed_one` y `completed_other` pasan a «Horario borrador generado: `<count>`{{count}} sesión(es) colocada(s)`</count>`». `count` es un número del servidor, no texto libre, así que no hay riesgo de que se interprete HTML.
- **Desglose:** `ScheduleScoreSummary` conserva su `section aria-label` y su `dl` con las mismas etiquetas, pero la `dl` pasa de `row` y `col-*` a `.cs-score-list`: una rejilla de dos columnas (`minmax(0, 12.5rem) 1fr`) desde `sm` y una columna por debajo. Las etiquetas (`dt`) van en texto secundario y normal, y los valores (`dd`) en negrita. En la penalización solo el número va en negrita: `schedule.score.penalty.value` y `.valueWithInitial` pasan a «`<total>`{{total}}`</total>` (cuanto menos, mejor)» con `Trans`. El texto completo del `dd` no cambia, así que los tests que lo leen no se ven afectados. Lo usa también `ScheduleDraftPage`, donde el resultado visual es el mismo.
- **Recuadro:** `div.cs-callout` con el fondo `$day-panel-bg` (la variable ya definida en `_lists.scss`), relleno de 1 rem y radio del tema. Contiene la nota (`completedNote`) y, en una fila con `gap`, «Ver horario» (el `Link` de hoy) y «Confirmar como oficial» (`Button variant="success" size="sm"`, solo `ADMIN`). Los otros dos casos de `CompletedOffer` (oficial y borrador desaparecido) usan el mismo recuadro.
- **Botón de generar:** `Button` con `className="cs-generate-button d-inline-flex align-items-center gap-2"` y, delante, `CalendarDaysIcon` (decorativo, 16 px). `.cs-generate-button` añade `box-shadow: 0 0.5rem 1rem rgba($brand, 0.25)` y `:disabled` la quita. El nombre accesible sigue siendo el texto.

### D7. Tarjetas de cifras
`components/ScheduleScoreStats.tsx` (presentacional): recibe `score` y pinta `Row xs={1} md={3} className="g-3 mb-4" aria-hidden="true"` con tres `Col` > `div.cs-card.cs-stat-card`:
- un `span.cs-feature-icon.cs-tone-*` con el icono (`UsersRoundIcon` lavanda, `CircleAlertIcon` melocotón y `SlidersHorizontalIcon` menta, este último ya existente);
- `p.cs-stat-value` (1,5 rem, 800) con la cifra;
- `p.cs-stat-label` (0,75 rem, texto secundario, que da 5,59:1 sobre blanco).

La penalización es `score.total` (la actual). Claves nuevas `schedule.score.stats.{gaps,consecutive,penalty}`. `ScheduleGenerationPanel` pasa a devolver un fragmento: la tarjeta y, justo después, `ScheduleScoreStats` solo con `generation.status === 'COMPLETED'` y `score !== null`. Va fuera de la tarjeta, como en la maqueta, y conserva el `data-testid` de la tarjeta.
- **Por qué `aria-hidden`:** las tres cifras repiten el desglose de la tarjeta; sin ocultarlas, un lector de pantalla las leería dos veces. No contienen controles ni nada que no esté ya en el desglose. Los tests de texto que buscaban una cifra con `getByText` encontrarían dos elementos: pasan a buscar dentro de la región del desglose (`within`), con la misma intención.
- **Alternativa descartada:** quitar el desglose de la tarjeta y dejar solo las tarjetas. El desglose lo comparte la página del borrador y trae «Franjas preferidas», que la maqueta no tiene en las tarjetas.
- **Alternativa descartada:** hacer las tarjetas legibles y ocultar el desglose. El desglose es el que lleva la aclaración «(antes de mejorar: …; cuanto menos, mejor)».

### D8. Problemas
Cada grupo es `ListSection` (`framed`) con `title` (el texto con el recuento de hoy), `titleId` (`BLOCKING_ID`/`WARNINGS_ID`), sin `count`, con una `ul.list-unstyled.mb-0` con `aria-labelledby`. Cada grupo va en un `div.mb-4`. `ReadinessIssueItem` cambia su `li` de `mb-2` a `cs-list-item` y conserva su marcado interno (insignia, texto y enlaces). Las insignias de Bootstrap (`danger` y `warning`) se mantienen: tienen texto y contraste.

### D9. Estilos
`styles/_schedule.scss`, importado en `theme.scss` tras `home`, con `.cs-verdict-icon`, `.cs-generation-card` (y su franja), `.cs-generation-header`, `.cs-status-badge`, `.cs-highlight`, `.cs-callout`, `.cs-score-list`, `.cs-generate-button` y `.cs-stat-card`/`-value`/`-label`. No añade transiciones. `theme.test.ts` comprueba el contraste de la insignia de peligro, que el texto del resaltado y de la etiqueta de las tarjetas llega a 4,5:1, el tamaño mínimo de 12 px de la etiqueta de las tarjetas y que la franja y el círculo se hacen con CSS (`::before` y `border-radius`), y que no hay `transition` ni `transform` fuera de `prefers-reduced-motion: no-preference` (el test existente ya lo vigila desde `.cs-card`).

### D10. Iconos
`components/icons/CircleAlertIcon.tsx` es nuevo (Lucide, ISC, ya atribuido en `LUCIDE-LICENSE.txt`). El resto de iconos ya existen.

## Risks / Trade-offs

- [**Tests de texto con cifras:** los tests del panel que buscan «51» con `getByText` encontrarán dos elementos] → Pasan a `within(region)` del desglose; el resto de aserciones no cambia.
- [**`Trans` en la penalización:** el texto del `dd` podría partirse en varios nodos] → `toHaveTextContent` sigue funcionando; un test lee el `dd` entero con y sin «antes de mejorar».
- [**Fragmento en el panel:** el panel deja de tener un único elemento raíz] → Los tests que usan `container.firstChild` se revisan; el `data-testid` sigue en la tarjeta.
- [**Estados no diseñados:** en curso, fallida, cancelada y problemas se deducen] → Se conserva su contenido y su lógica; solo cambia el contenedor. Si hay maqueta de esos estados, se ajusta en un cambio pequeño.
- [**Contraste de la insignia «Sin horario»:** el rojo suave de Bootstrap no está en los tonos del tema] → Se calcula en `theme.test.ts` con la pareja real (`--bs-danger-bg-subtle` y `--bs-danger-text-emphasis`).
- [**Cuatro anchuras:** la fila de tarjetas y el desglose cambian de columnas] → El E2E mide 360 y 1280 px con el panel completado, y los tests unitarios a 360 y 1280 px con `describe.each` donde cambia el marcado.
- [**CSS:** estilos nuevos] → Se mide el gzip antes y después y se anota; el límite es 33,75 kB.

## Migration Plan

Despliegue normal del frontend por CD tras integrar la PR. No hay datos ni contrato que migrar, y la vuelta atrás es revertir la PR.

## Open Questions

Ninguna. La captura no muestra los estados en curso, fallida y cancelada ni las listas de problemas; el diseño los deduce y la persona usuaria los revisa en producción.
