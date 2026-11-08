## MODIFIED Requirements

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
