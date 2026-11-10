# Paso 12 - Entrega y comprobación en producción

- Fecha: 2026-11-10
- Cambio: us-algo-ortools-motor (integrado junto con `us-algo-ortools-despliegue`, ver su informe `2026-11-10-step-14-production.md`)
- Agente: Claude

## Integración (tareas 12.1 y 6.2)

- **Repetición de las comprobaciones (12.1)**, cada una con su código de salida 0: `npm run lint`, `npm run typecheck --workspaces`, `npm run api:types:check -w frontend`, `ruff check`, `ruff format --check` y `pytest solver-ortools` (28 tests).
- **PR #179** (https://github.com/kiketon007/CalendarSchool/pull/179) con los dos cambios, de `feature/us-algo-ortools-despliegue` a `main`, abierta tras la confirmación de la persona usuaria ("Puedes integrarlas en main"). Fusionada con el commit `a510e4c`.
- **La CI de la PR (6.2)**: «Lint, tests y build» (8 min 3 s) y «E2E con Cypress» (10 min 38 s) en verde. El log del primer job confirma que:
  - instala Python 3.12 y `solver-ortools/requirements-dev.txt` (`ortools 9.15.6755`);
  - ejecuta `ruff check`, `ruff format --check` y `pytest`;
  - los tres ficheros de integración que lanzan el Python real (`childProcessOrToolsTransport`, `orToolsEquivalence` y `orToolsGeneration`) pasan, sin ninguna línea «skipped» y sin el aviso de que se saltan.
- El push a `main` lanzó la CI (run 42809367453): E2E, calidad y «Desplegar en producción» en verde.

## Producción con el motor por defecto (12.2)

Con la variable `SCHEDULE_ENGINE` sin definir, el despliegue dejó `BACKTRACKING` (el log del paso de CDK dice `Motor de generación de horarios: BACKTRACKING`). Comprobado con `curl` contra https://app.calendarschools.es tras el despliegue:

| Petición | Resultado |
| --- | --- |
| `GET /api/health` | `{"success":true,"data":{"status":"ok","database":"up"}}` |
| `POST /api/schedule/generate` sin token | `401` |
| `GET /api/schedule/generate` sin token | `401` |
| `GET /horarios` (SPA) | `200` |

El smoke test del propio despliegue también pasó (`GET /`, `POST /api/auth/login`, `execute-api` sin cabecera y `GET /api/health`).

La parte de esta tarea que pedía que la persona usuaria generara un horario con el motor por defecto **no se hizo con ese motor**: su prueba de generación se hizo directamente con `ORTOOLS` (ver el informe del otro cambio), así que el motor por defecto solo queda cubierto por lo anterior y por el E2E de la CI.

## Resultado

- 6.2 y 12.1: **PASA**.
- 12.2: **PASA** en lo comprobable por `curl`; sin la generación de la persona usuaria con el motor por defecto (ver arriba).
- 12.3: este informe.
