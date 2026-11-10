# Paso 11 - Pruebas manuales con curl

- Fecha: 2026-11-10
- Cambio: us-algo-ortools-despliegue
- Agente: Claude

## Preparación

- Backend de desarrollo en `:3000` (`node --env-file=<entorno temporal> --import tsx src/server.ts`) contra la base `calendarschool` (con la migración `schedule_generation_engine` aplicada), con un entorno temporal **sin** las claves de reCAPTCHA (verificador falso) y con `REGISTRATION_ATTEMPTS_MAX=1000`. Cada tramo reinició el backend con otra configuración del motor.
- Aquí el motor de OR-Tools es el **proceso hijo** de Python: la Lambda real solo existe en AWS y no se puede probar en local. Lo que se comprueba es todo lo demás de este cambio: `engine` en la API, en la generación y en el horario, y cómo cambia al pasar a la alternativa. La Lambda se probó aparte, con el emulador de runtime de Lambda (ver más abajo).
- El guion `curl-ortools.sh` (en el scratchpad de la sesión, no se versiona) registra un colegio por la API con `curl`, crea un curso con tres clases, un calendario, tres asignaturas de 4 sesiones a la semana con tres profesores, genera con `POST /api/schedule/generate` y consulta con `GET /api/schedule/generate/{id}` y `GET /api/schedule/generate`. El borrador esperado tiene 36 sesiones.

## Resultado

| Tramo | Configuración | Comprobaciones |
| --- | --- | --- |
| 11.1 Con OR-Tools | `SCHEDULE_ENGINE=ORTOOLS`, arranque de Python ralentizado 6 s (`sitecustomize.py` temporal en `PYTHONPATH`, fuera del repositorio) | El `202` lleva `engine: "ORTOOLS"`. **A los 2 s, con la búsqueda en curso**, `GET /api/schedule/generate/{id}` y `GET /api/schedule/generate` dicen `RUNNING` y `engine: "ORTOOLS"`. Al terminar: `COMPLETED`, `engine: "ORTOOLS"`, 36 de 36 sesiones y 36 entradas en el borrador. En la base: `schedule_generations.engine = ORTOOLS` y `schedules.engine = ORTOOLS`. 11 comprobaciones correctas. |
| 11.2 Alternativa | `SCHEDULE_ENGINE=ORTOOLS` y `SCHEDULE_ORTOOLS_PYTHON` apunta a un ejecutable que no existe | El `202` lleva `engine: "ORTOOLS"`; la generación termina `COMPLETED` con `engine: "BACKTRACKING"` y 36 entradas. En la base: generación y horario `BACKTRACKING`. Log: `SCHEDULE_GENERATION_STARTED` con `ORTOOLS`, un `warn` `ortools_fallback` con `reason: "invoke_error"` y `SCHEDULE_GENERATION_COMPLETED` con `BACKTRACKING`. 8 comprobaciones correctas. |
| 11.2 Por defecto | Sin `SCHEDULE_ENGINE` | El `202` lleva `engine: "BACKTRACKING"` y se mantiene hasta el final; la generación y el horario de la base son `BACKTRACKING`. 8 comprobaciones correctas. |
| Errores | — | `GET /api/schedule/generate` sin token: `401`. |

## Imagen de la Lambda (tarea 8.4)

Con Docker 29.8 (Linux/amd64) se construyó `solver-ortools/Dockerfile` (`docker build --platform linux/amd64`) y se probó con el emulador de runtime de Lambda que trae la imagen base:

- La imagen contiene solo `solver.py`, `cli.py`, `handler.py` y `requirements.txt` en `/var/task`, con Python 3.12.16 y `ortools 9.15.6755`, y **sin** `pytest` ni `ruff`. Ocupa unos 1,07 GB sin comprimir.
- `POST http://localhost:9000/2015-03-31/functions/function/invocations` con una petición válida devuelve `{"version": 1, "status": "solved", "placements": [...]}`; con una imposible, `{"version": 1, "status": "infeasible"}`; y con `version: 2`, un error `ValueError` con el campo que falla (`"version debe ser 1"`), que en AWS llega al transporte como `FunctionError`.
- Contenedor e imagen local retirados al terminar.
- **No se ha probado en AWS**: el arranque en frío de la imagen, los tiempos reales y el permiso de invocación solo se comprueban tras integrar y desplegar (tarea 14.1).

## Limpieza

- Antes de limpiar había en la base de desarrollo 3 colegios, 3 horarios con 108 entradas y 3 generaciones de las pruebas.
- Se vaciaron todas las tablas de `public` salvo `_prisma_migrations` (21) y `municipalities` (542), como antes de empezar.
- Backend parado (`taskkill /T /F` del proceso que escuchaba en el puerto), puerto 3000 libre (`Get-NetTCPConnection`: 0 conexiones) y ningún proceso de Python del motor vivo.

## Resultado

- Paso 11: **PASA**. Incidencias bloqueantes: ninguna.
