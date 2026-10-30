## Context

La carga horaria ya existe: `subject_courses (subject_id, course_id, sessions_per_week 1..5)` desde US-SUBJECT, escrita solo desde la ficha de la asignatura (`POST`/`PUT /api/subjects`, solo `ADMIN`). Lo que falta es la vista **por curso** y su comparación con las sesiones del calendario del curso (`courses.calendar_id` opcional → `calendar_periods` de tipo `SESSION`, de 1 a 8 por jornada, la misma de lunes a viernes). La exploración del 2026-10-29 fijó: fuente única en `subject_courses`, escritura solo `ADMIN` y lectura para los dos roles, avisos al leer y nunca rechazos, y que la ficha de la asignatura y esta matriz escriben la misma fila con el mismo orden de bloqueo.

Bloqueos que ya existen y con los que hay que convivir:

```
   alta de asignatura        cursos FOR SHARE (orden id)
   edición de asignatura     asignatura FOR UPDATE → cursos FOR SHARE (orden id) → reemplaza subject_courses
   borrado de asignatura     asignatura FOR UPDATE → DELETE (cascada a subject_courses)
   edición / borrado curso   curso FOR UPDATE (→ cascada a subject_courses al borrar)
   edición de calendario     calendario FOR UPDATE → cursos FOR UPDATE (orden id)
```

## Goals / Non-Goals

**Goals:**
- `GET` y `PATCH /api/courses/{id}/workload` con la carga, el balance y los avisos.
- Escritura por diferencias sobre `subject_courses`, sin ciclos con las operaciones de arriba.
- Una función pura de avisos que US19_b–US20 puedan ampliar.
- Página `/cursos/:id/carga` (matriz para `ADMIN`, lectura para `MEMBER`) y enlace desde `/cursos`.

**Non-Goals:**
- Reglas de reparto (US19_b–US19_d) y su listado (US20); la tabla de reglas no se crea aquí.
- Cambiar la edición de asignaturas (sigue reemplazando sus filas; US19_b la pasará a diferencias).
- Asignar el calendario desde esta página o cargas por clase.

## Decisions

### 1. Módulo propio `workload` en las cuatro capas
`domain/workload` (tipos `CourseWorkload`, puerto `CourseWorkloadRepository`, `workloadWarnings`), `application/workload` (`GetCourseWorkload`, `UpdateCourseWorkload`, `updateCourseWorkloadRequest.ts`), `infrastructure/prisma/prismaCourseWorkloadRepository.ts` y `presentation/workload/workloadRouter.ts`. El dominio no depende de Prisma ni de Express; el caso de uso recibe el puerto y el logger.
- *Alternativa descartada:* meterlo en `subjects` o en `courses`. La carga cruza los dos (lee un curso, escribe filas de asignaturas, mira el calendario) y crecerá con las reglas de US19_b–US20; un módulo propio evita engordar dos repositorios que ya tienen bloqueos delicados.

### 2. Ruta `/api/courses/{id}/workload` con un router propio montado antes de `/courses`
`api.use('/courses/:id/workload', workloadRouter(...))` con `mergeParams`, montado **antes** que `coursesRouter`, para que la petición no pase por las rutas de cursos. `requireAuthentication` en el router; `requireRole('ADMIN', logger)` solo en el `PATCH`, antes de `parseCourseId` y del cuerpo. El `404` reutiliza `CourseNotFound` (dominio y respuesta del contrato).
- *Alternativa descartada:* `/api/workloads/{courseId}`. La carga es un recurso del curso; además el frontend ya trabaja con `/cursos/:id/...`.

### 3. `PATCH` con solo las filas que cambian
`{ changes: [{ subjectId, sessionsPerWeek: 1..5 | null }] }`, de 1 a 200. El servidor hace *upsert* (`INSERT … ON CONFLICT (subject_id, course_id) DO UPDATE SET sessions_per_week, updated_at`) o `DELETE` por fila; las que no vienen no se tocan y las actualizadas conservan `created_at`. Para los recuentos del evento, se leen antes las filas existentes de esas asignaturas en el curso (bajo los bloqueos).
- *Alternativa descartada:* `PUT` con el estado final de la columna del curso. Con dos caminos de escritura, guardar la matriz de 1º borraría en silencio una asignatura que otra persona añadió a 1º desde su ficha mientras tanto. Con diferencias, solo se pisan cambios sobre la misma fila (gana el último, como en todo el proyecto).

