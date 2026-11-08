# professor-load-summary Specification

## Purpose
Resumen de solo lectura de la carga lectiva de los profesores del colegio frente al máximo de 23 horas semanales: un rango mínimo–máximo de minutos por profesor (la duración de las sesiones depende de cada calendario y de las que coloque el motor), su estado y sus avisos, y los cursos con asignaturas sin profesor. Cubre `GET /api/professors/summary` para ADMIN y MEMBER, el cálculo puro `teachingLoadOf`, la página `/profesores/resumen` con sus filtros y los E2E.
## Requirements
### Requirement: Contrato del resumen de carga en OpenAPI
`docs/api-spec.yml` MUST documentar **`GET /api/professors/summary`** (`getProfessorsSummary`), con seguridad Bearer y sin parámetros: `200` (`no-store`), `401`, `500` y `503`. No hay `403` ni códigos de error nuevos.

La respuesta es `ProfessorsSummaryResponse`, `{ success: true, data: { summary: ProfessorsSummary } }`:
- **`ProfessorsSummary`:** `{ maxTeachingMinutes, professors: ProfessorLoad[], unassigned: UnassignedCourse[] }`, con `maxTeachingMinutes` igual a `1380`.
- **`ProfessorLoad`:** `id`, `firstName`, `lastName`; `subjects` (el `ProfessorSubject[]` de `Professor`); `courses` (`{ id, name }[]`, los cursos en los que da clase); `sessionsPerWeek` (entero ≥ 0); `minMinutes` y `maxMinutes` (enteros ≥ 0); `status` (`NO_LOAD`, `FITS`, `MAY_EXCEED` o `EXCEEDS`); `warnings` (`ProfessorLoadWarning[]`). Todos requeridos.
- **`ProfessorLoadWarning`:** `code` (`EXCEEDS_MAX_HOURS`, `MAY_EXCEED_MAX_HOURS`, `AVAILABILITY_INSUFFICIENT`, `COURSE_WITHOUT_CALENDAR` o `SEVERAL_CALENDARS`), requerido, y, según el código: `calendar` (`{ id, name }`), `sessions` y `available` para `AVAILABILITY_INSUFFICIENT`; `course` (`{ id, name }`) y `assignmentCount` para `COURSE_WITHOUT_CALENDAR`; `calendarCount` para `SEVERAL_CALENDARS`.
- **`UnassignedCourse`:** `{ courseId, courseName, missingCount }`, con `missingCount ≥ 1`.

Los tipos del frontend MUST regenerarse.

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias
- **AND** `api/schema.test.ts` fija la operación, sus respuestas y los cuatro esquemas

### Requirement: Cálculo de la carga lectiva de un profesor
La función pura `teachingLoadOf` (`domain/professor/teachingLoad.ts`) MUST calcular, con `MAX_TEACHING_MINUTES = 1380` (23 h, PRD §3.2), el rango, el estado y los avisos de un profesor a partir de sus asignaciones (cada una con las sesiones a la semana de su asignatura en el curso y el calendario del curso, o ninguno) y de sus tramos no disponibles.

Por cada calendario K de sus cursos:
- **carga_K:** la suma de las sesiones a la semana de sus asignaciones en cursos con K.
- **Sesiones de K:** los periodos de tipo sesión de K, de lunes a viernes, cada uno con su duración (`fin − inicio`). Los recreos no cuentan.
- **Libres_K:** las sesiones de K que no se solapan con ningún tramo no disponible de ese día. Un tramo `[a, b)` y una sesión `[s, e)` se solapan si `a < e` y `s < b`.
- **Con carga_K ≤ libres_K:** el mínimo de K es la suma de las carga_K duraciones libres más cortas, y el máximo, la de las más largas.
- **Con carga_K > libres_K:** se calcula con todas las sesiones de K y se avisa. Si carga_K supera incluso todas las sesiones de K, cada sesión que sobra suma la duración más corta de K al mínimo y la más larga al máximo.

