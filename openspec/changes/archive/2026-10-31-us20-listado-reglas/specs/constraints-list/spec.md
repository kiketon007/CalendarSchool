## ADDED Requirements

### Requirement: Contrato del listado de reglas en OpenAPI
`docs/api-spec.yml` MUST documentar `GET /api/constraints` (`listConstraints`, etiqueta de las reglas de reparto, seguridad Bearer) con estas respuestas:
- **`200`** (`Cache-Control: no-store`): `{ success: true, data: { constraints: SchedulingConstraint[] } }`.
- **`401`, `500` y `503`:** las comunes de `components.responses`.

No hay `403`: los dos roles pueden leer. No hay códigos de error nuevos.

Esquemas nuevos:
- **`ConstraintType`:** el enum `MAX_PER_DAY`, `BLOCK`, `FORBIDDEN_SLOTS` y `PREFERRED_SLOTS`.
- **`SchedulingConstraint`:** todos los campos son obligatorios.
  - `id`: UUID de la regla.
  - `type`: un `ConstraintType`.
  - `course`: `{ id, name }`.
  - `subject`: `{ id, name, code, color, status }`, con `code` como texto o `null` y los enums de color y de estado de las asignaturas.
  - `maxPerDay`, `blockSize` y `slotCount`: un entero en el campo de su tipo y `null` en los otros dos.
  - `warnings`: una lista de `WorkloadWarning`, el esquema existente.

Los tipos del frontend MUST regenerarse desde el contrato.

#### Scenario: Tipos al día
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** termina sin diferencias
- **AND** `api/schema.test.ts` fija la operación `listConstraints`, el enum `ConstraintType` y los campos de `SchedulingConstraint`

### Requirement: Listar las reglas del colegio con GET
`GET /api/constraints` MUST responder `200` a un `ADMIN` o un `MEMBER` del colegio con **todas** las reglas de reparto del colegio, una por fila de `scheduling_constraints`. No hay paginación ni filtros en el servidor, y la consulta no cambia nada.

Contenido de cada regla:
- **`maxPerDay`:** solo en `MAX_PER_DAY`.
- **`blockSize`:** solo en `BLOCK`.
- **`slotCount`:** solo en `FORBIDDEN_SLOTS` y `PREFERRED_SLOTS`. Cuenta las celdas de la regla que existen en el calendario actual del curso, es decir, las de sesión no mayor que las sesiones de su jornada. Sin calendario, `0`.

Orden de la lista:
1. Por nombre de curso, con `compareText`.
2. Por nombre de asignatura, con `compareText`.
3. Por tipo: máximo, bloques, prohibidas y preferidas.

Aislamiento y sesión:
- Solo se ven las reglas del colegio de la identidad. El `schoolId` nunca sale del cliente.
- Sin sesión, o con una sesión no válida, MUST responder `401 INVALID_SESSION`.
- Con la base de datos caída, `503`.

#### Scenario: Listado ordenado
- **GIVEN** en 1º Primaria, «Religión» con 18 franjas prohibidas e «Inglés» con máximo 2 y bloques de 2
- **AND** en 2º Primaria, «Inglés» con máximo 3
- **WHEN** un `ADMIN` pide `GET /api/constraints`
- **THEN** responde `200` con cuatro reglas en este orden:
  1. 1º Inglés `MAX_PER_DAY`, con `maxPerDay` 2;
  2. 1º Inglés `BLOCK`, con `blockSize` 2;
  3. 1º Religión `FORBIDDEN_SLOTS`, con `slotCount` 18;
  4. 2º Inglés `MAX_PER_DAY`, con `maxPerDay` 3.
- **AND** en cada regla, los otros dos valores son `null`

#### Scenario: Un miembro también lo ve
- **WHEN** un `MEMBER` del colegio pide `GET /api/constraints`
- **THEN** responde `200` con las mismas reglas

#### Scenario: Sin reglas
- **GIVEN** un colegio con asignaturas en cursos pero sin reglas
- **WHEN** se pide el listado
- **THEN** responde `200` con `constraints: []`

#### Scenario: Celdas fuera del calendario
- **GIVEN** una regla de prohibidas con 6 celdas, 2 de ellas en la 6ª sesión
- **AND** el calendario del curso pasa a tener 5 sesiones
- **THEN** su `slotCount` es 4

