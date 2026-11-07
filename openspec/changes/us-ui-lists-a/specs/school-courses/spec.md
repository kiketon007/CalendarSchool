## MODIFIED Requirements

### Requirement: Página de listado de cursos
La página `/cursos` MUST colgar del layout de las páginas autenticadas, sin guarda de rol, y seguir el patrón de las páginas de listado (ver `list-page-layout`): cabecera con el sobretítulo «Estructura académica», el `h1` «Cursos», la descripción «Gestiona los cursos del colegio, sus clases y sus tutores.» y el botón «Crear curso», y el bloque «Todos los cursos» con el contador «N cursos». MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con cursos, desde 768 px de ancho MUST mostrar una tabla con las columnas Curso, Clases, Tutores, Alumnos, Creado y Acciones y una fila por curso, con el nombre del curso como cabecera de su fila; por debajo de 768 px MUST mostrar una tarjeta por curso con el nombre como `h3` y los mismos datos, y MUST NOT pintar las dos estructuras a la vez. Cada curso MUST mostrar sus clases con el número de alumnos de cada una como «N clases: A (12), B (10)» («1 clase: A (0)» en singular), sus alumnos (ver «Número de alumnos en el listado de cursos»), «Sin tutor» mientras ninguna clase tenga tutor y la fecha de creación con el formato del idioma activo (`Intl.DateTimeFormat(idioma, { dateStyle: 'medium' })`), en el orden que da el servidor. Cada fila y cada tarjeta MUST tener un enlace «Editar» a `/cursos/<id>/editar` y un botón «Borrar» que abre el diálogo de borrado, visibles para los dos roles, cuyos nombres accesibles incluyan el nombre del curso («Editar 1º Primaria», «Borrar 1º Primaria»), y un enlace «Carga horaria» a `/cursos/<id>/carga`, también para los dos roles, con el nombre accesible «Carga horaria de 1º Primaria». Sin cursos, MUST mostrar «Todavía no hay cursos» dentro del bloque. El botón «Crear curso» a `/cursos/nuevo` MUST estar siempre visible en la cabecera. Si llega desde la creación, MUST mostrar «Curso «{nombre}» creado» en un `role="status"`, y si llega desde la edición, «Curso «{nombre}» actualizado»; tras borrar un curso, «Curso «{nombre}» eliminado»; estos avisos MUST ir entre la cabecera y el bloque. Los nombres MUST pintarse como texto plano. La página MUST NOT mostrar acciones, columnas ni botones de funcionalidades que aún no existen (horario).

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «1º Primaria» (clases «A» y «B») y una ventana de 1280 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve, dentro del bloque «Todos los cursos» con «1 curso», una tabla con las columnas Curso, Clases, Tutores, Alumnos, Creado y Acciones, y la fila «1º Primaria» con «2 clases: A (0), B (0)», «Sin tutor», «0», su fecha, el enlace «Carga horaria», el enlace «Editar» y el botón «Borrar»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tarjeta por curso con su nombre como `h3`, los mismos datos, el enlace «Carga horaria», el enlace «Editar» y el botón «Borrar», y ninguna tabla

#### Scenario: Cabecera de la página
- **WHEN** un usuario abre `/cursos`
- **THEN** ve el sobretítulo «Estructura académica», el `h1` «Cursos», la descripción y «Crear curso»

#### Scenario: Una clase
- **GIVEN** el curso «2º Primaria» con la clase «A»
- **THEN** se muestra «1 clase: A (0)»

#### Scenario: Fecha según el idioma
- **GIVEN** un curso creado el 19 de octubre de 2026
- **WHEN** el idioma es el castellano o el inglés
- **THEN** la fecha se muestra con el formato de ese idioma

#### Scenario: Listado vacío
- **WHEN** un usuario de un colegio sin cursos abre `/cursos`
- **THEN** ve «Todavía no hay cursos» dentro del bloque, sin contador ni búsqueda, y el botón «Crear curso»

#### Scenario: Error al cargar
- **GIVEN** que la API responde `503`
- **WHEN** se abre `/cursos`
- **THEN** se ve dentro del bloque un aviso con `role="alert"` y «Reintentar», que vuelve a pedir la lista