El rango del profesor (`minMinutes`, `maxMinutes`) es la suma de los de cada calendario. Las asignaciones en cursos sin calendario no suman al rango, pero sí a `sessionsPerWeek`.

El estado es:
- `NO_LOAD` sin asignaciones;
- `FITS` si `maxMinutes ≤ 1380`;
- `MAY_EXCEED` si `minMinutes ≤ 1380 < maxMinutes`;
- `EXCEEDS` si `minMinutes > 1380`.

Los avisos MUST ir en este orden: `EXCEEDS_MAX_HOURS` (con `EXCEEDS`), `MAY_EXCEED_MAX_HOURS` (con `MAY_EXCEED`), un `AVAILABILITY_INSUFFICIENT` por calendario con carga_K > libres_K (en orden de nombre del calendario, con `sessions` = carga_K y `available` = libres_K), un `COURSE_WITHOUT_CALENDAR` por curso sin calendario (en orden de nombre del curso, con sus asignaciones) y `SEVERAL_CALENDARS` si da clase en dos o más calendarios (con `calendarCount`).

El backend MUST recorrer la tabla de casos `test-fixtures/teaching-load.json`.

#### Scenario: Un calendario con sesiones iguales
- **GIVEN** Ana con 20 sesiones en 1º Primaria, cuyo calendario tiene 5 sesiones de 60 min al día, y sin tramos no disponibles
- **WHEN** se calcula su carga
- **THEN** `minMinutes` y `maxMinutes` valen 1200, su estado es `FITS` y no tiene avisos

#### Scenario: Sesiones de distinta duración
- **GIVEN** un calendario con 3 sesiones de 60 min y 2 de 45 min al día (15 de 60 y 10 de 45 a la semana) y Luis con 24 sesiones en él
- **WHEN** se calcula su carga
- **THEN** `minMinutes` es 10 × 45 + 14 × 60 = 1290 y `maxMinutes` es 15 × 60 + 9 × 45 = 1305
- **AND** su estado es `FITS`

#### Scenario: Puede pasar de 23 h
- **GIVEN** un profesor cuyo mínimo es 1350 y cuyo máximo es 1440
- **THEN** su estado es `MAY_EXCEED` con el aviso `MAY_EXCEED_MAX_HOURS`

#### Scenario: Pasa de 23 h
- **GIVEN** un profesor cuyo mínimo es 1395
- **THEN** su estado es `EXCEEDS` con el aviso `EXCEEDS_MAX_HOURS`

#### Scenario: Exactamente 23 h
- **GIVEN** un profesor con `minMinutes` y `maxMinutes` iguales a 1380
- **THEN** su estado es `FITS`

#### Scenario: Solo cuentan las sesiones en las que puede
- **GIVEN** el calendario de «Sesiones de distinta duración», con las de 60 min a primera hora, y un profesor con 5 sesiones que no puede de 9:00 a 10:00 ningún día
- **WHEN** se calcula su carga
- **THEN** su rango se calcula sin las sesiones de 9:00 a 10:00

#### Scenario: La disponibilidad no alcanza
- **GIVEN** Eva con 22 sesiones en «Primaria», donde solo 20 sesiones no se solapan con sus tramos
- **THEN** tiene el aviso `AVAILABILITY_INSUFFICIENT` con «Primaria», `sessions` 22 y `available` 20
- **AND** su rango se calcula con todas las sesiones de «Primaria»

#### Scenario: Más carga que sesiones en el calendario
- **GIVEN** un calendario con 25 sesiones a la semana, de 45 y de 60 min, y un profesor con 27 sesiones en él
- **THEN** las 2 que sobran suman 45 min cada una al mínimo y 60 min cada una al máximo

#### Scenario: Curso sin calendario
- **GIVEN** un profesor con 3 asignaciones (7 sesiones) en 6º Primaria, que no tiene calendario, y ninguna más
- **THEN** su rango es 0, su estado `FITS`, `sessionsPerWeek` es 7 y tiene `COURSE_WITHOUT_CALENDAR` con 6º Primaria y `assignmentCount` 3

