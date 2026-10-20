# Informe del paso 10 - E2E con Cypress

- Fecha: 2026-10-20
- Cambio: us08-borrar-curso
- Agente: Claude Sonnet 5.5

## Qué se cambió y qué se añadió

- **`frontend/cypress/e2e/courses.cy.ts`** (de 23 a 29 tests). Se añadieron las interceptaciones `@courseImpact` (`GET /api/courses/*/impact`) y `@deleteCourse` (`DELETE /api/courses/*`).
  - **Actualizado:** el test de la tabla en escritorio ya no comprueba que no hay botones: ahora comprueba que el único botón de la página es el «Borrar 1º Primaria» (habilitado) y que sigue sin haber textos de horario ni alumnos.
  - **Nuevos** (grupo «deleting a course», 6 tests):
    1. **Borrado completo:** un administrador abre «Borrar 1º Primaria» (con tres clases); el diálogo dice «¿Borrar «1º Primaria»?», «Se borrarán sus 3 clases.» y «Esta acción no se puede deshacer.», y «Cancelar» tiene el foco. Al confirmar, el `DELETE` responde `200` con `{ deleted: { classCount: 3, studentCount: 0 } }`, el diálogo se cierra, se ve «Curso «1º Primaria» eliminado», la fila desaparece, «2º Primaria» sigue, el foco está en el título y la lista no se vuelve a pedir; tras recargar, el curso no aparece.
    2. **Cancelar y Escape** no borran nada (`@deleteCourse.all` queda en 0) y el foco vuelve al botón «Borrar».
    3. **Curso borrado por otra persona** (por la API) mientras el diálogo está abierto: al confirmar, el `DELETE` responde `404`, el diálogo se cierra, se ve «Ese curso ya no existe» y la lista se vuelve a pedir sin ese curso.
    4. **Último curso:** al borrarlo se ve «Todavía no hay cursos» con «Crear curso», sin campo de búsqueda, y el aviso de borrado.
    5. **Miembro:** entra con su cuenta, borra un curso y ve el aviso.
    6. **360 px:** el botón «Borrar» está en la tarjeta, el diálogo abierto dice «Se borrarán sus 6 clases.» y no hay desplazamiento horizontal.
- Revisión de los demás E2E (7.2): solo el de la tabla necesitó el cambio de arriba.

## Comandos ejecutados

Desde la raíz, con PostgreSQL 17 en Docker Compose; el script compila ambos workspaces, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec cypress/e2e/courses.cy.ts` (dos veces)
- `npm run test:e2e` (suite completa), con la salida a un fichero
- Limpieza al terminar: `cleanE2eData` de `scripts/e2eData.mjs` sobre el esquema `public` de `calendarschool_test`.

## Resultados

- **Spec, primera ejecución:** 28 de 29. El único fallo fue un defecto real de la aplicación que los tests unitarios (jsdom) no podían ver: tras borrar, el `h1` **no se quedaba con el foco** en el navegador. Causa: react-bootstrap llama a `onExited` y *justo después* suelta la captura de foco del diálogo; el `focus()` sobre el título producía un evento `focus` que programaba una comprobación (`setTimeout`) de «enforce focus», que devolvía el foco al diálogo que acababa de desaparecer. En jsdom el orden de los efectos es otro y no ocurría.
- **Corrección** (un solo intento): `CoursesPage.handleExited` enfoca el título un turno después (`window.setTimeout(…, 0)`), con la causa explicada en un comentario. Se actualizó antes la decisión D7 de `design.md`. Los 128 tests de `CoursesPage` siguen pasando.
- **Spec, segunda ejecución:** 29 de 29.
- **Suite completa** (2 min 11 s de Cypress, salida 0): 140 pasan, 0 fallan, 0 pendientes, en 14 ficheros (los 134 de antes más los 6 nuevos).

| Spec | Tests |
|---|---|
| `courses.cy.ts` | 29 |
| `csp.cy.ts` | 11 |
| `health.cy.ts` | 1 |
| `home.cy.ts` | 1 |
| `invitation-acceptance.cy.ts` | 4 |
| `invitations.cy.ts` | 2 |
| `login.cy.ts` | 21 |
| `logout.cy.ts` | 6 |
| `onboarding.cy.ts` | 4 |
| `password-reset.cy.ts` | 5 |
| `registration.cy.ts` | 33 |
| `session.cy.ts` | 13 |
| `users-management.cy.ts` | 4 |
| `users.cy.ts` | 6 |

## Verificación de la persistencia

Los tests de borrado comprueban en el navegador que el curso no vuelve a aparecer tras recargar el listado, y el del curso borrado por otra persona comprueba que el `DELETE` obsoleto responde `404`. Además, los tests de integración y las pruebas con `curl` (paso 9) comprueban en la base de datos que el curso y sus clases desaparecen.

## Restauración

- `cleanE2eData` vació `calendarschool_test.public`; los recuentos de `calendarschool` y de todos los esquemas de `calendarschool_test` coinciden con la línea base del paso 8 (comparados con `diff`, sin diferencias).
- Los puertos 3000, 3001, 4173 y 5173 quedan libres (el script de E2E para sus servidores al terminar).
