# Informe del paso 11 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-10-17
- Cambio: us02-b3-invitaciones
- Agente: Claude Code (Sonnet 5.5)

## Comandos ejecutados

- `docker ps` (PostgreSQL 17 `calendarschool-postgres-1`, sano) y `npm run db:migrate` (sin migraciones pendientes)
- Línea base y estado posterior: `snapshot.sh <base>` (consultas con `psql` dentro del contenedor, sobre cada esquema que tiene la tabla `users`)
- Tests de los módulos modificados:
  - `npm exec -w backend -- vitest run src/domain/accessLink src/application/invitations src/application/tokens src/infrastructure/cryptoSecretTokenGenerator.test.ts src/infrastructure/prisma/accessLinksSchema.int.test.ts src/infrastructure/prisma/prismaAccessLinkRepository.int.test.ts src/presentation/invitations src/presentation/http/errorHandler.test.ts src/invitations.int.test.ts test/support/resetDatabase.int.test.ts src/composeApp.int.test.ts`
  - `npm exec -w frontend -- vitest run src/services/invitationsService.test.ts src/components/InvitationsSection.test.tsx src/pages/UsersPage src/i18n src/api`
- Verificación completa: `npm test`, `npm run lint`, `npm run typecheck --workspaces`, `npm run build`, `npm run api:types:check -w frontend`

## Resultados de los tests

- Tests dirigidos:
  - Backend: 13 ficheros, 147 pasan, 0 fallan, 0 omitidos.
  - Frontend: 7 ficheros, 104 pasan, 0 fallan, 0 omitidos.
- Suite completa (`npm test`, con cobertura):
  - Backend (unitarios e integración): 97 ficheros, 1181 pasan, 0 fallan, 0 omitidos.
  - Frontend: 44 ficheros, 716 pasan, 0 fallan, 0 omitidos.
  - Infraestructura: 4 ficheros, 57 pasan, 0 fallan, 0 omitidos.
- Cobertura (mínimos: 90 % backend, 80 % frontend):
  - Backend: 99,77 % de sentencias, 98,01 % de ramas, 99,57 % de funciones, 99,88 % de líneas.
  - Frontend: 98 % de sentencias, 95,19 % de ramas, 100 % de funciones, 97,94 % de líneas.
- Otras comprobaciones: `lint` (ESLint y `prettier --check`), `typecheck --workspaces`, `build` de ambos workspaces y `api:types:check` terminan con código 0.
- Tiempo: `npm test` tardó 2 min 17 s; `lint`, 37 s; `typecheck`, 10 s; `build`, 9 s; `api:types:check`, 2 s.
- Notas:
  - Sin tests inestables ni reintentos.
  - Durante el grupo 9, 13 tests existentes de `UsersPage` fallaron al montar `InvitationsSection`, que pedía la lista real de invitaciones. Se corrigieron en la tarea 10.1 simulando `invitationsService.list`; no es una regresión del producto.
  - Los E2E de Cypress no forman parte de este paso: se ejecutan en el grupo 13.

## Verificación de la base de datos

- Línea base previa a los tests (`calendarschool` y `calendarschool_test`, esquemas `public` y `test_1` a `test_4`):
  - `users`, `refresh_tokens`: sin filas en ningún esquema.
  - `schools`, `rate_limit_attempts`, `access_links`: 0 en todos los esquemas.
  - `municipalities`: 542 en todos.
  - `_prisma_migrations`: 7 en `calendarschool` y en `test_1` a `test_4`.
  - `calendarschool_test.public`: 6 migraciones y sin tabla `access_links` (esquema antiguo que los tests de integración no usan; lo migra el script del E2E al arrancar).
- Validación posterior: las mismas consultas dan una salida idéntica a la línea base (comparadas con `diff`).
- Estado restaurado: no hizo falta; no hubo mutaciones persistentes (`resetDatabase()` vacía las tablas de cada worker antes de cada test y la base de desarrollo no la usan los tests).
- Acciones de restauración: ninguna.
- Ficheros: no han aparecido ficheros nuevos fuera de los del cambio.

## Resultado

- Estado del paso 11: PASA
- Problemas bloqueantes: ninguno
