## Context

US19 dejó la carga de un curso en `subject_courses (subject_id, course_id, sessions_per_week 1..5)` con dos caminos de escritura:

- **La ficha de la asignatura** (`PUT /api/subjects/{id}`) **reemplaza** sus filas: `deleteMany` + `createMany`.
- **La matriz del curso** (`PATCH /api/courses/{id}/workload`) escribe por diferencias.

US19_b añade las dos primeras reglas de reparto en una tabla propia cuya clave ajena compuesta apunta a esas filas, con cascada. Con eso, el reemplazo de la ficha borraría todas las reglas de la asignatura en cada guardado: hay que pasarlo a diferencias antes de que exista una sola regla.

La exploración del 2026-10-29 fijó las reglas:

- El bloque manda sobre el máximo.
- El recreo corta un bloque.
- Las sesiones que no forman un bloque entero van sueltas.
- Solo se avisa y nunca se rechaza.
- La regla es de asignatura + curso.
- Escribe solo `ADMIN`.

Bloqueos actuales con los que hay que convivir (sin cambios en esta historia):

```
   alta de asignatura        cursos FOR SHARE (orden id)
   edición de asignatura     asignatura FOR UPDATE → cursos FOR SHARE (orden id) → subject_courses
   borrado de asignatura     asignatura FOR UPDATE → DELETE (cascada a subject_courses → reglas)
   carga de un curso         asignaturas FOR UPDATE (orden id) → curso FOR SHARE → subject_courses + reglas
   edición / borrado curso   curso FOR UPDATE (→ cascada a subject_courses → reglas al borrar)
   edición de calendario     calendario FOR UPDATE → cursos FOR UPDATE (orden id)
```

## Goals / Non-Goals

**Goals:**
- La tabla `scheduling_constraints`, preparada para los cuatro tipos y con la integridad en la base de datos (clave compuesta, `CHECK`, único por tipo).
- Leer y escribir `MAX_PER_DAY` y `BLOCK` desde la matriz de la carga, en la misma transacción y bajo los mismos bloqueos que las sesiones.
- Calcular los avisos por asignatura al leer, en el dominio, y repetirlos en el frontend mientras se edita.
- Pasar la edición de asignaturas a diferencias, para que conserve las reglas de los cursos que siguen.
- Que se vea qué reglas se pierden antes de perderlas, en los cuatro sitios donde ocurre.

**Non-Goals:**
- Franjas (US19_c, US19_d) y el listado (US20): el enum ya trae sus valores, pero nada los escribe ni los lee.
- Bloques que cruzan un recreo, reglas por clase o de curso entero.
- El motor de generación, que aún no existe: solo se anota en su especificación que HC3 es el valor por defecto de `MAX_PER_DAY`.
- Avisos de pérdida en el log de la edición o el borrado de una asignatura. Lo que se borra por cascada ya se avisa en pantalla; esos eventos no cambian.

## Decisions

### 1. Tabla propia con clave ajena compuesta a `subject_courses`, modelada en Prisma
`SchedulingConstraint` tiene:
- `subjectCourse SubjectCourse @relation(fields: [subjectId, courseId], references: [subjectId, courseId], onDelete: Cascade)`.
- `school School @relation(...)`.
- `@@unique([subjectId, courseId, type])`, `@@index([courseId])` y `@@index([schoolId])`.

Prisma genera la clave compuesta a partir de la clave primaria compuesta de `subject_courses`, así que no hace falta escribirla a mano. Los `CHECK` por tipo sí van a mano en la migración (`--create-only`), con nombres fijos que un test de esquema comprueba:
- `scheduling_constraints_max_per_day_check`: `type <> 'MAX_PER_DAY'` o (`max_per_day BETWEEN 2 AND 5` y `block_size IS NULL`).
- `scheduling_constraints_block_check`: lo mismo para `BLOCK`.
- `scheduling_constraints_slots_check`: en los tipos de franjas, las dos columnas son nulas.

`school_id` se escribe desde la aplicación con el colegio de la identidad, igual que en el resto de tablas, y sirve al listado de US20.

Alternativas descartadas:
- **Columnas `max_per_day` y `block_size` en `subject_courses`:** más simple hoy, pero las franjas de US19_c y US19_d necesitan una tabla hija por regla, y se decidió una sola tabla de reglas.
- **Claves ajenas sueltas a `subjects` y a `courses`:** permitirían una regla de una asignatura en un curso donde no se imparte, y habría que borrarla a mano al dejar de impartirse.

### 2. `max_per_day` y `block_size` como columnas, no como un `value` genérico
Cada tipo tiene su columna tipada y su `CHECK`. US19_c y US19_d guardarán sus celdas en una tabla hija y no usan ninguna de las dos.
- *Alternativa descartada:* un `value SMALLINT` o un `JSONB`. Pierde el `CHECK` por tipo y obliga a interpretar el número según el tipo en cada lectura.

