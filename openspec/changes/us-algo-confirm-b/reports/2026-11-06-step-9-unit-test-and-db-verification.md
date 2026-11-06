# Paso 9: tests y estado de la base de datos (2026-11-06)

Cambio: `us-algo-confirm-b`. Solo lecturas nuevas (sin migración), así que la base no debe cambiar.

## Comandos ejecutados

- `bash empty-test-db.sh`: vacía los esquemas `test_*` de `calendarschool_test` (conserva `_prisma_migrations` y `municipalities`).
- `bash counts.sh`: recuentos por tabla de `calendarschool` y `calendarschool_test` (línea base `baseline6` y después de los tests).
- Módulos cambiados:
  - Backend: `prismaScheduleReadRepository.int.test.ts`, `schedulePrevious.int.test.ts`, `scheduleConfirmation.int.test.ts`, `presentation/schedule`, `application/schedule` y `app.test.ts`.
  - Frontend: servicios, `scheduleExport`, `OfficialScheduleSummary`, `PreviousSchedulesPage`, `PreviousSchedulePage`, `ScheduleDraftPage`, `ScheduleReadinessPage` y `App`.
- `npm test` (los tres workspaces, con cobertura), `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Módulos cambiados, backend | 19 ficheros, 238 tests, todos correctos |
| Módulos cambiados, frontend | 32 ficheros, 1596 tests, todos correctos |
| `npm test` backend (unitarios + integración) | 241 ficheros, 4668 tests; cobertura 99,58 % sentencias, 95,19 % ramas (mínimo 90 %) |
| `npm test` frontend | 145 ficheros, 4761 tests; cobertura 97,42 % sentencias, 94,61 % ramas (mínimo 80 %) |
| `npm test` infraestructura | 4 ficheros, 66 tests |
| `npm run lint` (ESLint + Prettier) | salida 0 |
| `npm run typecheck --workspaces` | salida 0 |
| `npm run api:types:check -w frontend` | salida 0 |

Tests nuevos: repositorio (`find` por id y `listPrevious`: 10 de integración), casos de uso (`GetSchedule` con `{ id }` y `ListPreviousSchedules`), rutas (`scheduleHistoryRoute.test.ts`, incluido que las rutas literales no caen en `/:id`), HTTP (`schedulePrevious.int.test.ts`, 7), servicios (`getById`, `previous`), exportación de un sustituido, `PreviousSchedulesPage`, `PreviousSchedulePage`, el modo `previous` de `ScheduleDraftPage`, el enlace del resumen y las rutas de `App`.

## Estado de la base de datos

| | Antes (línea base) | Después de los tests |
| --- | --- | --- |
| `calendarschool` (desarrollo) | `_prisma_migrations` = 18; resto de tablas a 0 salvo `municipalities` | idéntica |
| `calendarschool_test` (`public` y `test_1`…`test_4`) | `_prisma_migrations` = 18, `municipalities` = 542, resto a 0 | idéntica |

`diff` de los recuentos antes y después: sin diferencias. No hizo falta restaurar nada.

## Incidencias

- Un comando mío esperó entrada por error y quedó colgado hasta su límite; no tocó ni la base ni el repositorio.
- Los avisos `DeprecationWarning` de `pg` (`client.query()` con el cliente ocupado) ya aparecían en los tests de integración existentes.
