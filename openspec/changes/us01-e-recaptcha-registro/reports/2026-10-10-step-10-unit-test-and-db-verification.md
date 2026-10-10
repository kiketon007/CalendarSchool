# Step 10 Report - Unit Tests and Database Verification

- Date: 2026-10-10
- Change: us01-e-recaptcha-registro
- Agent: Claude (Sonnet 5.5)

## Commands Executed
- `docker compose up -d` (PostgreSQL 18 healthy)
- `npm exec -w backend -- vitest run --project unit src/application/registration src/infrastructure/config.test.ts src/infrastructure/fakeCaptchaVerifier.test.ts src/infrastructure/recaptchaCaptchaVerifier.test.ts src/infrastructure/createCaptchaVerifier.test.ts src/presentation`
- `npm exec -w backend -- vitest run --project integration src/registrationCaptcha.int.test.ts src/registration.int.test.ts src/registrationAttempts.int.test.ts src/session.int.test.ts`
- `npm exec -w frontend -- vitest run src/captcha src/services src/pages src/i18n`
- `npm test` (backend unitarios + integración con cobertura, y frontend con cobertura)
- `npm run lint`, `npm run typecheck --workspaces`, `npm run build`, `npm run api:types:check -w frontend`
- `openspec validate us01-e-recaptcha-registro`

## Unit Test Results
- Targeted backend (unit): 18 files, 325 passed, 0 failed, 0 skipped
- Targeted backend (integration): 4 files, 55 passed, 0 failed, 0 skipped
- Targeted frontend: 12 files, 142 passed, 0 failed, 0 skipped
- Full suite backend (`npm test`): 55 files, 597 passed, 0 failed. Cobertura: 99,78 % sentencias, 99,14 % ramas, 99,2 % funciones, 100 % líneas (umbral 90 %)
- Full suite frontend (`npm test`): 18 files, 281 passed, 0 failed. Cobertura: 98,16 % sentencias, 96,48 % ramas, 100 % funciones (umbral 80 %)
- `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`: exit 0
- Runtime: ~107 s la verificación completa; ~72 s los tests dirigidos
- Notes: sin tests inestables.

### Comprobaciones de que los tests detectan los fallos
- **Verificación del captcha en el caso de uso:** con la llamada `verifyCaptcha` desactivada, 9 de los 12 tests de `registrationCaptcha.int.test.ts` fallaron (los 3 que siguieron pasando no dependen de ella); restaurada, pasan los 12.
- **Umbral de score:** con `RECAPTCHA_V3_MIN_SCORE` cambiado de 0,6 a 0,5, falló 1 test de `recaptchaCaptchaVerifier.test.ts`.
- **Acción de v3:** con la comprobación de la acción `register` anulada, fallaron 2 tests.
- En los tres casos, restaurado el código, los tests vuelven a pasar.

### Incidencias detectadas y resueltas
1. **ESLint con tipos tras el primer commit de los verificadores:** 3 errores (`prefer-promise-reject-errors` en el verificador falso y en un test, y `no-base-to-string` en otro test) que el hook de pre-commit no detecta porque usa una configuración sin tipos. Se corrigieron en el commit siguiente. A partir de aquí, `eslint` completo se ejecuta antes de cada commit.
2. **Tests que fallaban por el cambio de orden:** dos tests de integración afirmaban que una petición sin cuerpo respondía `400`; ahora responde `422 CAPTCHA_FAILED`, porque el captcha se verifica antes que la validación (era el cambio de comportamiento anunciado). Antes de tocarlos se actualizó el delta de la spec (que modifica el escenario «Petición sin cuerpo» de US01_d). El test de validación de los 6 campos ausentes se conservó enviando un captcha válido y ningún otro campo.
3. **Test de log con el formato de nivel equivocado:** comprobaba `"level":50` y el logger escribe el nivel como texto (`"level":"error"`). Defecto del test, no de la implementación.

## Database State Verification
Conteo de filas por tabla de datos con `psql`, antes y después de la suite completa.

- Pre-test baseline:
  - `calendarschool` (desarrollo): `users`=0, `schools`=0, `refresh_tokens`=0, `rate_limit_attempts`=0, `municipalities`=542, `_prisma_migrations`=4
  - `calendarschool_test`, esquema `public` (E2E): `users`, `schools`, `refresh_tokens` y `rate_limit_attempts`=0, `municipalities`=542, `_prisma_migrations`=4
  - `calendarschool_test`, esquemas `test_1` a `test_4`: todos a 0, `municipalities`=542 y `_prisma_migrations`=4
- Post-test validation: idéntica a la línea base (`diff` sin diferencias en ambas bases)
- State restored: Yes (no hizo falta restaurar nada: los tests vacían los datos de su esquema y este cambio no toca la base de datos)
- Restoration actions: ninguna

## Outcome
- Step 10 status: PASS
- Blocking issues: none
