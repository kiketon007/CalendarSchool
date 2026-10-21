## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us11-buscar-profesores` desde `main` actualizada (llevando los artefactos de este cambio y la ficha US11 de `docs/User_Stories_MVP.md`, hoy en `docs/us11-enriquecer`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US11 y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Frontend: función pura de búsqueda

- [x] 1.1 Tests que fallan (`utils/professorSearch.test.ts`): coincide por nombre y por apellido como parte de una palabra; sin mayúsculas, acentos ni espacios sobrantes; la `ñ` busca como `n`; varias palabras en cualquier orden («ana garcia», «garcia ana», «gar an»); no coincide si falta una palabra («ana perez» frente a «García, Ana»); guiones y apóstrofos como texto normal («garcía-lópez», «lopez», «o'neill»); texto vacío y solo espacios coinciden siempre; caracteres de expresiones regulares («.*», «(») son texto
- [x] 1.2 Implementar `matchesProfessorSearch({ firstName, lastName }, query)` en `utils/professorSearch.ts` sobre `normalizeForSearch` de `utils/courseSearch.ts`, con JSDoc en castellano

## 2. Frontend: búsqueda en la página de profesores

- [x] 2.1 Añadir a `es.json` y `en.json` `professors.search.label`, `.results`, `.noResults` y `.clear`, y comprobar `locales.test.ts`
- [x] 2.2 Tests que fallan (`pages/ProfessorsPage.test.tsx`, en 1280 y 360 px): el campo con su etiqueta y `maxLength` 100 solo con profesores; filtra al escribir en el orden del servicio; «Mostrando N de M profesores» en un `role="status"` solo con texto, y «M profesores» sin rol con el campo vacío o solo espacios; varias palabras en cualquier orden; sin resultados con el mensaje (texto como texto plano), «Limpiar búsqueda», sin listado ni paginación, y al limpiar vuelven todos con el foco en el campo; con 45 profesores y 25 coincidencias, «Página 1 de 2», y desde la página 2 un cambio del texto vuelve a la 1; sin violaciones de `axe` con búsqueda y sin resultados
- [x] 2.3 Implementar en `pages/ProfessorsPage.tsx` el estado `query`, el filtro dentro del `useMemo` de las filas, la vuelta a la página 1 en el `onChange` y en «Limpiar búsqueda», la línea del total con su doble papel y el botón «Limpiar búsqueda» con el foco al campo; actualizar el JSDoc del componente

## 3. Revisar los tests existentes (MANDATORY)

- [x] 3.1 Revisar los tests de US09 y US10 de `ProfessorsPage.test.tsx` (p. ej. «does not offer actions of future stories», que comprobaba que no hay `searchbox`) y de `professors.cy.ts`, y adaptarlos a la búsqueda conservando lo que comprobaban

## 4. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 4.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`)
- [x] 4.2 Ejecutar los tests del frontend tocados (`professorSearch`, `ProfessorsPage`, `locales`) y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend)
- [x] 4.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 4.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 4.5 Documentar el resultado en `reports/YYYY-MM-DD-step-4-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 5. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 5.1 Arrancar el backend local y crear por la API un colegio con profesores de nombres con tildes, `ñ`, guiones y apóstrofos («García-López, José María», «O'Neill, Mary», «Núñez, Íñigo»)
- [x] 5.2 Comprobar con `curl` que `GET /api/professors` (sin cambios de contrato) devuelve esos nombres tal cual (UTF-8, sin escapar ni normalizar), ordenados, y que ignora parámetros como `?q=garcia` (devuelve todos); sin token, `401`
- [x] 5.3 Borrar los datos creados, comprobar que la base de datos coincide con la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 5.4 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-5-curl-manual-testing.md`

## 6. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 6.1 Añadir a `professors.cy.ts` los casos de la búsqueda: con profesores creados por la API, «garcia jose» encuentra a «García-López, José María» con «Mostrando 1 de N profesores»; «zzz» muestra el mensaje y «Limpiar búsqueda», que devuelve todos y el foco al campo; con 25 profesores de apellido común y otros, la búsqueda deja una sola página o «Página 1 de 2» según el caso y vuelve a la 1 desde la 2; a 360 px, sin desplazamiento horizontal con búsqueda
- [x] 6.2 Ejecutar en modo headless `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts` y después `npm run test:e2e` completo
- [x] 6.3 Verificar y restaurar la base de datos de test
- [x] 6.4 Documentar el resultado en `reports/YYYY-MM-DD-step-6-e2e-cypress.md`

## 7. Documentación (MANDATORY)

- [x] 7.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` (búsqueda por palabras en cualquier orden, filtrar antes de paginar y volver a la página 1, una sola línea de recuento con doble papel)
- [x] 7.2 Actualizar `frontend/CLAUDE.md` (búsqueda de profesores), `README.md` (`utils/professorSearch.ts` si se listan las utilidades, y la descripción de `ProfessorsPage`) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL: el componente de profesores)
- [x] 7.3 Añadir a las fichas de `US-PROF-ASSIGN` (añadir las asignaturas al texto de `matchesProfessorSearch`), US12 y US13 en `docs/User_Stories_MVP.md` las notas de lo que heredan de US11
- [x] 7.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 7.5 Verificar con `openspec validate us11-buscar-profesores --strict` que el cambio es válido

## 8. Despliegue y comprobación en producción

- [x] 8.1 Abrir la PR con los grupos 0–7 y, tras integrarla la persona usuaria, verificar el despliegue automático (sin migraciones pendientes) y su smoke test
- [x] 8.2 Comprobar en producción con `curl` que `/profesores` sirve la SPA con la CSP y que el bundle contiene los textos nuevos, y que la persona usuaria, con un navegador real, busca con y sin acentos, con varias palabras, sin resultados y limpia, en escritorio y en el móvil, sin violaciones de CSP
- [x] 8.3 Documentar el resultado en `reports/YYYY-MM-DD-step-8-production.md`
