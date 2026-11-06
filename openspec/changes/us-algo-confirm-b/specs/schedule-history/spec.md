## ADDED Requirements

### Requirement: Contrato de los horarios anteriores en OpenAPI
`docs/api-spec.yml` MUST definir, bajo el tag `Schedule`:
- `GET /api/schedule/previous` (`ADMIN` y `MEMBER`, `Cache-Control: no-store`): `200` con `{ schedules: ScheduleSummary[] }`, `401` y `503`;
- `GET /api/schedule/{id}` (`ADMIN` y `MEMBER`, `no-store`), añadido a la ruta que ya tiene el `delete`: `200` con `{ schedule: ScheduleDetail }`, `401`, `404 NOT_FOUND` y `503`.

MUST NOT añadirse códigos de error ni cambiarse los esquemas existentes. Los tipos del frontend MUST regenerarse.

#### Scenario: Contrato y tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias

### Requirement: Listar los horarios anteriores
`GET /api/schedule/previous` (caso de uso `ListPreviousSchedules`, repositorio `ScheduleReadRepository.listPrevious(schoolId)`) MUST devolver las cabeceras (`ScheduleSummary`, sin entradas) de los horarios `OFFICIAL` **sustituidos** (`replaced_at` no nulo) del colegio de la sesión, ordenadas por `replaced_at` descendente y, a igualdad, por `id` descendente, con un máximo de 100. El oficial vigente y el borrador MUST NOT aparecer. MUST ser para `ADMIN` y `MEMBER`, sin escrituras ni eventos de log, y el colegio MUST salir de la sesión.

#### Scenario: Dos sustituidos
- **GIVEN** un colegio en el que se confirmaron tres horarios seguidos (el primero y el segundo, sustituidos; el tercero, vigente)
- **WHEN** un `MEMBER` pide `GET /api/schedule/previous`
- **THEN** responde `200` con dos cabeceras, la del segundo primero y la del primero después, cada una con `confirmedAt`, `confirmedBy`, `replacedAt` y `placedSessions`, y sin el vigente

#### Scenario: Sin sustituidos
- **GIVEN** un colegio con un oficial vigente y un borrador
- **WHEN** se pide `GET /api/schedule/previous`
- **THEN** responde `200` con `{ schedules: [] }`

#### Scenario: Tope de 100
- **GIVEN** un colegio con 101 oficiales sustituidos
- **WHEN** se pide la lista
- **THEN** responde con los 100 sustituidos más recientemente

#### Scenario: Aislamiento por colegio
- **GIVEN** sustituidos en los colegios A y B
- **WHEN** un usuario del colegio B pide la lista
- **THEN** recibe solo los del colegio B

#### Scenario: Sin sesión
- **WHEN** se pide `GET /api/schedule/previous` sin token
- **THEN** responde `401`

### Requirement: Leer un horario oficial por id
`GET /api/schedule/{id}` (caso de uso `GetSchedule` con el selector `{ id }`) MUST devolver el horario `OFFICIAL` (vigente o sustituido) con ese id **del colegio de la sesión**, con la misma consulta única y la misma forma normalizada y ordenada (`ScheduleDetail`) que el borrador y el oficial vigente. El selector del repositorio MUST generalizarse a `ScheduleReadRepository.find(schoolId, 'draft' | 'official' | { id })` en lugar de duplicar la consulta. Un id que no es UUID, que no existe, que es de otro colegio o que es de un borrador MUST responder `404 NOT_FOUND` (`ScheduleNotFound`) sin distinguir el caso. La ruta `GET /:id` MUST declararse después de las literales (`/readiness`, `/draft`, `/official`, `/overview`, `/previous`, `/generate`). Los cursos (con su calendario actual), las clases, las asignaturas y los profesores MUST leerse como están hoy, igual que en el borrador y el oficial. MUST ser para `ADMIN` y `MEMBER`, sin escrituras ni eventos.

#### Scenario: Un sustituido
- **GIVEN** un oficial sustituido del colegio, confirmado por Ana García
- **WHEN** un `MEMBER` pide `GET /api/schedule/{id}` con su id
- **THEN** responde `200` con su `ScheduleDetail`: `status: 'OFFICIAL'`, `confirmedBy: { firstName: 'Ana', lastName: 'García' }`, `replacedAt` con fecha y sus entradas

#### Scenario: El oficial vigente
- **WHEN** se pide con el id del oficial vigente
- **THEN** responde `200` con `replacedAt: null`

#### Scenario: Ids que no son un oficial del colegio
- **WHEN** se pide con el id del borrador, el de un oficial de otro colegio, uno inexistente o `no-es-un-uuid`
- **THEN** responde `404 NOT_FOUND` en los cuatro casos

#### Scenario: Con los datos de hoy
- **GIVEN** un sustituido cuyo profesor se borró después de confirmarlo
- **WHEN** se pide por su id
- **THEN** sus entradas llevan `professorId: null` y ese profesor no está en `professors`

### Requirement: Servicios de los horarios anteriores en el frontend
`scheduleDraftService.getById(fetch, id)` MUST pedir `GET /api/schedule/{id}` (con el id codificado) y validar que la respuesta sea un `OFFICIAL` con su confirmación y `replacedAt` nulo o fecha: `loaded` con el horario, `notFound` en un `404`, `unauthenticated` en un `401` y `unavailable` en cualquier otro caso o si la forma no es válida. `scheduleService.previous(fetch)` MUST pedir `GET /api/schedule/previous` y validar cada cabecera como `OFFICIAL` con `replacedAt` de fecha: `loaded` con la lista, `unauthenticated` o `unavailable`. Ninguno de los dos MUST rechazar.

