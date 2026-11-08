## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-ui-lists-b` desde `main` actualizada (`6f34a87`, con US-UI-LISTS_a archivada), con los artefactos de este cambio y la concreción de la ficha en `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene esos ficheros y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Piezas sueltas: textos y estilos

- [x] 1.1 Añadir a `es.json` y `en.json` las claves de D9. `locales.test.ts` en verde
- [x] 1.2 Test que falla en `src/styles/theme.test.ts` para `.cs-search-wide` (ancho completo también desde `sm`, D10). Después, añadir la regla a `src/styles/_lists.scss` hasta que pase

## 2. `/profesores`

- [x] 2.1 Tests que fallan en `ProfessorsPage.test.tsx`, a 1280 y 360 px:
  - `PageHeader` con «Equipo docente», el `h1`, la descripción, «Resumen de carga» y «Crear profesor»;
  - la región «Equipo docente» con «1 profesor» y «N profesores» en su cabecera; sin contador cargando, con error o vacío, que van dentro del bloque;
  - los avisos de creado, actualizado (con y sin tutoría sustituida), eliminado y «ya no existe» fuera del bloque;
  - la búsqueda en la cabecera del bloque, con el nombre «Buscar por nombre, apellidos o asignatura» y el `placeholder`;
  - con texto, «Mostrando N de M profesores» en un `role="status"` dentro del bloque y el total en la cabecera; sin texto, ningún `role="status"` de resultados;
  - la tabla llamada «Equipo docente» (1280) y las filas con `h3` sin `Card` (360);
  - al cambiar de página, `scrollIntoView` sobre el `h2` del bloque.
- [x] 2.2 Cambiar `ProfessorsPage.tsx` (D1–D7) hasta que pasen 2.1, sin tocar la carga, la búsqueda, la paginación, las acciones, el borrado ni el foco
- [x] 2.3 Ajustar el resto de `ProfessorsPage.test.tsx`: encabezados de nivel 2 por nombre de profesor a nivel 3, el total leído en la cabecera del bloque y `axe` con carga y con error; toda la suite del fichero en verde

## 3. `/profesores/resumen`

- [x] 3.1 Tests que fallan en `ProfessorsSummaryPage.test.tsx`, a 1280 y 360 px:
  - `PageHeader` con «Carga lectiva», el `h1` «Resumen de carga» y la descripción, sin acciones;
  - el aviso «Faltan profesores» y «todas asignadas» fuera del bloque;
  - la región «Carga por profesor» con el total en su cabecera; los filtros, la carga, el error y el vacío dentro;
  - con filtros, «Mostrando N de M profesores» en un `role="status"`; sin filtros, ninguna línea de resultados;
  - la tabla llamada «Carga por profesor» (1280) y la lista con `h3` sin `Card` (360), con el detalle desplegable dentro del elemento.
- [x] 3.2 Cambiar `ProfessorsSummaryPage.tsx` (D1, D2, D5–D8) hasta que pasen 3.1, sin tocar los filtros, el detalle, sus peticiones ni los avisos
- [x] 3.3 Ajustar el resto de `ProfessorsSummaryPage.test.tsx` (nivel 3, el recuento con y sin filtros) y añadir `axe` con el aviso, sin él, con carga y con error; toda la suite del fichero en verde

## 4. `/alumnos`

- [x] 4.1 Tests que fallan en `StudentFilters.test.tsx`: la lupa decorativa (`aria-hidden`) en el campo de búsqueda, con la etiqueta visible de hoy, y `axe`. Después, cambiar `StudentFilters.tsx` (D4) hasta que pasen
- [x] 4.2 Tests que fallan en `StudentsPage.test.tsx`, a 1280 y 360 px:
  - `PageHeader` con «Comunidad escolar», el `h1`, la descripción y «Crear alumno»;
  - la región «Alumnado» con «1 alumno» y «N alumnos» en su cabecera; los filtros, la carga, el error y el vacío dentro;
  - los avisos de creado, actualizado, eliminado y «ya no existe» fuera del bloque;
  - con filtros o texto, «Mostrando N de M alumnos» en un `role="status"` dentro del bloque y el total en la cabecera;
  - la tabla llamada «Alumnado» (1280) y las filas con `h3` y sus acciones, sin `Card` (360);
  - al cambiar de página, `scrollIntoView` sobre el `h2` del bloque y la URL con la página.
