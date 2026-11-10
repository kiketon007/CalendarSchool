# Paso 9 - Pruebas manuales con curl

- Fecha: 2026-11-09
- Cambio: us-algo-ortools-motor
- Agente: Claude

## Preparación

- Backend de desarrollo en `:3000` (`node --env-file=<entorno temporal> --import tsx src/server.ts`) contra la base `calendarschool`, con un entorno temporal **sin** las claves de reCAPTCHA (verificador falso) y con el lanzador en memoria. Cada tramo reinició el backend con otra configuración; `REGISTRATION_ATTEMPTS_MAX=1000` a partir del tramo 3, porque las pruebas agotaron el límite de 5 registros por IP.
- El guion `curl-ortools.sh` (en el scratchpad de la sesión, no se versiona) registra un colegio por la API con `curl` y crea un curso con tres clases (A, B y C), un calendario de cuatro sesiones al día con un recreo, tres asignaturas de 4 sesiones a la semana con tres profesores repartidos en las nueve celdas. Comprueba que la comprobación previa da `ready: true`, genera con `POST /api/schedule/generate`, espera con `GET /api/schedule/generate/{id}` y lee el borrador. El borrador esperado tiene 36 sesiones (3 asignaturas × 3 clases × 4).
- Los nombres de los datos de prueba son ASCII: el shell de Windows no envía «º» como UTF-8 y el servidor lo rechaza con `INVALID_CHARACTERS`. No es un fallo del backend.

## Resultado

| Tramo | Configuración | Comprobaciones |
| --- | --- | --- |
| 9.1 Generar con OR-Tools | `SCHEDULE_ENGINE=ORTOOLS`, Python del entorno virtual | Registro `201`, calendario `201`, asignaciones `200`, `ready: true`. La generación termina `COMPLETED` con 36 de 36 sesiones y `score` 35 → 20 (la mejora en TypeScript, `CONVERGED`) en 925 ms. En la base: `schedules.engine = ORTOOLS`, `DRAFT`, 36 entradas. Log: `SCHEDULE_GENERATION_STARTED` y `SCHEDULE_GENERATION_COMPLETED` con `engine: "ORTOOLS"` y ningún `ortools_fallback`. |
| 9.2 Cancelar mientras busca | Igual, con el arranque de Python ralentizado 8 s (`sitecustomize.py` temporal en `PYTHONPATH`, fuera del repositorio) | `DELETE /api/schedule/generate/{id}` a los 1,5 s: `200`. La generación termina `CANCELLED` a los **2,59 s** (el latido de 2 s más la consulta de 0,5 s, bastante antes de los 8 s), con `placed` 0, sin borrador (`schedule_id` nulo) y **ningún proceso de Python** del motor queda vivo. Log: `SCHEDULE_GENERATION_CANCEL_REQUESTED` y `SCHEDULE_GENERATION_CANCELLED`. |
| 9.2 Alternativa | `SCHEDULE_ORTOOLS_PYTHON` apunta a un ejecutable que no existe | La generación termina `COMPLETED` con 36 sesiones. En la base: `schedules.engine = BACKTRACKING`. Log: `STARTED` con `engine: "ORTOOLS"`, un único `warn` `ortools_fallback` con `reason: "invoke_error"`, el id de la generación y `elapsed_ms: 5`, y `COMPLETED` con `engine: "BACKTRACKING"`. |
| 9.2 Por defecto | Sin `SCHEDULE_ENGINE` | `COMPLETED`, `schedules.engine = BACKTRACKING`, eventos con `engine: "BACKTRACKING"` y sin ninguna mención a OR-Tools. |
| Errores | — | `POST /api/schedule/generate` sin token: `401`. Con `SCHEDULE_ENGINE=FOO` el backend no arranca: una línea `fatal` `Configuración inválida` con `invalidVariables: ["SCHEDULE_ENGINE"]` y código de salida 1 (CA9). |

## Notas

- La comprobación de que el **latido** avanza mientras CP-SAT busca no se puede ver con `curl` en un problema tan pequeño (Python termina en menos de 1 s, antes del primer latido de 2 s). Se comprueba en el test de integración `orToolsGeneration.int.test.ts` (transporte que retrasa la respuesta 2,6 s: hay al menos dos valores distintos de `heartbeat_at` mientras la generación está `RUNNING`).
- `schedule_generations.phase` queda en `SEARCHING` en una generación terminada, igual que con el motor de backtracking: la fase solo se escribe junto al progreso.

## Limpieza

- Antes de limpiar había en la base de desarrollo 7 colegios, 7 usuarios, 3 horarios con 108 entradas y 4 generaciones de las pruebas (incluida la de depuración).
- Se vaciaron todas las tablas de `public` salvo `_prisma_migrations` (20) y `municipalities` (542), como antes de empezar.
- Backend parado (`taskkill /T /F` del proceso que escuchaba en el puerto), puerto 3000 libre (`Get-NetTCPConnection`: 0 conexiones) y ningún proceso de Python del motor vivo.

## Resultado

- Paso 9: **PASA**. Incidencias bloqueantes: ninguna. Los dos fallos iniciales del guion eran del propio guion (el nombre con «º» y la ruta `jq` de la comprobación previa), no del backend.
