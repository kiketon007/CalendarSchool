## Context

`/profesores` (`pages/ProfessorsPage.tsx`, US09 y US10) carga todos los profesores una vez, prepara las filas (`ProfessorRow`) con `useMemo`, las pagina en el navegador (`utils/pagination.ts`, `PAGE_SIZE = 20`, la página en `useState` acotada al pintar) y muestra el total («N profesores») en un `<p data-testid="professors-count">` que también es el destino de `scrollIntoView` al cambiar de página.

`/cursos` (`pages/CoursesPage.tsx`, US06) ya tiene una búsqueda en el navegador: `query` en `useState`, un `Form.Control type="search"` con etiqueta visible y `ref`, `matchesCourseSearch` (`utils/courseSearch.ts`, sobre `normalizeForSearch`: NFD sin marcas, minúsculas `es`, espacios colapsados, `includes` sin expresiones regulares), un `<p role="status">` solo mientras hay texto con «Mostrando N de M» o el mensaje sin resultados, y «Limpiar búsqueda», que vacía y devuelve el foco al campo.

US11 solo toca el frontend: la API, el contrato y la base de datos no cambian.

## Goals / Non-Goals

**Goals:**

- Buscar por nombre y apellidos con palabras en cualquier orden, reutilizando la normalización de US06.
- Filtrar antes de paginar, volver a la página 1 al cambiar el texto y mantener tabla, tarjetas y paginación de US10.
- Repetir la experiencia de `/cursos` (estado anunciado, sin resultados, limpiar y foco) para que los dos listados se comporten igual.

**Non-Goals:**

- Buscar por cargo, tutoría o asignaturas; buscar en el servidor; debounce; tolerancia a erratas.
- Extraer un componente de búsqueda común con `/cursos` (ver decisión 4).

## Decisions

### 1. `matchesProfessorSearch` en `utils/professorSearch.ts`, por palabras

```ts
matchesProfessorSearch({ firstName, lastName }: { firstName: string; lastName: string }, query: string): boolean
```

Normaliza el texto con `normalizeForSearch` (importada de `utils/courseSearch.ts`), lo parte por espacios (`split(' ')` tras normalizar, que ya colapsa los espacios) y exige que **cada** palabra esté (`includes`) en `normalizeForSearch(`${firstName} ${lastName}`)`. Un texto vacío tras normalizar coincide siempre. Recibe solo nombre y apellidos para que añadir las asignaturas (`US-PROF-ASSIGN`) sea ampliar ese texto.

*Alternativa descartada:* reutilizar `matchesCourseSearch` con el texto seguido sobre «Nombre Apellidos» y «Apellidos, Nombre». No encuentra «garcia ana» en «García López, Ana» ni partes sueltas como «gar an»; la persona usuaria eligió palabras en cualquier orden.

*Alternativa descartada:* mover `normalizeForSearch` a un `utils/textSearch.ts` común. Sería un refactor de US06 sin beneficio inmediato; se importa desde donde está y, si aparece un tercer uso, se mueve.

### 2. Filtrar las filas preparadas, después paginar

Se filtran los profesores cargados (`loadedProfessors.filter(...)`) dentro del mismo `useMemo` que prepara las filas, con `query` como dependencia, y la paginación trabaja sobre las filas filtradas (`pageCountOf(rows.length)`, `paginate(rows, …)`). El total de US10 usa `loadedProfessors.length`; con texto, «Mostrando {rows.length} de {loadedProfessors.length}».

### 3. Volver a la página 1 en el `onChange` del campo

`onChange` hace `setQuery(value)` y `setPage(1)` a la vez. No se usa un efecto que observe `query` (un render de más con la página antigua y una regla menos explícita). «Limpiar búsqueda» hace lo mismo y enfoca el campo por su `ref`.

### 4. La línea del total cambia de papel, no se duplica

Sin texto, la página muestra el `<p data-testid="professors-count">` de US10 («M profesores», sin rol). Con texto, ese mismo `<p>` lleva `role="status"` y dice «Mostrando N de M profesores» o el mensaje sin resultados. Así hay una sola línea de recuento, sigue siendo el destino de `scrollIntoView` y no aparecen dos anuncios. Sin resultados no se pinta ni el listado ni la paginación, y debajo va el botón «Limpiar búsqueda».

*Alternativa descartada:* un componente `SearchField` compartido con `/cursos`. Las dos páginas difieren en el recuento (cursos no tiene total sin búsqueda) y en la paginación; extraerlo ahora obligaría a tocar US06 y sus tests. Se anota el patrón en `frontend-standards.md` y se decide al haber un tercer listado.

### 5. Textos

`professors.search.label` («Buscar por nombre o apellidos»), `.results` («Mostrando {{shown}} de {{total}} profesores»), `.noResults` («No hay profesores que coincidan con «{{query}}»», con el texto recortado) y `.clear` («Limpiar búsqueda»). i18next escapa la interpolación por defecto y React pinta texto, así que el texto buscado nunca se interpreta como marcado (se comprueba en un test).

## Risks / Trade-offs

- [Un `role="status"` que aparece y desaparece con el texto puede anunciarse de forma irregular en algunos lectores] → es la técnica ya aceptada en `/cursos` (US06); se mantiene la coherencia y el E2E comprueba el texto.
- [Los tests de US10 que buscan `professors-count` sin rol] → sin texto la línea no cambia; solo cambia con búsqueda.
- [Nombres con caracteres combinados raros] → `normalizeForSearch` ya los trata con NFD y `\p{M}`; los tests cubren `ñ`, tildes, guiones y apóstrofos.

## Migration Plan

Despliegue normal del frontend (S3 + invalidación de `index.html`); sin migraciones ni cambios de backend. Para volver atrás basta con revertir el commit.

## Open Questions

Ninguna: las decisiones de producto están validadas en la ficha de US11 (2026-10-21).
