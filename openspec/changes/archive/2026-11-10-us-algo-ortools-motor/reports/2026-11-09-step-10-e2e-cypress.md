# Paso 10 - E2E con Cypress

- Fecha: 2026-11-09
- Cambio: us-algo-ortools-motor
- Agente: Claude

## Alcance

Este cambio no modifica la interfaz ni el contrato de la API (`engine` llega con `us-algo-ortools-despliegue`), así que no se añaden specs. El paso comprueba que no hay regresiones en los flujos completos, en particular los de generar horarios, con el motor por defecto (`BACKTRACKING`): el E2E no define `SCHEDULE_ENGINE` y no lanza Python.

## Comando

- `npm run test:e2e` (compila, migra la base de test, arranca el backend en `:3001` y `vite preview` en `:4173` y ejecuta Cypress en modo headless), una sola pasada con las 32 specs.

## Resultado

- **32 specs, 390 tests, 390 correctos, 0 fallos**, en 8 min 10 s. Código de salida 0.
- Entre ellas, las specs que recorren la generación (`scheduleReadiness`, `scheduleGeneration`, `scheduleDraft`, `scheduleExport`, `scheduleConfirmation` y `schedulePrevious`), que ejercitan el motor por defecto a través de `solvedOutcomeOf`, el nuevo campo `engine` del resultado y la columna `schedules.engine`.
- La migración `schedule_engine_ortools` se aplicó a la base de test al arrancar, sin incidencias.

## Entorno

- Los datos de las pruebas se limpian al empezar cada ejecución (`scripts/e2eData.mjs`), nunca al terminar, como en el resto del proyecto.
- Al terminar, ningún servidor queda escuchando: los puertos 3000, 3001 y 4173 solo muestran conexiones en `TimeWait`.

## Resultado

- Paso 10: **PASA**. Incidencias bloqueantes: ninguna.
