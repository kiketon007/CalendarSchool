# list-page-layout Specification

## Purpose
TBD - created by archiving change us-ui-lists-a. Update Purpose after archive.
## Requirements
### Requirement: Estructura común de las páginas de listado
Una página de listado que adopte el diseño (`/cursos`, `/calendarios`, `/profesores`, `/profesores/resumen`, `/alumnos`, `/asignaturas` y `/reglas`) MUST pintar, dentro de su `main` (`Container fluid="xxl"`, con menos relleno por debajo de 992 px), en este orden: la cabecera con `PageHeader` (sobretítulo, el `h1` con el `id` de siempre y, donde la página devuelve el foco al título, su ref y `tabIndex={-1}`, la descripción y las acciones que la página ya tiene); los avisos de la página (creado, actualizado, eliminado, ya no existe, faltan profesores) y los textos de permisos, como hasta ahora; y el bloque del listado. Los avisos y los textos de permisos MUST quedar fuera del bloque. Todos los textos nuevos (sobretítulo, descripción, título del bloque, contador) MUST venir de `es.json` y `en.json` y MUST NOT incluir datos escritos a mano del colegio.

#### Scenario: Orden de la página
- **GIVEN** un administrador que llega a `/cursos` tras crear «1º Primaria»
- **WHEN** se pinta la página
- **THEN** se ve el sobretítulo, el `h1` «Cursos», la descripción y «Crear curso»; debajo, el aviso «Curso «1º Primaria» creado»; y debajo, el bloque del listado, que no contiene el aviso

#### Scenario: Foco tras borrar
- **GIVEN** el listado con un curso
- **WHEN** se borra desde su diálogo
- **THEN** el foco queda en el `h1` de la página, como antes

#### Scenario: Profesores y alumnos
- **WHEN** se abren `/profesores`, `/profesores/resumen` y `/alumnos` con datos
- **THEN** cada una muestra su sobretítulo («Equipo docente», «Carga lectiva», «Comunidad escolar»), su `h1`, su descripción y, debajo de los avisos, su bloque («Equipo docente», «Carga por profesor», «Alumnado»)

#### Scenario: Asignaturas y reglas
- **WHEN** se abren `/asignaturas` y `/reglas` con datos
- **THEN** cada una muestra su sobretítulo («Plan académico», «Generador de horarios»), su `h1` («Asignaturas», «Reglas de reparto»), su descripción y, debajo de los avisos, su bloque («Catálogo de asignaturas», «Reglas del colegio»)

#### Scenario: Texto de permisos fuera del bloque
- **WHEN** un `MEMBER` abre `/asignaturas`
- **THEN** «Solo los administradores pueden crear y modificar las asignaturas» se ve fuera de la región «Catálogo de asignaturas»

### Requirement: Bloque del listado con nombre y contador
El bloque del listado MUST ser una `section` con `aria-labelledby` a su propio `h2` (el título del bloque). Su cabecera (título, contador y búsqueda) MUST ir sobre una superficie `cs-card`: la misma que contiene el listado cuando este es una tabla o una lista de filas (cursos), o una propia, con los elementos debajo, cuando cada elemento es ya una tarjeta `cs-card` (calendarios), para no anidar tarjetas. Bajo ese `h2` MUST mostrarse el número de elementos cargados con su plural («1 curso», «3 cursos»), y solo cuando la lista ha cargado y tiene elementos. La búsqueda de la página, si existe, MUST pintarse en la cabecera del bloque, a la derecha del título desde 576 px y debajo por debajo de esa anchura. La carga (`role="status"`), el error con «Reintentar», el estado vacío y el listado MUST pintarse dentro del bloque. Dentro del bloque, el nombre de cada elemento que hoy es un encabezado (tarjeta de curso, tarjeta de calendario) MUST ser un `h3`, de modo que la página no salte niveles.

#### Scenario: Región con nombre
- **WHEN** se abre `/calendarios` con dos calendarios
- **THEN** hay una región llamada «Tus calendarios» con el contador «2 calendarios» y los nombres de los calendarios como `h3`

