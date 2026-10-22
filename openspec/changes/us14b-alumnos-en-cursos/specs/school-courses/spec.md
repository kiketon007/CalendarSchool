## ADDED Requirements

### Requirement: Número de alumnos en las respuestas de cursos
Cada curso de `GET /api/courses`, `GET /api/courses/{id}`, `POST /api/courses` y `PUT /api/courses/{id}` MUST llevar `studentCount` (alumnos del curso, con y sin clase) y cada una de sus clases, `studentCount` (alumnos asignados a esa clase). Solo MUST contar alumnos del colegio de la identidad. `POST` MUST devolver `0` en el curso y en cada clase. El `PUT` MUST devolver los números del estado final, contados dentro de su transacción después de guardar, y MUST ignorar un `studentCount` recibido en el cuerpo, como cualquier propiedad desconocida. El listado MUST obtener los números en la misma consulta que los cursos, sin una consulta adicional por curso ni por clase. Los números MUST NOT aparecer en los eventos de log.

#### Scenario: Listado con alumnos
- **GIVEN** «1º Primaria» con la clase «A» (2 alumnos), la «B» (1) y 1 alumno sin clase, y otro colegio con alumnos en su propio «1º Primaria»
- **WHEN** se pide `GET /api/courses`
- **THEN** «1º Primaria» lleva `studentCount: 4`, «A» `studentCount: 2` y «B» `studentCount: 1`
- **AND** un curso sin alumnos lleva `studentCount: 0` en él y en sus clases

#### Scenario: Leer un curso
- **WHEN** se pide `GET /api/courses/<id>` de ese curso
- **THEN** lleva los mismos números que el listado

#### Scenario: Curso recién creado
- **WHEN** se crea un curso con dos clases
- **THEN** el `201` lleva `studentCount: 0` en el curso y en las dos clases

#### Scenario: Quitar una clase con alumnos
- **GIVEN** el curso anterior
- **WHEN** se edita sin la clase «A»
- **THEN** el `200` lleva `studentCount: 4` en el curso y `studentCount: 1` en «B», y los 2 alumnos de «A» siguen en el curso sin clase

#### Scenario: Número enviado en el PUT
- **WHEN** el cuerpo del `PUT` lleva `studentCount: 99` en el curso o en una clase
- **THEN** se ignora y la respuesta lleva los números reales

#### Scenario: Sin consultas por curso
- **GIVEN** un colegio con 1 curso y otro con 10 cursos con clases y alumnos
- **WHEN** se pide `GET /api/courses` en cada uno
- **THEN** el número de consultas a la base de datos es el mismo

### Requirement: Número de alumnos en el listado de cursos
La columna «Alumnos» de la tabla de `/cursos` y su dato en las tarjetas MUST mostrar el `studentCount` del curso y, solo si hay alumnos sin clase (el del curso menos la suma de los de sus clases, mayor que cero), «({N} sin clase)» detrás: «25» o «25 (3 sin clase)». Un curso sin alumnos MUST mostrar «0». La columna «Clases» MUST mostrar el número de cada clase entre paréntesis detrás de su nombre. La búsqueda MUST NOT buscar en estos números.

#### Scenario: Curso con alumnos sin clase
- **GIVEN** «1º Primaria» con «A» (12), «B» (10) y 3 alumnos sin clase (`studentCount: 25`)
- **WHEN** se abre `/cursos` a 1280 px o a 360 px
- **THEN** se ve «2 clases: A (12), B (10)» y «25 (3 sin clase)» en la tabla o en la tarjeta

#### Scenario: Todos con clase
- **GIVEN** «2º Primaria» con «A» (5) y `studentCount: 5`
- **THEN** su columna «Alumnos» muestra «5», sin «sin clase»

### Requirement: Número de alumnos de cada clase en la edición del curso
En `/cursos/:id/editar`, cada fila de una clase que ya existía y tiene alumnos MUST mostrar bajo su nombre «{N} alumnos» («1 alumno» en singular), ligado al campo por `aria-describedby`; con `0` alumnos y en las filas nuevas MUST NOT mostrar nada. El número MUST ser el que se cargó con el curso, MUST NOT formar parte del cuerpo del `PUT` ni contar como cambio del formulario, y MUST seguir a su fila aunque se quiten o se reordenen otras. La creación de un curso MUST NOT mostrar números.

#### Scenario: Clase con alumnos
- **GIVEN** «1º Primaria» con «A» (12 alumnos) y «B» (0)
- **WHEN** se abre su edición
- **THEN** la fila «A» muestra «12 alumnos», la fila «B» no muestra número y «Guardar» sigue deshabilitado

