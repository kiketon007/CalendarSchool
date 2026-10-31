## ADDED Requirements

### Requirement: Franjas preferidas en la carga de un curso
`GET` y `PATCH /api/courses/{id}/workload` MUST devolver en cada asignatura `preferredSlotCount`: el número de celdas de su regla `PREFERRED_SLOTS` que existen en el calendario actual. Es 0 si la asignatura no se imparte, no tiene regla o el curso no tiene calendario.

`CourseWorkloadSubject` MUST NOT exponer la lista de celdas preferidas.

Los avisos de cada asignatura que se imparte MUST incluir:
- **`PREFERRED_SLOTS_FORBIDDEN`:** con el número de preferidas dentro del calendario que también son prohibidas.
- **`SLOTS_OUTSIDE_CALENDAR`:** con la **suma** de las celdas fuera del calendario de las dos reglas de franjas.

El `PATCH` MUST NOT tocar las celdas. Si quita la asignatura del curso, la regla de preferidas cae por la cascada y cuenta como una regla en `constraints_removed`.

#### Scenario: Recuento y contradicción en la lectura
- **GIVEN** 1º con un calendario de 6 sesiones, y «Religión» con el lunes entero prohibido y como preferidas el lunes 1ª y el martes 1ª
- **WHEN** se pide la carga de 1º
- **THEN** «Religión» tiene:
  - `preferredSlotCount: 2`;
  - un aviso `PREFERRED_SLOTS_FORBIDDEN` con `count: 1`;
  - un `constraintCount` que cuenta las dos reglas de franjas.

#### Scenario: Celdas fuera del calendario de las dos reglas
- **GIVEN** «Religión» con la sesión 6 prohibida el lunes y preferida el martes y el miércoles, y el calendario pasa a 5 sesiones
- **WHEN** se pide la carga
- **THEN** «Religión» tiene `SLOTS_OUTSIDE_CALENDAR` con `count: 3` y `preferredSlotCount: 0`

#### Scenario: Quitar la asignatura se lleva las preferidas
- **GIVEN** «Religión» con preferidas en 1º y sin otras reglas
- **WHEN** se envía `sessionsPerWeek: null` para «Religión» en la carga de 1º
- **THEN** no queda ninguna celda de «Religión» en 1º, y `constraints_removed` cuenta 1

### Requirement: Enlace a las franjas preferidas desde la carga
Con calendario, cada asignatura que se imparte MUST llevar, junto a «Franjas prohibidas», el enlace «Franjas preferidas» hacia `/cursos/:courseId/carga/:subjectId/preferidas`:
- **Matriz del `ADMIN`:** en su fila.
- **Vista del `MEMBER`:** en su elemento de la lista.

El texto del enlace MUST llevar `preferredSlotCount` si es mayor que 0 («Franjas preferidas (10)»). Su `aria-label` MUST ser «Franjas preferidas de {asignatura}», que contiene el texto visible.

Sin calendario, el enlace MUST NOT aparecer.

Mientras se editan las sesiones y las reglas, la matriz MUST conservar los avisos `PREFERRED_SLOTS_FORBIDDEN` y `SLOTS_OUTSIDE_CALENDAR` que dio el servidor. Si la asignatura pasa a «No se imparte», MUST quitarlos.

#### Scenario: Enlace con el número de celdas
- **GIVEN** 1º con calendario, «Matemáticas» con 10 celdas preferidas e «Inglés» sin preferidas
- **WHEN** el `ADMIN` o un `MEMBER` abre la carga de 1º
- **THEN** se cumple todo lo siguiente:
  - «Matemáticas» muestra «Franjas preferidas (10)»;
  - «Inglés» muestra «Franjas preferidas»;
  - el enlace de «Matemáticas» lleva a sus preferidas.

#### Scenario: El aviso de contradicción se conserva al editar
- **GIVEN** «Religión» con `PREFERRED_SLOTS_FORBIDDEN` en la carga
- **WHEN** el `ADMIN` cambia sus sesiones en la matriz sin guardar
- **THEN** el aviso sigue en su fila
- **WHEN** la marca como «No se imparte»
- **THEN** el aviso desaparece

## MODIFIED Requirements

### Requirement: Los avisos de problemas se ven en rojo
Los avisos de la carga que señalan un posible problema MUST verse en el color de peligro (rojo), con su texto: el color nunca es la única pista. Son:
- **Los avisos de cada asignatura:** `BLOCK_LARGER_THAN_LOAD`, `SUBJECT_DOES_NOT_FIT`, `SLOTS_OUTSIDE_CALENDAR` y `PREFERRED_SLOTS_FORBIDDEN`. Se ven en la matriz del `ADMIN`, en la vista del `MEMBER` y en las páginas de franjas.
- **El aviso del curso sin calendario:** `COURSE_WITHOUT_CALENDAR`, como ya lo era el de la carga que supera las sesiones.
- **Los avisos de las páginas de franjas:** las celdas fuera del calendario, que el calendario ha cambiado y que el curso ya no tiene calendario.

Los avisos MUST seguir sin impedir guardar. Los textos y las regiones `role="status"` no cambian.

`PREFERRED_SLOTS_FORBIDDEN` MUST decir «{n} franjas preferidas están prohibidas y se ignorarán», en singular con una.

#### Scenario: El aviso de que no cabe se ve en rojo
- **GIVEN** «Inglés» con 3 sesiones y tres días enteros prohibidos
- **WHEN** el `ADMIN` lo ve en la matriz, el `MEMBER` en la lista, o cualquiera en la página de franjas
- **THEN** «No cabe en la semana con sus reglas» se pinta con el color de peligro, y sigue siendo posible guardar

#### Scenario: Un curso sin calendario avisa en rojo
- **GIVEN** un curso sin calendario
- **THEN** el aviso «Este curso no tiene calendario base…» se pinta como un aviso de peligro, con su enlace a los calendarios

#### Scenario: La contradicción se ve en rojo
- **GIVEN** «Religión» con una preferida prohibida
- **WHEN** se ve en la matriz, en la lista del `MEMBER` o en su página de preferidas
- **THEN** «1 franja preferida está prohibida y se ignorará» se pinta con el color de peligro
