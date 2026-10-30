# course-workload Specification

## Purpose
Carga horaria de un curso (US19) y sus reglas de reparto (US19_b): ver el balance frente al calendario, ajustar las sesiones, el máximo por día y los bloques de cada asignatura con una sola petición, y los avisos, que nunca impiden guardar.
## Requirements
### Requirement: Contrato de la carga horaria en OpenAPI
`docs/api-spec.yml` MUST documentar `GET /api/courses/{id}/workload` (`getCourseWorkload`) y `PATCH /api/courses/{id}/workload` (`updateCourseWorkload`), con seguridad Bearer, y estos esquemas:
- **`WorkloadWarningCode`:** `COURSE_WITHOUT_CALENDAR` y `WORKLOAD_EXCEEDS_SLOTS` para el curso; `BLOCK_LARGER_THAN_LOAD` y `SUBJECT_DOES_NOT_FIT` para una asignatura. La descripción MUST decir qué códigos van en cada lista.
- **`WorkloadWarning`:** `code` obligatorio; `assigned` y `available`, enteros presentes en `WORKLOAD_EXCEEDS_SLOTS`.
- **`CourseWorkloadSubject`:**
  - `id`, `name`, `code` (texto o `null`), `color` y `status`.
  - `sessionsPerWeek`: entero de 1 a 5 o `null`.
  - `maxPerDay`: entero de 2 a 5 o `null`.
  - `blockSize`: entero de 2 a 3 o `null`.
  - `constraintCount`: entero no negativo.
  - `warnings`: lista de `WorkloadWarning`.
- **`CourseWorkload`:**
  - `course`: con `id` y `name`.
  - `calendar`: `{ id, name, sessionsPerDay, maxConsecutiveSessions }` o `null`.
  - `subjects`: lista de `CourseWorkloadSubject`.
  - `assignedSessions`.
  - `availableSessions`: entero o `null`.
  - `warnings`: lista de `WorkloadWarning`.
- **`CourseWorkloadResponse`:** `{ workload: CourseWorkload }`.
- **`UpdateCourseWorkloadRequest`:** `changes` obligatorio, de 1 a 200 elementos `{ subjectId, sessionsPerWeek, maxPerDay, blockSize }`, los cuatro obligatorios y sin más propiedades. `sessionsPerWeek` es un entero de 1 a 5 o `null`; `maxPerDay`, de 2 a 5 o `null`; `blockSize`, de 2 a 3 o `null`.

Respuestas que MUST declarar cada operación:
- **`GET`:** `200` (`CourseWorkloadResponse`, `no-store`), `401`, `404`, `500` y `503`.
- **`PATCH`:** `200` (`CourseWorkloadResponse`, `no-store`), `400`, `401`, `403`, `404`, `500` y `503`.

El `404` MUST usar la respuesta reutilizable `CourseNotFound`. La descripción del `PATCH` MUST decir que es solo para `ADMIN`, que solo lleva las filas que cambian, que cada fila lleva su estado final y que un `null` en una regla la borra. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `getCourseWorkload` y `updateCourseWorkload`
- **THEN** las dos exigen Bearer y declaran las respuestas indicadas, solo `updateCourseWorkload` declara `400` y `403`, y las dos declaran `404` con `CourseNotFound`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija:
  - Las dos operaciones.
  - Los esquemas `CourseWorkload` (con `maxConsecutiveSessions`), `CourseWorkloadSubject` (con `maxPerDay`, `blockSize`, `constraintCount` y `warnings`), `UpdateCourseWorkloadRequest` (con los cuatro campos), `WorkloadWarning` y `WorkloadWarningCode` (con los cuatro códigos).

### Requirement: Leer la carga de un curso con GET /api/courses/{id}/workload
`GET /api/courses/{id}/workload` MUST responder `200` con la carga del curso del colegio de la identidad: el curso (`id`, `name`), su calendario base (`id`, `name` y `sessionsPerDay`, el número de periodos de tipo sesión de su jornada) o `null` si no tiene, **todas las asignaturas del colegio** ordenadas por nombre con la comparación de textos del proyecto, cada una con `sessionsPerWeek` igual a las sesiones de su fila de `subject_courses` para ese curso o `null` si no se imparte en él, `assignedSessions` (la suma de las sesiones de las asignaturas que se imparten), `availableSessions` (`sessionsPerDay × 5`, o `null` sin calendario) y los avisos del curso. Las asignaturas inactivas MUST aparecer con su estado. Un `id` que no es UUID, un curso inexistente o de otro colegio MUST responder `404 NOT_FOUND`, sin distinguir el caso. MUST NOT cambiar nada.