### 4. Orden de bloqueo: asignaturas `FOR UPDATE` (orden `id`) → curso `FOR SHARE`
```sql
SELECT id FROM subjects WHERE school_id = $school AND id = ANY($ids) ORDER BY id FOR UPDATE;
SELECT id FROM courses  WHERE school_id = $school AND id = $course FOR SHARE;
```
Si la primera consulta devuelve menos filas que `changes`, `400` con `NOT_FOUND` en las que faltan (sin escribir); si la segunda no devuelve nada, `404`. Es el orden de la edición de una asignatura (asignatura → cursos), así que ninguna espera circular:
- contra la **edición de una asignatura**: las dos toman primero asignaturas, en orden de `id` → se serializan;
- contra el **borrado o la edición del curso** (curso `FOR UPDATE`): esperamos en el `FOR SHARE` o vemos el curso borrado → `404`; ellos no toman asignaturas;
- contra la **edición del calendario** (calendario → cursos `FOR UPDATE`): esperamos en el curso; ellos no toman asignaturas;
- **dos `PATCH`** con asignaturas en común: orden de `id` → se serializan.
El calendario **no se bloquea**: se lee después para el balance de la respuesta; si cambia a la vez, la próxima lectura recalcula.
- *Alternativa descartada:* bloquear primero el curso `FOR UPDATE`. Formaría un ciclo con la edición de una asignatura (asignatura → curso) y obligaría a cambiar US-SUBJECT_b.

### 5. Avisos calculados al leer, en una función pura del dominio
`workloadWarnings({ assignedSessions, availableSessions })` devuelve `COURSE_WITHOUT_CALENDAR` (sin calendario) o `WORKLOAD_EXCEEDS_SLOTS` con `assigned` y `available`. El contrato expone los códigos (`WorkloadWarningCode`) y el frontend los traduce. US19_b–US19_d añadirán avisos por asignatura y US20 la reutilizará.
- *Alternativa descartada:* calcularlos en el frontend. El motor (US-ALGO-RUN) y el listado de US20 necesitarán el mismo cálculo; tenerlo en el dominio evita dos versiones que discrepen.
- *Alternativa descartada:* rechazar con `409` la carga que no cabe. La carga y el calendario se cambian en pantallas distintas y por personas distintas; un rechazo en una no evita el problema creado en la otra.

### 6. Lectura en una sola consulta por recurso
El repositorio lee el curso con `calendar_id`, el número de periodos `SESSION` de su calendario (`COUNT(*) FILTER (WHERE kind = 'SESSION')`), todas las asignaturas del colegio y sus filas de `subject_courses` para ese curso (`LEFT JOIN`). El orden por nombre lo aplica la aplicación con `compareText`, como el listado de asignaturas. Para un colegio son decenas de asignaturas: sin paginación.

### 7. Frontend
- `services/courseWorkloadService.ts` (`get` y `update`, que devuelven `{ kind: 'loaded' | 'notFound' | 'forbidden' | 'invalid' | 'unauthenticated' | 'unavailable' }` y nunca lanzan, validando la forma de la respuesta).
- `pages/CourseWorkloadPage.tsx` con carga única (guarda contra `StrictMode`), modo `ADMIN` (matriz) o `MEMBER` (lista) según `useSession()`; borrador local `Map<subjectId, number | null>`; «Guardar» solo con diferencias; envía solo las filas cambiadas; guarda síncrona con `useRef`.
- `components/WorkloadBalance.tsx` (texto + barra `aria-hidden`, color de peligro si se supera, avisos traducidos) reutilizable en US20.
- `CoursesPage.tsx`: enlace «Carga horaria» junto a «Editar» en la tabla y en las tarjetas.
- `App.tsx`: ruta `/cursos/:id/carga` dentro del layout autenticado, sin `RequireRole`.

## Risks / Trade-offs

- [Dos caminos de escritura sobre `subject_courses`] → mismo orden de bloqueo, tests de integración con concurrencia cruzada (carga contra edición de la asignatura) y nota en `MODELO_DATOS.md` y `backend/CLAUDE.md`.
- [La edición de una asignatura sigue reemplazando sus filas] → en esta historia nada referencia `subject_courses`, así que solo cambia `created_at`; US19_b la pasa a diferencias antes de crear la tabla de reglas.
- [Avisos que se quedan viejos si el calendario cambia mientras la página está abierta] → se recalculan en cada lectura y tras cada `PATCH`; no se guardan.
- [La matriz crece con las asignaturas] → decenas de filas; sin paginación, como los demás listados; a 360 px cada fila apila nombre y selector.
- [El router montado en `/courses/:id/workload`] → un test de ruta comprueba que `GET /api/courses/{id}` sigue respondiendo y que `/workload` no cae en `coursesRouter`.

## Migration Plan

Sin migraciones. El despliegue automático publica backend y frontend; el smoke test no cambia. Vuelta atrás: revertir la PR (no hay datos nuevos; las filas de `subject_courses` que cambie la matriz son las mismas que edita la ficha de la asignatura).

## Open Questions

Ninguna: las decisiones de producto se validaron en la exploración y el enriquecimiento del 2026-10-29.
