## ADDED Requirements

### Requirement: Asignaciones de profesores de una asignatura en cada curso
Cada `SubjectCourse` de las respuestas de asignaturas (`GET /api/subjects`, `GET /api/subjects/{id}`, `POST` y `PUT`) MUST llevar `assignmentCount`, un entero ≥ 0 y requerido: el número de asignaciones de profesores de la asignatura en las clases de ese curso. Solo va en las respuestas; si llega en una petición, MUST ignorarse como cualquier propiedad desconocida. En el `PUT`, el recuento MUST ser el del estado final. El recuento MUST salir en la misma consulta que lee los cursos de la asignatura.

`subjectsService` del frontend MUST exigirlo: cualquier otra forma es `unavailable`.

#### Scenario: Recuento por curso
- **GIVEN** Inglés en 1º Primaria con profesor en A y B, y en 2º Primaria sin profesores
- **WHEN** se pide `GET /api/subjects/<id>`
- **THEN** 1º Primaria lleva `assignmentCount: 2` y 2º Primaria `0`

#### Scenario: Recuento tras quitar un curso
- **GIVEN** Inglés con 2 asignaciones en 1º Primaria
- **WHEN** un `PUT` quita 1º Primaria de sus cursos
- **THEN** la respuesta no lleva 1º Primaria y no queda ninguna asignación de Inglés en 1º

#### Scenario: Asignatura nueva
- **WHEN** se crea una asignatura con dos cursos
- **THEN** los dos llevan `assignmentCount: 0`

### Requirement: Avisos de asignaciones en las páginas de asignaturas
- **Edición de la asignatura:** al desmarcar un curso con reglas o con asignaciones cargadas, el aviso bajo ese curso MUST decir lo que se borra en una sola frase con «en {curso}», con las mismas piezas, plurales y `Intl.ListFormat` que el aviso de la carga, ligado a su casilla por `aria-describedby`, y desaparecer al volver a marcarlo. `SubjectForm` MUST recibir los recuentos de asignaciones junto a los de reglas.
- **`DeleteSubjectModal`:** MUST decir «Se quitarán también {n} asignaciones de profesores.», con plural y la suma de los `assignmentCount` de sus cursos de la tarjeta, solo si es mayor que 0, tras el párrafo de las reglas y sin pedir nada al abrirse.

Sin asignaciones, los avisos de reglas MUST NOT cambiar. Los textos MUST estar en `es.json` y `en.json` y no MUST haber violaciones de `axe` con los avisos.

#### Scenario: Desmarcar un curso con asignaciones
- **GIVEN** Inglés con 1 regla y 2 asignaciones en 1º Primaria
- **WHEN** el `ADMIN` desmarca 1º Primaria en su edición
- **THEN** ve «Al guardar se borrarán su regla y sus 2 asignaciones de profesores en 1º Primaria» ligado a la casilla, y al volver a marcarlo desaparece

#### Scenario: Desmarcar un curso solo con asignaciones
- **GIVEN** Música sin reglas y con 3 asignaciones en 2º Primaria
- **WHEN** el `ADMIN` desmarca 2º Primaria
- **THEN** ve «Al guardar se borrarán sus 3 asignaciones de profesores en 2º Primaria»

#### Scenario: Diálogo de borrado con asignaciones
- **GIVEN** Inglés con 2 asignaciones en 1º y 1 en 2º, y 3 reglas
- **WHEN** se abre su diálogo de borrado
- **THEN** dice «Se borrarán también 3 reglas de reparto.» y «Se quitarán también 3 asignaciones de profesores.»; sin asignaciones, la segunda frase no aparece

### Requirement: Asignaciones en el evento de borrado de una asignatura
`SUBJECT_DELETED` MUST llevar además `assignment_count`, el número de asignaciones de profesores de la asignatura contado dentro de la transacción del borrado, antes de borrar. El evento MUST NOT llevar nombres. La respuesta de `DELETE /api/subjects/{id}` MUST NOT cambiar. El puerto `SubjectRepository.delete` MUST devolver el recuento, o `null` si la asignatura no existe en el colegio.

#### Scenario: Evento con asignaciones
- **GIVEN** Inglés con 3 asignaciones de profesores
- **WHEN** se borra
- **THEN** el log tiene `SUBJECT_DELETED` con `assignment_count: 3` y sin nombres, y la respuesta es la misma que antes de esta historia