#### Scenario: Curso con calendario
- **GIVEN** «1º Primaria» con un calendario de 6 sesiones, «Inglés» con 3 sesiones y «Lengua» con 5 en ese curso, y «Música» sin impartirse en él
- **WHEN** un usuario del colegio pide su carga
- **THEN** la respuesta es `200` con las tres asignaturas por nombre («Inglés» 3, «Lengua» 5, «Música» `null`), `assignedSessions: 8`, `availableSessions: 30`, `warnings: []` y `Cache-Control: no-store`

#### Scenario: Curso sin calendario
- **GIVEN** un curso sin calendario base
- **WHEN** se pide su carga
- **THEN** `calendar` es `null`, `availableSessions` es `null` y `warnings` contiene `COURSE_WITHOUT_CALENDAR`

#### Scenario: Colegio sin asignaturas
- **WHEN** se pide la carga de un curso de un colegio sin asignaturas
- **THEN** `subjects` es una lista vacía y `assignedSessions` es 0

#### Scenario: Curso que no existe
- **WHEN** se pide la carga con un `id` que no es UUID, de un curso inexistente o de otro colegio
- **THEN** la respuesta es `404` con `NOT_FOUND`

### Requirement: Avisos de la carga horaria
Los avisos MUST calcularse en cada lectura con una función pura del dominio (`workloadWarnings`) a partir de las sesiones asignadas y las disponibles, nunca guardarse. Sin calendario, MUST devolver `COURSE_WITHOUT_CALENDAR` y ningún otro aviso del curso. Con calendario, MUST devolver `WORKLOAD_EXCEEDS_SLOTS` con `assigned` y `available` si y solo si `assignedSessions > availableSessions`. Un aviso MUST NOT impedir guardar.

#### Scenario: En el límite
- **GIVEN** un curso con calendario de 6 sesiones y 30 sesiones asignadas
- **THEN** no hay avisos

#### Scenario: Por encima
- **GIVEN** el mismo curso con 31 sesiones asignadas
- **THEN** hay un aviso `WORKLOAD_EXCEEDS_SLOTS` con `assigned: 31` y `available: 30`

#### Scenario: El calendario cambia
- **GIVEN** un curso con 28 sesiones asignadas y un calendario de 6 sesiones
- **WHEN** el calendario se edita y pasa a 5 sesiones
- **THEN** la siguiente lectura de la carga devuelve `WORKLOAD_EXCEEDS_SLOTS` con `assigned: 28` y `available: 25`, sin que nadie haya tocado la carga

### Requirement: Cambiar la carga de un curso con PATCH /api/courses/{id}/workload
`PATCH /api/courses/{id}/workload` MUST aplicar, en el colegio de la identidad y en una única transacción, **solo los cambios recibidos**: un `sessionsPerWeek` de 1 a 5 MUST crear la fila de `subject_courses` de esa asignatura en el curso o actualizar sus sesiones; un `null` MUST borrar la fila (la asignatura deja de impartirse en el curso). Un `null` sobre una asignatura que no se imparte en el curso MUST NOT ser un error ni cambiar nada. Las filas de las asignaturas que no aparecen en `changes` MUST NOT tocarse, y las filas que se actualizan MUST conservar su `created_at`. MUST responder `200` con la carga releída (la misma forma que el `GET`) y `Cache-Control: no-store`. Si falla cualquier escritura, MUST NOT quedar ningún cambio. Una carga que no cabe en el calendario MUST guardarse igual. Una asignatura MAY quedarse sin cursos desde aquí.

#### Scenario: Subir, añadir y quitar
- **GIVEN** «1º Primaria» con «Inglés» (3) y «Lengua» (5), y «Música» sin impartirse
- **WHEN** un `ADMIN` envía `changes` con «Inglés» a 4, «Música» a 2 y «Lengua» a `null`
- **THEN** la respuesta es `200` con «Inglés» 4, «Música» 2 y «Lengua» `null`, y `GET /api/subjects` muestra que «Lengua» ya no se imparte en 1º y que «Música» sí, con 2 sesiones

