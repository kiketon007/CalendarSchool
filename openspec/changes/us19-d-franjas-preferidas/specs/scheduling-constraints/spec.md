## MODIFIED Requirements

### Requirement: Celdas de las reglas de franjas
La migración `add_scheduling_constraint_slots` MUST crear `scheduling_constraint_slots` con:
- `constraint_id`: clave ajena a `scheduling_constraints(id)` con `ON DELETE CASCADE`.
- `day_of_week` y `session_number`: `SMALLINT`.
- `created_at`.
- Clave primaria `(constraint_id, day_of_week, session_number)`.

Los `CHECK`, escritos a mano y con nombre fijo:
- `scheduling_constraint_slots_day_of_week_check`: de 1 a 5.
- `scheduling_constraint_slots_session_number_check`: de 1 a 8, el máximo de sesiones de un calendario (US-BASE).

La tabla MUST guardar las celdas de las dos reglas de franjas, `FORBIDDEN_SLOTS` y `PREFERRED_SLOTS`, sin cambios de esquema.

Cada una de esas reglas MUST existir solo mientras tenga alguna celda, y una pareja MUST poder tener las dos a la vez. Sus celdas MUST caer:
- con la regla;
- con la regla, cuando la asignatura deja de impartirse en el curso;
- al borrar la asignatura;
- al borrar el curso.

`session_number` MUST ser el orden de la sesión entre las sesiones de la jornada, no su hora. `MODELO_DATOS.md` MUST describir la tabla, sus `CHECK`, la cascada y los dos tipos que la usan.

#### Scenario: Restricciones del esquema
- **GIVEN** la base de datos migrada
- **WHEN** un test de esquema consulta `pg_constraint`
- **THEN** encuentra los dos `CHECK` por su nombre, la clave primaria de tres columnas y la clave ajena a `scheduling_constraints` con `ON DELETE CASCADE`

#### Scenario: Valores que la base de datos rechaza
- **WHEN** se intenta insertar directamente una celda con día 0 o 6, con sesión 0 o 9, una celda repetida o una celda de una regla que no existe
- **THEN** la base de datos rechaza cada inserción

#### Scenario: Cascadas
- **GIVEN** «Religión» con una regla de franjas de 4 celdas en 1º
- **WHEN** se borra la regla, se quita 1º de la asignatura desde su edición o desde la carga, se borra la asignatura o se borra el curso
- **THEN** no queda ninguna celda de esa regla, y las de otras parejas siguen

#### Scenario: Las dos reglas de franjas en la misma pareja
- **GIVEN** «Religión» en 1º con una regla `FORBIDDEN_SLOTS` y otra `PREFERRED_SLOTS` que comparten una celda
- **WHEN** se borra la asignatura
- **THEN** no queda ninguna celda de ninguna de las dos reglas
