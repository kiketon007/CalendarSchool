## MODIFIED Requirements

### Requirement: Contrato de los alumnos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/students` (`createStudent`), `GET /api/students` (`listStudents`), `GET /api/students/{id}` (`getStudent`), `PUT /api/students/{id}` (`updateStudent`) y `DELETE /api/students/{id}` (`deleteStudent`), con seguridad Bearer, y los esquemas `CreateStudentRequest` (`firstName`, `lastName`, `courseId` y `cafeteria` obligatorios; `classId`, `scholarship`, `foodType` y `observations` opcionales y nulables), `UpdateStudentRequest` (los mismos campos y reglas, como estado final del alumno), `Student` (`id`, `firstName`, `lastName`, `course` y `class`, cada uno `{ id, name }` o `null`, `cafeteria`, `scholarship` booleano o `null`, `foodType` y `observations` texto o `null`), `StudentSummary` (lo mismo sin `foodType` ni `observations`) y `DeleteStudentResponse` (`{ deleted: { id } }`). `POST` MUST declarar `201`, `400`, `401`, `500` y `503`; `GET /api/students`, `200`, `401`, `500` y `503`; `GET /api/students/{id}`, `200` (`{ student: Student }`), `401`, `404`, `500` y `503`; `PUT /api/students/{id}`, `200` (`{ student: Student }`), `400`, `401`, `404`, `500` y `503`; `DELETE /api/students/{id}`, `200` (`DeleteStudentResponse`, con `Cache-Control: no-store`), `401`, `404`, `500` y `503`, sin cuerpo en la petición. El parámetro `id` MUST ser un UUID. Las descripciones de `foodType` y `observations` MUST indicar que son datos sensibles que no aparecen en el listado. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createStudent`, `listStudents`, `getStudent`, `updateStudent` y `deleteStudent`
- **THEN** las cinco exigen Bearer y declaran las respuestas indicadas, `StudentSummary` no tiene `foodType` ni `observations` y `deleteStudent` no tiene cuerpo de petición

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las cinco operaciones y los cinco esquemas

### Requirement: Acceso a los alumnos
`POST` y `GET /api/students`, y `GET`, `PUT` y `DELETE /api/students/{id}`, MUST exigir una sesión válida (`401` sin ella) y MUST estar abiertos a `ADMIN` y `MEMBER`. El colegio MUST salir siempre de la identidad: un alumno se crea en el colegio de quien lo crea, el listado solo trae los alumnos de su colegio y un alumno de otro colegio MUST responder `404 NOT_FOUND` al leerlo, editarlo o borrarlo, igual que uno inexistente, sin modificarse.

#### Scenario: Miembro
- **GIVEN** un usuario `MEMBER`
- **WHEN** crea un alumno, pide el listado, lo lee, lo edita y lo borra
- **THEN** recibe `201`, `200`, `200`, `200` y `200`, y el alumno era de su colegio

#### Scenario: Sin sesión
- **WHEN** se llama a cualquiera de los cinco sin token
- **THEN** la respuesta es `401` y no se borra ni se modifica nada

#### Scenario: Aislamiento
- **GIVEN** alumnos en dos colegios
- **WHEN** un usuario del primero pide el listado, y lee, edita y borra un alumno del segundo por su `id`
- **THEN** el listado solo trae los de su colegio, y la lectura, la edición y el borrado responden `404` sin cambiar ni borrar el alumno del segundo

