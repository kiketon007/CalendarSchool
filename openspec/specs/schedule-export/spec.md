# schedule-export Specification

## Purpose
TBD - created by archiving change us-algo-view-b. Update Purpose after archive.
## Requirements
### Requirement: Diálogo «Exportar horario»
`components/ScheduleExportModal.tsx` MUST ser un `Modal` titulado «Exportar horario» con tres campos: **Formato** (radios en un `fieldset` con `legend`: «Markdown (.md)» o «HTML (.html)»), **Horarios** (radios: «Por clase» o «Por profesor») y **Cuál** (un `select`). Con «Por clase», «Cuál» MUST ofrecer «Todas las clases» y las clases agrupadas por curso (`optgroup`) en el orden del selector de la página; con «Por profesor», «Todos los profesores» y los profesores por apellidos y nombre. Si el borrador no tiene ningún profesor, «Por profesor» MUST estar deshabilitado con su explicación. El diálogo MUST arrancar con lo que se está viendo: desde la vista por clase, «Por clase» y la clase elegida; desde la vista por profesor, «Por profesor» y el profesor elegido; desde la vista del colegio, «Por clase» y «Todas las clases»; el formato empieza en Markdown. Al cambiar de «Por clase» a «Por profesor» (o al revés), «Cuál» MUST pasar a la clase o al profesor elegidos en la página. «Descargar» MUST generar el documento, descargarlo y cerrar el diálogo; «Cancelar» y Escape MUST cerrarlo sin descargar; al cerrarse, el foco MUST volver a «Exportar». El diálogo MUST NOT tocar la URL ni guardar nada en el almacenamiento del navegador.

#### Scenario: Arranca con el profesor que se está viendo
- **GIVEN** la vista por profesor con Eva García elegida
- **WHEN** pulso «Exportar»
- **THEN** el diálogo tiene «Markdown (.md)», «Por profesor» y «García, Eva»

#### Scenario: Arranca con la clase que se está viendo
- **GIVEN** la vista por clase con 1º Primaria B elegida
- **WHEN** pulso «Exportar»
- **THEN** el diálogo tiene «Por clase» y «1º Primaria B»

#### Scenario: Desde la vista del colegio
- **GIVEN** la vista de todo el colegio
- **WHEN** pulso «Exportar»
- **THEN** el diálogo tiene «Por clase» y «Todas las clases»

#### Scenario: Cambiar de tipo
- **GIVEN** el diálogo con «Por clase» y la página con Eva como profesora elegida
- **WHEN** elijo «Por profesor»
- **THEN** «Cuál» pasa a «García, Eva»

#### Scenario: Sin profesores
- **GIVEN** un borrador cuyos profesores se borraron todos después de generar
- **WHEN** abro el diálogo
- **THEN** «Por profesor» está deshabilitado y leo por qué

#### Scenario: Cancelar
- **WHEN** pulso «Cancelar» o Escape
- **THEN** el diálogo se cierra sin descargar nada y el foco vuelve a «Exportar»

### Requirement: Contenido de un horario exportado
`utils/scheduleExport.ts` (pura, sin React) MUST construir el documento a partir de `classView` y `professorView`, con el mismo contenido que se ve en pantalla. Cada horario MUST llevar su título («Horario de 1º Primaria A» o «Horario de García, Ana»), «Borrador generado el …» en un borrador o «Horario oficial confirmado el …» en un oficial (fecha y hora con `Intl.DateTimeFormat` en el idioma de la interfaz) y «N sesiones a la semana», y una tabla por calendario: una para una clase; una por cada calendario en el que da clase un profesor, con el nombre del calendario. Cada tabla MUST tener una columna «Sesión» y los cinco días con su nombre completo, una fila por sesión («Sesión 1 (09:00–09:45)») y los recreos como fila («Recreo 10:30–11:00») con las celdas vacías. Cada celda con sesión MUST llevar la asignatura (con su código entre paréntesis si lo tiene) y, por clase, el profesor («García, Ana» o «Sin profesor»); por profesor, la clase («1º Primaria · A»). Una franja sin sesión MUST decir «Libre». Los desfases MUST exportarse tal cual, sin aviso: las sesiones fuera del calendario actual se listan bajo la tabla con «Sesiones fuera del calendario actual», y un curso sin calendario dice «Este curso ya no tiene calendario» con sus sesiones listadas por día y las horas guardadas. Con «todos», el documento MUST llevar un título general («Horarios de las clases» o «Horarios de los profesores»), esa fecha una vez y un apartado por clase (orden de cursos y clases) o por profesor (por apellidos y nombre); las entradas sin profesor MUST NOT aparecer en ningún profesor. El documento MUST estar en el idioma de la interfaz.

