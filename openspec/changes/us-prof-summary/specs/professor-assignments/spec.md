## ADDED Requirements

### Requirement: Guardar la matriz mientras se borra una clase del curso
Tras bloquear el curso, los profesores y las filas de `subject_courses`, el `PUT /api/courses/{id}/assignments` MUST bloquear con `FOR SHARE`, en orden de `id`, las clases del curso (`SELECT id FROM classes WHERE course_id = … ORDER BY id FOR SHARE`) **antes** de comprobar las referencias, y MUST comprobar las clases contra esas filas bloqueadas. Dentro de la aplicación una clase solo desaparece al editar o borrar el curso, que toman el bloqueo del curso, pero la clave ajena compuesta de `professor_assignments` falla con `500` si una clase se borra por otro camino entre la comprobación y el `INSERT`; con este paso el guardado espera a que el borrado confirme y responde `400` con `NOT_FOUND` en su `classId`. El orden de bloqueos global no cambia: el curso va primero.

#### Scenario: Guardar mientras se borra una clase
- **GIVEN** una transacción que ha borrado una clase del curso y aún no ha confirmado
- **WHEN** se guarda la matriz con una asignación en esa clase y después se confirma el borrado
- **THEN** el guardado no falla con `500`: responde `400` con `NOT_FOUND` en su `classId`
- **AND** no queda ninguna asignación de la clase borrada
