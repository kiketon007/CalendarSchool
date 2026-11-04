# Informe del paso 13 - Pruebas manuales con curl

- Fecha: 2026-11-04
- Cambio: us-algo-run-ejecucion
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Migración: `calendarschool` ya tenía la migración `20261104114453_add_schedule_tables` (17 migraciones), aplicada con `prisma migrate dev` en el paso 2.1; no hizo falta volver a aplicarla.
- Backend de desarrollo (`node --env-file=<env temporal> --import tsx src/server.ts`) contra `calendarschool`, puerto 3000. El `.env` temporal es una copia del de desarrollo **sin** las claves de reCAPTCHA (así se usa el verificador falso), con los límites de intentos en 1000 y `SCHEDULE_MAX_SECONDS=30`. Sin `SCHEDULE_WORKER_FUNCTION_NAME`, así que se usa el **lanzador en memoria** (la generación se ejecuta en el propio proceso).
- Un script de bash con `curl`, `jq` y `psql` (dentro del contenedor) con 66 comprobaciones; no imprime contraseñas, tokens ni cookies.
- Preparación por la API: colegio A con un curso de una clase (`Curso Curl Uno`), un calendario de tres sesiones de 60 minutos asignado al curso al crearlo (`courseIds`), una asignatura activa con 2 sesiones a la semana, un profesor y su asignación; un miembro del colegio A por el flujo de invitación y su inicio de sesión; y un colegio B sin cursos.

## Casos comprobados

- **Generar y sondear:**
  - `GET /api/schedule/generate` antes de generar: `generation: null`.
  - `POST /api/schedule/generate`: `202`. El sondeo de `GET /api/schedule/generate/{id}` llega a `COMPLETED` con `placed` 2, `total` 2, `progress` 100 y `scheduleId`. Los `GET` llevan `Cache-Control: no-store`, y `GET /generate` devuelve la última.
- **Una generación en curso:** el lanzador en memoria termina en milisegundos, así que las filas «en curso» se **fabricaron en la base** con `psql` (no hay forma de pararlas desde la API):
  - Con una `QUEUED`: `POST` → `409 GENERATION_IN_PROGRESS`; `GET /generate` devuelve esa; `DELETE` → `200` y pasa a `CANCELLED` (también en la base).
  - Con una `RUNNING` de latido reciente: `DELETE` → `200` y sigue `RUNNING` con `cancel_requested = true` en la base; mientras tanto `POST` sigue dando `409`.
  - Con una `RUNNING` de hace 10 minutos y latido de hace 5: `GET /generate/{id}` la marca `FAILED` con `INTERNAL`.
- **`DELETE` de una terminada:** `409 GENERATION_NOT_CANCELLABLE`.
- **Con un bloqueante:** el colegio B (sin cursos) recibe `409 SCHEDULE_NOT_READY` en el `POST` y no queda ninguna fila en `schedule_generations`.
- **Permisos:** `MEMBER`: `POST` y `DELETE` → `403`, `GET /generate` y `GET /generate/{id}` → `200` con la misma generación. Otro colegio: `GET` y `DELETE` de la generación de A → `404`, y su `GET /generate` no la ve. Un id que no es UUID → `404`. Sin token: los cuatro → `401`.
- **El borrador en la base:**
  - Un solo `DRAFT` por colegio, que es el de la generación (`scheduleId`).
  - Dos entradas, de la clase, la asignatura y el profesor esperados, con día entre 1 y 5, sesión entre 1 y 3, minutos (540–600, 600–660, 660–720) de las sesiones del calendario y sin dos entradas en la misma celda.
  - Una segunda generación **sustituye** al borrador: otro `scheduleId`, sigue habiendo un solo `DRAFT`, el anterior y sus entradas ya no existen y el nuevo tiene sus dos entradas.
- **Log:** `SCHEDULE_GENERATION_STARTED` (2), `COMPLETED` (2), `REJECTED` (3), `CANCEL_REQUESTED` (1) y `CANCELLED` (1). Ninguno lleva nombres de colegio, curso, asignatura o profesor ni emails (las únicas coincidencias del log son los eventos `USER_REGISTER_SUCCESS` y `USER_LOGIN_SUCCESS`, que ya existían).

## Resultados

- **Primera pasada: 56 fallos, todos del entorno y no del backend.** El `.env` de desarrollo define las claves de reCAPTCHA, así que el servidor usaba el verificador real y el registro respondía `422 CAPTCHA_FAILED` con el token falso; sin sesión, el resto fallaba en cadena (`401`) y los `INSERT` fabricados con `null` también. Se quitaron las claves del `.env` temporal y se reinició el backend.
- **Segunda pasada: 66 comprobaciones, 0 fallos.**

## Estado de la base de datos

- Las pruebas dejaron datos en `calendarschool`; se restauró con `TRUNCATE schools CASCADE` y `TRUNCATE rate_limit_attempts` (la cascada vacía también las tablas de horarios). Los recuentos coinciden con la línea base del paso 12 (`diff` idéntico).
- Backend parado y puerto 3000 libre (`curl` devuelve `000`).

## Resultado

- Estado del paso 13: **PASS**
- Incidencias bloqueantes: ninguna.
