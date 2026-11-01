## ADDED Requirements

### Requirement: Asignaciones en el diálogo de borrado de un profesor
Con el profesor ya consultado (`GET /api/professors/{id}`), el diálogo de borrado MUST mostrar, si su `subjects` no está vacío, «Se quitarán también sus {n} asignaciones de profesores: {lista}.» (en singular con 1, «su asignación de profesor»), tras el aviso de la tutoría y antes de «Esta acción no se puede deshacer». {lista} MUST ser el mismo texto agrupado por asignatura que la columna «Asignaturas» del listado («Inglés: 1º Primaria A, 1º Primaria B · Música: 3º Primaria B»), generado por la misma función, que pasa a un módulo de `utils/` compartido. Sin asignaciones MUST NOT verse ningún texto nuevo. Los textos MUST estar en `es.json` y `en.json`, pintarse como texto plano y no MUST haber violaciones de `axe`.

#### Scenario: Profesor con asignaciones
- **GIVEN** Eva Ruiz da Inglés en 1º Primaria A y 1º Primaria B y no tutoriza ninguna clase
- **WHEN** se abre su diálogo de borrado
- **THEN** tras «Comprobando…» dice «Se quitarán también sus 2 asignaciones de profesores: Inglés: 1º Primaria A, 1º Primaria B.» y «Esta acción no se puede deshacer»

#### Scenario: Tutora con una asignación
- **GIVEN** Ana tutoriza 1º Primaria A y da Lengua solo en esa clase
- **WHEN** se abre su diálogo de borrado
- **THEN** dice «Tutoriza 1º Primaria A: la clase quedará sin tutor» y después «Se quitará también su asignación de profesor: Lengua: 1º Primaria A.»

#### Scenario: Sin asignaciones
- **GIVEN** un profesor sin asignaciones
- **WHEN** se abre su diálogo de borrado
- **THEN** no aparece ningún texto de asignaciones

### Requirement: Asignaciones en el evento de borrado de un profesor
`PROFESSOR_DELETED` MUST llevar además `assignment_count`, el número de asignaciones del profesor contado dentro de la transacción del borrado, con su fila bloqueada y antes de borrar. El evento MUST NOT llevar nombres. La respuesta de `DELETE /api/professors/{id}` MUST seguir siendo `{ deleted: { freedClass } }`, sin el recuento: el router MUST enviar solo `freedClass` aunque el resultado del caso de uso lleve más campos.

#### Scenario: Evento con asignaciones
- **GIVEN** Eva Ruiz con 2 asignaciones
- **WHEN** se borra
- **THEN** el log tiene `PROFESSOR_DELETED` con `assignment_count: 2` y `freed_class: false`, sin nombres, y no queda ninguna asignación suya

#### Scenario: Respuesta sin cambios
- **WHEN** se borra un profesor con asignaciones
- **THEN** `data.deleted` solo lleva `freedClass`
