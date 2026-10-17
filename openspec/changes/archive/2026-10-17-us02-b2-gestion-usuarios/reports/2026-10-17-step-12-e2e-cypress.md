# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-17
- Cambio: us02-b2-gestion-usuarios
- Agente: Claude Sonnet 5.5

## Qué se añadió

- **`frontend/cypress/e2e/users-management.cy.ts`** (4 tests). Reutiliza las tareas de Cypress `createUser` y los helpers de `users.cy.ts` (alta por la API, datos únicos por test); no hacen falta tareas nuevas, porque `createUser` ya admite el rol `ADMIN`:
  1. Un administrador pulsa «Hacer administrador» en la fila de un miembro: `PUT /api/users/*/role` responde `200`, la fila pasa a mostrar el rol de administrador y «Hacer miembro», y no aparece ningún aviso.
  2. Baja y reactivación de un miembro:
     - Cancelar el diálogo no envía nada y la fila sigue activa.
     - Confirmarlo da de baja (`POST …/suspend` `200`): el diálogo se cierra, la fila muestra «Dado de baja» y solo ofrece «Reactivar».
     - El inicio de sesión de esa cuenta (por la API, porque un `403` no fija cookie) responde `403 ACCOUNT_SUSPENDED`.
     - «Reactivar» (`200`) devuelve la fila a «Activo» y «Miembro».
     - Tras borrar las cookies, el miembro inicia sesión por el formulario con su contraseña de antes y llega a `/onboarding`.
  3. El único administrador ve «(tú)» en su fila y sin «Dar de baja»; al pulsar «Hacer miembro» recibe `409` (`PUT …/role`), ve «El colegio debe tener al menos un administrador» en un aviso `role="alert"` y su fila sigue mostrando el rol de administrador, sin salir de `/usuarios`.
  4. Con otro administrador creado con `createUser`, el administrador que se pasa a sí mismo a miembro recibe `200`, llega a `/onboarding` y ya no ve el enlace «Usuarios».
- **`csp.cy.ts`:** el test de login y cierre de sesión crea un miembro con `createUser`, y en `/usuarios` abre el diálogo de la baja (visible, y cancelado), provoca el aviso del último administrador y comprueba al final que no hubo ninguna violación de la política. El modal de Bootstrap ajusta estilos desde JavaScript, no con atributos, y no viola la CSP estricta.

## Comandos ejecutados

Desde la raíz del repositorio, con PostgreSQL 17 en Docker Compose; el script compila el backend y el frontend, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec "cypress/e2e/users-management.cy.ts"`
- `npm run test:e2e -- --spec "cypress/e2e/users-management.cy.ts,cypress/e2e/users.cy.ts,cypress/e2e/csp.cy.ts"`
- `npm run test:e2e` (suite completa)

## Resultados

- **Spec nueva** (4 s): `users-management.cy.ts` 4 de 4.
- **Specs afectadas** (11 s): `users-management.cy.ts` 4 de 4, `users.cy.ts` 6 de 6 y `csp.cy.ts` 9 de 9; 19 pasan, 0 fallan.
- **Suite completa** (1 min 21 s, salida 0): 94 pasan, 0 fallan, 0 pendientes, en 9 ficheros:

| Spec | Tests |
|---|---|
| `csp.cy.ts` | 9 |
| `health.cy.ts` | 1 |
| `home.cy.ts` | 1 |
| `login.cy.ts` | 21 |
| `logout.cy.ts` | 6 |
| `registration.cy.ts` | 33 |
| `session.cy.ts` | 13 |
| `users-management.cy.ts` | 4 |
| `users.cy.ts` | 6 |

- Los E2E existentes pasan sin cambios con la columna de acciones nueva: `users.cy.ts` solo cuenta filas y busca texto con `contain`.
- Ningún test inestable ni reintentado.
- Al terminar, los puertos 3001 y 4173 no tienen ningún proceso escuchando (los sockets que quedan unos segundos en `TIME_WAIT` no pertenecen a ningún proceso); el 3000 estaba libre.
- Las specs de `users-management.cy.ts` y la ampliación de `csp.cy.ts` pasaron a la primera, sin fase roja previa: se escribieron contra una funcionalidad ya implementada y probada con tests unitarios y de integración.

## Persistencia de los datos y estado de la base de datos de test

- Los datos de los tests se confirmaron en la base: la lista de `/usuarios` los lee de PostgreSQL a través de la API real, y el login del miembro reactivado solo funciona si el estado `ACTIVE` y la contraseña de antes persistieron. Tras la suite completa, `public` de `calendarschool_test` tenía 59 usuarios, 52 colegios, 65 refresh tokens y 70 intentos limitados; entre los usuarios de los tests de gestión había 5 administradores y 6 miembros activos (2 de ellos, los de los tests de ascenso y de baja y reactivación, con el estado y el rol que dejó la interfaz).
- El E2E no borra sus datos al terminar, a propósito, para investigar una ejecución fallida (se vacían al empezar la siguiente).
- Restauración: `TRUNCATE TABLE public.users, public.schools, public.refresh_tokens, public.rate_limit_attempts RESTART IDENTITY CASCADE` sobre `calendarschool_test`. Las capturas posteriores de `calendarschool` y de `calendarschool_test` son **idénticas** a las de la línea base (`diff`, salida 0), con `municipalities` en 542 en todos los esquemas.

## Resultado

- Estado del paso 12: **PASS**
- Incidencias bloqueantes: ninguna.
