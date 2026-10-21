# Informe del paso 7 - Tests E2E con Cypress

- Fecha: 2026-10-21
- Cambio: us10-listado-profesores
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts` (compila, migra la base de test, arranca el backend en :3001 y `vite preview` en :4173 y ejecuta Cypress en modo headless).
- `npm run test:e2e` completo.
- Antes de cada ejecución, el propio script vacía la base de test (`scripts/e2eData.mjs`); no se hace al terminar.

## Specs

`professors.cy.ts` pasa de 11 a 14 tests, con el bloque «pagination of the list»:

1. Con 25 profesores creados por la API (el 07 tutor de la clase A de «1º Primaria» y uno de apellido larguísimo): «25 profesores», 20 filas, «Tutor de 1º Primaria A» y «Sin tutoría» en las filas, la `nav` «Paginación de profesores», «Página 1 de 2» y «Anterior» deshabilitado; «Siguiente» muestra 5 filas, «Página 2 de 2», «Siguiente» deshabilitado y el foco en «Anterior»; «Anterior» vuelve a la primera página con el foco en «Siguiente».
2. A 360 px: 20 tarjetas con la paginación, sin desplazamiento horizontal; en la segunda página, la tarjeta con el apellido de 90 caracteres es visible y tampoco hay desplazamiento horizontal.
3. Con un solo profesor: «1 profesor» y ninguna paginación.

Los pasos del paso 4.2 (textos «Tutor de 1º Primaria A» y «Sin tutoría») se ejecutan en los tests de US09 y US09_b ya existentes.

## Resultados

- `professors.cy.ts`: 14 pasan, 0 fallan, a la primera.
- Suite completa: **15 specs, 154 tests, todos correctos** (antes: 151), 2 min 30 s. `session.cy.ts` pasó (ya tiene el margen ampliado de la PR #79). Sin reintentos ni tests inestables.
- Al terminar, los puertos 3001 y 4173 quedan libres.

## Verificación de la base de datos de test

- El E2E deja sus datos en `calendarschool_test.public` (la base solo se vacía al empezar): 110 colegios, 128 usuarios, 36 cursos, 66 clases y 63 profesores, entre otros.
- Restaurada con `cleanE2eData` (el mismo vaciado del script). Comparada con la línea base del paso 5 (`diff`): **idéntica** en la base de desarrollo y en todos los esquemas de la base de test. No ha aparecido ningún fichero fuera de los del cambio.

## Observaciones

- El tercer test confirma que la paginación no aparece con 20 o menos; el límite exacto de 20 lo cubre el test de componente.
- La comprobación del foco (`have.focus`) en un navegador real cubre lo que jsdom no distingue: que un botón deshabilitado no retiene el foco.

## Resultado

- Estado del paso 7: PASA
- Problemas bloqueantes: ninguno
