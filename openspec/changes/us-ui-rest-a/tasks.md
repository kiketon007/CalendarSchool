## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-ui-rest-a` desde `main` actualizada (`49581f0`, con US-UI-HOME archivada), con los artefactos de este cambio y la concreción de la ficha en `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene esos ficheros y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Piezas sueltas: textos, icono y estado de la generación

- [x] 1.1 Cambiar y añadir en `es.json` y `en.json` las claves de D2, D5, D6 y D7 (`schedule.readiness.eyebrow`, `intro` más corta, `schedule.generation.eyebrow.*`, `schedule.generation.badge.*`, `completed_*` y `schedule.score.penalty.value*` con sus etiquetas para `Trans`, `schedule.score.stats.*`). `locales.test.ts` en verde
- [x] 1.2 Crear `components/icons/CircleAlertIcon.tsx` (Lucide, `IconProps`, `aria-hidden` y `focusable="false"` como el resto)
- [x] 1.3 Test que falla en `utils/generationStatus.test.ts` (D4):
  - `completedKind`: borrador vigente, oficial, ninguno y `overview` nulo;
  - `generationBadge`: una fila por estado de la tabla de la spec;
  - `generationEyebrow`: en curso, última y ninguno.
  
  Después, crear `utils/generationStatus.ts` hasta que pase

## 2. Estilos

- [x] 2.1 Tests que fallan en `styles/theme.test.ts` (D9): el círculo del veredicto, la franja de la tarjeta con `::before` y `position: absolute`, la insignia (pastilla, 12 px o más y contraste de la pareja de peligro y de cada tono), el resaltado (≥ 4,5:1), el recuadro con `$day-panel-bg`, la rejilla del desglose (dos columnas desde `sm`), la sombra del botón de generar y las tarjetas de cifras (etiqueta de 12 px o más y 4,5:1)
- [x] 2.2 Crear `styles/_schedule.scss` e importarlo en `theme.scss` hasta que pase 2.1; anotar el gzip del CSS del build antes y después (gzip: 31,79 kB → 32,05 kB)

## 3. Desglose de la puntuación

- [x] 3.1 Tests que fallan en `ScheduleScoreSummary.test.tsx`: la `dl` es `.cs-score-list` con las mismas etiquetas, la cifra en negrita, el número de la penalización en un `strong` y su aclaración «(antes de mejorar: …)» fuera de él; el texto del `dd` completo no cambia
- [x] 3.2 Cambiar `ScheduleScoreSummary.tsx` (D6) hasta que pase 3.1; comprobar que los tests de `ScheduleDraftPage` que leen el desglose siguen en verde

## 4. Tarjetas de cifras

- [x] 4.1 Test que falla en `ScheduleScoreStats.test.tsx`: tres tarjetas con «Huecos de profesores», «Asignaturas consecutivas» y «Penalización actual» y las cifras del `score` (la penalización es `total`, no `initialTotal`), la fila con `aria-hidden="true"`, los tonos lavanda, melocotón y menta, los iconos decorativos y `axe`
- [x] 4.2 Crear `ScheduleScoreStats.tsx` (D7) hasta que pase 4.1

## 5. Panel de la generación

- [x] 5.1 Tests que fallan en `ScheduleGenerationPanel.test.tsx`:
  - sobretítulo e insignia para cada estado de la tabla (sin generación, en cola o buscando, mejorando, borrador listo, oficial, ya no vigente, fallida y cancelada);
  - «360 sesiones colocadas» en un `span` resaltado y el plural;
  - el recuadro con la nota, «Ver horario» y, solo para `ADMIN`, «Confirmar como oficial»;
  - «Generar horarios» y «Generar de nuevo» con un icono decorativo y su nombre accesible sin cambios;
  - las tarjetas de cifras solo con una generación completada con puntuación;
  - que el `data-testid` sigue en la tarjeta.
- [x] 5.2 Cambiar `ScheduleGenerationPanel.tsx` (D4–D7: `completedKind` en `CompletedOffer`, tarjeta, cabecera, `Trans`, recuadro, botón con icono y fragmento con las tarjetas) hasta que pase 5.1, sin tocar el sondeo, la cancelación, las acciones ni el foco
- [x] 5.3 Ajustar el resto de `ScheduleGenerationPanel.test.tsx`: las cifras del desglose se leen con `within` de su región (ya hay dos elementos con la misma cifra), los `container.firstChild` que dejen de valer y `axe` en cada estado; toda la suite del fichero en verde

## 6. Página y problemas

