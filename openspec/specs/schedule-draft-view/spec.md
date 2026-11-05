# schedule-draft-view Specification

## Purpose
TBD - created by archiving change us-algo-view. Update Purpose after archive.
## Requirements
### Requirement: Contrato de la lectura del borrador en OpenAPI
`docs/api-spec.yml` MUST definir, bajo el tag `Schedule`, `GET /api/schedule/draft` (`ADMIN` y `MEMBER`, `Cache-Control: no-store`) con `200` y `{ schedule: ScheduleDraft | null }`, `401` sin sesión y `503` si la base de datos no responde, sin códigos de error nuevos. Los esquemas MUST ser:
- `ScheduleDraft`: `id`, `status` (`DRAFT`), `generatedAt`, `placedSessions`, `courses`, `subjects`, `professors` y `entries`;
- `ScheduleDraftCourse`: `id`, `name`, `calendar` (`{ id, name, periods }` con los periodos del esquema de calendarios, o `null`) y `classes` (`{ id, name }`);
- `ScheduleDraftSubject`: `id`, `name`, `code` (texto o `null`) y `color` (enum `SubjectColor`);
- `ScheduleDraftProfessor`: `id`, `firstName` y `lastName`;
- `ScheduleDraftEntry`: `courseId`, `classId`, `subjectId`, `professorId` (o `null`), `dayOfWeek` (1 a 5), `sessionNumber`, `startTime` y `endTime` (`HH:MM`, como los periodos de los calendarios; en la base de datos son minutos).
Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Tipos generados al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias

### Requirement: Leer el borrador del colegio
`GET /api/schedule/draft` MUST devolver el borrador (`DRAFT`) del colegio de la sesión, que es como mucho uno, o `null` si no hay ninguno, en una sola lectura sin bloqueos ni escrituras y sin evento de log. La respuesta MUST estar **normalizada**: las entradas solo llevan ids, y `courses`, `subjects` y `professors` contienen solo lo que aparece en alguna entrada (un curso con su calendario **actual** y solo sus clases con entradas). Cursos, clases, asignaturas y profesores MUST ir ordenados por nombre con `compareText` (los profesores por apellidos y nombre) y las entradas por clase, día y sesión. El colegio MUST salir de la sesión; un `schoolId` en la consulta se ignora.

#### Scenario: Colegio con borrador
- **GIVEN** un colegio con un borrador de 2 clases y 4 sesiones
- **WHEN** se pide `GET /api/schedule/draft`
- **THEN** responde `200` con `no-store`, el borrador con sus 4 entradas, sus cursos, clases, asignaturas y profesores, cada uno una vez

#### Scenario: Colegio sin borrador
- **GIVEN** un colegio que nunca ha generado, o cuya única generación falló
- **WHEN** se pide el borrador
- **THEN** responde `200` con `{ schedule: null }`

#### Scenario: Profesor borrado después de generar
- **GIVEN** un borrador y, después, se borra a uno de sus profesores
- **WHEN** se pide el borrador
- **THEN** sus entradas siguen, con `professorId: null`, y él no está en `professors`

#### Scenario: Curso sin calendario después de generar
- **GIVEN** un borrador y, después, se quita el calendario de uno de sus cursos
- **WHEN** se pide el borrador
- **THEN** ese curso sale con `calendar: null` y sus entradas con las horas guardadas

#### Scenario: Aislamiento por colegio
- **GIVEN** un borrador del colegio A
- **WHEN** un usuario del colegio B pide `GET /api/schedule/draft?schoolId=<A>`
- **THEN** recibe el suyo o `null`, nunca el de A

#### Scenario: Sin sesión o sin base de datos
- **WHEN** se pide sin token, o la base de datos no responde
- **THEN** responde `401` con `WWW-Authenticate: Bearer`, o `503`

### Requirement: Servicio del borrador en el frontend
`services/scheduleDraftService.ts` (`get`, con `authorizedFetch`) MUST devolver `loaded` (con el borrador o `null`), `unauthenticated` o `unavailable`, MUST NOT lanzar y MUST validar la forma: los enums de color y de periodo, los días de 1 a 5, horas `HH:MM` con el inicio antes del fin, y que cada entrada apunte a un curso, una clase de ese curso, una asignatura y, si no es `null`, un profesor de la respuesta. Cualquier otra forma es `unavailable`.

#### Scenario: Respuesta incoherente
- **WHEN** una entrada apunta a una asignatura que no está en `subjects`
- **THEN** el servicio devuelve `unavailable`

