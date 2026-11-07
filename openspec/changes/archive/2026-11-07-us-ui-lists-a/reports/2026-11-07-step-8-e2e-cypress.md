# Paso 8: E2E con Cypress (2026-11-07)

Cambio: `us-ui-lists-a`. Agente: Claude Sonnet 5.5.

## Cambios en las specs

- `calendars.cy.ts`: `article h2` pasa a `article h3` y desaparece el prefijo «Cursos: » de las comprobaciones. Dos tests nuevos: la región «Tus calendarios» con el contador y «Jornada lectiva» y «Cursos asignados» en la tarjeta, y la página sin desplazamiento horizontal a 360 y a 1280 px.
- `courses.cy.ts`: `main li h2` y el nombre del curso recién creado pasan a `h3`. Test nuevo: a 1280 px, con la barra lateral, un curso de nombre largo y dos clases, la tabla y la página no se desplazan y la región «Todos los cursos» muestra «1 curso».

## Ejecución

- Specs cambiadas: `courses.cy.ts` (37 tests) y `calendars.cy.ts` (27 tests), 64 de 64.
- Suite completa (`npm run test:e2e`, una sola tanda): 378 tests, 378 pasan, 0 fallos, código de salida 0.
- Puertos 4173, 3000 y 3001 libres al terminar.

## Base de datos

La línea base del paso 6 llevaba los restos de ejecuciones E2E anteriores en `public` de `calendarschool_test` (la limpieza del E2E se hace al empezar, no al terminar). Tras la ejecución se vaciaron `public` y los esquemas `test_*` (se conservan `_prisma_migrations` y `municipalities`); `calendarschool` no cambió. Este cambio no añade migraciones.

## Resultado

- Estado del paso 8: **PASS**
