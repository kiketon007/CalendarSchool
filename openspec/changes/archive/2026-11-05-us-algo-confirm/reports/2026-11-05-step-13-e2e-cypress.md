# Paso 13: E2E con Cypress (2026-11-05)

Cambio: `us-algo-confirm`.

## Spec nueva: `cypress/e2e/scheduleConfirmation.cy.ts` (5 tests)

Contra el build servido con `vite preview` y el backend de E2E (lanzador en memoria), con la CSP aplicada.

| Test | Qué comprueba |
| --- | --- |
| Confirma el borrador desde su página | genera, abre el borrador, «Confirmar como oficial» y «Confirmar» en el diálogo; llega a `/horarios/oficial` con el aviso, «Oficial», «Confirmado el … por José María García-López», las tablas y «Exportar», y sin «Confirmar» ni «Descartar»; `/horarios` enseña arriba «Horario oficial: confirmado el …» con su enlace; el servidor dice que ya no hay borrador y que hay un oficial |
| Sustituye el oficial desde el resumen de la generación | confirma desde el panel; el panel pasa a decir «Este horario es el oficial»; genera otra vez, el diálogo avisa de que «Sustituirá al horario oficial confirmado el …» y, al confirmar, el servidor dice que hay 1 anterior |
| Descarta un borrador | con un oficial ya confirmado, genera otro borrador y lo descarta; vuelve a `/horarios` con «Borrador descartado», el panel dice «Este borrador ya no existe», el resumen del oficial sigue y el servidor no tiene borrador |
| Miembro | ve el resumen, el enlace «Ver horario» del panel, la página del borrador con «Exportar» y la del oficial, y no ve «Confirmar como oficial» ni «Descartar el borrador» en ninguna parte |
| 360 px | los dos diálogos y la página del oficial no desplazan la página en horizontal |

Primera ejecución: 5 de 5.

## Suite completa (`npm run test:e2e`)

- **29 specs, 354 tests, 0 fallos** (antes 28 specs y 349 tests). Tiempo de Cypress: 7 min 42 s, dentro del límite de 20 minutos del script (`DEFAULT_CYPRESS_TIMEOUT_MS`, subido en la PR #153).

## Limpieza

- Base de test (`public` de `calendarschool_test`) vaciada de nuevo. La única diferencia con la línea base del paso 11 es `_prisma_migrations` 17 → 18: el E2E aplica las migraciones pendientes a esa base, como se esperaba; los demás recuentos son idénticos.
- Los puertos 3000, 3001 y 4173 no escuchan.
