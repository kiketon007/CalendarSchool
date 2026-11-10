# Paso 12 - E2E con Cypress

- Fecha: 2026-11-10
- Cambio: us-algo-ortools-despliegue
- Agente: Claude

## Alcance

El cambio añade `engine` a `Generation` y una barra sin valor en el panel de la generación, así que las specs de Cypress que simulan una generación con `cy.intercept` necesitan el campo, y el caso nuevo cubre la barra con OR-Tools. El E2E real sigue con el motor por defecto (`BACKTRACKING`): no lanza Python ni la Lambda.

## Cambios en las specs

- `scheduleGeneration.cy.ts`:
  - La generación simulada que se sigue tras recargar (`shows the progress of a generation in progress after a reload and follows it to the end`) lleva ahora `engine: 'BACKTRACKING'`; sin él, el servicio la daría por inválida.
  - Caso nuevo `shows a bar without value while OR-Tools searches, and the bar with value once the other engine takes over`: una generación simulada `RUNNING` con `engine: 'ORTOOLS'`, `phase: 'SEARCHING'` y `placed: 0` muestra la barra con el nombre `searchingIndeterminate.label` y sin `aria-valuenow`, no muestra «de 50 sesiones» y deja «Cancelar» habilitado; en el siguiente sondeo, que trae `BACKTRACKING` con 30 de 50, vuelve la barra con valor (`aria-valuenow` 60, nombre `progress.label`) y el texto «30 de 50 sesiones».

## Comandos

- `npm run test:e2e` (compila, migra la base de test, arranca el backend en `:3001` y `vite preview` en `:4173` y ejecuta Cypress en modo headless), una sola pasada con las 32 specs.

## Resultado

- **32 specs, 391 tests, 391 correctos, 0 fallos**, en 8 min 27 s. Código de salida 0. Son los 390 de antes más el caso nuevo.
- `scheduleGeneration.cy.ts`: 13 de 13.
- La migración `schedule_generation_engine` se aplicó a la base de test al arrancar, sin incidencias.

## Entorno

- Los datos de las pruebas se limpian al empezar cada ejecución (`scripts/e2eData.mjs`), nunca al terminar, como en el resto del proyecto.
- Al terminar, ningún servidor queda escuchando (3000, 3001 y 4173, comprobado con `Get-NetTCPConnection -State Listen`).

## Resultado

- Paso 12: **PASA**. Incidencias bloqueantes: ninguna.
