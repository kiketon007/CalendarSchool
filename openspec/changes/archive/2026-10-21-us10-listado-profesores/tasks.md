## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us10-listado-profesores` desde `main` actualizada (llevando los artefactos de este cambio y la ficha US10 de `docs/User_Stories_MVP.md`, hoy en `docs/us10-enriquecer`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US10 y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Frontend: función pura de paginación

- [x] 1.1 Tests que fallan (`utils/pagination.test.ts`): `pageCountOf` con 0, 1, 20, 21, 45 y 60 elementos (mínimo 1); `paginate` en la primera página, una intermedia, la última incompleta, exactamente 20 elementos, una lista vacía, y una página fuera de rango (0, negativa y mayor que la última) acotada a la primera o la última
- [x] 1.2 Implementar `pageCountOf` y `paginate` en `utils/pagination.ts`, con tipos genéricos y JSDoc en castellano

## 2. Frontend: componente de paginación

- [x] 2.1 Añadir a `es.json` y `en.json` las claves `pagination.previous`, `pagination.next` y `pagination.pageOf` («Página {{page}} de {{pageCount}}»), y comprobar `locales.test.ts`
- [x] 2.2 Tests que fallan (`components/Pagination.test.tsx`): no pinta nada con `pageCount` 1; es una `nav` con el nombre recibido; «Anterior» deshabilitado en la primera y «Siguiente» en la última; pulsar llama a `onPageChange` con la página contigua; el indicador «Página X de N» está en una región `aria-live="polite"`; el foco se queda en el botón pulsado y pasa al otro si el pulsado queda deshabilitado; sin violaciones de `axe` en la primera, una intermedia y la última
- [x] 2.3 Implementar `components/Pagination.tsx` (`page`, `pageCount`, `onPageChange`, `label`) según el diseño (decisión 3)

## 3. Frontend: página de profesores

- [x] 3.1 Añadir a `es.json` y `en.json` `professors.fields.tutorship` («Tutoría»), `professors.tutorOf` («Tutor de {{course}} {{className}}»), `professors.noTutorship` («Sin tutoría»), `professors.count_one`/`count_other` («1 profesor», «{{count}} profesores») y `professors.pagination` («Paginación de profesores»); retirar `professors.fields.class`, `professors.classOf` y `professors.noClass` cuando ningún código las use
- [x] 3.2 Tests que fallan (`pages/ProfessorsPage.test.tsx`, en 1280 y 360 px con `installMatchMedia`): columna «Tutoría» con «Tutor de 1º Primaria A» y «Sin tutoría» con la clase del color secundario; el total «1 profesor» y «N profesores»; sin total ni paginación en el vacío; con 20, todos y sin navegación; con 45, los 20 primeros en el orden del servicio, «Página 1 de 3», «Siguiente» muestra del 21 al 40, la tercera los 5 últimos y «Anterior» vuelve; la vista vuelve al principio del listado al cambiar de página (doble de `scrollIntoView`); un «Reintentar» que trae una lista más corta no deja una página vacía; el aviso de creación con la primera página; un nombre largo lleva `text-break`; sin violaciones de `axe` con paginación en los dos anchos
- [x] 3.3 Implementar en `pages/ProfessorsPage.tsx` la tutoría en las filas preparadas, el total, `PAGE_SIZE = 20`, el estado `page` acotado al pintar, `paginate` sobre las filas (la misma página en la tabla y en las tarjetas), `Pagination` debajo del listado y el desplazamiento al principio al cambiar de página; actualizar el JSDoc del componente

## 4. Revisar los tests existentes (MANDATORY)

- [x] 4.1 Actualizar los tests de US09 de `ProfessorsPage.test.tsx` (columna «Clase», «1º Primaria · A», «Sin clase») a «Tutoría», «Tutor de 1º Primaria A» y «Sin tutoría», conservando lo que comprobaban
- [x] 4.2 Actualizar en `cypress/e2e/professors.cy.ts` los pasos que buscan «1º Primaria · A» y `es.professors.noClass` (US09 y US09_b), y comprobar que ningún otro test (p. ej. `App.test.tsx`, `CreateProfessorPage.test.tsx`) usa las claves retiradas

## 5. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 5.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`)
- [x] 5.2 Ejecutar los tests del frontend tocados (`pagination`, `Pagination`, `ProfessorsPage`, `locales`) y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend)
- [x] 5.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 5.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 5.5 Documentar el resultado en `reports/YYYY-MM-DD-step-5-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 6. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Arrancar el backend local y crear por la API un colegio con 25 profesores (uno de ellos tutor de una clase) y otro colegio con uno
- [x] 6.2 Comprobar con `curl` que `GET /api/professors` (sin cambios de contrato) devuelve los 25 del colegio, ordenados por apellidos y nombre, con `tutoredClass` en el tutor y `null` en el resto, ninguno del otro colegio, que ignora parámetros como `?page=2&limit=5`, y que sin token responde `401`
- [x] 6.3 Borrar los datos creados, comprobar que la base de datos coincide con la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 6.4 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-6-curl-manual-testing.md`

## 7. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Añadir a `professors.cy.ts` el caso de la paginación: 25 profesores creados por la API (uno con un nombre largo y otro tutor de una clase), «25 profesores», 20 filas, «Página 1 de 2», «Siguiente» con 5 filas, «Página 2 de 2» y el foco en «Anterior», la tutoría visible; y a 360 px, 20 tarjetas con la navegación, sin desplazamiento horizontal
- [x] 7.2 Ejecutar en modo headless `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts` y después `npm run test:e2e` completo
- [x] 7.3 Verificar y restaurar la base de datos de test
- [x] 7.4 Documentar el resultado en `reports/YYYY-MM-DD-step-7-e2e-cypress.md`

## 8. Documentación (MANDATORY)

- [x] 8.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` (paginación en el navegador accesible: `nav` con nombre, extremos deshabilitados, indicador `aria-live`, foco conservado, página en el estado y acotada al pintar)
- [x] 8.2 Actualizar `frontend/CLAUDE.md` (listado de profesores con tutoría, total y paginación; `Pagination` y `utils/pagination.ts`), el `CLAUDE.md` raíz y `README.md` si cambia el estado, y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: el componente de profesores) si describen el listado
- [x] 8.3 Añadir a las fichas de US11, US12, US13 y `US-PROF-ASSIGN` en `docs/User_Stories_MVP.md` las notas de lo que heredan de US10 (la búsqueda filtra sobre todos y vuelve a la página 1; dónde van las acciones y la columna de asignaturas; `Pagination` reutilizable)
- [x] 8.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 8.5 Verificar con `openspec validate us10-listado-profesores --strict` que el cambio es válido

## 9. Despliegue y comprobación en producción

- [x] 9.1 Abrir la PR con los grupos 0–8 y, tras integrarla la persona usuaria, verificar el despliegue automático (sin migraciones pendientes) y su smoke test
- [x] 9.2 Comprobar en producción con `curl` que `/profesores` sirve la SPA con la CSP y que el bundle contiene los textos nuevos, y que la persona usuaria, con un navegador real, ve el total, la tutoría y la paginación (si su colegio tiene más de 20 profesores) en escritorio y en el móvil, sin violaciones de CSP
- [x] 9.3 Documentar el resultado en `reports/YYYY-MM-DD-step-9-production.md`
