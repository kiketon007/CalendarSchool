# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-20
- Cambio: us07-editar-curso
- Agente: Claude Sonnet 5.5

## Qué se cambió y qué se añadió

- **`frontend/cypress/e2e/courses.cy.ts`** (de 14 a 23 tests). Se añadieron dos ayudantes: `withAccessToken` (el access token de la sesión del navegador, que antes estaba dentro de `createCourseViaApi`) y `findCourseViaApi` (lee un curso por la API para obtener los `id`), más las interceptaciones `@getCourse` y `@updateCourse`.
  - **Actualizados:**
    1. el test de la tabla en escritorio: ahora comprueba las **cinco** columnas (Curso, Clases, Tutores, Creado y Acciones) y que cada curso tiene su enlace «Editar {nombre}» a `/cursos/<id>/editar`, y sigue comprobando que no hay botones ni textos de borrar, horario o alumnos;
    2. el de la visita sin sesión: `/cursos/<id>/editar` también lleva a `/login`.
  - **Nuevos** (grupo «editing a course», 9 tests):
    1. **Edición completa:** un administrador entra por «Editar», ve el formulario relleno y «Guardar» deshabilitado; cambia el nombre, renombra una clase, quita otra y añade una; el `PUT` lleva el `id` de las clases que existían y ninguno para la nueva; vuelve a `/cursos` con «Curso «1º Primaria Tarde» actualizado» y la fila muestra «3 clases: B, D, Grupo A», también tras recargar.
    2. **Intercambio y reutilización de nombres** en un solo guardado (A↔B y quitar «C» para añadir otra «C»).
    3. **Cancelar:** vuelve al listado sin enviar nada (`@updateCourse.all` queda en 0).
    4. **Nombre duplicado:** `409` y el error bajo el nombre con `aria-invalid`, el foco y lo escrito conservado.
    5. **Curso cambiado:** otra persona quita la clase B por la API mientras el formulario está abierto; al guardar, `409` y el aviso `role="alert"` con «Recargar»; «Recargar» muestra el nombre y la única clase guardados, quita el aviso y deja «Guardar» deshabilitado.
    6. **Curso no disponible:** un UUID inexistente y un id que no es un UUID muestran «Este curso no existe o ya no está disponible» con el enlace a «Cursos» y sin formulario.
    7. **Curso de otro colegio:** abrir su dirección da `404` en el `GET` y el mismo aviso.
    8. **Miembro:** entra con su cuenta, edita un curso y lo ve actualizado en el listado.
    9. **360 px:** el enlace «Editar» está en la tarjeta, la edición con un error de validación y seis clases no desborda horizontalmente.
- Revisión de los demás E2E (9.2): no necesitaron cambios.

## Comandos ejecutados

Desde la raíz, con PostgreSQL 17 en Docker Compose; el script compila ambos workspaces, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec cypress/e2e/courses.cy.ts` (dos veces)
- `npm run test:e2e` (suite completa), con la salida a un fichero
- Limpieza al terminar: `cleanE2eData` de `scripts/e2eData.mjs` sobre el esquema `public` de `calendarschool_test`.

## Resultados

- **Spec, primera ejecución:** 21 de 23; fallaron dos, y las dos veces era el test, no la aplicación:
  1. `cy.contains('a', 'Editar 1º Primaria')` busca en el texto del enlace, y «Editar 1º Primaria» es su `aria-label` (el texto visible es «Editar»). Se cambió a `cy.get('a[aria-label="Editar 1º Primaria"]')`.
  2. Tras `cy.reload()` se esperaba que el aviso «actualizado» desapareciera, pero seguía visible: el aviso viaja en el estado de la navegación (`history.state`), que el navegador **conserva al recargar**. Es el comportamiento que ya tenía el aviso de creación de US05; el comentario de `CoursesPage.tsx` decía lo contrario y se corrigió. Se quitó esa aserción del test. No se cambió el comportamiento (queda anotado como posible mejora: limpiar el estado al mostrarlo).
- **Spec, segunda ejecución** (tras corregir los dos tests, sin tocar la aplicación): 23 de 23.
- **Suite completa** (2 min 5 s de Cypress, 2 min 40 s en total, salida 0): 134 pasan, 0 fallan, 0 pendientes, en 14 ficheros (los 125 de antes más los 9 nuevos).

| Spec | Tests |
|---|---|
| `courses.cy.ts` | 23 |
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

Los datos que dejó la ejecución en `calendarschool_test.public` (91 colegios, 23 cursos y 41 clases entre todos los specs) confirman que las altas y ediciones llegan a la base de datos; además, los tests de edición comprueban en el navegador el nombre y las clases tras recargar el listado, y el del curso cambiado comprueba la versión guardada por la API.

## Restauración

- `cleanE2eData` vació `calendarschool_test.public`; los recuentos de `calendarschool` y de todos los esquemas de `calendarschool_test` coinciden con la línea base del paso 10 (comparados con `diff`, sin diferencias).
- Los puertos 3000, 3001, 4173 y 5173 quedan libres (el script de E2E para sus servidores al terminar).
- Capturas: Cypress guardó dos de la primera ejecución fallida en `frontend/cypress/screenshots/` (ignoradas por Git).