#### Scenario: Aviso tras crear
- **WHEN** se llega a `/cursos` tras crear «1º Primaria»
- **THEN** se ve «Curso «1º Primaria» creado» fuera del bloque y el curso en el listado

#### Scenario: Aviso tras editar
- **WHEN** se llega a `/cursos` tras editar un curso y llamarlo «1º Primaria Tarde»
- **THEN** se ve «Curso «1º Primaria Tarde» actualizado» y el listado muestra el nombre nuevo

#### Scenario: Enlace de edición
- **WHEN** un `MEMBER` pulsa «Editar 1º Primaria»
- **THEN** llega a `/cursos/<id>/editar` de ese curso

#### Scenario: Sin acciones futuras
- **WHEN** se abre `/cursos` con cursos
- **THEN** no hay botones ni columnas de horario

#### Scenario: Enlace a la carga horaria
- **WHEN** un `MEMBER` o un `ADMIN` pulsa «Carga horaria de 1º Primaria»
- **THEN** llega a `/cursos/<id>/carga` de ese curso

### Requirement: Accesibilidad, responsive e i18n de los cursos
Las páginas `/cursos`, `/cursos/nuevo` y `/cursos/<id>/editar` MUST cumplir WCAG 2.1 AA: un `h1` por página, cada campo de formulario con su etiqueta visible, el campo de cada clase y su botón «Quitar clase» con un nombre accesible que identifique la fila, errores asociados a su campo (`aria-invalid` y `aria-describedby`) y foco visible. El campo de búsqueda del listado MUST tener su etiqueta «Buscar por nombre» como nombre accesible (visualmente oculta) y el mismo texto como `placeholder`, con una lupa decorativa. La tabla del listado MUST tener nombre (el título del bloque, «Todos los cursos»), cabeceras de columna y el nombre del curso como cabecera de fila, y el contenido del listado MUST NOT aparecer dos veces en el árbol de accesibilidad. Cada enlace «Editar» y cada botón «Borrar» MUST indicar en su nombre accesible el curso al que se refiere. El diálogo de borrado MUST tener nombre (su título), atrapar el foco mientras está abierto y cerrarse con Escape. A 360 px de ancho MUST NOT haber desplazamiento horizontal, y a 1280 px, con la barra lateral, tampoco en la tabla. Todos los textos MUST venir de `es.json` y `en.json`, también el número de clases y de alumnos con su plural, el contador del bloque y el indicador de resultados de la búsqueda.

#### Scenario: Sin violaciones
- **WHEN** se analizan las páginas con `axe` (WCAG 2.1 A y AA): el listado en tabla, en tarjetas, vacío, cargando, con error, sin resultados de búsqueda y con el aviso; el formulario de creación vacío y con errores; la edición cargada, con errores, con el curso no disponible y con el curso cambiado; y el diálogo de borrado cargando, con el impacto, con error y con el error al borrar
- **THEN** no hay violaciones

#### Scenario: Tabla con cabeceras
- **GIVEN** el listado en tabla
- **THEN** la tabla se llama «Todos los cursos», tiene cabeceras de columna y cada nombre de curso es la cabecera de su fila

#### Scenario: Búsqueda con nombre
- **GIVEN** el listado con cursos
- **THEN** el campo de búsqueda se llama «Buscar por nombre» y muestra ese texto mientras está vacío

#### Scenario: Fila identificable
- **GIVEN** un formulario con las clases «A» y «B»
- **THEN** el botón para quitar la segunda tiene un nombre como «Quitar la clase 2»

#### Scenario: Acciones identificables
- **GIVEN** el listado con «1º Primaria» y «2º Primaria»
- **THEN** sus enlaces se llaman «Editar 1º Primaria» y «Editar 2º Primaria», y sus botones, «Borrar 1º Primaria» y «Borrar 2º Primaria»

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/cursos` (también con el diálogo de borrado abierto), `/cursos/nuevo` y `/cursos/<id>/editar`
- **THEN** no hay desplazamiento horizontal

#### Scenario: Escritorio con la barra lateral
- **GIVEN** una ventana de 1280 px y un curso con sus cuatro acciones
- **WHEN** se abre `/cursos`
- **THEN** ni la página ni la tabla se desplazan en horizontal