#### Scenario: Las demás filas no se tocan
- **GIVEN** «1º Primaria» con «Inglés» (3) y «Lengua» (5)
- **WHEN** se envía solo «Inglés» a 4
- **THEN** «Lengua» sigue con 5 y su fila conserva su `created_at`

#### Scenario: Quitar lo que no está
- **WHEN** se envía `null` para una asignatura que no se imparte en el curso
- **THEN** la respuesta es `200` y la carga no cambia

#### Scenario: Carga que no cabe
- **GIVEN** un curso con calendario de 6 sesiones y 29 sesiones asignadas
- **WHEN** se sube una asignatura en 2 sesiones
- **THEN** la respuesta es `200`, se guarda y la carga devuelta lleva `WORKLOAD_EXCEEDS_SLOTS` con `assigned: 31`

#### Scenario: La asignatura se queda sin cursos
- **GIVEN** «Francés» que solo se imparte en 1º
- **WHEN** se envía `null` para «Francés» en la carga de 1º
- **THEN** la respuesta es `200` y «Francés» queda sin cursos

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar la escritura de la segunda fila de `subject_courses`
- **WHEN** se envían dos cambios
- **THEN** la respuesta es un error y ninguna de las dos filas ha cambiado

### Requirement: Validación del cambio de carga
El cuerpo MUST ser `{ changes: [...] }`. `changes` ausente o que no sea una lista MUST dar `REQUIRED` o `INVALID_FORMAT` en `changes`; vacía o con más de 200 elementos, `INVALID_LENGTH` en `changes`. Cada elemento MUST tener `subjectId` UUID (`REQUIRED` o `INVALID_FORMAT` en `changes[<i>].subjectId`) y `sessionsPerWeek` presente, entero de 1 a 5 o `null` (`REQUIRED`, `INVALID_FORMAT` u `OUT_OF_RANGE` en `changes[<i>].sessionsPerWeek`); una asignatura repetida MUST dar `DUPLICATE` en `changes[<i>].subjectId` desde su segunda aparición. Una asignatura inexistente o de otro colegio MUST dar `400` con `NOT_FOUND` en `changes[<i>].subjectId` sin cambiar nada. Todos los errores MUST responder `400 VALIDATION_ERROR` con la lista de campos y MUST NOT cambiar nada.

#### Scenario: Sesiones fuera de rango
- **WHEN** se envía una asignatura con `sessionsPerWeek: 0` y otra con `6`
- **THEN** la respuesta es `400` con `OUT_OF_RANGE` en `changes[0].sessionsPerWeek` y `changes[1].sessionsPerWeek`

#### Scenario: Lista vacía o repetida
- **WHEN** se envía `changes: []`, o la misma asignatura dos veces
- **THEN** la respuesta es `400` con `INVALID_LENGTH` en `changes`, o con `DUPLICATE` en `changes[1].subjectId`

#### Scenario: Asignatura que ya no existe
- **GIVEN** una asignatura que otra persona acaba de borrar
- **WHEN** se envía un cambio con ella y otro con una asignatura válida
- **THEN** la respuesta es `400` con `NOT_FOUND` en su `changes[<i>].subjectId` y la asignatura válida no ha cambiado

### Requirement: Bloqueos y concurrencia de la carga
El `PATCH` MUST bloquear, dentro de la transacción, las filas de las asignaturas de `changes` con `FOR UPDATE` **en orden de `id`** (filtradas por el colegio de la identidad) y después la fila del curso con `FOR SHARE`, antes de tocar `subject_courses`: es el mismo orden que la edición de una asignatura (asignatura y después cursos `FOR SHARE`). MUST NOT bloquear el calendario. Si falta alguna asignatura tras bloquear MUST responder `400` y, si falta el curso, `404`, sin cambiar nada. Ninguna combinación con la edición de asignaturas, el alta o el borrado de asignaturas, el borrado o la edición del curso o la edición de su calendario MUST terminar en `500` ni en interbloqueo.

#### Scenario: Dos cambios en asignaturas distintas del mismo curso
- **WHEN** dos `ADMIN` envían a la vez cambios de «Inglés» y de «Lengua» en 1º
- **THEN** las dos respuestas son `200` y se conservan los dos cambios

#### Scenario: Dos cambios en la misma asignatura
- **WHEN** dos `ADMIN` envían a la vez «Inglés» a 2 y a 4 en 1º
- **THEN** las dos respuestas son `200` y queda el valor del último en confirmarse