#### Scenario: Una clase
- **GIVEN** 1º Primaria A con 30 sesiones en un calendario de 6 sesiones y un recreo
- **WHEN** exporto su horario
- **THEN** el documento tiene «Horario de 1º Primaria A», la fecha de generación, «30 sesiones a la semana» y una tabla con la columna «Sesión», los cinco días, 6 filas de sesión, la fila del recreo y 30 celdas con asignatura y profesor

#### Scenario: Huecos libres
- **GIVEN** una clase con 25 sesiones para 30 franjas
- **WHEN** exporto su horario
- **THEN** 5 celdas dicen «Libre»

#### Scenario: Profesor con dos calendarios
- **GIVEN** Luis, con clase en 4º («Primaria») y en 5º («Tercer ciclo»)
- **WHEN** exporto su horario
- **THEN** el documento tiene dos tablas, cada una con el nombre de su calendario, y en cada celda la asignatura y la clase

#### Scenario: Todos los profesores
- **GIVEN** un borrador con 8 profesores
- **WHEN** exporto «Todos los profesores»
- **THEN** el documento tiene «Horarios de los profesores», la fecha una vez y 8 apartados en orden de apellidos

#### Scenario: Desfases tal cual
- **GIVEN** un profesor borrado tras generar, un curso sin calendario y una sesión fuera del calendario actual
- **WHEN** exporto «Todas las clases»
- **THEN** leo «Sin profesor» en esas celdas, «Este curso ya no tiene calendario» con sus sesiones por día y «Sesiones fuera del calendario actual» con la sesión

#### Scenario: El documento del oficial
- **GIVEN** el horario oficial confirmado el 5 de noviembre
- **WHEN** lo exporto desde `/horarios/oficial`
- **THEN** el documento dice «Horario oficial confirmado el …» con esa fecha, no «Borrador generado el …», y el nombre del fichero es el mismo que el de un borrador

### Requirement: Formato Markdown
El documento Markdown MUST usar `#` para el título del documento (en el de un solo horario, el título del horario), `##` para cada horario cuando son varios y, para cada calendario de un profesor con más de uno, `###` si hay varios horarios o `##` si es uno solo, con tablas GFM. En el texto de los nombres (asignaturas, códigos, cursos, clases, profesores y calendarios) MUST escaparse `\`, `|`, `*`, `_`, `` ` ``, `[`, `]`, `<` y `>`, y los saltos de línea MUST cambiarse por un espacio, para que ningún nombre rompa una tabla ni se interprete como formato o HTML. El Markdown no lleva color.

#### Scenario: Una tabla Markdown
- **WHEN** exporto una clase en Markdown
- **THEN** la tabla empieza por `| Sesión | Lunes | Martes | Miércoles | Jueves | Viernes |`, sigue con su fila separadora y tiene una fila por sesión y por recreo

#### Scenario: Un nombre que no rompe la tabla
- **GIVEN** una asignatura llamada `Lengua | <b>Taller</b>`
- **WHEN** exporto en Markdown
- **THEN** cada fila sigue teniendo seis columnas y el nombre se lee tal cual, como texto

### Requirement: Formato HTML autónomo
El documento HTML MUST ser autónomo: `<!doctype html>`, `<html lang>` con el idioma de la interfaz, `<meta charset="utf-8">`, `<title>` y un único `<style>` en la cabecera, sin scripts, fuentes, imágenes, hojas de estilo ni enlaces externos. Cada tabla MUST tener `caption`, `th scope="col"` en los días y `th scope="row"` en las sesiones, bordes, y cada celda con sesión el fondo y el texto de `SUBJECT_COLOR_STYLES` de su asignatura. Para imprimir MUST declarar `@page { size: A4 landscape }`, un salto de página entre horarios y `print-color-adjust: exact`. Todo texto MUST escaparse (`&`, `<`, `>`, `"` y `'`); el documento MUST construirse como texto, nunca con `innerHTML` ni con el DOM de la página.

