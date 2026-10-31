# forbidden-slots Specification

## Purpose
Franjas prohibidas de una asignatura en un curso (US19_c): leerlas y guardarlas (`GET` y `PUT` de `forbidden-slots`), validación, celdas que ya no existen si el calendario cambia, permisos, concurrencia, eventos, la cuadrícula `SlotGrid` (con su modo preferidas) y su página, que sirve también las preferidas (ver `preferred-slots`).
## Requirements
### Requirement: Contrato de las franjas prohibidas en OpenAPI
`docs/api-spec.yml` MUST documentar `GET /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots` (`getForbiddenSlots`) y `PUT` en la misma ruta (`updateForbiddenSlots`), con seguridad Bearer, y estos esquemas:
- **`SlotCell`:** `{ dayOfWeek, sessionNumber }`, enteros de 1 a 5 y de 1 a 8, los dos obligatorios y sin más propiedades.
- **`SubjectSlotRule`:**
  - `course` (`id`, `name`).
  - `subject` (`id`, `name`, `code`, `color`, `sessionsPerWeek`, `maxPerDay`, `blockSize`).
  - `calendar`: `{ id, name, periods }` o `null`, con `periods` como lista de `CalendarPeriod` en el orden de la jornada.
  - `slots`: lista de `SlotCell`.
  - `outsideCalendarCount`: entero no negativo.
  - `warnings`: lista de `WorkloadWarning`.
- **`SubjectSlotRuleResponse`:** `{ slotRule: SubjectSlotRule }`.
- **`UpdateSubjectSlotsRequest`:** `slots` obligatorio, de 0 a 40 `SlotCell`.
- **`ErrorCode`:** gana `COURSE_HAS_NO_CALENDAR`, a la vez que `ERROR_CODES` en `appError.ts`.

Respuestas que MUST declarar cada operación:
- **`GET`:** `200` (`SubjectSlotRuleResponse`, `no-store`), `401`, `404`, `500` y `503`.
- **`PUT`:** `200` (`SubjectSlotRuleResponse`, `no-store`), `400`, `401`, `403`, `404`, `409` (`COURSE_HAS_NO_CALENDAR`), `500` y `503`.

Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las dos operaciones, `SlotCell`, `SubjectSlotRule`, `UpdateSubjectSlotsRequest` y que `ErrorCode` incluye `COURSE_HAS_NO_CALENDAR`

### Requirement: Leer las franjas prohibidas con GET
`GET /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots` MUST responder `200` a `ADMIN` y `MEMBER` del colegio con la `SubjectSlotRule` de la asignatura en el curso. Sus campos MUST ser:
- `slots`: las celdas guardadas que existen en el calendario actual (`sessionNumber` no mayor que sus sesiones), ordenadas por día y por sesión.
- `outsideCalendarCount`: las que no existen. Sin calendario, todas.
- `warnings`: los de la asignatura, calculados con sus reglas, el calendario y las celdas dentro de él.

La lectura MUST NOT cambiar ni borrar nada. MUST responder `404 NOT_FOUND`, sin distinguir el caso, si:
- algún `id` no es un UUID;
- el curso o la asignatura no existen o son de otro colegio;
- la asignatura no se imparte en el curso.

#### Scenario: Cuadrícula de un curso con recreo
- **GIVEN** «Religión» en 1º con un calendario de 6 sesiones y el recreo tras la 3ª, sin franjas
- **WHEN** se pide su regla
- **THEN** responde `200` con los 7 periodos en orden (6 sesiones y el recreo), `slots` vacío, `outsideCalendarCount` 0 y sin avisos

#### Scenario: Celdas fuera del calendario
- **GIVEN** «Religión» con la sesión 6 prohibida los cinco días, y el calendario del curso pasa a 5 sesiones
- **WHEN** se pide su regla
- **THEN** `slots` está vacío, `outsideCalendarCount` es 5, hay un aviso `SLOTS_OUTSIDE_CALENDAR` con `count: 5` y las celdas siguen guardadas

#### Scenario: Asignatura que no se imparte en el curso
- **GIVEN** «Música», que no se imparte en 1º
- **WHEN** se pide su regla en 1º
- **THEN** responde `404 NOT_FOUND`

### Requirement: Guardar las franjas prohibidas con PUT
`PUT /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots` MUST dejar las celdas de la regla `FORBIDDEN_SLOTS` exactamente como `slots` en una transacción y responder `200` con la regla releída en ella:
- Con alguna celda, MUST crear la regla si no existía y reemplazar sus celdas.
- Con la lista vacía, MUST borrar la regla y sus celdas.
- Las celdas que estaban fuera del calendario MUST desaparecer.
- Un `PUT` igual a lo guardado (también la lista vacía sin regla) MUST NOT escribir nada.