#### Scenario: Carga contra edición de la asignatura
- **WHEN** a la vez se cambia «Inglés» en la carga de 1º y se edita «Inglés» quitando 1º
- **THEN** las dos terminan sin `500` ni interbloqueo y el resultado es el de la última en confirmarse

#### Scenario: Carga contra borrado del curso
- **WHEN** a la vez se cambia la carga de 1º y se borra 1º
- **THEN** el borrado responde `200` y el `PATCH` responde `200` (si confirma antes) o `404`, nunca `500`

#### Scenario: Carga contra edición del calendario
- **WHEN** a la vez se cambia la carga de 1º y se edita el calendario de 1º
- **THEN** las dos responden `200`

### Requirement: Acceso a la carga horaria
`GET /api/courses/{id}/workload` MUST estar disponible para `ADMIN` y `MEMBER`. `PATCH /api/courses/{id}/workload` MUST aplicar `requireRole('ADMIN')` antes de leer el `id` y el cuerpo: un `MEMBER` MUST recibir `403 FORBIDDEN` sin cambiar nada, aunque el curso no exista o el cuerpo sea inválido, con el evento `AUTHORIZATION_DENIED` que ya existe. Sin sesión, las dos MUST responder `401`. El colegio MUST salir siempre de la identidad, nunca del cuerpo ni de la ruta.

#### Scenario: Miembro que intenta cambiar la carga
- **WHEN** un `MEMBER` envía un `PATCH` válido, uno con un `id` inexistente o uno con un cuerpo inválido
- **THEN** las tres respuestas son `403 FORBIDDEN` y la carga no cambia

#### Scenario: Miembro que lee la carga
- **WHEN** un `MEMBER` pide la carga de un curso de su colegio
- **THEN** la respuesta es `200`

#### Scenario: Sin sesión
- **WHEN** se piden el `GET` o el `PATCH` sin token
- **THEN** las dos responden `401`

### Requirement: Eventos de log de la carga horaria
Un `PATCH` que cambia algo MUST registrar `COURSE_WORKLOAD_UPDATED` con `school_id`, `actor_id`, `course_id`, `subjects_added`, `subjects_removed` y `subjects_changed` (recuentos). Un `PATCH` sin cambios reales MUST NOT registrar ese evento. Un `404` o un `400` por asignatura inexistente MUST registrar `COURSE_WORKLOAD_UPDATE_REJECTED` con `reason: not_found` o `subject_not_found`. Los eventos MUST NOT llevar nombres de cursos ni de asignaturas, ni códigos.

#### Scenario: Cambio registrado
- **WHEN** se suben las sesiones de una asignatura, se añade otra y se quita una tercera
- **THEN** el log lleva `COURSE_WORKLOAD_UPDATED` con `subjects_added: 1`, `subjects_removed: 1` y `subjects_changed: 1`, y ningún nombre

#### Scenario: Sin cambios reales
- **WHEN** se envía «Inglés» con las mismas sesiones que ya tiene
- **THEN** la respuesta es `200` y el log no lleva `COURSE_WORKLOAD_UPDATED`

### Requirement: Página de carga horaria de un curso
La ruta `/cursos/:id/carga` MUST colgar del layout de las páginas autenticadas, para los dos roles, con el `NavLink` «Cursos» activo. MUST pedir la carga una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y «Reintentar»; un `404` MUST mostrar «Este curso no existe o ya no está disponible» con un enlace a «Cursos». El título MUST ser «Carga horaria de {curso}». El balance MUST decir «{asignadas} de {disponibles} sesiones a la semana» con una barra decorativa (`aria-hidden`) que se pinta en color de peligro si se supera; `WORKLOAD_EXCEEDS_SLOTS` MUST mostrarse como «La carga supera en {n} las sesiones del calendario {nombre}» y `COURSE_WITHOUT_CALENDAR`, sin balance, como «Este curso no tiene calendario base: asígnaselo desde Calendarios para saber si cabe la carga», con un enlace a `/calendarios`; los avisos MUST ir en un `role="status"`. Los nombres MUST pintarse como texto plano.

