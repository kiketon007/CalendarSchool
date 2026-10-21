# Informe del paso 6 - Tests E2E con Cypress

- Fecha: 2026-10-21
- Cambio: us11-buscar-profesores
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts` (compila, migra la base de test, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless), dos veces.
- `npm run test:e2e` completo.
- Antes de cada ejecución, el propio script vacía la base de test (`scripts/e2eData.mjs`); no se hace al terminar.

## Specs

`professors.cy.ts` pasa de 14 a 17 tests, con el bloque «search of the list»:

1. Con «García-López, José María», «García, Ana» y «Pérez, Luis»: «garcia jose» deja una fila y la línea del total es un `role="status"` con «Mostrando 1 de 3 profesores»; «perez luis» (otro orden) encuentra a «Pérez, Luis»; «zzz» no deja filas y dice «No hay profesores que coincidan con «zzz»»; «Limpiar búsqueda» devuelve las 3 filas, vacía el campo y le da el foco, y la línea del total vuelve a «3 profesores» sin `role`.
2. Con 25 «Martín» y 5 «Zapata»: desde la página 2 de 2 (10 filas), escribir «martin» vuelve a «Página 1 de 2» con 20 filas y «Mostrando 25 de 30 profesores»; «zapata» deja 5 filas y quita la paginación.
3. A 360 px: la búsqueda deja una tarjeta, sin resultados deja «Limpiar búsqueda» visible, y en ambos casos no hay desplazamiento horizontal.

## Resultados

- `professors.cy.ts`: **17 pasan**, 0 fallan. La primera ejecución dio 16 de 17: el fallo era del propio test (un `.should('not.have.attr', 'role').and('have.text', …)` encadenado, porque la primera aserción cambia el sujeto a `undefined`); se separó en dos aserciones y pasó a la segunda ejecución. Además, `eslint` (`cypress/unsafe-to-chain-command`) obligó a separar `clear()` de `type()`.
- Suite completa: **15 specs, 157 tests, todos correctos** (antes: 154), 2 min 39 s. Sin reintentos ni tests inestables.
- `typecheck` (incluido `cypress/tsconfig.json`) y `lint` limpios.
- Al terminar, los puertos 3001 y 4173 quedan libres.

## Verificación de la base de datos de test

- El E2E deja sus datos en `calendarschool_test.public` (113 colegios, 131 usuarios, 36 cursos, 66 clases y 98 profesores, entre otros).
- Restaurada con `cleanE2eData`. Comparada con la línea base del paso 4 (`diff`): **idéntica** en la base de desarrollo y en todos los esquemas de la base de test. No ha aparecido ningún fichero fuera de los del cambio.

## Resultado

- Estado del paso 6: PASA
- Problemas bloqueantes: ninguno
