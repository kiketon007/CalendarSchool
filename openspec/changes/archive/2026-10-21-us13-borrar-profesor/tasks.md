## 0. Preparación: crear la rama (MANDATORY - FIRST STEP)

- [x] 0.1 Crear la rama `feature/us13-borrar-profesor` desde `main` actualizada (llevando los artefactos de este cambio y la ficha US13 de `docs/User_Stories_MVP.md`, hoy en `docs/us13-enriquecer`)
- [x] 0.2 Verificar la rama actual y que el árbol de trabajo solo contiene los artefactos de este cambio, la ficha US13 y `.claude/settings.json`, que vuelve a Sonnet con esfuerzo medio al empezar la implementación

## 1. Contrato de la API

- [x] 1.1 En `docs/api-spec.yml`: `DELETE /api/professors/{id}` (`deleteProfessor`) con `200`, `401`, `404`, `500` y `503`, y el esquema `DeleteProfessorResponse` (`deleted.freedClass`: `null` o `{ id, name, courseName }`)
- [x] 1.2 Regenerar los tipos con `npm run api:types -w frontend`, fijar la operación y el esquema en `api/schema.test.ts` con `expectTypeOf` y comprobar `npm run api:types:check -w frontend`

## 2. Backend: dominio y aplicación

- [x] 2.1 Añadir el tipo `DeletedProfessor` y el método `delete` al puerto `ProfessorRepository` (con JSDoc en castellano), con un stub temporal en `PrismaProfessorRepository` para que compile
- [x] 2.2 Tests que fallan (`deleteProfessor.test.ts`): `DeleteProfessor` pasa el colegio y el id al repositorio, devuelve lo liberado, lanza `ProfessorNotFound` sin evento si el repositorio devuelve `null`, y registra `PROFESSOR_DELETED` con `freed_class` (verdadero y falso) sin nombres
- [x] 2.3 Implementar `DeleteProfessor` en `application/professors/`

## 3. Backend: infraestructura

- [x] 3.1 Tests de integración que fallan (`prismaProfessorRepository.int.test.ts`): borrar un profesor sin clase (`freedClass: null`); con clase (`freedClass` con el nombre de la clase y del curso, la clase sigue y queda sin tutor, el curso intacto); de otro colegio e inexistente (`null`, nada borrado); dos borrados simultáneos (uno con resultado y otro `null`); una edición simultánea que espera y devuelve `null` si el borrado gana; atomicidad con un disparador temporal que hace fallar el borrado; base de datos inalcanzable (`DatabaseUnavailable`)
- [x] 3.2 Implementar `delete` en `PrismaProfessorRepository` según el diseño (decisión 2): bloqueo de la fila, lectura de la clase y borrado, sin escribir la clase a mano

## 4. Backend: presentación

- [x] 4.1 Tests que fallan (`professorsRoute.test.ts`): `DELETE /:id` con `200` y lo liberado, `404` (también `id` no UUID, sin llegar al caso de uso), `401`, `503`, el colegio y el autor de la identidad
- [x] 4.2 Implementar la ruta en `professorsRouter` con `parseProfessorId`, y el cableado en `app.ts`, `composeApp.ts` y `appDoubles.ts`
- [x] 4.3 Tests HTTP de integración (`professors.int.test.ts`): borrar con y sin tutoría con la base real (la clase sin tutor en `GET /api/courses` y el profesor fuera de `GET /api/professors`), otro colegio (`404`), un `MEMBER`, sin sesión `401` y base caída `503`

## 5. Frontend: servicio

- [x] 5.1 Tests que fallan (`professorsService.test.ts`): `delete` envía `DELETE /api/professors/{id}` con el id codificado y sin cuerpo, devuelve `deleted` con `freedClass` (y `null`), `notFound`, `unauthenticated` y `unavailable` (también con un cuerpo mal formado o un error de red), y nunca lanza
- [x] 5.2 Implementar `professorsService.delete`

## 6. Frontend: diálogo y listado

- [x] 6.1 Añadir a `es.json` y `en.json` los textos del borrado (`professors.delete.*`: título, comprobando, tutoría, no se puede deshacer, cancelar, confirmar, borrando, error de consulta, reintentar, error de borrado, eliminado, eliminado con clase liberada, ya no existe; `professors.deleteLabel`)
- [x] 6.2 Tests que fallan (`DeleteProfessorModal.test.tsx`): cerrado sin peticiones; al abrirse, una sola consulta (también con `StrictMode`) y «Comprobando…» con el botón deshabilitado; con y sin tutoría; error con «Reintentar»; `404` en la consulta llama a `onGone`; confirmar una sola vez (doble pulsación con respuesta pendiente), «Borrando…», sin cerrarse con Escape; `onDeleted` con lo liberado; `404` al borrar llama a `onGone`; error al borrar con aviso y reintento; foco inicial en «Cancelar»; `axe`
- [x] 6.3 Implementar `components/DeleteProfessorModal.tsx` según el diseño (decisión 3)
- [x] 6.4 Tests que fallan (`ProfessorsPage.test.tsx`, en 1280 y 360 px): botón «Borrar» por fila y tarjeta con nombre accesible; abrir y cancelar sin borrar; tras borrar, el profesor desaparece sin volver a pedir la lista, el total, la búsqueda y la página se recalculan, el aviso (con y sin clase liberada) y el foco al título tras cerrarse; `onGone` avisa y vuelve a pedir la lista; `axe` con el diálogo abierto
- [x] 6.5 Implementar en `ProfessorsPage` el botón «Borrar», el diálogo, el aviso de la página y el foco al título según el diseño (decisión 4); actualizar el JSDoc