#### Scenario: Balance
- **GIVEN** «1º Primaria» con calendario de 6 sesiones y 8 sesiones asignadas
- **WHEN** un usuario abre `/cursos/<id>/carga`
- **THEN** ve «Carga horaria de 1º Primaria» y «8 de 30 sesiones a la semana»

#### Scenario: No cabe
- **GIVEN** 31 sesiones asignadas y un calendario «Jornada continua» de 6 sesiones
- **THEN** ve «31 de 30 sesiones a la semana», la barra en color de peligro y «La carga supera en 1 las sesiones del calendario Jornada continua»

#### Scenario: Sin calendario
- **GIVEN** un curso sin calendario
- **THEN** no ve balance y ve el aviso con el enlace a «Calendarios»

#### Scenario: Curso que no existe
- **WHEN** se abre la carga de un curso que otra persona borró
- **THEN** se ve «Este curso no existe o ya no está disponible» con el enlace a «Cursos»

#### Scenario: Error al cargar
- **GIVEN** que la API responde `503`
- **THEN** se ve un aviso con `role="alert"` y «Reintentar», que vuelve a pedir la carga

### Requirement: Matriz de la carga para el administrador
Para un `ADMIN`, la página MUST mostrar una fila por asignatura del colegio, en el orden del servidor, con su muestra de color (con su nombre accesible), su nombre, su código si lo tiene, «Inactiva» si lo está y un selector de sesiones con las opciones «No se imparte», 1, 2, 3, 4 y 5 y la etiqueta accesible «Sesiones a la semana de {asignatura}». El balance MUST recalcularse mientras se edita. «Guardar» MUST estar deshabilitado mientras no haya ninguna fila distinta de lo cargado (deshacer un cambio lo vuelve a deshabilitar) y MUST enviar un único `PATCH` con solo las filas cambiadas, con una guarda síncrona contra el doble envío. Con el `200`, la página MUST seguir abierta con la carga releída y «Carga de {curso} guardada» en un `role="status"`. Un `400` con `NOT_FOUND` en una asignatura MUST volver a pedir la carga y avisar «Alguna asignatura ya no existe; revisa la carga»; un `404`, mostrar la vista de no disponible; un `403`, «Solo los administradores pueden modificar la carga horaria»; cualquier otro fallo, un aviso general con `role="alert"` conservando lo editado. Sin asignaturas en el colegio, MUST mostrar «Todavía no hay asignaturas» con un enlace a «Crear asignatura».

#### Scenario: Ajustar y guardar
- **GIVEN** «1º Primaria» con «Inglés» (3) y «Lengua» (5)
- **WHEN** un `ADMIN` sube «Inglés» a 4, marca «Música» con 2, pasa «Lengua» a «No se imparte» y pulsa «Guardar» dos veces
- **THEN** el balance pasa a «6 de 30» antes de guardar, se envía un único `PATCH` con esas tres filas y ve «Carga de 1º Primaria guardada»

#### Scenario: Solo con cambios
- **WHEN** un `ADMIN` abre la carga, cambia «Inglés» a 4 y lo devuelve a 3
- **THEN** «Guardar» está deshabilitado al abrir y vuelve a estarlo tras deshacer

#### Scenario: Asignatura que ya no existe al guardar
- **GIVEN** una asignatura que otra persona borró mientras se editaba
- **WHEN** se guarda un cambio en ella
- **THEN** la página vuelve a pedir la carga y se ve «Alguna asignatura ya no existe; revisa la carga»

#### Scenario: Colegio sin asignaturas
- **WHEN** un `ADMIN` abre la carga en un colegio sin asignaturas
- **THEN** ve «Todavía no hay asignaturas» con el enlace a «Crear asignatura» y ningún «Guardar»

### Requirement: Vista de la carga para el miembro
Para un `MEMBER`, la página MUST mostrar el balance y sus avisos y la lista de las asignaturas que se imparten en el curso con sus sesiones como texto («Inglés: 3 sesiones»), sin selectores ni «Guardar», y el texto «Solo los administradores pueden modificar la carga horaria». Si ninguna asignatura se imparte en el curso, MUST mostrar «Este curso aún no tiene asignaturas».

#### Scenario: Miembro
- **GIVEN** «1º Primaria» con «Inglés» (3) y «Lengua» (5)
- **WHEN** un `MEMBER` abre su carga
- **THEN** ve «8 de 30 sesiones a la semana», «Inglés: 3 sesiones», «Lengua: 5 sesiones», ningún selector ni «Guardar» y el texto de solo administradores

