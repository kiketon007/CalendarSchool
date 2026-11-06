# schedule-confirmation Specification

## Purpose
TBD - created by archiving change us-algo-confirm. Update Purpose after archive.
## Requirements
### Requirement: Contrato de la confirmación en OpenAPI
`docs/api-spec.yml` MUST definir, bajo el tag `Schedule`:
- `POST /api/schedule/{id}/confirm` (`ADMIN`): `200` con `{ schedule: ScheduleSummary }`; `401`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 SCHEDULE_NOT_DRAFT` y `503`;
- `DELETE /api/schedule/{id}` (`ADMIN`): `204`; `401`, `403`, `404`, `409 SCHEDULE_NOT_DRAFT` y `503`;
- `GET /api/schedule/official` (`ADMIN` y `MEMBER`, `Cache-Control: no-store`): `200` con `{ schedule: ScheduleDetail | null }`, `401` y `503`;
- `GET /api/schedule/overview` (`ADMIN` y `MEMBER`, `no-store`): `200` con `{ draft: ScheduleSummary | null, official: ScheduleSummary | null, previousCount: integer }`, `401` y `503`;
- `ScheduleSummary`: `id`, `status` (`DRAFT` | `OFFICIAL`), `generatedAt`, `placedSessions`, `confirmedAt` (fecha o `null`), `confirmedBy` (`{ firstName, lastName }` o `null`) y `replacedAt` (fecha o `null`).

El código `SCHEDULE_NOT_DRAFT` MUST añadirse a la vez al enum `ErrorCode` y a `ERROR_CODES` (`appError.test.ts` falla si no coinciden). Los tipos del frontend MUST regenerarse.

#### Scenario: Contrato y tipos al día
- **WHEN** se ejecutan `npm run api:types:check -w frontend` y los tests de `appError`
- **THEN** terminan sin diferencias ni fallos

### Requirement: Oficial vigente y sustituidos en la base de datos
Una migración MUST añadir a `schedules` `confirmed_at` (`timestamptz`, nulo), `confirmed_by_id` (`uuid`, nulo, FK a `users` `ON DELETE RESTRICT`) y `replaced_at` (`timestamptz`, nulo), con `CHECK` escritos a mano: un `DRAFT` MUST NOT tener `confirmed_at`, `confirmed_by_id` ni `replaced_at`; un `OFFICIAL` MUST tener `confirmed_at` y `confirmed_by_id`; `replaced_at` MUST NOT ser anterior a `confirmed_at`. Un índice único parcial escrito a mano, `schedules_official_key (school_id) WHERE status = 'OFFICIAL' AND replaced_at IS NULL`, MUST garantizar un solo oficial **vigente** por colegio; los sustituidos (con `replaced_at`) no cuentan. `schedules_draft_key` se mantiene. Los horarios existentes son todos `DRAFT` y cumplen los `CHECK` sin migrar datos.

#### Scenario: Un oficial vigente por colegio
- **GIVEN** un `OFFICIAL` sin `replaced_at` del colegio
- **WHEN** se inserta otro `OFFICIAL` sin `replaced_at` del mismo colegio
- **THEN** la base lo rechaza; con `replaced_at`, lo acepta

#### Scenario: Restricciones de cada estado
- **WHEN** se escribe un `DRAFT` con `confirmed_at`, o un `OFFICIAL` sin `confirmed_by_id`, o un `replaced_at` anterior a `confirmed_at`
- **THEN** la base lo rechaza

### Requirement: Confirmar el borrador como oficial
`POST /api/schedule/{id}/confirm` (`ConfirmSchedule`, `requireRole('ADMIN')`) MUST, en una sola transacción: marcar `replaced_at = ahora` en el oficial vigente del colegio, si lo hay, y pasar el horario `id` de `DRAFT` a `OFFICIAL` con `confirmed_at = ahora` y `confirmed_by_id` = el usuario de la sesión, **solo si** es del colegio de la sesión y sigue siendo `DRAFT`. Si el horario no es de ningún colegio de la sesión o no existe, MUST responder `404 NOT_FOUND`; si existe pero ya no es `DRAFT`, `409 SCHEDULE_NOT_DRAFT`; en los dos casos la transacción se deshace y nada cambia. La violación de `schedules_official_key` MUST traducirse a `409 SCHEDULE_NOT_DRAFT`. Un id que no es UUID MUST ser `404` sin llegar al caso de uso. Confirmar MUST NOT depender de la comprobación previa ni de que haya una generación en curso. Responde `200` con el `ScheduleSummary` del horario confirmado.

#### Scenario: Confirmar el primer oficial
- **GIVEN** un borrador y ningún oficial
- **WHEN** un `ADMIN` confirma el borrador
- **THEN** responde `200`, el horario es `OFFICIAL` con `confirmedAt` y su nombre en `confirmedBy`, y ya no hay borrador

#### Scenario: Sustituir el oficial
- **GIVEN** un oficial vigente y un borrador
- **WHEN** se confirma el borrador
- **THEN** el borrador es el oficial vigente y el anterior sigue en la base con `replaced_at`, con todas sus entradas

#### Scenario: El borrador ya no existe
- **GIVEN** que otro administrador generó un borrador nuevo después de que yo abriese el anterior
- **WHEN** confirmo el id del anterior
- **THEN** responde `404` y nada cambia

#### Scenario: Ya no es borrador
- **GIVEN** un horario que ya se confirmó
- **WHEN** se confirma otra vez
- **THEN** responde `409 SCHEDULE_NOT_DRAFT` y nada cambia

#### Scenario: Dos confirmaciones a la vez
- **GIVEN** un borrador
- **WHEN** dos administradores lo confirman en paralelo
- **THEN** uno recibe `200` y el otro `409 SCHEDULE_NOT_DRAFT`, y hay un solo oficial vigente

#### Scenario: Confirmar con una generación en curso
- **GIVEN** un borrador y una generación `RUNNING`
- **WHEN** se confirma el borrador y luego la generación termina
- **THEN** el confirmado sigue siendo el oficial vigente y hay un borrador nuevo

#### Scenario: Otro colegio o un miembro
- **WHEN** un `ADMIN` de otro colegio confirma el id, o un `MEMBER` del mismo colegio lo intenta
- **THEN** recibe `404`, o `403 FORBIDDEN`, y nada cambia

### Requirement: Descartar el borrador
`DELETE /api/schedule/{id}` (`DiscardScheduleDraft`, `requireRole('ADMIN')`) MUST borrar el horario y sus entradas (cascada) **solo si** es el `DRAFT` del colegio de la sesión, y responder `204`. MUST responder `404` si no existe o es de otro colegio, y `409 SCHEDULE_NOT_DRAFT` si es un `OFFICIAL` (vigente o sustituido): un oficial no se borra. La generación que lo produjo MUST conservar su fila con `schedule_id` nulo.

#### Scenario: Descartar
- **GIVEN** un borrador y la generación que lo produjo
- **WHEN** un `ADMIN` lo descarta
- **THEN** responde `204`, el horario y sus entradas desaparecen, el oficial no cambia y la generación sigue `COMPLETED` con `scheduleId: null`

#### Scenario: Un oficial no se descarta
- **WHEN** se pide `DELETE` del oficial vigente o de uno sustituido
- **THEN** responde `409 SCHEDULE_NOT_DRAFT` y nada cambia

### Requirement: Leer el oficial y el resumen de los horarios
`GET /api/schedule/official` MUST devolver el oficial vigente del colegio con la misma forma normalizada que `GET /api/schedule/draft` (`ScheduleDetail`), o `{ schedule: null }`. `GET /api/schedule/overview` MUST devolver los resúmenes del borrador y del oficial vigente (o `null`) y `previousCount`, el número de oficiales sustituidos. Las dos lecturas MUST ser para `ADMIN` y `MEMBER`, `no-store`, sin escrituras ni eventos, con el colegio de la sesión. El repositorio y el caso de uso de lectura MUST generalizarse (`ScheduleReadRepository.find(schoolId, 'draft' | 'official')` y `GetSchedule`) en lugar de duplicarse.

#### Scenario: Con oficial
- **GIVEN** un oficial confirmado por Ana García y un borrador posterior
- **WHEN** se pide `GET /api/schedule/overview`
- **THEN** responde `200` con los dos resúmenes (el oficial con `confirmedBy: { firstName: 'Ana', lastName: 'García' }`) y `previousCount: 0`

#### Scenario: Sin oficial
- **WHEN** se pide `GET /api/schedule/official` en un colegio sin oficial
- **THEN** responde `200` con `{ schedule: null }`

#### Scenario: Aislamiento por colegio
- **WHEN** un usuario del colegio B pide el oficial o el resumen
- **THEN** recibe los del colegio B, nunca los del A

### Requirement: Observabilidad de la confirmación
Confirmar MUST emitir `SCHEDULE_CONFIRMED` (`school_id`, `actor_id`, `schedule_id`, `replaced_schedule_id` o nulo) y descartar `SCHEDULE_DRAFT_DISCARDED` (`school_id`, `actor_id`, `schedule_id`); un rechazo MUST emitir `SCHEDULE_CONFIRM_REJECTED` o `SCHEDULE_DISCARD_REJECTED` con `reason` (`NOT_FOUND` o `NOT_DRAFT`). Los eventos MUST NOT llevar nombres de colegio, cursos, asignaturas ni profesores.

#### Scenario: Log de una confirmación
- **WHEN** se confirma un borrador que sustituye a un oficial
- **THEN** el log tiene `SCHEDULE_CONFIRMED` con los dos ids y ningún nombre

### Requirement: Diálogo «Confirmar como oficial»
`components/ConfirmScheduleModal.tsx` MUST preguntar «¿Confirmar este horario como oficial?» y, si hay un oficial vigente, avisar «Sustituirá al horario oficial confirmado el …, que dejará de estar vigente (se conserva)». Si el borrador tiene desfases MUST avisar con sus cifras («N sesiones sin profesor», «N sesiones fuera del calendario actual», «N cursos sin calendario»), calculadas por una función pura (`draftGaps`) sobre el borrador cargado, sin impedir confirmar. MUST tener «Confirmar» y «Cancelar», una guarda síncrona contra la doble pulsación, y MUST NOT cerrarse mientras confirma. Al confirmar MUST ir a `/horarios/oficial` con el aviso «Horario confirmado como oficial». Un `404` MUST decir «Este borrador ya no existe: puede que se haya generado otro» con un enlace a `/horarios`; un `409`, «Este borrador ya se ha confirmado o descartado»; un fallo de red, un aviso con «Reintentar» sin cerrar.

#### Scenario: Con un oficial y desfases
- **GIVEN** un oficial confirmado el 3 de noviembre y un borrador con 3 sesiones sin profesor
- **WHEN** un `ADMIN` abre el diálogo
- **THEN** lee que sustituirá al oficial confirmado el 3 de noviembre y «3 sesiones sin profesor», y puede confirmar

#### Scenario: Doble pulsación
- **WHEN** pulsa «Confirmar» dos veces seguidas
- **THEN** se envía una sola petición

### Requirement: Diálogo «Descartar el borrador»
`components/DiscardScheduleDraftModal.tsx` MUST preguntar «¿Descartar el borrador? Se eliminará y no se puede recuperar. El horario oficial no cambia.», con «Descartar» y «Cancelar» y la misma guarda. Al descartar MUST ir a `/horarios` con el aviso «Borrador descartado»; `404` y `409` como en el diálogo de confirmar.

#### Scenario: Descartar desde la página
- **WHEN** un `ADMIN` descarta el borrador desde `/horarios/borrador`
- **THEN** llega a `/horarios` con «Borrador descartado» y ya no hay borrador

### Requirement: Página del horario oficial
`/horarios/oficial` (bajo `AuthenticatedLayout` sin `RequireRole`, para `ADMIN` y `MEMBER`) MUST ser la misma página que la del borrador, generalizada por la ruta: pide `GET /api/schedule/official` una vez, con las tres vistas, el estado en la URL y «Exportar». MUST mostrar la insignia «Oficial» (con texto, nunca solo color), «Confirmado el … por {nombre}» y «Generado el …», sin acciones de escritura. Sin oficial MUST decir «Todavía no hay ningún horario oficial» con un enlace a `/horarios`.

#### Scenario: Un miembro ve el oficial
- **GIVEN** un oficial
- **WHEN** un `MEMBER` abre `/horarios/oficial`
- **THEN** ve «Oficial», «Confirmado el … por …», las tres vistas y «Exportar», sin «Confirmar» ni «Descartar»

#### Scenario: Sin oficial
- **WHEN** se abre `/horarios/oficial` sin oficial
- **THEN** se lee «Todavía no hay ningún horario oficial» y un enlace a `/horarios`

### Requirement: Resumen del oficial en «Generar horarios»
`/horarios` MUST mostrar arriba, a los dos roles, `components/OfficialScheduleSummary.tsx` con `GET /api/schedule/overview`: «Horario oficial: confirmado el … por …» y un enlace «Ver horario oficial», o «Todavía no hay ningún horario oficial». Si `previousCount` es mayor que 0, el resumen MUST enlazar además «Horarios anteriores (N)» a `/horarios/anteriores` (US-ALGO-CONFIRM_b); con 0, MUST NOT mostrar ese enlace. Debajo siguen la comprobación y el panel de generación. Un fallo del resumen MUST NOT impedir usar la comprobación ni el panel.

#### Scenario: Con oficial
- **GIVEN** un oficial
- **WHEN** un `MEMBER` abre `/horarios`
- **THEN** ve arriba «Horario oficial: confirmado el … por …» y «Ver horario oficial»

#### Scenario: Con horarios anteriores
- **GIVEN** un oficial vigente y dos sustituidos
- **WHEN** un `MEMBER` abre `/horarios`
- **THEN** el resumen enlaza «Horarios anteriores (2)» a `/horarios/anteriores`

#### Scenario: Sin horarios anteriores
- **GIVEN** un oficial vigente y ningún sustituido
- **WHEN** se abre `/horarios`
- **THEN** el resumen no tiene el enlace «Horarios anteriores»

### Requirement: Accesibilidad, móvil e i18n de la confirmación
Los diálogos MUST manejarse con teclado (el foco vuelve al botón que los abrió), caber a 360 px y no dar violaciones de `axe`, igual que la página del oficial y el resumen. El estado (oficial, borrador) MUST indicarse con texto. Los textos MUST salir de `schedule.official.*`, `schedule.confirm.*` y `schedule.discard.*` de `es.json` y `en.json`.

#### Scenario: axe y teclado
- **WHEN** se abre cada diálogo con el teclado y se cancela
- **THEN** `axe` no da violaciones y el foco vuelve al botón que lo abrió

### Requirement: Confirmar de extremo a extremo
Un E2E con Cypress MUST generar, confirmar desde `/horarios/borrador`, ver el oficial, generar otro borrador y confirmarlo desde el panel (sustituye al anterior), descartar un borrador, comprobar que un `MEMBER` ve el oficial sin acciones y abrir los diálogos a 360 px.

#### Scenario: Ciclo completo
- **WHEN** se recorre el flujo
- **THEN** cada paso deja el oficial, el borrador y el resumen de `/horarios` como se espera