- [x] 6.1 Tests que fallan en `ScheduleReadinessPage.test.tsx`, con `describe.each` a 1280 y 360 px donde cambia el marcado: `PageHeader` con «Planificación académica», el `h1` con su `id` y la descripción corta; el círculo decorativo del veredicto en los dos casos; los dos grupos de problemas como regiones con nombre y filas `li.cs-list-item`, sin `Card`; el aviso de descartado y el resumen del oficial entre la cabecera y el veredicto
- [x] 6.2 Cambiar `ScheduleReadinessPage.tsx`, `ReadinessIssueItem.tsx` y, si hace falta, `OfficialScheduleSummary.tsx` (D2, D3, D8) hasta que pase 6.1, sin tocar la carga, los reintentos ni el panel
- [x] 6.3 Ajustar el resto de `ScheduleReadinessPage.test.tsx`, `ReadinessIssueItem.test.tsx` y `OfficialScheduleSummary.test.tsx` (el texto de la descripción y los `li`) y `axe` con problemas, cargando y con error; toda la suite de los tres ficheros en verde

## 7. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 7.1 Buscar con `grep` en los tests (`App.test.tsx`, `ScheduleDraftPage.test.tsx` y otros) el texto de la descripción, `schedule.score.penalty`, `schedule.generation.completed` y `card-body`, y ajustarlos
- [x] 7.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 8. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 8.1 Capturar la línea base de recuentos de `calendarschool` y `calendarschool_test`
- [x] 8.2 Ejecutar los tests de los ficheros cambiados (`generationStatus`, `ScheduleScoreSummary`, `ScheduleScoreStats`, `ScheduleGenerationPanel`, `ScheduleReadinessPage`, `ReadinessIssueItem`, `OfficialScheduleSummary`, `ScheduleDraftPage`, `theme`, `locales` y `App`)
- [x] 8.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 8.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 8.5 Crear `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md`, con el tamaño del CSS y del JS del build frente a los de `main`, y marcar el paso solo con el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Servir el build con `vite preview` (puerto 4173, desde `frontend/`) y comprobar con `curl`:
  - que la cabecera `Content-Security-Policy` es idéntica a la de `main`;
  - que el CSS enlazado no tiene URLs externas;
  - que contiene `.cs-generation-card`, `.cs-callout` y `.cs-stat-card`.
- [x] 9.2 Comprobar con `curl` que `/horarios` devuelve la SPA. Sin endpoints nuevos: no hay peticiones de escritura que restaurar
- [x] 9.3 Parar `vite preview`, comprobar que los puertos 4173, 3000 y 3001 quedan libres y crear `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Ampliar `cypress/e2e/scheduleReadiness.cy.ts` con la cabecera (sobretítulo, `h1` y descripción), el círculo del veredicto y los dos grupos de problemas como regiones con filas, y la comprobación de `scrollWidth` a 1280 y 360 px
- [x] 10.2 Ampliar `cypress/e2e/scheduleGeneration.cy.ts` con la insignia «Borrador listo» y el sobretítulo tras generar, el recuadro con «Ver horario», las tres tarjetas de cifras con los valores del desglose y, a 360 y 1280 px, sin desplazamiento horizontal con el panel completado y las tarjetas apiladas o en fila
- [x] 10.3 Revisar con `grep` `scheduleConfirmation.cy.ts`, `scheduleDraft.cy.ts`, `scheduleExport.cy.ts` y `schedulePrevious.cy.ts`, y ajustar lo que busque una cifra del desglose con `contains` (ahora hay dos elementos) o una clase que cambie
- [x] 10.4 Ejecutar las specs cambiadas y la suite completa en modo headless (`npm run test:e2e`), en dos tandas si la memoria lo exige; los datos del E2E se limpian al empezar (`scripts/e2eData.mjs`)
- [x] 10.5 Crear `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación técnica (MANDATORY)

- [x] 11.1 Actualizar con la skill `update-docs`:
  - `frontend/CLAUDE.md`: los bullets de US-ALGO-CHECK y US-ALGO-RUN (la cabecera con `PageHeader`, el veredicto con círculo, el panel como `.cs-generation-card` con insignia por `utils/generationStatus`, `completedKind` compartido por `CompletedOffer` y la insignia, las tarjetas de cifras `aria-hidden` y los problemas como `ListSection`) y `_schedule.scss`;
  - en `docs/User_Stories_MVP.md`: la línea de estado de US-UI-REST_a (implementada) y la fila del módulo «Interfaz de usuario».
- [ ] 11.2 Revisar a mano el `Purpose` de `openspec/specs/schedule-page-layout/spec.md` tras archivar: la herramienta lo crea con un texto genérico
- [x] 11.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 11.4 Verificar con `openspec validate us-ui-rest-a --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [ ] 12.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–11 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [ ] 12.2 Comprobar en producción (`https://app.calendarschools.es`):
  - **Con `curl`:** `/horarios` devuelve la SPA, la cabecera `Content-Security-Policy` no ha cambiado y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, revisa `/horarios` en escritorio y en móvil, con el colegio listo y una generación completada, y con una generación en curso, fallida o cancelada y con problemas si puede provocarlos (esos estados no estaban en la maqueta).
- [ ] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
