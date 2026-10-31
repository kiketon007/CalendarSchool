## Context

US19_c dejó las franjas prohibidas con estas piezas:

- **Base de datos:** la regla `FORBIDDEN_SLOTS` en `scheduling_constraints` y sus celdas en `scheduling_constraint_slots`, con clave primaria `(constraint_id, day_of_week, session_number)` y cascada desde la regla.
- **Dominio y repositorio:** el puerto `SubjectSlotsRepository` (`find` y `replace`, con el bloqueo asignatura `FOR UPDATE` → curso `FOR SHARE`).
- **Aplicación:** los casos de uso `GetForbiddenSlots` y `UpdateForbiddenSlots` y el constructor de la respuesta `buildSubjectSlotRule`.
- **Presentación:** el router `slotsRouter`, montado bajo `/api/courses/:courseId/subjects/:subjectId`.
- **Frontend:** el componente `SlotGrid` y la página `ForbiddenSlotsPage`.

El enum ya tiene `PREFERRED_SLOTS`, y su `CHECK` impide que esas filas lleven `max_per_day` o `block_size`, igual que las prohibidas. Todo el código de franjas lee hoy solo el tipo `FORBIDDEN_SLOTS`; el tipo está escrito a mano en el repositorio de franjas y en el de la carga.

Las preferidas se diferencian de las prohibidas en tres cosas. Las demás reglas (cuerpo, validación, calendario, permisos, bloqueos y eventos) son las mismas:

1. Son **blandas**: no cambian «no cabe en la semana» (`SUBJECT_DOES_NOT_FIT`), que sigue calculándose solo con las prohibidas.
2. Pueden **contradecir** a las prohibidas. Gana la prohibida, el servidor no rechaza nada y se avisa con `PREFERRED_SLOTS_FORBIDDEN`.
3. Su cuadrícula enseña las prohibidas y no deja marcar una prohibida nueva.

## Goals / Non-Goals

**Goals:**
- Leer y guardar las preferidas con el mismo código que las prohibidas, parametrizado por el tipo y probado con los dos.
- Hacer visible una preferencia que se ignora: el aviso con su recuento y el estado de la celda, en las dos órdenes de edición (primero preferida y luego prohibida, y al revés).
- Sin migraciones y sin cambios incompatibles en el contrato.

**Non-Goals:**
- Pesos o prioridades entre preferencias.
- Avisar en la página de prohibidas de las preferidas que tapa.
- Cualquier limpieza automática de preferidas al prohibir una celda.
- El motor de generación: solo se anota SC4.

## Decisions

### 1. El tipo de regla es un parámetro, no un segundo juego de clases
El dominio gana `SlotRuleType = 'FORBIDDEN_SLOTS' | 'PREFERRED_SLOTS'` (en `domain/slots/subjectSlots.ts`). Lo reciben:

- **El repositorio:** `find(schoolId, courseId, subjectId, type)` y `replace(schoolId, courseId, subjectId, type, cells)`. `readSnapshot` lee la regla del tipo pedido y, además, siempre las celdas prohibidas.
- **El snapshot:** `cells` y `outsideCount` pasan a ser los de la regla pedida, y se añade `forbiddenCells`, con las prohibidas que existen en el calendario. Si el tipo pedido es `FORBIDDEN_SLOTS`, coincide con `cells`.
- **Los casos de uso:** `GetForbiddenSlots` y `UpdateForbiddenSlots` pasan a llamarse `GetSubjectSlots` y `UpdateSubjectSlots`, y `type` va en su entrada. El mensaje del log depende del tipo.
- **El router:** sirve `/forbidden-slots` y `/preferred-slots` con el mismo manejador; cada ruta fija su tipo.

`replace` no cambia de comportamiento:
- Crea la regla del tipo con su primera celda y la borra con la lista vacía.
- Una lista igual a lo guardado no escribe nada.
- Las celdas fuera del calendario desaparecen al guardar.
- Una sesión que no existe en el calendario es `outOfCalendar`.

Una preferida prohibida **no** es un error.

Alternativa descartada: copiar los casos de uso, el repositorio y la página para las preferidas. Es lo que la ficha señala como riesgo, y duplicaría la validación, los bloqueos y los tests de concurrencia.

