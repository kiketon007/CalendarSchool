# Paso 7: E2E con Cypress (2026-11-08)

Cambio: `us-ui-lists-c`. Comando: `npm run test:e2e` (compila, migra, arranca backend :3001 y `vite preview` :4173).

## 7.1 Specs cambiadas

- `subjects.cy.ts`: `article h2` → `article h3`; la región «Catálogo de asignaturas» con su contador y los filtros dentro; la línea «Mostrando N de M asignaturas» solo con filtros; «Limpiar filtros» (quita los filtros y enfoca la búsqueda); y una asignatura de nombre, código y descripción largos con sus dos acciones, sin desplazamiento horizontal a 360 y 1280 px.
- `constraints.cy.ts`: total en `.cs-list-count`, línea de resultados `constraints-count` solo con filtros, filas nombradas por el bloque; a 1280 px, la región «Reglas del colegio» y la tabla dentro de su bloque, sin desplazamiento propio, con una regla de nombre largo y código, avisos y enlace; a 360 px, filas con `h3` y sin desplazamiento horizontal.
- `courses.cy.ts` y `workload.cy.ts`: `article h2` → `article h3` en la búsqueda de una asignatura.

## 7.2 Resultados

- Specs cambiadas (`subjects`, `constraints`): 36 de 36 en verde (constraints, 8 de 8 tras corregir el `maxPerDay` del dato de prueba, que debe ser de 2 a 5).
- Suite completa: 32 specs, 387 tests. **386 pasan y 1 falló** en la primera ejecución: `scheduleConfirmation.cy.ts` («discards a draft, which disappears while the official stays»), con un `Timed out retrying after 4000ms` esperando `/horarios/oficial`. No toca las páginas de este cambio; ejecutada sola, la spec pasa 5 de 5. Se trata como un test inestable bajo carga, no como una regresión, pero queda anotado.

## Resultado

- Estado del paso 7: **PASS con una incidencia no reproducible** (`scheduleConfirmation.cy.ts`, pasa de forma aislada).
