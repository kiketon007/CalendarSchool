## ADDED Requirements

### Requirement: Motor que produjo el horario
El resultado `solved` de `ScheduleSolver.solve` MUST llevar `engine` (`'BACKTRACKING'` o `'ORTOOLS'`): el motor que encontró el horario válido de partida. `BacktrackingSolver` MUST devolver siempre `'BACKTRACKING'`.

La construcción del resultado `solved` a partir de los emplazamientos de partida (validar, mejorar si se pidió y quedan tiempo y presupuesto, volver a validar y puntuar) MUST ser una función compartida del dominio, `solvedOutcomeOf`. Así los dos motores aplican la «Fase de mejora» exactamente igual.

#### Scenario: Backtracking
- **WHEN** `BacktrackingSolver` resuelve un problema con solución
- **THEN** el resultado es `solved` con `engine: 'BACKTRACKING'`

#### Scenario: Misma mejora desde los mismos emplazamientos
- **GIVEN** los emplazamientos de partida de un problema
- **WHEN** se construye el resultado con `solvedOutcomeOf` con el mismo reloj contado, una vez como `BACKTRACKING` y otra como `ORTOOLS`
- **THEN** las entradas, la puntuación y el informe de la mejora son idénticos y solo cambia `engine`