### 2. El aviso de contradicción es una función pura aparte
`preferredSlotsWarnings(preferred, forbidden)` devuelve `[{ code: 'PREFERRED_SLOTS_FORBIDDEN', count }]` si alguna celda preferida es también prohibida, y `[]` si no. Va en `domain/workload/workloadWarnings.ts` y se repite en `frontend/src/utils/courseWorkloadDraft.ts`. Los dos tests recorren una tabla nueva y pequeña, `test-fixtures/preferred-slots-warnings.json`, igual que `subject-warnings.json` con `subjectWarnings`.

Los avisos de una asignatura quedan así: `[...subjectWarnings(...), ...preferredSlotsWarnings(...)]`, en ese orden.

Alternativa descartada: meter la contradicción dentro de `subjectWarnings`. Obligaría a cambiar su firma y sus 32 casos por algo que no tiene que ver con «cabe o no cabe». Además, la matriz no tiene las celdas preferidas, solo su número.

### 3. `forbiddenSlots` es opcional en `SubjectSlotRule`
La lectura y el guardado de las preferidas devuelven `forbiddenSlots`, con las celdas prohibidas que existen en el calendario. Las de las prohibidas no lo llevan.

`buildSubjectSlotRule(snapshot, type)` calcula los avisos así:
- `subjectWarnings` recibe siempre las **prohibidas** (`forbiddenCells`) para saber si cabe, junto con el `outsideCount` de la regla pedida, que la página omite de la lista y enseña como aviso propio.
- Con `PREFERRED_SLOTS`, se añade `preferredSlotsWarnings(cells, forbiddenCells)`.

Alternativas descartadas:
- **Un esquema `PreferredSlotRule`:** duplicaría el de las prohibidas campo a campo. `allOf` no sirve con `additionalProperties: false`.
- **`forbiddenSlots` obligatorio también en las prohibidas:** repetiría `slots`.

El contrato ya usa campos «solo en X» en `WorkloadWarning`.

### 4. La carga de un curso expone solo el número de preferidas
`CourseWorkloadSubject` gana `preferredSlotCount`, el número de celdas preferidas dentro del calendario: el enlace solo necesita ese número.

El repositorio de la carga lee también la regla `PREFERRED_SLOTS`. Su snapshot interno lleva las celdas preferidas, que la respuesta no expone, para calcular `PREFERRED_SLOTS_FORBIDDEN`. `SLOTS_OUTSIDE_CALENDAR` suma las celdas fuera del calendario de **las dos** reglas: el texto («Hay N franjas fuera del calendario actual») no distingue el tipo, y cada página enseña las suyas.

En la matriz, el borrador del frontend recalcula `subjectWarnings` mientras se edita. Para `PREFERRED_SLOTS_FORBIDDEN` (y `SLOTS_OUTSIDE_CALENDAR`) **conserva el que vino del servidor**, porque la matriz no cambia celdas. Si la asignatura pasa a «No se imparte» en el borrador, no queda ningún aviso.

`constraintCount` cuenta filas de `scheduling_constraints`, así que la regla de preferidas cuenta como una regla más en «N reglas» y en «Se borrarán N reglas» sin cambiar nada.

Alternativa descartada: exponer la lista `preferredSlots` en la carga. El frontend no la necesita para nada.

### 5. `SlotGrid` gana un modo, no un segundo componente
Se añaden dos props opcionales:
- `mode`: `'forbidden'`, el valor por defecto, o `'preferred'`.
- `blockedCells`: las prohibidas, solo en modo preferidas.

En modo preferidas:

| Celda | Se ve | Botón |
|---|---|---|
| Preferida | icono de marca (no el aspa) y texto oculto «Preferida» | `aria-pressed="true"` |
| Prohibida y no preferida | aspa y «Prohibida» | `disabled`, con «Prohibida» en su nombre accesible |
| Preferida y prohibida | icono de aviso y «Preferida · prohibida, se ignora» | `aria-pressed="true"`, se puede desmarcar |
| Libre | vacía | `aria-pressed="false"` |

Las cabeceras de día y de sesión solo actúan sobre las celdas **no prohibidas** de su columna o su fila. Marcan las que falten, o las desmarcan si ya estaban todas. Las preferidas prohibidas se desmarcan una a una.

En solo lectura (`editable={false}`), los tres estados se ven como texto.

Todo estado se distingue sin color: un icono y un texto.

