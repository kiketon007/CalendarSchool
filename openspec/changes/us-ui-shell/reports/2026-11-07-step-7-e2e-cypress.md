# Paso 7: E2E con Cypress (2026-11-07)

Cambio: `us-ui-shell`.

## Specs nuevas y adaptadas (7.1 y 7.2)

- **Apoyo nuevo** `frontend/cypress/support/shell.ts`: `openUserMenu()`, `logOutFromMenu()` y `openNavigationPanel()`.
- **Adaptadas:**
  - `logout.cy.ts`, `users.cy.ts` y `csp.cy.ts` abren el menú de usuario antes de «Cerrar sesión». En `logout.cy.ts`, el colegio se comprueba con el menú abierto.
  - `onboarding.cy.ts` busca la marca en la barra lateral. «Inicio» lleva `aria-current` y la marca no.
  - `constraints.cy.ts` (360 px) abre el panel antes de pulsar «Reglas».
- **`shell.cy.ts` (11 tests):**
  - 1280 px: la barra siempre visible, sin botón «Abrir menú», los 8 enlaces de «Espacio de trabajo» en orden y «Usuarios» en «Administración» para un administrador; un miembro no ve el grupo; un solo `aria-current` en una subruta; la barra se queda arriba al desplazar; sin desplazamiento horizontal en `/cursos`.
  - 360 px: la barra oculta; el panel con el foco dentro y el nombre «Menú»; Escape lo cierra y el foco vuelve a «Abrir menú»; elegir un enlace navega y cierra el panel; sin desplazamiento horizontal con el panel cerrado y abierto.
  - Menú de usuario: nombre, rol y colegio, y Escape devuelve el foco; «Miembro» para un miembro.
  - «Saltar al contenido» con teclas reales (`cy.press` de Tab y Intro): se ve con el foco, lo mueve a `#contenido` y la dirección no cambia.

## Ejecución (7.3)

- Spec nueva sola: 11 de 11.
- Primera suite completa: 374 de 375. Falló `constraints.cy.ts` a 360 px, porque la barra lateral está dentro del panel cerrado y había que abrirlo antes de pulsar el enlace. Se corrigió la spec (no el código) y pasó, 6 de 6.
- **Suite completa final** (`npm run test:e2e`, headless, una sola tanda): **375 tests en 32 specs, 375 correctos**, código de salida 0, 8 min 30 s. Incluye `csp.cy.ts` (sin violaciones de la CSP con el menú de usuario y el panel) y `theme.cy.ts`.
- Los puertos 4173, 3000 y 3001 quedan libres.

## Notas

- Durante el arranque aparece un `AggregateError [ECONNREFUSED]` del sondeo de espera hasta que el backend responde; no afecta al resultado.
- `type('{enter}')` de Cypress no activa un enlace: la prueba del enlace de salto usa `cy.press`, que envía teclas reales del navegador.
- Ningún test falló tres veces seguidas.