### Requirement: Accesibilidad, responsive e i18n de la carga
Cada selector MUST tener su etiqueta accesible; el balance MUST ser texto (la barra es decorativa); los avisos MUST ir en un `role="status"`; la muestra de color MUST anunciarse por su nombre y no ser la única pista. La página MUST NOT tener violaciones de `axe` ni desplazamiento horizontal a 360 px. Los textos y los códigos de aviso MUST estar en `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analiza la página del `ADMIN` y la del `MEMBER` con `axe`
- **THEN** no hay violaciones

#### Scenario: Móvil
- **WHEN** se abre la carga a 360 px
- **THEN** no hay desplazamiento horizontal y cada selector sigue siendo usable

### Requirement: Carga horaria de extremo a extremo
Un E2E (`cypress/e2e/workload.cy.ts`) MUST recorrer: abrir «Carga horaria» desde `/cursos`, ajustar la carga y verla en la tarjeta de la asignatura en `/asignaturas`, una carga que no cabe con su aviso, un curso sin calendario, un `MEMBER` que la ve sin editar y la página a 360 px.

#### Scenario: Recorrido completo
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/workload.cy.ts`
- **THEN** todos los tests pasan

### Requirement: Reglas en la lectura de la carga
`GET /api/courses/{id}/workload` MUST devolver, en cada asignatura:
- `maxPerDay`: el valor de su regla `MAX_PER_DAY` en el curso, o `null`.
- `blockSize`: el de su regla `BLOCK`, o `null`.
- `constraintCount`: el número de reglas de la pareja, de cualquier tipo; 0 si no se imparte.
- `warnings`: sus avisos (los de «Avisos de las reglas de una asignatura»); vacía si no se imparte.

`calendar.maxConsecutiveSessions` MUST ser el tramo más largo de periodos `SESSION` seguidos por `position` sin un `BREAK` entre medias. Los avisos del curso MUST NOT cambiar.

#### Scenario: Asignatura con reglas
- **GIVEN** «Inglés» con 4 sesiones, «Máximo al día: 2» y «Bloques: De 2» en 1º
- **WHEN** se pide la carga de 1º
- **THEN** «Inglés» tiene `maxPerDay: 2`, `blockSize: 2`, `constraintCount: 2` y `warnings: []`

#### Scenario: Asignatura que no se imparte
- **WHEN** se pide la carga y «Música» no se imparte en el curso
- **THEN** «Música» tiene `sessionsPerWeek`, `maxPerDay` y `blockSize` a `null`, `constraintCount: 0` y `warnings: []`

#### Scenario: Tramo más largo sin recreo
- **GIVEN** un calendario con 3 sesiones, un recreo y 3 sesiones
- **THEN** `calendar.sessionsPerDay` es 6 y `calendar.maxConsecutiveSessions` es 3

### Requirement: Escribir las reglas con el PATCH de la carga
Cada cambio de `PATCH /api/courses/{id}/workload` MUST dejar la fila de la asignatura en el curso tal como dice: sus sesiones, su `MAX_PER_DAY` y su `BLOCK`. Un valor MUST crear la regla o cambiar su valor, y un `null` MUST borrarla. Con `sessionsPerWeek: null`, la pareja se borra y sus reglas caen por la cascada.

Las reglas MUST escribirse en la misma transacción que las sesiones, después de crear la pareja si es nueva y bajo los mismos bloqueos (asignaturas `FOR UPDATE` en orden de `id` y curso `FOR SHARE`). Las reglas que no cambian MUST NOT escribirse.

Si falla cualquier escritura, MUST NOT quedar ningún cambio ni en la carga ni en las reglas. Unas reglas que no caben MUST guardarse igual: solo se avisa.

#### Scenario: Máximo al día
- **GIVEN** «Inglés» con 4 sesiones en 1º
- **WHEN** un `ADMIN` envía `{ subjectId: Inglés, sessionsPerWeek: 4, maxPerDay: 2, blockSize: null }`
- **THEN** la respuesta es `200` con «Inglés» `maxPerDay: 2` y `constraintCount: 1`
- **WHEN** después envía la misma fila con `maxPerDay: null`
- **THEN** la regla se borra y `constraintCount` es 0