### 3. El `PATCH` lleva la fila entera de cada asignatura que cambia
`{ subjectId, sessionsPerWeek, maxPerDay, blockSize }`, con los cuatro campos obligatorios. La unidad de cambio sigue siendo la asignatura dentro del curso, como en US19: solo vienen las filas que difieren de lo cargado, y cada una dice su estado final.

Bajo los bloqueos de US19, el repositorio lee las filas y las reglas existentes de esas asignaturas en el curso y aplica, en este orden:
1. Borra las parejas que pasan a `null`. Sus reglas caen por la cascada.
2. Actualiza las sesiones que cambian.
3. Inserta las parejas nuevas.
4. Por cada tipo, borra las reglas que pasan a `null`, actualiza las que cambian de valor y crea las nuevas.

Al final relee la carga en la misma transacción. Los recuentos `constraints_set` (creadas o cambiadas) y `constraints_removed` (borradas a mano o por cascada) salen de esa comparación.

Alternativas descartadas:
- **Campos opcionales («omitir no cambia»):** obliga a distinguir ausente de `null` en tres campos por fila y no ahorra nada, porque el frontend ya envía la fila entera.
- **Un endpoint aparte para las reglas:** dos guardados para una sola fila de la matriz, y la regla podría llegar antes que la pareja que la sostiene.

### 4. Una regla sin carga es `NOT_ALLOWED`; fuera de rango, `OUT_OF_RANGE`
Con `sessionsPerWeek: null`, un `maxPerDay` o un `blockSize` distinto de `null` da `NOT_ALLOWED` en ese campo, el código que ya existe para un campo que no admite el valor de otro (la beca sin comedor). Un `maxPerDay` fuera de 2–5 o un `blockSize` fuera de 2–3 da `OUT_OF_RANGE`; uno que no es un entero, `INVALID_FORMAT`; ausente, `REQUIRED`. El orden de los errores en cada cambio es `subjectId`, `sessionsPerWeek`, `maxPerDay` y `blockSize`.
- *Alternativa descartada:* el código nuevo `INVALID_COMBINATION` que proponía la ficha. Duplicaría `NOT_ALLOWED`; la ficha ya está corregida.

### 5. Avisos por asignatura en `workloadWarnings`, con la jornada resumida en dos números
`WorkloadCalendar` gana `maxConsecutiveSessions`: el tramo más largo de periodos `SESSION` seguidos (por `position`) sin un `BREAK` entre medias. El repositorio lo calcula al leer los periodos del calendario, y el contrato lo expone para que el frontend repita el cálculo mientras se edita.

Para cada asignatura que se imparte, con carga `L`, máximo `m` (1 sin regla), bloque `k` y `S` sesiones al día:
- **`BLOCK_LARGER_THAN_LOAD`** si hay bloque y `L < k`. Se comprueba también sin calendario.
- **`SUBJECT_DOES_NOT_FIT`**, solo con calendario y si no hay el aviso anterior. Con `b = ⌊L / k⌋` bloques y `r = L mod k` sesiones sueltas (sin bloque, `b = 0` y `r = L`), salta si `b > 0` y `maxConsecutiveSessions < k`, o si `b + ⌈r / min(m, S)⌉ > 5`.
  - Cada día lleva como mucho un bloque y, si lo lleva, ninguna sesión suelta.
  - Los cinco días tienen la misma jornada.

Con `L ≤ 5`, hoy solo puede saltar la primera condición. La segunda queda en la función pura y en sus tests para que US19_c la reutilice cuando las franjas prohibidas quiten días. Los avisos del curso (`COURSE_WITHOUT_CALENDAR`, `WORKLOAD_EXCEEDS_SLOTS`) no cambian. Los de cada asignatura van en `subjects[i].warnings`, con el mismo esquema `WorkloadWarning` y el enum ampliado.

Alternativas descartadas:
- **Probar combinaciones de días:** con una jornada igual los cinco días, el problema se reduce a una cuenta.
- **Un enum aparte para los avisos de asignatura:** la ficha pide uno solo. Su descripción en el contrato dice qué códigos van en cada lista.

### 6. La edición de una asignatura aplica diferencias
`PrismaSubjectRepository.update` conserva sus bloqueos (asignatura `FOR UPDATE` y la unión de cursos `FOR SHARE` en orden de `id`). Cambia lo que hace después:
- Lee las filas actuales.
- Borra las de los cursos quitados con `deleteMany` (sus reglas caen por la cascada).
- Hace un `update` por curso cuyas sesiones cambian.
- Hace un `createMany` con los cursos nuevos.

