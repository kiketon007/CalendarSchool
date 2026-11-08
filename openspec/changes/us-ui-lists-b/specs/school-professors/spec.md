## MODIFIED Requirements

### Requirement: Página de listado de profesores
La página `/profesores` MUST colgar del layout de las páginas autenticadas, sin guarda de rol, y seguir el patrón de las páginas de listado (ver `list-page-layout`): cabecera con el sobretítulo «Equipo docente», el `h1` «Profesores», la descripción «Organiza el equipo docente, sus asignaturas, tutorías y disponibilidad.» y los enlaces «Resumen de carga» y «Crear profesor», y el bloque «Equipo docente». MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar», los dos dentro del bloque. Con profesores, MUST mostrar en la cabecera del bloque el total («1 profesor», «N profesores»); desde 768 px MUST mostrar una tabla con las columnas Nombre, Cargo, Asignaturas, Tutoría y Acciones y una fila por profesor, con el nombre («Apellido, Nombre») como cabecera de su fila; por debajo de 768 px, una fila de lista (`li`, sin tarjeta anidada) por profesor con el nombre como `h3`, los mismos datos y sus acciones, sin pintar las dos estructuras a la vez. El cargo MUST mostrarse como «Director», «Jefe de estudios» o «Sin cargo»; la tutoría, como «Tutor de {curso} {clase}» («Tutor de 1º Primaria A») o «Sin tutoría» con el color secundario del tema. Cada profesor MUST tener un enlace «Editar» a `/profesores/{id}/editar` cuyo nombre accesible es «Editar {Apellido, Nombre}» y un botón «Borrar» cuyo nombre accesible es «Borrar {Apellido, Nombre}», que abre el diálogo de borrado; si no caben en su celda, las acciones MUST pasar a la línea siguiente. El listado MUST conservar el orden en que lo devuelve la API. Sin profesores, MUST mostrar «Todavía no hay profesores» dentro del bloque, sin total, búsqueda ni paginación. El enlace «Crear profesor» a `/profesores/nuevo` MUST estar siempre visible en la cabecera. Si llega desde la creación, MUST mostrar «Profesor «{nombre}» creado» en un `role="status"`; si llega desde la edición, «Profesor «{nombre}» actualizado» y, si otro profesor perdió su tutoría, «{nombre} queda sin tutoría»; estos avisos y los del borrado MUST ir entre la cabecera y el bloque. Los nombres y las asignaturas MUST pintarse como texto plano y, si son largos, partirse en varias líneas sin truncarse ni ensanchar la tabla. La página MUST NOT mostrar acciones ni columnas de funcionalidades que aún no existen ni recargar la lista por su cuenta, salvo cuando el diálogo de borrado descubre que un profesor ya no existe.

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «García López, José María», jefe de estudios y tutor de la clase A de «1º Primaria», y una ventana de 1280 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve, dentro del bloque «Equipo docente» con «1 profesor», una tabla con las columnas Nombre, Cargo, Asignaturas, Tutoría y Acciones, y esa fila con «Jefe de estudios», «Tutor de 1º Primaria A», el enlace «Editar» y el botón «Borrar»

#### Scenario: Filas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/profesores`
- **THEN** ve una fila por profesor con su nombre como `h3`, los mismos datos, el enlace «Editar» y el botón «Borrar», ninguna tabla y ninguna tarjeta dentro del bloque

#### Scenario: Cabecera de la página
- **WHEN** un usuario abre `/profesores`
- **THEN** ve el sobretítulo «Equipo docente», el `h1` «Profesores», la descripción, «Resumen de carga» y «Crear profesor»

#### Scenario: Profesor sin cargo ni tutoría
- **GIVEN** un profesor sin cargo y que no tutoriza ninguna clase
- **THEN** se muestra «Sin cargo» y «Sin tutoría»

#### Scenario: Listado vacío
- **WHEN** un usuario de un colegio sin profesores abre `/profesores`
- **THEN** ve «Todavía no hay profesores» dentro del bloque y el enlace «Crear profesor», sin total, campo de búsqueda ni paginación

#### Scenario: Error al cargar
- **GIVEN** que la API responde `503`
- **WHEN** se abre `/profesores`
- **THEN** se ve dentro del bloque un aviso con `role="alert"` y «Reintentar», que vuelve a pedir la lista

#### Scenario: Aviso tras crear
- **WHEN** se llega a `/profesores` tras crear «Ana García»
- **THEN** se ve «Profesor «Ana García» creado» fuera del bloque, el profesor en el listado y la primera página

#### Scenario: Aviso tras editar
- **WHEN** se llega a `/profesores` tras editar a «Ana García» quitándole la clase a «Luis Pérez»
- **THEN** se ve «Profesor «Ana García» actualizado. Luis Pérez queda sin tutoría» en un `role="status"`

