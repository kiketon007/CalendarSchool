# Informe del paso 8 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-11-03
- Cambio: us-algo-run-motor
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `bash $TEMP/counts.sh` antes y después: recuentos por tabla en `calendarschool` y en `public` y `test_1` a `test_4` de `calendarschool_test`.
- Tests de los módulos cambiados (8.2): `domain/schedule` (5 ficheros, 93 tests), `application/schedule`, `scheduleReadiness.int.test.ts` y, en el frontend, `ReadinessIssueItem`, `ScheduleReadinessPage` y `scheduleReadinessService`.
- `npm test` completo (tres workspaces, con cobertura): código de salida 0 en la segunda ejecución.
- `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend` (paso 7.2): los tres con código de salida 0.

## Resultados de los tests

- **Backend** (unitarios + integración): 218 ficheros, 4275 tests, 0 fallos. Cobertura: 99,56 % de sentencias, 95,48 % de ramas, 99,57 % de funciones y 99,62 % de líneas (mínimo, 90 %).
- **Frontend:** 129 ficheros, 4176 tests, 0 fallos. Cobertura: 97,52 % de sentencias, 94,72 % de ramas, 99,2 % de funciones y 97,44 % de líneas (mínimo, 80 %).
- **Infraestructura:** 4 ficheros, 57 tests, 0 fallos.
- **Observaciones:**
  - Los 11 casos de `test-fixtures/schedule-generation.json` están calculados a mano con el orden del motor (MRV, desempate por tamaño e índice, valores ascendentes) y pasaron a la primera, lo que valida a la vez la tabla y el motor. Incluyen el tutor libre que da clase en otra clase, calendarios de 45 y 60 minutos, un bloque con recreo, el máximo al día, y los tres `infeasible` (`NO_FREE_CELLS`, `PROFESSOR_BUSY` y `MAX_HOURS`).
  - El aviso nuevo cambió el resultado de 12 de los 20 casos antiguos de `schedule-readiness.json` (cursos con menos carga que franjas) y de tres tests de integración y de caso de uso: se actualizaron a propósito con las cifras calculadas a mano.
  - **Primera ejecución de `npm test` con 2 fallos:** los tests de propiedades 11 y 12 superaron los 5 s de Vitest con la máquina cargada. El límite de la búsqueda se mide en consultas de un reloj contado (determinista), no en tiempo real; se redujo de 40 a 10 y se dio un tiempo de test de 20 s. A la segunda ejecución pasó todo.
  - `eslint` encontró dos errores (`Array(n).fill` con `any` y un campo sin tipar en un test de integración); se corrigieron.
- **Honestidad del TDD:** se vio el rojo en el aviso nuevo (2 casos de la tabla, tests del frontend y de tipos). Los tests de `generationInputOf`, `validateSchedule` y del motor se escribieron junto al código y pasaron casi a la primera (solo falló una expectativa mal calculada del validador, `HC1` doble); las tablas calculadas a mano son la garantía independiente.

## Verificación de la base de datos

- **Línea base previa:** idéntica a la del cambio anterior (`diff` sin diferencias); `calendarschool` sin datos propios y `calendarschool_test` vaciada.
- **Validación posterior:** la comparación de los recuentos con `diff` es idéntica a la línea base.
- **Estado restaurado:** sí, sin acciones adicionales. Este cambio no añade migraciones.

## Resultado

- Estado del paso 8: **PASS**
- Incidencias bloqueantes: ninguna.
