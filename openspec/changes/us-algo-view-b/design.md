## Context

US-ALGO-VIEW dejó en el navegador todo lo necesario para pintar el horario borrador: `GET /api/schedule/draft` devuelve el borrador normalizado, `utils/scheduleDraftViews.ts` (pura) lo convierte en `DraftTable` (`indexDraft`, `classView`, `professorView`, `schoolDayView`) y `components/ScheduleGrid.tsx` las pinta. La página `pages/ScheduleDraftPage.tsx` deriva la vista y la clase o el profesor elegidos de la URL (`utils/scheduleDraftParams.ts`). Los colores de las asignaturas viven en `utils/subjectColors.ts` (`SUBJECT_COLOR_STYLES`, contraste AA comprobado por test).

La CSP de la SPA (`frontend/content-security-policy.json`) es estricta: `default-src 'self'`, `style-src 'self'`, `img-src 'self' data:`. No hay ninguna librería de documentos en el frontend ni código de descarga. Hay un patrón de diálogos con `react-bootstrap/Modal` (`DeleteCourseModal`, `ConfirmSuspendModal`…).

US-ALGO-VIEW_b (ficha enriquecida el 2026-11-05) pide exportar en Markdown o HTML, por clase o por profesor, uno o todos, para los dos roles.

## Goals / Non-Goals

**Goals:**

- Exportar sin backend, sin dependencias y sin tocar la CSP, a partir de las mismas tablas que se ven en pantalla.
- Un núcleo puro y completamente testeable (el documento como texto), separado del diálogo y de la descarga.
- Documentos seguros con cualquier nombre que haya escrito el colegio.

**Non-Goals:**

- PDF, CSV o Excel; la vista del colegio por día; elegir varios horarios sueltos; el aviso de borrador desfasado; el horario oficial (US-ALGO-CONFIRM); generar en el servidor.

## Decisions

### D1. Todo en el navegador, sobre `classView` y `professorView`

El documento se construye con las mismas funciones que la pantalla, así que exportar y ver no pueden divergir (los desfases salen igual sin reglas nuevas). **Alternativas descartadas:** un endpoint `GET /api/schedule/draft/export` (duplicaría en el backend la construcción de las tablas, añadiría contrato, rol y pruebas para dar lo mismo que el navegador ya tiene) y reconstruir las tablas desde las entradas en el módulo de exportación (dos fuentes de verdad).

**Capas:** es solo frontend. `utils/scheduleExport.ts` es lógica pura (como `scheduleDraftViews.ts`), `utils/download.ts` es el único punto que toca el DOM y `ScheduleExportModal` es presentación. El módulo puro depende de `scheduleDraftViews.ts` y de `subjectColors.ts`, nunca al revés.

### D2. El documento como texto, con un modelo intermedio común

`exportSchedule({ index, format, kind, target, t, locale })` → `{ fileName, mimeType, content }`. Por dentro, primero se arma un modelo neutro (título, fecha, una lista de apartados con su subtítulo, «N sesiones a la semana», sus tablas `DraftTable`, la lista «sin calendario») y luego `toMarkdown` o `toHtml` lo serializan. Así el contenido (qué apartados, en qué orden, qué textos) se prueba una vez y cada formato solo decide cómo se escribe.

Recibe `t` (`TFunction` de i18next) y el idioma (`locale`) en lugar de importar `i18n`: es puro y los tests le pasan el español o el inglés. El nombre del día sale de `slots.grid.days.*` (como `ScheduleGrid`) y el resto de textos de `schedule.draft.*` (reutilizados: «Libre», «Sin profesor», «Sesión N», recreo, fuera del calendario, sin calendario) y de `schedule.export.*` (nuevos: títulos, prefijos de fichero, diálogo).

**Alternativa descartada:** renderizar `ScheduleGrid` con `renderToStaticMarkup` para el HTML. Arrastraría `react-dom/server` al bundle, dependería de las clases de Bootstrap (que no viajan en un fichero autónomo) y de `useMediaQuery` (días abreviados en el móvil), y no serviría para el Markdown.

### D3. Escapado en cada formato, en un solo sitio

- **HTML:** `escapeHtml` cambia `& < > " '` por sus entidades y se aplica a **todo** texto que entra en el documento, incluidos los textos de i18n y los atributos (`lang`, `title`). Los colores salen de la tabla cerrada `SUBJECT_COLOR_STYLES` por clave del enum, nunca de un dato libre.
- **Markdown:** `escapeMarkdown` antepone `\` a `\ | * _ ` [ ] < >` y cambia `\r\n`, `\n` y `\r` por un espacio. En GFM `\|` dentro de una celda es un carácter, así que la fila no se rompe; `<` escapado impide que un nombre se interprete como HTML en los visores que lo admiten.

**Alternativa descartada:** quitar los caracteres problemáticos. Cambiaría los nombres que el colegio escribió.

### D4. HTML autónomo con un único `<style>`

