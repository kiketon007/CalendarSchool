# Informe del paso 7 - E2E con Cypress

- Fecha: 2026-10-19
- Cambio: us04-pantalla-bienvenida
- Agente: Claude Sonnet 5.5

## Qué se añadió

- **`frontend/cypress/e2e/onboarding.cy.ts`** (4 tests). Usan el alta por la API, la tarea `createUser` para el miembro y datos únicos por test:
  1. **Administrador.** Tras registrarse ve el saludo, el colegio y las dos tarjetas («Gestión de horarios» y «Gestión de comedor») con «Próximamente» y sin enlaces ni botones dentro. El nombre de la aplicación lleva `aria-current="page"`. Pulsa la tarjeta «Usuarios» (`GET /api/users` responde `200`), llega a `/usuarios` (donde el nombre de la aplicación ya no lleva `aria-current`) y vuelve a `/onboarding` con el nombre de la aplicación.
  2. **Miembro.** Un `MEMBER` creado con `createUser` inicia sesión por el formulario, ve el colegio y las dos tarjetas, y no ve la sección «Administración» ni la tarjeta «Usuarios».
  3. **360 px.** Las tarjetas se apilan en una columna (la segunda empieza bajo la primera y con el mismo borde izquierdo), `scrollWidth` no supera `clientWidth` y el enlace «Usuarios» mide al menos 44 px de alto.
  4. **1280 px.** Las dos tarjetas están en la misma fila.
- **Revisión de los E2E existentes:** no necesitaron cambios. `cy.contains('a', 'Usuarios')` sigue encontrando el enlace de la cabecera, que es el primero del DOM, y las comprobaciones de `onboarding-page` solo miran el nombre del colegio.

## Comandos ejecutados

Desde la raíz, con PostgreSQL 17 en Docker Compose; el script compila ambos workspaces, migra la base de test, la vacía, arranca el backend (:3001) y `vite preview` (:4173) y ejecuta Cypress en modo headless:

- `npm run test:e2e -- --spec cypress/e2e/onboarding.cy.ts`
- `npm run test:e2e` (suite completa), con la salida a un fichero
- Limpieza al terminar: `cleanE2eData` de `scripts/e2eData.mjs` sobre el esquema `public` de `calendarschool_test`.

## Resultados

- **Spec nueva:** 4 de 4 a la primera. Se escribió con la implementación ya hecha, así que no se vio en rojo; los comportamientos que cubre ya tenían sus tests unitarios en rojo previo (pasos 1 a 3).
- **Suite completa** (1 min 42 s de Cypress, 2 min 20 s en total, salida 0): 111 pasan, 0 fallan, 0 pendientes, en 13 ficheros (los 107 de antes más los 4 nuevos):

| Spec | Tests |
|---|---|
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

- Los puertos 3000, 3001 y 4173 quedaron libres al terminar.
- Notas: sin tests inestables ni reintentos. El contraste de la insignia «Próximamente» (`bg="secondary"`, 4,69:1) no lo mide `axe` en jsdom; queda para la comprobación con un navegador real del grupo 9.

## Base de datos de test

- Antes de la ejecución, `calendarschool_test.public` estaba vacío y con 542 municipios (la línea base del paso 5).
- Tras la suite completa quedaban datos del E2E (los vacía el script al empezar, nunca al terminar): 81 usuarios, 67 colegios, 84 sesiones, 89 intentos y 13 enlaces de acceso.
- Restauración: `cleanE2eData` los vació. Ahora `public` tiene todas las tablas de datos a 0 y `municipalities` a 542.
- `calendarschool` y los esquemas `test_1` a `test_4` son idénticos a la línea base (comparados con `diff`); la única diferencia es la fila residual de `rate_limit_attempts` que ya había en `test_4` y que `npm test` vació.

## Resultado

- Estado del paso 7: PASA
- Problemas bloqueantes: ninguno
