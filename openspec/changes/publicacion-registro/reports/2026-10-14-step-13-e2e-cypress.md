# Informe del paso 13 - E2E con Cypress

- Fecha: 2026-10-14
- Cambio: publicacion-registro
- Agente: Claude Sonnet 5.5

## Cambios en los E2E (13.1)

- **`registration.cy.ts` y `session.cy.ts`:** el `fillForm` de cada spec marca la casilla `#registration-privacyPolicyAccepted`, y los 4 cuerpos de alta directa por la API llevan `privacyPolicyAccepted: true` (1 en `registration.cy.ts`; 3 en `session.cy.ts`, entre ellos el de la cookie fijada por el cliente y el del `409`).
- **`registration.cy.ts`, test del formulario vacío:** esperaba 6 alertas. Con la casilla son 7, así que ahora comprueba además el error `privacyPolicyAccepted.REQUIRED` y la cuenta de 7. Se detectó al leer la spec, no por una ejecución.
- **Bloque nuevo `privacy policy consent` (4 escenarios):**
  1. Sin marcar la casilla: aparece el error, la casilla queda con `aria-invalid` y el foco, la URL sigue en `/registro` y `@register.all` tiene longitud 0 (ninguna petición a `/api/auth/register`).
  2. El error desaparece al marcar la casilla.
  3. El enlace del formulario apunta a `/privacidad` con `target="_blank"` y `rel="noopener noreferrer"`.
  4. `/privacidad` se pinta sin sesión, con su título, la fecha en `<time>` y todas las secciones del texto de `es.json`; el enlace «Volver al registro» lleva a `/registro`.
- **`csp.cy.ts`** (tarea 8.5, 5 tests) y **`frontend/cypress.config.ts`** con `experimentalCspAllowList` (tarea 8.4): ver el informe del paso 8.

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/registration.cy.ts`
- `npm run test:e2e -- --spec cypress/e2e/session.cy.ts`
- `npm run test:e2e` (suite completa)
- `node --env-file=backend/.env -e "…cleanE2eData(process.env.TEST_DATABASE_URL)…"` para restaurar la base de test
- Recuentos de filas con `psql` antes y después (la misma consulta que en el paso 11)

El script `npm run test:e2e` compila backend y frontend, migra la base de test, la vacía, arranca el backend en el `:3001` y `vite preview` en el `:4173` con la CSP, ejecuta Cypress y cierra los procesos.

## Resultados (13.2)

| Spec | Tests | Resultado |
|---|---|---|
| `csp.cy.ts` | 5 | 5 pasan |
| `health.cy.ts` | 1 | 1 pasa |
| `home.cy.ts` | 1 | 1 pasa |
| `registration.cy.ts` | 33 | 33 pasan (36 s) |
| `session.cy.ts` | 13 | 13 pasan (12 s) |
| **Total** | **53** | **53 pasan, 0 fallan, 0 pendientes** (49 s) |

- Las dos specs afectadas se ejecutaron primero por separado (33/33 y 13/13) y después la suite completa (53/53), siempre con salida 0 y sin reintentos.
- Antes de la 13.1, con la casilla sin marcar, la suite de la tarea 8.5 dio 10 pasan y 19 fallan, todos en `registration.cy.ts` y `session.cy.ts` y todos por el envío bloqueado por el consentimiento (p. ej. `cy.wait('@failingRegister')` sin ninguna petición).
- Los tests que reescriben solo la contraseña tras un rechazo del servidor (límite de intentos y captcha) pasan sin cambios, porque la casilla se conserva.
- Puertos 3001 y 4173 libres tras cada ejecución. Sin capturas ni vídeos residuales en `git status`.

## Verificación de la base de datos (13.3)

Se compararon los recuentos con la línea base de la tarea 11.1 (`users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `municipalities`, por esquema).

- **`calendarschool_test`, `public`:** tras el E2E había 23 colegios, 23 usuarios, 23 refresh tokens y 33 intentos. Se restauró con `cleanE2eData` de `scripts/e2eData.mjs`, la misma función que usa el E2E (`TRUNCATE … RESTART IDENTITY CASCADE` de todo salvo `_prisma_migrations` y `municipalities`). Después, `municipalities` 542 y el resto 0.
- **Diferencia respecto a la línea base:** solo `rate_limit_attempts` en `public`, **8 → 0**. Esas 8 filas eran restos del E2E de la tarea 8.5, que la limpieza elimina por diseño.
- **`calendarschool_test`, `test_1` a `test_4`:** sin cambios.
- **`calendarschool` (desarrollo):** sin cambios respecto al paso 12 (`rate_limit_attempts` 0 frente a 4 en la línea base, por la poda del limitador explicada en el informe del paso 12).
- Estado restaurado: sí.

## Límites

- Los E2E usan el cliente de captcha falso (no hay claves de sitio en el build del E2E): no ejercen Google. La integración real se validó en la tarea 8.6.
- La cabecera CSP del E2E la sirve `vite preview`, no CloudFront. La de CloudFront se comprueba en el grupo 14.
- `frame-ancestors` lo elimina siempre Cypress, así que solo se comprueba leyendo la cabecera (`cy.request`).
- Cypress muestra un aviso de Node sobre `vite.config.ts` (la importación del JSON sin atributos y el import sin extensión). No rompe nada y no se ha tratado.

## Resultado

- Estado del paso 13: **PASS**
- Incidencias bloqueantes: ninguna.
