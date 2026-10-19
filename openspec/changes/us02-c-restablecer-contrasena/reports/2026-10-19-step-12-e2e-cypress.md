# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-19
- Cambio: us02-c-restablecer-contrasena
- Agente: Claude Sonnet 5.5

## Qué se añadió

- **`frontend/cypress/e2e/password-reset.cy.ts`** (5 tests). Usa el alta por la API, la tarea `createUser` para el miembro y datos únicos por test. El ayudante `generateReset` (registrar a un administrador, crear un miembro, generar su restablecimiento y borrar las cookies) y `generateResetToken` viven en `cypress/support/passwordReset.ts` y los comparten esta spec y `csp.cy.ts`:
  1. **Recorrido completo.** El administrador abre `/usuarios` (con el portapapeles simulado), pulsa «Restablecer contraseña» en la fila del miembro: `POST /api/users/{id}/password-reset` responde `201`, aparece el aviso del enlace, «Copiar» llama una vez al portapapeles simulado y la fila queda marcada «Restablecimiento pendiente». Se lee el enlace del campo, se borran las cookies y se abre sin sesión: la URL pierde el fragmento, `lookup` responde `200` y la página dice «…la cuenta m\*\*\*@example.com de {colegio}». Se define la contraseña nueva y su repetición: `confirm` responde `204`, la página navega a `/login` con «Tu contraseña se ha cambiado. Inicia sesión con la nueva.» en un `role="status"`; con la contraseña anterior el login falla (`role="alert"`) y con la nueva llega a `/onboarding`.
  2. **Revocar desde `/usuarios`.** El administrador entra de nuevo, ve la fila marcada, pulsa «Revocar restablecimiento» (`204`), la marca desaparece y el enlace da `410` con la vista no válida.
  3. **Enlace sustituido.** Generar otro enlace para el mismo usuario invalida el anterior (`410`, sin formulario) y el vigente sí abre el formulario.
  4. **Enlace sin token.** Abrir `/restablecer` sin fragmento muestra la vista no válida, sin formulario.
  5. **Contraseñas distintas.** Se muestra «Las contraseñas no coinciden.» y la página no navega.
- **`csp.cy.ts`:** un test nuevo carga `/restablecer` con el formulario (con un token válido) y con la vista no válida. Comprueba que no hay violaciones de la CSP y que la página no carga scripts, marcos ni hojas de estilo de otros orígenes (sin reCAPTCHA).
- **`scripts/e2e.mjs`:** el backend de E2E arranca también con `PASSWORD_RESET_ATTEMPTS_MAX=1000`, porque todas las peticiones de Cypress llegan desde la misma IP. El límite real se prueba en los tests de integración (`passwordReset.int.test.ts`).
- **Revisión de los E2E existentes:** no necesitaron cambios (`users.cy.ts`, `users-management.cy.ts`, `invitations.cy.ts`, `login.cy.ts` y `csp.cy.ts` pasan tal cual con las filas nuevas de `/usuarios`, el panel generalizado y el aviso de `LoginPage`).

## Comandos ejecutados

Desde la raíz del repositorio, con PostgreSQL 17 en Docker Compose; el script compila el backend y el frontend, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec "cypress/e2e/password-reset.cy.ts,cypress/e2e/csp.cy.ts"`
- `npm run test:e2e -- --spec "cypress/e2e/password-reset.cy.ts"` (tras corregir un test)
- `npm run test:e2e` (suite completa), dos veces: la primera se cortó a la mitad por mi forma de filtrar la salida y no cuenta (ver «Resultados»)
- Limpieza al terminar: `cleanE2eData` de `scripts/e2eData.mjs` sobre el esquema `public` de `calendarschool_test`.

## Resultados

- **Primera ejecución de las specs afectadas:** `csp.cy.ts` 11 de 11 y `password-reset.cy.ts` 4 de 5. Falló «enlace sustituido»: después de comprobar el enlace viejo, `cy.visit('/restablecer#<otro token>')` solo cambia el fragmento y Cypress no recarga la aplicación, así que la página no volvió a consultar y `cy.wait('@lookup')` agotó el tiempo. Es un detalle del propio test: se pasa antes por `/` para forzar la recarga, como haría un usuario que pega otro enlace.
- **Specs afectadas tras la corrección:** `password-reset.cy.ts` 5 de 5.
- **Suite completa** (1 min 37 s de Cypress, 2 min 9 s en total, salida 0): 107 pasan, 0 fallan, 0 pendientes, en 12 ficheros:

| Spec | Tests |
|---|---|
| `csp.cy.ts` | 11 |
| `health.cy.ts` | 1 |
| `home.cy.ts` | 1 |
| `invitation-acceptance.cy.ts` | 4 |
| `invitations.cy.ts` | 2 |
| `login.cy.ts` | 21 |
| `logout.cy.ts` | 6 |
| `password-reset.cy.ts` | 5 |
| `registration.cy.ts` | 33 |
| `session.cy.ts` | 13 |
| `users-management.cy.ts` | 4 |
| `users.cy.ts` | 6 |

- La primera pasada de la suite completa terminó con salida 255 sin resumen: filtré la salida de `npm` con `Select-Object -First 60`, que cierra la tubería y mata el proceso a mitad de la ejecución. Hasta donde llegó no hubo ningún fallo. La segunda, con la salida a un fichero, terminó con salida 0.
- Los puertos 3000, 3001 y 4173 quedaron libres al terminar.
- Notas: sin tests inestables ni reintentos. Los E2E comprueban la persistencia por el comportamiento observable (el enlace usado o sustituido deja de servir, la contraseña nueva inicia sesión y la anterior no); el estado exacto de las filas lo comprueban los tests de integración.

## Base de datos de test

- Antes de la ejecución, `calendarschool_test.public` estaba vacío y con 7 migraciones (la línea base del paso 10).
- Tras la suite completa quedaban datos del E2E (los vacía el script al empezar, nunca al terminar): 76 usuarios, 63 colegios, 79 sesiones, 85 intentos y 13 enlaces de acceso (7 invitaciones y 6 restablecimientos).
- Restauración: `cleanE2eData` los vació. Ahora `public` tiene `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `access_links` a 0, `municipalities` a 542 y 7 migraciones.
- `calendarschool` y los esquemas `test_1` a `test_4` son idénticos a la línea base (comparados con `diff`). La única diferencia es la fila residual de `rate_limit_attempts` que los workers de los tests de integración dejan en un esquema `test_<n>`, y que `resetDatabase()` vacía antes del siguiente test.

## Resultado

- Estado del paso 12: PASA
- Problemas bloqueantes: ninguno
