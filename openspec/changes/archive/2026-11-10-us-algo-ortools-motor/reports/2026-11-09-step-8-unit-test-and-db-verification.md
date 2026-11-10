# Paso 8 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-11-09
- Cambio: us-algo-ortools-motor
- Agente: Claude

## Comandos ejecutados

- `bash counts.sh` antes y después (recuentos de filas por tabla en `calendarschool` y en todos los esquemas de `calendarschool_test`)
- Tests de los módulos cambiados: `vitest run src/domain/schedule`, `src/application/schedule`, `src/infrastructure/config.test.ts`, `createScheduleSolver.test.ts` y, con `--project integration`, `prismaScheduleRepository.int.test.ts`, `childProcessOrToolsTransport.int.test.ts`, `orToolsEquivalence.int.test.ts` y `orToolsGeneration.int.test.ts`
- `solver-ortools/.venv/Scripts/python -m pytest solver-ortools` y `-m ruff check solver-ortools`
- `npm test` (los tres workspaces, con cobertura), `npm run lint` (ESLint de los tres workspaces y `prettier --check`) y `npm run typecheck --workspaces`

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Backend (unitarios e integración) | 252 ficheros, **4877 tests**, todos correctos (148 s) |
| Frontend | 158 ficheros, **5205 tests**, todos correctos |
| Infraestructura | 4 ficheros, **66 tests**, todos correctos |
| Python (`pytest`) | **19 tests** correctos; `ruff check` limpio |
| `npm run lint` | código de salida 0 |
| `npm run typecheck --workspaces` | código de salida 0 |
| Cobertura del backend (umbral 90 %) | sentencias 99,38 %, ramas 92,93 %, funciones 99,4 %, líneas 99,46 % |
| Cobertura del frontend (umbral 80 %) | sentencias 97,43 %, ramas 94,72 %, funciones 99,22 %, líneas 97,35 % |

- Los tests de integración que lanzan Python (`childProcessOrToolsTransport`, `orToolsEquivalence` y `orToolsGeneration`, 22 tests) se ejecutaron con el motor real, no se saltaron.
- Dos pasadas completas: una primera con un error de lint (una aserción de tipo innecesaria en un test), corregido, y una segunda, la de esta tabla, sin incidencias.
- Se comprobó con una mutación que los tests del latido y de la cancelación no son vacuosos: con `CANCEL_POLL_MS` en 60 000 ms los dos fallan; restaurado a 500 ms, pasan.

## Verificación de la base de datos

- Línea base antes de los tests:
  - `calendarschool` (desarrollo): `_prisma_migrations` 20 y `municipalities` 542, todo lo demás vacío.
  - `calendarschool_test`: el esquema `public` conserva los datos del último E2E (se limpian al empezar el siguiente) y cada `test_N` solo tiene `_prisma_migrations` y `municipalities`.
- Tras los tests:
  - `calendarschool`: idéntica.
  - `public` de `calendarschool_test`: **ninguna diferencia** respecto a la línea base.
  - Los esquemas `test_N`: solo `_prisma_migrations` y `municipalities`, igual que antes.
- Estado restaurado: no hizo falta restaurar nada. La migración `schedule_engine_ortools` está aplicada en desarrollo (es el cambio de 19 a 20 migraciones) y en los `test_N`.

## Resultado

- Paso 8: **PASA**
- Incidencias bloqueantes: ninguna.
