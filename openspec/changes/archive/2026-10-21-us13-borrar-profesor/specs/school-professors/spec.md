## MODIFIED Requirements

### Requirement: Contrato de los profesores en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/professors` (`createProfessor`), `GET /api/professors` (`listProfessors`), `GET /api/professors/{id}` (`getProfessor`), `PUT /api/professors/{id}` (`updateProfessor`) y `DELETE /api/professors/{id}` (`deleteProfessor`), todos con seguridad Bearer, con los esquemas `CreateProfessorRequest` (`firstName`, `lastName`, `position` y `classId` opcionales), `UpdateProfessorRequest` (`firstName` y `lastName` obligatorios; `position` y `classId` opcionales, que admiten `null`), `Professor` (`id`, `firstName`, `lastName`, `position` que es `DIRECTOR`, `JEFE_ESTUDIOS` o `null`, `subjects`, que es un array vacío mientras no se asignen asignaturas, y `tutoredClass`, que es `null` o `{ id, name, courseId, courseName }`), la respuesta de la edición `{ professor, replacedTutor }`, donde `replacedTutor` es `null` o `{ id, firstName, lastName }`, y la del borrado `{ deleted: { freedClass } }`, donde `freedClass` es `null` o `{ id, name, courseName }`. `POST` MUST declarar `201`, `400`, `401`, `409` (`CLASS_ALREADY_HAS_TUTOR`), `500` y `503`; `GET /api/professors`, `200`, `401`, `500` y `503`; `GET /api/professors/{id}`, `200`, `401`, `404`, `500` y `503`; `PUT /api/professors/{id}`, `200`, `400`, `401`, `404`, `409` (`PROFESSOR_ALREADY_TUTOR`), `500` y `503`; `DELETE /api/professors/{id}`, `200`, `401`, `404`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `NOT_FOUND` y el enum `ErrorCode` MUST incluir `CLASS_ALREADY_HAS_TUTOR`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createProfessor`, `listProfessors`, `getProfessor`, `updateProfessor` y `deleteProfessor`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas, y cada profesor devuelto lleva `subjects: []` y `tutoredClass`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cinco operaciones y los esquemas

### Requirement: Acceso a los profesores
`POST /api/professors`, `GET /api/professors`, `GET /api/professors/{id}`, `PUT /api/professors/{id}` y `DELETE /api/professors/{id}` MUST exigir una sesión válida (`requireAuthentication`) y MUST admitir los roles `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad de la petición. Sin token o con una sesión no válida MUST responder `401 INVALID_SESSION`; con la base de datos caída, `503 DATABASE_UNAVAILABLE`.

#### Scenario: Miembro
- **GIVEN** un `MEMBER` con sesión iniciada
- **WHEN** crea un profesor, los lista, lee uno, lo edita y lo borra
- **THEN** recibe `201`, `200`, `200`, `200` y `200`

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de las cinco operaciones sin `Authorization`
- **THEN** la respuesta es `401` con `INVALID_SESSION` y `WWW-Authenticate: Bearer`

#### Scenario: Base de datos no disponible
- **GIVEN** que la base de datos no responde
- **WHEN** se crea, se lista, se lee, se edita o se borra un profesor
- **THEN** la respuesta es `503` con `DATABASE_UNAVAILABLE`

### Requirement: Página de listado de profesores
La página `/profesores` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con profesores, MUST mostrar encima del listado el total («1 profesor», «N profesores»); desde 768 px MUST mostrar una tabla con las columnas Nombre, Cargo, Tutoría y Acciones y una fila por profesor, con el nombre («Apellido, Nombre») como cabecera de su fila; por debajo de 768 px, una tarjeta por profesor con el nombre como `h2`, los mismos datos y sus acciones, sin pintar las dos estructuras a la vez. El cargo MUST mostrarse como «Director», «Jefe de estudios» o «Sin cargo»; la tutoría, como «Tutor de {curso} {clase}» («Tutor de 1º Primaria A») o «Sin tutoría» con el color secundario del tema. Cada profesor MUST tener un enlace «Editar» a `/profesores/{id}/editar` cuyo nombre accesible es «Editar {Apellido, Nombre}» y un botón «Borrar» cuyo nombre accesible es «Borrar {Apellido, Nombre}», que abre el diálogo de borrado. El listado MUST conservar el orden en que lo devuelve la API. Sin profesores, MUST mostrar «Todavía no hay profesores», sin total, búsqueda ni paginación. El botón «Crear profesor» a `/profesores/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Profesor «{nombre}» creado» en un `role="status"`; si llega desde la edición, «Profesor «{nombre}» actualizado» y, si otro profesor perdió su tutoría, «{nombre} queda sin tutoría». Los nombres MUST pintarse como texto plano y, si son largos, partirse en varias líneas sin truncarse. La página MUST NOT mostrar acciones ni columnas de funcionalidades que aún no existen (asignaturas) ni recargar la lista por su cuenta, salvo cuando el diálogo de borrado descubre que un profesor ya no existe.

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «García López, José María», jefe de estudios y tutor de la clase A de «1º Primaria», y una ventana de 1280 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve el total «1 profesor» y una tabla con las columnas Nombre, Cargo, Tutoría y Acciones, y esa fila con «Jefe de estudios», «Tutor de 1º Primaria A», el enlace «Editar» y el botón «Borrar»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve una tarjeta por profesor con su nombre como `h2`, los mismos datos, el enlace «Editar» y el botón «Borrar», y ninguna tabla

