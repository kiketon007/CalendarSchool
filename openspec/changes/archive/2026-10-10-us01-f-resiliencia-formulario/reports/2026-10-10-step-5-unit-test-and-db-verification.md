# Step 5 Report - Unit Tests and Database Verification

- Date: 2026-10-10
- Change: us01-f-resiliencia-formulario
- Agent: Claude (Sonnet 5.5)

## Commands Executed
- `docker compose up -d` (PostgreSQL 18 ya levantado)
- `npm exec -w frontend -- vitest run src/services/registrationDraft.test.ts`
- `npm exec -w frontend -- vitest run src/pages/RegisterPage src/services`
- `npm test` (backend unitarios + integración con cobertura, y frontend con cobertura)
- `npm run lint`, `npm run typecheck --workspaces`, `npm run build`, `npm run api:types:check -w frontend`
- `openspec validate us01-f-resiliencia-formulario`

## Unit Test Results
- Targeted frontend: 7 files, 135 passed, 0 failed, 0 skipped (incluye 15 tests de `registrationDraft` y 17 de `RegisterPage.draft`)
- Full suite backend (`npm test`): 55 files, 597 passed, 0 failed. Cobertura: 99,78 % sentencias, 99,14 % ramas (umbral 90 %). Sin cambios de código en el backend.
- Full suite frontend (`npm test`): 20 files, 313 passed, 0 failed. Cobertura: 98,35 % sentencias, 96,71 % ramas, 100 % funciones (umbral 80 %)
- `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`: exit 0
- Notes: sin tests inestables.

### Comprobaciones de que los tests detectan los fallos
- **Guarda de envío:** con la guarda de `handleSubmit` devuelta a `isPending` (estado), el test de dos `requestSubmit()` seguidos falló («expected "register" to be called 1 times, but got 2 times»); restaurada la `ref`, pasa.
- Antes de implementar, 9 de los 17 tests de `RegisterPage.draft.test.tsx` fallaban (restauración, guardado, conservación y envío único); tras implementar pasan los 17.

### Incidencias detectadas y resueltas
1. **ESLint con tipos tras la primera versión:** `react-hooks/set-state-in-effect` por el efecto que borraba el municipio desconocido, y `unbound-method` por exportar los métodos del borrador sin envolver. Se resolvió derivando los valores efectivos con `useMemo` (sin efecto) y exportando funciones flecha; el diseño (D4) se actualizó para reflejarlo.
2. **Test del doble envío:** buscaba el botón por «Crear cuenta», pero durante el envío el texto es «Enviando…»; defecto del test.

### Escenario «Dos pestañas con el mismo email» (tarea 4.2)
Lo cubren, sin cambios, `backend/src/registration.int.test.ts` («creates only one of two simultaneous registrations with the same email» y «…of the same school»): un `201` y un `409`, con un solo colegio y un usuario en la base de datos. Pasan en la suite completa.

## Database State Verification
Conteo de filas (`users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `municipalities`) por esquema con `psql`, antes y después de la suite completa.

- Pre-test baseline:
  - `calendarschool` (desarrollo): 0, 0, 0, 0, 542
  - `calendarschool_test`, `public` (E2E): 0, 0, 0, 0, 542
  - `calendarschool_test`, `test_1` a `test_3`: 0, 0, 0, 0, 542
  - `calendarschool_test`, `test_4`: 0, 0, 0, **1**, 542 (una fila residual de una ejecución anterior en un esquema de tests)
- Post-test validation: idéntica salvo `test_4`, cuya fila residual de `rate_limit_attempts` desapareció porque `resetDatabase()` vacía el esquema antes de cada test.
- State restored: Yes (no hizo falta restaurar nada; este cambio no toca la base de datos)
- Restoration actions: ninguna

## Outcome
- Step 5 status: PASS
- Blocking issues: none