#### Scenario: Asignatura nueva con reglas
- **GIVEN** «Plástica» que no se imparte en 1º
- **WHEN** se envía con `sessionsPerWeek: 3` y `blockSize: 2`
- **THEN** «Plástica» se imparte en 1º con 3 sesiones y bloques de 2, sin avisos

#### Scenario: Bloque mayor que la carga
- **WHEN** se envía «Plástica» con 1 sesión y `blockSize: 2`
- **THEN** la respuesta es `200`, se guarda, y la asignatura lleva `BLOCK_LARGER_THAN_LOAD`

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar la inserción en `scheduling_constraints`
- **WHEN** se envía un cambio que sube las sesiones de «Inglés» y le pone un máximo
- **THEN** la petición falla y ni las sesiones ni las reglas de «Inglés» han cambiado

### Requirement: Validación de las reglas en el cambio de carga
Cada elemento de `changes` MUST tener presentes `maxPerDay` y `blockSize`:
- **Ausente:** `REQUIRED`.
- **No es un entero:** `INVALID_FORMAT`.
- **Fuera de rango:** `OUT_OF_RANGE` (de 2 a 5 para `maxPerDay` y de 2 a 3 para `blockSize`).

Los errores van en `changes[<i>].maxPerDay` y `changes[<i>].blockSize`. Con `sessionsPerWeek: null`, un `maxPerDay` o un `blockSize` distinto de `null` MUST dar `NOT_ALLOWED` en ese campo.

Los errores MUST seguir el orden `subjectId`, `sessionsPerWeek`, `maxPerDay` y `blockSize` en cada cambio, responder `400 VALIDATION_ERROR` y MUST NOT cambiar nada.

#### Scenario: Valores fuera de rango
- **WHEN** se envían `maxPerDay: 1`, `maxPerDay: 6`, `blockSize: 1` y `blockSize: 4` en cuatro cambios
- **THEN** la respuesta es `400` con `OUT_OF_RANGE` en cada uno de esos campos

#### Scenario: Regla sin carga
- **WHEN** se envía `sessionsPerWeek: null` con `maxPerDay: 2`
- **THEN** la respuesta es `400` con `NOT_ALLOWED` en `changes[0].maxPerDay` y nada cambia

#### Scenario: Campo ausente
- **WHEN** se envía un cambio sin `blockSize`
- **THEN** la respuesta es `400` con `REQUIRED` en `changes[0].blockSize`

### Requirement: Concurrencia de las reglas
Ninguna combinación de un `PATCH` con reglas con estas operaciones MUST terminar en `500` ni en interbloqueo, ni dejar una regla sin su pareja:
- La edición de la misma asignatura que quita ese curso.
- El borrado de la asignatura.
- El borrado del curso.
- Otro `PATCH` sobre la misma asignatura.

#### Scenario: Reglas contra edición de la asignatura
- **WHEN** a la vez se ponen reglas a «Inglés» en la carga de 1º y se edita «Inglés» quitando 1º, varias rondas
- **THEN** las dos terminan sin `500` ni interbloqueo y, si gana la edición, no queda ninguna regla de «Inglés» en 1º

#### Scenario: Reglas contra borrado del curso
- **WHEN** a la vez se ponen reglas en la carga de 1º y se borra 1º, varias rondas
- **THEN** el borrado responde `200`, el `PATCH` responde `200` o `404`, y no queda ninguna regla de 1º

### Requirement: Eventos de log de las reglas
`COURSE_WORKLOAD_UPDATED` MUST llevar además `constraints_set` (reglas creadas o con su valor cambiado) y `constraints_removed` (reglas borradas, también las que caen por la cascada al quitar la pareja). Un `PATCH` que solo cambia reglas MUST registrar el evento; uno que no cambia ni sesiones ni reglas, MUST NOT. Los eventos MUST NOT llevar nombres.

#### Scenario: Reglas registradas
- **GIVEN** «Inglés» con un máximo de 2 en 1º y «Lengua» sin reglas
- **WHEN** se quita «Inglés» del curso y se ponen bloques de 2 a «Lengua»
- **THEN** el log lleva `COURSE_WORKLOAD_UPDATED` con `subjects_removed: 1`, `constraints_set: 1` y `constraints_removed: 1`, y ningún nombre

#### Scenario: Solo reglas
- **WHEN** se cambia solo el máximo de «Inglés»
- **THEN** el log lleva `COURSE_WORKLOAD_UPDATED` con `subjects_changed: 0` y `constraints_set: 1`