#### Scenario: Varios calendarios
- **GIVEN** un profesor con asignaciones en cursos de dos calendarios
- **THEN** su rango es la suma de los dos y tiene `SEVERAL_CALENDARS` con `calendarCount` 2

#### Scenario: Sin asignaciones
- **GIVEN** un profesor sin asignaciones
- **THEN** su estado es `NO_LOAD`, con 0 sesiones, rango 0 y sin avisos

### Requirement: Leer el resumen con GET /api/professors/summary
`GET /api/professors/summary` MUST responder `200` con el resumen de **todos** los profesores del colegio de la sesión, también los que no tienen asignaciones, y de ninguno de otro colegio. Lo pueden leer `ADMIN` y `MEMBER`. El `schoolId` sale de la identidad.

La ruta MUST registrarse en `professorsRouter` antes de `/:id`, para que «summary» no se lea como un `id` (que respondería `404`).

El orden:
- profesores por apellidos y nombre, con `compareText`;
- sus asignaturas, como en el listado de profesores;
- sus cursos y los cursos sin profesor, por nombre, con `compareText`.

`unassigned` MUST tener cada curso del colegio con alguna celda sin profesor, con `missingCount` = suma, por cada asignatura que se imparte en el curso, del número de clases del curso menos las asignaciones de esa asignatura. Un curso sin clases o sin asignaturas no aparece.

El repositorio MUST leer todo con dos consultas como mucho (sin una consulta por profesor o por curso) y sin bloqueos. No hay evento de log.

#### Scenario: Resumen del colegio
- **GIVEN** Ana (20 sesiones en 1º Primaria), Luis (sin asignaciones) y un profesor de otro colegio
- **WHEN** un `ADMIN` pide el resumen
- **THEN** responde `200` con `no-store`, con `maxTeachingMinutes` 1380 y con Ana y Luis en orden de apellidos
- **AND** Luis tiene `NO_LOAD`
- **AND** no aparece el profesor del otro colegio

#### Scenario: Un miembro también lo ve
- **WHEN** un `MEMBER` pide el resumen
- **THEN** responde `200` con el mismo contenido

#### Scenario: Asignaturas sin profesor
- **GIVEN** 1º Primaria con 3 clases y Lengua y Matemáticas, con profesor en Lengua de 1º A y en Matemáticas de las tres clases
- **THEN** `unassigned` tiene 1º Primaria con `missingCount` 2

#### Scenario: Todo asignado
- **GIVEN** que todas las asignaturas de todos los cursos tienen profesor en todas sus clases
- **THEN** `unassigned` es `[]`

#### Scenario: La ruta no es un id
- **WHEN** se pide `GET /api/professors/summary`
- **THEN** responde el resumen, no `404`

#### Scenario: Sin sesión
- **WHEN** se pide el resumen sin token
- **THEN** responde `401 INVALID_SESSION`

#### Scenario: Base de datos caída
- **WHEN** la base de datos no responde
- **THEN** responde `503`

### Requirement: Página del resumen de carga
`/profesores/resumen` (`pages/ProfessorsSummaryPage.tsx`, título «Resumen de carga») MUST colgar de `AuthenticatedLayout` **sin** `RequireRole`, para los dos roles, y seguir el patrón de las páginas de listado (ver `list-page-layout`): cabecera con el sobretítulo «Carga lectiva», el `h1` «Resumen de carga» y, como descripción, el texto de hoy («La carga lectiva de cada profesor frente al máximo de 23 horas a la semana…»), sin acciones; y el bloque «Carga por profesor» con el recuento de profesores en su cabecera.

Carga:
- Pide el resumen una sola vez, aunque `StrictMode` ejecute el efecto dos veces.
- Mientras carga, muestra un `role="status"` dentro del bloque.
- Si falla, muestra dentro del bloque un `role="alert"` con «Reintentar», que vuelve a pedirlo.

