# preferred-slots Specification

## Purpose
Franjas preferidas (blandas) de una asignatura en un curso (US19_d): leerlas y guardarlas (`GET` y `PUT` de `preferred-slots`, con las mismas reglas que las prohibidas), su contradicción con las prohibidas (gana la prohibida: el servidor lo acepta y avisa con `PREFERRED_SLOTS_FORBIDDEN`) y su página con el modo preferidas de `SlotGrid`.
## Requirements
### Requirement: Contrato de las franjas preferidas en OpenAPI
`docs/api-spec.yml` MUST documentar `GET /api/courses/{courseId}/subjects/{subjectId}/preferred-slots` (`getPreferredSlots`) y `PUT` en la misma ruta (`updatePreferredSlots`), con seguridad Bearer, los mismos parámetros (`SlotsCourseId`, `SlotsSubjectId`) y los mismos esquemas que las prohibidas:
- **Respuesta:** `SubjectSlotRuleResponse`.
- **Cuerpo:** `UpdateSubjectSlotsRequest`.

Cambios en los esquemas:
- **`SubjectSlotRule`:** gana `forbiddenSlots`, una lista de `SlotCell` **opcional**. Solo la llevan las respuestas de las preferidas, con las celdas prohibidas de la pareja que existen en el calendario actual. Su descripción MUST dejar de hablar solo de prohibidas.
- **`WorkloadWarningCode`:** gana `PREFERRED_SLOTS_FORBIDDEN`. `WorkloadWarning.count` MUST describir también este aviso.

Respuestas que MUST declarar cada operación, las mismas que las prohibidas:
- **`GET`:** `200` (`no-store`), `401`, `404`, `500` y `503`.
- **`PUT`:** `200` (`no-store`), `400`, `401`, `403`, `404`, `409` (`COURSE_HAS_NO_CALENDAR`), `500` y `503`.

No hay códigos de error nuevos. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias, y `api/schema.test.ts` fija:
  - las dos operaciones;
  - que `forbiddenSlots` es opcional en `SubjectSlotRule`;
  - que `WorkloadWarningCode` incluye `PREFERRED_SLOTS_FORBIDDEN`.

### Requirement: Leer las franjas preferidas con GET
`GET /api/courses/{courseId}/subjects/{subjectId}/preferred-slots` MUST responder `200` a `ADMIN` y `MEMBER` del colegio con la `SubjectSlotRule` de la regla `PREFERRED_SLOTS` de la asignatura en el curso:
- **`slots` y `outsideCalendarCount`:** los de las preferidas, con las mismas reglas que las prohibidas.
- **`forbiddenSlots`:** las celdas prohibidas que existen en el calendario actual, ordenadas por día y por sesión. Sin calendario, `[]`.
- **`warnings`:** los de la asignatura, en este orden:
  1. `BLOCK_LARGER_THAN_LOAD` y `SUBJECT_DOES_NOT_FIT`, calculados con las prohibidas, nunca con las preferidas.
  2. `SLOTS_OUTSIDE_CALENDAR`, con las preferidas fuera del calendario.
  3. `PREFERRED_SLOTS_FORBIDDEN`.

La lectura MUST NOT cambiar nada. Los casos de `404 NOT_FOUND` son los de las prohibidas.

#### Scenario: Preferidas y prohibidas en la misma lectura
- **GIVEN** «Religión» en 1º con el lunes entero prohibido y el martes 2ª preferido
- **WHEN** se piden sus preferidas
- **THEN** responde `200` con:
  - `slots`, solo con el martes 2ª;
  - `forbiddenSlots`, con las sesiones del lunes;
  - ningún aviso.

#### Scenario: Las prohibidas no llevan forbiddenSlots
- **WHEN** se piden las prohibidas de «Religión»
- **THEN** la respuesta no tiene el campo `forbiddenSlots`

#### Scenario: Las preferidas no cambian si cabe
- **GIVEN** «Inglés» con 3 sesiones, sin máximo y solo el lunes y el martes preferidos
- **THEN** sus preferidas no tienen `SUBJECT_DOES_NOT_FIT`

