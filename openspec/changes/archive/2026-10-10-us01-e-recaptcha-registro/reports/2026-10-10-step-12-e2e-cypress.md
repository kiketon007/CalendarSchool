# Step 12 Report - E2E Testing with Cypress

- Date: 2026-10-10
- Change: us01-e-recaptcha-registro
- Agent: Claude (Sonnet 5.5)
- Entorno: `npm run test:e2e` (compila ambos workspaces, migra y vacía el esquema `public` de `calendarschool_test`, arranca el backend compilado en :3001 y `vite preview` en :4173) con Cypress 16.1.1 en modo headless sobre Electron/Chrome 146. El backend arranca **sin secretos de reCAPTCHA** (verificador falso) y el frontend **sin claves de sitio** (cliente falso): el E2E no depende de Google.

## Specs
- `cypress/e2e/registration.cy.ts` (ampliada): nuevo bloque «captcha verification», con 7 tests. El token del primer envío se cambia por uno de los reservados del verificador falso con `cy.intercept({ method, url, times: 1 }, handler)` y `request.continue()`: la petición llega al backend real, que responde de verdad `422` o `503`.
- Las demás specs (`session.cy.ts`, `health.cy.ts`, `home.cy.ts`) no han cambiado y siguen pasando: sus altas envían `token: 'e2e'`, que el verificador falso acepta.

## Commands Executed
- `npm run test:e2e -- --spec cypress/e2e/registration.cy.ts` (spec dirigida; 1.ª ejecución: 24 de 25, ver incidencia; 2.ª: 25 de 25)
- `npm run test:e2e` (suite completa)

## Escenarios cubiertos (bloque del captcha)
| Escenario | Resultado esperado |
|---|---|
| aviso de privacidad | enlaces a `https://policies.google.com/privacy` y `/terms` con `target="_blank"` y `rel="noopener noreferrer"` |
| sin claves de sitio | no existe ningún `<script>` de reCAPTCHA |
| reto v2 de extremo a extremo | primer envío con `fake-low-score` → `422`; aparece la explicación y el reto simulado; la contraseña se conserva y el envío está deshabilitado; al pulsar el reto, se habilita; el segundo envío lleva `{ version: 'v2', token: 'fake-v2-token' }`, da `201` y lleva a `/onboarding` |
| reenvío tras un fallo | tras `fake-fail` se reescribe la contraseña y el segundo envío lleva un token v3 y da `201` |
| verificación fallida | `fake-fail` → `422`, mensaje «No hemos podido verificar…», sin reto, datos conservados salvo la contraseña, sigue en `/registro` |
| Google no disponible | `fake-unavailable` → `503`, mensaje de indisponibilidad sin «503» ni el código |
| no se crea nada | tras un captcha fallido, el mismo email se registra después con `201` |

## E2E Test Results
- Spec dirigida `registration.cy.ts`: 25 passed, 0 failed (≈27 s)
- Suite completa: 4 specs (`health`, `home`, `registration`, `session`), 40 tests, 40 passed, 0 failed, 0 pending (≈37 s)
- `npm run typecheck --workspaces` y ESLint sobre `cypress/`: sin errores

### Incidencias detectadas y resueltas (ambas, defectos del test)
1. En la 1.ª ejecución, ESLint señaló un acceso a una propiedad de un valor `any` en un test; se tipa la aserción.
2. En la 1.ª ejecución falló «asks for a new v3 token in every submit»: cuando un `cy.intercept` llama a `request.continue()` la petición no llega a los demás intercepts, así que el alias genérico solo recibía el segundo envío y el segundo `cy.wait` agotaba el tiempo. Además, el cliente falso devuelve siempre el mismo token, de modo que el E2E no puede demostrar que sea «nuevo» (eso lo cubren los tests unitarios de `RegisterPage` y del cliente real). El test pasa a llamarse «sends a v3 token again, with the retyped password, after a failed verification» y afirma lo que el E2E sí puede comprobar.

## Data Persistence and Environment
- Tras la suite completa, el esquema `public` de `calendarschool_test` tenía 20 usuarios, 20 colegios y 20 `refresh_tokens` (una alta por cuenta) y 29 filas en `rate_limit_attempts` (un intento por cada petición de registro con JSON válido, también las rechazadas por captcha, que no crean nada).
- Restauración: `TRUNCATE TABLE public.rate_limit_attempts, public.refresh_tokens, public.users, public.schools RESTART IDENTITY CASCADE`. Estado final: todas a 0, `municipalities=542`, `_prisma_migrations=4`. La base de desarrollo `calendarschool` sigue idéntica a su línea base.
- Se borró `frontend/cypress/screenshots` (capturas de fallos, ignoradas por git).

## Outcome
- Step 12 status: PASS
- Blocking issues: none
