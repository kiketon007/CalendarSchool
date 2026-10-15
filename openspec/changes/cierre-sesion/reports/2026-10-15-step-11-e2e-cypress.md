# Informe del paso 11 - E2E con Cypress

- Fecha: 2026-10-15
- Cambio: cierre-sesion
- Agente: Claude Sonnet 5.5

## Specs escritas o ampliadas

- **`frontend/cypress/e2e/logout.cy.ts` (nueva, 6 tests).** El alta se hace por la API (`cy.request`, que deja la cookie de sesión en el navegador) y el cierre de sesión, desde la interfaz:
  1. **Cabecera y cierre de sesión:** con sesión, `/onboarding` muestra la cabecera (`data-testid="app-header"`) con el nombre del usuario y el del colegio; al pulsar «Cerrar sesión» el backend responde `204`, se llega a `/login`, la cabecera desaparece, no hay diálogo de confirmación y la cookie `refresh_token` ya no existe en el navegador.
  2. **La sesión no vuelve:** tras recargar, `refresh` responde `401` y se sigue en `/login`; volver a abrir `/onboarding` redirige a `/login` y no pinta la página.
  3. **Revocación en el servidor:** el refresh token de la sesión cerrada, guardado antes del cierre, responde `200` antes y `401 INVALID_SESSION` después (con `cy.request` y el `Origin` de la aplicación).
  4. **Otros navegadores:** con dos sesiones del mismo usuario (la del alta y la de un login), cerrar la del navegador deja la otra renovando con `200`.
  5. **Fallo al cerrar:** con el `logout` simulado con `503` (una sola vez, con `cy.intercept` y `times: 1`) la página sigue en `/onboarding` con la sesión iniciada, la cookie se conserva, se muestra el aviso «No se ha podido cerrar la sesión. Inténtalo de nuevo» con `role="alert"`, y al reintentar se cierra con `204` y desaparece el aviso.
  6. **Sin sesión:** un visitante sin cookies que abre `/login` no ve la cabecera.
- **`frontend/cypress/e2e/csp.cy.ts` (ampliada).** El test del login completo pasa a ser «login y logout, del formulario a Onboarding y de vuelta, sin violar la política»: comprueba además que la cabecera se muestra y se cierra la sesión desde ella, y que el navegador no registra ninguna violación de CSP en todo el recorrido.
- Los tests de `session.cy.ts`, `registration.cy.ts` y `login.cy.ts` no necesitaron cambios: buscan dentro de `[data-testid="onboarding-page"]` o de sus propios formularios, así que la cabecera nueva no los altera.

## Comandos ejecutados

Desde la raíz del repositorio, con PostgreSQL 17 en Docker Compose (sano). El script `scripts/e2e.mjs` compila, migra `calendarschool_test`, vacía los datos de la ejecución anterior, arranca el backend (`:3001`, `LOGIN_ATTEMPTS_MAX=1000`, verificador de captcha falso) y `vite preview` (`:4173`) y ejecuta Cypress en modo headless (Electron 41, Chrome 146):

- `npm run test:e2e -- --spec cypress/e2e/logout.cy.ts,cypress/e2e/csp.cy.ts`
- `npm run test:e2e` (suite completa)
- `npm run typecheck -w frontend` y `npx eslint frontend/cypress`, previos, sin errores.

## Resultados

- **Specs afectadas** (34 s en total, con la compilación): `logout.cy.ts` 6 de 6 y `csp.cy.ts` 9 de 9; 15 de 15.
- **Suite completa** (99 s): **84 de 84**, 0 fallos, 0 pendientes.

| Spec | Tests | Pasan |
|---|---|---|
| `csp.cy.ts` | 9 | 9 |
| `health.cy.ts` | 1 | 1 |
| `home.cy.ts` | 1 | 1 |
| `login.cy.ts` | 21 | 21 |
| `logout.cy.ts` | 6 | 6 |
| `registration.cy.ts` | 33 | 33 |
| `session.cy.ts` | 13 | 13 |

- El log del backend del E2E muestra el `SESSION_REFRESH_FAILED` con `reason: REVOKED` del test de la recarga tras cerrar sesión, como se espera, y ningún error inesperado.
- Ningún test inestable ni reintentado.

## Persistencia y estado de la base de datos

- Estado tras la suite completa, en `public` de `calendarschool_test`: 42 usuarios, 42 colegios, 52 refresh tokens (6 revocados, los de los cierres de sesión), 60 intentos del limitador y 542 municipios. Los datos quedan hasta la siguiente ejecución, por diseño (`cleanE2eData` vacía al empezar y nunca al terminar).
- Persistencia comprobada por la propia spec: los 6 refresh tokens revocados corresponden a los cierres de sesión de `logout.cy.ts`, y los tests 3 y 4 lo verifican por la API.
- Restauración: `TRUNCATE` de `refresh_tokens`, `users`, `schools` y `rate_limit_attempts` en `public` de `calendarschool_test`, el mismo criterio que `cleanE2eData`. Se hizo tras la suite completa.
- Comparación con `diff` del recuento de las cinco tablas en todos los esquemas de las dos bases: idéntica a la captura posterior al paso 9 (`calendarschool`: `municipalities` 542 y el resto a 0; `calendarschool_test`, `public` y `test_1` a `test_4`: ídem). La base de desarrollo `calendarschool` no la toca el E2E.
- No quedan procesos: el script de E2E para el backend (`:3001`) y `vite preview` (`:4173`) al terminar.

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
