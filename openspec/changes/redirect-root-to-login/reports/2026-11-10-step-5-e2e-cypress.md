# Paso 5 - E2E con Cypress

- Fecha: 2026-11-10
- Cambio: redirect-root-to-login
- Agente: Claude

## Cambios en las specs

- `home.cy.ts` se sustituye por **`rootRedirect.cy.ts`** (renombrada con `git mv`), con tres casos:
  - `/` sin sesión lleva a `/login`: la dirección pasa a `/login`, `login-page` es visible, el `h1` no está vacío, no hay ningún `role="alert"` y la consola no registra errores (`cy.spy(win.console, 'error')`).
  - `/` con sesión (alta directa por la API, que deja la cookie de renovación en el navegador) acaba en `/onboarding`, con el nombre del colegio.
  - `/` no queda en el historial: se visita `/privacidad`, luego `/` (que redirige a `/login`) y `cy.go('back')` vuelve a `/privacidad`, no a `/` ni a un bucle.
- `session.cy.ts`: el caso «does not show any error on the home page when there is no session» pasa a «leads the root to the login without any error when there is no session»: espera el `401` de la renovación, comprueba la dirección `/login`, `login-page` visible y ningún aviso.
- `password-reset.cy.ts` no se toca: visita `/` solo como «otra página» antes de abrir `/restablecer#token`, y sigue valiendo porque la raíz lleva a `/login`, que también es otra página. Pasa.

## Comando

- `npm run test:e2e` (compila, migra la base de test, arranca el backend en `:3001` y `vite preview` en `:4173` y ejecuta Cypress en modo headless), una sola pasada con las 32 specs.

## Resultado

- **32 specs, 393 tests, 393 correctos, 0 fallos**, en 8 min 59 s. Código de salida 0.
- `rootRedirect.cy.ts`: 3 de 3. `session.cy.ts`: 13 de 13. `password-reset.cy.ts`: 5 de 5.

## Entorno

- Los datos de las pruebas se limpian al empezar cada ejecución (`scripts/e2eData.mjs`), nunca al terminar, como en el resto del proyecto.
- Al terminar, ningún servidor queda escuchando (3001 y 4173, comprobado con `Get-NetTCPConnection -State Listen`).

## Resultado

- Paso 5: **PASA**. Incidencias bloqueantes: ninguna.
