## ADDED Requirements

### Requirement: Asignaciones de profesores de cada clase en las respuestas de cursos
Cada `SchoolClass` de las respuestas de cursos (`GET /api/courses`, `GET /api/courses/{id}`, `POST` y `PUT`) MUST llevar `assignmentCount`, un entero ≥ 0 y requerido: el número de asignaciones de profesores de la clase. Solo va en las respuestas; si llega en una petición, MUST ignorarse como cualquier propiedad desconocida. En el `PUT`, el recuento MUST ser el del estado final, y una clase nueva MUST llevar `0`. El recuento MUST salir en la misma consulta que lee las clases, sin una consulta por clase.

`coursesService` del frontend MUST exigirlo: cualquier otra forma es `unavailable`.

#### Scenario: Recuento por clase
- **GIVEN** 1º Primaria con Inglés y Lengua asignadas en A y solo Inglés en B
- **WHEN** se pide `GET /api/courses/<id>`
- **THEN** A lleva `assignmentCount: 2` y B `1`

#### Scenario: Clase nueva
- **WHEN** se crea un curso con dos clases, o se añade una clase al editarlo
- **THEN** las clases nuevas llevan `assignmentCount: 0`

#### Scenario: Servicio estricto
- **WHEN** una clase de la respuesta no trae `assignmentCount`
- **THEN** `coursesService` devuelve `unavailable`

### Requirement: Asignaciones de profesores en el borrado de un curso
`CourseImpact` MUST llevar `assignmentCount`, un entero ≥ 0 y requerido, con todas las asignaciones de profesores del curso. `GET /api/courses/{id}/impact` MUST contarlas sin cambiar nada; `DELETE /api/courses/{id}` MUST devolver en `data.deleted.assignmentCount` las que se borraron de verdad, contadas dentro de su transacción antes de borrar, y caídas por la cascada. `COURSE_DELETED` MUST llevar además `assignment_count`, sin nombres. `DeleteCourseModal` MUST mostrar «Se quitarán también {n} asignaciones de profesores.», con plural, tras el párrafo de las reglas y solo si el `assignmentCount` del impacto es mayor que 0. El texto MUST estar en `es.json` y `en.json`.

#### Scenario: Impacto con asignaciones
- **GIVEN** 1º Primaria con 5 asignaciones de profesores
- **WHEN** se pide su impacto
- **THEN** `assignmentCount` es 5 y las asignaciones siguen existiendo

#### Scenario: Borrar un curso con asignaciones
- **GIVEN** 1º Primaria con 5 asignaciones
- **WHEN** se borra
- **THEN** `data.deleted.assignmentCount` es 5, no queda ninguna asignación de 1º y el log tiene `COURSE_DELETED` con `assignment_count: 5` y sin nombres

#### Scenario: Diálogo con asignaciones
- **GIVEN** 1º Primaria con tres clases, sin reglas y con 5 asignaciones
- **WHEN** se abre su diálogo de borrado
- **THEN** dice «Se borrarán sus 3 clases» y «Se quitarán también 5 asignaciones de profesores.»; un curso sin asignaciones no muestra esa frase

## MODIFIED Requirements

### Requirement: Confirmar al quitar una clase con alumnos
En la edición de un curso, pulsar «Quitar» en una fila de una clase que ya existía y tiene alumnos o asignaciones de profesores MUST abrir un diálogo con el título «¿Quitar la clase {nombre}?» como nombre accesible, un párrafo por cada cosa que se pierde y los botones «Cancelar», con el foco inicial, y «Quitar clase»; sin botón «X» de cabecera:
- **con alumnos:** «La clase {nombre} tiene {N} alumnos. Al guardar el curso quedarán en él sin clase» (en singular con 1);
- **con asignaciones:** «Al guardar el curso se quitarán también sus {M} asignaciones de profesores.» (en singular con 1, «su asignación de profesor»).

{nombre} MUST ser el nombre que hay escrito en la fila, o «la clase {posición}» si está vacío; {N} y {M} MUST ser los números que se cargaron con el curso (`studentCount` y `assignmentCount` de la clase). «Cancelar», Escape o el clic fuera MUST cerrar el diálogo sin quitar la fila y devolver el foco a su botón «Quitar»; «Quitar clase» MUST quitar la fila del formulario (como sin diálogo) y llevar el foco a «Añadir clase» cuando el diálogo termina de cerrarse. Nada MUST guardarse hasta «Guardar». Quitar una fila nueva o la de una clase con `0` alumnos y `0` asignaciones MUST NOT abrir el diálogo. Los textos MUST pintarse como texto plano y estar en `es.json` y `en.json`.

#### Scenario: Confirmar
- **GIVEN** la edición de «1º Primaria» con «A» (12 alumnos, sin asignaciones) y «B»
- **WHEN** se pulsa «Quitar la clase 1»
- **THEN** se abre «¿Quitar la clase A?» con «La clase A tiene 12 alumnos. Al guardar el curso quedarán en él sin clase» y el foco en «Cancelar»
- **AND** al pulsar «Quitar clase» la fila «A» desaparece, el foco pasa a «Añadir clase» y no se ha enviado nada

#### Scenario: Clase con asignaciones y sin alumnos
- **GIVEN** la edición de «1º Primaria» con «B» sin alumnos y con 3 asignaciones de profesores
- **WHEN** se pulsa su «Quitar»
- **THEN** se abre «¿Quitar la clase B?» con «Al guardar el curso se quitarán también sus 3 asignaciones de profesores.» y sin el párrafo de los alumnos

#### Scenario: Clase con alumnos y asignaciones
- **GIVEN** «A» con 12 alumnos y 1 asignación
- **WHEN** se pulsa su «Quitar»
- **THEN** el diálogo muestra los dos párrafos, el de la asignación en singular

#### Scenario: Cancelar
- **WHEN** se abre el diálogo de «A» y se pulsa «Cancelar» o Escape
- **THEN** la fila «A» sigue con su nombre y su tutor, el foco vuelve a su «Quitar» y «Guardar» sigue como estaba

#### Scenario: Sin diálogo
- **WHEN** se quita la fila de una clase con 0 alumnos y 0 asignaciones, o una fila añadida en esta edición
- **THEN** la fila desaparece sin diálogo

#### Scenario: Nombre editado o vacío
- **GIVEN** que la fila de «A» se ha renombrado a «Grupo A», o se ha vaciado
- **WHEN** se pulsa su «Quitar»
- **THEN** el diálogo dice «¿Quitar la clase Grupo A?», o «¿Quitar la clase 1?» con el nombre vacío

#### Scenario: Accesibilidad
- **WHEN** el diálogo está abierto
- **THEN** `axe` no encuentra violaciones y el diálogo se anuncia por su título
