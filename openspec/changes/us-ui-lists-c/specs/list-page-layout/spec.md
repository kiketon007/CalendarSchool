## MODIFIED Requirements

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
