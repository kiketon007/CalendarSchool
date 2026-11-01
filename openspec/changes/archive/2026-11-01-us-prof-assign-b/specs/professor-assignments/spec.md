## ADDED Requirements

### Requirement: Guardar la matriz mientras se quita una asignatura del curso
Tras bloquear el curso y los profesores, el `PUT /api/courses/{id}/assignments` MUST bloquear con `FOR SHARE`, en orden de `subject_id`, las filas de `subject_courses` del curso (`SELECT … FROM subject_courses WHERE course_id = … ORDER BY subject_id FOR SHARE`) **antes** de comprobar las referencias, y MUST comprobar las asignaturas contra esas filas bloqueadas. Quitar una asignatura de un curso (editar la asignatura, ajustar la carga horaria o borrar la asignatura) borra esa fila sin tomar el bloqueo del curso, y sin este paso el borrado podía confirmar entre la comprobación y el `INSERT` y la clave ajena compuesta hacía fallar el guardado con `500`. El orden de bloqueos global no cambia: el curso va primero, y esos tres borrados no esperan al curso una vez tienen la asignatura, así que no hay ciclos.

#### Scenario: Guardar mientras se quita la asignatura del curso
- **WHEN** se lanzan en carrera un `PUT` que asigna a un profesor esa asignatura y el borrado de su fila de `subject_courses`, en varias rondas
- **THEN** el `PUT` nunca falla con `500`: responde `200` o `400` con `NOT_FOUND` en su `subjectId`
- **AND** no queda ninguna asignación de una asignatura que ya no se imparte en el curso

### Requirement: Avisos de asignaciones que se pierden de extremo a extremo
Los E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con asignaciones creadas por la API:
- en la carga de un curso, pasar a «No se imparte» una asignatura con reglas y asignaciones muestra la frase con las dos cosas;
- en la edición de un curso, quitar una clase con asignaciones y sin alumnos abre el diálogo con el número, y al guardar la matriz `/cursos/:id/profesores` ya no tiene esa clase;
- el diálogo de borrar un profesor con asignaciones las enumera y, tras borrar, la matriz del curso deja esas celdas «Sin asignar»;
- a 360 px no hay desplazamiento horizontal con los avisos ni con los diálogos abiertos.

#### Scenario: Recorrido de los avisos
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/assignments.cy.ts`
- **THEN** los tres avisos aparecen con sus números y, tras confirmar, las asignaciones han desaparecido de la matriz del curso
