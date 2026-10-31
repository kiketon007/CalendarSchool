# scheduling-constraints Specification

## Purpose
Reglas de reparto de una asignatura en un curso (US19_b): la tabla `scheduling_constraints`, su cascada desde la pareja asignatura-curso, el significado del máximo por día y de los bloques y los avisos por asignatura. Las franjas prohibidas y preferidas las añadirán US19_c y US19_d.
## Requirements
### Requirement: Tabla de las reglas de reparto
La migración `add_scheduling_constraints` MUST crear el enum `ConstraintType` (`MAX_PER_DAY`, `BLOCK`, `FORBIDDEN_SLOTS`, `PREFERRED_SLOTS`) y la tabla `scheduling_constraints`, con estas columnas:
- `id`: UUIDv7 generado por la aplicación.
- `school_id`: clave ajena a `schools`.
- `subject_id` y `course_id`.
- `type`.
- `max_per_day` y `block_size`: `SMALLINT`, nulos.
- `created_at` y `updated_at`.

Además MUST tener:
- Un índice único en `(subject_id, course_id, type)`.
- Índices en `course_id` y en `school_id`.
- La **clave ajena compuesta** `(subject_id, course_id)` → `subject_courses (subject_id, course_id)` con `ON DELETE CASCADE`.

Los `CHECK`, escritos a mano y con nombre fijo:
- `scheduling_constraints_max_per_day_check`: una fila `MAX_PER_DAY` exige `max_per_day` de 2 a 5 y `block_size` nulo.
- `scheduling_constraints_block_check`: una fila `BLOCK` exige `block_size` de 2 a 3 y `max_per_day` nulo.
- `scheduling_constraints_slots_check`: las filas `FORBIDDEN_SLOTS` y `PREFERRED_SLOTS` exigen las dos columnas nulas.

Esta historia MUST NOT escribir filas `FORBIDDEN_SLOTS` ni `PREFERRED_SLOTS`. `MODELO_DATOS.md` MUST describir la tabla, sus `CHECK`, la cascada desde `subject_courses` y por qué la edición de asignaturas aplica diferencias.

#### Scenario: Restricciones del esquema
- **GIVEN** la base de datos migrada
- **WHEN** un test de esquema consulta `pg_constraint`
- **THEN** encuentra los tres `CHECK` por su nombre, el índice único `(subject_id, course_id, type)` y la clave ajena compuesta a `subject_courses` con `ON DELETE CASCADE`

#### Scenario: Valores que la base de datos rechaza
- **WHEN** se intenta insertar directamente una fila `MAX_PER_DAY` con `max_per_day` 1 o 6, una `MAX_PER_DAY` con `block_size`, una `BLOCK` con `block_size` 4, una segunda fila del mismo tipo para la misma pareja, o una regla de una asignatura en un curso donde no se imparte
- **THEN** la base de datos rechaza cada inserción

### Requirement: Una regla cuelga de su pareja asignatura-curso
Una regla de reparto MUST existir solo mientras exista la fila de `subject_courses` de su asignatura y su curso. La base de datos MUST borrarla sola, por la cascada, en estos casos:
- La asignatura deja de impartirse en el curso, desde la edición de la asignatura o desde la carga del curso.
- Se borra la asignatura.
- Se borra el curso.

Ninguna operación MUST dejar una regla sin su pareja.

#### Scenario: Quitar el curso desde la asignatura
- **GIVEN** «Inglés» con «Máximo al día: 2» y «Bloques: De 2» en 1º
- **WHEN** se edita «Inglés» y se quita 1º
- **THEN** no queda ninguna regla de «Inglés» en 1º

#### Scenario: Quitar desde la carga del curso
- **GIVEN** lo mismo
- **WHEN** se envía `sessionsPerWeek: null` para «Inglés» en la carga de 1º
- **THEN** no queda ninguna regla de «Inglés» en 1º

#### Scenario: Borrar la asignatura o el curso
- **WHEN** se borra «Inglés», o se borra 1º
- **THEN** no queda ninguna regla de «Inglés», o ninguna de 1º, y las reglas de otras parejas siguen

### Requirement: Significado del máximo por día y de los bloques
Sin reglas, una asignatura MUST entenderse como «como mucho una sesión al día». Es el valor por defecto de HC3, y `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` MUST anotarlo.

`MAX_PER_DAY` (de 2 a 5) MUST subir ese máximo para las sesiones sueltas.

`BLOCK` (2 o 3) MUST pedir bloques de esas sesiones seguidas:
- **Reparto de la carga:** la carga se reparte en `⌊carga / bloque⌋` bloques y el resto va en sesiones sueltas (3 sesiones en bloques de 2 son un bloque y una suelta; 4, dos bloques).
- **Bloque y máximo:** un día con un bloque lleva esas sesiones seguidas aunque el máximo diga menos, y ninguna sesión suelta de esa asignatura.
- **Recreo:** dos sesiones son seguidas si no hay ningún recreo entre ellas en el calendario del curso, así que el recreo siempre corta un bloque.

#### Scenario: Bloques y el resto suelto
- **GIVEN** «Plástica» con 3 sesiones en 1º y «Bloques: De 2»
- **THEN** su reparto esperado es un bloque de 2 y una sesión suelta, en días distintos

#### Scenario: El bloque manda sobre el máximo
- **GIVEN** «Educación Física» con 4 sesiones en bloques de 2 y sin «Máximo al día»
- **THEN** se esperan dos días con un bloque de 2, aunque sin regla el máximo es una sesión al día

