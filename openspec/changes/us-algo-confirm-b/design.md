## Context

US-ALGO-CONFIRM dejó en `schedules` los oficiales sustituidos (`status = 'OFFICIAL'`, `replaced_at` no nulo) y un resumen (`GET /api/schedule/overview`) que solo los cuenta (`previousCount`). La lectura ya está generalizada: `ScheduleReadRepository.find(schoolId, 'draft' | 'official')` hace una sola consulta de Prisma y la normaliza, `GetSchedule` la ordena y la pasa a la forma de la API (`ScheduleDetail`), y la página `ScheduleDraftPage({ which })` sirve `/horarios/borrador` y `/horarios/oficial` con las tres vistas y «Exportar». El router ya valida un `:id` como UUID (`parseScheduleId`, que lanza `ScheduleNotFound`) para `POST /:id/confirm` y `DELETE /:id`. US-ALGO-CONFIRM_b solo añade lecturas: no hay migración ni escrituras.

## Goals / Non-Goals

**Goals:**
- Listar los oficiales sustituidos de un colegio y abrir cualquier oficial por su id, para los dos roles, reutilizando la lectura, la normalización, la página y la exportación existentes.
- Avisar de que un anterior se ve con los datos de hoy.

**Non-Goals:**
- Foto de los datos al sustituir, revertir, borrar o purgar anteriores, comparar horarios, paginar la lista y abrir un borrador por id.

## Decisions

### 1. El selector de lectura gana `{ id }` (dominio e infraestructura)
`ScheduleSelector` pasa a `'draft' | 'official' | { readonly id: string }` en `domain/schedule/scheduleRead.ts`. En `PrismaScheduleReadRepository.find`, el `where` sale de una función pequeña: `{ schoolId, status: 'DRAFT' }`, `{ schoolId, status: 'OFFICIAL', replacedAt: null }` o `{ schoolId, status: 'OFFICIAL', id }`. El `select` y la normalización no cambian.
- *Alternativa descartada:* un método `findById` aparte, porque duplicaría el `select` de unas 40 líneas y la normalización, o obligaría a extraerlos solo para eso. El selector ya existía con ese propósito (US-ALGO-CONFIRM lo introdujo para no duplicar).
- `findFirst` con `schoolId` en el `where`, no `findUnique` por id: el colegio entra siempre en la consulta y un id de otro colegio es indistinguible de uno inexistente.

### 2. `listPrevious(schoolId)` en el puerto de lectura
Devuelve `StoredScheduleSummary[]` con el mismo `select` de cabecera que `overview` (se extrae a una constante del módulo), `where { schoolId, status: 'OFFICIAL', replacedAt: { not: null } }`, `orderBy [{ replacedAt: 'desc' }, { id: 'desc' }]` y `take: 100` (constante `PREVIOUS_SCHEDULES_LIMIT`). El desempate por `id` hace el orden determinista aunque dos sustituciones compartan instante (en la práctica no ocurre: cada confirmación es una transacción). El índice existente sobre `school_id` basta: un colegio tiene pocos horarios.
- *Alternativa descartada:* paginar con cursor, porque un colegio confirma pocas veces al año y la persona usuaria pidió no paginar. El tope evita una respuesta sin límite.

### 3. Casos de uso (aplicación)
- `GetSchedule.execute({ schoolId, which })` acepta el nuevo selector sin cambios internos: sigue devolviendo `null` si no hay.
- La ruta `GET /:id` traduce `null` a `ScheduleNotFound` (`404`). Así `GetSchedule` no conoce la semántica HTTP y las rutas `/draft` y `/official` siguen devolviendo `{ schedule: null }`.
- `ListPreviousSchedules.execute({ schoolId })` llama a `listPrevious` y pasa las cabeceras a la vista tal cual, igual que `GetScheduleOverview`. El orden lo da la consulta, porque es por fecha y no por texto: no hay comparación del castellano que aplicar.

### 4. Rutas (presentación)
- `GET /previous` se declara junto a `/overview`.
- `GET /:id` se declara **después** de todas las literales, incluida `GET /generate`. Así `/api/schedule/draft` nunca llega a `/:id`. `GET /generate/:id` tiene dos segmentos y no choca.
- Las dos rutas no llevan `requireRole`, porque son para los dos roles, y responden `Cache-Control: no-store`, como las demás lecturas.
- `parseScheduleId` se reutiliza: un id que no es UUID da `ScheduleNotFound` antes de llegar a Prisma, que fallaría con un error de tipo.

