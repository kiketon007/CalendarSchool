## ADDED Requirements

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
