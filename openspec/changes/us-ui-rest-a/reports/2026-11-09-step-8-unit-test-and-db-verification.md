# Paso 8: tests unitarios y verificación de la base de datos (us-ui-rest-a)

Fecha: 2026-11-09

## Tests

- Ficheros cambiados (`generationStatus`, `ScheduleScoreSummary`, `ScheduleScoreStats`, `ScheduleGenerationPanel`, `ScheduleReadinessPage`, `ReadinessIssueItem`, `OfficialScheduleSummary`, `ScheduleDraftPage`, `theme`, `locales`, `App`): 11 ficheros, 541 tests, todos en verde.
- `npm test` (exit 0): backend unitarios 4797 tests, backend integración 5205 tests, frontend 245 ficheros, infrastructure 66 tests; todos en verde.
- Cobertura por encima de los umbrales (90 % backend, 80 % frontend).
- `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`: exit 0.

## Base de datos

Recuentos por tabla de `calendarschool` y de los esquemas de `calendarschool_test` antes y después de los tests: idénticos (`diff` sin diferencias). El cambio es solo de frontend y no escribe datos.

## Tamaño del build

- CSS: 31,79 kB → 32,05 kB en gzip (límite 33,75 kB).
- JS: 897,99 kB (245,88 kB en gzip) frente a 244,71 kB de `main` tras US-UI-HOME: +1,17 kB (el componente de cifras, la utilidad de estado y el icono nuevo).
- CSS de `main`: 31,79 kB; con `_schedule.scss`: 32,05 kB (+0,26 kB).