### Requirement: Página del horario borrador
`/horarios/borrador` (`pages/ScheduleDraftPage.tsx`, bajo `AuthenticatedLayout` sin `RequireRole`, para `ADMIN` y `MEMBER`) MUST pedir el borrador una sola vez por visita (también con `StrictMode`), mostrar un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. Con borrador MUST mostrar «Borrador», la fecha de generación, un selector de vista («Por clase», «Por profesor», «Todo el colegio») y el botón «Exportar» (ver la capacidad `schedule-export`). Sin borrador MUST decir «Todavía no hay ningún horario generado» con un enlace a `/horarios`, sin «Exportar»; tampoco hay «Exportar» mientras carga ni tras un fallo. Las tres vistas MUST construirse en el navegador desde la misma respuesta: cambiar de vista, clase, profesor o día MUST NOT hacer peticiones. No hay acciones de escritura y exportar está al alcance de los dos roles, así que un `MEMBER` ve lo mismo que un `ADMIN`.

#### Scenario: Abrir el borrador
- **GIVEN** un borrador generado
- **WHEN** abro `/horarios/borrador`
- **THEN** veo «Borrador», la fecha de generación, «Exportar» y la vista por clase con la primera clase del primer curso

#### Scenario: Sin borrador
- **WHEN** abro `/horarios/borrador` en un colegio que nunca ha generado
- **THEN** leo «Todavía no hay ningún horario generado» y un enlace a «Generar horarios», y no hay «Exportar»

#### Scenario: Fallo al cargar
- **WHEN** la petición falla
- **THEN** veo un aviso con «Reintentar», que vuelve a pedirla, y no hay «Exportar»

#### Scenario: Miembro
- **WHEN** un `MEMBER` abre la página
- **THEN** ve las tres vistas y «Exportar» igual que un `ADMIN`

### Requirement: Tabla del horario
`components/ScheduleGrid.tsx` MUST pintar una tabla de solo lectura con un `caption`, los cinco días en columnas (`th scope="col"`, abreviados L, M, X, J, V por debajo de 768 px) y los periodos del calendario del curso en filas (`th scope="row"` con el número de sesión y sus horas), con los recreos como fila de separación sin celdas. Cada entrada se coloca por día y número de sesión. Una celda MUST mostrar la asignatura con su nombre y su código si lo tiene, y el profesor o la clase según la vista, sobre el fondo y con el texto del color de la asignatura (`SUBJECT_COLOR_STYLES`, contraste AA); **el color nunca es la única pista**, porque el nombre de la asignatura está siempre escrito. No hay una imagen con el nombre del color en cada celda, para no saturar a un lector de pantalla. Una franja sin sesión MUST decir «Libre» y una entrada sin profesor, «Sin profesor». Las entradas cuya sesión no existe en el calendario actual MUST listarse debajo de la tabla como «Sesiones fuera del calendario actual». Los nombres se pintan como texto.

#### Scenario: Huecos libres
- **GIVEN** una clase con 25 sesiones para 30 franjas
- **WHEN** veo su tabla
- **THEN** 5 celdas dicen «Libre»

#### Scenario: Sin profesor
- **GIVEN** una entrada con `professorId: null`
- **THEN** su celda dice «Sin profesor»

#### Scenario: El calendario perdió sesiones
- **GIVEN** una entrada de la sesión 6 y un calendario que ahora tiene 5
- **THEN** la entrada sale debajo de la tabla, en «Sesiones fuera del calendario actual», con su día y sus horas guardadas

### Requirement: Vista por clase
La vista por clase MUST ofrecer un selector de clase agrupado por curso (`optgroup`) y la tabla de la clase elegida, con la asignatura y el profesor en cada celda y «N sesiones a la semana» debajo. Si el curso **ya no tiene calendario**, MUST decir «Este curso ya no tiene calendario» y listar las sesiones de la clase por día con las horas guardadas en cada entrada.

#### Scenario: Una clase del borrador
- **GIVEN** un borrador de 12 clases de 30 sesiones con un calendario de 6 sesiones y un recreo
- **WHEN** elijo «1º Primaria A»
- **THEN** veo su tabla de lunes a viernes con las seis sesiones con sus horas y el recreo, 30 celdas con asignatura y profesor y «30 sesiones a la semana»

#### Scenario: Curso sin calendario
- **GIVEN** que después de generar se quitó el calendario de 2º Primaria
- **WHEN** elijo una de sus clases
- **THEN** leo «Este curso ya no tiene calendario» y sus sesiones por día con sus horas