#### Scenario: Plural del contador
- **GIVEN** un colegio con un solo curso
- **WHEN** se abre `/cursos`
- **THEN** el contador dice «1 curso»

#### Scenario: Sin contador mientras carga, con error o vacío
- **WHEN** la lista está cargando, ha fallado o está vacía
- **THEN** no se muestra el contador, y la carga, el error o el vacío aparecen dentro del bloque

#### Scenario: Orden de los encabezados
- **WHEN** se analiza la página con `axe`, con datos, vacía, cargando y con error, a 1280 y a 360 px
- **THEN** no hay infracciones, y los encabezados van del `h1` al `h2` del bloque y a los `h3` de los elementos

### Requirement: Listados sin desplazamiento horizontal con la barra lateral
Las páginas de listado que adopten el diseño MUST NOT tener desplazamiento horizontal de la página a 360 px ni a 1280 px (con la barra lateral fija, unos 1026 px útiles), y una tabla de listado MUST NOT tener desplazamiento propio a 1280 px con los datos del E2E: sus celdas de texto pueden partirse en varias líneas y las acciones de cada fila MUST pasar a la línea siguiente si no caben. Las decoraciones (franjas, marcas, lupa) MUST ser CSS o SVG decorativo (`aria-hidden`), sin estilos en línea ni recursos externos, y la CSP MUST NOT cambiar.

#### Scenario: Escritorio con la barra lateral
- **GIVEN** una ventana de 1280 px y un curso con dos clases, tutores y sus cuatro acciones
- **WHEN** se abre `/cursos`
- **THEN** ni la página ni la tabla se desplazan en horizontal

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abren `/cursos` y `/calendarios` con datos
- **THEN** la página no se desplaza en horizontal

### Requirement: Filtros y resultados dentro del bloque
Cuando una página de listado tiene más de un control de búsqueda o filtro (`/profesores/resumen`, `/alumnos`, `/asignaturas` y `/reglas`), los controles MUST pintarse dentro del bloque, debajo de su cabecera y encima del listado, con su etiqueta visible; con un solo campo de búsqueda (`/cursos`, `/profesores`), este MUST ir en la cabecera del bloque. El contador de la cabecera MUST decir siempre el total de elementos cargados; el resultado de buscar o filtrar («Mostrando N de M …», o que no hay coincidencias con su botón «Limpiar…») MUST pintarse en una línea propia dentro del bloque, con `role="status"` y solo mientras haya texto o algún filtro activo. Al cambiar de página, la vista MUST desplazarse al principio del bloque sin mover el foco.

#### Scenario: Total y resultado
- **GIVEN** `/profesores` con 3 profesores
- **WHEN** se escribe «juan» y coinciden 2
- **THEN** la cabecera del bloque sigue diciendo «3 profesores» y dentro del bloque se anuncia «Mostrando 2 de 3 profesores»

#### Scenario: Sin filtros no hay línea de resultados
- **WHEN** se abre `/alumnos` sin filtros ni texto
- **THEN** solo se ve el contador de la cabecera y no hay ningún `role="status"` de resultados

#### Scenario: Filtros dentro del bloque
- **WHEN** se abre `/alumnos` con alumnos
- **THEN** la búsqueda y los desplegables de curso, clase, comedor y beca están dentro de la región «Alumnado», encima de la tabla

#### Scenario: Filtros de asignaturas y reglas
- **WHEN** se abren `/asignaturas` y `/reglas` con datos
- **THEN** la búsqueda (con su etiqueta visible y la lupa) y los desplegables están dentro de la región «Catálogo de asignaturas» o «Reglas del colegio», encima del listado, y en `/reglas` también «Solo con avisos»

#### Scenario: Cambio de página
- **GIVEN** `/alumnos` con 45 alumnos
- **WHEN** se pulsa «Siguiente»
- **THEN** la vista vuelve al principio del bloque «Alumnado» y el foco sigue en la paginación