#### Scenario: Reglas de otro colegio
- **GIVEN** otro colegio con reglas
- **WHEN** se pide el listado
- **THEN** ninguna de sus reglas aparece

#### Scenario: Sin sesión
- **WHEN** se pide `GET /api/constraints` sin `Authorization`
- **THEN** responde `401 INVALID_SESSION` con `WWW-Authenticate: Bearer`

#### Scenario: Base de datos caída
- **WHEN** la base de datos no responde
- **THEN** responde `503`

### Requirement: Avisos de cada regla
Cada regla MUST llevar en `warnings` solo los avisos que afectan a esa regla. Se calculan con las mismas funciones puras que la carga del curso: `subjectWarnings`, con las sesiones de la pareja, su máximo, su bloque, la jornada del calendario y sus celdas prohibidas dentro del calendario, y `preferredSlotsWarnings`.

Los avisos se reparten así:
- **Curso sin calendario:** cada regla lleva `COURSE_WITHOUT_CALENDAR`, porque no se puede comprobar. La regla `BLOCK` lleva antes `BLOCK_LARGER_THAN_LOAD` si se cumple, porque no depende del calendario. Ninguna regla lleva nada más.
- **`SUBJECT_DOES_NOT_FIT`:** en las reglas `MAX_PER_DAY`, `BLOCK` y `FORBIDDEN_SLOTS` de la pareja, nunca en `PREFERRED_SLOTS`.
- **`BLOCK_LARGER_THAN_LOAD`:** solo en la regla `BLOCK`.
- **`SLOTS_OUTSIDE_CALENDAR`:** en cada regla de franjas que tenga celdas fuera del calendario, con el recuento de **sus** celdas.
- **`PREFERRED_SLOTS_FORBIDDEN`:** solo en la regla `PREFERRED_SLOTS`, con su recuento.

El orden dentro de una regla es el de la carga: primero `BLOCK_LARGER_THAN_LOAD` o `SUBJECT_DOES_NOT_FIT`, después `SLOTS_OUTSIDE_CALENDAR` y al final `PREFERRED_SLOTS_FORBIDDEN`.

Los avisos se calculan en cada lectura y nunca se guardan. En un curso con calendario, la unión de los avisos de las reglas de una pareja MUST coincidir con los de esa asignatura en la carga del curso. La única diferencia permitida es que la carga suma en un solo `SLOTS_OUTSIDE_CALENDAR` las celdas fuera de las dos cuadrículas.

#### Scenario: No cabe en las reglas obligatorias
- **GIVEN** «Matemáticas» en 1º con 5 sesiones y máximo 2
- **AND** el lunes, el martes, el miércoles y el jueves enteros prohibidos
- **AND** 3 franjas preferidas el viernes
- **WHEN** se pide el listado
- **THEN** sus reglas `MAX_PER_DAY` y `FORBIDDEN_SLOTS` llevan `SUBJECT_DOES_NOT_FIT`
- **AND** su regla `PREFERRED_SLOTS` no lo lleva

#### Scenario: Preferidas prohibidas
- **GIVEN** «Religión» con 2 de sus franjas preferidas también prohibidas
- **THEN** solo su regla `PREFERRED_SLOTS` lleva `PREFERRED_SLOTS_FORBIDDEN` con `count` 2

#### Scenario: Bloque mayor que la carga
- **GIVEN** «Música» con 1 sesión, bloques de 2 y máximo 2
- **THEN** su regla `BLOCK` lleva `BLOCK_LARGER_THAN_LOAD`
- **AND** su regla `MAX_PER_DAY` no la lleva

#### Scenario: Celdas fuera, cada cuadrícula con su recuento
- **GIVEN** «Plástica» con 2 prohibidas y 1 preferida en la 6ª sesión de un calendario que pasa a 5 sesiones
- **THEN** su regla `FORBIDDEN_SLOTS` lleva `SLOTS_OUTSIDE_CALENDAR` con `count` 2
- **AND** su regla `PREFERRED_SLOTS` lo lleva con `count` 1

