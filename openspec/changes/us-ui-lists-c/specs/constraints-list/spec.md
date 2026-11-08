## MODIFIED Requirements

### Requirement: Página de las reglas de reparto
`/reglas` (`pages/ConstraintsPage.tsx`, título «Reglas de reparto») MUST colgar de `AuthenticatedLayout` **sin** `RequireRole`, para que la vean los dos roles.

Estructura (patrón `list-page-layout`):
- `PageHeader` con el sobretítulo «Generador de horarios», el `h1` «Reglas de reparto» (con su `id` de siempre, sin ref de foco: la página es de solo lectura) y la descripción de hoy; sin acciones.
- El bloque «Reglas del colegio» (`ListSection` con marco) con el contador «N reglas» (plural) cuando la lista ha cargado y tiene reglas. Dentro van la carga, el error, el vacío, los filtros, la línea de resultados y el listado.

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
- **Desde 768 px:** una `Table` con `aria-labelledby` al `h2` del bloque y las columnas Curso, Asignatura, Regla, Detalle, Avisos y Acciones, sin contenedor con desplazamiento propio: las celdas de texto se parten y la tabla cabe en el bloque a 1280 px con la barra lateral.
- **Por debajo:** una lista (`ul` con `li.cs-list-item`, sin tarjeta anidada) con el nombre de la asignatura como `h3`.

Cada regla muestra:
- **Asignatura:** su color (`SubjectColorSwatch`, con nombre), su nombre, su código si lo tiene e «Inactiva» si lo está.
- **Regla:** el nombre del tipo como texto: «Máximo al día», «Bloques», «Franjas prohibidas» o «Franjas preferidas».
- **Detalle:** «Hasta {n} al día», «En bloques de {n}» o «{n} franjas», con plural.
- **Avisos:** los de la regla, con `SubjectWarnings`, en rojo y con su texto. «Curso sin calendario» va en esa misma lista.

El color nunca es la única pista.

#### Scenario: Ver el listado
- **GIVEN** «Inglés» en 1º con máximo 2 y «Religión» en 1º con 18 franjas prohibidas
- **WHEN** abro «Reglas»
- **THEN** veo el sobretítulo «Generador de horarios», el `h1` «Reglas de reparto» y la región «Reglas del colegio» con el contador «2 reglas»
- **AND** en la tabla «Reglas del colegio», en este orden:
  - 1º Primaria · Inglés · «Máximo al día» · «Hasta 2 al día»;
  - 1º Primaria · Religión · «Franjas prohibidas» · «18 franjas».

#### Scenario: Filas a 360 px
- **WHEN** abro la página a 360 px
- **THEN** cada regla es una fila de la lista con la asignatura como `h3`, los mismos datos y el mismo enlace
- **AND** la página no se desplaza en horizontal

#### Scenario: Tabla a 1280 px
- **GIVEN** una regla de una asignatura de nombre largo, con código, avisos y su enlace
- **WHEN** abro la página a 1280 px con la barra lateral
- **THEN** la tabla cabe en su bloque y ni la página ni la tabla se desplazan en horizontal

#### Scenario: Error al cargar
- **WHEN** la lista no se puede cargar
- **THEN** veo, dentro del bloque, un aviso con «Reintentar», que vuelve a pedirla, y ningún contador

#### Scenario: Asignatura inactiva
- **GIVEN** una regla de una asignatura inactiva
- **THEN** su fila dice «Inactiva» junto al nombre

### Requirement: Filtros y recuento del listado
La página MUST ofrecer estos filtros, que son combinables. Se aplican en el navegador sobre la lista cargada, sin pedirla de nuevo, y viven en el estado de la página, no en la URL. La lógica está en `utils/constraintFilters.ts`. Solo existen si hay alguna regla y van dentro del bloque, debajo de su cabecera, con su etiqueta visible.
- **Tipo:** «Todos» o uno de los cuatro tipos.
- **Curso:** «Todos» o un curso de los que tienen alguna regla en la lista cargada, en orden natural.
- **Búsqueda:** por nombre o código de la asignatura, con `matchesCourseSearch`, sin mayúsculas ni acentos, con una lupa decorativa.
- **«Solo con avisos»:** una casilla que deja las reglas con algún aviso.

El total «{n} reglas» (con plural) va en la cabecera del bloque y no cambia al filtrar. Con algún filtro activo, una línea propia con `role="status"` (`data-testid="constraints-count"`) dice «Mostrando {n} de {m} reglas»; sin filtros esa línea no existe.

Sin coincidencias, esa línea MUST decir:
- «No hay reglas que coincidan»;
- con «Limpiar filtros», que los quita todos y devuelve el foco a la búsqueda.

#### Scenario: Filtrar por tipo
- **GIVEN** el listado de «Ver el listado»
- **WHEN** elijo el tipo «Franjas prohibidas»
- **THEN** solo veo «Religión» y «Mostrando 1 de 2 reglas»
- **AND** la cabecera del bloque sigue diciendo «2 reglas»

#### Scenario: Sin filtros no hay línea de resultados
- **WHEN** abro «Reglas» sin filtros
- **THEN** solo veo el contador de la cabecera y no hay `constraints-count`

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
- **AND** al pulsarlo vuelvo a ver todas las reglas, sin línea de resultados, con el foco en la búsqueda

### Requirement: Accesibilidad e i18n del listado
La página MUST cumplir lo siguiente:
- Las cabeceras de la tabla son `th scope="col"` y el curso de cada fila es un `th scope="row"`.
- Los encabezados van en orden: el `h1`, el `h2` del bloque y, en la lista, un `h3` por regla.
- Los filtros tienen etiqueta.
- El tipo y los avisos son texto.
- `axe` no encuentra violaciones, ni en la tabla ni en la lista, con datos, vacía, cargando y con error.
- Los textos están en `es.json` y `en.json`, bajo `constraints.*` y `header.constraints`.

#### Scenario: Sin violaciones
- **WHEN** se analiza la página con `axe` a 1280 y a 360 px, con datos, vacía, cargando y con error
- **THEN** no hay violaciones