### Requirement: Página de listado de alumnos
`/alumnos` MUST colgar de `AuthenticatedLayout` sin restricción de rol, pedir la lista una sola vez (también con `StrictMode`) y mostrar un `role="status"` mientras carga. Desde 768 px MUST mostrar una tabla con las columnas «Nombre» («Apellidos, Nombre» en un `th scope="row"`), «Curso y clase», «Comedor» y «Acciones»; por debajo, tarjetas con el nombre como `h2`. «Curso y clase» MUST decir «1º Primaria A», «1º Primaria · Sin clase» o «Sin curso»; «Comedor», «Sí · Con beca», «Sí» o «No». Cada fila y cada tarjeta MUST llevar un enlace «Editar» hacia `/alumnos/<id>/editar` con el nombre accesible «Editar {Apellidos, Nombre}» y, en el estado de la navegación, la búsqueda actual de la URL del listado (`{ listSearch: "?curso=…&pagina=…" }`, o `""` sin parámetros), y junto a él un botón «Borrar» (`outline-danger`) con el nombre accesible «Borrar {Apellidos, Nombre}» que abre el diálogo de borrado. MUST respetar el orden del servidor, mostrar siempre «Crear alumno» (hacia `/alumnos/nuevo`), «Todavía no hay alumnos» con «Crear alumno» si no hay ninguno y un `role="alert"` con «Reintentar» si falla. MUST leer del estado de la navegación, con una guarda de tipo, el aviso `{ studentCreated: <texto no vacío> }` o `{ studentUpdated: <texto no vacío> }` y mostrar «Alumno «{nombre}» creado» o «Alumno «{nombre}» actualizado» como texto plano en un `role="status"`, que se conserva al cambiar los filtros o la página. Un aviso de la propia página (alumno eliminado o que ya no existe) MUST sustituir al de llegada. MUST NOT mostrar el tipo de comida ni las observaciones.

#### Scenario: Tabla y tarjetas
- **GIVEN** «Juan García» en «1º Primaria» A con comedor y beca, y «Ana Álvarez» sin curso ni comedor
- **WHEN** se abre `/alumnos` a 1280 px y a 360 px
- **THEN** la tabla y las tarjetas muestran «Álvarez, Ana | Sin curso | No» y «García, Juan | 1º Primaria A | Sí · Con beca», cada uno con su enlace «Editar» y su botón «Borrar»

#### Scenario: Editar con los filtros
- **GIVEN** `/alumnos?comedor=si&pagina=2`
- **WHEN** se pulsa «Editar» en «García, Juan»
- **THEN** se navega a `/alumnos/<id de Juan>/editar` con `{ listSearch: "?comedor=si&pagina=2" }` en el estado

#### Scenario: Vacío y error
- **WHEN** no hay alumnos, o la lista responde `503`
- **THEN** se ve «Todavía no hay alumnos» con «Crear alumno», o el error con «Reintentar» que vuelve a pedirla

#### Scenario: Aviso de llegada
- **WHEN** se llega con `{ studentCreated: "<b>Juan</b> García" }` o con `{ studentUpdated: "<b>Juan</b> García" }`
- **THEN** se ve «Alumno «<b>Juan</b> García» creado» o «… actualizado» como texto, sin interpretar el HTML
- **AND** un estado con otra forma (`{ studentUpdated: 3 }`) no muestra aviso

#### Scenario: Aviso de borrado en lugar del de llegada
- **GIVEN** que se llegó con «Alumno «Juan García» actualizado»
- **WHEN** se borra a «Ana Álvarez»
- **THEN** solo se ve «Alumno «Ana Álvarez» eliminado»

### Requirement: Filtros del listado de alumnos en la URL
`/alumnos` MUST leer y escribir en la URL los filtros y la página, con estos parámetros: `curso` (el `id` de un curso o `sin-curso`), `clase` (el `id` de una clase o `sin-clase`; solo cuenta con un `curso` concreto), `comedor` (`si` o `no`), `beca` (`si` o `no`; solo cuenta con `comedor=si`) y `pagina` (entero mayor que 1; la primera página no se escribe). Los parámetros sin valor o con el valor por defecto MUST NOT escribirse. Cada cambio MUST sustituir la entrada del historial (`replace`). Un valor desconocido o que no corresponde a ningún alumno de la lista **tal como se cargó** (un curso borrado, una clase de otro curso, un curso de otro colegio, `pagina=abc`) MUST tratarse como si no estuviera, sin error; una página mayor que la última MUST mostrarse como la última. Las opciones de los desplegables de curso y clase MUST calcularse también sobre la lista tal como se cargó, de modo que borrar al último alumno de un curso o de una clase no quita esa opción ni desactiva su filtro hasta que la lista se vuelve a pedir. El texto de búsqueda MUST NOT escribirse en la URL. Los parámetros MUST NOT enviarse a la API.

#### Scenario: Recargar conserva los filtros
- **GIVEN** que se ha elegido «1º Primaria», «Come en el comedor» y la página 2
- **THEN** la URL es `/alumnos?curso=<id>&comedor=si&pagina=2`
- **AND** al recargar la página se ven los mismos filtros y la misma página