#### Scenario: Curso sin calendario
- **GIVEN** un curso sin calendario
- **AND** «Inglés» con 1 sesión, máximo 2, bloques de 2 y franjas prohibidas guardadas
- **THEN** su regla `BLOCK` lleva `BLOCK_LARGER_THAN_LOAD` y `COURSE_WITHOUT_CALENDAR`
- **AND** sus reglas `MAX_PER_DAY` y `FORBIDDEN_SLOTS` llevan solo `COURSE_WITHOUT_CALENDAR`
- **AND** la regla `FORBIDDEN_SLOTS` tiene `slotCount` 0

#### Scenario: Sin avisos
- **GIVEN** «Inglés» con 3 sesiones y máximo 2 en un curso con calendario de 6 sesiones
- **THEN** su regla lleva `warnings: []`

#### Scenario: Coincide con la carga del curso
- **GIVEN** un curso con calendario y varias asignaturas con reglas y avisos
- **WHEN** se comparan el listado y `GET /api/courses/{id}/workload`
- **THEN** para cada asignatura, la unión de los códigos de sus reglas es la de sus avisos en la carga

### Requirement: Página de las reglas de reparto
`/reglas` (`pages/ConstraintsPage.tsx`, título «Reglas de reparto») MUST colgar de `AuthenticatedLayout` **sin** `RequireRole`, para que la vean los dos roles.

Carga de la lista:
- Pide la lista una sola vez, aunque `StrictMode` ejecute el efecto dos veces.
- Mientras carga, muestra un `role="status"`.
- Si falla, muestra un `role="alert"` con «Reintentar».

`services/constraintsService.ts` (`list(authorizedFetch)`):
- devuelve `loaded`, `unauthenticated` o `unavailable`;
- valida la forma de la respuesta: el tipo, el color y el estado de los enums, cada valor solo en su tipo y los avisos como en la carga;
- nunca lanza.

Presentación:
- Hay una sola presentación según `useMediaQuery('(min-width: 768px)')`.
- **Desde 768 px:** una `Table` con `aria-labelledby` al `h1` y las columnas Curso, Asignatura, Regla, Detalle, Avisos y Acciones.
- **Por debajo:** una lista de tarjetas (`ul` con `li`).

Cada regla muestra:
- **Asignatura:** su color (`SubjectColorSwatch`, con nombre), su nombre, su código si lo tiene e «Inactiva» si lo está.
- **Regla:** el nombre del tipo como texto: «Máximo al día», «Bloques», «Franjas prohibidas» o «Franjas preferidas».
- **Detalle:** «Hasta {n} al día», «En bloques de {n}» o «{n} franjas», con plural.
- **Avisos:** los de la regla, con `SubjectWarnings`, en rojo y con su texto. «Curso sin calendario» va en esa misma lista.

El color nunca es la única pista.

#### Scenario: Ver el listado
- **GIVEN** «Inglés» en 1º con máximo 2 y «Religión» en 1º con 18 franjas prohibidas
- **WHEN** abro «Reglas»
- **THEN** veo, en este orden:
  - 1º Primaria · Inglés · «Máximo al día» · «Hasta 2 al día»;
  - 1º Primaria · Religión · «Franjas prohibidas» · «18 franjas».
- **AND** veo «2 reglas»

#### Scenario: Tarjetas a 360 px
- **WHEN** abro la página a 360 px
- **THEN** cada regla es una tarjeta con los mismos datos y el mismo enlace
- **AND** la página no se desplaza en horizontal

#### Scenario: Error al cargar
- **WHEN** la lista no se puede cargar
- **THEN** veo un aviso con «Reintentar», que vuelve a pedirla

#### Scenario: Asignatura inactiva
- **GIVEN** una regla de una asignatura inactiva
- **THEN** su fila dice «Inactiva» junto al nombre

### Requirement: Enlaces de cada regla según el rol
Cada regla MUST llevar un enlace a donde se define:
- **`MAX_PER_DAY` y `BLOCK`:** la carga del curso, `/cursos/{curso}/carga`.
- **`FORBIDDEN_SLOTS`:** su cuadrícula, `/cursos/{curso}/carga/{asignatura}/prohibidas`.
- **`PREFERRED_SLOTS`:** su cuadrícula, `/cursos/{curso}/carga/{asignatura}/preferidas`.

