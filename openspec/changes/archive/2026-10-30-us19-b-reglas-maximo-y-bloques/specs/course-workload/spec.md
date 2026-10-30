## MODIFIED Requirements

### Requirement: Contrato de la carga horaria en OpenAPI
`docs/api-spec.yml` MUST documentar `GET /api/courses/{id}/workload` (`getCourseWorkload`) y `PATCH /api/courses/{id}/workload` (`updateCourseWorkload`), con seguridad Bearer, y estos esquemas:
- **`WorkloadWarningCode`:** `COURSE_WITHOUT_CALENDAR` y `WORKLOAD_EXCEEDS_SLOTS` para el curso; `BLOCK_LARGER_THAN_LOAD` y `SUBJECT_DOES_NOT_FIT` para una asignatura. La descripción MUST decir qué códigos van en cada lista.
- **`WorkloadWarning`:** `code` obligatorio; `assigned` y `available`, enteros presentes en `WORKLOAD_EXCEEDS_SLOTS`.
- **`CourseWorkloadSubject`:**
  - `id`, `name`, `code` (texto o `null`), `color` y `status`.
  - `sessionsPerWeek`: entero de 1 a 5 o `null`.
  - `maxPerDay`: entero de 2 a 5 o `null`.
  - `blockSize`: entero de 2 a 3 o `null`.
  - `constraintCount`: entero no negativo.
  - `warnings`: lista de `WorkloadWarning`.
- **`CourseWorkload`:**
  - `course`: con `id` y `name`.
  - `calendar`: `{ id, name, sessionsPerDay, maxConsecutiveSessions }` o `null`.
  - `subjects`: lista de `CourseWorkloadSubject`.
  - `assignedSessions`.
  - `availableSessions`: entero o `null`.
  - `warnings`: lista de `WorkloadWarning`.
- **`CourseWorkloadResponse`:** `{ workload: CourseWorkload }`.
- **`UpdateCourseWorkloadRequest`:** `changes` obligatorio, de 1 a 200 elementos `{ subjectId, sessionsPerWeek, maxPerDay, blockSize }`, los cuatro obligatorios y sin más propiedades. `sessionsPerWeek` es un entero de 1 a 5 o `null`; `maxPerDay`, de 2 a 5 o `null`; `blockSize`, de 2 a 3 o `null`.

Respuestas que MUST declarar cada operación:
- **`GET`:** `200` (`CourseWorkloadResponse`, `no-store`), `401`, `404`, `500` y `503`.
- **`PATCH`:** `200` (`CourseWorkloadResponse`, `no-store`), `400`, `401`, `403`, `404`, `500` y `503`.

