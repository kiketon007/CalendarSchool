## ADDED Requirements

### Requirement: Avisos de asignaciones que se pierden de extremo a extremo
Los E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con asignaciones creadas por la API:
- en la carga de un curso, pasar a «No se imparte» una asignatura con reglas y asignaciones muestra la frase con las dos cosas;
- en la edición de un curso, quitar una clase con asignaciones y sin alumnos abre el diálogo con el número, y al guardar la matriz `/cursos/:id/profesores` ya no tiene esa clase;
- el diálogo de borrar un profesor con asignaciones las enumera y, tras borrar, la matriz del curso deja esas celdas «Sin asignar»;
- a 360 px no hay desplazamiento horizontal con los avisos ni con los diálogos abiertos.

#### Scenario: Recorrido de los avisos
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/assignments.cy.ts`
- **THEN** los tres avisos aparecen con sus números y, tras confirmar, las asignaciones han desaparecido de la matriz del curso