### Requirement: Vista por profesor
La vista por profesor MUST ofrecer un selector de los profesores del borrador (por apellidos y nombre) y **una tabla por cada calendario** de los cursos en los que da clase, cada una con el nombre del calendario en su título y sus propias sesiones y horas, con la asignatura y la clase («Inglés · 1º Primaria A») en cada celda y «N sesiones a la semana» debajo. Con un solo calendario MUST ser una sola tabla. Las entradas sin profesor no salen en ninguna vista de profesor. Las sesiones de un curso sin calendario MUST listarse aparte, por día.

#### Scenario: Un calendario
- **GIVEN** Eva, que da Inglés en cuatro clases de cursos con el mismo calendario
- **WHEN** elijo «Por profesor» y a Eva
- **THEN** veo una sola tabla con sus 12 sesiones, cada una con la asignatura y la clase

#### Scenario: Dos calendarios
- **GIVEN** Luis, que da clase en 4º (calendario «Primaria») y en 5º (calendario «Tercer ciclo»)
- **WHEN** lo elijo
- **THEN** veo dos tablas, cada una con el nombre de su calendario y sus propias sesiones y horas

#### Scenario: Profesor borrado
- **GIVEN** que después de generar se borró a un profesor
- **THEN** no aparece en el selector

### Requirement: Vista de todo el colegio
La vista de todo el colegio MUST ofrecer un selector de día (lunes por defecto) y, por cada calendario, una tabla con sus sesiones en filas y las clases de los cursos de ese calendario en columnas, con la asignatura y el profesor en cada celda del día elegido y «Libre» donde no hay sesión. Por debajo de 768 px la tabla MUST desplazarse en horizontal dentro de su contenedor, nunca la página. Los cursos sin calendario MUST listarse aparte.

#### Scenario: El martes del colegio
- **GIVEN** un borrador con un solo calendario y 12 clases
- **WHEN** elijo «Todo el colegio» y «Martes»
- **THEN** veo una tabla con las seis sesiones en filas y las 12 clases en columnas, con la asignatura y el profesor de cada celda del martes

### Requirement: Estado de la vista en la dirección
La vista y su selección MUST vivir en la URL (`?vista=clase|profesor|colegio&clase=<id>&profesor=<id>&dia=1..5`) y derivarse al pintar: un valor que no existe en el borrador (una clase o un profesor que no está, un día fuera de 1 a 5, una vista desconocida) MUST ignorarse sin error y usar el de por defecto. Cada cambio MUST escribir la URL con `replace` (no llena el historial) y solo con ids, nunca nombres.

#### Scenario: Enlace directo a un profesor
- **WHEN** abro `/horarios/borrador?vista=profesor&profesor=<id de Eva>`
- **THEN** veo directamente el horario de Eva

#### Scenario: Valor que no existe
- **WHEN** abro `/horarios/borrador?vista=profesor&profesor=<id que no está>`
- **THEN** veo la vista por profesor con el primero del selector, sin error

#### Scenario: Cambiar de selección
- **WHEN** cambio de clase dos veces y pulso «atrás» en el navegador
- **THEN** salgo de la página, porque los cambios no añadieron entradas al historial, y no se hizo ninguna petición más

### Requirement: Accesibilidad, móvil e i18n del borrador
Los textos MUST estar en `schedule.draft.*` de `es.json` y `en.json`. Las tablas de clase y de profesor MUST caber a 360 px sin desplazamiento horizontal; la del colegio se desplaza solo dentro de su contenedor. Cada tabla MUST tener `caption` y cabeceras con `scope`, los selectores su etiqueta, y la página MUST pasar `axe` sin violaciones en cada vista, a 1280 y a 360 px.

#### Scenario: Accesibilidad
- **WHEN** la página está en cada vista, en castellano y en inglés
- **THEN** `axe` no da violaciones y cada tabla tiene su título y sus cabeceras

### Requirement: Ver el borrador de extremo a extremo
La suite de Cypress MUST recorrer, con el lanzador en memoria, que un administrador genera, pulsa «Ver horario», recorre las tres vistas y recarga con la vista en la URL; que un `MEMBER` ve el borrador; y que la página se usa a 360 px sin desplazamiento de la página.

#### Scenario: Recorrido completo
- **GIVEN** un colegio con dos clases y sus asignaciones
- **WHEN** el administrador genera y pulsa «Ver horario»
- **THEN** ve la tabla de la primera clase, la de un profesor y el día del colegio, y tras recargar sigue en la misma vista