#### Scenario: El número no viaja
- **WHEN** se renombra «A» y se guarda
- **THEN** el cuerpo del `PUT` no lleva `studentCount`

### Requirement: Confirmar al quitar una clase con alumnos
En la edición de un curso, pulsar «Quitar» en una fila de una clase que ya existía y tiene alumnos MUST abrir un diálogo con el título «¿Quitar la clase {nombre}?» como nombre accesible, el texto «La clase {nombre} tiene {N} alumnos. Al guardar el curso quedarán en él sin clase» (en singular con 1) y los botones «Cancelar», con el foco inicial, y «Quitar clase»; sin botón «X» de cabecera. {nombre} MUST ser el nombre que hay escrito en la fila, o «la clase {posición}» si está vacío, y {N} el número que se cargó con el curso. «Cancelar», Escape o el clic fuera MUST cerrar el diálogo sin quitar la fila y devolver el foco a su botón «Quitar»; «Quitar clase» MUST quitar la fila del formulario (como sin diálogo) y llevar el foco a «Añadir clase» cuando el diálogo termina de cerrarse. Nada MUST guardarse hasta «Guardar». Quitar una fila nueva o la de una clase con `0` alumnos MUST NOT abrir el diálogo. Los textos MUST pintarse como texto plano.

#### Scenario: Confirmar
- **GIVEN** la edición de «1º Primaria» con «A» (12 alumnos) y «B»
- **WHEN** se pulsa «Quitar la clase 1»
- **THEN** se abre «¿Quitar la clase A?» con «La clase A tiene 12 alumnos. Al guardar el curso quedarán en él sin clase» y el foco en «Cancelar»
- **AND** al pulsar «Quitar clase» la fila «A» desaparece, el foco pasa a «Añadir clase» y no se ha enviado nada

#### Scenario: Cancelar
- **WHEN** se abre el diálogo de «A» y se pulsa «Cancelar» o Escape
- **THEN** la fila «A» sigue con su nombre y su tutor, el foco vuelve a su «Quitar» y «Guardar» sigue como estaba

#### Scenario: Sin diálogo
- **WHEN** se quita la fila de una clase con 0 alumnos o una fila añadida en esta edición
- **THEN** la fila desaparece sin diálogo

#### Scenario: Nombre editado o vacío
- **GIVEN** que la fila de «A» se ha renombrado a «Grupo A», o se ha vaciado
- **WHEN** se pulsa su «Quitar»
- **THEN** el diálogo dice «¿Quitar la clase Grupo A?», o «¿Quitar la clase 1?» con el nombre vacío

#### Scenario: Accesibilidad
- **WHEN** el diálogo está abierto
- **THEN** `axe` no encuentra violaciones y el diálogo se anuncia por su título

### Requirement: Alumnos en los cursos de extremo a extremo
El E2E de cursos MUST cubrir, contra el build servido con `vite preview` y un backend real, que un curso con dos clases y alumnos creados por la API (con y sin clase) muestra en `/cursos` el número de cada clase y «Alumnos» con «(N sin clase)»; que en su edición la fila de una clase con alumnos muestra el número; que quitarla abre el diálogo, que «Cancelar» la conserva y que «Quitar clase» la quita; que tras guardar `/cursos` muestra los alumnos de esa clase como «sin clase» y `/alumnos` los muestra con «Sin clase»; que quitar una clase sin alumnos no abre el diálogo; y que a 360 px no hay desplazamiento horizontal con el diálogo abierto ni en las tarjetas.

#### Scenario: Quitar una clase con alumnos
- **WHEN** se ejecuta el E2E
- **THEN** el diálogo aparece con el número, cancelar no cambia nada, confirmar y guardar dejan a los alumnos «sin clase» en `/cursos` y en `/alumnos`

#### Scenario: Clase vacía
- **WHEN** se quita una clase sin alumnos en el E2E
- **THEN** no aparece el diálogo

## MODIFIED Requirements

