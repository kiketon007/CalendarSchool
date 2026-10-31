## MODIFIED Requirements

### Requirement: Eventos de log de las franjas
Un `PUT` que cambia algo MUST registrar `SUBJECT_SLOTS_UPDATED` con `school_id`, `actor_id`, `course_id`, `subject_id`, `type` y `slot_count`. `type` es `FORBIDDEN_SLOTS` o `PREFERRED_SLOTS`, según la ruta.

Un rechazo por la pareja o por el calendario MUST registrar `SUBJECT_SLOTS_UPDATE_REJECTED` con los mismos identificadores, `type` y `reason` (`not_found` o `no_calendar`).

Ningún evento MUST llevar nombres, códigos ni celdas.

#### Scenario: Log sin nombres
- **WHEN** se guardan franjas, se repite el mismo `PUT` y se intenta guardar en un curso sin calendario
- **THEN** el log tiene:
  - un solo `SUBJECT_SLOTS_UPDATED`, con `slot_count`;
  - un `SUBJECT_SLOTS_UPDATE_REJECTED`, con `reason: no_calendar`;
  - el `type` de la ruta en los dos;
  - ningún nombre de asignatura, de curso ni de colegio.

#### Scenario: Tipo de las preferidas
- **WHEN** se guardan franjas preferidas
- **THEN** `SUBJECT_SLOTS_UPDATED` lleva `type: PREFERRED_SLOTS`

### Requirement: Cuadrícula de franjas reutilizable
`components/SlotGrid.tsx` MUST pintar una tabla con:
- **`caption`:** el que reciba.
- **Columnas:** una cabecera por día de lunes a viernes.
- **Filas:** una por periodo, en el orden de la jornada:
  - Cada sesión es una fila con su cabecera («Sesión {n}» y sus horas) y una celda por día.
  - Cada recreo es una fila de separación no interactiva («Recreo {inicio}–{fin}»).

Si es editable:
- Cada celda MUST ser un botón con `aria-pressed` y el nombre «{día}, sesión {n} ({inicio}–{fin})».
- Las cabeceras de día y de sesión MUST ser botones que marcan toda la columna o la fila si alguna celda falta, y la desmarcan si ya estaba entera.
- Lo marcado MUST distinguirse por un icono y un texto oculto, no solo por el color.

Sin edición, las celdas MUST ser texto («Prohibida» o vacía).

La cuadrícula MUST tener dos modos:
- **`forbidden`:** es el modo por defecto, y su comportamiento no cambia.
- **`preferred`:** recibe además las celdas bloqueadas (las prohibidas).

En el modo `preferred`:
- **Preferida:** se marca con un icono distinto del aspa y el texto oculto «Preferida».
- **Bloqueada y no preferida:** se ve con el aspa y «Prohibida». Si es editable, su botón MUST estar deshabilitado y llevar «Prohibida» en su nombre accesible.
- **Bloqueada y preferida:** se ve con un icono de aviso y «Preferida · prohibida, se ignora». Si es editable, MUST poder desmarcarse.
- **Cabeceras:** MUST actuar solo sobre las celdas no bloqueadas de su columna o su fila.
- **Sin edición:** los tres estados MUST verse como texto.

#### Scenario: Cabeceras que marcan y desmarcan
- **GIVEN** la cuadrícula editable de 6 sesiones sin nada marcado
- **WHEN** se pulsa «Lunes», después la cabecera de la sesión 1, y otra vez «Lunes»
- **THEN** primero se marcan las 6 celdas del lunes, y después la sesión 1 de los cinco días
- **AND** al final se desmarcan las 6 del lunes, y quedan 4 celdas: la sesión 1 de martes a viernes

#### Scenario: Recreo no interactivo
- **GIVEN** un calendario con el recreo tras la 3ª sesión
- **THEN** la fila del recreo dice «Recreo» con sus horas y no tiene botones

