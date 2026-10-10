# Step 10 Report - Unit Tests and Database Verification

- Date: 2026-10-09
- Change: us01-d-limite-intentos-registro
- Agent: Claude (Sonnet 5.5)

## Commands Executed
- `docker compose up -d` (PostgreSQL 18 healthy)
- `npm exec -w backend -- vitest run --project unit src/domain/attempts src/application/attempts src/application/registration src/infrastructure/config.test.ts src/presentation src/app.test.ts`
- `npm exec -w backend -- vitest run --project integration src/infrastructure/prisma src/registrationAttempts.int.test.ts src/registration.int.test.ts src/session.int.test.ts test/support`
- `npm exec -w frontend -- vitest run src/services src/pages src/i18n src/App.test.tsx`
- `npm test` (backend unitarios + integración con cobertura, y frontend con cobertura)
- `npm run lint`, `npm run typecheck --workspaces`, `npm run build`, `npm run api:types:check -w frontend`
- `openspec validate us01-d-limite-intentos-registro`

## Unit Test Results
- Targeted backend (unit): 16 files, 255 passed, 0 failed, 0 skipped
- Targeted backend (integration): 13 files, 106 passed, 0 failed, 0 skipped
- Targeted frontend: 8 files, 94 passed, 0 failed, 0 skipped
- Full suite backend (`npm test`): 50 files, 494 passed, 0 failed. Cobertura: 99,74 % sentencias, 98,75 % ramas, 99,12 % funciones, 100 % líneas (umbral 90 %)
- Full suite frontend (`npm test`): 13 files, 228 passed, 0 failed. Cobertura: 99,66 % sentencias, 98 % ramas, 100 % funciones (umbral 80 %)
- `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`: exit 0
- Runtime: ~102 s la verificación completa; ~77 s los tests dirigidos
- Notes: sin tests inestables.

### Comprobaciones de que los tests detectan los fallos
- **Bloqueo por clave (`PrismaAttemptRepository`):** con la línea `pg_advisory_xact_lock` desactivada, el test de 10 intentos simultáneos aceptó los 10 (`expected … length of 5 but got 10`); con el bloqueo restaurado acepta exactamente 5. El bloqueo es necesario y el test lo detecta.
- **Middleware del límite:** con `limitAttempts` quitado de la ruta `/register`, 10 de los 12 tests de `registrationAttempts.int.test.ts` fallaron (los 2 que siguieron pasando son el JSON roto y el 503, que no dependen de él); restaurado, pasan los 12.

### Incidencia detectada y resuelta
La primera ejecución de `PrismaAttemptRepository` falló en todos los casos con `Failed to deserialize column of type 'void'`: `pg_advisory_xact_lock` devuelve `void` y el adaptador de Prisma no lo deserializa con `$queryRaw`. Se ejecuta con `$executeRaw`, que no lee columnas. Se anotó en el diseño (D2).

## Database State Verification
Conteo de filas por tabla de datos con `psql`, antes y después de la suite completa.

- Pre-test baseline:
  - `calendarschool` (desarrollo): `users`=0, `schools`=0, `refresh_tokens`=0, `rate_limit_attempts`=0, `municipalities`=542, `_prisma_migrations`=4
  - `calendarschool_test`, esquema `public` (E2E): `users`=0, `schools`=0, `refresh_tokens`=0, `municipalities`=542, `_prisma_migrations`=3 (aún sin `add_rate_limit_attempts`; la aplica `prisma migrate deploy` del E2E)
  - `calendarschool_test`, esquemas `test_1` a `test_4`: `users`, `schools`, `refresh_tokens` y `rate_limit_attempts`=0, `municipalities`=542 y `_prisma_migrations`=4 en todos
- Post-test validation: idéntica a la línea base (`diff` sin diferencias en ambas bases)
- State restored: Yes (no hizo falta restaurar nada: los tests vacían los datos de su esquema)
- Restoration actions: ninguna

## Outcome
- Step 10 status: PASS
- Blocking issues: none

## Addendum tras la verificación (`/opsx:verify`)
La verificación encontró 1 aviso y 2 sugerencias, que se resolvieron antes de archivar (artefactos primero, después tests en rojo y por último el código):
- **W1:** el escenario «Cuentan los intentos rechazados por validación o captcha» no tenía test de la parte del captcha. Se añade la opción `captchaVerifier` a `test/support/realApp.ts` y un test de integración con cinco `422` seguidos del `429`, sin que el captcha se vuelva a verificar.
- **S1:** una petición sin cuerpo cuenta como intento. Se añade a la spec (escenario «Petición sin cuerpo») y un test de integración.
- **S2:** la ventana de 15 minutos estaba definida en `server.ts` y en `realApp.ts`. Pasa a `REGISTRATION_ATTEMPTS_WINDOW_MS`, exportada desde `limitRegistrationAttempts.ts` y fijada por un test.

Resultado tras los cambios: backend 50 ficheros y **497 tests** pasan (3 más que antes), cobertura 99,74 % sentencias / 98,75 % ramas; `registrationAttempts.int.test.ts` pasa a 14 tests. ESLint y `typecheck` sin errores. El código del frontend no cambió.
