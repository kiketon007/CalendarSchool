## MODIFIED Requirements

### Requirement: Contenido de un horario exportado
`utils/scheduleExport.ts` (pura, sin React) MUST construir el documento a partir de `classView` y `professorView`, con el mismo contenido que se ve en pantalla. Cada horario MUST llevar su título («Horario de 1º Primaria A» o «Horario de García, Ana»), «Borrador generado el …» en un borrador o «Horario oficial confirmado el …» en un oficial, que en un oficial sustituido sigue con «· sustituido el …» («Horario oficial confirmado el … · sustituido el …», US-ALGO-CONFIRM_b) (fecha y hora con `Intl.DateTimeFormat` en el idioma de la interfaz) y «N sesiones a la semana», y una tabla por calendario: una para una clase; una por cada calendario en el que da clase un profesor, con el nombre del calendario. Cada tabla MUST tener una columna «Sesión» y los cinco días con su nombre completo, una fila por sesión («Sesión 1 (09:00–09:45)») y los recreos como fila («Recreo 10:30–11:00») con las celdas vacías. Cada celda con sesión MUST llevar la asignatura (con su código entre paréntesis si lo tiene) y, por clase, el profesor («García, Ana» o «Sin profesor»); por profesor, la clase («1º Primaria · A»). Una franja sin sesión MUST decir «Libre». Los desfases MUST exportarse tal cual, sin aviso: las sesiones fuera del calendario actual se listan bajo la tabla con «Sesiones fuera del calendario actual», y un curso sin calendario dice «Este curso ya no tiene calendario» con sus sesiones listadas por día y las horas guardadas. Con «todos», el documento MUST llevar un título general («Horarios de las clases» o «Horarios de los profesores»), esa fecha una vez y un apartado por clase (orden de cursos y clases) o por profesor (por apellidos y nombre); las entradas sin profesor MUST NOT aparecer en ningún profesor. El documento MUST estar en el idioma de la interfaz.

#### Scenario: Una clase
- **GIVEN** 1º Primaria A con 30 sesiones en un calendario de 6 sesiones y un recreo
- **WHEN** exporto su horario
- **THEN** el documento tiene «Horario de 1º Primaria A», la fecha de generación, «30 sesiones a la semana» y una tabla con la columna «Sesión», los cinco días, 6 filas de sesión, la fila del recreo y 30 celdas con asignatura y profesor

#### Scenario: Huecos libres
- **GIVEN** una clase con 25 sesiones para 30 franjas
- **WHEN** exporto su horario
- **THEN** 5 celdas dicen «Libre»

#### Scenario: Profesor con dos calendarios
- **GIVEN** Luis, con clase en 4º («Primaria») y en 5º («Tercer ciclo»)
- **WHEN** exporto su horario
- **THEN** el documento tiene dos tablas, cada una con el nombre de su calendario, y en cada celda la asignatura y la clase

#### Scenario: Todos los profesores
- **GIVEN** un borrador con 8 profesores
- **WHEN** exporto «Todos los profesores»
- **THEN** el documento tiene «Horarios de los profesores», la fecha una vez y 8 apartados en orden de apellidos

#### Scenario: Desfases tal cual
- **GIVEN** un profesor borrado tras generar, un curso sin calendario y una sesión fuera del calendario actual
- **WHEN** exporto «Todas las clases»
- **THEN** leo «Sin profesor» en esas celdas, «Este curso ya no tiene calendario» con sus sesiones por día y «Sesiones fuera del calendario actual» con la sesión

#### Scenario: El documento del oficial
- **GIVEN** el horario oficial confirmado el 5 de noviembre
- **WHEN** lo exporto desde `/horarios/oficial`
- **THEN** el documento dice «Horario oficial confirmado el …» con esa fecha, no «Borrador generado el …», y el nombre del fichero es el mismo que el de un borrador

#### Scenario: El documento de un oficial sustituido
- **GIVEN** un oficial confirmado el 3 de noviembre y sustituido el 5 de noviembre
- **WHEN** lo exporto desde `/horarios/anteriores/:id`
- **THEN** el documento dice «Horario oficial confirmado el … · sustituido el …» con las dos fechas, y el nombre del fichero es el mismo que el de un borrador
