# Paso 10: E2E con Cypress (us-ui-rest-a)

Fecha: 2026-11-09

- `scheduleReadiness.cy.ts` (8 tests): cabecera (sobretítulo, `h1#schedule-readiness-title`, descripción corta), círculo del veredicto, los dos grupos como regiones con filas `li.cs-list-item`, y sin desplazamiento horizontal a 1280 y a 360 px.
- `scheduleGeneration.cy.ts` (12 tests): insignia «Borrador listo» y sobretítulo tras generar, recuadro con «Ver horario» y «Confirmar como oficial», tres tarjetas de cifras con los valores del desglose (huecos y penalización actual) y `aria-hidden`; a 1280 px en una fila y a 360 px apiladas, sin desplazamiento horizontal.
- `scheduleConfirmation`, `scheduleDraft`, `scheduleExport` y `schedulePrevious`: revisadas con `grep`; no buscan cifras del desglose ni clases cambiadas, sin ajustes.
- Suite completa (`npm run test:e2e`): 390 de 390 tests en verde (8 min 22 s). Puertos 4173, 3000 y 3001 libres al terminar.