#### Scenario: Modo preferidas con celdas bloqueadas
- **GIVEN** la cuadrícula editable en modo `preferred`, con el lunes entero bloqueado y el martes 2ª marcado y bloqueado
- **WHEN** se pulsa la cabecera «Lunes», la del «Martes» y la celda del martes 2ª
- **THEN** se cumple todo lo siguiente:
  - «Lunes» no cambia nada;
  - «Martes» marca las 5 celdas libres del martes;
  - la celda del martes 2ª se desmarca;
  - las celdas del lunes siguen deshabilitadas, con «Prohibida» en su nombre.

### Requirement: Página de franjas prohibidas
`/cursos/:courseId/carga/:subjectId/prohibidas` MUST servir `pages/SubjectSlotsPage.tsx` con el tipo `FORBIDDEN_SLOTS`. La página MUST colgar de `AuthenticatedLayout` sin `RequireRole`. MUST pedir la regla una sola vez, aunque `StrictMode` ejecute los efectos dos veces, y mostrar:
- **Mientras carga:** un `role="status"`.
- **Si falla:** un aviso con «Reintentar».
- **Con la regla:** el título «Franjas prohibidas de {asignatura} en {curso}» y la cuadrícula, con el `caption` del mismo texto.
- **Con celdas fuera del calendario:** «Hay {n} franjas fuera del calendario actual; se quitarán al guardar».
- **Avisos:** los de la asignatura, recalculados al marcar o desmarcar con la misma regla que el backend.
- **Enlace:** «Volver a la carga», hacia `/cursos/:courseId/carga`.

Para el `ADMIN`, «Guardar» MUST estar deshabilitado sin cambios (las celdas fuera del calendario cuentan como cambio) y llevar una guarda síncrona contra el doble envío. Al guardar:
- **`200`:** MUST mostrar «Franjas prohibidas guardadas» en un `role="status"` y seguir en la página con lo que respondió el servidor.
- **`404`, al cargar o al guardar:** MUST mostrar «Esta asignatura ya no se imparte en este curso o no existe», con el enlace a la carga.
- **`409`:** MUST mostrar «Este curso ya no tiene calendario».
- **`400` con `OUT_OF_RANGE`:** MUST volver a pedir la regla y avisar de que el calendario ha cambiado.
- **`403` y cualquier otro fallo:** MUST mostrar un aviso conservando lo marcado.

Los avisos de la página MUST verse en el color de peligro (rojo), con su texto:
- los de la asignatura;
- el de las celdas fuera del calendario;
- el de que el calendario ha cambiado;
- el de que el curso ya no tiene calendario.

El `MEMBER` MUST ver la cuadrícula sin botones y «Solo los administradores pueden modificar las franjas». Los textos MUST estar en `es.json` y `en.json`.

#### Scenario: Marcar, avisar y guardar
- **GIVEN** «Inglés» con 3 sesiones, sin máximo, en un curso con calendario
- **WHEN** el `ADMIN` marca lunes, martes y miércoles enteros
- **THEN** ve «No cabe en la semana con sus reglas» antes de guardar, y «Guardar» se habilita
- **AND** al guardar se envía un único `PUT` con todas las celdas marcadas, y ve «Franjas prohibidas guardadas»

#### Scenario: Bloques y recreo
- **GIVEN** «Plástica» con 2 sesiones en bloques de 2 y un calendario de 6 sesiones con el recreo entre la 3ª y la 4ª
- **WHEN** se prohíben todas las sesiones de los cinco días salvo la 3ª y la 4ª
- **THEN** ve que no cabe: ningún día tiene dos sesiones libres seguidas sin recreo

#### Scenario: Vista del miembro
- **GIVEN** un `MEMBER` y «Religión» con franjas
- **THEN** ve la cuadrícula con las celdas prohibidas como texto, ningún botón ni «Guardar», y el texto de solo administradores

#### Scenario: Accesibilidad
- **WHEN** se ejecuta `axe` sobre la página con celdas marcadas, un recreo y avisos, para los dos roles
- **THEN** no hay violaciones de WCAG 2.1 AA
