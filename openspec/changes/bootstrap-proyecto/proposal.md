## Why

El repositorio solo contiene especificación: no existen `backend/`, `frontend/` ni ninguna forma de ejecutar, probar o integrar código. Antes de implementar la primera historia funcional (US01, registro) hace falta un esqueleto ejecutable con base de datos, tests y CI, para no mezclar la puesta en marcha técnica con la lógica de negocio.

Historia: **US00 — Arranque del proyecto (bootstrap-proyecto)** de `docs/User_Stories_MVP.md` (épica 0, infraestructura técnica habilitadora). Requisitos del PRD que la justifican (`docs/PRD_CalendarSchool.md` §4): **Errores claros** (formato de error común, con códigos que el frontend traduce por i18n), **Observabilidad** (logger estructurado desde el primer día) y **Privacidad** (los tests nunca tocan la base de desarrollo y la API no expone detalles internos).

## What Changes

- Monorepo con npm workspaces explícitos (`backend`, `frontend`) orquestados desde el `package.json` raíz, Node.js 24 LTS fijado con `.nvmrc` y `engines`.
- Backend Express + TypeScript (`strict`, ESM con `NodeNext`) con las cuatro capas DDD, API bajo `/api`, endpoint `GET /api/health`, formato de respuesta común, middlewares de errores y de timeout, logger pino y configuración validada con Zod.
- PostgreSQL 18 en Docker Compose con dos bases (`calendarschool` y `calendarschool_test`), Prisma 7 con una migración inicial vacía y migraciones siempre explícitas (`npm run db:migrate`).
- Frontend Vite + React 19 + react-bootstrap con una página inicial vacía, i18n (`es`, `en`) y proxy de `/api` con destino configurable.
- Infraestructura de tests: Vitest + Supertest (90 %) con aislamiento por esquema de worker, Vitest + React Testing Library (80 %) y Cypress E2E orquestado por `scripts/e2e.mjs`.
- Calidad: ESLint, Prettier, husky + lint-staged por workspace, y GitHub Actions con dos jobs (`quality` y `e2e`).
- `docs/api-spec.yml` arrancado en OpenAPI 3 con `/api/health` y el componente `ErrorResponse`.
- La dependencia de Cypress pasa del `package.json` raíz al workspace `frontend`.

## Capabilities

### New Capabilities
- `service-health`: endpoint `GET /api/health` que informa del estado del servicio y de la base de datos, con timeout propio del ping y sin exponer detalles internos.
- `api-error-handling`: formato de respuesta común de la API y comportamiento mínimo del middleware de errores (404, 400, 500) y del timeout de petición (503).
- `app-configuration`: validación de variables de entorno al arrancar, carga de `.env` y aplicación explícita de migraciones.
- `frontend-shell`: página inicial vacía, i18n sin textos *hardcoded* y proxy de `/api` hacia el backend con destino configurable.
- `test-infrastructure`: tests unitarios, de integración y E2E, aislamiento entre tests, umbrales de cobertura y orquestación del E2E.
- `dev-workflow`: instalación y arranque local, lint y formato, hook de pre-commit e integración continua.

### Modified Capabilities
Ninguna: `openspec/specs/` está vacío.

## Impact

- **Módulos:** se crean `backend/` y `frontend/`; se modifica el `package.json` raíz; se añaden `docker-compose.yml`, `scripts/e2e.mjs`, `.husky/`, `.prettierignore`, `.nvmrc` y `.github/workflows/`. Infraestructura AWS: sin cambios.
- **Contrato API:** `docs/api-spec.yml` pasa de vacío a OpenAPI 3 con `/api/health` y `ErrorResponse`.
- **Modelo de datos:** sin tablas. Solo `backend/prisma/schema.prisma` con la migración inicial vacía; `MODELO_DATOS.md` no cambia.
- **Dependencias nuevas:** Express, Prisma 7 + `@prisma/adapter-pg`, Zod, pino, dotenv (solo para la CLI de Prisma), React 19, react-bootstrap, react-i18next, Vitest, Supertest, React Testing Library, ESLint, Prettier, husky, lint-staged, concurrently, `eslint-plugin-cypress`.
- **Documentación:** `CLAUDE.md` (comandos reales), `README.md` §1.4 (instalación) y `docs/api-spec.yml`.

### Fuera de alcance

- Despliegue en AWS (Lambda, API Gateway, RDS, dominios), incluido `lambda.ts`: irá en el cambio `despliegue-aws`.
- Cualquier tabla, entidad, endpoint o pantalla del dominio.
- Limpieza de los datos que dejen los E2E en el esquema `public` de test: se decide en US01, la primera historia que escribe datos.
- commitlint, *component testing* de Cypress y un script `npm run setup`.

### Tamaño

Es una sola historia, pero su alcance creció durante la exploración (CA9, orquestador E2E, contrato de errores). La estimación de US00 (8 puntos) está pendiente de revisión; si se divide, el corte natural es separar CI + E2E (`dev-workflow` y la parte E2E de `test-infrastructure`) del resto.