#### Scenario: Un borrador por id no se acepta
- **GIVEN** una respuesta `200` con un horario `DRAFT`
- **WHEN** `getById` la interpreta
- **THEN** devuelve `unavailable`

#### Scenario: Un 404
- **WHEN** `GET /api/schedule/{id}` responde `404`
- **THEN** `getById` devuelve `notFound`

### Requirement: Página de los horarios anteriores
`pages/PreviousSchedulesPage.tsx`, en `/horarios/anteriores` (bajo `AuthenticatedLayout` sin `RequireRole`, `data-testid="previous-schedules-page"`), MUST pedir la lista una vez (también con `StrictMode`), con un `role="status"` mientras carga y «Reintentar» si falla. Cada horario MUST ser una fila de una lista (`ul`) con «Confirmado el … por {nombre}», «Vigente hasta el …» y «N sesiones», y un enlace «Ver» a `/horarios/anteriores/:id` cuyo nombre accesible incluya la fecha («Ver el horario confirmado el …»). Sin anteriores MUST decir «Todavía no hay horarios anteriores». MUST tener un enlace «Volver a Generar horarios» a `/horarios`.

#### Scenario: La lista
- **GIVEN** dos sustituidos
- **WHEN** un `MEMBER` abre `/horarios/anteriores`
- **THEN** ve dos filas, la sustituida más recientemente primero, cada una con quién y cuándo la confirmó, hasta cuándo estuvo vigente, sus sesiones y «Ver»

#### Scenario: Sin anteriores
- **WHEN** se abre `/horarios/anteriores` en un colegio sin sustituidos
- **THEN** se lee «Todavía no hay horarios anteriores»

#### Scenario: Un fallo
- **GIVEN** que la lista falla
- **WHEN** se pulsa «Reintentar» y la lista responde
- **THEN** se ven las filas

### Requirement: Página de un horario anterior
`/horarios/anteriores/:id` MUST montar la página del horario (`ScheduleDraftPage`) con `which="previous"` y el id de la ruta, mediante un componente que lee `useParams` y la monta con `key={id}`, para que pasar de un anterior a otro la vuelva a pedir. MUST pedir `getById` una vez y mostrar el título «Horario anterior», la insignia «Sustituido» (con texto, nunca solo color), «Confirmado el … por {nombre} · Sustituido el …», «Generado el …» y el aviso «Se muestra con los datos de hoy: los profesores, las asignaturas y los calendarios pueden haber cambiado desde entonces», con las tres vistas, el estado en la URL y «Exportar», y MUST NOT ofrecer acciones de escritura. Si el id es el del oficial vigente MUST verse igual pero con la insignia «Oficial» y sin «Sustituido el …». Un `notFound` MUST decir «Este horario no existe» con un enlace «Ver los horarios anteriores» a `/horarios/anteriores`; un fallo, «Reintentar». MUST tener un enlace a `/horarios/anteriores`.

#### Scenario: Abrir un anterior
- **GIVEN** un sustituido
- **WHEN** un `ADMIN` pulsa «Ver» en la lista
- **THEN** llega a `/horarios/anteriores/:id` y ve «Horario anterior», «Sustituido», «Confirmado el … por … · Sustituido el …», el aviso de los datos de hoy, las tres vistas y «Exportar», sin «Confirmar» ni «Descartar»

#### Scenario: Datos de hoy
- **GIVEN** un sustituido cuyo profesor se borró después
- **WHEN** se abre
- **THEN** sus celdas dicen «Sin profesor»

#### Scenario: El vigente por id
- **WHEN** se abre `/horarios/anteriores/<id del oficial vigente>`
- **THEN** se ve con la insignia «Oficial» y sin «Sustituido el …»

#### Scenario: Un id que no existe
- **WHEN** se abre `/horarios/anteriores/<id inexistente>`
- **THEN** se lee «Este horario no existe» y un enlace a `/horarios/anteriores`

#### Scenario: Pasar de un anterior a otro
- **GIVEN** la página de un anterior abierta
- **WHEN** se navega a la de otro anterior
- **THEN** se pide y se muestra el segundo, no el primero

### Requirement: Accesibilidad, móvil e i18n de los horarios anteriores
A 360 px la lista y la página de un anterior MUST caber sin desplazamiento horizontal de la página, y MUST NOT dar violaciones de `axe` en los dos roles. El estado (oficial, sustituido) MUST indicarse con texto. Los textos MUST salir de `schedule.previous.*` en `es.json` y `en.json`.

#### Scenario: axe a 360 px
- **WHEN** se abren la lista y un anterior a 360 px
- **THEN** `axe` no da violaciones y la página no se desplaza en horizontal

### Requirement: Ver los anteriores de extremo a extremo
Un E2E con Cypress MUST confirmar dos horarios seguidos para tener un anterior, ver el enlace «Horarios anteriores (1)» en `/horarios`, abrir la lista, abrir el anterior, cambiar de vista y exportarlo; comprobar que un `MEMBER` ve la lista y el anterior sin acciones; y abrir la lista a 360 px.

#### Scenario: Recorrido completo
- **WHEN** se recorre el flujo
- **THEN** el enlace, la lista, la página del anterior y su exportación muestran lo esperado