`services/professorsSummaryService.ts` (`get(authorizedFetch)`) devuelve `loaded`, `unauthenticated` o `unavailable`, valida la forma de la respuesta (los enums de estado y de aviso, `minMinutes ≤ maxMinutes`) y nunca lanza.

Entre la cabecera y el bloque (fuera de él), el aviso de las asignaturas sin profesor:
- con cursos en `unassigned`, un aviso con «Faltan profesores» y, por curso, «{curso}: {n} sin profesor» (con plural), enlazado a `/cursos/{id}/profesores`;
- sin ninguno, «Todas las asignaturas tienen profesor en todas las clases».

Dentro del bloque, en este orden: los filtros, el recuento, el vacío o «sin coincidencias» y el listado. Presentación del listado, una sola según `useMediaQuery('(min-width: 768px)')`:
- **Desde 768 px:** una `Table` con `aria-labelledby` al `h2` del bloque y las columnas Profesor, Asignaturas, Sesiones/semana, Horas lectivas, Estado, Avisos y Acciones; el nombre es la cabecera de su fila. Las celdas de texto se pueden partir en varias líneas y la tabla MUST NOT desplazarse en horizontal a 1280 px con la barra lateral.
- **Por debajo:** una lista (`ul` con un `li` por profesor, sin tarjeta anidada) con el nombre de cada profesor como `h3`.

Cada profesor muestra:
- **Profesor:** «Apellidos, Nombre».
- **Asignaturas:** el texto de `subjectsTextOf`, o «Sin asignaturas».
- **Sesiones/semana:** `sessionsPerWeek`.
- **Horas lectivas:** el rango con `utils/teachingTime.ts`: «21 h 45 min», «45 min» o «20 h»; «{mínimo} – {máximo}» si son distintos y un solo valor si coinciden; «—» con `NO_LOAD`.
- **Estado:** icono y texto: «Sin carga», «Cabe», «Puede pasar de 23 h» o «Pasa de 23 h». El color nunca es la única pista.
- **Avisos:** su texto, en rojo los de `EXCEEDS_MAX_HOURS` y `AVAILABILITY_INSUFFICIENT`:
  - «Pasa de 23 h aunque le toquen las sesiones más cortas»;
  - «Puede pasar de 23 h según las sesiones que le toquen»;
  - «En «{calendario}» tiene {n} sesiones y solo puede dar {m}»;
  - «{n} asignaciones en {curso}, que no tiene calendario, no se cuentan» (con plural);
  - «Da clase en {n} calendarios: los solapes entre ellos los comprueba la generación».
- **Acciones:** «Editar disponibilidad» (`/profesores/{id}/disponibilidad`, con `aria-label` «Editar la disponibilidad de {Apellidos, Nombre}») y un enlace por curso en el que da clase a `/cursos/{id}/profesores` («Profesores de {curso}»).

#### Scenario: Ver el resumen
- **GIVEN** Ana con 20 sesiones de 60 min y Luis sin asignaciones
- **WHEN** abro «Resumen de carga»
- **THEN** veo, dentro del bloque «Carga por profesor», «García, Ana» con «20», «20 h» y «Cabe», y «López, Luis» con «0», «—» y «Sin carga»

#### Scenario: Cabecera de la página
- **WHEN** abro «Resumen de carga»
- **THEN** veo el sobretítulo «Carga lectiva», el `h1` «Resumen de carga» y la descripción, sin acciones

#### Scenario: Rango con avisos
- **GIVEN** un profesor con rango de 1350 a 1440 minutos
- **THEN** su fila dice «22 h 30 min – 24 h», «Puede pasar de 23 h» y su aviso

