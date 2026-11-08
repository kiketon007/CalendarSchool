## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-ui-lists-c` desde `main` actualizada (`fbd9b1b`, con US-UI-LISTS_b archivada), con los artefactos de este cambio y la concreción de la ficha en `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene esos ficheros y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Piezas sueltas: textos y filtros

- [x] 1.1 Añadir a `es.json` y `en.json` las claves de D8. `locales.test.ts` en verde
- [x] 1.2 Test que falla en `src/utils/subjectFilters.test.ts` para `hasActiveSubjectFilters` (sin filtros, con tipo, con estado, con texto y con solo espacios). Después, añadirla a `src/utils/subjectFilters.ts` hasta que pase

## 2. `/asignaturas`

- [x] 2.1 Tests que fallan en `SubjectsPage.test.tsx`:
  - `PageHeader` con «Plan académico», el `h1` «Asignaturas», la descripción y, solo para `ADMIN`, «Crear asignatura»;
  - la región «Catálogo de asignaturas» con «1 asignatura» y «N asignaturas» en su cabecera; sin contador cargando, con error o vacío, que van dentro del bloque;
  - los avisos de creada, actualizada, eliminada y «ya no existe» y el texto de solo lectura del `MEMBER` fuera del bloque;
  - los filtros dentro del bloque, con la búsqueda con su etiqueta visible y la lupa decorativa (`aria-hidden`);
  - con filtros, «Mostrando N de M asignaturas» en un `role="status"` (`subjects-count`) y el total en la cabecera; sin coincidencias, «No hay asignaturas que coincidan» y «Limpiar filtros», que los quita y enfoca la búsqueda; sin filtros, ninguna línea de resultados;
  - cada asignatura como `li.cs-list-item` con su `article` nombrado y el nombre en `h3`, sin `Card`, con «Editar» y «Borrar» para `ADMIN`.
- [x] 2.2 Cambiar `SubjectsPage.tsx` (D1–D4, D6, D7) hasta que pasen 2.1, sin tocar la carga, los filtros, el despliegue de los cursos, los permisos, el borrado ni el foco
- [x] 2.3 Ajustar el resto de `SubjectsPage.test.tsx`: encabezados de nivel 2 por nombre de asignatura a nivel 3 y `axe` con datos, vacío, carga y error; toda la suite del fichero en verde

## 3. `/reglas`

- [x] 3.1 Tests que fallan en `ConstraintsPage.test.tsx`, a 1280 y 360 px (`describe.each` con `installMatchMedia`):
  - `PageHeader` con «Generador de horarios», el `h1` «Reglas de reparto» y la descripción, sin acciones;
  - la región «Reglas del colegio» con «1 regla» y «N reglas» en su cabecera; sin contador cargando, con error o vacío, que van dentro del bloque;
  - los filtros dentro del bloque, con la lupa decorativa en la búsqueda;
  - con filtros, «Mostrando N de M reglas» en `constraints-count` y el total en la cabecera; sin filtros, `constraints-count` no existe; sin coincidencias, «No hay reglas que coincidan» y «Limpiar filtros»;
  - la tabla llamada «Reglas del colegio» (1280) y las filas con la asignatura en `h3`, sin `Card` (360).
- [x] 3.2 Cambiar `ConstraintsPage.tsx` (D1–D3, D5–D7) hasta que pasen 3.1, sin tocar la carga, los filtros, los enlaces ni los avisos
- [x] 3.3 Ajustar el resto de `ConstraintsPage.test.tsx` (nivel 3, el total en `.cs-list-count`, el recuento con filtros) y añadir `axe` con datos, vacío, carga y error a 1280 y 360 px; borrar `constraints.list` si deja de usarse; toda la suite del fichero en verde

## 4. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 4.1 Buscar en los tests (`App.test.tsx` y otros) los encabezados de nivel 2 de asignaturas o reglas, `constraints-count` y el nombre de la tabla de reglas (el título de la página), y ajustarlos
- [x] 4.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 5. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 5.1 Capturar la línea base de recuentos de `calendarschool` y `calendarschool_test`
- [x] 5.2 Ejecutar los tests de los ficheros cambiados (`SubjectsPage`, `ConstraintsPage`, `subjectFilters`, `locales`, `App`)
- [x] 5.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 5.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 5.5 Crear `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md` (con el tamaño del CSS y del JS del build frente a los de `main`) y marcar el paso solo con el informe creado

## 6. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Servir el build con `vite preview` (puerto 4173, desde `frontend/`) y comprobar con `curl` que la cabecera `Content-Security-Policy` es idéntica a la de `main` y que el CSS enlazado no tiene URLs externas
- [x] 6.2 Comprobar con `curl` que `/asignaturas` y `/reglas` devuelven la SPA
- [x] 6.3 Parar `vite preview`, comprobar que los puertos 4173, 3000 y 3001 quedan libres y crear `reports/YYYY-MM-DD-step-6-curl-manual-testing.md`

## 7. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Cambiar `subjects.cy.ts` y `constraints.cy.ts` (y las specs que busquen una asignatura por `article h2`, una regla por `h2` o lean `constraints-count` sin filtros, como `workload.cy.ts` o `courses.cy.ts`) a `h3` y a la cabecera del bloque, y añadir:
  - en `/asignaturas`, la región «Catálogo de asignaturas» con su contador y los filtros dentro, y a 360 y 1280 px sin desplazamiento horizontal con una asignatura de nombre y código largos, descripción y sus dos acciones;
  - en `/reglas`, a 1280 px, la región «Reglas del colegio» y la tabla dentro de su bloque, sin desplazamiento propio, con una regla de una asignatura de nombre largo, con código, avisos y su enlace; a 360 px, filas con `h3` y sin desplazamiento horizontal.
- [x] 7.2 Ejecutar las specs cambiadas y la suite completa en modo headless (`npm run test:e2e`), en dos tandas si la memoria lo exige
- [x] 7.3 Crear `reports/YYYY-MM-DD-step-7-e2e-cypress.md`

## 8. Documentación técnica (MANDATORY)

- [x] 8.1 Actualizar con la skill `update-docs`:
  - `frontend/CLAUDE.md`: el bullet «Páginas de listado (US-UI-LISTS)» con las dos rutas (y sin «lo seguirán»); los bullets de Asignaturas (filas con `h3`, línea de resultados y «Limpiar filtros», ya no «tarjeta») y de Reglas (`h3`, tabla nombrada por el bloque, total en la cabecera y recuento solo con filtros);
  - la ficha de US-UI-LISTS_c y la fila del módulo «Interfaz de usuario» en `docs/User_Stories_MVP.md` (implementada).
- [x] 8.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 8.3 Verificar con `openspec validate us-ui-lists-c --strict` que el cambio es válido

## 9. Despliegue y comprobación en producción

- [x] 9.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–8 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [x] 9.2 Comprobar en producción (`https://app.calendarschools.es`):
  - **Con `curl`:** `/asignaturas` y `/reglas` devuelven la SPA, la cabecera `Content-Security-Policy` no ha cambiado y `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, revisa `/asignaturas` y `/reglas` en escritorio y en móvil.
- [x] 9.3 Documentar el resultado en `reports/YYYY-MM-DD-step-9-production.md`