El colegio MUST salir de la identidad, y la regla MUST guardarse con ese `school_id`.

#### Scenario: Marcar tres días enteros
- **GIVEN** «Religión» en 1º con un calendario de 6 sesiones y sin franjas
- **WHEN** el `ADMIN` envía las 18 celdas de lunes, miércoles y viernes
- **THEN** responde `200` con 18 celdas, existe una regla `FORBIDDEN_SLOTS` con 18 filas en `scheduling_constraint_slots` y la carga del curso muestra 18 en `forbiddenSlots` de «Religión»

#### Scenario: Vaciar
- **GIVEN** «Religión» con una regla de franjas y un máximo al día
- **WHEN** se envía `slots: []`
- **THEN** la regla de franjas y sus celdas desaparecen, el máximo sigue y el `constraintCount` de la pareja baja de 2 a 1

#### Scenario: Guardar quita las celdas fuera del calendario
- **GIVEN** la regla con 5 celdas fuera del calendario y 2 dentro
- **WHEN** se envían esas 2 celdas
- **THEN** quedan solo esas 2 y `outsideCalendarCount` es 0

### Requirement: Validación del guardado de franjas
El `PUT` MUST validar en este orden y responder `400 VALIDATION_ERROR` con un `{ field, code }` por campo, sin detenerse en el primero y sin cambiar nada:
- **`slots`:** `REQUIRED` si falta, `INVALID_FORMAT` si no es una lista, `INVALID_LENGTH` si pasa de 40.
- **Cada `slots[<i>]`:** `INVALID_FORMAT` si no es un objeto. En `.dayOfWeek` y `.sessionNumber`, `REQUIRED` si faltan, `INVALID_FORMAT` si no son enteros, y `OUT_OF_RANGE` fuera de 1..5 y de 1..8.
- **Celdas repetidas:** `DUPLICATE` en `slots[<i>]` desde la segunda aparición.

Con el cuerpo válido, dentro de la transacción:
- MUST responder `404` si la pareja no existe.
- MUST responder `409 COURSE_HAS_NO_CALENDAR` si el curso no tiene calendario.
- MUST responder `400` con `OUT_OF_RANGE` en `slots[<i>].sessionNumber` en cada celda cuya sesión no exista en el calendario actual.

Los mensajes de la interfaz MUST ser claros y traducidos, nunca técnicos.

#### Scenario: Forma inválida
- **WHEN** se envían `{ dayOfWeek: 6, sessionNumber: 1 }`, `{ dayOfWeek: 1, sessionNumber: 9 }` y dos veces `{ dayOfWeek: 2, sessionNumber: 3 }`
- **THEN** responde `400` con `OUT_OF_RANGE` en `slots[0].dayOfWeek` y en `slots[1].sessionNumber` y `DUPLICATE` en `slots[3]`, sin cambiar nada

#### Scenario: Sesión que no existe en el calendario
- **GIVEN** un calendario de 6 sesiones
- **WHEN** se envía `{ dayOfWeek: 1, sessionNumber: 7 }`
- **THEN** responde `400` con `OUT_OF_RANGE` en `slots[0].sessionNumber` y no cambia nada

#### Scenario: Curso sin calendario
- **GIVEN** un curso sin calendario
- **WHEN** se envía cualquier lista
- **THEN** responde `409 COURSE_HAS_NO_CALENDAR` y no cambia nada

### Requirement: Acceso a las franjas prohibidas
La lectura MUST ser para `ADMIN` y `MEMBER` y la escritura **solo para `ADMIN`**: `requireRole('ADMIN')` MUST ir antes de leer los `id` y el cuerpo, de modo que un `MEMBER` reciba `403 FORBIDDEN` aunque la petición sea inválida. Sin token, MUST responder `401` con `WWW-Authenticate: Bearer`.

#### Scenario: Miembro
- **GIVEN** un `MEMBER`
- **WHEN** lee la regla y luego intenta un `PUT`, también con un id mal formado
- **THEN** la lectura responde `200` y cada `PUT` responde `403 FORBIDDEN` sin cambiar nada

### Requirement: Bloqueos y concurrencia de las franjas
El `PUT` MUST bloquear la asignatura `FOR UPDATE` y después el curso `FOR SHARE`, ambos filtrados por colegio, antes de leer la pareja y escribir. Es el orden de la carga de un curso y de la edición de una asignatura. El calendario MUST leerse sin bloquear. Si algo falla a mitad, MUST NOT cambiar nada.

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que rechaza las inserciones en `scheduling_constraint_slots`
- **WHEN** se guarda una lista distinta de la actual
- **THEN** el `PUT` falla y la regla y sus celdas siguen como estaban

