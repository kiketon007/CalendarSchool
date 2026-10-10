# Step 7 Report - E2E con Cypress

- Date: 2026-10-10
- Change: us01-f-resiliencia-formulario
- Agent: Claude (Sonnet 5.5)

## Comandos
- `npm run test:e2e -- --spec cypress/e2e/registration.cy.ts` (headless): 29 pasan
- `npm run test:e2e` (suite completa, headless): 4 specs, 44 tests, 44 pasan, 0 fallan

## Escenarios añadidos (`registration.cy.ts`, grupo `form draft`)
1. **Recarga conserva lo escrito salvo la contraseña:** se rellenan los seis campos, se recarga; los cinco campos conservan su valor (el municipio con su nombre «València»), la contraseña está vacía, no hay campos inválidos y el borrador de `sessionStorage` no contiene la contraseña.
2. **Formulario vacío tras un registro correcto:** tras llegar a `/onboarding`, `cy.visit('/registro')` muestra nombre del colegio, email y municipio vacíos.
3. **El borrador se conserva ante un rechazo del servidor:** con un email ya registrado (`409`), al recargar se conserva el email y la contraseña está vacía.
4. **Un único envío:** con la respuesta del registro retrasada 500 ms, dos `requestSubmit()` seguidos producen una sola petición (`@slowRegister.all` tiene longitud 1) y se llega a `/onboarding`.

## Base de datos
- Línea base: la del informe del paso 5 (todas las tablas de datos a 0 y `municipalities`=542 en desarrollo, `public` y `test_1`-`test_4`).
- Tras el E2E: el esquema `public` de `calendarschool_test` conservó los datos de la ejecución (el E2E solo limpia al empezar, por diseño).
- Restauración: se vaciaron `rate_limit_attempts`, `refresh_tokens`, `users` y `schools` de `public`; el recuento coincide con la línea base (`diff` sin diferencias).

## Outcome
- Step 7 status: PASS
- Blocking issues: none
