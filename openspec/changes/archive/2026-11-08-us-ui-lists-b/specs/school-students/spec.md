## MODIFIED Requirements

### Requirement: Página de listado de alumnos
`/alumnos` MUST colgar de `AuthenticatedLayout` sin restricción de rol, seguir el patrón de las páginas de listado (ver `list-page-layout`): cabecera con el sobretítulo «Comunidad escolar», el `h1` «Alumnos», la descripción «Consulta y organiza el alumnado por curso, clase, comedor y beca.» y «Crear alumno», y el bloque «Alumnado»; pedir la lista una sola vez (también con `StrictMode`) y mostrar un `role="status"` dentro del bloque mientras carga. Desde 768 px MUST mostrar una tabla, con el nombre del bloque, con las columnas «Nombre» («Apellidos, Nombre» en un `th scope="row"`), «Curso y clase», «Comedor» y «Acciones»; por debajo, una fila de lista (`li`, sin tarjeta anidada) por alumno con el nombre como `h3`. «Curso y clase» MUST decir «1º Primaria A», «1º Primaria · Sin clase» o «Sin curso»; «Comedor», «Sí · Con beca», «Sí» o «No». Cada fila MUST llevar un enlace «Editar» hacia `/alumnos/<id>/editar` con el nombre accesible «Editar {Apellidos, Nombre}» y, en el estado de la navegación, la búsqueda actual de la URL del listado (`{ listSearch: "?curso=…&pagina=…" }`, o `""` sin parámetros), y junto a él un botón «Borrar» (`outline-danger`) con el nombre accesible «Borrar {Apellidos, Nombre}» que abre el diálogo de borrado; si no caben, las acciones MUST pasar a la línea siguiente. MUST respetar el orden del servidor, mostrar siempre «Crear alumno» (hacia `/alumnos/nuevo`) en la cabecera, «Todavía no hay alumnos» con «Crear alumno» dentro del bloque si no hay ninguno y, dentro del bloque, un `role="alert"` con «Reintentar» si falla. MUST leer del estado de la navegación, con una guarda de tipo, el aviso `{ studentCreated: <texto no vacío> }` o `{ studentUpdated: <texto no vacío> }` y mostrar «Alumno «{nombre}» creado» o «Alumno «{nombre}» actualizado» como texto plano en un `role="status"`, entre la cabecera y el bloque, que se conserva al cambiar los filtros o la página. Un aviso de la propia página (alumno eliminado o que ya no existe), en el mismo sitio, MUST sustituir al de llegada. MUST NOT mostrar el tipo de comida ni las observaciones.

#### Scenario: Tabla y filas de móvil
- **GIVEN** «Juan García» en «1º Primaria» A con comedor y beca, y «Ana Álvarez» sin curso ni comedor
- **WHEN** se abre `/alumnos` a 1280 px y a 360 px
- **THEN** la tabla y las filas de móvil muestran «Álvarez, Ana | Sin curso | No» y «García, Juan | 1º Primaria A | Sí · Con beca», cada uno con su enlace «Editar» y su botón «Borrar»; a 360 px cada nombre es un `h3` y no hay tarjetas dentro del bloque

#### Scenario: Cabecera de la página
- **WHEN** se abre `/alumnos`
- **THEN** se ve el sobretítulo «Comunidad escolar», el `h1` «Alumnos», la descripción y «Crear alumno», y debajo el bloque «Alumnado»

#### Scenario: Editar con los filtros
- **GIVEN** `/alumnos?comedor=si&pagina=2`
- **WHEN** se pulsa «Editar» en «García, Juan»
- **THEN** se navega a `/alumnos/<id de Juan>/editar` con `{ listSearch: "?comedor=si&pagina=2" }` en el estado

#### Scenario: Vacío y error
- **WHEN** no hay alumnos, o la lista responde `503`
- **THEN** se ve dentro del bloque «Todavía no hay alumnos» con «Crear alumno», o el error con «Reintentar» que vuelve a pedirla

#### Scenario: Aviso de llegada
- **WHEN** se llega con `{ studentCreated: "<b>Juan</b> García" }` o con `{ studentUpdated: "<b>Juan</b> García" }`
- **THEN** se ve, fuera del bloque, «Alumno «<b>Juan</b> García» creado» o «… actualizado» como texto, sin interpretar el HTML
- **AND** un estado con otra forma (`{ studentUpdated: 3 }`) no muestra aviso

#### Scenario: Aviso de borrado en lugar del de llegada
- **GIVEN** que se llegó con «Alumno «Juan García» actualizado»
- **WHEN** se borra a «Ana Álvarez»
- **THEN** solo se ve «Alumno «Ana Álvarez» eliminado»

#### Scenario: Escritorio con la barra lateral
- **GIVEN** una ventana de 1280 px y un alumno con un nombre largo, curso, clase, comedor con beca y sus dos acciones
- **WHEN** se abre `/alumnos`
- **THEN** ni la página ni la tabla se desplazan en horizontal