#### Scenario: Concurrencia
- **WHEN** se lanzan a la vez, varias rondas: dos `PUT` distintos de la misma asignatura; un `PUT` y quitar el curso desde la edición de la asignatura; un `PUT` y quitarlo desde la carga; un `PUT` y borrar el curso
- **THEN** ninguno termina con `500` ni interbloqueo, quedan las celdas enteras de uno de los dos `PUT` o ninguna regla si la pareja desapareció, y no queda ninguna celda sin regla ni regla sin pareja

### Requirement: Eventos de log de las franjas
Un `PUT` que cambia algo MUST registrar `SUBJECT_SLOTS_UPDATED` con `school_id`, `actor_id`, `course_id`, `subject_id`, `type` y `slot_count`. `type` es `FORBIDDEN_SLOTS` o `PREFERRED_SLOTS`, según la ruta.

Un rechazo por la pareja o por el calendario MUST registrar `SUBJECT_SLOTS_UPDATE_REJECTED` con los mismos identificadores, `type` y `reason` (`not_found` o `no_calendar`).

Ningún evento MUST llevar nombres, códigos ni celdas.

#### Scenario: Log sin nombres
- **WHEN** se guardan franjas, se repite el mismo `PUT` y se intenta guardar en un curso sin calendario
- **THEN** el log tiene:
  - un solo `SUBJECT_SLOTS_UPDATED`, con `slot_count`;
  - un `SUBJECT_SLOTS_UPDATE_REJECTED`, con `reason: no_calendar`;
  - el `type` de la ruta en los dos;
  - ningún nombre de asignatura, de curso ni de colegio.

#### Scenario: Tipo de las preferidas
- **WHEN** se guardan franjas preferidas
- **THEN** `SUBJECT_SLOTS_UPDATED` lleva `type: PREFERRED_SLOTS`

### Requirement: Cuadrícula de franjas reutilizable
`components/SlotGrid.tsx` MUST pintar una tabla con:
- **`caption`:** el que reciba.
- **Columnas:** una cabecera por día de lunes a viernes.
- **Filas:** una por periodo, en el orden de la jornada:
  - Cada sesión es una fila con su cabecera («Sesión {n}» y sus horas) y una celda por día.
  - Cada recreo es una fila de separación no interactiva («Recreo {inicio}–{fin}»).

Si es editable:
- Cada celda MUST ser un botón con `aria-pressed` y el nombre «{día}, sesión {n} ({inicio}–{fin})».
- Las cabeceras de día y de sesión MUST ser botones que marcan toda la columna o la fila si alguna celda falta, y la desmarcan si ya estaba entera.
- Lo marcado MUST distinguirse por un icono y un texto oculto, no solo por el color.

Sin edición, las celdas MUST ser texto («Prohibida» o vacía).

La cuadrícula MUST tener dos modos:
- **`forbidden`:** es el modo por defecto, y su comportamiento no cambia.
- **`preferred`:** recibe además las celdas bloqueadas (las prohibidas).

En el modo `preferred`:
- **Preferida:** se marca con un icono distinto del aspa y el texto oculto «Preferida».
- **Bloqueada y no preferida:** se ve con el aspa y «Prohibida». Si es editable, su botón MUST estar deshabilitado y llevar «Prohibida» en su nombre accesible.
- **Bloqueada y preferida:** se ve con un icono de aviso y «Preferida · prohibida, se ignora». Si es editable, MUST poder desmarcarse.
- **Cabeceras:** MUST actuar solo sobre las celdas no bloqueadas de su columna o su fila.
- **Sin edición:** los tres estados MUST verse como texto.

#### Scenario: Cabeceras que marcan y desmarcan
- **GIVEN** la cuadrícula editable de 6 sesiones sin nada marcado
- **WHEN** se pulsa «Lunes», después la cabecera de la sesión 1, y otra vez «Lunes»
- **THEN** primero se marcan las 6 celdas del lunes, y después la sesión 1 de los cinco días
- **AND** al final se desmarcan las 6 del lunes, y quedan 4 celdas: la sesión 1 de martes a viernes

#### Scenario: Recreo no interactivo
- **GIVEN** un calendario con el recreo tras la 3ª sesión
- **THEN** la fila del recreo dice «Recreo» con sus horas y no tiene botones

