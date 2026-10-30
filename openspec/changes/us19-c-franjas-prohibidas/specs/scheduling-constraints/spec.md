## ADDED Requirements

### Requirement: Celdas de las reglas de franjas
La migración `add_scheduling_constraint_slots` MUST crear `scheduling_constraint_slots` con:
- `constraint_id`: clave ajena a `scheduling_constraints(id)` con `ON DELETE CASCADE`.
- `day_of_week` y `session_number`: `SMALLINT`.
- `created_at`.
- Clave primaria `(constraint_id, day_of_week, session_number)`.

Los `CHECK`, escritos a mano y con nombre fijo:
- `scheduling_constraint_slots_day_of_week_check`: de 1 a 5.
- `scheduling_constraint_slots_session_number_check`: de 1 a 8, el máximo de sesiones de un calendario (US-BASE).

Una regla `FORBIDDEN_SLOTS` MUST existir solo mientras tenga alguna celda. Sus celdas MUST caer con ella, y con ella al dejar de impartirse la asignatura en el curso, al borrar la asignatura o al borrar el curso. `session_number` MUST ser el orden de la sesión entre las sesiones de la jornada, no su hora. `MODELO_DATOS.md` MUST describir la tabla, sus `CHECK` y la cascada.

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

## MODIFIED Requirements

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
