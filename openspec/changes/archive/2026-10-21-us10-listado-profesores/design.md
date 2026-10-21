## Context

`/profesores` (`pages/ProfessorsPage.tsx`, US09) pide `GET /api/professors` una vez, prepara las filas con `useMemo` (`ProfessorRow`: nombre «Apellidos, Nombre», cargo y clase ya traducidos) y pinta **una** de dos estructuras según `useMediaQuery('(min-width: 768px)')`: una `Table` o una lista de tarjetas. La API devuelve todos los profesores del colegio ordenados por apellidos y nombre, cada uno con `tutoredClass` (`{ id, name, courseId, courseName }` o `null`). No hay paginación en ningún listado del frontend todavía: `/cursos` (US06) y `/usuarios` muestran todo.

US10 solo toca el frontend: el contrato, el backend y el modelo de datos no cambian. Lo que sigue es cómo encajar la paginación, el total y la columna «Tutoría» sin romper lo que ya garantiza US09 (carga única con `StrictMode`, una sola estructura en el árbol de accesibilidad, aviso de creación).

## Goals / Non-Goals

**Goals:**

- Paginar en el navegador, 20 por página, con una navegación accesible y reutilizable por US11 y otros listados.
- Mostrar el total y la tutoría («Tutor de 1º Primaria A» / «Sin tutoría»).
- Mantener la tabla y las tarjetas con los mismos datos y la misma página.

**Non-Goals:**

- Paginación en el servidor, parámetros en `GET /api/professors` o cambios en el contrato.
- Búsqueda (US11), asignaturas (`US-PROF-ASSIGN`), acciones por fila (US12, US13).
- Guardar la página en la URL, en `history.state` o en almacenamiento.

## Decisions

### 1. Paginación en el navegador sobre la lista completa

La página ya tiene todos los profesores en memoria (decenas); paginar es `slice` sobre las filas preparadas. Una función pura en `utils/pagination.ts`:

- `pageCountOf(total: number, pageSize: number): number` (mínimo 1, para que «Página 1 de 1» tenga sentido aunque no se pinte).
- `paginate<T>(items: readonly T[], page: number, pageSize: number): T[]`, que acota `page` al rango válido (una página fuera de rango da la última o la primera, nunca una lista vacía con elementos disponibles).

`PAGE_SIZE = 20` es una constante de la página, no un parámetro de la API.

*Alternativa descartada:* paginar en el servidor (`?page=&limit=`). Añade contrato, validación, recuento y obliga a US11 a buscar en el servidor; con decenas de filas no aporta nada. Si un colegio llegara a cientos, se cambiaría en otra historia.

### 2. La página actual vive en `useState` y se acota al pintar

`const [page, setPage] = useState(1)`. Al pintar se usa `Math.min(page, pageCount)`, así una lista que se recarga más corta (tras «Reintentar») nunca deja una página vacía. No se guarda en la URL (decisión de producto: al volver a `/profesores` se empieza en la primera, también tras crear un profesor, y el aviso de creación sigue funcionando sin tocar).

*Alternativa descartada:* `?pagina=N` en la URL. Haría la página compartible y conservada al volver atrás, pero la persona usuaria lo dejó fuera, y US11 tendría que combinarlo con la búsqueda, que vive en el estado como en US06.

### 3. Un componente `components/Pagination.tsx` sin dependencias de profesores

Props: `page`, `pageCount`, `onPageChange(page)`, `label` (nombre accesible de la `nav`). Pinta `<nav aria-label={label}>` con dos `Button` («Anterior», «Siguiente», textos de `pagination.*`) y un indicador «Página X de N» en un elemento con `aria-live="polite"` (y `aria-atomic="true"`). No se pinta si `pageCount <= 1` (la decisión vive en el componente, no en cada página).

- **Foco:** el botón pulsado conserva el foco porque no se desmonta; si queda deshabilitado (llegar a la última o a la primera), el componente mueve el foco al otro botón en un efecto tras el render (con `ref` a cada botón). Un botón deshabilitado con el foco lo perdería al `body`.
- **Desplazamiento:** la página, al cambiar de página, lleva la vista al principio del listado (`scrollIntoView` sobre el título o el contenedor, `block: 'start'`), sin mover el foco (que debe quedarse en la paginación para seguir pasando páginas). En jsdom `scrollIntoView` no existe: se comprueba con un doble en el test.

*Alternativa descartada:* la `Pagination` de react-bootstrap (lista de números de página). Con 2–5 páginas los números no aportan, son enlaces sin `href` en su marcado y obligan a nombrar cada número; «Anterior / Página X de N / Siguiente» es lo que pide la historia.

*Alternativa descartada:* mover el foco al título o a la primera fila tras cambiar de página. Es útil en listados largos con lector de pantalla, pero rompe el uso repetido de «Siguiente» con teclado; el anuncio `aria-live` del indicador ya informa del cambio.

### 4. La columna «Tutoría» y el total, en las filas preparadas

`ProfessorRow.tutoredClass` pasa a `tutorship: { text: string; none: boolean }` (o similar), con `t('professors.tutorOf', { course, className })` → «Tutor de 1º Primaria A» y `t('professors.noTutorship')` → «Sin tutoría»; `none` pinta la clase `text-body-secondary` en la celda y en la tarjeta. El total usa los plurales de i18next (`professors.count_one` / `_other`, «1 profesor», «N profesores») y se pinta encima del listado, como texto normal (no `role="status"`: no cambia con la paginación).

Las claves `professors.fields.class`, `professors.classOf` y `professors.noClass` se retiran si ninguna otra página las usa (`CreateProfessorPage` tiene sus propias claves de formulario; se comprueba con una búsqueda antes de borrar). `locales.test.ts` vigila que `es.json` y `en.json` sigan teniendo las mismas claves.

### 5. Nombres largos

Sin cambios de estructura: Bootstrap ya parte las palabras en las celdas y tarjetas; se añade `text-break` al nombre (cabecera de fila y `h2`) para que un nombre de 100 caracteres sin espacios no desborde a 360 px. El E2E lo comprueba con un nombre largo.

## Risks / Trade-offs

- [Cambian los textos «1º Primaria · A» y «Sin clase» que comprueban los tests de `ProfessorsPage` y los E2E de `professors.cy.ts` (también los añadidos en US09_b)] → se actualizan en el mismo cambio conservando lo que comprobaban; tarea propia en `tasks.md`.
- [El foco al quedar deshabilitado el botón pulsado es difícil de reproducir en jsdom] → test de componente con `userEvent` y `toHaveFocus` sobre el otro botón, y comprobación en el E2E (`have.focus`).
- [`aria-live` dentro de la `nav` puede anunciarse también al montar] → el indicador se monta con la lista cargada y solo cambia al pulsar; se acepta un anuncio inicial.
- [Una lista de varios cientos de profesores] → `slice` en memoria sigue siendo trivial; si el tamaño de la respuesta llegara a ser un problema, la paginación pasaría al servidor (otra historia).

## Migration Plan

Despliegue normal del frontend (S3 + invalidación de `index.html`); sin migraciones ni cambios de backend. Para volver atrás basta con revertir el commit.

## Open Questions

Ninguna: las decisiones de producto están validadas en la ficha de US10 (2026-10-21).
