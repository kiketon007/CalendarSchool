## Context

Hoy existen:
- **Profesores** (US09–US13): `professors`, gestionado por `ADMIN` y `MEMBER`. `PrismaProfessorRepository` bloquea al profesor con `FOR UPDATE` al editarlo y al borrarlo.
- **Calendarios** (US-BASE): guardan los periodos con `start_minute` y `end_minute`, y `GET /api/calendars` devuelve cada calendario con sus periodos («HH:MM») y sus cursos. La hora se convierte con `parseClock` y `formatClock` (`domain/calendar/clock.ts`).
- **Franjas de una asignatura** (US19_c y US19_d): usan número de sesión porque una pareja asignatura-curso tiene un solo calendario. La cuadrícula es `components/SlotGrid.tsx` (modos `forbidden` y `preferred`), que trabaja con celdas `(día, sesión)`.

Un profesor cruza cursos con calendarios distintos, así que su disponibilidad se guarda **por horas**. Es la opción B, validada en la exploración del 2026-10-31. El motor (HC4) tendrá que comprobar solapes entre tramos y sesiones.

## Goals / Non-Goals

**Goals:**
- Guardar los tramos no disponibles de un profesor en horas, independientes de cualquier calendario.
- Una única forma de guardar lo mismo: normalizar en el servidor y repetir la regla en el cliente.
- Una pantalla de cuadrícula conocida, sobre el calendario elegido, que no pierda lo marcado desde otro calendario.
- Lectura y escritura para los dos roles, aisladas por colegio y con el estado final, como el resto de los datos de profesores.

**Non-Goals:**
- Implementar HC2 y HC4 en el motor (US-ALGO-RUN): solo se anotan.
- El máximo de horas lectivas.
- Las preferencias.
- La disponibilidad por semana.
- Los avisos frente a la carga (US-PROF-ASSIGN, US-PROF-SUMMARY).

## Decisions

### D1. Tabla `professor_unavailabilities` con tramos en minutos
La tabla tiene estas columnas:
- `id`: UUIDv7, del generador de la aplicación;
- `school_id`: FK a `schools`, con índice;
- `professor_id`: FK a `professors`, con `ON DELETE CASCADE` y con índice;
- `day_of_week`: `SMALLINT`;
- `start_minute` y `end_minute`: `SMALLINT`, en minutos;
- `created_at`.

La migración se crea con `prisma migrate dev --create-only` y se le añaden cuatro `CHECK` a mano:
- `professor_unavailabilities_day_of_week_check`;
- `_start_minute_check`;
- `_end_minute_check`;
- `_range_check`.

Cada uno lleva un test que intenta romperlo (`professorUnavailabilitiesSchema.int.test.ts`).

El `school_id` duplica el del profesor, como en `scheduling_constraints`. Sirve para filtrar sin unir y como red de seguridad del aislamiento.

- **Alternativa descartada: una fila por celda `(día, sesión, isAvailable)`**, la de `MODELO_DATOS`. Es ambigua con varios calendarios y obliga a rellenarlo todo.
- **Alternativa descartada: un rango de PostgreSQL (`int4range`) con exclusión**. Prisma no lo modela y la normalización de la aplicación ya evita solapes.
- **Alternativa descartada: una tabla hija de una regla**, como `scheduling_constraint_slots`. La disponibilidad no es una regla de una pareja asignatura-curso.

### D2. Normalizar en el dominio, con una tabla compartida
`normalizeUnavailability(intervals)` vive en `domain/professor/availability.ts` y es pura:
- ordena por día y por inicio;
- une los tramos de un mismo día cuando `siguiente.inicio <= actual.fin`.

El caso de uso normaliza antes de comparar con lo guardado y antes de escribir. La lectura devuelve las filas ordenadas, que ya están normalizadas.

El frontend la repite en `utils/professorAvailability.ts`, porque la necesita para el estado tras cada pulsación y para saber si hay cambios. Los dos tests recorren `test-fixtures/professor-unavailability-normalization.json`, con el patrón de `subject-warnings.json`.

### D3. Validación y forma del `PUT`
`parseUpdateProfessorAvailabilityRequest` (Zod, cuerpo `unknown`):
- devuelve `{ field, code }` en el orden del cuerpo;
- reutiliza `parseClock` para «HH:MM»;
- aplica el máximo de 200 tramos en total y de 40 por día. El exceso por día se marca en cada tramo que sobra, con `INVALID_LENGTH`.

El parser trabaja en minutos y la respuesta vuelve a «HH:MM» con `formatClock`.

### D4. Reemplazo bajo el bloqueo del profesor
`PrismaProfessorAvailabilityRepository` tiene dos métodos:
- **`find(schoolId, professorId)`:** devuelve el profesor y sus tramos, o `null` si no es del colegio.
- **`replace(schoolId, professorId, intervals)`:** abre un `$transaction`:
  1. bloquea con `SELECT id FROM professors WHERE id = … AND school_id = … FOR UPDATE` (sin fila, devuelve `notFound`);
  2. lee lo guardado y, si es igual a lo pedido, devuelve `{ kind: 'unchanged', intervals }`;
  3. si no, hace `deleteMany` y `createMany` y devuelve `{ kind: 'replaced', intervals }`.

