# Step 12 Report - E2E Testing with Cypress

- Date: 2026-10-09
- Change: us01-d-limite-intentos-registro
- Agent: Claude (Sonnet 5.5)
- Entorno: `npm run test:e2e` (compila ambos workspaces, migra el esquema `public` de `calendarschool_test`, lo vacía, arranca el backend compilado en :3001 con `REGISTRATION_ATTEMPTS_MAX=1000` y `vite preview` en :4173) con Cypress 16.1.1 en modo headless sobre Electron/Chrome 146.

## Specs
- `cypress/e2e/registration.cy.ts` (ampliada): nuevo bloque «when the server limits the attempts (429)», con 4 tests. El `429` se simula con `cy.intercept`, porque el E2E sube el máximo a 1000 (todas sus peticiones llegan desde la misma IP) y el límite real se prueba en los tests de integración.
- `scripts/e2e.mjs`: arranca el backend con `REGISTRATION_ATTEMPTS_MAX=1000` (tarea 2.4).

## Commands Executed
- `npm run test:e2e -- --spec cypress/e2e/registration.cy.ts` (spec dirigida; 1.ª y 2.ª ejecución: 17 de 18, ver incidencias; 3.ª: 18 de 18)
- `npm run test:e2e` (suite completa)

## Escenarios cubiertos (bloque del 429)
| Escenario | Resultado esperado |
|---|---|
| `Retry-After: 840` | un único `role="alert"` con «…Vuelve a intentarlo dentro de 14 minutos.», sin el mensaje genérico; sigue en `/registro`; conserva colegio y email y deja la contraseña vacía |
| `Retry-After: 20` | «…dentro de 1 minuto.» |
| sin `Retry-After` | «…Vuelve a intentarlo más tarde.» |
| reintento tras el aviso | el primer envío recibe el `429` y el segundo (con la contraseña escrita de nuevo) llega al backend real: `201` y redirección a `/onboarding` |

## E2E Test Results
- Spec dirigida `registration.cy.ts`: 18 passed, 0 failed (≈19 s)
- Suite completa: 4 specs (`health`, `home`, `registration`, `session`), 33 tests, 33 passed, 0 failed, 0 pending (≈30 s)
- Ninguna petición de la suite recibió un `429` real: 0 eventos `USER_REGISTER_RATE_LIMITED` en el log del backend y 0 respuestas 429 en el de Cypress.
- `npm run typecheck --workspaces` y ESLint sobre `cypress/`: sin errores

### Incidencias detectadas y resueltas (ambas, defectos del test)
1. En la 1.ª ejecución, el test de reintento esperaba el texto «…dentro de {{count}} minuto.» sin sustituir el marcador de la plantilla de `es.json`. Se sustituye por `1`.
2. En la 2.ª ejecución el mismo test seguía en `/registro`. La captura mostraba que el segundo `POST` volvía a recibir `429`: `times` es una opción del *matcher* de la ruta y no de la respuesta simulada, así que se ignoraba. Se pasa a `cy.intercept({ method, url, times: 1 }, respuesta)`, con lo que solo el primer envío recibe el `429`.

## Data Persistence and Environment
- Tras la suite completa, el esquema `public` de `calendarschool_test` tenía 17 usuarios, 17 colegios y 17 `refresh_tokens` (uno por alta) y 21 filas en `rate_limit_attempts` (un intento por cada petición de registro con JSON válido, aceptada o no).
- `public._prisma_migrations` pasó de 3 a 4: el E2E aplicó `add_rate_limit_attempts` con `prisma migrate deploy` (cambio esperado, no se revierte).
- Restauración: `TRUNCATE TABLE public.rate_limit_attempts, public.refresh_tokens, public.users, public.schools RESTART IDENTITY CASCADE`. Estado final: todas a 0, `municipalities=542`. La base de desarrollo `calendarschool` sigue idéntica a su línea base.
- Se borró `frontend/cypress/screenshots` (capturas del fallo, ignoradas por git).

## Outcome
- Step 12 status: PASS
- Blocking issues: none
