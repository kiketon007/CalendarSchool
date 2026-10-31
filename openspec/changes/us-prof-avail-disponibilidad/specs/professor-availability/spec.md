## ADDED Requirements

### Requirement: Contrato de la disponibilidad en OpenAPI
`docs/api-spec.yml` MUST documentar las dos operaciones, con seguridad Bearer y el parámetro `id` de los profesores:
- **`GET /api/professors/{id}/availability`** (`getProfessorAvailability`): `200` (`no-store`), `401`, `404`, `500` y `503`.
- **`PUT /api/professors/{id}/availability`** (`updateProfessorAvailability`): `200` (`no-store`), `400`, `401`, `404`, `500` y `503`.

Las dos responden con `ProfessorAvailabilityResponse`: `{ success: true, data: { availability: { professorId, unavailable: ProfessorUnavailability[] } } }`.

El cuerpo del `PUT` es `UpdateProfessorAvailabilityRequest`, `{ unavailable: ProfessorUnavailability[] }`.

`ProfessorUnavailability` es `{ dayOfWeek, startTime, endTime }`:
- `dayOfWeek` es un entero de 1 a 5;
- las horas van en «HH:MM», con el patrón de los calendarios.

No hay códigos de error nuevos ni `403`. Los tipos del frontend MUST regenerarse.

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias
- **AND** `api/schema.test.ts` fija las dos operaciones, sus respuestas y `ProfessorUnavailability`

### Requirement: Tabla de tramos no disponibles
La base de datos MUST tener `professor_unavailabilities` con estas columnas:
- `id`: UUIDv7;
- `school_id`: FK a `schools`, con índice;
- `professor_id`: FK a `professors`, con `ON DELETE CASCADE` y con índice;
- `day_of_week`: `SMALLINT`;
- `start_minute` y `end_minute`: `SMALLINT`, minutos desde las 00:00;
- `created_at`.

La migración MUST llevar `CHECK` escritos a mano para `day_of_week` entre 1 y 5, `start_minute >= 0`, `end_minute <= 1439` y `start_minute < end_minute`.

Un profesor sin filas está disponible a cualquier hora.

#### Scenario: Restricciones de la tabla
- **WHEN** se inserta directamente una fila con día 6, con `end_minute` 1440 o con el inicio igual al fin
- **THEN** la base de datos la rechaza por el `CHECK` correspondiente

#### Scenario: Cascada al borrar el profesor
- **GIVEN** un profesor con tramos
- **WHEN** se borra el profesor
- **THEN** sus tramos desaparecen

### Requirement: Normalización de los tramos
Antes de guardar y al leer, los tramos MUST pasar por `normalizeUnavailability`, una función pura del dominio:
- ordena por día y por inicio;
- une los tramos del mismo día que se solapan o se tocan (el fin de uno igual al inicio del siguiente);
- nunca une tramos de días distintos.

El frontend repite la misma regla. Los dos lados recorren la tabla `test-fixtures/professor-unavailability-normalization.json`.

#### Scenario: Tramos contiguos
- **GIVEN** el lunes 09:00–09:45 y el lunes 09:45–10:30
- **THEN** la normalización da un solo tramo, el lunes 09:00–10:30

#### Scenario: Tramos solapados y desordenados
- **GIVEN** el martes 11:00–12:00, el lunes 10:00–11:00 y el martes 10:30–11:15
- **THEN** la normalización da el lunes 10:00–11:00 y el martes 10:30–12:00

#### Scenario: Días distintos
- **GIVEN** el lunes 09:00–10:00 y el martes 09:00–10:00
- **THEN** quedan los dos tramos

### Requirement: Leer la disponibilidad con GET
`GET /api/professors/{id}/availability` MUST responder `200` a un `ADMIN` o un `MEMBER` del colegio con los tramos del profesor, ya normalizados, y `no-store`. La lectura no cambia nada.

Responde `404 NOT_FOUND` sin distinguir el caso en estas situaciones: el `id` no es un UUID (validado en el router), el profesor no existe o es de otro colegio.

Sin sesión, `401 INVALID_SESSION`; con la base de datos caída, `503`.

#### Scenario: Profesor sin tramos
- **WHEN** se pide la disponibilidad de un profesor nuevo
- **THEN** responde `200` con `unavailable: []`

#### Scenario: Profesor de otro colegio
- **WHEN** se pide la disponibilidad de un profesor de otro colegio
- **THEN** responde `404 NOT_FOUND`

### Requirement: Guardar la disponibilidad con PUT
`PUT /api/professors/{id}/availability` MUST dejar los tramos del profesor exactamente como el cuerpo, ya normalizado, en una sola transacción:
1. bloquea al profesor con `SELECT … FROM professors WHERE id = … AND school_id = … FOR UPDATE`; sin fila, `404` y nada más;
2. borra sus filas;
3. inserta las nuevas.

Responde `200` con lo guardado, ya normalizado. Lo pueden hacer `ADMIN` y `MEMBER`. Gana el último guardado.

