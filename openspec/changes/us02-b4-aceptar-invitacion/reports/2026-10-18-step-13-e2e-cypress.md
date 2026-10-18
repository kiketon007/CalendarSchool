# Informe del paso 13 - E2E con Cypress

- Fecha: 2026-10-18
- Cambio: us02-b4-aceptar-invitacion
- Agente: Claude Sonnet 5.5

## Qué se añadió

- **`frontend/cypress/e2e/invitation-acceptance.cy.ts`** (4 tests). Usa el alta por la API y datos únicos por test; el ayudante `generateInvitation` (registrar a un administrador, generar la invitación y borrar las cookies) vive en `cypress/support/invitations.ts` y lo comparten esta spec y `csp.cy.ts`:
  1. **Recorrido completo.** Se abre el enlace de una invitación de miembro: la URL pierde el fragmento (`location.hash` queda vacío), `POST /api/invitations/lookup` responde `200` y la página dice «Te han invitado a {colegio} como Miembro.». Se rellenan los campos y la casilla de la política y se envía: `POST /api/invitations/accept` responde `201` y la página navega a `/login`, donde se ve «Tu cuenta se ha creado. Inicia sesión para entrar.» en un `role="status"` y el email ya escrito. Al iniciar sesión con la contraseña llega a `/onboarding`, con la cabecera y sin el enlace «Usuarios» (es un miembro).
  2. **Enlace revocado.** El administrador revoca la invitación por la API (`204`); al abrir el enlace, `lookup` responde `410` y la página muestra la vista de enlace no válido, sin formulario.
  3. **Enlace sin token.** Abrir `/invitacion` sin fragmento muestra la vista de enlace no válido, sin formulario.
  4. **Email ya registrado.** Se envía el formulario con el email del administrador: `accept` responde `409`, el error sale en un `role="alert"` bajo el campo, la página sigue en `/invitacion` y los demás campos conservan su valor.
- **`csp.cy.ts`:** un test nuevo carga `/invitacion` con el formulario (con un token válido) y con la vista de enlace no válido. Comprueba que no hay violaciones de la CSP y que la página no carga scripts, marcos ni hojas de estilo de otros orígenes (sin reCAPTCHA).
- **`scripts/e2e.mjs`:** el backend de E2E arranca también con `INVITATION_ATTEMPTS_MAX=1000`, porque todas las peticiones de Cypress llegan desde la misma IP. El límite real se prueba en los tests de integración (`invitationAcceptance.int.test.ts`).
- **Revisión de los E2E existentes (tarea 10.2):** `login.cy.ts`, `registration.cy.ts`, `session.cy.ts` y `logout.cy.ts` abren `/login` o `/registro` directamente, sin estado de navegación, así que el aviso nuevo de `LoginPage` no aparece y no necesitan cambios.

## Comandos ejecutados

Desde la raíz del repositorio, con PostgreSQL 17 en Docker Compose; el script compila el backend y el frontend, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec "cypress/e2e/invitation-acceptance.cy.ts,cypress/e2e/csp.cy.ts,cypress/e2e/login.cy.ts,cypress/e2e/invitations.cy.ts"`
- `npm run test:e2e -- --spec "cypress/e2e/invitation-acceptance.cy.ts,cypress/e2e/csp.cy.ts"`
- `npm run test:e2e` (suite completa)
- Limpieza al terminar: `cleanE2eData` de `scripts/e2eData.mjs` sobre el esquema `public` de `calendarschool_test`.

## Resultados

- **Primera ejecución de las specs afectadas:** `login.cy.ts` 21 de 21 e `invitations.cy.ts` 2 de 2, pero fallaron 3 tests de `invitation-acceptance.cy.ts` y 1 de `csp.cy.ts` con «`cy.then()` failed because you are mixing up async and sync code». La causa era el ayudante `generateInvitation`: llamaba a `cy.clearCookies()` dentro de un `then` y devolvía un valor síncrono. Se corrigió encadenando `cy.clearCookies().then(() => ({ … }))`.
- **Specs afectadas tras la corrección** (7 s de Cypress): `invitation-acceptance.cy.ts` 4 de 4 y `csp.cy.ts` 10 de 10; 14 pasan, 0 fallan.
- **Suite completa** (1 min 27 s de Cypress, 1 min 57 s en total, salida 0): 101 pasan, 0 fallan, 0 pendientes, en 11 ficheros:

| Spec | Tests |
|---|---|
| `csp.cy.ts` | 10 |
| `health.cy.ts` | 1 |
| `home.cy.ts` | 1 |
| `invitation-acceptance.cy.ts` | 4 |
| `invitations.cy.ts` | 2 |
| `login.cy.ts` | 21 |
| `logout.cy.ts` | 6 |
| `registration.cy.ts` | 33 |
| `session.cy.ts` | 13 |
| `users-management.cy.ts` | 4 |
| `users.cy.ts` | 6 |

- Los puertos 3001 y 4173 quedaron libres al terminar.
- Notas: sin tests inestables ni reintentos. Los E2E comprueban la persistencia por el comportamiento observable (la invitación usada deja de servir, el usuario creado inicia sesión); el estado exacto de las filas lo comprueban los tests de integración.

## Base de datos de test

- Antes de la ejecución, el esquema `public` de `calendarschool_test` estaba vacío y con 7 migraciones.
- Tras la suite completa quedaban datos del E2E (los vacía el script al empezar, nunca al terminar): 66 usuarios, 58 colegios, 72 sesiones, 77 intentos y 7 enlaces de acceso (6 sin usar y 1 usado, por el recorrido de aceptación).
- Restauración: `cleanE2eData` los vació. Ahora `public` tiene `schools`, `rate_limit_attempts` y `access_links` a 0, `municipalities` a 542 y 7 migraciones.
- `calendarschool` y los esquemas `test_1` a `test_4` son idénticos a la línea base (comparados con `diff` junto con `public`).

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