- [x] 4.3 Cambiar `StudentsPage.tsx` (D1–D7) hasta que pasen 4.2, sin tocar la URL, los filtros, el texto en memoria, `state.listSearch`, el borrado ni el foco
- [x] 4.4 Ajustar el resto de `StudentsPage.test.tsx` (nivel 3, el total en la cabecera) y añadir `axe` con carga y con error; toda la suite del fichero en verde

## 5. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 5.1 Buscar en los tests (`App.test.tsx` y otros) los encabezados de nivel 2 de profesores o alumnos, los `data-testid` de recuento y el nombre de las tablas (el título de la página), y ajustarlos
- [x] 5.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 6. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 6.1 Capturar la línea base de recuentos de `calendarschool` y `calendarschool_test`
- [x] 6.2 Ejecutar los tests de los ficheros cambiados (`ProfessorsPage`, `ProfessorsSummaryPage`, `StudentsPage`, `StudentFilters`, `theme`, `locales`, `App`)
- [x] 6.X Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 6.X Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 6.X Crear `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` (con el tamaño del CSS y del JS del build frente a los de `main`) y marcar el paso solo con el informe creado

## 7. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Servir el build con `vite preview` (puerto 4173) y comprobar con `curl` que la cabecera `Content-Security-Policy` es idéntica a la de `main` y que el CSS enlazado contiene `.cs-search-wide`, sin URLs externas
- [x] 7.2 Comprobar con `curl` que `/profesores`, `/profesores/resumen` y `/alumnos` devuelven la SPA
- [x] 7.3 Parar `vite preview`, comprobar que los puertos 4173, 3000 y 3001 quedan libres y crear `reports/YYYY-MM-DD-step-7-curl-manual-testing.md`

## 8. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Cambiar `professors.cy.ts`, `professorsSummary.cy.ts`, `students.cy.ts` (y las specs que busquen esas filas por `h2` o lean el total en la línea de recuento) a `h3` y a la cabecera del bloque, y añadir:
  - en `/profesores`, a 1280 px, la tabla sin desplazamiento propio con un profesor con varias asignaturas, tutoría y sus tres acciones, y la región «Equipo docente» con su contador;
  - en `/profesores/resumen`, a 1280 px, la tabla sin desplazamiento propio con los datos de su spec, la región «Carga por profesor» y el aviso de clases sin profesor fuera de ella;
  - en `/alumnos`, la región «Alumnado» con los filtros dentro y su contador;
  - las tres páginas a 360 px y a 1280 px sin desplazamiento horizontal.
- [x] 8.2 Ejecutar las specs cambiadas y la suite completa en modo headless (`npm run test:e2e`), en dos tandas si la memoria lo exige
- [x] 8.3 Crear `reports/YYYY-MM-DD-step-8-e2e-cypress.md`

## 9. Documentación técnica (MANDATORY)

- [x] 9.1 Actualizar con la skill `update-docs`:
  - `frontend/CLAUDE.md`: el bullet «Páginas de listado (US-UI-LISTS)» con las tres rutas, el total en la cabecera y el resultado en su línea, los filtros dentro del bloque y el `scrollIntoView` al `h2`; y los bullets de Profesores, Resumen de carga y Alumnos (`h3`, tablas nombradas por el bloque);
  - la ficha de US-UI-LISTS_b y la fila del módulo «Interfaz de usuario» en `docs/User_Stories_MVP.md` (implementada).
- [x] 9.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 9.3 Verificar con `openspec validate us-ui-lists-b --strict` que el cambio es válido

## 10. Despliegue y comprobación en producción

- [x] 10.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–9 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [x] 10.2 Comprobar en producción:
  - **Con `curl`:** el CSS publicado contiene `.cs-search-wide` y la cabecera `Content-Security-Policy` no ha cambiado; `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, revisa `/profesores`, `/profesores/resumen` y `/alumnos` en escritorio y en móvil.
- [x] 10.3 Documentar el resultado en `reports/YYYY-MM-DD-step-10-production.md`
