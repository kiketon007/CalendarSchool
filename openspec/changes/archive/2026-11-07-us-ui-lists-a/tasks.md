## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us-ui-lists-a` desde `main` actualizada (`4377f88`, con US-UI-SHELL archivada), con los artefactos de este cambio y la concreción de la ficha en `docs/User_Stories_MVP.md`
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene esos ficheros y `.claude/settings.json`, que debe volver a Sonnet con esfuerzo medio para la implementación

## 1. Piezas sueltas: iconos, textos y estilos

- [x] 1.1 Crear `SearchIcon`, `PencilIcon` y `Trash2Icon` en `src/components/icons/` con los trazos de Lucide (D8), con el patrón de `IconProps`, `aria-hidden` y `focusable="false"`
- [x] 1.2 Añadir a `es.json` y `en.json` las claves de D9 y quitar `calendars.courses` (y sus usos en los tests, que se rehacen en el grupo 4). `locales.test.ts` en verde
- [x] 1.3 Tests que fallan en `src/styles/theme.test.ts` para las clases de D7 (`.cs-list-header`, `.cs-search` con la lupa, `.cs-list-item`, `.cs-calendar-card::before` con la franja, `.cs-calendar-mark`, `.cs-section-label` de al menos 12 px, `.cs-day-panel` y `.cs-period-list` en dos columnas desde `sm`) y el contraste de `#5b6478` sobre `#fafaff` y sobre blanco ≥ 4,5:1. Después, crear `src/styles/_lists.scss` e importarlo en `theme.scss` tras `shell` hasta que pasen

## 2. Bloque del listado

- [x] 2.1 Tests que fallan de `src/components/ListSection.test.tsx`:
  - `section` con el nombre de su `h2` (`titleId`);
  - el contador solo si se pasa;
  - el `toolbar` solo si se pasa;
  - con `framed`, la `section` es la `cs-card` y el contenido va dentro; sin `framed`, solo la cabecera es `cs-card` y el contenido va debajo;
  - textos con `<b>` como texto plano;
  - `axe` en las dos variantes.
- [x] 2.2 Implementar `src/components/ListSection.tsx` (D1) hasta que pasen

## 3. `/cursos`

- [x] 3.1 Tests que fallan en `CoursesPage.test.tsx`, a 1280 y 360 px (`describe.each`):
  - `PageHeader` con «Estructura académica», el `h1`, la descripción y «Crear curso»;
  - la región «Todos los cursos» con «1 curso» y «N cursos»; sin contador cargando, con error o vacío, que van dentro del bloque;
  - los avisos de creado, actualizado, eliminado y «ya no existe» fuera del bloque;
  - la búsqueda dentro de la cabecera del bloque, con el nombre «Buscar por nombre» y el `placeholder`;
  - la tabla llamada «Todos los cursos» (1280) y las tarjetas con `h3` sin `Card` anidado (360).
- [x] 3.2 Cambiar `CoursesPage.tsx` (D2, D3, D4 y D5) hasta que pasen 3.1, sin tocar la carga, la búsqueda, las acciones, el borrado ni el foco
- [x] 3.3 Pasar a nivel 3 las búsquedas de encabezados de nivel 2 por nombre de curso del resto de `CoursesPage.test.tsx` y añadir `axe` con carga y con error; toda la suite del fichero en verde

## 4. `/calendarios`

- [x] 4.1 Tests que fallan en `CalendarsPage.test.tsx`:
  - `PageHeader` con «Organización académica», el `h1`, la descripción y «Crear calendario» solo para `ADMIN`;
  - la región «Tus calendarios» con «1 calendario» y «N calendarios»; carga, error y vacío dentro del bloque;
  - el texto de solo lectura del `MEMBER` y los avisos fuera del bloque;
  - cada calendario es un `article` con el nombre de su `h3`, «Jornada lectiva» con la lista de periodos (mismo `aria-label`), el resumen y «Cursos asignados» con los cursos o «Sin cursos asignados»;
  - «Editar» y «Borrar» con sus `aria-label` solo para `ADMIN`; ninguna etapa ni color.
- [x] 4.2 Cambiar `CalendarsPage.tsx` (D2, D3 y D6) hasta que pasen 4.1, sin tocar la carga, los avisos, el borrado ni el foco
- [x] 4.3 Pasar a nivel 3 las búsquedas de encabezados de nivel 2 por nombre de calendario del resto de `CalendarsPage.test.tsx` y añadir `axe` con carga, con error y vacío; toda la suite del fichero en verde

