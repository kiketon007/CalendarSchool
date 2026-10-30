## Context

US19_b dejó `scheduling_constraints` con una fila por `(asignatura, curso, tipo)`, colgada de `subject_courses` por una clave ajena compuesta en cascada. El enum ya tiene `FORBIDDEN_SLOTS`, y su `CHECK` exige que esas filas no lleven `max_per_day` ni `block_size`. Los avisos por asignatura (`subjectWarnings`) suponían hasta ahora que los cinco días tienen la misma jornada. Con las franjas prohibidas eso deja de ser cierto: un día puede tener menos sesiones disponibles que otro, o ningún tramo libre lo bastante largo para un bloque.

Un calendario tiene de 1 a 8 sesiones y como mucho 2 recreos, siempre entre sesiones (`domain/calendar/calendarPeriods.ts`). Así que la jornada se parte en 1, 2 o 3 tramos de sesiones seguidas. El número de una sesión es su orden entre las sesiones, no su hora.

Bloqueos con los que hay que convivir (sin cambios):

```
   carga de un curso         asignaturas FOR UPDATE (orden id) → curso FOR SHARE → parejas + reglas
   edición de asignatura     asignatura FOR UPDATE → cursos FOR SHARE (orden id) → parejas (diferencias)
   borrado de asignatura     asignatura FOR UPDATE → DELETE (cascada: parejas → reglas → celdas)
   edición / borrado curso   curso FOR UPDATE (cascada al borrar)
   edición de calendario     calendario FOR UPDATE → cursos FOR UPDATE (orden id)
   franjas (nuevo)           asignatura FOR UPDATE → curso FOR SHARE → pareja → regla y celdas
```

## Goals / Non-Goals

**Goals:**
- Guardar y leer las franjas prohibidas de una asignatura en un curso, con la integridad en la base de datos (celdas en rango, sin repetir, cayendo con la regla y con la pareja).
- Calcular «no cabe en la semana» día a día con las franjas y los recreos, con **la misma regla** en el backend y en el frontend, probada con una tabla de casos compartida.
- Tratar las celdas que sobran tras un cambio de calendario sin borrar nada a escondidas: se ignoran al leer, se avisa y desaparecen al guardar.
- Una cuadrícula accesible y reutilizable para US19_d.

**Non-Goals:**
- Franjas preferidas (US19_d), aunque el enum, la tabla hija y `SlotGrid` ya sirven para ellas.
- Borrar las franjas de un curso sin calendario, y cualquier limpieza automática al cambiar un calendario.
- El motor de generación: solo se anota HC7, que ya está en su especificación.

## Decisions

### 1. Tabla hija con clave primaria compuesta, no una lista en la regla
`scheduling_constraint_slots (constraint_id, day_of_week, session_number, created_at)`:
- Clave primaria `(constraint_id, day_of_week, session_number)`: impide repetir una celda.
- Clave ajena a `scheduling_constraints(id)` con `ON DELETE CASCADE`: las celdas caen con la regla, y la regla cae con su pareja, con la asignatura y con el curso.
- `CHECK` escritos a mano y con nombre fijo: `scheduling_constraint_slots_day_of_week_check` (de 1 a 5) y `scheduling_constraint_slots_session_number_check` (de 1 a 8, el `MAX_SESSIONS` de US-BASE).

La regla `FORBIDDEN_SLOTS` existe mientras tenga alguna celda: la aplicación la crea con la primera y la borra con la lista vacía. La base de datos no impide que una regla `MAX_PER_DAY` tenga celdas (haría falta un disparador); lo garantiza el único camino que escribe celdas.

Alternativas descartadas:
- **Un `JSONB` o una máscara de bits en la regla:** pierde los `CHECK` y la clave primaria, y obliga a interpretar la columna en cada lectura.
- **Una columna `slots` por cada tipo en `scheduling_constraints`:** mezcla datos de una sola regla con la tabla de todas.

### 2. Un endpoint propio con el estado final
- **Lectura:** `GET /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots`, para `ADMIN` y `MEMBER`.
- **Escritura:** `PUT` en la misma ruta, solo `ADMIN`, con el cuerpo `{ slots: [{ dayOfWeek, sessionNumber }] }`, de 0 a 40 celdas.

Va en un router propio (`slotsRouter`) montado bajo `/api/courses/:courseId/subjects/:subjectId` con `mergeParams`, antes de `/courses`, como `workloadRouter`. Así US19_d añadirá `preferred-slots` al mismo router.

El orden de la validación es:
1. `requireRole('ADMIN')`, solo en el `PUT`.
2. Los dos `id` (si no son UUID, `404`).
3. La forma del cuerpo:
   - `slots`: `REQUIRED`, `INVALID_FORMAT` o `INVALID_LENGTH` si pasa de 40.
   - `slots[<i>]`: `INVALID_FORMAT`.
   - `slots[<i>].dayOfWeek` y `.sessionNumber`: `REQUIRED`, `INVALID_FORMAT`, o `OUT_OF_RANGE` fuera de 1..5 y de 1..8.
   - `DUPLICATE` en `slots[<i>]` desde la segunda aparición.