#### Scenario: Valores obsoletos
- **WHEN** se abre `/alumnos?curso=<id de un curso que ya no existe o de otro colegio>&comedor=quizas&pagina=99`
- **THEN** se ve el listado sin filtro de curso ni de comedor, en la última página, sin mensaje de error

#### Scenario: Beca sin comedor
- **WHEN** se abre `/alumnos?beca=si`
- **THEN** «Beca» está desactivado en «Todos» y no filtra

#### Scenario: Filtro que se queda sin alumnos al borrar
- **GIVEN** `/alumnos?curso=<id de 1º Primaria>` con un único alumno en ese curso
- **WHEN** se borra a ese alumno
- **THEN** la URL no cambia, «Curso» sigue en «1º Primaria» y se ve «No hay alumnos que coincidan con los filtros» con «Limpiar filtros»
- **AND** al volver a abrir `/alumnos` con esa URL el curso ya no se ofrece y el filtro se ignora

## ADDED Requirements

### Requirement: Borrar un alumno con DELETE /api/students/{id}
`DELETE /api/students/{id}` MUST borrar de verdad la fila del alumno del colegio de la identidad (sin papelera ni estado) en una transacción que bloquea antes esa fila (`SELECT … FOR UPDATE` filtrando por `id` y colegio) y MUST responder `200` con `{ deleted: { id } }` y `Cache-Control: no-store`. Un alumno de otro colegio, inexistente, ya borrado o con un `id` que no es un UUID MUST responder `404 NOT_FOUND` sin distinguir el caso y sin borrar nada. El borrado MUST NOT modificar el curso, la clase ni otros alumnos. El borrado MUST bloquear solo la fila del alumno (no su curso): una edición (`PUT`) o un segundo borrado simultáneos del mismo alumno MUST esperar y, si el borrado confirma primero, responder `404`; el borrado simultáneo de su curso MUST terminar sin interbloqueo. Si el borrado falla, MUST NOT quedar nada a medias.

#### Scenario: Borrado
- **GIVEN** «Ana García» en «1º Primaria» A con comedor y observaciones
- **WHEN** se llama a `DELETE /api/students/<id de Ana>`
- **THEN** la respuesta es `200` con `{ deleted: { id: <id de Ana> } }` y `Cache-Control: no-store`
- **AND** `GET /api/students` ya no la trae, `GET /api/students/<id de Ana>` responde `404` y el curso, la clase y los demás alumnos siguen igual

#### Scenario: Identificador no válido o ya borrado
- **WHEN** se llama con `id` `abc`, con el `id` de un alumno inexistente o con el de un alumno ya borrado
- **THEN** la respuesta es `404 NOT_FOUND` y no se borra nada

#### Scenario: Dos borrados a la vez
- **WHEN** se piden dos `DELETE` del mismo alumno a la vez
- **THEN** uno responde `200` y el otro `404`

#### Scenario: Edición a la vez
- **WHEN** se piden a la vez el `DELETE` y un `PUT` del mismo alumno, y el borrado confirma primero
- **THEN** el `PUT` responde `404` y el alumno no vuelve a existir

#### Scenario: Borrado del curso a la vez
- **WHEN** se borran a la vez un alumno y su curso, varias veces
- **THEN** ninguna petición responde `500` ni se interbloquea, el alumno queda borrado y el curso también

#### Scenario: Atomicidad
- **GIVEN** un disparador de prueba que hace fallar el borrado de la fila
- **WHEN** se llama al `DELETE`
- **THEN** la respuesta es un error y el alumno sigue como estaba

### Requirement: Eventos de log del borrado de alumnos
Un borrado correcto MUST registrar `STUDENT_DELETED` con `school_id`, `actor_id` y `student_id`, y MUST NOT incluir nombres, curso, clase, comedor, tipo de comida ni observaciones. Un borrado que responde `404` MUST NOT registrar ningún evento.

#### Scenario: Evento del borrado
- **WHEN** se borra a «Ana García», con «Alérgica a frutos secos» como tipo de comida
- **THEN** se registra `STUDENT_DELETED` con los tres identificadores y ningún evento contiene «Ana», «García» ni ese texto

