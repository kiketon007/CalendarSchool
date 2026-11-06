# Paso 10: tests y estado de la base de datos (2026-11-06)

Cambio: `us-algo-run-b`.

## Línea base (10.1)

Recuentos exactos de filas por tabla, antes de ejecutar nada (solo las tablas no vacías):

| Base | Contenido |
| --- | --- |
| `calendarschool` (desarrollo) | `_prisma_migrations` 19 (con la migración nueva `schedule_score`, aplicada con `npm run db:migrate`) y `municipalities` 542 |
| `calendarschool_test`, esquemas `test_1` a `test_4` | `_prisma_migrations` 19 y `municipalities` 542 en cada uno |
| `calendarschool_test`, esquema `public` | `_prisma_migrations` 18 y `municipalities` 542 (sin tocar: lo usa el E2E, que migra al arrancar) |

El resto de las tablas estaban vacías: `resetDatabase()` las vacía antes de cada test.

## Tests de los módulos cambiados (10.2)

Se ejecutaron por grupos mientras se implementaba, cada uno en rojo antes (salvo donde se dice en el resumen) y en verde después:

- Dominio: `scheduleScore`, `generationInput`, `scheduleImprover` (15 casos), `backtrackingSolver` (fase 2, 12 semillas aleatorias, tamaño real y colegio sin huecos con reloj contado).
- Aplicación: `generationView`, `startGeneration`, `runGeneration`, `getSchedule`, `getScheduleOverview`, `listPreviousSchedules`.
- Infraestructura (integración): `PrismaGenerationRepository`, `PrismaScheduleRepository`, `PrismaScheduleReadRepository`.
- Presentación: `startGenerationRequest`, rutas de la generación y, en integración, `scheduleGeneration`, `scheduleConfirmation` y `schedulePrevious`.
- Frontend: `scheduleScore`, los tres servicios, `ScheduleScoreSummary`, `ScheduleGenerationPanel`, `ScheduleDraftPage`.

## Suite completa (10.3)

`npm test` desde la raíz (con cobertura), `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, todos con código de salida 0:

| Workspace | Ficheros | Tests | Cobertura (líneas) | Umbral |
| --- | --- | --- | --- | --- |
| backend (unitarios + integración) | 245 | 4797 | 99,51 % (ramas 92,87 %) | 90 % |
| frontend | 147 | 4868 | 97,38 % (ramas 94,71 %) | 80 % |
| infrastructure | 4 | 66 | — | — |

`npm run lint` incluye `prettier --check backend frontend infrastructure`. Al formatear `backend/CLAUDE.md` con Prettier salió un aviso que se corrigió antes de la última ejecución, que dio 0.

## Estado de la base tras los tests (10.4)

Se repitieron los recuentos exactos de la línea base: **idénticos** (las mismas tablas y las mismas cifras). No hizo falta restaurar nada.

## Notas

- Las pruebas escritas junto con su implementación, sin verlas fallar antes, fueron el parser del `POST` (`startGenerationRequest`), `toGenerationView` y los tests del servicio de generación del frontend. El resto se vio en rojo primero.
- Los fallos que aparecieron por el camino fueron de fixtures de tests existentes (campos nuevos obligatorios) y un `axe` dentro de un `describe` con reloj simulado, que se movió a un `describe` con reloj real; ningún test falló tres veces seguidas.
