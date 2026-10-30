## ADDED Requirements

### Requirement: Franjas prohibidas en la carga de un curso
`GET` y `PATCH /api/courses/{id}/workload` MUST devolver, en cada asignatura, `forbiddenSlots`: las celdas de su regla `FORBIDDEN_SLOTS` que existen en el calendario actual, ordenadas por día y por sesión, o `[]` si no se imparte, no tiene regla o el curso no tiene calendario. El calendario MUST llevar `sessionGroups`: los tamaños de sus tramos de sesiones seguidas entre recreos, en orden, cuya suma es `sessionsPerDay` y cuyo máximo es `maxConsecutiveSessions`.

Los avisos de cada asignatura MUST incluir las franjas y `SLOTS_OUTSIDE_CALENDAR`, como dice `scheduling-constraints`. El `PATCH` MUST NOT tocar las celdas. Si quita la asignatura del curso, la regla de franjas cae por la cascada y cuenta como una regla en `constraints_removed`.

#### Scenario: Celdas y tramos en la lectura
- **GIVEN** 1º con un calendario de 6 sesiones y el recreo tras la 3ª, y «Religión» con lunes y miércoles enteros prohibidos
- **WHEN** se pide la carga de 1º
- **THEN** `calendar.sessionGroups` es `[3, 3]`, `maxConsecutiveSessions` es 3, «Religión» tiene 12 celdas en `forbiddenSlots` y su `constraintCount` cuenta la regla de franjas

#### Scenario: Quitar la asignatura se lleva las franjas
- **GIVEN** «Religión» con franjas en 1º
- **WHEN** se envía `sessionsPerWeek: null` para «Religión» en la carga de 1º
- **THEN** no queda ninguna celda de «Religión» en 1º y `constraints_removed` cuenta 1 por la regla de franjas

### Requirement: Enlace a las franjas prohibidas desde la carga
Con calendario, cada asignatura que se imparte MUST llevar el enlace «Franjas prohibidas» hacia `/cursos/:courseId/carga/:subjectId/prohibidas`:
- **Matriz del `ADMIN`:** en su fila.
- **Vista del `MEMBER`:** en su elemento de la lista.

El enlace MUST llevar el número de celdas guardadas si hay alguna («Franjas prohibidas (18)») y el `aria-label` «Franjas prohibidas de {asignatura}», que contiene el texto visible. Sin calendario, el enlace MUST NOT aparecer y la fila de una asignatura que se imparte MUST decir «Asigna un calendario para definir franjas». La matriz MUST recalcular los avisos de cada asignatura con sus `forbiddenSlots` mientras se editan las sesiones y las reglas.

#### Scenario: Enlace con el número de celdas
- **GIVEN** 1º con calendario, «Religión» con 18 celdas prohibidas e «Inglés» sin franjas
- **WHEN** el `ADMIN` o un `MEMBER` abre la carga de 1º
- **THEN** ven «Franjas prohibidas (18)» en «Religión» y «Franjas prohibidas» en «Inglés», y el enlace de «Religión» lleva a sus franjas

#### Scenario: Sin calendario
- **GIVEN** 1º sin calendario
- **THEN** no hay enlaces de franjas y cada asignatura que se imparte dice «Asigna un calendario para definir franjas»

#### Scenario: Aviso recalculado con las franjas
- **GIVEN** «Inglés» con 3 sesiones y lunes y martes enteros prohibidos
- **WHEN** el `ADMIN` sube sus sesiones a 4 en la matriz, sin guardar
- **THEN** ve «No cabe en la semana con sus reglas» en su fila

## MODIFIED Requirements

### Requirement: Contrato de la carga horaria en OpenAPI
`docs/api-spec.yml` MUST documentar `GET /api/courses/{id}/workload` (`getCourseWorkload`) y `PATCH /api/courses/{id}/workload` (`updateCourseWorkload`), con seguridad Bearer, y estos esquemas:
- **`WorkloadWarningCode`:** `COURSE_WITHOUT_CALENDAR` y `WORKLOAD_EXCEEDS_SLOTS` para el curso; `BLOCK_LARGER_THAN_LOAD`, `SUBJECT_DOES_NOT_FIT` y `SLOTS_OUTSIDE_CALENDAR` para una asignatura. La descripción MUST decir qué códigos van en cada lista.
- **`WorkloadWarning`:** `code` obligatorio; `assigned` y `available`, enteros presentes en `WORKLOAD_EXCEEDS_SLOTS`; `count`, entero presente en `SLOTS_OUTSIDE_CALENDAR`.
- **`SlotCell`:** `{ dayOfWeek, sessionNumber }`.
- **`CourseWorkloadSubject`:**
  - `id`, `name`, `code` (texto o `null`), `color` y `status`.
  - `sessionsPerWeek`: entero de 1 a 5 o `null`.
  - `maxPerDay`: entero de 2 a 5 o `null`.
  - `blockSize`: entero de 2 a 3 o `null`.
  - `constraintCount`: entero no negativo.
  - `forbiddenSlots`: lista de `SlotCell`.
  - `warnings`: lista de `WorkloadWarning`.
- **`CourseWorkload`:**
  - `course`: con `id` y `name`.
  - `calendar`: `{ id, name, sessionsPerDay, maxConsecutiveSessions, sessionGroups }` o `null`, con `sessionGroups` como lista de enteros de 1 a 8.
  - `subjects`: lista de `CourseWorkloadSubject`.
  - `assignedSessions`.
  - `availableSessions`: entero o `null`.
  - `warnings`: lista de `WorkloadWarning`.
- **`CourseWorkloadResponse`:** `{ workload: CourseWorkload }`.
- **`UpdateCourseWorkloadRequest`:** `changes` obligatorio, de 1 a 200 elementos `{ subjectId, sessionsPerWeek, maxPerDay, blockSize }`, los cuatro obligatorios y sin más propiedades. `sessionsPerWeek` es un entero de 1 a 5 o `null`; `maxPerDay`, de 2 a 5 o `null`; `blockSize`, de 2 a 3 o `null`.

Respuestas que MUST declarar cada operación:
- **`GET`:** `200` (`CourseWorkloadResponse`, `no-store`), `401`, `404`, `500` y `503`.
- **`PATCH`:** `200` (`CourseWorkloadResponse`, `no-store`), `400`, `401`, `403`, `404`, `500` y `503`.

El `404` MUST usar la respuesta reutilizable `CourseNotFound`. La descripción del `PATCH` MUST decir que es solo para `ADMIN`, que solo lleva las filas que cambian, que cada fila lleva su estado final, que un `null` en una regla la borra y que no toca las franjas. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `getCourseWorkload` y `updateCourseWorkload`
- **THEN** las dos exigen Bearer y declaran las respuestas indicadas, solo `updateCourseWorkload` declara `400` y `403`, y las dos declaran `404` con `CourseNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija:
  - Las dos operaciones.
  - Los esquemas `CourseWorkload` (con `maxConsecutiveSessions` y `sessionGroups`), `CourseWorkloadSubject` (con `maxPerDay`, `blockSize`, `constraintCount`, `forbiddenSlots` y `warnings`), `UpdateCourseWorkloadRequest` (con los cuatro campos), `WorkloadWarning` (con `count`) y `WorkloadWarningCode` (con los cinco códigos).
