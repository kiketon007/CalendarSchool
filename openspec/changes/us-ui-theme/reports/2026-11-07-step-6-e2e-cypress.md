# Paso 6: E2E con Cypress (2026-11-07)

Cambio: `us-ui-theme`.

## Spec nueva (6.1)

`frontend/cypress/e2e/theme.cy.ts`, en `/login` (pública, sin datos), con los colores calculados por el navegador:

- fondo del `body` `rgb(247, 248, 252)` y texto `rgb(23, 35, 59)`;
- botón de enviar con fondo `rgb(91, 91, 214)` y texto blanco;
- borde de los campos `rgb(134, 142, 159)` (`#868e9f`);
- a 360 px, sin desplazamiento horizontal.

## Ejecución (6.2)

- Spec sola (`npm run test:e2e -- --spec cypress/e2e/theme.cy.ts`): 4 de 4.
- Suite completa (`npm run test:e2e`, headless, en una sola tanda): **364 tests en todas las specs, 364 correctos**, código de salida 0, 8 min 1 s. Incluye `csp.cy.ts`, que sigue sin violaciones de la CSP con el nuevo CSS.
- Los puertos 4173, 3000 y 3001 quedan libres.

## Notas

- Durante el arranque aparece un `AggregateError [ECONNREFUSED]` del sondeo de espera (`wait-on`) hasta que el backend responde; no afecta al resultado.
- Ningún test falló.