Los cursos que siguen con las mismas sesiones no se escriben y conservan `created_at` y sus reglas. La respuesta y el evento `SUBJECT_UPDATED` no cambian.
- *Alternativa descartada:* reinsertar y volver a crear las reglas leídas antes. Más escrituras y más fácil de romper. Las diferencias ya existen en el repositorio de la carga, y se sigue su forma.

### 7. Recuentos con `_count` de Prisma
- **`SubjectCourse.constraintCount`:** `_count: { select: { constraints: true } }` en la selección de los cursos de la asignatura.
- **`CourseWorkloadSubject.constraintCount`:** el número de reglas de la pareja leídas para la fila. Es 0 si no se imparte.
- **`CourseImpact.constraintCount`:** `schedulingConstraint.count({ where: { courseId } })`, en `impactOf` y dentro de la transacción del borrado. Ahí se cuenta antes del `DELETE`, igual que las clases.

`COURSE_DELETED` gana `constraint_count`. Un recuento cuenta todas las reglas, de cualquier tipo, para que US19_c y US19_d no tengan que tocarlo.

### 8. Frontend: el borrador crece a la fila entera
`utils/courseWorkloadDraft.ts` pasa de `Record<id, sesiones | null>` a `Record<id, { sessionsPerWeek, maxPerDay, blockSize }>`:
- `changesOf` compara los tres campos.
- `draftBalance` recalcula también los avisos por asignatura con la misma regla que el backend (`maxConsecutiveSessions` viene en la carga).
- Pasar una fila a «No se imparte» pone sus reglas a `null` y deshabilita los dos selectores.

En la matriz:
- Cada fila muestra sus avisos.
- Con una fila con reglas que pasa a «No se imparte», aparece «Al guardar se borrarán sus {n} reglas en este curso», ligado al selector de sesiones por `aria-describedby`.
- A 360 px, los tres selectores de una fila se apilan.

En el resto de pantallas:
- `SubjectForm` recibe los `constraintCount` de los cursos cargados y avisa al desmarcar uno que tenga reglas.
- `DeleteSubjectModal` suma los de la tarjeta.
- `DeleteCourseModal` usa el del impacto.

Los servicios validan el campo nuevo en su comprobación de forma, como hacen con el resto.

### 9. Capas
- **`domain/workload`:** tipos y `workloadWarnings`, sin dependencias.
- **`application/workload`:** el parser y el caso de uso; el evento gana los recuentos.
- **`infrastructure/prisma`:** los tres repositorios.
- **`presentation`:** no cambia, salvo que la respuesta tiene más campos.

El colegio sale siempre de la identidad: una regla de una asignatura o de un curso de otro colegio no puede crearse, porque la pareja tampoco.

## Risks / Trade-offs

- **[La edición de asignaturas borraba y reinsertaba]** → Se pasa a diferencias en esta historia. Un test de integración guarda una asignatura cambiando solo su nombre y comprueba que sus reglas siguen, y otro quita un curso y comprueba que las de ese curso caen.
- **[Los `CHECK` escritos a mano pueden perderse en un `migrate dev` posterior]** → Un test de esquema los busca por su nombre en `pg_constraint` y comprueba que la clave compuesta tiene `ON DELETE CASCADE`. El SQL se revisa antes del commit.
- **[Interbloqueos nuevos]** → No hay órdenes de bloqueo nuevos: las reglas se escriben bajo los bloqueos de la carga y caen por cascada en los borrados que ya bloquean la asignatura o el curso. Insertar una regla toma `FOR KEY SHARE` sobre su fila de `subject_courses`, que ya está protegida por la asignatura `FOR UPDATE`. Hay tests de concurrencia contra la edición de la asignatura que quita el curso y contra el borrado del curso.
- **[Avisos que no garantizan el horario]** → El texto dice «no cabe en la semana con sus reglas», cada asignatura se comprueba por separado, y el motor (US-ALGO-RUN) sigue decidiendo.
- **[Recuentos desfasados en los avisos de pérdida]** → Los diálogos usan lo cargado al abrir. Si otra persona cambia las reglas entre medias, el número puede estar desfasado; el borrado real lo hace la cascada, así que nunca queda una regla huérfana.
- **[Cambio incompatible del `PATCH`]** → El frontend y el backend se despliegan juntos. No hay más clientes.

## Migration Plan

1. Hacer `prisma migrate dev --create-only --name add_scheduling_constraints`, añadir los tres `CHECK` a mano y revisar el SQL generado (enum, tabla, único, índices, claves ajenas).
2. El despliegue aplica la migración antes que el código (paso «Migraciones» del CI), como en las historias anteriores. La tabla nace vacía y no hay datos que convertir.
3. Vuelta atrás: revertir el commit. La tabla vacía puede quedarse, o se borra con una migración posterior; ninguna tabla existente cambia de forma.

## Open Questions

Ninguna.