#### Scenario: Sin evento en el 404
- **WHEN** se borra un alumno de otro colegio
- **THEN** no se registra ningún evento de borrado

### Requirement: Diálogo de borrado de un alumno
El botón «Borrar» de `/alumnos` MUST abrir un diálogo (`DeleteStudentModal`) **sin pedir nada a la API**, con el título «¿Borrar a {Nombre Apellidos}?» como nombre accesible, el texto «Esta acción no se puede deshacer» y los botones «Cancelar» y «Borrar alumno», sin «X» de cabecera, con el foco inicial en «Cancelar». MUST NOT mostrar curso, clase, tipo de comida ni observaciones. «Cancelar», Escape o el clic fuera MUST cerrarlo sin enviar nada y devolver el foco al botón que lo abrió. Al confirmar MUST enviar un único `DELETE` (guarda síncrona contra la doble pulsación) y, mientras tanto, mostrar «Borrando…», deshabilitar los botones e impedir que Escape o el clic fuera lo cierren. Tras el `200`, el diálogo MUST cerrarse, el alumno MUST quitarse de la lista cargada **sin volver a pedirla** (el total, los filtros y la página se recalculan y una página que se queda sin filas se acota a la última), la URL del listado y el texto de búsqueda MUST NOT cambiar, MUST verse «Alumno «{Nombre Apellidos}» eliminado» en un `role="status"` y el foco MUST pasar al título de la página. Un `404` MUST cerrar el diálogo, mostrar «Ese alumno ya no existe» y volver a pedir la lista. Cualquier otro fallo MUST quedarse en el diálogo con un `role="alert"` «No se pudo borrar el alumno. Inténtalo de nuevo» y permitir reintentar. Si la sesión se perdió, MUST NOT hacer nada (el layout lleva a `/login`).

#### Scenario: Abrir sin pedir nada
- **WHEN** se pulsa «Borrar» en «García, Ana»
- **THEN** se abre «¿Borrar a Ana García?» con «Esta acción no se puede deshacer» y el foco en «Cancelar», y no se hace ninguna petición

#### Scenario: Confirmar con filtros y búsqueda
- **GIVEN** `/alumnos?comedor=si&pagina=2` con «gar» en la búsqueda
- **WHEN** se borra a «Ana García»
- **THEN** se envía un único `DELETE`, desaparece de la lista sin volver a pedirla, la URL sigue siendo `/alumnos?comedor=si&pagina=2`, «gar» sigue escrito, se ve «Alumno «Ana García» eliminado» y el foco está en «Alumnos»

#### Scenario: Última fila de la página y último alumno
- **WHEN** se borra al único alumno de la última página, o al único alumno del colegio
- **THEN** se muestra la página anterior, o «Todavía no hay alumnos»

#### Scenario: Cancelar
- **WHEN** se pulsa «Cancelar» o Escape
- **THEN** el diálogo se cierra sin petición y el foco vuelve a «Borrar» de esa fila

#### Scenario: Doble pulsación
- **WHEN** se pulsa dos veces seguidas «Borrar alumno»
- **THEN** se envía un único `DELETE`, se ve «Borrando…» con los botones deshabilitados y Escape no cierra el diálogo

#### Scenario: Ya no existe
- **WHEN** el `DELETE` responde `404`
- **THEN** el diálogo se cierra, se ve «Ese alumno ya no existe» y la lista se vuelve a pedir

#### Scenario: Fallo
- **WHEN** el `DELETE` responde `503`
- **THEN** el diálogo sigue abierto con «No se pudo borrar el alumno. Inténtalo de nuevo», el alumno sigue en la lista y se puede reintentar

#### Scenario: Accesibilidad
- **WHEN** se analiza el diálogo abierto, borrando y con error con `axe`, y a 360 px
- **THEN** no hay violaciones ni desplazamiento horizontal, y los textos están en `es.json` y `en.json`

### Requirement: Borrado de alumnos de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con alumnos creados por la API: borrar desde un listado filtrado y en la página 2 conservando la URL; cancelar con Escape y el retorno del foco; el alumno que otra persona borra antes de confirmar; borrar al último alumno de un curso filtrado; un `MEMBER` que borra; y el diálogo abierto a 360 px sin desplazamiento horizontal.

#### Scenario: Recorrido de borrado
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de borrado de `students.cy.ts`
