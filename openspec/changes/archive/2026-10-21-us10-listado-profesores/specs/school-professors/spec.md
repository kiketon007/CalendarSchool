## MODIFIED Requirements

### Requirement: Página de listado de profesores
La página `/profesores` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con profesores, MUST mostrar encima del listado el total («1 profesor», «N profesores»); desde 768 px MUST mostrar una tabla con las columnas Nombre, Cargo y Tutoría y una fila por profesor, con el nombre («Apellido, Nombre») como cabecera de su fila; por debajo de 768 px, una tarjeta por profesor con el nombre como `h2` y los mismos datos, sin pintar las dos estructuras a la vez. El cargo MUST mostrarse como «Director», «Jefe de estudios» o «Sin cargo»; la tutoría, como «Tutor de {curso} {clase}» («Tutor de 1º Primaria A») o «Sin tutoría» con el color secundario del tema. El listado MUST conservar el orden en que lo devuelve la API. Sin profesores, MUST mostrar «Todavía no hay profesores», sin total ni paginación. El botón «Crear profesor» a `/profesores/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Profesor «{nombre}» creado» en un `role="status"`. Los nombres MUST pintarse como texto plano y, si son largos, partirse en varias líneas sin truncarse. La página MUST NOT mostrar acciones ni columnas de funcionalidades que aún no existen (asignaturas, editar, borrar, búsqueda) ni recargar la lista por su cuenta.

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «García López, José María», jefe de estudios y tutor de la clase A de «1º Primaria», y una ventana de 1280 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve el total «1 profesor» y una tabla con las columnas Nombre, Cargo y Tutoría, y esa fila con «Jefe de estudios» y «Tutor de 1º Primaria A»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve una tarjeta por profesor con su nombre como `h2` y los mismos datos, y ninguna tabla

#### Scenario: Profesor sin cargo ni tutoría
- **GIVEN** un profesor sin cargo y que no tutoriza ninguna clase
- **THEN** se muestra «Sin cargo» y «Sin tutoría»

#### Scenario: Listado vacío
- **WHEN** un usuario de un colegio sin profesores abre `/profesores`
- **THEN** ve «Todavía no hay profesores» y el botón «Crear profesor», sin total ni paginación

#### Scenario: Error al cargar
- **GIVEN** que la API responde `503`
- **WHEN** se abre `/profesores`
- **THEN** se ve un aviso con `role="alert"` y «Reintentar», que vuelve a pedir la lista

#### Scenario: Aviso tras crear
- **WHEN** se llega a `/profesores` tras crear «Ana García»
- **THEN** se ve «Profesor «Ana García» creado», el profesor en el listado y la primera página

### Requirement: Accesibilidad, responsive e i18n de los profesores
Las páginas `/profesores` y `/profesores/nuevo` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo con su etiqueta visible, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. La tabla del listado MUST tener nombre (el título de la página), cabeceras de columna y el nombre del profesor como cabecera de fila, y el contenido del listado MUST NOT aparecer dos veces en el árbol de accesibilidad. La paginación MUST ser una `nav` con nombre y botones con texto visible, y el cambio de página MUST anunciarse sin perder el foco. A 360 px de ancho MUST NOT haber desplazamiento horizontal. Todos los textos (también el total con su plural, la tutoría y la paginación) MUST venir de `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan las páginas con `axe` (WCAG 2.1 A y AA): el listado en tabla, en tarjetas, con paginación, vacío, con error y con el aviso, y el formulario vacío, con errores y sin clases libres
- **THEN** no hay violaciones

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/profesores` (también con paginación y nombres largos) y `/profesores/nuevo`
- **THEN** no hay desplazamiento horizontal

### Requirement: Profesores de extremo a extremo
El E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, que un administrador recién registrado ve el listado de profesores vacío; que crea un curso y un profesor con esa clase desde «Profesores» y lo ve en el listado como «Tutor de {curso} {clase}» y como tutor en la columna «Tutores» de `/cursos`; que un `MEMBER` del mismo colegio (tarea `createUser`) ve «Profesores» y crea un profesor; que el formulario valida sin enviar nada; que una clase que ya tiene tutor no se puede elegir y, si otra persona se la da a alguien entre la carga y el envío (por la API), se ve el error en el campo; que borrar un curso con tutor deja al profesor en el listado con «Sin tutoría»; que el listado es una tabla a 1280 px y tarjetas sin desplazamiento horizontal a 360 px; y que, con más de 20 profesores creados por la API, se ven el total, la primera página y la segunda con «Siguiente».

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

## ADDED Requirements

### Requirement: Paginación del listado de profesores
Con más de 20 profesores, la página `/profesores` MUST mostrar 20 por página, en el orden de la API, y debajo del listado una navegación (`nav` con el nombre «Paginación de profesores») con el botón «Anterior», el indicador «Página X de N» y el botón «Siguiente». «Anterior» MUST estar deshabilitado en la primera página y «Siguiente» en la última. El indicador MUST anunciarse al cambiar de página (`aria-live="polite"`); el foco MUST quedarse en el botón pulsado o, si queda deshabilitado, pasar al otro botón; la vista MUST volver al principio del listado. La paginación MUST hacerse en el navegador, sin parámetros en `GET /api/professors`, y la página actual MUST vivir solo en el estado de la página (ni en la URL ni en almacenamiento): al abrir `/profesores` se empieza en la primera. Con 20 profesores o menos, MUST NOT mostrarse la navegación. La paginación MUST aplicarse igual a la tabla y a las tarjetas.

#### Scenario: Primera página
- **GIVEN** 45 profesores
- **WHEN** un usuario abre `/profesores`
- **THEN** ve los 20 primeros, «45 profesores», «Página 1 de 3» y «Anterior» deshabilitado

#### Scenario: Página siguiente
- **GIVEN** la primera página de 45 profesores
- **WHEN** pulsa «Siguiente»
- **THEN** ve del 21 al 40, «Página 2 de 3» se anuncia y el foco sigue en «Siguiente»

#### Scenario: Última página
- **GIVEN** la página 2 de 3
- **WHEN** pulsa «Siguiente»
- **THEN** ve los 5 últimos, «Página 3 de 3», «Siguiente» deshabilitado y el foco en «Anterior»

#### Scenario: Volver atrás
- **GIVEN** la página 3 de 3
- **WHEN** pulsa «Anterior»
- **THEN** ve del 21 al 40 y «Página 2 de 3»

#### Scenario: Veinte o menos
- **GIVEN** 20 profesores
- **WHEN** un usuario abre `/profesores`
- **THEN** ve los 20 y ninguna navegación de paginación

#### Scenario: Tarjetas paginadas
- **GIVEN** 45 profesores y una ventana de 360 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve 20 tarjetas y la navegación de paginación, sin desplazamiento horizontal