#### Scenario: Profesor sin cargo ni tutoría
- **GIVEN** un profesor sin cargo y que no tutoriza ninguna clase
- **THEN** se muestra «Sin cargo» y «Sin tutoría»

#### Scenario: Listado vacío
- **WHEN** un usuario de un colegio sin profesores abre `/profesores`
- **THEN** ve «Todavía no hay profesores» y el botón «Crear profesor», sin total, campo de búsqueda ni paginación

#### Scenario: Error al cargar
- **GIVEN** que la API responde `503`
- **WHEN** se abre `/profesores`
- **THEN** se ve un aviso con `role="alert"` y «Reintentar», que vuelve a pedir la lista

#### Scenario: Aviso tras crear
- **WHEN** se llega a `/profesores` tras crear «Ana García»
- **THEN** se ve «Profesor «Ana García» creado», el profesor en el listado y la primera página

#### Scenario: Aviso tras editar
- **WHEN** se llega a `/profesores` tras editar a «Ana García» quitándole la clase a «Luis Pérez»
- **THEN** se ve «Profesor «Ana García» actualizado. Luis Pérez queda sin tutoría» en un `role="status"`

### Requirement: Accesibilidad, responsive e i18n de los profesores
Las páginas `/profesores` y `/profesores/nuevo` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo con su etiqueta visible, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. La tabla del listado MUST tener nombre (el título de la página), cabeceras de columna y el nombre del profesor como cabecera de fila, y el contenido del listado MUST NOT aparecer dos veces en el árbol de accesibilidad. La paginación MUST ser una `nav` con nombre y botones con texto visible, y el cambio de página MUST anunciarse sin perder el foco. El campo de búsqueda MUST tener etiqueta visible y su resultado MUST anunciarse. El diálogo de borrado MUST tener nombre (su título), foco inicial en «Cancelar» y devolver el foco al botón «Borrar» al cancelar. A 360 px de ancho MUST NOT haber desplazamiento horizontal. Todos los textos (también el total con su plural, la tutoría, la paginación, la búsqueda y el borrado) MUST venir de `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan las páginas con `axe` (WCAG 2.1 A y AA): el listado en tabla, en tarjetas, con paginación, con búsqueda, sin resultados, vacío, con error, con el aviso y con el diálogo de borrado abierto, y el formulario vacío, con errores y sin clases libres
- **THEN** no hay violaciones

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/profesores` (también con paginación, búsqueda, nombres largos y el diálogo de borrado abierto) y `/profesores/nuevo`
- **THEN** no hay desplazamiento horizontal

### Requirement: Profesores de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado de profesores vacío; que crea un curso y un profesor con esa clase desde «Profesores» y lo ve en el listado como «Tutor de {curso} {clase}» y como tutor en la columna «Tutores» de `/cursos`; que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Profesores» y crea un profesor; que el formulario valida sin enviar nada; que una clase que ya tiene tutor no se puede elegir y, si otra persona se la da a alguien entre la carga y el envío (por la API), se ve el error en el campo; que borrar un curso con tutor deja al profesor en el listado con «Sin tutoría»; que el listado es una tabla a 1280 px y tarjetas sin desplazamiento horizontal a 360 px; que, con más de 20 profesores creados por la API, se ven el total, la primera página y la segunda con «Siguiente»; que la búsqueda encuentra sin acentos y con varias palabras en cualquier orden, muestra el mensaje sin resultados, limpia la búsqueda y reduce a una página un resultado de más de 20; que se edita un profesor desde «Editar»: nombre y cargo, cambio a una clase libre, quitar la tutoría y tomar la clase de otro profesor con su aviso, un `id` inexistente y la edición a 360 px; y que se borra un profesor desde «Borrar»: sin tutoría y con tutoría (la clase queda «Sin tutor» en `/cursos`), cancelar con Escape y el foco, el profesor que otra persona borra antes de confirmar, con una búsqueda activa y a 360 px con el diálogo abierto.