El `404` MUST usar la respuesta reutilizable `CourseNotFound`. La descripción del `PATCH` MUST decir que es solo para `ADMIN`, que solo lleva las filas que cambian, que cada fila lleva su estado final y que un `null` en una regla la borra. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `getCourseWorkload` y `updateCourseWorkload`
- **THEN** las dos exigen Bearer y declaran las respuestas indicadas, solo `updateCourseWorkload` declara `400` y `403`, y las dos declaran `404` con `CourseNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija:
  - Las dos operaciones.
  - Los esquemas `CourseWorkload` (con `maxConsecutiveSessions`), `CourseWorkloadSubject` (con `maxPerDay`, `blockSize`, `constraintCount` y `warnings`), `UpdateCourseWorkloadRequest` (con los cuatro campos), `WorkloadWarning` y `WorkloadWarningCode` (con los cuatro códigos).

## ADDED Requirements

### Requirement: Reglas en la lectura de la carga
`GET /api/courses/{id}/workload` MUST devolver, en cada asignatura:
- `maxPerDay`: el valor de su regla `MAX_PER_DAY` en el curso, o `null`.
- `blockSize`: el de su regla `BLOCK`, o `null`.
- `constraintCount`: el número de reglas de la pareja, de cualquier tipo; 0 si no se imparte.
- `warnings`: sus avisos (los de «Avisos de las reglas de una asignatura»); vacía si no se imparte.

`calendar.maxConsecutiveSessions` MUST ser el tramo más largo de periodos `SESSION` seguidos por `position` sin un `BREAK` entre medias. Los avisos del curso MUST NOT cambiar.

#### Scenario: Asignatura con reglas
- **GIVEN** «Inglés» con 4 sesiones, «Máximo al día: 2» y «Bloques: De 2» en 1º
- **WHEN** se pide la carga de 1º
- **THEN** «Inglés» tiene `maxPerDay: 2`, `blockSize: 2`, `constraintCount: 2` y `warnings: []`

#### Scenario: Asignatura que no se imparte
- **WHEN** se pide la carga y «Música» no se imparte en el curso
- **THEN** «Música» tiene `sessionsPerWeek`, `maxPerDay` y `blockSize` a `null`, `constraintCount: 0` y `warnings: []`

#### Scenario: Tramo más largo sin recreo
- **GIVEN** un calendario con 3 sesiones, un recreo y 3 sesiones
- **THEN** `calendar.sessionsPerDay` es 6 y `calendar.maxConsecutiveSessions` es 3

### Requirement: Escribir las reglas con el PATCH de la carga
Cada cambio de `PATCH /api/courses/{id}/workload` MUST dejar la fila de la asignatura en el curso tal como dice: sus sesiones, su `MAX_PER_DAY` y su `BLOCK`. Un valor MUST crear la regla o cambiar su valor, y un `null` MUST borrarla. Con `sessionsPerWeek: null`, la pareja se borra y sus reglas caen por la cascada.

Las reglas MUST escribirse en la misma transacción que las sesiones, después de crear la pareja si es nueva y bajo los mismos bloqueos (asignaturas `FOR UPDATE` en orden de `id` y curso `FOR SHARE`). Las reglas que no cambian MUST NOT escribirse.

Si falla cualquier escritura, MUST NOT quedar ningún cambio ni en la carga ni en las reglas. Unas reglas que no caben MUST guardarse igual: solo se avisa.

#### Scenario: Máximo al día
- **GIVEN** «Inglés» con 4 sesiones en 1º
- **WHEN** un `ADMIN` envía `{ subjectId: Inglés, sessionsPerWeek: 4, maxPerDay: 2, blockSize: null }`
- **THEN** la respuesta es `200` con «Inglés» `maxPerDay: 2` y `constraintCount: 1`
- **WHEN** después envía la misma fila con `maxPerDay: null`
- **THEN** la regla se borra y `constraintCount` es 0

#### Scenario: Asignatura nueva con reglas
- **GIVEN** «Plástica» que no se imparte en 1º
- **WHEN** se envía con `sessionsPerWeek: 3` y `blockSize: 2`
- **THEN** «Plástica» se imparte en 1º con 3 sesiones y bloques de 2, sin avisos

#### Scenario: Bloque mayor que la carga
- **WHEN** se envía «Plástica» con 1 sesión y `blockSize: 2`
- **THEN** la respuesta es `200`, se guarda, y la asignatura lleva `BLOCK_LARGER_THAN_LOAD`

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar la inserción en `scheduling_constraints`
- **WHEN** se envía un cambio que sube las sesiones de «Inglés» y le pone un máximo
- **THEN** la petición falla y ni las sesiones ni las reglas de «Inglés» han cambiado

### Requirement: Validación de las reglas en el cambio de carga
Cada elemento de `changes` MUST tener presentes `maxPerDay` y `blockSize`:
- **Ausente:** `REQUIRED`.
- **No es un entero:** `INVALID_FORMAT`.
- **Fuera de rango:** `OUT_OF_RANGE` (de 2 a 5 para `maxPerDay` y de 2 a 3 para `blockSize`).

Los errores van en `changes[<i>].maxPerDay` y `changes[<i>].blockSize`. Con `sessionsPerWeek: null`, un `maxPerDay` o un `blockSize` distinto de `null` MUST dar `NOT_ALLOWED` en ese campo.

Los errores MUST seguir el orden `subjectId`, `sessionsPerWeek`, `maxPerDay` y `blockSize` en cada cambio, responder `400 VALIDATION_ERROR` y MUST NOT cambiar nada.

#### Scenario: Valores fuera de rango
- **WHEN** se envían `maxPerDay: 1`, `maxPerDay: 6`, `blockSize: 1` y `blockSize: 4` en cuatro cambios
- **THEN** la respuesta es `400` con `OUT_OF_RANGE` en cada uno de esos campos

#### Scenario: Regla sin carga
- **WHEN** se envía `sessionsPerWeek: null` con `maxPerDay: 2`
- **THEN** la respuesta es `400` con `NOT_ALLOWED` en `changes[0].maxPerDay` y nada cambia

#### Scenario: Campo ausente
- **WHEN** se envía un cambio sin `blockSize`
- **THEN** la respuesta es `400` con `REQUIRED` en `changes[0].blockSize`

### Requirement: Concurrencia de las reglas
Ninguna combinación de un `PATCH` con reglas con estas operaciones MUST terminar en `500` ni en interbloqueo, ni dejar una regla sin su pareja:
- La edición de la misma asignatura que quita ese curso.
- El borrado de la asignatura.
- El borrado del curso.
- Otro `PATCH` sobre la misma asignatura.

#### Scenario: Reglas contra edición de la asignatura
- **WHEN** a la vez se ponen reglas a «Inglés» en la carga de 1º y se edita «Inglés» quitando 1º, varias rondas
- **THEN** las dos terminan sin `500` ni interbloqueo y, si gana la edición, no queda ninguna regla de «Inglés» en 1º

#### Scenario: Reglas contra borrado del curso
- **WHEN** a la vez se ponen reglas en la carga de 1º y se borra 1º, varias rondas
- **THEN** el borrado responde `200`, el `PATCH` responde `200` o `404`, y no queda ninguna regla de 1º

### Requirement: Eventos de log de las reglas
`COURSE_WORKLOAD_UPDATED` MUST llevar además `constraints_set` (reglas creadas o con su valor cambiado) y `constraints_removed` (reglas borradas, también las que caen por la cascada al quitar la pareja). Un `PATCH` que solo cambia reglas MUST registrar el evento; uno que no cambia ni sesiones ni reglas, MUST NOT. Los eventos MUST NOT llevar nombres.

#### Scenario: Reglas registradas
- **GIVEN** «Inglés» con un máximo de 2 en 1º y «Lengua» sin reglas
- **WHEN** se quita «Inglés» del curso y se ponen bloques de 2 a «Lengua»
- **THEN** el log lleva `COURSE_WORKLOAD_UPDATED` con `subjects_removed: 1`, `constraints_set: 1` y `constraints_removed: 1`, y ningún nombre

#### Scenario: Solo reglas
- **WHEN** se cambia solo el máximo de «Inglés»
- **THEN** el log lleva `COURSE_WORKLOAD_UPDATED` con `subjects_changed: 0` y `constraints_set: 1`

### Requirement: Reglas en la matriz del administrador
En la matriz, cada fila MUST tener, además del selector de sesiones:
- **«Máximo al día»:** con las opciones «1 (por defecto)», 2, 3, 4 y 5, y la etiqueta accesible «Máximo al día de {asignatura}».
- **«Bloques»:** con «Sin bloques», «De 2» y «De 3», y la etiqueta accesible «Bloques de {asignatura}».

Con «No se imparte», los dos MUST estar deshabilitados y valer «1 (por defecto)» y «Sin bloques».

Al editar:
- Los avisos de cada fila MUST recalcularse mientras se edita, con la misma regla que el backend: «{asignatura}: con {n} sesiones no puede ir en bloques de {k}» y «{asignatura} no cabe en la semana con sus reglas».
- Al pasar a «No se imparte» una asignatura con reglas en el curso, MUST verse «Al guardar se borrarán sus {n} reglas en este curso», ligado a su selector de sesiones por `aria-describedby`.
- «Guardar» MUST habilitarse con cualquier campo distinto de lo cargado y enviar la fila entera de cada asignatura cambiada.

#### Scenario: Poner bloques
- **GIVEN** «Plástica» con 3 sesiones en 1º
- **WHEN** el `ADMIN` elige «Bloques: De 2» y guarda
- **THEN** se envía un `PATCH` con `{ sessionsPerWeek: 3, maxPerDay: null, blockSize: 2 }` para «Plástica» y no se ve ningún aviso

#### Scenario: Aviso mientras se edita
- **WHEN** el `ADMIN` baja «Plástica» a 1 sesión con bloques de 2
- **THEN** ve «Plástica: con 1 sesión no puede ir en bloques de 2» antes de guardar y «Guardar» sigue habilitado

#### Scenario: Selectores sin carga y aviso de pérdida
- **GIVEN** «Inglés» con 2 reglas en 1º
- **WHEN** el `ADMIN` la pasa a «No se imparte»
- **THEN** los dos selectores quedan deshabilitados y ve «Al guardar se borrarán sus 2 reglas en este curso»

### Requirement: Reglas en la vista del miembro
Para un `MEMBER`, cada asignatura que se imparte MUST mostrar sus reglas como texto junto a sus sesiones («Inglés: 4 sesiones · como mucho 2 al día · en bloques de 2», sin la parte que no tenga) y sus avisos, sin selectores.

#### Scenario: Miembro
- **GIVEN** «Inglés» con 4 sesiones, máximo 2 y bloques de 2 en 1º
- **WHEN** un `MEMBER` abre la carga de 1º
- **THEN** ve «Inglés: 4 sesiones · como mucho 2 al día · en bloques de 2» y ningún selector

### Requirement: Accesibilidad y responsive de las reglas en la carga
Cada selector nuevo MUST tener su etiqueta accesible. Los avisos de pérdida MUST ligarse por `aria-describedby`. La página MUST NOT tener violaciones de `axe` con reglas y avisos. A 360 px, los tres selectores de una fila MUST apilarse sin desplazamiento horizontal. Los textos nuevos y los dos códigos de aviso MUST estar en `es.json` y `en.json`.

#### Scenario: Móvil con reglas
- **WHEN** se abre a 360 px la carga de un curso con una asignatura de nombre muy largo y reglas
- **THEN** no hay desplazamiento horizontal y los tres selectores de la fila se ven y se usan

#### Scenario: Sin violaciones con avisos
- **WHEN** se analiza con `axe` la matriz con un aviso de bloque y un aviso de pérdida
- **THEN** no hay violaciones

### Requirement: Reglas de la carga de extremo a extremo
`cypress/e2e/workload.cy.ts` MUST recorrer además:
- Poner un máximo y unos bloques y verlos en la tarjeta de la asignatura («· 2 reglas»).
- El aviso de un bloque mayor que la carga.
- Pasar a «No se imparte» una asignatura con reglas, con su aviso de pérdida, y ver que las reglas desaparecen.
- Un `MEMBER` que ve las reglas como texto.
- La matriz con reglas a 360 px.

#### Scenario: Recorrido con reglas
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/workload.cy.ts`
- **THEN** todos los tests pasan