#### Scenario: Modo preferidas con celdas bloqueadas
- **GIVEN** la cuadrícula editable en modo `preferred`, con el lunes entero bloqueado y el martes 2ª marcado y bloqueado
- **WHEN** se pulsa la cabecera «Lunes», la del «Martes» y la celda del martes 2ª
- **THEN** se cumple todo lo siguiente:
  - «Lunes» no cambia nada;
  - «Martes» marca las 5 celdas libres del martes;
  - la celda del martes 2ª se desmarca;
  - las celdas del lunes siguen deshabilitadas, con «Prohibida» en su nombre.

### Requirement: Página de franjas prohibidas
`/cursos/:courseId/carga/:subjectId/prohibidas` MUST servir `pages/SubjectSlotsPage.tsx` con el tipo `FORBIDDEN_SLOTS`. La página MUST colgar de `AuthenticatedLayout` sin `RequireRole`. MUST pedir la regla una sola vez, aunque `StrictMode` ejecute los efectos dos veces, y mostrar:
- **Mientras carga:** un `role="status"`.
- **Si falla:** un aviso con «Reintentar».
- **Con la regla:** el título «Franjas prohibidas de {asignatura} en {curso}» y la cuadrícula, con el `caption` del mismo texto.
- **Con celdas fuera del calendario:** «Hay {n} franjas fuera del calendario actual; se quitarán al guardar».
- **Avisos:** los de la asignatura, recalculados al marcar o desmarcar con la misma regla que el backend.
- **Enlace:** «Volver a la carga», hacia `/cursos/:courseId/carga`.

Para el `ADMIN`, «Guardar» MUST estar deshabilitado sin cambios (las celdas fuera del calendario cuentan como cambio) y llevar una guarda síncrona contra el doble envío. Al guardar:
- **`200`:** MUST mostrar «Franjas prohibidas guardadas» en un `role="status"` y seguir en la página con lo que respondió el servidor.
- **`404`, al cargar o al guardar:** MUST mostrar «Esta asignatura ya no se imparte en este curso o no existe», con el enlace a la carga.
- **`409`:** MUST mostrar «Este curso ya no tiene calendario».
- **`400` con `OUT_OF_RANGE`:** MUST volver a pedir la regla y avisar de que el calendario ha cambiado.
- **`403` y cualquier otro fallo:** MUST mostrar un aviso conservando lo marcado.

Los avisos de la página MUST verse en el color de peligro (rojo), con su texto:
- los de la asignatura;
- el de las celdas fuera del calendario;
- el de que el calendario ha cambiado;
- el de que el curso ya no tiene calendario.

El `MEMBER` MUST ver la cuadrícula sin botones y «Solo los administradores pueden modificar las franjas». Los textos MUST estar en `es.json` y `en.json`.

#### Scenario: Marcar, avisar y guardar
- **GIVEN** «Inglés» con 3 sesiones, sin máximo, en un curso con calendario
- **WHEN** el `ADMIN` marca lunes, martes y miércoles enteros
- **THEN** ve «No cabe en la semana con sus reglas» antes de guardar, y «Guardar» se habilita
- **AND** al guardar se envía un único `PUT` con todas las celdas marcadas, y ve «Franjas prohibidas guardadas»

#### Scenario: Bloques y recreo
- **GIVEN** «Plástica» con 2 sesiones en bloques de 2 y un calendario de 6 sesiones con el recreo entre la 3ª y la 4ª
- **WHEN** se prohíben todas las sesiones de los cinco días salvo la 3ª y la 4ª
- **THEN** ve que no cabe: ningún día tiene dos sesiones libres seguidas sin recreo

#### Scenario: Vista del miembro
- **GIVEN** un `MEMBER` y «Religión» con franjas
- **THEN** ve la cuadrícula con las celdas prohibidas como texto, ningún botón ni «Guardar», y el texto de solo administradores

#### Scenario: Accesibilidad
- **WHEN** se ejecuta `axe` sobre la página con celdas marcadas, un recreo y avisos, para los dos roles
- **THEN** no hay violaciones de WCAG 2.1 AA

### Requirement: Franjas prohibidas de extremo a extremo
`cypress/e2e/slots.cy.ts` MUST recorrer:
- Abrir las franjas desde la matriz, con la cuadrícula y su recreo.
- Marcar días con las cabeceras, guardar y ver el número en la matriz.
- Vaciar y que el número desaparezca.
- El aviso de «no cabe».
- El calendario que pasa a menos sesiones, con su aviso de celdas fuera, y guardar para quitarlas.
- Un curso sin calendario, sin enlace.
- El `MEMBER` sin edición.
- La cuadrícula a 360 px sin desplazamiento horizontal.

Cada `cy.intercept` MUST registrarse una sola vez.

#### Scenario: Recorrido
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/slots.cy.ts`
- **THEN** todos los tests pasan

