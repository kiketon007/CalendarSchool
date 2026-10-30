## MODIFIED Requirements

### Requirement: Página de listado de cursos
La página `/cursos` MUST colgar del layout de las páginas autenticadas, sin guarda de rol. MUST pedir la lista una sola vez (también con `StrictMode`), mostrar un indicador con `role="status"` mientras carga y, si falla, un aviso con `role="alert"` y el botón «Reintentar». Con cursos, desde 768 px de ancho MUST mostrar una tabla con las columnas Curso, Clases, Tutores, Alumnos, Creado y Acciones y una fila por curso, con el nombre del curso como cabecera de su fila; por debajo de 768 px MUST mostrar una tarjeta por curso con el nombre como `h2` y los mismos datos, y MUST NOT pintar las dos estructuras a la vez. Cada curso MUST mostrar sus clases con el número de alumnos de cada una como «N clases: A (12), B (10)» («1 clase: A (0)» en singular), sus alumnos (ver «Número de alumnos en el listado de cursos»), «Sin tutor» mientras ninguna clase tenga tutor y la fecha de creación con el formato del idioma activo (`Intl.DateTimeFormat(idioma, { dateStyle: 'medium' })`), en el orden que da el servidor. Cada fila y cada tarjeta MUST tener un enlace «Editar» a `/cursos/<id>/editar` y un botón «Borrar» que abre el diálogo de borrado, visibles para los dos roles, cuyos nombres accesibles incluyan el nombre del curso («Editar 1º Primaria», «Borrar 1º Primaria»), y un enlace «Carga horaria» a `/cursos/<id>/carga`, también para los dos roles, con el nombre accesible «Carga horaria de 1º Primaria». Sin cursos, MUST mostrar «Todavía no hay cursos». El botón «Crear curso» a `/cursos/nuevo` MUST estar siempre visible. Si llega desde la creación, MUST mostrar «Curso «{nombre}» creado» en un `role="status"`, y si llega desde la edición, «Curso «{nombre}» actualizado»; tras borrar un curso, «Curso «{nombre}» eliminado». Los nombres MUST pintarse como texto plano. La página MUST NOT mostrar acciones, columnas ni botones de funcionalidades que aún no existen (horario).

#### Scenario: Tabla en escritorio
- **GIVEN** un colegio con «1º Primaria» (clases «A» y «B») y una ventana de 1280 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tabla con las columnas Curso, Clases, Tutores, Alumnos, Creado y Acciones, y la fila «1º Primaria» con «2 clases: A (0), B (0)», «Sin tutor», «0», su fecha, el enlace «Carga horaria», el enlace «Editar» y el botón «Borrar»

#### Scenario: Tarjetas en móvil
- **GIVEN** una ventana de 360 px
- **WHEN** un usuario abre `/cursos`
- **THEN** ve una tarjeta por curso con su nombre como `h2`, los mismos datos, el enlace «Carga horaria», el enlace «Editar» y el botón «Borrar», y ninguna tabla

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

#### Scenario: Enlace a la carga horaria
- **WHEN** un `MEMBER` o un `ADMIN` pulsa «Carga horaria de 1º Primaria»
- **THEN** llega a `/cursos/<id>/carga` de ese curso