## 5. Revisar y actualizar los tests unitarios existentes (MANDATORY)

- [x] 5.1 Buscar en los tests (`App.test.tsx` y otros) los encabezados de nivel 2 de cursos o calendarios, `calendars.courses` y el nombre de la tabla de cursos (el título de la página), y ajustarlos
- [x] 5.2 Ejecutar `npm run lint`, `npm run typecheck --workspaces` y `npm run api:types:check -w frontend`, cada uno con su código de salida

## 6. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY)

- [x] 6.1 Capturar la línea base de recuentos de `calendarschool` y `calendarschool_test`
- [x] 6.2 Ejecutar los tests de los ficheros nuevos y cambiados (`ListSection`, `CoursesPage`, `CalendarsPage`, `theme`, `locales`, `App`)
- [x] 6.3 Ejecutar `npm test` con cobertura (90 % backend, 80 % frontend)
- [x] 6.4 Comprobar que la base queda como en la línea base y restaurarla si no
- [x] 6.5 Crear `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` (con el tamaño del CSS y del JS del build frente a los de `main`) y marcar el paso solo con el informe creado

## 7. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Servir el build con `vite preview` (puerto 4173) y comprobar con `curl` que la cabecera `Content-Security-Policy` es idéntica a la de `main` y que el CSS enlazado contiene `.cs-list-header`, `.cs-search` y `.cs-calendar-card`, sin URLs externas
- [x] 7.2 Comprobar con `curl` que `/cursos` y `/calendarios` devuelven la SPA
- [x] 7.3 Parar `vite preview`, comprobar que los puertos 4173, 3000 y 3001 quedan libres y crear `reports/YYYY-MM-DD-step-7-curl-manual-testing.md`

## 8. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Cambiar `courses.cy.ts` y `calendars.cy.ts` (y las specs que busquen esas tarjetas por `h2`) a `h3`, y añadir:
  - en `/cursos`, a 1280 px, la tabla sin desplazamiento propio con un curso de dos clases, tutores y sus cuatro acciones, y la región «Todos los cursos» con su contador;
  - en `/calendarios`, la región «Tus calendarios», «Jornada lectiva» y «Cursos asignados» en una tarjeta;
  - las dos páginas a 360 px y a 1280 px sin desplazamiento horizontal.
- [x] 8.2 Ejecutar las specs cambiadas y la suite completa en modo headless (`npm run test:e2e`), en dos tandas si la memoria lo exige
- [x] 8.3 Crear `reports/YYYY-MM-DD-step-8-e2e-cypress.md`

## 9. Documentación técnica (MANDATORY)

- [x] 9.1 Actualizar con la skill `update-docs`:
  - `frontend/CLAUDE.md`: un bullet «Páginas de listado (US-UI-LISTS)» con `ListSection`, `PageHeader` adoptado, `h3` en los elementos y los parciales; y los bullets de Cursos y Calendarios (`h3`, tabla nombrada por el bloque, `calendars.courses` eliminada); el bullet «Tema» deja de decir que `PageHeader` no lo usa ninguna página;
  - `README.md`: `ListSection` en el árbol de componentes;
  - la ficha de US-UI-LISTS_a y la fila del módulo «Interfaz de usuario» en `docs/User_Stories_MVP.md` (implementada).
- [x] 9.2 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio
- [x] 9.3 Verificar con `openspec validate us-ui-lists-a --strict` que el cambio es válido

## 10. Despliegue y comprobación en producción

- [x] 10.1 Repetir `npm run lint`, `typecheck` y `api:types:check`, cada uno con su código de salida, y abrir la PR con los grupos 0–9 tras la confirmación de la persona usuaria. Tras integrarla, verificar el CI del push a `main` y el despliegue
- [x] 10.2 Comprobar en producción:
  - **Con `curl`:** el CSS publicado contiene `.cs-list-header` y la cabecera `Content-Security-Policy` no ha cambiado; `/api/health` responde bien;
  - **La persona usuaria, con un navegador real**, revisa `/cursos` y `/calendarios` en escritorio y en móvil.
- [x] 10.3 Documentar el resultado en `reports/YYYY-MM-DD-step-10-production.md`