### Requirement: Avisos de las reglas de una asignatura
Los avisos de cada asignatura que se imparte en el curso MUST calcularse al leer, con:
- La carga `L`, el máximo `m` (1 sin regla) y el bloque `k`.
- Con calendario, sus tramos de sesiones seguidas entre recreos (`sessionGroups`). Las sesiones se numeran seguidas a través de los tramos.
- Las franjas prohibidas dentro del calendario.

Para cada día `d`, `libres_d` MUST ser las sesiones no prohibidas ese día, `sueltas_d = min(m, |libres_d|)`, y `bloque_d` MUST ser cierto si `libres_d` contiene `k` sesiones seguidas de un mismo tramo.

Los avisos MUST ser:
- **`BLOCK_LARGER_THAN_LOAD`:** MUST darse si hay bloque y `L < k`, con calendario o sin él.
- **`SUBJECT_DOES_NOT_FIT`:** MUST darse solo con calendario y sin el aviso anterior, si no existe un conjunto `B` de `b` días con `bloque_d` tal que `Σ_{d ∉ B} sueltas_d ≥ r`, con `b = ⌊L / k⌋` y `r = L mod k` (sin bloque, `b = 0` y `r = L`). Un día lleva como mucho un bloque y, si lo lleva, ninguna sesión suelta. Un día con todas sus sesiones prohibidas no lleva ninguna.
- **`SLOTS_OUTSIDE_CALENDAR`:** con `count`, MUST darse si la regla de franjas tiene celdas que no existen en el calendario actual (sin calendario, todas). Va después del aviso anterior.

Los avisos MUST NOT guardarse ni impedir guardar. Es una comprobación de cada asignatura por separado: MUST NOT presentarse como garantía de que el horario completo exista.

El backend (`domain/workload/workloadWarnings.ts`) y el frontend (`utils/courseWorkloadDraft.ts`) MUST implementar la misma regla, y sus tests MUST recorrer la misma tabla de casos, `test-fixtures/subject-warnings.json`.

#### Scenario: Bloque mayor que la carga
- **GIVEN** «Plástica» con 1 sesión y bloques de 2, o con 2 sesiones y bloques de 3
- **THEN** tiene `BLOCK_LARGER_THAN_LOAD` y no `SUBJECT_DOES_NOT_FIT`

#### Scenario: El tramo sin recreo es corto
- **GIVEN** un calendario de 2 sesiones sin recreo entre ellas y «Educación Física» con 3 sesiones en bloques de 3
- **THEN** tiene `SUBJECT_DOES_NOT_FIT`

#### Scenario: El recreo corta el bloque
- **GIVEN** un calendario de 3 sesiones con el recreo entre la 1ª y la 2ª
- **THEN** una asignatura con 3 sesiones en bloques de 3 tiene `SUBJECT_DOES_NOT_FIT`, y una con 4 sesiones en bloques de 2 no tiene avisos

#### Scenario: Cabe con bloques y sueltas
- **GIVEN** un calendario de 2 sesiones seguidas y «Educación Física» con 5 sesiones en bloques de 2
- **THEN** no tiene avisos: son dos bloques y una suelta en tres días

#### Scenario: Sin calendario
- **GIVEN** un curso sin calendario y «Plástica» con 1 sesión en bloques de 2 y «Lengua» con 3 en bloques de 3
- **THEN** «Plástica» tiene `BLOCK_LARGER_THAN_LOAD` y «Lengua» no tiene avisos

#### Scenario: Días que no alcanzan
- **GIVEN** la función pura con `L = 6`, sin bloque, `m = 1` y un tramo de 6 sesiones
- **THEN** devuelve `SUBJECT_DOES_NOT_FIT` (seis sesiones sueltas necesitan seis días)

#### Scenario: Días enteros prohibidos
- **GIVEN** «Inglés» con 3 sesiones, sin máximo, y lunes, martes y miércoles enteros prohibidos
- **THEN** tiene `SUBJECT_DOES_NOT_FIT`; con solo dos días prohibidos, no

#### Scenario: Las franjas rompen los bloques
- **GIVEN** «Plástica» con 2 sesiones en bloques de 2 y un calendario de 6 sesiones en dos tramos de 3, con todas las sesiones prohibidas salvo la 3ª y la 4ª
- **THEN** tiene `SUBJECT_DOES_NOT_FIT`; si además queda libre la 2ª sesión del lunes, no

#### Scenario: Los bloques van a los días que pueden llevarlos
- **GIVEN** «Educación Física» con 5 sesiones en bloques de 2, sin máximo, un tramo de 6 sesiones y lunes, martes y miércoles enteros prohibidos
- **THEN** tiene `SUBJECT_DOES_NOT_FIT`: los dos bloques ocupan el jueves y el viernes y la sesión suelta no tiene día; con la 1ª sesión del lunes libre, cabe

#### Scenario: Un día con una sola sesión libre lleva una suelta, no un bloque
- **GIVEN** «Educación Física» con 4 sesiones en bloques de 2, un tramo de 6 sesiones, jueves y viernes enteros prohibidos y, de lunes a miércoles, todo prohibido salvo la 1ª sesión del lunes y las sesiones 1 y 2 del martes y del miércoles
- **THEN** no tiene avisos: los bloques van al martes y al miércoles; con la 2ª sesión del martes prohibida, tiene `SUBJECT_DOES_NOT_FIT`

#### Scenario: Celdas fuera del calendario
- **GIVEN** una regla con 5 celdas en la sesión 6 y un calendario de 5 sesiones
- **THEN** tiene `SLOTS_OUTSIDE_CALENDAR` con `count: 5`, y esas celdas no cuentan para `SUBJECT_DOES_NOT_FIT`

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