El texto visible es «Editar» para el `ADMIN` y «Ver» para el `MEMBER`. El nombre accesible contiene el texto visible y dice la regla, por ejemplo «Editar Franjas prohibidas de Religión en 1º Primaria». Los dos roles van a la misma página, que el `MEMBER` ve sin poder editar, como ya hace. Mientras la sesión no está autenticada, la página no pinta nada que dependa del rol.

#### Scenario: El administrador edita
- **WHEN** un `ADMIN` pulsa «Editar» en las franjas prohibidas de «Religión» en 1º
- **THEN** llega a la cuadrícula de prohibidas de esa asignatura en ese curso

#### Scenario: El miembro ve
- **WHEN** un `MEMBER` pulsa «Ver» en el máximo al día de «Inglés» en 1º
- **THEN** llega a la carga de 1º en su vista de solo lectura

### Requirement: Filtros y recuento del listado
La página MUST ofrecer estos filtros, que son combinables. Se aplican en el navegador sobre la lista cargada, sin pedirla de nuevo, y viven en el estado de la página, no en la URL. La lógica está en `utils/constraintFilters.ts`. Solo existen si hay alguna regla.
- **Tipo:** «Todos» o uno de los cuatro tipos.
- **Curso:** «Todos» o un curso de los que tienen alguna regla en la lista cargada, en orden natural.
- **Búsqueda:** por nombre o código de la asignatura, con `matchesCourseSearch`, sin mayúsculas ni acentos.
- **«Solo con avisos»:** una casilla que deja las reglas con algún aviso.

El recuento «{n} reglas» (con plural) dice cuántas se ven.

Sin coincidencias, la página MUST mostrar:
- «No hay reglas que coincidan»;
- «Limpiar filtros», que los quita todos y devuelve el foco a la búsqueda.

#### Scenario: Filtrar por tipo
- **GIVEN** el listado de «Ver el listado»
- **WHEN** elijo el tipo «Franjas prohibidas»
- **THEN** solo veo «Religión» y «1 regla»

#### Scenario: Buscar
- **WHEN** escribo «ingl»
- **THEN** solo veo «Inglés»

#### Scenario: Solo con avisos
- **GIVEN** una regla con avisos y otra sin ellos
- **WHEN** marco «Solo con avisos»
- **THEN** solo veo la que tiene avisos

#### Scenario: Opciones de curso
- **GIVEN** reglas solo en 1º Primaria, aunque también existe el curso 2º Primaria
- **THEN** el filtro de curso ofrece «Todos» y «1º Primaria»

#### Scenario: Sin coincidencias
- **WHEN** elijo el tipo «Bloques» y no hay ninguna regla de bloques
- **THEN** veo «No hay reglas que coincidan» y «Limpiar filtros»
- **AND** al pulsarlo vuelvo a ver todas las reglas, con el foco en la búsqueda

### Requirement: Listado vacío
Si el colegio no tiene reglas, la página MUST mostrar «Todavía no hay reglas de reparto. Se definen en la carga horaria de cada curso», con un enlace a «Cursos» (`/cursos`), sin filtros ni recuento.

#### Scenario: Colegio sin reglas
- **WHEN** abro «Reglas» en un colegio sin reglas
- **THEN** veo el texto del estado vacío y el enlace a «Cursos»

### Requirement: Enlace a las reglas en la navegación
`AppHeader` MUST mostrar el enlace «Reglas» (`/reglas`) a los dos roles, justo después de «Asignaturas». Se marca activo en esa ruta.

#### Scenario: Enlace para los dos roles
- **WHEN** un `ADMIN` o un `MEMBER` ve la cabecera
- **THEN** «Reglas» aparece tras «Asignaturas» y lleva a `/reglas`

### Requirement: Accesibilidad e i18n del listado
La página MUST cumplir lo siguiente:
- Las cabeceras de la tabla son `th scope="col"` y el curso de cada fila es un `th scope="row"`.
- Los filtros tienen etiqueta.
- El tipo y los avisos son texto.
- `axe` no encuentra violaciones, ni en la tabla ni en las tarjetas.
- Los textos están en `es.json` y `en.json`, bajo `constraints.*` y `header.constraints`.

#### Scenario: Sin violaciones
- **WHEN** se analiza la página con `axe` a 1280 y a 360 px
- **THEN** no hay violaciones
