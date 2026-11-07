## MODIFIED Requirements

### Requirement: Página de listado de calendarios
`/calendarios` MUST colgar de `AuthenticatedLayout` sin restricción de rol, seguir el patrón de las páginas de listado (ver `list-page-layout`) —cabecera con el sobretítulo «Organización académica», el `h1` «Calendarios» y la descripción «Define las sesiones y los recreos de la jornada de cada curso.», y el bloque «Tus calendarios» con el contador «N calendarios»— y pedir la lista una sola vez (también con `StrictMode`) con un `role="status"` mientras carga y un `role="alert"` con «Reintentar» si falla, los dos dentro del bloque. MUST mostrar, dentro del bloque, una tarjeta por calendario (`article` con nombre) con su nombre como `h3`, una franja y una marca decorativas iguales para todos los calendarios, un panel «Jornada lectiva» con sus periodos en orden («Sesión 1 · 09:00–09:45», «Recreo · 11:15–11:45»), el resumen «N sesiones al día · 5×N a la semana · M minutos lectivos al día» (los recreos no cuentan) y, bajo «Cursos asignados», los cursos que lo siguen separados por comas o «Sin cursos asignados». Desde 992 px el panel «Jornada lectiva» y el resumen con los cursos MUST ir en dos columnas, y por debajo, en una. La tarjeta MUST NOT mostrar etapa ni color propio del calendario. El botón «Crear calendario» (en la cabecera) y, en cada tarjeta, el enlace «Editar» (`aria-label` «Editar {nombre}», hacia `/calendarios/{id}/editar`) y el botón «Borrar» (`outline-danger`, `aria-label` «Borrar {nombre}»), con iconos decorativos, MUST pintarse solo para el `ADMIN`; el `MEMBER` MUST ver en su lugar, entre la cabecera y el bloque, «Solo los administradores pueden crear y modificar los calendarios». Sin calendarios MUST mostrar «Todavía no hay calendarios» dentro del bloque. MUST leer del estado de la navegación, con una guarda de tipo, `{ calendarCreated: <texto no vacío> }` o `{ calendarUpdated: <texto no vacío> }` y mostrar «Calendario «X» creado» o «Calendario «X» actualizado» como texto plano en un `role="status"`, entre la cabecera y el bloque.

#### Scenario: Calendario con cursos
- **GIVEN** «Primaria» con seis sesiones de 45 minutos, un recreo y los cursos «1º Primaria» y «2º Primaria»
- **WHEN** se abre `/calendarios`
- **THEN** su tarjeta, con el nombre como `h3`, muestra bajo «Jornada lectiva» los siete periodos, «6 sesiones al día · 30 a la semana · 270 minutos lectivos al día» y, bajo «Cursos asignados», «1º Primaria, 2º Primaria»

#### Scenario: Calendario sin cursos
- **GIVEN** «Infantil» sin cursos
- **WHEN** se abre `/calendarios`
- **THEN** su tarjeta dice «Sin cursos asignados» bajo «Cursos asignados»

#### Scenario: Bloque con contador
- **GIVEN** dos calendarios
- **WHEN** se abre `/calendarios`
- **THEN** la región «Tus calendarios» dice «2 calendarios»

#### Scenario: Según el rol
- **WHEN** un `MEMBER` abre `/calendarios`
- **THEN** ve los calendarios, no ve «Crear calendario», ningún «Editar» ni ningún «Borrar» y ve «Solo los administradores pueden crear y modificar los calendarios» fuera del bloque

#### Scenario: Enlace de edición y botón de borrado
- **WHEN** un `ADMIN` abre `/calendarios` con «Primaria»
- **THEN** su tarjeta tiene el enlace «Editar Primaria» hacia `/calendarios/<id>/editar` y el botón «Borrar Primaria»

#### Scenario: Aviso de edición
- **GIVEN** la navegación llega con `{ calendarUpdated: "Primaria 1º ciclo" }`
- **WHEN** se pinta `/calendarios`
- **THEN** se muestra «Calendario «Primaria 1º ciclo» actualizado» en un `role="status"` fuera del bloque; con cualquier otra forma del estado no se muestra nada

### Requirement: Accesibilidad, responsive e i18n de los calendarios
Las páginas de calendarios MUST cumplir WCAG 2.1 AA: cada hora con una etiqueta accesible propia («Inicio de la sesión 1», «Fin del recreo 1»), los errores ligados por `aria-describedby`, el diálogo de borrado con su título como nombre accesible, los encabezados del listado en orden (`h1`, `h2` del bloque y `h3` de cada calendario), las decoraciones de las tarjetas ocultas a los lectores de pantalla, sin violaciones de `axe` (listado con datos, vacío, cargando y con error, formulario con y sin errores y diálogo de borrado) y sin desplazamiento horizontal a 360 px. Los textos MUST estar en `es.json` y `en.json`, también el contador del bloque con su plural.

#### Scenario: Sin violaciones
- **WHEN** se analizan el listado (con datos, vacío, cargando y con error), el formulario con errores y el diálogo de borrado abierto
- **THEN** `axe` no encuentra violaciones de WCAG 2.1 AA

#### Scenario: Móvil
- **GIVEN** una ventana de 360 px
- **WHEN** se abre `/calendarios` con calendarios
- **THEN** el panel «Jornada lectiva» y los cursos van en una columna y la página no se desplaza en horizontal
