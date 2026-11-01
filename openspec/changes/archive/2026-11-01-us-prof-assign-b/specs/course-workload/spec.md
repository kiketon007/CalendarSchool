## ADDED Requirements

### Requirement: Asignaciones de profesores en la lectura de la carga
Cada `CourseWorkloadSubject` de `GET` y `PATCH /api/courses/{id}/workload` MUST llevar `assignmentCount`, un entero ≥ 0 y requerido: el número de asignaciones de profesores de la asignatura en las clases del curso (`professor_assignments` con ese `subject_id` y ese `course_id`). Una asignatura que no se imparte en el curso MUST llevar `0`. En el `PATCH`, el recuento MUST ser el del estado final, contado después de guardar. El recuento MUST salir en la misma consulta que lee la carga, sin una consulta por asignatura.

`courseWorkloadService` del frontend MUST exigirlo: cualquier otra forma es `unavailable`.

#### Scenario: Recuento en la lectura
- **GIVEN** 1º Primaria con las clases A, B y C, Inglés con profesor en las tres y Lengua sin ninguno
- **WHEN** se pide `GET /api/courses/<id>/workload`
- **THEN** Inglés lleva `assignmentCount: 3`, Lengua `0` y una asignatura que no se imparte en 1º, `0`

#### Scenario: Recuento tras dejar de impartirse
- **GIVEN** Inglés con 3 asignaciones en 1º Primaria
- **WHEN** un `PATCH` la pasa a `sessionsPerWeek: null`
- **THEN** la respuesta lleva Inglés con `assignmentCount: 0` y no queda ninguna asignación de Inglés en 1º

#### Scenario: Servicio estricto
- **WHEN** la respuesta de la carga trae una asignatura sin `assignmentCount` o con un valor negativo
- **THEN** `courseWorkloadService` devuelve `unavailable`

### Requirement: Aviso de las asignaciones que se pierden en la carga
En la matriz de la carga, al pasar a «No se imparte» una asignatura con reglas o con asignaciones en el curso, el aviso de pérdida MUST decir en una sola frase lo que se borra, ligado a su selector de sesiones por `aria-describedby`, y desaparecer al volver a darle sesiones. La frase MUST componerse con piezas pluralizadas, «sus {n} reglas» / «su regla» y «sus {m} asignaciones de profesores» / «su asignación de profesor», omitiendo las que son 0 y unidas con `Intl.ListFormat` del idioma activo (`type: 'conjunction'`); el verbo MUST ir en plural salvo que solo haya una cosa. Sin reglas ni asignaciones MUST NOT verse ningún aviso. El texto de solo reglas MUST NOT cambiar. Los textos MUST estar en `es.json` y `en.json` y la página MUST NOT tener violaciones de `axe` con el aviso.

#### Scenario: Reglas y asignaciones
- **GIVEN** Inglés con 2 reglas y 3 asignaciones de profesores en 1º Primaria
- **WHEN** el `ADMIN` la pasa a «No se imparte»
- **THEN** ve «Al guardar se borrarán sus 2 reglas y sus 3 asignaciones de profesores en este curso»

#### Scenario: Solo asignaciones, en singular
- **GIVEN** Música sin reglas y con profesor solo en la clase A
- **WHEN** la pasa a «No se imparte»
- **THEN** ve «Al guardar se borrará su asignación de profesor en este curso»

#### Scenario: Solo reglas
- **GIVEN** Plástica con 2 reglas y sin asignaciones
- **WHEN** la pasa a «No se imparte»
- **THEN** ve «Al guardar se borrarán sus 2 reglas en este curso», igual que antes de esta historia

#### Scenario: Sin nada que perder
- **GIVEN** Religión sin reglas ni asignaciones
- **WHEN** la pasa a «No se imparte»
- **THEN** no ve ningún aviso de pérdida

#### Scenario: En inglés
- **GIVEN** el idioma inglés e Inglés con 2 reglas y 3 asignaciones
- **WHEN** la pasa a «No se imparte»
- **THEN** el aviso une las dos piezas con «and» y usa los plurales de `en.json`
