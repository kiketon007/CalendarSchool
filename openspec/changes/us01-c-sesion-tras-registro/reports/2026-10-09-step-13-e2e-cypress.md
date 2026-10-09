# Step 13 Report - E2E Testing with Cypress

- Date: 2026-10-09
- Change: us01-c-sesion-tras-registro
- Agent: Claude (Sonnet 5.5)
- Entorno: `npm run test:e2e` (compila ambos workspaces, migra el esquema `public` de `calendarschool_test`, lo vacía, arranca el backend compilado en :3001 con `JWT_SECRET` y `APP_ORIGIN=http://localhost:4173`, y `vite preview` en :4173) con Cypress 16.1.1 en modo headless sobre Electron/Chrome 146.

## Specs
- `cypress/e2e/session.cy.ts` (nueva, 13 tests): sesión tras el registro.
- `cypress/e2e/registration.cy.ts` (ajustada): el alta correcta espera `/onboarding` en lugar del mensaje de confirmación de US01_b.
- `scripts/e2e.mjs`: pasa a Cypress los argumentos que recibe, para poder ejecutar una sola spec (`npm run test:e2e -- --spec cypress/e2e/session.cy.ts`).

## Commands Executed
- `npm run test:e2e -- --spec cypress/e2e/session.cy.ts` (spec dirigida; 1.ª ejecución: 12 de 13, ver incidencia)
- `npm run test:e2e -- --spec cypress/e2e/session.cy.ts` (2.ª ejecución: 13 de 13)
- `npm run test:e2e` (suite completa)

## Escenarios cubiertos (session.cy.ts)
| Bloque | Escenario |
|---|---|
| Flujo de registro | Registro por el formulario → `/onboarding` con el nombre y el colegio, sin formulario |
| | La cookie `refresh_token` existe como `httpOnly`, `secure`, `sameSite=lax`, `path=/api/auth` y caduca en ~24 h; `document.cookie` no la contiene |
| | `localStorage` y `sessionStorage` quedan vacíos |
| Recuperación | Recargar `/onboarding`: `refresh` responde `200` y se mantiene la sesión |
| | `/onboarding` sin sesión: `refresh` `401` y redirección a `/registro`, sin ninguna alerta |
| | La página de inicio sin sesión no muestra ningún error |
| Sesión no iniciada | `refresh` devuelve `401` tras el alta (`cy.intercept`): aviso de cookies con `role="alert"`, sin redirección ni formulario |
| | Fallo de red en `refresh` (`forceNetworkError`): aviso distinto de «cuenta creada, sesión no iniciada», sin el de cookies |
| Seguridad de la API | `refresh` con la cookie del alta y `Origin` permitido: `200`, `no-store`, `expiresIn=900`, `role=ADMIN` |
| | `Origin` ajeno o ausente: `403 ORIGIN_NOT_ALLOWED`, sin cabeceras CORS |
| | Cookie inventada o ausente: `401 INVALID_SESSION` y cookie borrada (`Max-Age=0`) |
| | Cookie fijada por el cliente al registrar: se ignora y no sirve para `refresh` |
| | Registro rechazado (`409`): sin `Set-Cookie` |

## E2E Test Results
- Spec dirigida `session.cy.ts`: 13 passed, 0 failed (≈11 s)
- Suite completa: 4 specs (`health`, `home`, `registration`, `session`), 29 tests, 29 passed, 0 failed, 0 pending (≈24 s)
- `npm run typecheck --workspaces` y ESLint sobre `cypress/`: sin errores

### Incidencia detectada y resuelta
En la 1.ª ejecución falló «keeps the session after reloading the onboarding page» (esperaba `200` y llegaba `401`). Era un defecto del test, no de la aplicación: el alias `@refresh` ya acumulaba las renovaciones del registro (la de arranque, con `401`) y `cy.wait` devuelve la primera sin consumir. Se define un alias nuevo justo antes de `cy.reload()`.

## Data Persistence and Environment
- Tras la suite completa, el esquema `public` de `calendarschool_test` tenía 16 usuarios, 16 colegios y 16 `refresh_tokens` (uno por alta, todos con `token_hash` de 64 caracteres y vigentes), sin que ningún `refresh_token` apareciese en claro.
- `public._prisma_migrations` pasó de 2 a 3: el E2E aplicó `add_refresh_tokens` con `prisma migrate deploy` (cambio esperado, no se revierte).
- Restauración: `TRUNCATE TABLE public.refresh_tokens, public.users, public.schools RESTART IDENTITY CASCADE`. Estado final: `users=0`, `schools=0`, `refresh_tokens=0`, `municipalities=542` en `public` y en `test_1`–`test_4`. La base de desarrollo `calendarschool` sigue idéntica a su línea base.

## Outcome
- Step 13 status: PASS
- Blocking issues: none
- Observación (ver informe de cierre): cada visita anónima registra `SESSION_REFRESH_FAILED` con `reason=MISSING` a nivel `warn`.
