# Paso 10 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-11-10
- Cambio: us-algo-ortools-despliegue
- Agente: Claude

## Comandos ejecutados

- Línea base y comprobación posterior de recuentos de filas por tabla en `calendarschool` y en todos los esquemas de `calendarschool_test` (`counts.sh`).
- Tests de los módulos cambiados, al implementar cada tarea: `vitest run` de `application/schedule`, `domain/schedule`, `infrastructure/aws`, `config` y `createScheduleSolver`; con `--project integration`, `prismaGenerationRepository`, `prismaScheduleRepository` y `scheduleGeneration`; `vitest run` del servicio, el panel y la página del frontend, y de `appStack` y `scheduleEngine` en infraestructura.
- `npm test` (los tres workspaces, con cobertura), `npm run lint` (ESLint de los tres workspaces y `prettier --check`), `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`.
- `solver-ortools/.venv/Scripts/python -m pytest solver-ortools` y `-m ruff check solver-ortools`.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Backend (unitarios e integración) | 253 ficheros, **4916 tests**, todos correctos (157 s) |
| Frontend | 158 ficheros, **5222 tests**, todos correctos |
| Infraestructura | 5 ficheros, **89 tests**, todos correctos |
| Python (`pytest`) | **28 tests** correctos; `ruff check` limpio |
| `npm run lint` | código de salida 0 |
| `npm run typecheck --workspaces` | código de salida 0 |
| `npm run api:types:check -w frontend` | código de salida 0 |
| Cobertura del backend (umbral 90 %) | sentencias 99,38 %, ramas 92,89 %, funciones 99,4 %, líneas 99,46 % |
| Cobertura del frontend (umbral 80 %) | sentencias 97,43 %, ramas 94,72 %, funciones 99,22 %, líneas 97,35 % |

- Los tests que lanzan Python (`orToolsGeneration`, `orToolsEquivalence`, `childProcessOrToolsTransport` y el caso `ORTOOLS` de `scheduleGeneration`) se ejecutaron con el motor real, no se saltaron.
- Dos mutaciones comprobaron que dos de los tests nuevos no son vacuosos: quitar de `replaceDraft` la escritura del motor hace fallar el caso de la alternativa de `scheduleGeneration.int.test.ts`; y, en el cambio anterior, subir `CANCEL_POLL_MS` a 60 000 ms hacía fallar los del latido y la cancelación.
- La primera pasada de `lint` falló por un fallo de formato en `backend/CLAUDE.md` (mis ediciones no estaban formateadas; el hook de pre-commit lo habría corregido al comitear). Se formateó y la segunda pasada salió limpia.
- `E2E`: no se ejecutó en este paso (ver el informe del paso 12).

## Verificación de la base de datos

- Línea base antes de los tests:
  - `calendarschool` (desarrollo): `_prisma_migrations` 21 y `municipalities` 542, todo lo demás vacío (21 con la migración `schedule_generation_engine`, aplicada al implementar la tarea 5.1).
  - `calendarschool_test`: el esquema `public` conserva los datos del último E2E (se limpian al empezar el siguiente) y los esquemas `test_N` tenían filas del último test de cada worker de la ejecución anterior.
- Tras los tests:
  - `calendarschool`: idéntica.
  - `public` de `calendarschool_test`: **ninguna diferencia** respecto a la línea base.
  - Los esquemas `test_N`: solo `_prisma_migrations` y `municipalities`. Es por diseño: `resetDatabase()` los vacía antes de cada test, así que lo que quede es solo el último test de cada worker.
- Estado restaurado: no hizo falta restaurar nada. La migración `schedule_generation_engine` está aplicada en desarrollo y en los `test_N`.

## Resultado

- Paso 10: **PASA**. Incidencias bloqueantes: ninguna.