#### Scenario: Colores e impresión
- **WHEN** exporto todos los profesores en HTML
- **THEN** el documento se abre sin conexión, cada celda con sesión tiene el fondo del color de su asignatura y, al imprimir, cada profesor empieza en una página A4 horizontal

#### Scenario: Nada externo ni ejecutable
- **WHEN** exporto en HTML
- **THEN** el documento no contiene `<script`, `<link`, `<img`, `@import` ni `url(`, y tiene `lang`, `title` y una `caption` por tabla

#### Scenario: Un nombre con etiquetas
- **GIVEN** una asignatura llamada `Lengua | <b>Taller</b>`
- **WHEN** exporto en HTML
- **THEN** el documento contiene `Lengua | &lt;b&gt;Taller&lt;/b&gt;` y ningún elemento `<b>`

### Requirement: Nombres de fichero
El fichero de un horario MUST llamarse `horario-<nombre>.<ext>` (`horario-1o-primaria-a.md`, `horario-garcia-ana.html`, con el profesor por apellidos y nombre) y el de todos `horarios-clases-AAAA-MM-DD.<ext>` o `horarios-profesores-AAAA-MM-DD.<ext>`, con la **fecha de generación del borrador** en hora local. El nombre MUST normalizarse: minúsculas, sin tildes (NFD), `º` como `o` y `ª` como `a`, cualquier otro carácter que no sea letra ASCII o cifra como `-`, sin guiones repetidos ni en los extremos. Los prefijos MUST salir de i18n (en inglés, `timetable-…` y `timetables-…`).

#### Scenario: Una clase
- **WHEN** exporto 1º Primaria A en Markdown
- **THEN** el fichero se llama `horario-1o-primaria-a.md`

#### Scenario: Un profesor con tildes
- **WHEN** exporto a José María García-López en HTML
- **THEN** el fichero se llama `horario-garcia-lopez-jose-maria.html`

#### Scenario: Todos
- **GIVEN** un borrador generado el 5 de noviembre de 2026
- **WHEN** exporto todas las clases en Markdown
- **THEN** el fichero se llama `horarios-clases-2026-11-05.md`

### Requirement: Descarga en el navegador
`utils/download.ts` MUST descargar el documento con un `Blob` (`text/markdown;charset=utf-8` o `text/html;charset=utf-8`), `URL.createObjectURL`, un `<a download>` temporal que se quita al usarlo y `URL.revokeObjectURL` después. Exportar MUST NOT hacer ninguna petición a la API ni escribir en el log, y MUST NOT necesitar cambios en la CSP.

#### Scenario: Sin peticiones
- **GIVEN** el borrador ya cargado
- **WHEN** exporto cualquier horario
- **THEN** no se hace ninguna petición y se descarga un fichero con el nombre y el tipo que tocan

### Requirement: Accesibilidad, móvil e i18n de la exportación
El diálogo MUST manejarse con teclado (el foco entra en él, Escape lo cierra y el foco vuelve a «Exportar»), caber a 360 px sin desplazamiento horizontal de la página y no dar violaciones de `axe`. Todos los textos del diálogo y de los documentos MUST salir de `schedule.export.*` y `schedule.draft.*` de `es.json` y `en.json`.

#### Scenario: Teclado y axe
- **WHEN** abro el diálogo con el teclado
- **THEN** el foco está dentro, Escape lo cierra, el foco vuelve a «Exportar» y `axe` no da violaciones

#### Scenario: Móvil
- **WHEN** abro el diálogo a 360 px
- **THEN** cabe sin desplazar la página en horizontal

### Requirement: Exportar de extremo a extremo
Un E2E con Cypress MUST generar un borrador, abrir `/horarios/borrador`, exportar una clase en Markdown y todos los profesores en HTML y leer los ficheros descargados (`cy.readFile` en `cypress/downloads`), repetirlo como `MEMBER` y abrir el diálogo a 360 px, contra `vite preview` con la CSP aplicada.

#### Scenario: Descargar y leer los ficheros
- **WHEN** exporto 1º Primaria A en Markdown y todos los profesores en HTML
- **THEN** existen `horario-1o-primaria-a.md` y `horarios-profesores-<fecha>.html` con sus tablas y sus nombres

