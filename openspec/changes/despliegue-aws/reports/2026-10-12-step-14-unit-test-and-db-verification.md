# Paso 14 - Tests unitarios y verificación de la base de datos

- Fecha: 2026-10-12
- Cambio: despliegue-aws
- Agente: Claude Code (Sonnet 5.5)

## Comandos ejecutados

- `docker compose exec -T postgres psql -U calendarschool -d <base> < counts.sql` (antes y después; filas de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `municipalities` en `public` y en cada esquema `test_<n>`)
- `npm exec -w backend -- vitest run` sobre los módulos modificados: `config.test.ts`, `infrastructure/aws`, `createPrismaClient.test.ts`, `connectionTimeout.int.test.ts`, `requireOriginVerification.test.ts`, `presentation/lambda`, `app.test.ts` y `composeApp.int.test.ts`
- `npm test -w infrastructure`
- `npm test` (backend con cobertura, frontend con cobertura e infraestructura)
- `npm run lint`, `npm run typecheck --workspaces`, `npm run build`, `npm run api:types:check -w frontend`

## Resultados de los tests

- Tests dirigidos: backend 91 pasan, 0 fallan (8 ficheros); infraestructura 60 pasan, 0 fallan (4 ficheros).
- Suite completa (`npm test`):
  - Backend: 643 pasan, 0 fallan (61 ficheros), 19,7 s.
  - Frontend: 317 pasan, 0 fallan (20 ficheros), 63 s.
  - Infraestructura: 60 pasan, 0 fallan (4 ficheros), 8,9 s.
- Cobertura: backend 99,62 % de líneas (umbral 90 %) y frontend 98,35 % (umbral 80 %). Los ficheros nuevos más bajos son `composeApp.ts` (87,5 % de líneas: el reloj por defecto `() => new Date()` no se invoca porque los tests inyectan el suyo) y `lambdaAdapter.ts` (100 % de líneas, 75 % de ramas).
- `lint`, `typecheck --workspaces`, `build` y `api:types:check`: salida 0 en los cuatro.
- Notas: al comenzar la sesión, la suite del frontend fallaba de forma intermitente por *timeouts* de 5 s con la cobertura activa (tests de `RegisterPage`). Se resolvió subiendo `testTimeout` a 15 s en `frontend/vite.config.ts`; desde entonces la suite pasó en todas las ejecuciones (más de cinco).

## Verificación del estado de la base de datos

- Línea base (PostgreSQL 17.11, antes de los tests):
  - `calendarschool.public`: municipalities 542; users, schools, refresh_tokens y rate_limit_attempts 0.
  - `calendarschool_test.public`: municipalities 542; users 23, schools 23, refresh_tokens 23, rate_limit_attempts 33 (restos de ejecuciones anteriores del E2E, que limpia al empezar y no al terminar).
  - `calendarschool_test.test_1` a `test_4`: municipalities 542 y el resto 0.
- Validación posterior: las mismas consultas devuelven **exactamente los mismos valores** (`diff` sin diferencias). `_prisma_migrations` de `calendarschool` conserva 4 migraciones.
- Estado restaurado: no hizo falta; los tests de integración trabajan en esquemas propios y los vacían.
- Acciones de restauración: ninguna. Los puertos 3000, 3001, 4173 y 5173 quedan libres.

## Resultado

- Estado del paso 14: PASS
- Problemas bloqueantes: ninguno