### Requirement: Contrato de los cursos en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/courses` (`createCourse`), `GET /api/courses` (`listCourses`), `GET /api/courses/{id}` (`getCourse`), `PUT /api/courses/{id}` (`updateCourse`), `GET /api/courses/{id}/impact` (`getCourseDeletionImpact`) y `DELETE /api/courses/{id}` (`deleteCourse`), todos con seguridad Bearer, con los esquemas `CreateCourseRequest` (`name` y `classes[]` con `name`), `UpdateCourseRequest` (`name` y `classes[]` con `id` opcional en formato UUID, `name` y `tutorId` opcional, que es un UUID o `null`), `Course` (`id`, `name`, `createdAt` en ISO 8601, `classes` y `studentCount`, el número de alumnos del curso con y sin clase), `SchoolClass` (`id`, `name`, `tutor`, que es `null` si la clase no tiene tutor o un `TutorSummary` con `id`, `firstName` y `lastName`, y `studentCount`, el número de alumnos de la clase), `CourseImpact` (`classCount` y `studentCount`, enteros no negativos) y sus respuestas. Los dos `studentCount` MUST ser obligatorios, enteros y no negativos, y su descripción MUST decir que los alumnos del curso sin clase son la diferencia entre el del curso y la suma de los de sus clases. La descripción de `tutorId` MUST indicar que omitirlo no cambia el tutor, que `null` lo quita y que un UUID lo asigna. `POST` MUST declarar `201`, `400`, `401`, `409`, `500` y `503`; `GET /api/courses`, `200`, `401`, `500` y `503`; `GET /api/courses/{id}` y `GET /api/courses/{id}/impact`, `200`, `401`, `404`, `500` y `503`; `PUT /api/courses/{id}`, `200`, `400`, `401`, `404`, `409` (`COURSE_ALREADY_EXISTS`, `COURSE_CHANGED` o `PROFESSOR_ALREADY_TUTOR`), `500` y `503`; `DELETE /api/courses/{id}`, `200`, `401`, `404`, `500` y `503`. El enum `FieldErrorCode` MUST incluir `DUPLICATE` y `NOT_FOUND`. Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Operaciones documentadas
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se consultan `createCourse`, `listCourses`, `getCourse`, `updateCourse`, `getCourseDeletionImpact` y `deleteCourse`
- **THEN** todas exigen Bearer y declaran las respuestas indicadas; el `201` y los `200` de lectura y edición devuelven cada curso con `createdAt` y `studentCount` y sus clases con su `tutor` (o `null`) y su `studentCount`, y los del impacto y del borrado, un `CourseImpact`

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias y `api/schema.test.ts` fija las seis operaciones y los esquemas, también `createdAt`, el `id` opcional y el `tutorId` opcional (`string | null`) de `UpdateCourseRequest`, `CourseImpact`, `TutorSummary` y el `studentCount` (`number`) de `Course` y de `SchoolClass`