Si lo normalizado ya es lo guardado, MUST NOT escribir ni registrar evento.

Errores de campo (`400 VALIDATION_ERROR`), en el orden del cuerpo:
- `unavailable`: `REQUIRED` si falta o no es una lista, `INVALID_LENGTH` con más de 200 tramos;
- `unavailable[i].dayOfWeek`: `REQUIRED` o `OUT_OF_RANGE` si no es un entero de 1 a 5;
- `unavailable[i].startTime` y `.endTime`: `REQUIRED` o `INVALID_FORMAT`;
- `unavailable[i].endTime`: `INVALID_RANGE` si no es posterior al inicio;
- `unavailable[i]`: `INVALID_LENGTH` para cada tramo que pasa de 40 en un mismo día, contados en el orden del cuerpo.

Los solapes no son un error: se unen. El colegio sale de la identidad; un `schoolId` en el cuerpo se ignora.

#### Scenario: Guardar y normalizar
- **WHEN** un `MEMBER` guarda el lunes 09:00–09:45, el lunes 09:45–10:30 y el miércoles 09:00–14:00
- **THEN** responde `200` con dos tramos, el lunes 09:00–10:30 y el miércoles 09:00–14:00
- **AND** quedan dos filas en la base de datos

#### Scenario: Vaciar
- **WHEN** se guarda `unavailable: []`
- **THEN** el profesor queda sin filas y disponible siempre

#### Scenario: Sin cambios
- **GIVEN** un profesor con el lunes 09:00–10:30
- **WHEN** se guarda el lunes 09:00–09:45 más el lunes 09:45–10:30
- **THEN** responde `200` sin escribir nada ni registrar `PROFESSOR_AVAILABILITY_UPDATED`

#### Scenario: Validación
- **WHEN** se guarda un tramo con día 6, otro con «25:00» y otro con el fin antes del inicio
- **THEN** responde `400` con `OUT_OF_RANGE`, `INVALID_FORMAT` e `INVALID_RANGE` en sus campos
- **AND** no cambia nada

#### Scenario: Demasiados tramos en un día
- **WHEN** se guardan 41 tramos el lunes
- **THEN** responde `400` con `INVALID_LENGTH` en `unavailable[40]`

#### Scenario: Profesor inexistente
- **WHEN** se guarda la disponibilidad de un profesor que no existe, de otro colegio o con un id que no es UUID
- **THEN** responde `404 NOT_FOUND`
- **AND** no cambia nada

#### Scenario: Dos guardados a la vez
- **WHEN** se lanzan en carrera dos `PUT` con tramos distintos sobre el mismo profesor, en varias rondas
- **THEN** los dos responden `200`
- **AND** queda entero el estado de uno de ellos, nunca una mezcla

#### Scenario: Guardar mientras se borra el profesor
- **WHEN** se lanzan en carrera un `PUT` de su disponibilidad y el `DELETE` del profesor
- **THEN** no hay `500` ni interbloqueo
- **AND** no quedan tramos de un profesor que ya no existe

### Requirement: Eventos de log de la disponibilidad
El `PUT` MUST registrar estos eventos:
- **`PROFESSOR_AVAILABILITY_UPDATED`** (`school_id`, `actor_id`, `professor_id` e `interval_count`, el número de tramos tras normalizar), solo si algo cambió;
- **`PROFESSOR_AVAILABILITY_UPDATE_REJECTED`**, con `reason: not_found`.

Ninguno lleva nombres ni horas.

#### Scenario: Evento sin datos personales
- **WHEN** se guarda la disponibilidad de «Ana García»
- **THEN** el log lleva `PROFESSOR_AVAILABILITY_UPDATED` con el recuento y sin «Ana» ni «García»

### Requirement: Página de disponibilidad de un profesor
`/profesores/:id/disponibilidad` (`pages/ProfessorAvailabilityPage.tsx`, `data-testid="professor-availability-page"`) MUST colgar de `AuthenticatedLayout` sin `RequireRole`.

**Carga.** Pide una vez el profesor, su disponibilidad y los calendarios, aunque `StrictMode` ejecute los efectos dos veces.
- Mientras carga, un `role="status"`.
- Si falla, «Reintentar».
- Ante un `404`, «Este profesor no existe o ya no está disponible», con un enlace a «Profesores».
- El título es «Disponibilidad de {Nombre Apellidos}».

**Calendario de la vista.** El que siguen más cursos (con empate, el primero por nombre).
- Si el colegio tiene más de uno, un selector «Calendario» permite cambiarlo sin perder lo marcado.
- Sin calendarios, no hay cuadrícula: se explica, con un enlace a `/calendarios`.

**Cuadrícula.** Es `SlotGrid` en modo `unavailable`, con las sesiones del calendario como filas y los recreos como separadores que no se marcan. Cada celda es la sesión de ese día, con su intervalo `[inicio, fin)`, y tiene tres estados, cada uno con icono y texto oculto:
- **Disponible:** ningún tramo se solapa con ella.
- **No disponible:** la cubren entera.
- **Parcialmente no disponible:** algún tramo se solapa sin cubrirla. Su nombre accesible dice los tramos.