### 5. Contrato
- `GET /api/schedule/previous` es una ruta nueva con `{ schedules: ScheduleSummary[] }`.
- `GET /api/schedule/{id}` añade el `get` a la ruta que ya tiene el `delete` y reutiliza `ScheduleDetail` y las respuestas comunes (`401`, `404`, `503`).
- Sin esquemas ni códigos nuevos. Los tipos del frontend se regeneran.

### 6. La página de un anterior es un tercer modo de `ScheduleDraftPage`
- **Props:** `which` pasa a `'draft' | 'official' | 'previous'` con un `scheduleId?: string` obligatorio en `previous` (una unión discriminada de props).
- **Lectura:** el efecto de carga elige `getDraft`, `getOfficial` o `getById(id)`.
- **Cabecera:** se decide por el horario cargado y no por el modo: «Oficial» o «Sustituido» según `replacedAt`, y «Sustituido el …» solo si lo hay. Por eso el vigente abierto por id se ve con «Oficial» sin lógica aparte.
- **Solo en modo `previous`:** el título «Horario anterior» y el aviso de los datos de hoy.
- **Acciones de escritura:** solo existen en modo `draft`, como hoy.
- **Ruta:** `App.tsx` monta `/horarios/anteriores/:id` con un componente `PreviousSchedulePage` de pocas líneas, que lee `useParams` y devuelve `<ScheduleDraftPage key={id} which="previous" scheduleId={id} />`. El `key` fuerza un montaje nuevo al cambiar de id, para no arrastrar el estado ni la guarda de la petición única de `StrictMode`.
- *Alternativa descartada:* una página nueva para el anterior, porque duplicaría las tres vistas, el estado en la URL, la exportación y los estados de carga y error. Sí se paga un modo más en una página que ya tiene dos.

### 7. `getById` en `scheduleDraftService`, `previous` en `scheduleService`
- `getById` reutiliza `read`/`interpretSchedule` con el estado `OFFICIAL` y amplía el resultado con `notFound` (`404`). `getDraft` y `getOfficial` no cambian de forma: `notFound` solo aparece en el tipo de `getById`.
- `previous` sigue el patrón de `overview`: valida cada cabecera con `isSummary(value, 'OFFICIAL')` y exige además que `replacedAt` no sea nulo.

### 8. Lista, enlace del resumen y exportación
- **Lista:** `PreviousSchedulesPage` usa `ListGroup` (un `ul`) con una fila por horario y un `Link` «Ver» con `aria-label` que incluye la fecha.
- **Fechas:** se formatean con el mismo `Intl.DateTimeFormat` que el resumen del oficial.
- **Enlace del resumen:** `OfficialScheduleSummary` recibe `previousCount` de `ScheduleReadinessPage`, que ya tiene el `overview`.
- **Exportación:** en `buildExportModel`, un oficial con `replacedAt` usa una clave nueva, `schedule.export.document.confirmedAndReplacedAt`, con las dos fechas. Los nombres de fichero no cambian.

### Seguridad y rendimiento
- **Aislamiento:** el colegio sale siempre de la sesión y entra en las dos consultas, así que un id de otro colegio da `404`. Los ids solo viajan en la URL, y los nombres se pintan como texto (React).
- **Lista:** son cabeceras sin entradas, 100 como mucho.
- **Abrir un anterior:** es la misma consulta única que el oficial.
- No afecta a la generación ni al solver.

## Risks / Trade-offs

- **[Un anterior viejo se degrada con los cambios de los datos]** → Se acepta (decisión de la persona usuaria) y se avisa en la página. La foto queda para otra historia.
- **[Un modo más en `ScheduleDraftPage`]** → El modo es una unión discriminada y la cabecera se decide por el horario cargado, así que las ramas son pocas. Los tests cubren los tres modos.
- **[Más de 100 sustituidos]** → La lista enseña solo los 100 más recientes. Uno más antiguo sigue abriéndose por id, y el histórico ilimitado ya se aceptó en US-ALGO-CONFIRM.
- **[Orden de rutas]** → Un test de rutas comprueba que `/draft`, `/official`, `/overview`, `/previous` y `/readiness` no caen en `/:id`.

## Migration Plan

Sin migración de datos ni de esquema. El despliegue es el habitual: el backend y el frontend salen juntos. El rollback es revertir el commit, porque no hay estado nuevo.

## Open Questions

Ninguna. Las decisiones de la exploración (2026-11-05) cubren el alcance.