4. Dentro de la transacción, que la pareja exista. Si no, `404`.
5. Que el curso tenga calendario. Si no, `409 COURSE_HAS_NO_CALENDAR`.
6. El rango contra el calendario actual: una `sessionNumber` mayor que sus sesiones es `400` con `OUT_OF_RANGE` en `slots[<i>].sessionNumber`.

Un `PUT` igual a lo guardado no escribe nada ni registra evento.
- *Alternativa descartada:* que el `PATCH` de la carga lleve también las celdas. Haría de cada fila de la matriz una cuadrícula de 40 celdas y mezclaría dos pantallas en una petición.

### 3. La respuesta reutiliza los periodos del contrato
`SubjectSlotRule` contiene:
- `course` (`id`, `name`).
- `subject` (`id`, `name`, `code`, `color`, `sessionsPerWeek`, `maxPerDay`, `blockSize`).
- `calendar` (`id`, `name`, `periods`) o `null`. `periods` usa el `CalendarPeriod` de US-BASE (`type`, `startTime`, `endTime` en `HH:MM`) en el orden de la jornada.
- `slots`: solo las celdas dentro del calendario, por día y por sesión.
- `outsideCalendarCount`.
- `warnings`.

La ficha proponía periodos con `kind`, `position` y minutos. Se reutiliza el esquema que ya consumen las páginas de calendarios para no tener dos formas del mismo dato.

`subject` lleva el máximo y el bloque porque intervienen en `SUBJECT_DOES_NOT_FIT`, que la página recalcula mientras se marcan celdas.

### 4. «No cabe» día a día, con una búsqueda exhaustiva sobre cinco días
Con la carga `L`, el máximo `m` (1 sin regla), el bloque `k`, `b = ⌊L/k⌋` bloques y `r = L mod k` sueltas (sin bloque, `b = 0` y `r = L`), para cada día `d` se calculan:
- `libres_d`: las sesiones del calendario no prohibidas ese día.
- `sueltas_d = min(m, |libres_d|)`: cuántas sesiones sueltas caben ese día.
- `bloque_d`: si `libres_d` contiene `k` sesiones seguidas dentro de un mismo tramo, es decir, sin recreo entre ellas.

`SUBJECT_DOES_NOT_FIT` salta, solo con calendario y sin `BLOCK_LARGER_THAN_LOAD`, si no existe un conjunto `B` de `b` días con `bloque_d` tal que `Σ_{d ∉ B} sueltas_d ≥ r`. Cada día lleva como mucho un bloque y, si lo lleva, ninguna suelta, como en US19_b.

Con cinco días hay 32 subconjuntos: se prueban todos. Sin franjas, la cuenta da lo mismo que la fórmula de US19_b, cuyos tests siguen valiendo.

El calendario se resume en `sessionGroups` (los tamaños de los tramos, por ejemplo `[3, 3]`). Las sesiones se numeran seguidas a través de los tramos. `maxConsecutiveSessions` se mantiene en el contrato y vale `max(sessionGroups)`.

Alternativas descartadas:
- **Seguir con una cuenta cerrada:** con días distintos, el mejor reparto depende de qué días se dedican a bloques, y una cuenta cerrada se equivoca justo en los casos que interesan (CA5).
- **Programación entera o el motor:** desproporcionado para cinco días; el motor (US-ALGO-RUN) seguirá decidiendo de verdad.

### 5. La misma regla en los dos lados, con una tabla de casos compartida
`domain/workload/workloadWarnings.ts` (backend) y `utils/courseWorkloadDraft.ts` (frontend) implementan `subjectWarnings`. Los dos tests recorren `test-fixtures/subject-warnings.json`, con la regla, el calendario resumido, las celdas y los avisos esperados, igual que los campos del registro recorren su tabla.

`SLOTS_OUTSIDE_CALENDAR` lleva `count` (un campo opcional nuevo de `WorkloadWarning`). Va después del aviso de reparto y también sale sin calendario: entonces todas las celdas están fuera.
- *Alternativa descartada:* calcular los avisos solo en el backend y que la página pida un preview. Sería una petición por clic y avisos con retraso.

### 6. La carga del curso lleva las celdas y los tramos
En `GET` y `PATCH /api/courses/{id}/workload`:
- Cada asignatura gana `forbiddenSlots`: las celdas dentro del calendario, o `[]`.
- `calendar` gana `sessionGroups`.
- Las celdas fuera del calendario salen como `SLOTS_OUTSIDE_CALENDAR` en los avisos de la asignatura.

La matriz enlaza «Franjas prohibidas (n)» con `n = forbiddenSlots.length` y recalcula `SUBJECT_DOES_NOT_FIT` con ellas mientras se cambian sesiones, máximo o bloque. El `PATCH` no toca las celdas. Si quita la asignatura del curso, la cascada se las lleva (y cuentan en `constraints_removed` como una regla).

La ficha pedía solo `forbiddenSlotCount`, insuficiente para recalcular.