### Requirement: Accesibilidad, responsive e i18n de los profesores
Las páginas `/profesores` y `/profesores/nuevo` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo de formulario con su etiqueta visible, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. La tabla y la lista del listado MUST tener nombre (el título del bloque, «Equipo docente»), la tabla cabeceras de columna y el nombre del profesor como cabecera de fila, y el contenido del listado MUST NOT aparecer dos veces en el árbol de accesibilidad. La paginación MUST ser una `nav` con nombre y botones con texto visible, y el cambio de página MUST anunciarse sin perder el foco. El campo de búsqueda MUST tener su etiqueta «Buscar por nombre, apellidos o asignatura» como nombre accesible (visualmente oculta), el mismo texto como `placeholder` y una lupa decorativa, y su resultado MUST anunciarse. El diálogo de borrado MUST tener nombre (su título), foco inicial en «Cancelar» y devolver el foco al botón «Borrar» al cancelar. A 360 px de ancho MUST NOT haber desplazamiento horizontal, y a 1280 px, con la barra lateral, tampoco en la tabla. Todos los textos (también el total con su plural, la tutoría, la paginación, la búsqueda, el sobretítulo, la descripción, el título del bloque y el borrado) MUST venir de `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan las páginas con `axe` (WCAG 2.1 A y AA): el listado en tabla, en filas de móvil, con paginación, con búsqueda, sin resultados, vacío, cargando, con error, con el aviso y con el diálogo de borrado abierto, y el formulario vacío, con errores y sin clases libres
- **THEN** no hay violaciones

#### Scenario: Búsqueda con nombre
- **GIVEN** el listado con profesores
- **THEN** el campo de búsqueda se llama «Buscar por nombre, apellidos o asignatura» y muestra ese texto mientras está vacío

#### Scenario: Tabla con nombre
- **GIVEN** el listado en tabla
- **THEN** la tabla se llama «Equipo docente», tiene cabeceras de columna y cada nombre de profesor es la cabecera de su fila

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/profesores` (también con paginación, búsqueda, nombres largos y el diálogo de borrado abierto) y `/profesores/nuevo`
- **THEN** no hay desplazamiento horizontal

#### Scenario: Escritorio con la barra lateral
- **GIVEN** una ventana de 1280 px y un profesor con muchas asignaturas, tutoría y sus tres acciones
- **WHEN** se abre `/profesores`
- **THEN** ni la página ni la tabla se desplazan en horizontal

### Requirement: Búsqueda de profesores por nombre y apellidos
Con profesores, la página `/profesores` MUST mostrar en la cabecera del bloque un campo `type="search"` con el nombre accesible «Buscar por nombre, apellidos o asignatura», que admita como mucho 100 caracteres. Al escribir, sin retraso ni petición al servidor, MUST mostrar solo los profesores en cuyo nombre, apellidos o nombres de sus asignaturas asignadas aparecen **todas** las palabras del texto, en cualquier orden y como parte de una palabra, sin distinguir mayúsculas, acentos (la `ñ` busca como `n`) ni espacios sobrantes; los guiones y apóstrofos MUST tratarse como texto normal. MUST conservar el orden de la API. Un texto vacío o solo con espacios MUST NOT filtrar. El contador de la cabecera MUST decir siempre «M profesores»; mientras hay texto, una línea dentro del bloque MUST ser un `role="status"` con «Mostrando N de M profesores»; sin texto, esa línea MUST NOT existir. Sin coincidencias, esa línea MUST decir «No hay profesores que coincidan con «X»» (el texto como texto plano), con un botón «Limpiar búsqueda» que vacía el campo, muestra todos y devuelve el foco al campo, sin paginación. MUST NOT buscar por cargo, tutoría, curso ni clase. El texto MUST vivir solo en el estado de la página (ni en la URL ni en almacenamiento).

#### Scenario: Por nombre
- **GIVEN** «García, Ana», «López, Juana» y «Pérez, Juan»
- **WHEN** escribe «juan»
- **THEN** ve «López, Juana» y «Pérez, Juan», en ese orden, «Mostrando 2 de 3 profesores» y, en la cabecera, «3 profesores»

#### Scenario: Por apellido
- **GIVEN** «Hernández, Eva», «Hernán, Pau» y «García, Ana»
- **WHEN** escribe «hern»
- **THEN** ve «Hernández, Eva» y «Hernán, Pau»

#### Scenario: Mayúsculas y acentos
- **WHEN** escribe «GARCIA», «garcía» o «  garcia  »
- **THEN** ve «García, Ana»

#### Scenario: Varias palabras en cualquier orden
- **GIVEN** «García, Ana», «García, Luis» y «Pérez, Ana»
- **WHEN** escribe «ana garcia» o «garcia ana»
- **THEN** ve solo «García, Ana»

#### Scenario: Guiones y apóstrofos
- **GIVEN** «García-López, José María» y «O'Neill, Mary»
- **WHEN** escribe «garcía-lópez», «lopez» u «o'neill»
- **THEN** ve el profesor correspondiente

#### Scenario: Sin resultados
- **WHEN** escribe «zzz»
- **THEN** ve «No hay profesores que coincidan con «zzz»» y «Limpiar búsqueda», sin paginación; al pulsarlo, el campo se vacía, vuelven todos y el foco está en el campo

#### Scenario: Texto vacío
- **WHEN** el campo está vacío o solo tiene espacios
- **THEN** ve todos los profesores y «M profesores» en la cabecera, sin ningún `role="status"` de resultados

#### Scenario: Texto como texto plano
- **WHEN** escribe «<b>x</b>»
- **THEN** el mensaje sin resultados muestra ese texto literal, sin interpretarlo como marcado

#### Scenario: Límite de caracteres
- **WHEN** intenta escribir más de 100 caracteres
- **THEN** el campo no admite más

#### Scenario: Por asignatura
- **GIVEN** «Ruiz, Eva» con Inglés asignado y «García, Ana» con Lengua
- **WHEN** escribe «ingl» o «eva ingles»
- **THEN** ve solo «Ruiz, Eva»