Solo toma el bloqueo del profesor, el mismo que su edición y su borrado. No hay órdenes nuevos ni ciclos:
- **Dos `PUT`** se serializan en el profesor.
- **Un `DELETE` del profesor** espera o hace esperar. Si gana el borrado, el `PUT` no encuentra fila y responde `404`.

Los tests de integración lanzan las dos carreras en varias rondas.

El caso de uso `UpdateProfessorAvailability` registra `PROFESSOR_AVAILABILITY_UPDATED` solo con `replaced` y `_REJECTED` con `not_found`. `GetProfessorAvailability` no registra nada.

### D5. Rutas en `professorsRouter`
Las rutas `GET /:id/availability` y `PUT /:id/availability` van en `professorsRouter`, con el mismo `parseProfessorId` (un id que no es UUID da `404`) y sin `requireRole`. El `no-store` ya lo pone `noStore.ts`.

No hace falta un router propio: la ruta cuelga del recurso del profesor, sin `mergeParams`, y los profesores no tienen sub-recursos que choquen.

### D6. `unavailableCount` en `Professor`
`PrismaProfessorRepository` añade `_count: { select: { unavailabilities: true } }` en sus `select` y lo mapea a `unavailableCount`. Como los tramos están normalizados, el número de filas es el de tramos.

El cambio de contrato es compatible: un campo nuevo obligatorio en la respuesta. `professorsService` lo exige, y hay que actualizar los fixtures de `Professor` del backend y del frontend.

### D7. La cuadrícula: `SlotGrid` en modo `unavailable`, con la conversión fuera
`SlotGrid` sigue trabajando con celdas `(día, sesión)` y gana el modo `unavailable`:
- **`cells`:** las celdas no disponibles enteras, que se pintan con el aspa y «No disponible»;
- **`partialCells`:** prop nueva, `{ cell, label }[]`, que se pintan con un icono de media luna, «Parcialmente no disponible» y su `label` («11:00–12:00») en el nombre accesible;
- **`onToggle(cell)`** y **`onToggleLine(cells)`**: props nuevas en este modo, que la página traduce a tramos, en lugar de devolver la lista de celdas.

Hace falta el segundo par de props porque una celda parcial al pulsarse pasa a entera, algo que una lista de celdas marcadas no puede expresar. Los modos `forbidden` y `preferred` no cambian.

`utils/professorAvailability.ts` es puro:
- **`sessionsOf(calendar)`:** cada sesión con su número y sus minutos.
- **`cellStates(intervals, sessions)`:** el estado de cada celda, `available`, `unavailable` o `partial` con los tramos que la tocan.
- **`addRange` / `subtractRange`:** suman o restan un intervalo `[a, b)` de un día y normalizan. Restar puede partir un tramo.
- **`outsideView(intervals, sessions)`:** los tramos que no se solapan con ninguna sesión de la vista.
- **`countAvailable`:** cuenta las celdas disponibles.

El estado de la página son **los tramos**, no las celdas. Por eso cambiar de calendario solo cambia la vista y lo de otro calendario nunca se pierde.

- **Alternativa descartada: un componente nuevo de cuadrícula.** Duplicaría la tabla, la accesibilidad, los recreos y las cabeceras de `SlotGrid`.
- **Alternativa descartada: guardar en la página un mapa de celdas tocadas.** Es más difícil de razonar que operar directamente sobre tramos.

### D8. Calendario por defecto y datos de la página
La página pide `professorsService.get`, `professorAvailabilityService.get` y `calendarsService.list`, que ya trae los periodos y los cursos de cada calendario. No hace falta un endpoint nuevo.

El calendario por defecto es el de más `courses`; con empate, el primero por nombre (`compareText`). El selector solo existe con dos o más calendarios.

### D9. Nota para el motor
`docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` recoge dos cosas:
- **HC4:** una sesión `[s, e)` de un curso es imposible para el profesor si algún tramo `[a, b)` cumple `a < e` y `s < b`.
- **HC2:** con cursos que siguen calendarios distintos, también debe comparar intervalos y no números de sesión.

## Risks / Trade-offs

- **[La conversión entre celdas y tramos falla en los bordes]**, por ejemplo con tramos que se tocan pero no se solapan o al partir uno en dos → `[a, b)` semiabierto en todo el código, funciones puras con tests de bordes y la tabla compartida de normalización.
- **[Un calendario cambia después de marcar]** → los tramos siguen en horas, y algunas celdas pueden verse parciales o quedar fuera de la vista. Es lo esperado, y la página lo muestra en «También no disponible».
- **[El recuento en el listado añade una subconsulta]** → `_count` usa el índice de `professor_id`. Un colegio tiene decenas de profesores.
- **[Seguridad]** → Bearer obligatorio, identidad leída de la base de datos, `schoolId` solo de la identidad, `404` uniforme y eventos sin nombres ni horas.

## Migration Plan

1. Migración `add_professor_unavailabilities`: crea la tabla, los índices, las FK y los `CHECK`. No toca datos existentes.
2. Se aplica en el paso «Migraciones de la base de datos» del despliegue, antes del backend nuevo. El backend anterior no lee la tabla, así que el orden es seguro.
3. Para volver atrás: revertir el merge. La tabla puede quedarse vacía sin efecto, o borrarse con una migración inversa si se decide.

## Open Questions

Ninguna. Las decisiones se validaron en la exploración del 2026-10-31.
