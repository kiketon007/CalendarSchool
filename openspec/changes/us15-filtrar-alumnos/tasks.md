## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us15-filtrar-alumnos` desde `main` actualizada (llevando los artefactos de este cambio y las fichas US15 y US16 de `docs/User_Stories_MVP.md`, hoy en `docs/us15-enriquecer`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, las fichas y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Búsqueda por palabras compartida

- [x] 1.1 Mover `utils/professorSearch.ts` y su test a `utils/personSearch.ts` (`matchesPersonSearch`, JSDoc generalizado), cambiar el import de `ProfessorsPage` y comprobar que sus tests y los de la página siguen pasando sin cambios de comportamiento

## 2. Frontend: utilidad de filtros

- [x] 2.1 Tests que fallan (`utils/studentFilters.test.ts`): `filtersFromParams` con valores válidos, desconocidos, de cursos o clases sin alumnos cargados, `clase` sin curso o de otro curso, `beca` sin `comedor=si`; `paramsFromFilters` sin los valores por defecto y con `pagina` solo si > 1; ida y vuelta
- [x] 2.2 Tests que fallan: `courseOptions` y `classOptions` (solo cursos y clases con alumnos, orden natural en castellano, «Sin curso» y «Sin clase» solo si existen) y `matchesStudentFilters` (cada filtro y su combinación)
- [x] 2.3 Implementar `utils/studentFilters.ts` según el diseño (decisión 1)

## 3. Frontend: textos

- [x] 3.1 Añadir a `es.json` y `en.json` los textos `students.*`: total (plural), «Mostrando N de M alumnos», búsqueda, etiquetas y opciones de los cuatro filtros, ayudas de los desplegables desactivados, sin coincidencias, «Limpiar filtros» y la etiqueta de la paginación

## 4. Frontend: página

- [x] 4.1 Tests que fallan (`StudentsPage.test.tsx`, a 1280 y 360 px con `describe.each`): total; paginación de 20 en 20 (con 45 alumnos), misma página en tabla y tarjetas, sin paginación con una página; sin barra de filtros ni total sin alumnos
- [x] 4.2 Implementar el total y la paginación en `pages/StudentsPage.tsx` (reutilizando `Pagination` y `paginate`, con el desplazamiento al total)
- [x] 4.3 Tests que fallan: búsqueda (palabras, acentos, sin cambiar la URL ni pedir nada) y los cuatro filtros (opciones, desactivados con su ayuda, reinicio de la clase y de la beca, combinación, vuelta a la página 1, «Mostrando N de M»)
- [x] 4.4 Implementar la barra de filtros (o `components/StudentFilters.tsx`) y su aplicación en la página
- [x] 4.5 Tests que fallan: la URL (filtros y página iniciales desde la URL, escritura con `replace` sin valores por defecto ni texto, valores obsoletos ignorados, página fuera de rango acotada, URL intacta mientras carga); sin coincidencias y «Limpiar filtros» con el foco; aviso de alta con filtros; `axe` con datos, con filtros y sin coincidencias
- [x] 4.6 Implementar la lectura y escritura de la URL con `useSearchParams` según el diseño (decisión 2) y «Limpiar filtros»

## 5. Revisar los tests existentes (MANDATORY)

- [x] 5.1 Revisar los tests de `StudentsPage` (US14), `ProfessorsPage` y `App` y los E2E de `students.cy.ts` y `courses.cy.ts` que miran el listado de alumnos, y actualizarlos conservando lo que comprobaban

## 6. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 6.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`)
- [x] 6.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend)
- [x] 6.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 6.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 6.5 Documentar el resultado en `reports/YYYY-MM-DD-step-6-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 7. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 7.1 Arrancar el backend local y comprobar con `curl` que `GET /api/students` sigue igual (forma de `StudentSummary`, orden, aislamiento entre colegios, `401` sin token) y que ignora los parámetros de consulta (`?curso=…&pagina=2` devuelve la lista completa)
- [x] 7.2 Borrar los datos creados, comprobar la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 7.3 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-7-curl-manual-testing.md`

## 8. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 8.1 Añadir a `students.cy.ts`, con alumnos creados por la API: búsqueda sin acentos; curso, clase y «Sin clase»; comedor y beca; sin coincidencias y «Limpiar filtros» con el foco; paginación con más de 20 alumnos; recargar una URL con filtros y página los conserva y la búsqueda no aparece en la URL; 360 px sin desplazamiento horizontal con la barra de filtros
- [x] 8.2 Ejecutar en modo headless `students.cy.ts` y después `npm run test:e2e` completo
- [x] 8.3 Verificar y restaurar la base de datos de test
- [x] 8.4 Documentar el resultado en `reports/YYYY-MM-DD-step-8-e2e-cypress.md`

## 9. Documentación (MANDATORY)

- [x] 9.1 Aplicar la skill `update-docs`: `docs/frontend-standards.md` con el patrón nuevo (filtros en la URL derivados al pintar, `replace`, valores obsoletos ignorados, sin datos personales en la URL)
- [x] 9.2 Actualizar `frontend/CLAUDE.md` (US15 en alumnos y la búsqueda de personas compartida), `README.md` (árbol, si cambian ficheros), la arquitectura si describe el listado de alumnos y las notas de US17 y US18 en `docs/User_Stories_MVP.md` (volver al listado conservando la URL)
- [x] 9.3 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 9.4 Verificar con `openspec validate us15-filtrar-alumnos --strict` que el cambio es válido

## 10. Despliegue y comprobación en producción

- [ ] 10.1 Abrir la PR con los grupos 0–9 y, tras integrarla la persona usuaria, verificar el despliegue automático y su smoke test
- [ ] 10.2 Comprobar en producción con `curl` que `/alumnos` (también con parámetros) sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `GET /api/students` sin token responde `401`, y que la persona usuaria, con un navegador real, busca, filtra, pagina y recarga con filtros, en escritorio y en el móvil, sin violaciones de CSP
- [ ] 10.3 Documentar el resultado en `reports/YYYY-MM-DD-step-10-production.md`
