## MODIFIED Requirements

### Requirement: Contrato de la lectura del borrador en OpenAPI
`docs/api-spec.yml` MUST definir, bajo el tag `Schedule`, `GET /api/schedule/draft` (`ADMIN` y `MEMBER`, `Cache-Control: no-store`) con `200` y `{ schedule: ScheduleDetail | null }`, `401` sin sesión y `503` si la base de datos no responde, sin códigos de error nuevos. `GET /api/schedule/official` (capacidad `schedule-confirmation`) MUST devolver el mismo esquema. Los esquemas MUST ser:
- `ScheduleDetail` (antes `ScheduleDraft`): `id`, `status` (`DRAFT` | `OFFICIAL`), `generatedAt`, `placedSessions`, `confirmedAt` (fecha o `null`), `confirmedBy` (`{ firstName, lastName }` o `null`), `replacedAt` (fecha o `null`), `courses`, `subjects`, `professors` y `entries`; en un borrador los tres campos de confirmación son `null`;
- `ScheduleDraftCourse`: `id`, `name`, `calendar` (`{ id, name, periods }` con los periodos del esquema de calendarios, o `null`) y `classes` (`{ id, name }`);
- `ScheduleDraftSubject`: `id`, `name`, `code` (texto o `null`) y `color` (enum `SubjectColor`);
- `ScheduleDraftProfessor`: `id`, `firstName` y `lastName`;
- `ScheduleDraftEntry`: `courseId`, `classId`, `subjectId`, `professorId` (o `null`), `dayOfWeek` (1 a 5), `sessionNumber`, `startTime` y `endTime` (`HH:MM`, como los periodos de los calendarios; en la base de datos son minutos).
Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Tipos generados al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias

#### Scenario: Un borrador lleva la confirmación vacía
- **WHEN** se pide `GET /api/schedule/draft` con un borrador
- **THEN** la respuesta tiene `status: DRAFT` y `confirmedAt`, `confirmedBy` y `replacedAt` a `null`

### Requirement: Servicio del borrador en el frontend
`services/scheduleDraftService.ts` (`getDraft` y `getOfficial`, con `authorizedFetch`) MUST devolver `loaded` (con el horario o `null`), `unauthenticated` o `unavailable`, MUST NOT lanzar y MUST validar la forma: el estado (`DRAFT` en `getDraft`, `OFFICIAL` en `getOfficial`), los datos de confirmación (nulos en un borrador; `confirmedAt` y `confirmedBy` presentes en un oficial), los enums de color y de periodo, los días de 1 a 5, horas `HH:MM` con el inicio antes del fin, y que cada entrada apunte a un curso, una clase de ese curso, una asignatura y, si no es `null`, un profesor de la respuesta. Cualquier otra forma es `unavailable`.

#### Scenario: Respuesta incoherente
- **WHEN** una entrada apunta a una asignatura que no está en `subjects`
- **THEN** el servicio devuelve `unavailable`

#### Scenario: Estado que no toca
- **WHEN** `getOfficial` recibe un horario con `status: DRAFT`, o un oficial sin `confirmedAt`
- **THEN** el servicio devuelve `unavailable`

### Requirement: Página del horario borrador
`/horarios/borrador` (`pages/ScheduleDraftPage.tsx`, bajo `AuthenticatedLayout` sin `RequireRole`, para `ADMIN` y `MEMBER`) MUST pedir el borrador una sola vez por visita (también con `StrictMode`), mostrar un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. Con borrador MUST mostrar «Borrador», la fecha de generación, un selector de vista («Por clase», «Por profesor», «Todo el colegio») y el botón «Exportar» (ver la capacidad `schedule-export`); a un `ADMIN` MUST ofrecerle además «Confirmar como oficial» y «Descartar el borrador» (ver la capacidad `schedule-confirmation`). Sin borrador MUST decir «Todavía no hay ningún horario generado» con un enlace a `/horarios`, sin «Exportar» ni acciones; tampoco las hay mientras carga ni tras un fallo. Las tres vistas MUST construirse en el navegador desde la misma respuesta: cambiar de vista, clase, profesor o día MUST NOT hacer peticiones. Un `MEMBER` ve lo mismo que un `ADMIN`, salvo «Confirmar como oficial» y «Descartar el borrador». La misma página MUST servir `/horarios/oficial` (capacidad `schedule-confirmation`), elegida por la ruta.

#### Scenario: Abrir el borrador
- **GIVEN** un borrador generado
- **WHEN** abro `/horarios/borrador`
- **THEN** veo «Borrador», la fecha de generación, «Exportar» y la vista por clase con la primera clase del primer curso

#### Scenario: Acciones de un administrador
- **GIVEN** un borrador
- **WHEN** un `ADMIN` abre `/horarios/borrador`
- **THEN** ve «Confirmar como oficial» y «Descartar el borrador»

#### Scenario: Sin borrador
- **WHEN** abro `/horarios/borrador` en un colegio que nunca ha generado
- **THEN** leo «Todavía no hay ningún horario generado» y un enlace a «Generar horarios», y no hay «Exportar» ni acciones

#### Scenario: Fallo al cargar
- **WHEN** la petición falla
- **THEN** veo un aviso con «Reintentar», que vuelve a pedirla, y no hay «Exportar» ni acciones

#### Scenario: Miembro
- **WHEN** un `MEMBER` abre la página
- **THEN** ve las tres vistas y «Exportar» igual que un `ADMIN`, sin «Confirmar como oficial» ni «Descartar el borrador»