### 6. Una página para los dos tipos
`ForbiddenSlotsPage` pasa a llamarse `SubjectSlotsPage({ type })`. `App.tsx` la monta en `/cursos/:courseId/carga/:subjectId/prohibidas` y en `.../preferidas`.

Lo que cambia con el tipo es esto:
- **Textos:** título, caption, mensaje de guardado y textos del enlace, en `slots.forbidden.*` y `slots.preferred.*`. Lo común sigue en `slots.*`.
- **Cuadrícula:** el modo de `SlotGrid` y sus `blockedCells`.
- **Avisos en vivo:** en preferidas, `subjectWarnings` con las prohibidas fijas más `preferredSlotsWarnings` con lo marcado. En prohibidas, lo de US19_c.

`slotsService.get/put` reciben el tipo y construyen el segmento de la ruta.

La ficha nombraba `pages/PreferredSlotsPage.tsx`; se corrige en `docs/User_Stories_MVP.md`.

### 7. Eventos
- `SUBJECT_SLOTS_UPDATED` lleva `type: 'PREFERRED_SLOTS'`.
- `SUBJECT_SLOTS_UPDATE_REJECTED` gana `type` en los dos tipos. Es un campo más en el log; no rompe nada.

Nunca van nombres ni celdas.

## Capas y dependencias

- **domain:** `SlotRuleType`, `forbiddenCells` en el snapshot, `preferredSlotsWarnings` y el puerto con el tipo.
- **application:** `GetSubjectSlots`, `UpdateSubjectSlots`, `buildSubjectSlotRule(snapshot, type)` y `buildCourseWorkload`, que añade el aviso nuevo y el recuento.
- **infrastructure:** `PrismaSubjectSlotsRepository` (el tipo en la lectura y en la escritura) y `PrismaCourseWorkloadRepository` (la regla de preferidas).
- **presentation:** `slotsRouter`, con las dos rutas.

`composeApp` crea una instancia de cada caso de uso, la misma que antes con otro nombre. Las dependencias siguen apuntando al dominio.

## Seguridad y rendimiento

El colegio sale siempre de la sesión, las dos rutas filtran por colegio y responden `404` sin distinguir el caso, y el `PUT` sigue siendo solo `ADMIN`, con `requireRole` antes de leer los `id`.

Cada lectura de franjas trae ahora también las celdas prohibidas. La carga trae las celdas preferidas de cada asignatura del curso. Son unas pocas filas más en la misma consulta, sin consultas nuevas. No afecta al motor de generación (CSP < 60 s), que no existe aún.

## Concurrencia

No cambia:
- Un `PUT` de preferidas y uno de prohibidas sobre la misma pareja se serializan en el `FOR UPDATE` de la asignatura.
- El snapshot que devuelve cada uno se lee dentro de su transacción, así que `forbiddenSlots` y el aviso reflejan lo que había al guardar.
- Si las prohibidas cambian justo después, la siguiente lectura avisa.

## Risks / Trade-offs

- **[Romper las prohibidas al parametrizar]** → los tests existentes de US19_c siguen pasando con otros nombres de clase, y cada test de integración y de ruta nuevo se ejecuta con los dos tipos (`describe.each`).
- **[Preferencia ignorada en silencio]** → el aviso con recuento en la página y en la carga, y el estado de la celda en la cuadrícula.
- **[El aviso de la matriz desfasado]** → solo cambia al editar franjas, en otra página. Al volver, la carga se pide de nuevo.
- **[`SLOTS_OUTSIDE_CALENDAR` sumado]** → no dice en qué página están las celdas que sobran, pero los dos enlaces están juntos y cada página enseña las suyas.
- **[Renombrar `ForbiddenSlotsPage` y los casos de uso]** → cambia rutas de importación y tests, no comportamiento. Va en una tarea propia antes de añadir nada.

## Migration Plan

No hay migración de base de datos. Se despliega como siempre.

Si hay que volver atrás, basta con revertir el despliegue. Las filas `PREFERRED_SLOTS` que se hayan guardado no molestan a la versión anterior, que no las lee: solo las cuenta en `constraintCount` y las borra en cascada.

## Open Questions

Ninguna. Las decisiones de la ficha están validadas (2026-10-29), y sus correcciones se listan en la propuesta.
