## Context

US05 construyó `POST`/`GET /api/courses`, las tablas `courses` y `classes` y la página `/cursos` con un listado mínimo (un `h2` por curso y una lista de sus clases «Sin tutor»), con su búsqueda y su orden natural ya resueltos en el servidor (`ListCourses`, `Intl.Collator('es', { numeric: true, sensitivity: 'base' })`). `courses.created_at` existe en la base de datos, pero el contrato no lo expone. El frontend no usa todavía `matchMedia` ni tiene ninguna tabla responsive; los plurales de i18next (`_one`/`_other` con `count`) ya se usan en varios textos.

Restricciones (decisiones de la ficha): solo se muestra lo que existe; la búsqueda es en el navegador y sin paginación; tabla en escritorio y tarjetas en móvil sin acordeón ni modal; sin recarga automática; la fecha con el formato del idioma activo; la búsqueda desde el primer carácter y solo por el nombre del curso.

## Goals / Non-Goals

**Goals:**
- Exponer la fecha de creación de cada curso en el contrato, con la misma fecha que guarda la base de datos.
- Un listado legible en escritorio (tabla con cabeceras) y en móvil (tarjetas), sin duplicar el contenido para los lectores de pantalla.
- Una búsqueda instantánea por nombre, tolerante con mayúsculas, acentos y espacios, accesible y sin peticiones.
- Mantener todo lo que US05 ya garantiza (carga única, error con reintento, aviso de creación, estado vacío).

**Non-Goals:**
- Búsqueda o paginación en el servidor, y parámetros nuevos en `GET /api/courses`.
- Editar, borrar, tutores con nombre, alumnos, horarios y recarga automática.
- Persistir la búsqueda en la URL o en almacenamiento.

## Decisions

### D1. `createdAt` en el contrato, con la fecha de la base de datos

`Course` gana `createdAt` (`string`, `date-time`), obligatorio en el `201` y en el `GET`. El tipo de dominio `Course` gana `createdAt: Date`; `PrismaCourseRepository.create` pide `select: { createdAt: true }` en el mismo `create` anidado y devuelve esa fecha (no se relee ni se inventa con el reloj de la aplicación, que podría diferir de `now()` de PostgreSQL); `listBySchool` la selecciona. El router no necesita código: `res.json` serializa un `Date` a ISO 8601 (el test del router lo fija con un `Date` en el doble y una cadena ISO en la respuesta).

*Alternativas descartadas:* generar `createdAt` en la aplicación con el reloj inyectado (dos relojes para la misma fecha); un endpoint de detalle aparte (`GET /api/courses/:id/classes`, que pedía la ficha original): con 12 clases como máximo todo cabe en la lista.

### D2. Tabla o tarjetas según el ancho, con un hook de `matchMedia`

`hooks/useMediaQuery(query)` devuelve si la consulta (`(min-width: 768px)`, el punto de corte `md` de Bootstrap) se cumple: lee `window.matchMedia(query).matches` en el primer render (para no pintar primero la estructura equivocada) y se suscribe a `change`. Si `matchMedia` no existe, devuelve `false` (tarjetas). `CoursesPage` pinta **solo** la tabla o **solo** las tarjetas. En los tests se simula `matchMedia`.

*Alternativas descartadas:* pintar las dos con `d-none d-md-block` (el contenido estaría dos veces en el DOM; los lectores de pantalla lo ignoran por `display: none`, pero los tests y el E2E verían duplicados, y es el doble de nodos); una tabla que con CSS se apila en tarjetas (`display: block` en las celdas): necesita CSS propio y deja la semántica de tabla en móvil, donde los lectores de pantalla anuncian mal las celdas apiladas.

### D3. Estructura accesible de cada presentación