#### Scenario: Administrador
- **WHEN** se ejecuta el E2E del administrador
- **THEN** crea el profesor con su clase, lo ve en el listado con su tutoría y en `/cursos`, y la clase deja de ofrecerse en el formulario

#### Scenario: Miembro
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve «Profesores», no ve «Usuarios» y crea un profesor

#### Scenario: Clase tomada entre medias
- **WHEN** se ejecuta el E2E con la clase asignada por la API tras abrir el formulario
- **THEN** al enviar se ve «Esa clase ya tiene tutor. Elige otra» en el campo y no se crea nada

#### Scenario: Tabla y tarjetas
- **WHEN** se ejecuta el E2E a 1280 px y a 360 px
- **THEN** a 1280 px el listado es una tabla y a 360 px son tarjetas, sin desplazamiento horizontal

#### Scenario: Paginación
- **GIVEN** 25 profesores creados por la API
- **WHEN** se abre `/profesores`
- **THEN** se ven «25 profesores», 20 filas y «Página 1 de 2»; con «Siguiente», 5 filas y «Página 2 de 2»

#### Scenario: Búsqueda
- **GIVEN** profesores creados por la API, entre ellos «García-López, José María»
- **WHEN** se busca «garcia jose», después «zzz» y se pulsa «Limpiar búsqueda»
- **THEN** primero se ve solo ese profesor y «Mostrando 1 de N profesores», después el mensaje sin resultados, y al limpiar vuelven todos con el foco en el campo

#### Scenario: Edición
- **GIVEN** «Ana García», tutora de 1º A, y «Luis Pérez», tutor de 2º A, creados por la API
- **WHEN** se edita a Ana desde «Editar» cambiando el cargo y eligiendo 2º A
- **THEN** se ve el aviso «Al guardar, Luis Pérez dejará de ser tutor de 2º Primaria A», al guardar el listado dice que Luis queda sin tutoría, Ana aparece como «Tutor de 2º Primaria A» y Luis como «Sin tutoría», y 1º A queda sin tutor en `/cursos`

#### Scenario: Borrado
- **GIVEN** «Ana García», tutora de 1º A, creada por la API
- **WHEN** se pulsa «Borrar» en su fila y se confirma
- **THEN** el diálogo avisa de que 1º Primaria A quedará sin tutor, al confirmar Ana desaparece del listado con «Profesor «Ana García» eliminado. La clase 1º Primaria A queda sin tutor», el foco está en el título y 1º A aparece «Sin tutor» en `/cursos`

## ADDED Requirements

### Requirement: Borrar un profesor con DELETE /api/professors/{id}
`DELETE /api/professors/{id}` MUST borrar de verdad (sin borrado lógico) al profesor del colegio de la identidad en una única transacción con su fila bloqueada (`FOR UPDATE`), leyendo antes la clase que tutoriza. La clase MUST quedar sin tutor por la clave ajena `ON DELETE SET NULL`, sin borrarse ni cambiar nada más. La respuesta MUST ser `200` con `{ deleted: { freedClass } }`, donde `freedClass` es la clase que tutorizaba en el momento del borrado (`{ id, name, courseName }`) o `null`. Un `id` que no es un UUID, un profesor inexistente y uno de otro colegio MUST responder el mismo `404 NOT_FOUND` sin borrar nada. Con el bloqueo, de dos borrados simultáneos uno MUST responder `200` y el otro `404`, y una edición simultánea MUST esperar y responder `404` si el borrado confirma primero. Si el borrado falla a mitad, MUST NOT quedar nada cambiado.

#### Scenario: Profesor sin tutoría
- **WHEN** se borra un profesor que no tutoriza ninguna clase
- **THEN** la respuesta es `200` con `freedClass: null` y el profesor ya no existe

#### Scenario: Profesor con tutoría
- **GIVEN** Ana tutoriza 1º Primaria A
- **WHEN** se borra a Ana
- **THEN** la respuesta es `200` con `freedClass` 1º Primaria A, la clase sigue existiendo sin tutor y `GET /api/courses` la muestra con `tutor: null`

