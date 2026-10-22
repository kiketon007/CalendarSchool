## Context

US14 dejó `/alumnos` (`pages/StudentsPage.tsx`) como un listado mínimo: una petición a `GET /api/students` (`StudentSummary[]`, ordenado por apellidos y nombre en el servidor, sin datos sensibles), tabla desde 768 px o tarjetas, vacío, error y aviso de alta. `/profesores` (US10 y US11) ya resolvió en el navegador el total, la paginación de 20 en 20 (`components/Pagination`, `utils/pagination.ts`) y la búsqueda por palabras (`utils/professorSearch.ts` sobre `normalizeForSearch`), con el estado solo en memoria.

Restricciones: decisiones validadas en la ficha (filtrado en el navegador, un campo de búsqueda, filtros en la URL sin el texto buscado), un solo paso por interacción y TDD, textos por i18n y sin cambios de contrato.

## Goals / Non-Goals

**Goals:**
- Total, paginación, búsqueda y cuatro filtros combinables en `/alumnos`, iguales en tabla y tarjetas.
- Filtros y página en la URL, robustos ante valores obsoletos, sin el texto de búsqueda.
- Lógica de filtros pura y probada aparte de la página.

**Non-Goals:**
- Cambiar `GET /api/students`, el backend o la base de datos.
- Acciones por fila (US17 y US18), actualización automática, estados del alumno.
- Filtrar por una clase sin curso.

## Decisions

### 1. Una utilidad pura para los filtros: `utils/studentFilters.ts`

Separa de la página todo lo que se puede probar sin React:

- `type StudentFilters = { course: CourseFilter; class: ClassFilter; cafeteria: 'all' | 'yes' | 'no'; scholarship: 'all' | 'yes' | 'no' }`, con `CourseFilter = 'all' | 'none' | { id }` y `ClassFilter` análogo.
- `filtersFromParams(params: URLSearchParams, students)` → filtros **efectivos**: valida cada parámetro contra los alumnos cargados (un `curso` que no tiene ningún alumno, una `clase` que no es de ese curso, `comedor` distinto de `si`/`no`, `beca` sin `comedor=si` → su valor por defecto). Así un curso de otro colegio o borrado no filtra nada y nunca deja la página vacía por error.
- `paramsFromFilters(filters, page)` → `URLSearchParams` sin los valores por defecto (`pagina` solo si > 1).
- `courseOptions(students)` y `classOptions(students, courseId)` → las opciones de los desplegables, sacadas de los alumnos cargados (los cursos y clases con algún alumno; «Sin curso» y «Sin clase» solo si existen), ordenadas con `Intl.Collator('es', { numeric: true })`.
- `matchesStudentFilters(student, filters)` → el filtro estructurado; la búsqueda por texto se aplica aparte.

*Alternativa descartada:* pedir `GET /api/courses` para las opciones de curso y clase. Añadiría una segunda petición y su fallo, y mostraría cursos sin alumnos que solo producen listas vacías; sacar las opciones de los alumnos basta para filtrar.

### 2. La URL como fuente de verdad de los filtros y la página

`StudentsPage` usa `useSearchParams` de react-router: los filtros y la página **se derivan al pintar** de la URL (con `filtersFromParams` sobre la lista cargada), sin copiarlos a un estado propio, y cada cambio llama a `setSearchParams(paramsFromFilters(...), { replace: true })`. Mientras la lista carga, la URL no se toca: así una URL compartida no se «limpia» antes de tener los alumnos para validarla. Cambiar un filtro escribe `pagina` vacía (página 1). La página efectiva se acota con `Math.min` a la última al pintar, como en `/profesores`, sin reescribir la URL.

Los parámetros y valores van en castellano (`curso`, `clase`, `comedor`, `beca`, `pagina`; `si`, `no`, `sin-curso`, `sin-clase`) porque forman parte de la dirección visible de la SPA, como `/alumnos`; los identificadores de código siguen en inglés.

*Alternativas descartadas:* estado en `useState` sincronizado a la URL con un efecto (dos fuentes de verdad y un `setState` en efecto); `push` en cada cambio (llenaría el historial: «Atrás» recorrería cada filtro).

### 3. El texto de búsqueda solo en memoria

`useState` como en `/profesores`: son nombres de menores, y en la URL acabarían en el historial del navegador y en los enlaces copiados. Escribir en la búsqueda vuelve a la página 1, lo que sí reescribe la URL (quitando `pagina`).

### 4. Búsqueda por palabras compartida con los profesores

`utils/professorSearch.ts` pasa a `utils/personSearch.ts` con `matchesPersonSearch({ firstName, lastName }, query)` (el mismo cuerpo y JSDoc generalizado); `ProfessorsPage` y su test cambian solo el import. Sus tests se mueven con ella. Los alumnos tienen `firstName` y `lastName` como los profesores.

*Alternativa descartada:* duplicar la función para alumnos (el estándar pide detectar y no repetir patrones).

### 5. Presentación

- Barra de filtros encima del total, en una rejilla de Bootstrap que a 360 px apila los controles (sin desplazamiento horizontal). Un componente `components/StudentFilters.tsx` si la página crece demasiado; recibe filtros, opciones y callbacks, sin estado propio.
- Los desplegables desactivados (`Clase` sin curso, `Beca` sin comedor) llevan su ayuda ligada por `aria-describedby`.
- El total reutiliza el doble papel de `/profesores`: «N alumnos» sin filtros; con filtros o texto, un `role="status"` con «Mostrando N de M alumnos» o, sin coincidencias, el mensaje y «Limpiar filtros». `Limpiar filtros` hace `setQuery('')`, `setSearchParams({}, { replace: true })` y enfoca la búsqueda.
- Al cambiar de página, `scrollIntoView` al total sin mover el foco y el mismo manejo de foco del componente `Pagination`.

## Risks / Trade-offs

- [Colegios con miles de alumnos] → la carga completa y el filtrado en memoria se notarían; se medirá y, si hace falta, otra historia pasa los filtros al servidor (añadir parámetros opcionales no rompe el contrato).
- [Opciones sacadas de los alumnos: un curso sin alumnos no aparece] → no hay nada que filtrar en él; `/cursos` muestra sus números (US14_b).
- [URL obsoleta o manipulada] → se valida contra los alumnos cargados y se ignora lo que no encaja; nunca se envía a la API.
- [Derivar de la URL durante la carga] → la URL no se escribe hasta tener la lista, para no perder una URL compartida.
- [Mover `professorSearch`] → cambio de import en `ProfessorsPage`; sus tests siguen cubriendo el comportamiento.
- **Seguridad y privacidad:** sin cambios de acceso; la búsqueda no deja nombres en la URL; los datos sensibles no están en `StudentSummary`.
- **Rendimiento:** filtrado y paginación con `useMemo` sobre cientos de elementos; una petición al cargar.

## Migration Plan

Solo frontend: se publica con el despliegue normal; vuelta atrás revirtiendo la PR. Los enlaces con parámetros de una versión posterior se ignorarían en una anterior sin error.

## Open Questions

Ninguna: las decisiones de producto están validadas en la ficha.
