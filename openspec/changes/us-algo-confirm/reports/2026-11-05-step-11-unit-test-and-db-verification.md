# Paso 11: tests y estado de la base de datos (2026-11-05)

Cambio: `us-algo-confirm`. Backend (migración, lectura generalizada, confirmar y descartar, rutas) y frontend (servicios, diálogos, página del oficial, resumen y panel).

## Comandos

- Línea base: vaciar los esquemas `test_*` y las tablas de `public` de `calendarschool_test` y capturar los recuentos de las dos bases (`counts.sh`). Ya con la migración `confirm_schedules` aplicada a la base de desarrollo y a los esquemas de test: `_prisma_migrations` pasa de 17 a 18 (en `public` de `calendarschool_test` sigue en 17: la aplicará el E2E).
- Módulos cambiados: backend (`application/schedule`, `presentation/schedule`, `errorHandler`, `appError`, los tests de integración de Prisma y los HTTP de horarios) y frontend (`services`, `utils`, `components`, `pages`, `api`, `i18n`, `App`).
- Todo: `npm test` (backend, frontend e infraestructura, con cobertura), `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Módulos cambiados, backend | 21 ficheros, 324 tests |
| Módulos cambiados, frontend | 124 ficheros, 4040 tests |
| Backend | 238 ficheros, 4625 tests (antes 233 y 4531); cobertura de líneas 99,58 % |
| Frontend | 143 ficheros, 4695 tests (antes 139 y 4550); cobertura de líneas 97,42 % |
| Infraestructura | 4 ficheros, 66 tests |
| `lint`, `typecheck` y `api:types:check` | salida 0 |

Tests nuevos principales: restricciones de `schedules` (11 en `scheduleTables.int.test.ts`), lectura del oficial y `overview` (10 en el repositorio), `ConfirmSchedule` (6), `DiscardScheduleDraft` (4), `GetScheduleOverview` (4), confirmar y descartar en el repositorio (14, con la carrera de dos confirmaciones), rutas (26), HTTP de extremo a extremo (15), servicios del frontend (más de 90), `draftGaps` (4), los dos diálogos (33), la página del oficial y sus acciones (23), el resumen (9) y el panel (7 y 4 en la página).

## Base de datos

- Después de los tests quedaba un resto de un test (`test_4.rate_limit_attempts = 1`): los tests vacían las tablas antes de cada test, no al terminar. Se vació y los recuentos quedaron idénticos a la línea base.
- La base de desarrollo (`calendarschool`) no se ha tocado salvo por la migración.

## Observaciones

- No se detectó ningún test inestable. El de dos confirmaciones simultáneas se repitió tres veces.
- Los tests de integración HTTP de la confirmación (5.3) y los de la página con el resumen pasaron a la primera porque la implementación ya existía: verifican, no guiaron.
- El test del diálogo de descartar se escribió junto al componente, sin ver antes el rojo.