#### Scenario: Otro colegio, inexistente o mal formado
- **WHEN** se borra un profesor de otro colegio, un UUID que no existe o `abc`
- **THEN** la respuesta es `404 NOT_FOUND` y no se borra nada

#### Scenario: Borrados simultáneos
- **WHEN** se borra el mismo profesor dos veces a la vez
- **THEN** una respuesta es `200` y la otra `404`

#### Scenario: Atomicidad
- **GIVEN** que el borrado falla a mitad (un disparador temporal en la prueba)
- **WHEN** se borra un profesor con tutoría
- **THEN** el profesor y su tutoría siguen como estaban

### Requirement: Evento de log del borrado de profesores
El backend MUST registrar `PROFESSOR_DELETED` con `school_id`, `actor_id`, `professor_id` y `freed_class` (booleano) tras borrar un profesor. Un `404` MUST NOT registrar evento. El evento MUST NOT incluir nombres.

#### Scenario: Borrado con tutoría
- **WHEN** se borra a Ana, tutora de 1º A
- **THEN** el log tiene `PROFESSOR_DELETED` con `freed_class: true` y sin nombres

### Requirement: Diálogo de borrado de un profesor
El botón «Borrar» de cada profesor MUST abrir un diálogo con el título «¿Borrar a {Nombre Apellidos}?», foco inicial en «Cancelar» y sin «X» de cabecera. Al abrirse, el diálogo MUST pedir el profesor (`GET /api/professors/{id}`) una sola vez (también con `StrictMode`), mostrar «Comprobando…» con «Borrar profesor» deshabilitado y, después, «Tutoriza {curso} {clase}: la clase quedará sin tutor» si tutoriza una clase y siempre «Esta acción no se puede deshacer». Si la consulta falla, MUST mostrar un `role="alert"` con «Reintentar» y mantener «Borrar profesor» deshabilitado. Al confirmar, MUST tener una guarda síncrona contra la doble pulsación, mostrar «Borrando…» con los botones deshabilitados y no cerrarse con Escape ni con el clic fuera. Con el `200`, el diálogo MUST cerrarse y la página MUST quitar al profesor de la lista cargada sin volver a pedirla (recalculando total, búsqueda y página), mostrar en un `role="status"` «Profesor «{nombre}» eliminado» o, si tenía tutoría, «Profesor «{nombre}» eliminado. La clase {curso} {clase} queda sin tutor», y llevar el foco al título un turno después de cerrarse el diálogo. Un `404` al consultar o al borrar MUST cerrar el diálogo, mostrar «Ese profesor ya no existe» y volver a pedir la lista. Un fallo al borrar MUST quedarse en el diálogo con un `role="alert"` («No se pudo borrar el profesor. Inténtalo de nuevo») y permitir reintentar. Cancelar o Escape MUST cerrar sin borrar y devolver el foco al botón «Borrar».

#### Scenario: Con tutoría
- **GIVEN** Ana tutoriza 1º Primaria A
- **WHEN** se pulsa «Borrar» en su fila
- **THEN** el diálogo muestra «Comprobando…» y después «Tutoriza 1º Primaria A: la clase quedará sin tutor» y «Esta acción no se puede deshacer», con el foco en «Cancelar»

#### Scenario: Confirmar
- **WHEN** se pulsa «Borrar profesor»
- **THEN** se envía una sola petición, el profesor desaparece de la lista sin volver a pedirla, se ve el aviso y el foco está en el título

#### Scenario: Cancelar
- **WHEN** se pulsa «Cancelar» o Escape
- **THEN** no se borra nada y el foco vuelve al botón «Borrar»

#### Scenario: Ya no existe
- **GIVEN** que otra persona borró al profesor
- **WHEN** se abre el diálogo o se confirma
- **THEN** el diálogo se cierra, se ve «Ese profesor ya no existe» y la lista se vuelve a pedir

#### Scenario: Fallo
- **WHEN** la consulta falla, o el borrado responde `503`
- **THEN** se ve un aviso con «Reintentar» y no se puede confirmar, o «No se pudo borrar el profesor. Inténtalo de nuevo» en el diálogo y se puede reintentar

#### Scenario: Con búsqueda y paginación
- **GIVEN** una búsqueda activa cuyo único resultado se borra
- **WHEN** se confirma el borrado
- **THEN** se ve «No hay profesores que coincidan con «X»» con «Limpiar búsqueda»