## 7. Revisar los tests existentes (MANDATORY)

- [x] 7.1 Revisar los tests de `ProfessorsPage` (celdas de «Acciones», enlaces y botones, «only Edit»), los dobles de `ProfessorRepository` y `appDoubles`, y `professors.cy.ts`, y actualizarlos conservando lo que comprobaban

## 8. Ejecutar los tests y verificar la base de datos (MANDATORY)

- [x] 8.1 Capturar la línea base de la base de datos (recuentos por tabla en `calendarschool` y en los esquemas de `calendarschool_test`)
- [x] 8.2 Ejecutar los tests tocados y después `npm test` completo con cobertura (mínimos: 90 % backend, 80 % frontend)
- [x] 8.3 Ejecutar `npm run lint`, `npm run typecheck --workspaces`, `npm run build` y `npm run api:types:check -w frontend`
- [x] 8.4 Verificar que la base de datos coincide con la línea base y restaurarla si no
- [x] 8.5 Documentar el resultado en `reports/YYYY-MM-DD-step-8-unit-test-and-db-verification.md` y marcar el paso solo con los tests en verde y el informe creado

## 9. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [x] 9.1 Arrancar el backend local y crear por la API dos colegios, un curso con clases y profesores (con y sin tutoría)
- [x] 9.2 Probar con `curl` `DELETE /api/professors/{id}`: sin tutoría (`freedClass: null`); con tutoría (`freedClass` y la clase sin tutor en `GET /api/courses`); el mismo otra vez (`404`); otro colegio (`404`, nada borrado); `abc` (`404`); sin token (`401`); dos borrados simultáneos (`200` y `404`); y que un `PUT` de un profesor ya borrado da `404`
- [x] 9.3 Comprobar el evento `PROFESSOR_DELETED` en el log, sin nombres, y que los `404` no dejan evento
- [x] 9.4 Borrar los datos creados, comprobar que la base de datos coincide con la línea base, parar el backend y comprobar que el puerto 3000 queda libre
- [x] 9.5 Documentar los comandos y respuestas (sin contraseñas ni tokens) en `reports/YYYY-MM-DD-step-9-curl-manual-testing.md`

## 10. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [x] 10.1 Añadir a `professors.cy.ts` los casos del borrado: sin tutoría; con tutoría (aviso en el diálogo, aviso final y «Sin tutor» en `/cursos`); cancelar con Escape y el foco en «Borrar»; el foco en el título tras borrar; el profesor que otra persona borra (por la API) antes de confirmar; con una búsqueda activa cuyo único resultado se borra; a 360 px con el diálogo abierto y sin desplazamiento horizontal
- [x] 10.2 Ejecutar en modo headless `npm run test:e2e -- --spec cypress/e2e/professors.cy.ts` y después `npm run test:e2e` completo
- [x] 10.3 Verificar y restaurar la base de datos de test
- [x] 10.4 Documentar el resultado en `reports/YYYY-MM-DD-step-10-e2e-cypress.md`

## 11. Documentación (MANDATORY)

- [x] 11.1 Aplicar la skill `update-docs`: `docs/backend-standards.md` y `docs/frontend-standards.md` solo con lo que el borrado de profesores añada al patrón de US08 (p. ej. dejar que la clave ajena `ON DELETE SET NULL` libere la relación, un diálogo que consulta el registro en lugar de un endpoint de impacto)
- [x] 11.2 Actualizar `backend/CLAUDE.md` y `frontend/CLAUDE.md`, el `CLAUDE.md` raíz (estado), `README.md` (árbol), `MODELO_DATOS.md` (borrado real del profesor y liberación de su clase) y la arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL)
- [x] 11.3 Añadir a las fichas de US14 y de las historias de horarios en `docs/User_Stories_MVP.md` las notas de lo que heredan de US13 (qué pasa con los alumnos de una clase que se queda sin tutor; el diálogo tendrá que contar lo que se pierde)
- [x] 11.4 Verificar que `.claude/settings.json` está en Sonnet con esfuerzo medio, como piden los estándares fuera de la planificación
- [x] 11.5 Verificar con `openspec validate us13-borrar-profesor --strict` que el cambio es válido

## 12. Despliegue y comprobación en producción

- [x] 12.1 Abrir la PR con los grupos 0–11 y, tras integrarla la persona usuaria, verificar el despliegue automático (sin migraciones pendientes) y su smoke test
- [x] 12.2 Comprobar en producción con `curl` que `/profesores` sirve la SPA con la CSP, que el bundle contiene los textos nuevos y que `DELETE /api/professors/<id>` sin token responde `401`, y que la persona usuaria, con un navegador real, borra un profesor sin y con tutoría (y lo ve en `/cursos`) y cancela, en escritorio y en el móvil, sin violaciones de CSP
- [x] 12.3 Documentar el resultado en `reports/YYYY-MM-DD-step-12-production.md`