### Requirement: Página de listado de cursos
La página `/cursos` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con cursos, desde 768 px de ancho MUST mostrar una tabla con las columnas Curso, Clases, Tutores, Alumnos, Creado y Acciones y una fila por curso, con el nombre del curso como cabecera de su fila; por debajo de 768 px MUST mostrar una tarjeta por curso con el nombre como `h2` y los mismos datos, y MUST NOT pintar las dos estructuras a la vez. Cada curso MUST mostrar sus clases con el número de alumnos de cada una como «N clases: A (12), B (10)» («1 clase: A (0)» en singular), sus alumnos (ver «Número de alumnos en el listado de cursos»), «Sin tutor» mientras ninguna clase tenga tutor y la fecha de creación con el formato del idioma activo (`Intl.DateTimeFormat(idioma, { dateStyle: 'medium' })`), en el orden que da el servidor. Cada fila y cada tarjeta MUST tener un enlace «Editar» a `/cursos/<id>/editar` y un botón «Borrar» que abre el diálogo de borrado, visibles para los dos roles, cuyos nombres accesibles incluyan el nombre del curso («Editar 1º Primaria», «Borrar 1º Primaria»). Sin cursos, MUST mostrar «Todavía no hay cursos». El botón «Crear curso» a `/cursos/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Curso «{nombre}» creado» en un `role="status"`, y si llega desde la edición, «Curso «{nombre}» actualizado»; tras borrar un curso, «Curso «{nombre}» eliminado». Los nombres MUST pintarse como texto plano. La página MUST NOT mostrar acciones, columnas ni botones de funcionalidades que aún no existen (horario).

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «1º Primaria» (clases «A» y «B») y una ventana de 1280 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tabla con las columnas Curso, Clases, Tutores, Alumnos, Creado y Acciones, y la fila «1º Primaria» con «2 clases: A (0), B (0)», «Sin tutor», «0», su fecha, el enlace «Editar» y el botón «Borrar»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tarjeta por curso con su nombre como `h2`, los mismos datos, el enlace «Editar» y el botón «Borrar», y ninguna tabla

#### Scenario: Una clase
- **GIVEN** el curso «2º Primaria» con la clase «A»
- **THEN** se muestra «1 clase: A (0)»

#### Scenario: Fecha según el idioma
- **GIVEN** un curso creado el 19 de octubre de 2026
- **WHEN** el idioma es el castellano o el inglés
- **THEN** la fecha se muestra con el formato de ese idioma

#### Scenario: Listado vacío
- **WHEN** un usuario de un colegio sin cursos abre `/cursos`
- **THEN** ve «Todavía no hay cursos» y el botón «Crear curso»

#### Scenario: Error al cargar
- **GIVEN** que la API responde `503`
- **WHEN** se abre `/cursos`
- **THEN** se ve un aviso con `role="alert"` y «Reintentar», que vuelve a pedir la lista

#### Scenario: Aviso tras crear
- **WHEN** se llega a `/cursos` tras crear «1º Primaria»
- **THEN** se ve «Curso «1º Primaria» creado» y el curso en el listado

#### Scenario: Aviso tras editar
- **WHEN** se llega a `/cursos` tras editar un curso y llamarlo «1º Primaria Tarde»
- **THEN** se ve «Curso «1º Primaria Tarde» actualizado» y el listado muestra el nombre nuevo

#### Scenario: Enlace de edición
- **WHEN** un `MEMBER` pulsa «Editar 1º Primaria»
- **THEN** llega a `/cursos/<id>/editar` de ese curso

#### Scenario: Sin acciones futuras
- **WHEN** se abre `/cursos` con cursos
- **THEN** no hay botones ni columnas de horario

### Requirement: Página de edición de un curso
La página `/cursos/:id/editar` MUST colgar del layout de las páginas autenticadas, sin guarda de rol, y pedir el curso una sola vez (también con `StrictMode`), con un indicador `role="status"` mientras carga. Con un `404` MUST mostrar «Este curso no existe o ya no está disponible» con un enlace a «Cursos»; con un `503` o un error de red, «No se ha podido cargar el curso» con «Reintentar». Con el curso cargado MUST mostrar el mismo formulario que la creación (nombre del curso y una fila por clase, en el orden del servidor), relleno con los datos actuales, con las mismas reglas compartidas al enviar, los mismos límites de filas (añadir hasta 12, quitar cualquiera salvo la última) y la misma guarda síncrona contra el doble envío, y además el tutor de cada fila (ver «Elegir el tutor de cada clase en la edición del curso»). Quitar una fila MUST NOT borrar nada hasta guardar, y solo MUST pedir confirmación si es una clase que ya existía y tiene alumnos (ver «Confirmar al quitar una clase con alumnos»). «Guardar» MUST estar deshabilitado mientras el formulario no tenga cambios reales respecto a lo cargado (comparando los valores recortados y con los espacios colapsados, también el orden y el número de filas y el tutor elegido) y mientras se envía. Con el `200` MUST navegar a `/cursos` reemplazando la entrada del historial y pasar el nombre para el aviso «Curso «{nombre}» actualizado». Un `400` MUST marcar sus campos; un `409 COURSE_ALREADY_EXISTS`, el nombre del curso con «Ya existe un curso con este nombre. Usa otro» y el foco en él; un `409 COURSE_CHANGED` MUST mostrar con `role="alert"` «Otra persona ha cambiado este curso. Recárgalo para ver la versión actual (se perderán tus cambios)» y un botón «Recargar» que vuelve a pedir el curso y rellena el formulario con lo guardado; un `409 PROFESSOR_ALREADY_TUTOR`, lo que dice «Elegir el tutor de cada clase en la edición del curso»; un `404`, el mensaje de curso no disponible; un `503`, un `500` o un error de red MUST mostrar «No se pudo guardar el curso. Inténtalo de nuevo» con `role="alert"`, conservando lo escrito. «Cancelar» MUST volver a `/cursos` sin guardar.

#### Scenario: Formulario relleno
- **GIVEN** el curso «1º Primaria» con las clases «A» y «B»
- **WHEN** se abre `/cursos/<id>/editar`
- **THEN** el nombre es «1º Primaria», hay dos filas «A» y «B» y «Guardar» está deshabilitado

#### Scenario: Sin cambios reales
- **WHEN** se escribe un espacio al final del nombre, se cambia una clase y se vuelve a dejar como estaba, o se vuelve a elegir el tutor que ya tenía una fila
- **THEN** «Guardar» sigue deshabilitado

#### Scenario: Guardar los cambios
- **WHEN** se cambia el nombre a «1º Primaria Tarde», se renombra «A» a «Grupo A», se añade «C» y se pulsa «Guardar»
- **THEN** se envía un solo `PUT` con «Grupo A» y «B» con sus `id` y «C» sin `id`, y la aplicación navega a `/cursos` con «Curso «1º Primaria Tarde» actualizado»

#### Scenario: Nombre que ya existe
- **GIVEN** que la API responde `409 COURSE_ALREADY_EXISTS`
- **THEN** el nombre muestra «Ya existe un curso con este nombre. Usa otro», tiene el foco y el formulario conserva lo escrito

#### Scenario: Curso cambiado
- **GIVEN** que la API responde `409 COURSE_CHANGED`
- **THEN** se ve el aviso de curso cambiado con «Recargar»
- **AND** al pulsar «Recargar» se vuelve a pedir el curso y el formulario muestra lo guardado

#### Scenario: Curso no disponible
- **WHEN** se abre `/cursos/<id>/editar` con un curso que no existe o es de otro colegio, o el `PUT` responde `404`
- **THEN** se ve «Este curso no existe o ya no está disponible» con un enlace a «Cursos»

#### Scenario: Error del servidor al guardar
- **GIVEN** que la API responde `503`
- **THEN** se ve «No se pudo guardar el curso. Inténtalo de nuevo» con `role="alert"`, sin mensajes técnicos, y lo escrito se conserva

#### Scenario: Cancelar
- **WHEN** se cambian campos y se pulsa «Cancelar»
- **THEN** la aplicación vuelve a `/cursos` sin enviar nada

### Requirement: Cursos de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado vacío, crea «1º Primaria» con las clases «A» y «B» desde «Cursos» y lo ve en el listado con «2 clases: A (0), B (0)», «Sin tutor», «0» alumnos y su fecha; que crear otra vez el mismo nombre muestra el error en el campo; que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Cursos» en la navegación, crea un curso, lo edita y lo borra; que la búsqueda filtra sin distinguir acentos, muestra el estado sin resultados y se limpia; que el listado es una tabla a 1280 px y tarjetas sin desplazamiento horizontal a 360 px; que un administrador edita un curso desde «Editar» (cambia el nombre, renombra una clase, añade una y quita otra) y ve el aviso y los cambios en el listado; que renombrar a un nombre ya usado muestra el error en el campo; que si otra persona quita una clase entre la carga y el guardado (por la API) se ve el aviso de curso cambiado y «Recargar» muestra lo guardado; que un administrador borra un curso con varias clases desde el diálogo, que muestra el número de clases, y el curso desaparece también tras recargar; que «Cancelar» no borra nada; que si otra persona borra el curso (por la API) entre la apertura del diálogo y la confirmación se ve «Ese curso ya no existe»; y lo que dice «Alumnos en los cursos de extremo a extremo».

#### Scenario: Administrador
- **WHEN** se ejecuta el E2E del administrador
- **THEN** crea el curso, lo ve en el listado con sus clases, «Sin tutor» y la fecha, y recibe el error al repetir el nombre

#### Scenario: Miembro
- **WHEN** se ejecuta el E2E del miembro
- **THEN** ve «Cursos», no ve «Usuarios», crea un curso, lo edita y lo borra

#### Scenario: Búsqueda
- **WHEN** se ejecuta el E2E de la búsqueda con tres cursos
- **THEN** «educacion» encuentra «Educación Infantil», «XYZ» muestra el estado sin resultados y «Limpiar búsqueda» vuelve a mostrar los tres

#### Scenario: Tabla y tarjetas
- **WHEN** se ejecuta el E2E a 1280 px y a 360 px
- **THEN** a 1280 px el listado es una tabla y a 360 px son tarjetas, sin desplazamiento horizontal

#### Scenario: Edición
- **WHEN** se ejecuta el E2E de la edición
- **THEN** el administrador guarda los cambios y los ve en el listado con «Curso «…» actualizado», el nombre repetido muestra el error en el campo y el curso cambiado muestra el aviso con «Recargar»

#### Scenario: Borrado
- **WHEN** se ejecuta el E2E del borrado
- **THEN** el diálogo muestra las clases del curso, «Borrar curso» lo quita del listado con «Curso «…» eliminado» (también tras recargar), «Cancelar» no borra y un curso borrado por otra persona muestra «Ese curso ya no existe»
