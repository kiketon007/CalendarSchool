# Informe del paso 13 - E2E con Cypress

- Fecha: 2026-10-18
- Cambio: us02-b3-invitaciones
- Agente: Claude Sonnet 5.5

## Qué se añadió

- **`frontend/cypress/e2e/invitations.cy.ts`** (2 tests). Usa el alta por la API y datos únicos por test, como `users-management.cy.ts`; no hacen falta tareas de Cypress nuevas:
  1. Un administrador recién registrado abre `/usuarios` (`GET /api/invitations` responde `200` y la sección dice que no hay invitaciones), genera una invitación de miembro (el rol por defecto; `POST /api/invitations` responde `201`) y ve el aviso del panel. El campo del enlace empieza por `http://localhost:4173/invitacion#`. Con la escritura del portapapeles simulada, «Copiar» la llama exactamente con ese enlace y aparece «Enlace copiado» en un `role="status"`. «Hecho» cierra el panel y la invitación queda en la lista. Tras recargar, la invitación sigue en la lista, el enlace no se ve y el texto `invitacion#` no aparece en la página. Elige «Administrador» y genera otra; la más reciente va la primera. Revoca la de miembro (`POST …/revoke` responde `204`) y desaparece, también tras recargar.
  2. Un `503` simulado al generar muestra el aviso «No se ha podido generar la invitación» en un `role="alert"`, sin panel de enlace y sin filas.
- **`csp.cy.ts`:** el test de login y cierre de sesión, ya en `/usuarios`, genera una invitación, ve el panel con el enlace, pulsa «Copiar» (con el portapapeles real del navegador de Cypress: da igual si lo permite o cae en la alternativa manual, el `role="status"` aparece), pulsa «Hecho» y comprueba que la tabla de invitaciones es visible. Al final no hay ninguna violación de la política.
- **Revisión de los E2E existentes (tarea 10.2):** los selectores `[data-testid="users-page"] table` de `users.cy.ts`, `users-management.cy.ts` y `csp.cy.ts` pasan a `table[aria-labelledby="users-title"]`, porque la sección de invitaciones vive dentro de `users-page` y también tiene una tabla.

## Comandos ejecutados

Desde la raíz del repositorio, con PostgreSQL 17 en Docker Compose; el script compila el backend y el frontend, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec "cypress/e2e/invitations.cy.ts,cypress/e2e/csp.cy.ts,cypress/e2e/users.cy.ts,cypress/e2e/users-management.cy.ts"`
- `npm run test:e2e` (suite completa)
- Limpieza al terminar: `cleanE2eData` de `scripts/e2eData.mjs` sobre el esquema `public` de `calendarschool_test`.

## Resultados

- **Specs afectadas** (13 s de Cypress, 54 s con la compilación): `invitations.cy.ts` 2 de 2, `csp.cy.ts` 9 de 9, `users.cy.ts` 6 de 6 y `users-management.cy.ts` 4 de 4; 21 pasan, 0 fallan.
- **Suite completa** (1 min 24 s de Cypress, 1 min 53 s en total, salida 0): 96 pasan, 0 fallan, 0 pendientes, en 10 ficheros:

| Spec | Tests |
|---|---|
| `csp.cy.ts` | 9 |
| `health.cy.ts` | 1 |
| `home.cy.ts` | 1 |
| `invitations.cy.ts` | 2 |
| `login.cy.ts` | 21 |
| `logout.cy.ts` | 6 |
| `registration.cy.ts` | 33 |
| `session.cy.ts` | 13 |
| `users-management.cy.ts` | 4 |
| `users.cy.ts` | 6 |

- Los puertos 3001 y 4173 quedaron libres al terminar.
- Notas: sin tests inestables ni reintentos. El `USER_LOGIN_FAILED` con motivo `SUSPENDED` del log es el escenario esperado de `users-management.cy.ts`. Los E2E no leen el `url` desde la base de datos: la persistencia se comprueba con la recarga de la página, que vuelve a pedir la lista al servidor.

## Base de datos de test

- Antes de la ejecución, el esquema `public` de `calendarschool_test` estaba vacío, con 6 migraciones y sin la tabla `access_links` (la aplicó el script del E2E al arrancar).
- Tras la suite completa quedaban datos del E2E (los vacía el script al empezar, nunca al terminar): 61 usuarios, 54 colegios, 67 sesiones, 72 intentos y 3 enlaces de acceso.
- Restauración: `cleanE2eData` los vació. Ahora `public` tiene `schools`, `rate_limit_attempts` y `access_links` a 0, `municipalities` a 542 y 7 migraciones.
- Diferencia respecto a la línea base: la migración `add_access_links` ya está aplicada en `public` (7 migraciones en vez de 6 y existe `access_links`). Es el efecto esperado del E2E, que migra su base antes de cada ejecución.
- Los esquemas `test_1` a `test_4` y la base `calendarschool` son idénticos a la línea base.

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
