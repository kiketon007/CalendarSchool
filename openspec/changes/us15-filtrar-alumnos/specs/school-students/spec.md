## ADDED Requirements

### Requirement: Total y paginación del listado de alumnos
Con alumnos en el colegio, `/alumnos` MUST mostrar encima del listado el total («N alumnos», «1 alumno» en singular) y MUST paginar de 20 en 20 en el navegador con el componente de paginación de los profesores («Anterior», «Página X de N» en una región `aria-live="polite"` y «Siguiente»), que no se pinta con una sola página. La tabla y las tarjetas MUST mostrar la misma página. Una página fuera de rango MUST acotarse a la última. Al cambiar de página, la vista MUST desplazarse al total sin mover el foco. MUST NOT hacer peticiones nuevas al paginar.

#### Scenario: Más de una página
- **GIVEN** 45 alumnos
- **WHEN** se abre `/alumnos` a 1280 px o a 360 px
- **THEN** se ven «45 alumnos», los 20 primeros por apellidos y nombre y «Página 1 de 3»
- **AND** en la página 3 se ven 5 alumnos

#### Scenario: Una sola página
- **GIVEN** 3 alumnos
- **THEN** se ve «3 alumnos» y no hay paginación

### Requirement: Búsqueda de alumnos por nombre o apellidos
Con alumnos en el colegio, `/alumnos` MUST mostrar un campo de búsqueda (`type="search"`) con la etiqueta visible «Buscar por nombre o apellidos» y un máximo de 100 caracteres. Al escribir, desde el primer carácter y sin peticiones, MUST mostrar solo los alumnos en cuyo nombre o apellidos aparece **cada** palabra del texto, en cualquier orden y como parte de una palabra, sin distinguir mayúsculas, acentos (la «ñ» busca como «n») ni espacios sobrantes: la misma regla que la búsqueda de profesores. El texto MUST NOT guardarse en la URL ni en almacenamiento.

#### Scenario: Palabras en cualquier orden
- **GIVEN** «García López, Juan», «García, Ana» y «Muñoz, José»
- **WHEN** se escribe «juan garcia»
- **THEN** se ve solo «García López, Juan»
- **AND** «JOSE munoz» encuentra a «Muñoz, José»

#### Scenario: Sin rastro en la URL
- **WHEN** se escribe en la búsqueda
- **THEN** la URL no cambia y no se hace ninguna petición a `GET /api/students`

### Requirement: Filtros del listado de alumnos
Con alumnos en el colegio, `/alumnos` MUST ofrecer, junto a la búsqueda, cuatro desplegables con etiqueta visible, opcionales y combinables con ella (un alumno se muestra solo si cumple todos):
- **Curso:** «Todos los cursos», los cursos que tienen algún alumno cargado, en orden natural en castellano («2º» antes que «10º»), y «Sin curso» si algún alumno no tiene curso.
- **Clase:** desactivado, con una ayuda ligada por `aria-describedby`, mientras no se elija un curso concreto; con uno, «Todas las clases», las clases de ese curso que tienen algún alumno, en orden natural, y «Sin clase» si algún alumno de ese curso no tiene clase. Cambiar de curso MUST volver a «Todas las clases».
- **Comedor:** «Todos», «Come en el comedor» y «No come en el comedor».
- **Beca:** desactivado, con una ayuda ligada, salvo con «Come en el comedor»; entonces «Todos», «Con beca» y «Sin beca». Dejar «Come en el comedor» MUST volver a «Todos».
Cambiar cualquier filtro o el texto de búsqueda MUST volver a la página 1. Mientras haya algún filtro o texto, el total MUST decir «Mostrando N de M alumnos» en un `role="status"`; sin coincidencias, MUST mostrar «No hay alumnos que coincidan con los filtros» y «Limpiar filtros», que quita todos los filtros y el texto, vuelve a la página 1 y lleva el foco al campo de búsqueda; sin listado ni paginación. Sin alumnos en el colegio, MUST mostrar el vacío de siempre sin barra de filtros. MUST NOT filtrar ni mostrar el tipo de comida ni las observaciones.

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
- **THEN** se ven solo los alumnos que cumplen las tres condiciones, desde la página 1, y «Mostrando N de M alumnos»

#### Scenario: Sin coincidencias
- **WHEN** los filtros no dejan ningún alumno
- **THEN** se ve «No hay alumnos que coincidan con los filtros» con «Limpiar filtros», sin tabla ni paginación
- **AND** al pulsar «Limpiar filtros» vuelven todos los alumnos en la página 1, los desplegables a su primera opción, la búsqueda vacía y con el foco

### Requirement: Filtros del listado de alumnos en la URL
`/alumnos` MUST leer y escribir en la URL los filtros y la página, con estos parámetros: `curso` (el `id` de un curso o `sin-curso`), `clase` (el `id` de una clase o `sin-clase`; solo cuenta con un `curso` concreto), `comedor` (`si` o `no`), `beca` (`si` o `no`; solo cuenta con `comedor=si`) y `pagina` (entero mayor que 1; la primera página no se escribe). Los parámetros sin valor o con el valor por defecto MUST NOT escribirse. Cada cambio MUST sustituir la entrada del historial (`replace`). Un valor desconocido o que ya no corresponde a ningún alumno cargado (un curso borrado, una clase de otro curso, un curso de otro colegio, `pagina=abc`) MUST tratarse como si no estuviera, sin error; una página mayor que la última MUST mostrarse como la última. El texto de búsqueda MUST NOT escribirse en la URL. Los parámetros MUST NOT enviarse a la API.

#### Scenario: Recargar conserva los filtros
- **GIVEN** que se ha elegido «1º Primaria», «Come en el comedor» y la página 2
- **THEN** la URL es `/alumnos?curso=<id>&comedor=si&pagina=2`
- **AND** al recargar la página se ven los mismos filtros y la misma página

#### Scenario: Valores obsoletos
- **WHEN** se abre `/alumnos?curso=<id de un curso que ya no existe o de otro colegio>&comedor=quizas&pagina=99`
- **THEN** se ve el listado sin filtro de curso ni de comedor, en la última página, sin mensaje de error

#### Scenario: Beca sin comedor
- **WHEN** se abre `/alumnos?beca=si`
- **THEN** «Beca» está desactivado en «Todos» y no filtra

### Requirement: Alumnos filtrados de extremo a extremo
Los tests E2E MUST cubrir, contra el build servido con `vite preview` y un backend real, con alumnos creados por la API: la búsqueda por nombre y apellidos sin acentos; el filtro por curso y clase (con «Sin clase»); comedor y beca; sin coincidencias y «Limpiar filtros»; la paginación con más de 20 alumnos; que recargar una URL con filtros y página los conserva y que la búsqueda no aparece en la URL; y la barra de filtros a 360 px sin desplazamiento horizontal.

#### Scenario: Recorrido de filtros
- **WHEN** se ejecuta `npm run test:e2e`
- **THEN** pasan los casos de filtros de `students.cy.ts`