#### Scenario: Faltan profesores
- **GIVEN** 1º Primaria con 2 celdas sin profesor
- **THEN** entre la cabecera y el bloque veo «1º Primaria: 2 sin profesor», que lleva a su matriz de profesores, y el aviso no está dentro del bloque

#### Scenario: Acciones
- **WHEN** pulso «Editar disponibilidad» de Ana
- **THEN** voy a su página de disponibilidad
- **AND** el enlace «Profesores de 1º Primaria» lleva a `/cursos/{id}/profesores`

#### Scenario: Lista a 360 px
- **WHEN** abro la página a 360 px
- **THEN** cada profesor es un elemento de la lista con su nombre como `h3`, los mismos datos y enlaces
- **AND** la página no se desplaza en horizontal

#### Scenario: Escritorio con la barra lateral
- **GIVEN** una ventana de 1280 px y profesores con asignaturas, avisos y enlaces a cursos
- **WHEN** abro la página
- **THEN** ni la página ni la tabla se desplazan en horizontal

#### Scenario: Error al cargar
- **WHEN** el resumen no se puede cargar
- **THEN** veo dentro del bloque un aviso con «Reintentar», que lo vuelve a pedir una sola vez

#### Scenario: Colegio sin profesores
- **GIVEN** un colegio sin profesores
- **THEN** veo «Aún no hay profesores» dentro del bloque y no veo los filtros

### Requirement: Filtros y recuento del resumen
La página MUST ofrecer estos filtros combinables, dentro del bloque y encima del listado, aplicados en el navegador sobre el resumen cargado, sin pedirlo de nuevo y en el estado de la página (no en la URL). La lógica está en `utils/professorSummaryFilters.ts`. Solo existen si hay algún profesor.
- **Estado:** «Todos» o uno de los cuatro estados.
- **Asignatura:** «Todas» o una de las asignaturas que imparte algún profesor del resumen, por nombre.
- **Búsqueda:** por nombre y apellidos, con `matchesPersonSearch`, sin mayúsculas ni acentos.
- **«Solo con avisos»:** una casilla que deja los profesores con algún aviso.

El contador de la cabecera del bloque MUST decir siempre el total, «{n} profesores» (con plural). Mientras haya algún filtro activo, una línea dentro del bloque MUST decir, en un `role="status"`, «Mostrando {n} de {total} profesores»; sin filtros, esa línea MUST NOT existir. Sin coincidencias, la página MUST mostrar «No hay profesores que coincidan» y «Limpiar filtros», que los quita todos y devuelve el foco a la búsqueda.

#### Scenario: Filtrar por estado
- **WHEN** elijo «Pasa de 23 h»
- **THEN** solo veo los profesores con `EXCEEDS` y «Mostrando {n} de {total} profesores», y la cabecera sigue con el total

#### Scenario: Filtrar por asignatura y buscar
- **WHEN** elijo «Inglés» y escribo «garcia»
- **THEN** solo veo a los García que dan Inglés

#### Scenario: Solo con avisos
- **GIVEN** Eva con el aviso de disponibilidad y estado `FITS`
- **WHEN** marco «Solo con avisos»
- **THEN** veo a Eva y no a los profesores sin avisos

#### Scenario: Sin filtros
- **WHEN** abro la página sin tocar los filtros
- **THEN** veo el total en la cabecera del bloque y ninguna línea de resultados

#### Scenario: Sin coincidencias
- **WHEN** ningún profesor cumple los filtros
- **THEN** veo «No hay profesores que coincidan» y «Limpiar filtros»
- **AND** al pulsarlo vuelvo a ver todos, con el foco en la búsqueda

### Requirement: Accesibilidad e i18n del resumen
La página MUST:
- no tener violaciones de `axe` (con datos, con avisos, vacía y con error);
- dar el estado y los avisos con texto, no solo con color;
- tener todos los textos en `es.json` y `en.json` (`professors.summary.*`), con plurales;
- formatear las horas igual en los dos idiomas («21 h 45 min»).