### Requirement: Guardar las franjas preferidas con PUT
`PUT /api/courses/{courseId}/subjects/{subjectId}/preferred-slots` MUST dejar las celdas de la regla `PREFERRED_SLOTS` exactamente como `slots`, con el mismo comportamiento que las prohibidas:
- Una sola transacción.
- La regla se crea con la primera celda y se borra con la lista vacía.
- Las celdas fuera del calendario desaparecen al guardar.
- Un `PUT` igual a lo guardado no escribe nada.
- La validación, los bloqueos (asignatura `FOR UPDATE` → curso `FOR SHARE`), el `404`, el `409 COURSE_HAS_NO_CALENDAR` y el `400 OUT_OF_RANGE` son los mismos.
- El acceso también es el mismo: lectura para los dos roles y escritura solo `ADMIN`, con `requireRole` antes de leer los `id`.

Guardar las preferidas MUST NOT tocar la regla de prohibidas, y al revés.

Una celda preferida que también está prohibida MUST aceptarse: gana la prohibida, y la respuesta lleva el aviso `PREFERRED_SLOTS_FORBIDDEN`.

#### Scenario: Marcar y guardar
- **GIVEN** «Matemáticas» en 1º con un calendario de 6 sesiones y sin franjas
- **WHEN** el `ADMIN` envía las sesiones 1 y 2 de lunes a viernes
- **THEN** se cumple todo lo siguiente:
  - el `PUT` responde `200` con 10 celdas;
  - existe una regla `PREFERRED_SLOTS` con 10 filas en `scheduling_constraint_slots`;
  - no hay regla `FORBIDDEN_SLOTS`;
  - el `constraintCount` de la pareja es 1.

#### Scenario: El servidor no rechaza una preferida prohibida
- **GIVEN** «Religión» con el lunes entero prohibido
- **WHEN** se envían como preferidas el lunes 1ª y el martes 1ª
- **THEN** responde `200` con las dos celdas y un aviso `PREFERRED_SLOTS_FORBIDDEN` con `count: 1`

#### Scenario: Las dos reglas son independientes
- **GIVEN** «Religión» con prohibidas y preferidas
- **WHEN** se vacían las preferidas
- **THEN** las prohibidas siguen intactas, y el `constraintCount` baja en 1

#### Scenario: Validación y curso sin calendario
- **WHEN** se envía a las preferidas un cuerpo con `dayOfWeek: 6`, o una lista a un curso sin calendario
- **THEN** responde `400` con `OUT_OF_RANGE`, o `409 COURSE_HAS_NO_CALENDAR`, sin cambiar nada

#### Scenario: Miembro
- **GIVEN** un `MEMBER`
- **WHEN** lee las preferidas y luego intenta un `PUT`
- **THEN** la lectura responde `200` y el `PUT` responde `403 FORBIDDEN` sin cambiar nada

#### Scenario: Concurrencia entre las dos reglas
- **WHEN** se lanzan a la vez, en varias rondas, un `PUT` de preferidas y uno de prohibidas sobre la misma asignatura, o un `PUT` de preferidas y quitar el curso
- **THEN** se cumple todo lo siguiente:
  - ninguno termina con `500` ni con interbloqueo;
  - cada regla queda con las celdas enteras de su `PUT`, o desaparece si la pareja desapareció;
  - no queda ninguna celda sin regla.

### Requirement: Aviso de franjas preferidas prohibidas
El aviso `PREFERRED_SLOTS_FORBIDDEN` MUST darse cuando alguna celda preferida dentro del calendario es también una celda prohibida, y MUST llevar en `count` el número de esas celdas. Va después de `SLOTS_OUTSIDE_CALENDAR`.

El aviso MUST NOT guardarse ni impedir guardar, y una asignatura que no se imparte no lo tiene.

La regla MUST ser una función pura, `preferredSlotsWarnings(preferred, forbidden)`, en el backend (`domain/workload/workloadWarnings.ts`) y en el frontend (`utils/courseWorkloadDraft.ts`). Los tests de los dos lados MUST recorrer la misma tabla, `test-fixtures/preferred-slots-warnings.json`.