### Requirement: Reglas en la matriz del administrador
En la matriz, cada fila MUST tener, además del selector de sesiones:
- **«Máximo al día»:** con las opciones «1 (por defecto)», 2, 3, 4 y 5, y la etiqueta accesible «Máximo al día de {asignatura}».
- **«Bloques»:** con «Sin bloques», «De 2» y «De 3», y la etiqueta accesible «Bloques de {asignatura}».

Con «No se imparte», los dos MUST estar deshabilitados y valer «1 (por defecto)» y «Sin bloques».

Al editar:
- Los avisos de cada fila MUST recalcularse mientras se edita, con la misma regla que el backend: «{asignatura}: con {n} sesiones no puede ir en bloques de {k}» y «{asignatura} no cabe en la semana con sus reglas».
- Al pasar a «No se imparte» una asignatura con reglas en el curso, MUST verse «Al guardar se borrarán sus {n} reglas en este curso», ligado a su selector de sesiones por `aria-describedby`.
- «Guardar» MUST habilitarse con cualquier campo distinto de lo cargado y enviar la fila entera de cada asignatura cambiada.

#### Scenario: Poner bloques
- **GIVEN** «Plástica» con 3 sesiones en 1º
- **WHEN** el `ADMIN` elige «Bloques: De 2» y guarda
- **THEN** se envía un `PATCH` con `{ sessionsPerWeek: 3, maxPerDay: null, blockSize: 2 }` para «Plástica» y no se ve ningún aviso

#### Scenario: Aviso mientras se edita
- **WHEN** el `ADMIN` baja «Plástica» a 1 sesión con bloques de 2
- **THEN** ve «Plástica: con 1 sesión no puede ir en bloques de 2» antes de guardar y «Guardar» sigue habilitado

#### Scenario: Selectores sin carga y aviso de pérdida
- **GIVEN** «Inglés» con 2 reglas en 1º
- **WHEN** el `ADMIN` la pasa a «No se imparte»
- **THEN** los dos selectores quedan deshabilitados y ve «Al guardar se borrarán sus 2 reglas en este curso»

### Requirement: Reglas en la vista del miembro
Para un `MEMBER`, cada asignatura que se imparte MUST mostrar sus reglas como texto junto a sus sesiones («Inglés: 4 sesiones · como mucho 2 al día · en bloques de 2», sin la parte que no tenga) y sus avisos, sin selectores.

#### Scenario: Miembro
- **GIVEN** «Inglés» con 4 sesiones, máximo 2 y bloques de 2 en 1º
- **WHEN** un `MEMBER` abre la carga de 1º
- **THEN** ve «Inglés: 4 sesiones · como mucho 2 al día · en bloques de 2» y ningún selector

### Requirement: Accesibilidad y responsive de las reglas en la carga
Cada selector nuevo MUST tener su etiqueta accesible. Los avisos de pérdida MUST ligarse por `aria-describedby`. La página MUST NOT tener violaciones de `axe` con reglas y avisos. A 360 px, los tres selectores de una fila MUST apilarse sin desplazamiento horizontal. Los textos nuevos y los dos códigos de aviso MUST estar en `es.json` y `en.json`.

#### Scenario: Móvil con reglas
- **WHEN** se abre a 360 px la carga de un curso con una asignatura de nombre muy largo y reglas
- **THEN** no hay desplazamiento horizontal y los tres selectores de la fila se ven y se usan

#### Scenario: Sin violaciones con avisos
- **WHEN** se analiza con `axe` la matriz con un aviso de bloque y un aviso de pérdida
- **THEN** no hay violaciones

### Requirement: Reglas de la carga de extremo a extremo
`cypress/e2e/workload.cy.ts` MUST recorrer además:
- Poner un máximo y unos bloques y verlos en la tarjeta de la asignatura («· 2 reglas»).
- El aviso de un bloque mayor que la carga.
- Pasar a «No se imparte» una asignatura con reglas, con su aviso de pérdida, y ver que las reglas desaparecen.
- Un `MEMBER` que ve las reglas como texto.
- La matriz con reglas a 360 px.

#### Scenario: Recorrido con reglas
- **WHEN** se ejecuta `npm run test:e2e -- --spec cypress/e2e/workload.cy.ts`
- **THEN** todos los tests pasan

