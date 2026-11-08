## MODIFIED Requirements

### Requirement: Página de listado de asignaturas
`/asignaturas` MUST colgar de `AuthenticatedLayout` sin restricción de rol y pedir la lista una sola vez (también con `StrictMode`), con un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla. MUST seguir el patrón de las páginas de listado (`list-page-layout`): `PageHeader` con el sobretítulo «Plan académico», el `h1` «Asignaturas» (con su ref y `tabIndex={-1}`), la descripción «Organiza las materias, su modalidad y la carga lectiva del colegio.» y, solo para el `ADMIN`, «Crear asignatura»; los avisos y el texto de solo lectura fuera del bloque; y el bloque «Catálogo de asignaturas» (`ListSection` con marco), con el contador «N asignaturas» (plural) cuando la lista ha cargado y tiene elementos. Dentro del bloque van la carga, el error, el vacío, los filtros, la línea de resultados y la lista. Cada asignatura MUST ser una fila de la lista (`li.cs-list-item` con un `article` nombrado por su título), sin tarjeta anidada, y MUST mostrar la muestra de su color con su nombre accesible, su nombre como `h3`, su código si lo tiene, su tipo («Troncal», «Optativa» o «Propia del centro»), su estado («Activa» o «Inactiva») y el resumen de sus cursos («N cursos · M sesiones a la semana», o «Sin cursos» con un aviso visible en texto). El resumen MUST ser un botón con `aria-expanded` que despliega cada curso con sus sesiones («1º Primaria: 2 sesiones»). MUST ofrecer filtros por tipo y por estado (con «Todos») y una búsqueda por nombre o código (etiqueta visible y lupa decorativa) con la comparación de la búsqueda de cursos, en el cliente y combinables. Con algún filtro o texto activo, MUST pintarse una línea con `role="status"` que dice «Mostrando N de M asignaturas» o, sin coincidencias, «No hay asignaturas que coincidan» con «Limpiar filtros», que los quita todos y devuelve el foco a la búsqueda; sin filtros esa línea MUST NOT existir. Sin asignaturas MUST mostrar «Todavía no hay asignaturas», sin filtros. El enlace «Editar» (`aria-label` «Editar {nombre}», hacia `/asignaturas/{id}/editar`) y el botón «Borrar» (`outline-danger`, `aria-label` «Borrar {nombre}») de cada asignatura MUST pintarse solo para el `ADMIN`, y pasar a la línea siguiente si no caben; el `MEMBER` MUST ver en su lugar «Solo los administradores pueden crear y modificar las asignaturas». MUST leer del estado de la navegación, con una guarda de tipo, `{ subjectCreated: <texto no vacío> }` o `{ subjectUpdated: <texto no vacío> }` y mostrar «Asignatura «X» creada» o «Asignatura «X» actualizada» como texto plano en un `role="status"`.

#### Scenario: Asignatura con cursos
- **GIVEN** «Inglés» de código «ING», troncal, activa, con los seis cursos a 3 sesiones
- **WHEN** se abre `/asignaturas` y se despliegan sus cursos
- **THEN** se ve el `h3` «Inglés», «ING», «Troncal», «Activa», «6 cursos · 18 sesiones a la semana» y «1º Primaria: 3 sesiones» hasta «6º Primaria: 3 sesiones»

#### Scenario: Bloque y contador
- **GIVEN** «Inglés» y «Francés»
- **WHEN** se abre `/asignaturas`
- **THEN** hay una región «Catálogo de asignaturas» con el contador «2 asignaturas», y con solo una asignatura dice «1 asignatura»

#### Scenario: Filtros y búsqueda
- **GIVEN** «Inglés» (troncal, activa), «Programación» (propia del centro, activa) y «Francés» (optativa, inactiva)
- **WHEN** se filtra por «Troncal», luego por «Inactiva», luego se busca «prog» y por último se combina «Troncal» con «Inactiva»
- **THEN** se ve solo «Inglés», solo «Francés», solo «Programación» y «No hay asignaturas que coincidan»
- **AND** mientras hay filtros se lee «Mostrando 1 de 3 asignaturas» y la cabecera sigue diciendo «3 asignaturas»

#### Scenario: Limpiar filtros
- **GIVEN** los filtros sin coincidencias del escenario anterior
- **WHEN** se pulsa «Limpiar filtros»
- **THEN** se ven las tres asignaturas, no hay línea de resultados y el foco está en la búsqueda

#### Scenario: Asignatura sin cursos
- **GIVEN** «Inglés» con solo «1º Primaria», que se ha borrado
- **WHEN** se abre `/asignaturas`
- **THEN** «Inglés» se ve con «Sin cursos»

#### Scenario: Según el rol
- **WHEN** un `MEMBER` abre `/asignaturas`
- **THEN** ve las asignaturas, no ve «Crear asignatura», ningún «Editar» ni ningún «Borrar» y ve «Solo los administradores pueden crear y modificar las asignaturas»

#### Scenario: Enlace de edición y botón de borrado
- **WHEN** un `ADMIN` abre `/asignaturas` con «Inglés»
- **THEN** su fila tiene el enlace «Editar Inglés» hacia `/asignaturas/<id>/editar` y el botón «Borrar Inglés»

#### Scenario: Aviso de edición
- **GIVEN** la navegación llega con `{ subjectUpdated: "Inglés avanzado" }`
- **WHEN** se pinta `/asignaturas`
- **THEN** se muestra «Asignatura «Inglés avanzado» actualizada» en un `role="status"`, fuera del bloque; con cualquier otra forma del estado no se muestra nada

### Requirement: Accesibilidad, responsive e i18n de las asignaturas
Las páginas de asignaturas MUST cumplir WCAG 2.1 AA: cada número de sesiones con su etiqueta accesible, los errores ligados por `aria-describedby`, el desplegable de cursos con `aria-expanded`, el color anunciado por su nombre, el enlace «Editar» y el botón «Borrar» con su nombre accesible, el aviso de asignatura sin cursos de la edición ligado por `aria-describedby`, el diálogo de borrado con su título como nombre accesible, los encabezados del listado en orden (`h1`, el `h2` del bloque y un `h3` por asignatura), sin violaciones de `axe` (listado con datos, vacío, cargando y con error; formulario de alta y de edición, con y sin errores; y diálogo de borrado) y sin desplazamiento horizontal a 360 px ni a 1280 px con la barra lateral, también con un nombre y un código largos. Los textos, los tipos, los estados y los nombres de los colores MUST estar en `es.json` y `en.json`.

#### Scenario: Sin violaciones
- **WHEN** se analizan el listado (con datos, vacío, cargando y con error), el formulario con errores, el formulario de edición y el diálogo de borrado abierto
- **THEN** `axe` no encuentra violaciones de WCAG 2.1 AA

#### Scenario: Sin desplazamiento horizontal
- **GIVEN** una asignatura con un nombre largo, código, descripción y sus dos acciones
- **WHEN** se abre `/asignaturas` a 360 px y a 1280 px
- **THEN** la página no se desplaza en horizontal