#### Scenario: Recuento de la contradicción
- **GIVEN** las preferidas lunes 1ª, lunes 2ª y martes 1ª, y el lunes entero prohibido
- **THEN** el aviso es `PREFERRED_SLOTS_FORBIDDEN` con `count: 2`

#### Scenario: Sin contradicción
- **GIVEN** preferidas y prohibidas que no comparten ninguna celda, o ninguna preferida
- **THEN** no hay aviso

### Requirement: Página de franjas preferidas
`/cursos/:courseId/carga/:subjectId/preferidas` MUST servir la misma página de las prohibidas (`pages/SubjectSlotsPage.tsx`) con el tipo `PREFERRED_SLOTS`. Tiene el mismo comportamiento de carga, errores, guardado, guarda contra el doble envío y vista del `MEMBER`, con estos textos propios:
- **Título y `caption`:** «Franjas preferidas de {asignatura} en {curso}».
- **Al guardar:** «Franjas preferidas guardadas».

La cuadrícula MUST usar el modo «preferidas» de `SlotGrid`, con las prohibidas de la respuesta como bloqueadas.

Los avisos MUST recalcularse al marcar o desmarcar:
- los de la asignatura, con las prohibidas fijas;
- más `PREFERRED_SLOTS_FORBIDDEN` con lo marcado, con el texto «{n} franjas preferidas están prohibidas y se ignorarán» (en singular, «1 franja preferida está prohibida y se ignorará»).

Todos se ven en el color de peligro, con su texto.

Los textos MUST estar en `es.json` y `en.json`.

#### Scenario: Prohibidas visibles y no marcables
- **GIVEN** «Religión» con el lunes entero prohibido
- **WHEN** el `ADMIN` abre sus preferidas
- **THEN** se cumple todo lo siguiente:
  - las celdas del lunes se ven como «Prohibida»;
  - sus botones están deshabilitados y «Prohibida» está en su nombre accesible;
  - pulsar la cabecera «Lunes» no marca nada.

#### Scenario: Contradicción posterior
- **GIVEN** «Religión» con el martes 2ª preferido
- **WHEN** después se prohíbe el martes entero y se abren sus preferidas
- **THEN** la celda se ve como «Preferida · prohibida, se ignora» y aparece el aviso «1 franja preferida está prohibida y se ignorará»
- **WHEN** el `ADMIN` desmarca esa celda y guarda
- **THEN** el aviso desaparece

#### Scenario: Marcar con la cabecera de sesión
- **GIVEN** el lunes entero prohibido
- **WHEN** el `ADMIN` pulsa la cabecera de la sesión 1
- **THEN** se marca la sesión 1 de martes a viernes (4 celdas), no la del lunes

#### Scenario: Vista del miembro
- **GIVEN** un `MEMBER` y «Religión» con preferidas, una de ellas prohibida
- **THEN** ve, como texto, las preferidas, las prohibidas y la preferida prohibida, sin botones ni «Guardar»

#### Scenario: Accesibilidad
- **WHEN** se ejecuta `axe` sobre la página de preferidas con celdas preferidas, prohibidas, una preferida prohibida y avisos, para los dos roles
- **THEN** no hay violaciones de WCAG 2.1 AA, y cada estado de celda se distingue por un icono y un texto, no solo por el color

### Requirement: Franjas preferidas de extremo a extremo
`cypress/e2e/slots.cy.ts` MUST recorrer también:
- abrir las preferidas desde la matriz, marcar con las cabeceras, guardar y ver «Franjas preferidas (n)» en la matriz;
- las prohibidas visibles y no marcables;
- la contradicción posterior con su aviso y desmarcarla;
- vaciar;
- el `MEMBER` sin edición;
- la cuadrícula a 360 px sin desplazamiento horizontal.

Cada `cy.intercept` MUST registrarse una sola vez.

#### Scenario: Recorrido
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/slots.cy.ts`
- **THEN** todos los tests pasan