Un fichero `.html` descargado se abre como fichero local: la CSP de la SPA no le aplica, pero el documento debe valer sin conexión y sin nada externo. Lleva un `<style>` en la cabecera (tabla con bordes, tipografía del sistema, `caption` visible como título de cada tabla, `@page { size: A4 landscape }`, `section + section { break-before: page }` y `print-color-adjust: exact` / `-webkit-print-color-adjust: exact`) y el color de cada celda en su atributo `style` (`background-color` y `color` de `SUBJECT_COLOR_STYLES`). Sin scripts, fuentes, imágenes ni enlaces.

**Alternativa descartada:** clases por color en el `<style>` (`.c-blue`). Es más compacto, pero el atributo `style` es lo que mejor conserva el color al copiar una tabla o abrirla en otros programas; el tamaño no es un problema (D7).

### D5. Nombres de fichero y fecha

`fileNameOf` normaliza con `normalize('NFD')` y `\p{M}` (como `courseSearch.ts`), cambia `º`→`o` y `ª`→`a` antes, todo lo que no sea `[a-z0-9]` por `-` y recorta guiones. Uno: `<prefijo>-<curso clase>` o `<prefijo>-<apellidos nombre>`; todos: `<prefijo>-AAAA-MM-DD` con la fecha **de generación** del borrador en hora local (decisión de la persona usuaria: dos descargas del mismo borrador se llaman igual). Si el nombre normalizado quedara vacío (un nombre solo con símbolos), se usa el prefijo con la fecha de generación, y nunca un id, para no exponer ids en un fichero que se reparte.

### D6. El diálogo recibe su estado inicial; la página no cambia de forma

`ScheduleDraftPage` ya calcula la selección efectiva (`selectionFromParams`: vista, clase y profesor válidos). Pasa al diálogo `initial = { kind, target }` derivado de ella (vista del colegio → `{ kind: 'class', target: 'all' }`) y además la clase y el profesor elegidos, para que el cambio de tipo (por clase ↔ por profesor) vaya a lo que se ve en la página. Las listas de «Cuál» salen del índice (`draft.courses` con sus clases y `draft.professors`, ya ordenados por el backend). El diálogo guarda su estado en `useState` mientras está abierto y se reinicia al abrirlo (se monta solo con `show`), sin URL ni almacenamiento.

«Exportar» va en la fila del selector de vista (el `div` con `flex-wrap` de la corrección de 360 px), como `Button variant="outline-secondary"`, y solo se pinta con el borrador cargado.

### D7. Descarga con `Blob` y `<a download>`

`downloadFile` crea el `Blob` con el `mimeType`, un `<a>` con `href = URL.createObjectURL(blob)` y `download = fileName`, lo añade al `body`, hace `click()`, lo quita y revoca la URL en el siguiente turno (`setTimeout(…, 0)`, para no cortar la descarga en algunos navegadores). La navegación a `blob:` desde un `a[download]` no la regula ninguna directiva de la CSP actual; se comprueba en el E2E contra `vite preview`, que la aplica.

**Rendimiento:** un colegio de 24 clases y unas 1000 sesiones da un documento de unos cientos de KB; se genera al pulsar «Descargar» (no en cada render) y tarda milisegundos.

**Seguridad:** nada sale del navegador, no hay log, el colegio sigue saliendo de la sesión al leer el borrador (US-ALGO-VIEW) y el documento solo contiene lo que el usuario ya ve.

### D8. Modelo de datos y contrato

Sin cambios: ni tablas, ni migraciones, ni `docs/api-spec.yml`, ni tipos generados.

## Risks / Trade-offs

- [Un visor de Markdown que no sea GFM no pinta las tablas] → se acepta: GFM es el formato habitual (GitHub, editores, la mayoría de visores) y el HTML cubre a quien quiere una tabla con formato.
- [Descarga en iOS: Safari puede abrir el fichero en lugar de guardarlo] → se acepta; el usuario puede guardarlo desde «Compartir».
- [El navegador ignora `@page` o los colores al imprimir] → `print-color-adjust: exact` y `-webkit-` cubren Chrome, Edge, Firefox y Safari actuales; si el usuario desactiva «gráficos de fondo» al imprimir, el nombre de la asignatura sigue identificando la celda.
- [Los textos del documento dependen de i18n y cambiar una clave cambia los ficheros] → los tests comparan con los textos de `es.json`, no con literales duplicados, salvo los nombres de fichero, que se fijan en el test.
- [Un borrador desfasado se exporta tal cual] → decisión de la persona usuaria; el aviso llegará con su propia historia.

## Migration Plan

Solo frontend: se despliega con el pipeline habitual (S3 + CloudFront). Sin migraciones; volver atrás es revertir el commit.

## Open Questions

Ninguna: las decisiones abiertas se cerraron en la exploración del 2026-11-05.

### D9. Un horario solo o varios

El modelo intermedio tiene siempre una lista de apartados. Si el documento es de un solo horario (una clase o un profesor), su título es el del horario y el apartado no repite el suyo; si son varios, el título es el general y cada apartado lleva el suyo. Los formatos derivan los niveles de título de eso: en Markdown `#` el documento, `##` cada horario y `###` cada calendario de un profesor con varios; en un documento de un solo horario, los calendarios van en `##`.