### 7. Bloqueos: los de la carga, sin órdenes nuevos
El `PUT` de franjas sigue este orden:
1. La asignatura `FOR UPDATE`, filtrada por colegio. Sin ella, `404`.
2. El curso `FOR SHARE`, filtrado por colegio. Sin él, `404`.
3. La pareja. Sin ella, `404`.
4. El calendario, sin bloquear.
5. La regla y sus celdas: `deleteMany` y `createMany` de las celdas, o el borrado de la regla.

Es el orden de la carga (US19), así que se serializa con ella y con la edición y el borrado de la asignatura en el bloqueo de la asignatura. El borrado del curso espera en el `FOR SHARE`. Un cambio de calendario simultáneo puede dejar celdas fuera, y eso ya se avisa al leer.

Las celdas se reemplazan enteras: no tienen identidad ni nada cuelga de ellas.

### 8. Frontend
- **`components/SlotGrid.tsx`:**
  - Recibe los periodos, el conjunto marcado, si es editable, el `caption`, el texto de una celda marcada y `onChange`.
  - Pinta una tabla con una columna por día y una fila por periodo.
  - Las sesiones son botones con `aria-pressed` y nombre «{día}, sesión {n} ({inicio}–{fin})». Lo marcado se ve con un icono y un texto oculto, no solo por el color.
  - Los recreos son filas no interactivas.
  - Las cabeceras de día y de sesión son botones: si toda la columna o la fila está marcada, la desmarcan; si no, la marcan.
  - Sin `editable`, las celdas son texto.
- **`pages/ForbiddenSlotsPage.tsx`** (`/cursos/:courseId/carga/:subjectId/prohibidas`, los dos roles):
  - Una sola petición, aunque `StrictMode` ejecute los efectos dos veces.
  - Un borrador de celdas. «Guardar» está deshabilitado sin cambios y lleva una guarda síncrona.
  - Los avisos se recalculan con `subjectWarnings`. Con celdas fuera del calendario, se muestra su aviso.
  - Las respuestas:
    - `200`: «Franjas prohibidas guardadas» y sigue en la página.
    - `404`: la vista «ya no se imparte».
    - `409`: «este curso ya no tiene calendario».
    - `400` con `OUT_OF_RANGE`: el calendario cambió; se recarga y se avisa.
    - `403` u otro fallo: un aviso, conservando lo marcado.
- **Enlaces:** la matriz y la vista del miembro enlazan cada asignatura que se imparte, solo si el curso tiene calendario. Sin calendario, la fila dice «Asigna un calendario para definir franjas».

### 9. Capas
- **`domain/workload`:** los tipos de celdas y tramos y `subjectWarnings` día a día, sin dependencias.
- **`domain/slots`:** el puerto `SubjectSlotsRepository` y los errores (`SubjectCourseNotFound`, `CourseHasNoCalendar`, `SlotsOutOfCalendar`).
- **`application/slots`:**
  - El parser.
  - Los casos de uso `GetForbiddenSlots` y `UpdateForbiddenSlots`. Calculan los avisos y emiten los eventos.
- **`infrastructure/prisma`:**
  - `PrismaSubjectSlotsRepository`.
  - La lectura de celdas y tramos en `PrismaCourseWorkloadRepository`.
- **`presentation/slots`:** el router.

`errorHandler` traduce `CourseHasNoCalendar` a `409 COURSE_HAS_NO_CALENDAR`.

**Seguridad:** el colegio sale siempre de la identidad y cada consulta filtra por él. Una asignatura o un curso de otro colegio no existen (`404`). El rendimiento no cambia de forma apreciable: una consulta de celdas por curso en la carga, y como mucho 32 combinaciones por asignatura al calcular los avisos.

## Risks / Trade-offs

- **[Las dos implementaciones de `subjectWarnings` divergen]** → La tabla compartida `test-fixtures/subject-warnings.json` la recorren los dos tests. Un caso nuevo se añade una vez.
- **[Celdas fuera del calendario que nadie ve]** → Se avisan en la matriz y en la cuadrícula con su recuento. Solo desaparecen al guardar, nunca solas.
- **[El `CHECK` de 8 sesiones depende de `MAX_SESSIONS`]** → Si US-BASE sube el límite, hará falta una migración. Lo dice el comentario de la migración, y un test compara la constante.
- **[La cuadrícula a 360 px]** → Seis columnas compactas, con las horas en la cabecera de fila y abreviaturas de día. El E2E comprueba que no hay desplazamiento horizontal.
- **[Salir de la matriz con cambios sin guardar por el enlace de franjas]** → Se pierden, como al salir por cualquier otro enlace. El enlace lleva el estado guardado (el número de celdas del servidor). Avisar antes de salir queda fuera de alcance.
- **[Un cambio de calendario entre la lectura y el `PUT`]** → El `PUT` valida contra el calendario de ese momento: `400` en las celdas que ya no existen. La página recarga y avisa.

## Migration Plan

1. `prisma migrate dev --create-only --name add_scheduling_constraint_slots`. Añadir a mano los dos `CHECK` y revisar el SQL (tabla, clave primaria, clave ajena con cascada).
2. El despliegue aplica la migración antes que el código, como siempre. La tabla nace vacía.
3. Vuelta atrás: revertir el commit. La tabla vacía puede quedarse.

## Open Questions

Ninguna.