### Requirement: Total y paginación del listado de alumnos
Con alumnos en el colegio, `/alumnos` MUST mostrar en la cabecera del bloque el total de alumnos cargados («N alumnos», «1 alumno» en singular) y MUST paginar de 20 en 20 en el navegador con el componente de paginación de los profesores («Anterior», «Página X de N» en una región `aria-live="polite"` y «Siguiente»), que no se pinta con una sola página. La tabla y las filas de móvil MUST mostrar la misma página. Una página fuera de rango MUST acotarse a la última. Al cambiar de página, la vista MUST desplazarse al principio del bloque sin mover el foco. MUST NOT hacer peticiones nuevas al paginar.

#### Scenario: Más de una página
- **GIVEN** 45 alumnos
- **WHEN** se abre `/alumnos` a 1280 px o a 360 px
- **THEN** se ven «45 alumnos», los 20 primeros por apellidos y nombre y «Página 1 de 3»
- **AND** en la página 3 se ven 5 alumnos

#### Scenario: Una sola página
- **GIVEN** 3 alumnos
- **THEN** se ve «3 alumnos» y no hay paginación

#### Scenario: La vista vuelve al bloque
- **GIVEN** 45 alumnos
- **WHEN** se pulsa «Siguiente»
- **THEN** la vista vuelve al principio del bloque «Alumnado» y el foco se queda en la paginación

### Requirement: Filtros del listado de alumnos
Con alumnos en el colegio, `/alumnos` MUST ofrecer dentro del bloque, debajo de su cabecera y encima del listado, junto a la búsqueda (con una lupa decorativa en el campo), cuatro desplegables con etiqueta visible, opcionales y combinables con ella (un alumno se muestra solo si cumple todos):
- **Curso:** «Todos los cursos», los cursos que tienen algún alumno cargado, en orden natural en castellano («2º» antes que «10º»), y «Sin curso» si algún alumno no tiene curso.
- **Clase:** desactivado, con una ayuda ligada por `aria-describedby`, mientras no se elija un curso concreto; con uno, «Todas las clases», las clases de ese curso que tienen algún alumno, en orden natural, y «Sin clase» si algún alumno de ese curso no tiene clase. Cambiar de curso MUST volver a «Todas las clases».
- **Comedor:** «Todos», «Come en el comedor» y «No come en el comedor».
- **Beca:** desactivado, con una ayuda ligada, salvo con «Come en el comedor»; entonces «Todos», «Con beca» y «Sin beca». Dejar «Come en el comedor» MUST volver a «Todos».
Cambiar cualquier filtro o el texto de búsqueda MUST volver a la página 1. El contador de la cabecera MUST seguir diciendo el total; mientras haya algún filtro o texto, una línea dentro del bloque MUST decir «Mostrando N de M alumnos» en un `role="status"`; sin filtros ni texto, esa línea MUST NOT existir; sin coincidencias, MUST decir «No hay alumnos que coincidan con los filtros», con «Limpiar filtros», que quita todos los filtros y el texto, vuelve a la página 1 y lleva el foco al campo de búsqueda; sin listado ni paginación. Sin alumnos en el colegio, MUST mostrar el vacío de siempre sin barra de filtros. MUST NOT filtrar ni mostrar el tipo de comida ni las observaciones.

#### Scenario: Curso y clase
- **GIVEN** alumnos en «1º Primaria» A, en «1º Primaria» sin clase, en «2º Primaria» B y uno sin curso
- **WHEN** se abre `/alumnos`
- **THEN** «Curso» ofrece «Todos los cursos», «1º Primaria», «2º Primaria» y «Sin curso», y «Clase» está desactivado con su ayuda
- **AND** al elegir «1º Primaria», «Clase» ofrece «Todas las clases», «A» y «Sin clase»; al elegir «A» se ven solo los de 1º A
- **AND** al cambiar a «2º Primaria», «Clase» vuelve a «Todas las clases»
- **AND** «Sin curso» muestra solo el alumno sin curso

#### Scenario: Comedor y beca
- **GIVEN** alumnos con comedor y beca, con comedor sin beca y sin comedor
- **WHEN** se elige «Come en el comedor»
- **THEN** se ven solo los inscritos y «Beca» se activa; «Con beca» y «Sin beca» filtran entre ellos
- **AND** al elegir «No come en el comedor» se ven solo los no inscritos y «Beca» vuelve a «Todos» y se desactiva

#### Scenario: Combinados y vuelta a la página 1
- **GIVEN** que se está en la página 2
- **WHEN** se escribe «juan», se elige «1º Primaria» y «Come en el comedor»
- **THEN** se ven solo los alumnos que cumplen las tres condiciones, desde la página 1, «Mostrando N de M alumnos» dentro del bloque y el total en su cabecera

#### Scenario: Sin coincidencias
- **WHEN** los filtros no dejan ningún alumno
- **THEN** se ve «No hay alumnos que coincidan con los filtros» con «Limpiar filtros», sin tabla ni paginación
- **AND** al pulsar «Limpiar filtros» vuelven todos los alumnos en la página 1, los desplegables a su primera opción, la búsqueda vacía y con el foco
