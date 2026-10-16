# Informe del paso 12 - E2E con Cypress

- Fecha: 2026-10-16
- Cambio: us02-b1-usuarios-colegio
- Agente: Claude Sonnet 5.5

## Qué se añadió

- **Tarea de Cypress `createUser`** (`scripts/e2eData.mjs`, registrada en `frontend/cypress.config.ts`): crea un usuario `ACTIVE` con el rol indicado en el colegio de otro usuario existente (por su email), con la contraseña hasheada con Bcrypt de coste 12 como el backend, y devuelve su id. Solo actúa sobre bases `*_test` (la misma salvaguarda que `cleanE2eData` y `setUserStatus`), valida el nombre del esquema y el rol, y falla sin crear nada si ningún usuario tiene ese email. Es provisional hasta que US02_b4 permita crear miembros por la interfaz. Sus pruebas están en `backend/test/support/e2eData.test.ts` (salvaguardas) y `e2eData.int.test.ts` (contra PostgreSQL, incluida la verificación del hash con `BcryptPasswordHasher`).
- **`frontend/cypress/e2e/users.cy.ts`** (6 tests):
  1. Un administrador abre `/usuarios` desde la navegación y ve su fila y la de un miembro, con rol y estado traducidos y el orden del servidor.
  2. Un miembro inicia sesión por el formulario, no ve el enlace «Usuarios» y, al abrir `/usuarios`, llega a `/onboarding` sin ningún aviso.
  3. Un miembro que llama a `GET /api/users` con su access token recibe `403 FORBIDDEN`.
  4. Tras cerrar la sesión, abrir `/usuarios` lleva a `/login`.
  5. Con un access token caducado (`401 INVALID_SESSION` simulado una vez), la página renueva la sesión sola y muestra la lista.
  6. Con un `503` simulado muestra el aviso y «Reintentar» carga la lista.
- **`csp.cy.ts`**: tras iniciar sesión, el test abre `/usuarios` desde la navegación y comprueba que la tabla se ve sin violaciones de la CSP.

## Comandos ejecutados

Desde la raíz del repositorio, con PostgreSQL 17 en Docker Compose; el script compila el backend y el frontend, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec "cypress/e2e/users.cy.ts,cypress/e2e/csp.cy.ts"`
- `npm run test:e2e` (suite completa)

## Resultados

- **Specs afectadas** (42 s): `users.cy.ts` 6 de 6 y `csp.cy.ts` 9 de 9; 15 pasan, 0 fallan.
- **Suite completa** (1 min 51 s): 90 pasan, 0 fallan, 0 pendientes, en 8 ficheros:

| Spec | Tests |
|---|---|
| `csp.cy.ts` | 9 |
| `health.cy.ts` | 1 |
| `home.cy.ts` | 1 |
| `login.cy.ts` | 21 |
| `logout.cy.ts` | 6 |
| `registration.cy.ts` | 33 |
| `session.cy.ts` | 13 |
| `users.cy.ts` | 6 |

- Los E2E existentes (`session.cy.ts`, `logout.cy.ts`, `login.cy.ts`, `registration.cy.ts`) pasan sin cambios con el nuevo layout: `/onboarding` mantiene su contenido, la cabecera sigue en las páginas protegidas y no aparece en `/login`.
- Ningún test inestable ni reintentado. Al terminar, los puertos 3001 y 4173 quedan libres.
- Las specs de `users.cy.ts` y la ampliación de `csp.cy.ts` pasaron a la primera, sin fase roja previa: se escribieron contra una funcionalidad ya implementada y probada con tests unitarios y de integración.

## Persistencia de los datos y estado de la base de datos de test

- Los datos creados por la interfaz (usuarios, colegios, sesiones) se confirmaron en la base: la lista de `/usuarios` los lee de PostgreSQL a través de la API real, y el miembro de los tests 2 y 3 existe solo porque `createUser` lo insertó en la base y el login lo encontró.
- Tras la suite completa, `public` de `calendarschool_test` tenía 51 usuarios (3 miembros), 48 colegios, 60 refresh tokens y 66 intentos limitados. El E2E no los borra al terminar, a propósito, para investigar una ejecución fallida (se vacían al empezar la siguiente).
- Restauración: `TRUNCATE TABLE public.users, public.schools, public.refresh_tokens, public.rate_limit_attempts RESTART IDENTITY CASCADE` sobre `calendarschool_test`. Las capturas posteriores de `calendarschool` y de `calendarschool_test` son **idénticas** a las de la línea base (`diff`), con `municipalities` en 542 en todos los esquemas.

## Resultado

- Estado del paso 12: **PASS**
- Incidencias bloqueantes: ninguna.
