## ADDED Requirements

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
`workloadWarnings` MUST calcular, al leer y por cada asignatura que se imparte en el curso, sus avisos, con la carga `L`, el máximo `m` (1 sin regla), el bloque `k` y, con calendario, las sesiones al día `S` y `maxConsecutiveSessions` (el tramo más largo de sesiones seguidas sin recreo):
- **`BLOCK_LARGER_THAN_LOAD`:** MUST darse si hay bloque y `L < k`, con calendario o sin él.
- **`SUBJECT_DOES_NOT_FIT`:** MUST darse solo con calendario y sin el aviso anterior, si se cumple alguna de estas dos condiciones, con `b = ⌊L / k⌋` y `r = L mod k` (sin bloque, `b = 0` y `r = L`):
  - `b > 0` y `maxConsecutiveSessions < k`.
  - `b + ⌈r / min(m, S)⌉ > 5`.

Los avisos MUST NOT guardarse ni impedir guardar. Es una comprobación de cada asignatura por separado: MUST NOT presentarse como garantía de que el horario completo exista.

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
- **GIVEN** la función pura con `L = 6`, sin bloque, `m = 1` y `S = 6`
- **THEN** devuelve `SUBJECT_DOES_NOT_FIT` (seis sesiones sueltas necesitan seis días)