**Edición.** El estado de la página son los tramos (`utils/professorAvailability.ts`, puro):
- pulsar una celda disponible o parcial añade el intervalo de su sesión;
- pulsar una no disponible lo resta, y puede partir un tramo en dos;
- las cabeceras de día y de sesión hacen lo mismo con toda la columna o la fila: la marcan entera si falta alguna celda y la desmarcan si estaba entera;
- después de cada cambio, los tramos se normalizan;
- los tramos que no quedan bajo ninguna celda del calendario elegido no se tocan.

**Resumen.** «{n} de {m} franjas disponibles en «{calendario}»», donde una celda parcial no cuenta como disponible. Si hay tramos que no se solapan con ninguna sesión de la vista, además «También no disponible: {día} {inicio}–{fin}, …».

**«Disponible todo».** Vacía todos los tramos. Si hay tramos que la vista no muestra, pide confirmación antes.

**Guardar.**
- Solo se habilita si los tramos normalizados difieren de los cargados.
- Tiene una guarda síncrona contra el doble envío.
- Con el `200`, se queda en la página con lo que respondió el servidor y «Disponibilidad de {nombre} guardada» en un `role="status"`.
- Ante un `404`, la vista de no disponible.
- Ante un fallo, un `role="alert"`, conservando lo marcado.

#### Scenario: Profesor sin tramos
- **GIVEN** un calendario de 6 sesiones que siguen dos cursos
- **WHEN** abro la disponibilidad de un profesor sin tramos
- **THEN** todas las celdas están disponibles y veo «30 de 30 franjas disponibles en «Primaria»»
- **AND** «Guardar» está deshabilitado

#### Scenario: Marcar un día y una sesión y guardar
- **WHEN** pulso la cabecera «Miércoles» y la celda del lunes, 1ª sesión (09:00–09:45), y guardo
- **THEN** se envían el lunes 09:00–09:45 y el miércoles del inicio de la 1ª sesión al fin de la última
- **AND** veo «Disponibilidad de Ana García guardada»

#### Scenario: Desmarcar parte de un tramo
- **GIVEN** un tramo guardado el lunes de 09:00 a 11:15
- **WHEN** desmarco la sesión de 09:45 a 10:30
- **THEN** los tramos pasan a ser 09:00–09:45 y 10:30–11:15

#### Scenario: Celda parcial
- **GIVEN** un tramo el martes de 11:00 a 12:00 y una sesión de 10:30 a 11:15
- **THEN** esa celda se ve «Parcialmente no disponible» y su nombre accesible incluye «11:00–12:00»
- **AND** al pulsarla queda no disponible entera

#### Scenario: Lo de otro calendario se conserva
- **GIVEN** un tramo el viernes de 15:00 a 16:00, fuera de la jornada del calendario elegido
- **WHEN** marco otra celda y guardo
- **THEN** el viernes 15:00–16:00 sigue en lo enviado
- **AND** la página lo menciona en «También no disponible»

#### Scenario: Cambiar de calendario
- **GIVEN** dos calendarios y una celda marcada sin guardar
- **WHEN** elijo el otro calendario
- **THEN** la cuadrícula muestra sus sesiones y el tramo marcado sigue en el estado de la página

#### Scenario: Disponible todo con tramos fuera de la vista
- **GIVEN** un tramo que la vista no muestra
- **WHEN** pulso «Disponible todo»
- **THEN** se pide confirmación
- **AND** al confirmar no queda ningún tramo

#### Scenario: Colegio sin calendarios
- **WHEN** abro la disponibilidad en un colegio sin calendarios
- **THEN** veo la explicación con el enlace a «Calendarios» y ninguna cuadrícula

### Requirement: Accesibilidad, responsive e i18n de la disponibilidad
La página MUST cumplir lo siguiente:
- usarse con el teclado: las celdas y las cabeceras son botones con `aria-pressed`;
- distinguir los tres estados con icono y texto, no solo con color;
- verse a 360 px sin desplazamiento horizontal, con los días abreviados como en las franjas;
- no tener violaciones de `axe`;
- tener los textos en `es.json` y `en.json`, bajo `availability.*`.

#### Scenario: Sin violaciones
- **WHEN** se analiza la página con `axe`, con tramos completos y parciales
- **THEN** no hay violaciones

### Requirement: Disponibilidad de extremo a extremo
Un E2E (`cypress/e2e/professor-availability.cy.ts`) MUST cubrir estos casos:
- abrir la disponibilidad desde el listado de profesores, marcar un día y una celda, guardar y ver «Disponibilidad (2 tramos)»;
- un tramo partido al desmarcar;
- un colegio con dos calendarios, con la celda parcial y el tramo de otro calendario conservado;
- un `MEMBER` que edita;
- el colegio sin calendarios;
- 360 px sin desplazamiento horizontal.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/professor-availability.cy.ts`
- **THEN** todos los casos pasan