#### Scenario: Sin violaciones
- **WHEN** se pasa `axe` a la página con profesores en los cuatro estados
- **THEN** no hay violaciones

### Requirement: Resumen de carga de extremo a extremo
Los E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con calendarios, cargas, disponibilidades y asignaciones creadas por la API:
- un profesor en `FITS` con su rango, uno en `MAY_EXCEED`, uno con el aviso de disponibilidad y uno «Sin carga»;
- el aviso de las asignaturas sin profesor y su enlace a la matriz del curso;
- los filtros de estado y de asignatura, la búsqueda y «Limpiar filtros»;
- el enlace «Editar disponibilidad»;
- a 360 px, sin desplazamiento horizontal.

#### Scenario: Recorrido del resumen
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/professorsSummary.cy.ts`
- **THEN** pasan todos sus tests

### Requirement: Desglose de la carga por calendario
`ProfessorLoad` MUST llevar **`calendars`** (requerido, solo en respuestas), un `ProfessorLoadCalendar[]` documentado en `docs/api-spec.yml`, con una entrada por cada calendario de los cursos en los que el profesor tiene asignaciones, en orden de nombre del calendario con `compareText`:
- `calendar`: `{ id, name }`;
- `sessions`: entero ≥ 1, la carga del profesor en ese calendario (carga_K);
- `available`: entero ≥ 0, las sesiones del calendario en las que puede dar clase (libres_K);
- `minMinutes` y `maxMinutes`: enteros ≥ 0, el rango de ese calendario, con `minMinutes ≤ maxMinutes`.

`teachingLoadOf` MUST devolverlo con el mismo cálculo que el rango: la suma de los `minMinutes` del desglose es el `minMinutes` del profesor y la de los `maxMinutes`, su `maxMinutes`. Los cursos sin calendario no tienen entrada. Un profesor sin asignaciones, o solo con cursos sin calendario, tiene `calendars: []`. La tabla `test-fixtures/teaching-load.json` MUST incluir el desglose esperado de cada caso. No hay endpoints ni códigos de error nuevos y los tipos del frontend MUST regenerarse.

#### Scenario: Dos calendarios
- **GIVEN** Eva con 10 sesiones en «Primaria» (5 sesiones de 60 min al día) y 5 en «Mixto» (15 de 60 y 10 de 45 a la semana)
- **WHEN** se calcula su carga
- **THEN** `calendars` es `[{ «Mixto», sessions 5, available 25, 225, 300 }, { «Primaria», sessions 10, available 25, 600, 600 }]`
- **AND** su rango es 825–900

#### Scenario: Disponibilidad que no alcanza
- **GIVEN** Ana con 22 sesiones en «Primaria» sin poder los lunes
- **THEN** su entrada de «Primaria» lleva `sessions` 22, `available` 20 y el rango calculado con todas las sesiones

#### Scenario: Sin calendario
- **GIVEN** un profesor cuyas asignaciones están todas en cursos sin calendario
- **THEN** `calendars` es `[]`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija `ProfessorLoadCalendar`

### Requirement: Detalle desplegable de un profesor
En `/profesores/resumen`, cada profesor con alguna asignación MUST tener un botón «Detalle» con `aria-expanded`, `aria-controls` y el nombre accesible «Detalle de {Apellidos, Nombre}». Un profesor «Sin carga» no lo tiene.
- Pulsarlo abre su detalle y cierra el que estuviera abierto; pulsarlo otra vez lo cierra. **Solo hay un profesor desplegado a la vez.**
- En la tabla, el detalle va en la fila siguiente a la del profesor, con una celda que ocupa todas las columnas; en las tarjetas, dentro de su tarjeta.
- Si un cambio de filtros oculta al profesor desplegado, el detalle se cierra.

El detalle MUST tener un encabezado por sección:
- **Asignaciones:** una línea por asignación, en el orden del resumen: «{asignatura} · {curso} {clase} · {n} sesiones · «{calendario}», sesiones de {X} a {Y} min» («sesiones de {X} min» si todas duran lo mismo; «sin calendario» si el curso no tiene). La duración sale de los periodos del calendario del curso.
- **Por calendario:** una línea por entrada de `calendars`: ««{calendario}»: {n} sesiones · puede dar {m} · {rango}», y el total con el rango del profesor. Sin entradas, no se pinta.
- **Disponibilidad:** `SlotGrid` en modo `unavailable` con `editable={false}` sobre las sesiones del calendario elegido, con las celdas no disponibles y las parciales con sus horas (las mismas utilidades que la página de disponibilidad). Con más de un calendario, un selector que empieza en el de mayor carga (`sessions`; si empatan, el primero por nombre). Sin tramos no disponibles, «Disponible siempre». Si `calendars` está vacío, no hay cuadrícula y se dice que sus cursos no tienen calendario.

#### Scenario: Abrir y cerrar
- **WHEN** pulso «Detalle de García, Ana»
- **THEN** su detalle se abre bajo su fila y el botón tiene `aria-expanded="true"`
- **WHEN** pulso «Detalle de Pérez, Eva»
- **THEN** se cierra el de Ana y se abre el de Eva

#### Scenario: Asignaciones con la duración de su calendario
- **GIVEN** Ana con Lengua en 1º Primaria A, 5 sesiones, y su curso con «Mixto» (sesiones de 45 y 60 min)
- **THEN** veo «Lengua · 1º Primaria A · 5 sesiones · «Mixto», sesiones de 45 a 60 min»

#### Scenario: Asignación en un curso sin calendario
- **GIVEN** Eva con Lengua 6 en 6º Primaria A, curso sin calendario
- **THEN** su línea dice «sin calendario» y 6º Primaria no está en el desglose por calendario

#### Scenario: Desglose y total
- **GIVEN** Eva con las entradas del escenario «Dos calendarios»
- **THEN** veo una línea por calendario con sus sesiones, las que puede dar y su rango, y el total «13 h 45 min – 15 h»

#### Scenario: Cuadrícula con selector
- **GIVEN** Eva con 10 sesiones en «Primaria» y 5 en «Mixto»
- **THEN** la cuadrícula empieza en «Primaria» y al elegir «Mixto» muestra sus sesiones

#### Scenario: Siempre disponible
- **GIVEN** un profesor sin tramos no disponibles
- **THEN** sobre la cuadrícula veo «Disponible siempre» y ninguna celda marcada

#### Scenario: Sin carga
- **GIVEN** un profesor «Sin carga»
- **THEN** su fila no tiene botón «Detalle»

#### Scenario: Un filtro oculta al desplegado
- **GIVEN** el detalle de Ana abierto
- **WHEN** busco «perez»
- **THEN** el detalle se cierra
- **AND** al limpiar la búsqueda Ana aparece con su detalle cerrado

### Requirement: Avisos ampliados del detalle
Cada aviso del profesor MUST aparecer en su detalle, en el orden del resumen, con una explicación y un enlace a lo que lo resuelve:
- `EXCEEDS_MAX_HOURS`: «Aunque le tocaran las sesiones más cortas pasaría de 23 h: hay que quitarle asignaciones.» y un enlace «Profesores de {curso}» a `/cursos/{id}/profesores` por cada curso en el que da clase.
- `MAY_EXCEED_MAX_HOURS`: «Según las sesiones que le toquen puede pasar de 23 h; la generación de horarios intentará no pasar de ese máximo.» y los mismos enlaces.
- `AVAILABILITY_INSUFFICIENT`: «En «{calendario}» tiene {n} sesiones y solo puede dar {m}: amplía su disponibilidad o quítale asignaciones.» y «Editar disponibilidad» a `/profesores/{id}/disponibilidad`.
- `COURSE_WITHOUT_CALENDAR`: «{curso} no tiene calendario: sus {n} asignaciones no cuentan hasta que se le asigne uno.» (con plural) y un enlace «Calendarios» a `/calendarios`.
- `SEVERAL_CALENDARS`: «Da clase en {n} calendarios: el resumen no sabe si sus sesiones se solapan en la hora; lo comprueba la generación de horarios.», sin enlace.

Los textos MUST estar en `es.json` y `en.json`, con plurales.

#### Scenario: Disponibilidad que no alcanza
- **GIVEN** Ana con el aviso de disponibilidad en «Mixto», 10 sesiones y 5 disponibles
- **THEN** su detalle dice «En «Mixto» tiene 10 sesiones y solo puede dar 5: amplía su disponibilidad o quítale asignaciones.» con «Editar disponibilidad», que lleva a su página de disponibilidad

#### Scenario: Curso sin calendario
- **GIVEN** Eva con 1 asignación en 6º Primaria sin calendario
- **THEN** su detalle dice «6º Primaria no tiene calendario: su asignación no cuenta hasta que se le asigne uno.» con un enlace a `/calendarios`

#### Scenario: Varios calendarios
- **GIVEN** un profesor con el aviso de varios calendarios
- **THEN** su detalle lo explica y no tiene enlace

#### Scenario: Puede pasar de 23 h
- **GIVEN** Pedro en `MAY_EXCEED` con clase en 3º Primaria
- **THEN** su detalle lo explica con el enlace «Profesores de 3º Primaria»

### Requirement: Carga del detalle
Las asignaciones, el desglose y los avisos del detalle MUST verse sin esperar, porque vienen en el resumen. La cuadrícula MUST pedir:
- `GET /api/calendars` (`calendarsService.list`) la primera vez que se despliega a alguien, y reutilizarlo para los demás durante la visita;
- `GET /api/professors/{id}/availability` (`professorAvailabilityService.get`) cada vez que se despliega a un profesor.

Mientras carga, la sección de disponibilidad muestra un `role="status"`; si falla, un `role="alert"` **dentro del detalle** con «Reintentar», que vuelve a pedir lo que falló, sin tocar el resto de la página. Una respuesta que llega cuando ese profesor ya no está desplegado MUST descartarse.

#### Scenario: Calendarios una sola vez
- **WHEN** despliego a Ana y después a Eva
- **THEN** se ha pedido una vez `GET /api/calendars` y una vez la disponibilidad de cada una

#### Scenario: Error al cargar la disponibilidad
- **WHEN** la disponibilidad no se puede cargar
- **THEN** el detalle muestra las asignaciones, el desglose y los avisos, y en la disponibilidad un aviso con «Reintentar»
- **AND** al pulsarlo se vuelve a pedir y se pinta la cuadrícula

#### Scenario: Respuesta tardía
- **GIVEN** que despliego a Ana y, antes de que llegue su disponibilidad, despliego a Eva
- **THEN** la cuadrícula muestra la disponibilidad de Eva, nunca la de Ana

### Requirement: Accesibilidad e i18n del detalle
El detalle MUST:
- tener encabezados por sección y la cuadrícula con cabeceras de fila y columna;
- verse a 360 px sin desplazamiento horizontal de la página;
- no tener violaciones de `axe` (abierto con avisos, cargando, con error y en inglés);
- tener sus textos en `es.json` y `en.json` (`professors.summary.detail.*`), con plurales.

#### Scenario: Sin violaciones
- **WHEN** se pasa `axe` a la página con un detalle abierto con avisos
- **THEN** no hay violaciones

### Requirement: Detalle de extremo a extremo
Los E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con los datos creados por la API: desplegar a un profesor y ver sus asignaciones, su desglose y su cuadrícula; cambiar de calendario; seguir el enlace de un aviso; desplegar a otro y comprobar que se cierra el primero; y a 360 px, sin desplazamiento horizontal.

#### Scenario: Recorrido del detalle
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/professorsSummary.cy.ts`
- **THEN** pasan todos sus tests, también los del detalle