- **Tabla:** `Table` de react-bootstrap con `aria-labelledby` al `h1` (`courses-title`), cabeceras `th scope="col"` (Curso, Clases, Tutores, Creado) y el nombre de cada curso en un `th scope="row"`. Sin columna de acciones.
- **Tarjetas:** una lista (`ul` sin viñetas, con `aria-labelledby` al `h1`) con un `li` por curso que contiene una `Card` con el nombre como `h2` y una lista de definiciones (`dl`) con «Clases», «Tutores» y «Creado».
- El indicador de resultados es un `role="status"` que solo existe mientras hay texto de búsqueda; el estado sin resultados no es una alerta.

### D4. Búsqueda en el navegador con una función pura

`utils/courseSearch.ts` exporta `normalizeForSearch(text)` (NFD, quitar marcas combinantes `\p{M}`, minúsculas con `toLocaleLowerCase('es')`, recortar y colapsar espacios) y `matchesCourseSearch(name, query)` (`true` con una consulta vacía; si no, si el nombre normalizado contiene la consulta normalizada). Al quitar las marcas, «ñ» busca como «n» y «á» como «a»; `º` y `ª` no se descomponen, así que siguen distinguiéndose. El estado de la página guarda el texto tal cual (`query`); la lista visible se deriva con `useMemo` de la lista cargada, sin peticiones nuevas. «Limpiar búsqueda» vacía `query` y enfoca el campo con una `ref`.

*Alternativas descartadas:* reutilizar `normalizeName` de US05 (no quita los acentos: «educacion» no encontraría «Educación»); `Intl.Collator` con `sensitivity: 'base'` para comparar subcadenas (no tiene búsqueda de subcadena); buscar a partir de 2 caracteres (la ficha original lo pedía para no saturar el servidor; aquí no hay red).

### D5. Textos y formatos

- `courses.classCount_one` / `_other` con `count` y la lista de nombres («{{count}} clases: {{names}}»), los nombres unidos con `, ` en el orden recibido.
- `courses.fields.*` (los nombres de las columnas de la tabla y de los términos de la lista de definiciones de las tarjetas, que son los mismos), `courses.search.*` (etiqueta, indicador «Mostrando {{shown}} de {{total}} cursos», sin resultados con el texto buscado y «Limpiar búsqueda»).
- La fecha: `Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })`, como `UsersPage`.

### D6. Los tests de US05 se reescriben, no se borran

`CoursesPage.test.tsx` comprobaba un `h2` y una lista «Clases de …» por curso. Se sustituyen por las mismas comprobaciones de comportamiento sobre las dos presentaciones (cargando, carga única con `StrictMode`, error y reintento, aviso, vacío, texto plano, orden), más las nuevas. `courses.cy.ts` se actualiza igual (los pasos que buscaban `h2` y `ul[aria-label="Clases de …"]`).

## Risks / Trade-offs

- [`matchMedia` no existe en jsdom] → los tests lo simulan con un helper que permite fijar el ancho y disparar `change`; el hook tiene su propio test, también del caso sin `matchMedia`.
- [Cambio de estructura con la página abierta (girar el móvil)] → el hook se suscribe a `change` y la página cambia de presentación sin perder la búsqueda (vive en el estado de la página).
- [El servicio del frontend exige `createdAt`] → backend y frontend van en el mismo despliegue; una respuesta sin `createdAt` sería `unavailable` en lugar de pintar datos a medias.
- [La búsqueda trata «ñ» como «n»] → es lo esperado en una búsqueda tolerante con los acentos; el orden y la unicidad, que usan otras reglas, no cambian.
- [Muchos cursos] → el filtro es lineal y la lista es de decenas; si un colegio llegara a cientos, la paginación sería otra historia.

## Migration Plan

Sin migración: `courses.created_at` ya existe. Despliegue normal (backend y frontend juntos). Vuelta atrás: desplegar el commit anterior; el campo nuevo es aditivo y el frontend anterior lo ignora.

## Open Questions

Ninguna: las decisiones de producto están cerradas en la ficha de US06.
