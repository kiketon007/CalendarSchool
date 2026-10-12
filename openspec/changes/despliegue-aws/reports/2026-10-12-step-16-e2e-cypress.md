# Paso 16 - E2E con Cypress

- Fecha: 2026-10-12
- Cambio: despliegue-aws
- Agente: Claude Code (Sonnet 5.5)

## Alcance

El cambio no modifica la interfaz ni el comportamiento visible: el frontend solo gana el `testTimeout` de Vitest. Aun así se ejecuta el E2E completo porque cambian `server.ts` (ahora sobre `loadConfigOrLog` y `composeApp`), el pool de conexiones, `createApp` (verificación del origen, desactivada sin `ORIGIN_VERIFY_SECRET`) y la versión de PostgreSQL (17).

## Comando ejecutado

- `npm run test:e2e` (compila, migra, arranca el backend en :3001 y `vite preview` en :4173, y ejecuta Cypress en modo headless)

## Resultado

| Especificación | Tests | Pasan | Fallan |
|---|---|---|---|
| `health.cy.ts` | 1 | 1 | 0 |
| `home.cy.ts` | 1 | 1 | 0 |
| `registration.cy.ts` | 29 | 29 | 0 |
| `session.cy.ts` | 13 | 13 | 0 |
| **Total** | **44** | **44** | **0** |

- Duración de Cypress: 46 s; el script completo, 1 min 20 s.
- PostgreSQL: 17.11 (contenedor de Docker Compose recreado con `docker compose down -v` en el grupo 1).
- Primera ejecución del cambio (grupo 1, sobre la 17 recién creada): 44 de 44. Esta es la segunda, tras `composeApp` y la verificación del origen: 44 de 44.

## Estado de la base de datos

- `calendarschool` (desarrollo): sin cambios (`users`, `schools`, `refresh_tokens` y `rate_limit_attempts` a 0; 542 municipios). El E2E no la toca.
- `calendarschool_test.public`: `users` 23, `schools` 23, `refresh_tokens` 23 y `rate_limit_attempts` 33, los mismos valores de la línea base del paso 14. El E2E limpia estas tablas antes de cada ejecución y no al terminar, así que quedan los datos de la última ejecución; es el comportamiento previsto y no requiere restauración.
- Puertos 3000, 3001 y 4173: libres al terminar.

## Resultado

- Estado del paso 16: PASS
- Problemas bloqueantes: ninguno
