# Informe del paso 9 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-11-03
- Cambio: us-algo-check
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `bash $TEMP/counts.sh` antes y después: recuentos por tabla en `calendarschool` y en `public` y `test_1` a `test_4` de `calendarschool_test`.
- Tests de los módulos cambiados (9.2): `domain/schedule`, `application/schedule`, `presentation/schedule`, `scheduleReadiness.int.test.ts`, `prismaSchedulingProblemRepository.int.test.ts`, `app.test.ts` y `composeApp.int.test.ts` en el backend (8 ficheros, 83 tests); y `ScheduleReadinessPage`, `ReadinessIssueItem`, `AppHeader`, `scheduleReadinessService`, `App` y `api` en el frontend (6 ficheros, 253 tests).
- `npm test` completo (tres workspaces, con cobertura): código de salida 0, a la primera.
- `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend` (paso 8.2): los tres con código de salida 0.

## Resultados de los tests

- **Backend** (unitarios + integración): 215 ficheros, 4215 tests, 0 fallos. Cobertura: 99,74 % de sentencias, 98,58 % de ramas, 99,54 % de funciones y 99,82 % de líneas (mínimo, 90 %).
- **Frontend:** 129 ficheros, 4172 tests, 0 fallos. Cobertura: 97,58 % de sentencias, 94,79 % de ramas, 99,20 % de funciones y 97,51 % de líneas (mínimo, 80 %).
- **Infraestructura:** 4 ficheros, 57 tests, 0 fallos.
- **Observaciones:**
  - La tabla `test-fixtures/schedule-readiness.json` tiene 20 casos que cubren los 16 códigos, los órdenes y las asignaturas inactivas. Se calcularon a mano antes de implementar `readinessOf` y los 33 tests del dominio pasaron a la primera, lo que valida a la vez la tabla y la implementación.
  - La regeneración de los tipos falló una vez porque un `description` del YAML empezaba por un acento grave (no es un escalar válido); se entrecomilló.
  - Los tests de `AppHeader` y `App` se actualizaron para la entrada «Horarios» (tras «Reglas» y antes de «Usuarios») y la ruta `/horarios`.
- **Honestidad del TDD:** en todas las piezas se vio el rojo (módulo, campo o comportamiento ausente), salvo los tests HTTP de integración de 5.2, que pasaron a la primera porque la ruta ya existía, y los de `axe` de la página (7.6), que no encontraron violaciones. En el test de la carga de la página una aserción sobre un `role="status"` con nombre nunca habría fallado; se corrigió antes de implementar.

## Verificación de la base de datos

- **Línea base previa:** `calendarschool` sin datos propios; `calendarschool_test` vaciada con `TRUNCATE schools CASCADE` y `rate_limit_attempts` en `public` y en los esquemas de los workers. Era idéntica a la del cambio anterior.
- **Validación posterior:** la comparación de los recuentos con `diff` es idéntica a la línea base.
- **Estado restaurado:** sí, sin acciones adicionales. Este cambio no añade migraciones.

## Resultado

- Estado del paso 9: **PASS**
- Incidencias bloqueantes: ninguna.
