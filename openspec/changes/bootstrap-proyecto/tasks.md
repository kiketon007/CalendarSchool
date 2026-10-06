## 0. Preparación: rama de trabajo (MANDATORY - FIRST STEP)

- [ ] 0.1 Crear la rama `feature/bootstrap-proyecto` desde `main` actualizado (ya creada al proponer el cambio: verificar que existe y parte de `main`)
- [ ] 0.2 Verificar que la rama actual es `feature/bootstrap-proyecto` y que el árbol de trabajo está limpio

## 1. Monorepo raíz

- [ ] 1.1 Añadir `.nvmrc` (24) y, en el `package.json` raíz, `"private": true`, `engines` (`node >=24 <25`) y `"workspaces": ["backend", "frontend"]`
- [ ] 1.2 Crear `backend/package.json` y `frontend/package.json` mínimos (`"type": "module"`, `engines`)
- [ ] 1.3 Mover Cypress: `npm uninstall cypress` en la raíz y `npm install -D cypress@^16.1.1 -w frontend`
- [ ] 1.4 Verificar: `npm install` termina sin errores, solo existen los workspaces `backend` y `frontend` (`packages/specboot` no se instala), hay un único `package-lock.json` y los enlaces de `.claude/skills` y `.cursor/skills` siguen siendo `SymbolicLink` (comprobación manual de enlaces)

## 2. PostgreSQL en Docker Compose

- [ ] 2.1 Crear `docker-compose.yml` con `postgres:18`, volumen con nombre, `healthcheck`, `POSTGRES_DB=calendarschool` y credenciales de desarrollo
- [ ] 2.2 Crear el script de `docker-entrypoint-initdb.d` que crea `calendarschool_test`
- [ ] 2.3 Verificar con `docker compose up -d` que existen `calendarschool` y `calendarschool_test`

## 3. Backend: herramientas base

- [ ] 3.1 Instalar TypeScript, `tsx`, `@types/node`, Vitest, `@vitest/coverage-v8` y Supertest (consultar antes la documentación actual con Context7)
- [ ] 3.2 Crear `backend/tsconfig.json` (`strict`, `module`/`moduleResolution: NodeNext`, salida en `dist/`)
- [ ] 3.3 Crear `src/domain` (con `.gitkeep`), `src/application`, `src/presentation` y `src/infrastructure`
- [ ] 3.4 Crear `backend/vitest.config.ts` con los proyectos `unit` e `integration`, la constante `MAX_WORKERS`, la lectura de `TEST_DATABASE_URL` con `loadEnv` y los umbrales de cobertura del 90 % con la lista de exclusiones comentada
- [ ] 3.5 Añadir los scripts del backend: `dev` (`tsx watch --env-file-if-exists=.env`), `build` (`tsc`), `start`, `test`, `test:unit`
- [ ] 3.6 Verificar que `npm run test:unit -w backend` se ejecuta (sin tests todavía, sin errores de configuración)

## 4. Backend: configuración (TDD)

- [ ] 4.1 Escribir tests que fallan para `loadConfig(env)`: falta `DATABASE_URL`, `PORT` no numérico, configuración válida tipada, y el mensaje de error nombra la variable sin mostrar su valor
- [ ] 4.2 Implementar `loadConfig` con Zod en `src/infrastructure/config.ts` hasta que pasen los tests
- [ ] 4.3 Crear `backend/.env.example` (`NODE_ENV`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `TEST_DATABASE_URL`) con credenciales coincidentes con `docker-compose.yml`, y añadir `.env` al `.gitignore`

## 5. Backend: logger

- [ ] 5.1 Escribir un test que falla para `createLogger(level)` (nivel aplicado, salida JSON)
- [ ] 5.2 Implementar `src/infrastructure/logger.ts` con pino hasta que pase

## 6. Backend: aplicación — comprobación de salud (TDD)

- [ ] 6.1 Escribir tests que fallan para `CheckHealth` con un `DatabasePing` falso: base disponible, base caída y ping que no termina (timeout de 2 s con temporizadores falsos)
- [ ] 6.2 Implementar el puerto `DatabasePing` y el caso de uso `CheckHealth` en `src/application` hasta que pasen los tests

## 7. Backend: Prisma

- [ ] 7.1 Instalar `prisma`, `@prisma/client`, `@prisma/adapter-pg` y `dotenv` (consultar antes Context7)
- [ ] 7.2 Crear `prisma/schema.prisma` (generador `prisma-client`, `output` en `src/infrastructure/prisma/generated`, `moduleFormat = "esm"`) y `prisma.config.ts` (`import "dotenv/config"`, `url: process.env.DATABASE_URL`, sin `env()`)
- [ ] 7.3 Añadir `postinstall: prisma generate` al backend e ignorar `src/infrastructure/prisma/generated/` en git
- [ ] 7.4 Verificar que `npm install` funciona sin `backend/.env` (borrarlo temporalmente)
- [ ] 7.5 Crear la migración inicial vacía y el script `db:migrate` (`prisma migrate deploy`) en el backend y en la raíz; aplicarla a `calendarschool`
- [ ] 7.6 **Spike:** comprobar que `prisma migrate deploy` con `DATABASE_URL=<TEST_DATABASE_URL>?schema=test_1` crea `_prisma_migrations` en `test_1`. Si no lo respeta, aplicar la alternativa de `design.md` (SQL de las migraciones con `search_path`) y actualizar `design.md` antes de seguir
- [ ] 7.7 Comprobar que una `DATABASE_URL` definida en el entorno tiene prioridad sobre la de `backend/.env` al invocar la CLI
- [ ] 7.8 Implementar la fábrica `createPrismaClient({ connectionString, schema? })` con `PrismaPg`
- [ ] 7.9 Implementar el adaptador `PrismaDatabasePing` (`SELECT 1`; ante error registra la causa en el log y devuelve caída)

## 8. Backend: infraestructura de tests de integración (TDD)

- [ ] 8.1 Escribir tests unitarios que fallan para la salvaguarda: rechaza una base que no termina en `_test` y un esquema que no es `test_<n>` (incluido `public`)
- [ ] 8.2 Implementar la salvaguarda hasta que pasen
- [ ] 8.3 Implementar el `globalSetup` del proyecto `integration`: para `n` de 1 a `MAX_WORKERS`, eliminar, crear y migrar `test_n`
- [ ] 8.4 Implementar el `setupFile`: cliente para `test_<VITEST_POOL_ID>` y `beforeEach(resetDatabase)`
- [ ] 8.5 Escribir tests de integración que fallan para `resetDatabase()`: tabla temporal vaciada, `_prisma_migrations` intacta, datos de `public` intactos
- [ ] 8.6 Implementar `resetDatabase()` (tablas de `pg_tables` del esquema, sin `_prisma_migrations`, un único `TRUNCATE ... RESTART IDENTITY CASCADE`) hasta que pasen
- [ ] 8.7 Escribir y pasar tests de integración de `PrismaDatabasePing`: disponible contra el esquema del worker y caída con una URL inválida
- [ ] 8.8 Verificar el aislamiento: dos ficheros de integración en paralelo escriben en esquemas distintos sin interferir, y un esquema con restos se recrea al iniciar

## 9. Contrato API

- [ ] 9.1 Escribir `docs/api-spec.yml` en OpenAPI 3: `GET /api/health` (`200` y `503`), componente `ErrorResponse` y códigos `NOT_FOUND`, `INVALID_JSON`, `INTERNAL_ERROR`, `REQUEST_TIMEOUT` y `DATABASE_UNAVAILABLE`
- [ ] 9.2 Validar la especificación con un validador de OpenAPI 3 (p. ej. `npx @redocly/cli lint docs/api-spec.yml`)

## 10. Backend: presentación y aplicación Express (TDD)

- [ ] 10.1 Escribir tests de Supertest que fallan con `DatabasePing` falso: `GET /api/health` responde `200` con el cuerpo especificado y `503` con `DATABASE_UNAVAILABLE` sin detalles internos
- [ ] 10.2 Implementar la clase de error de aplicación, los helpers de respuesta, el controlador y la ruta de salud y `createApp({ config, databasePing, logger })` (sin leer `process.env`) hasta que pasen
- [ ] 10.3 Escribir tests que fallan para el middleware de errores: `404 NOT_FOUND` en JSON para rutas desconocidas bajo `/api`, `400 INVALID_JSON` y `500 INTERNAL_ERROR` sin traza en la respuesta y con traza en el log
- [ ] 10.4 Implementar el middleware de errores y el 404 de `/api` hasta que pasen
- [ ] 10.5 Escribir tests que fallan para el timeout (duración inyectable en los tests): `503 REQUEST_TIMEOUT` y respuesta tardía del handler descartada sin error de cabeceras ya enviadas
- [ ] 10.6 Implementar el middleware de timeout hasta que pasen
- [ ] 10.7 Escribir `server.ts` sin lógica: `loadConfig(process.env)` → `createPrismaClient` → `createApp` → `listen`
- [ ] 10.8 Escribir y pasar un test de integración de `GET /api/health` con el adaptador Prisma real
- [ ] 10.9 Verificar `npm run build -w backend` y que `node --env-file=.env dist/server.js` responde en `/api/health`
- [ ] 10.10 Verificar que la cobertura del backend alcanza el 90 % y que `npm run test:unit -w backend` pasa con PostgreSQL parado

## 11. Frontend

- [ ] 11.1 Instalar Vite, React 19, TypeScript, react-bootstrap, Bootstrap, react-router, react-i18next, i18next, Vitest, `@vitest/coverage-v8`, jsdom y React Testing Library (consultar antes Context7)
- [ ] 11.2 Crear `vite.config.ts`: puertos 5173 y 4173 estrictos, `server.proxy['/api']` con `API_PROXY_TARGET ?? 'http://localhost:3000'` (heredado por `preview`)
- [ ] 11.3 Configurar Vitest del frontend: `jsdom`, sin `globals`, `cypress/` excluido y umbrales del 80 % con la lista de exclusiones comentada
- [ ] 11.4 Escribir un test que falla: `es.json` y `en.json` tienen las mismas claves
- [ ] 11.5 Crear `es.json`, `en.json` e `i18n.ts` (castellano por defecto) hasta que pase
- [ ] 11.6 Escribir un test que falla: la página inicial se renderiza con su `data-testid` y el texto traducido
- [ ] 11.7 Implementar `HomePage`, el enrutado en `App.tsx` y `main.tsx` sin lógica hasta que pase
- [ ] 11.8 Verificar la cobertura del 80 %, `npm run build -w frontend` y que `vite preview` falla con el puerto 4173 ocupado

## 12. Lint, formato y hook de pre-commit

- [ ] 12.1 Configurar Prettier y `.prettierignore` (`.claude`, `.cursor`, `ai-specs`, `docs`, `openspec`, `packages`, cliente generado, `dist`)
- [ ] 12.2 Configurar ESLint del backend (*flat config*, `typescript-eslint`, `eslint-config-prettier`) con reglas con tipos para `lint` y una variante sin tipos para el hook
- [ ] 12.3 Configurar ESLint del frontend (React Hooks, `eslint-config-prettier`) y `eslint-plugin-cypress` solo en `cypress/**`
- [ ] 12.4 Añadir los scripts `lint` y `format` con rutas explícitas (`backend`, `frontend`) y verificar que `npm run lint` pasa sin errores
- [ ] 12.5 Instalar husky y lint-staged; `"prepare": "husky"`, `.husky/pre-commit` con `npx lint-staged` y `.lintstagedrc.json` en `backend/` y `frontend/` (ninguno en la raíz)
- [ ] 12.6 Verificar CA8 en una rama temporal (AGENT MUST EXECUTE): fichero de `backend/` mal formateado se formatea y el commit pasa; error de lint no corregible bloquea; fichero de `docs/` mal formateado se confirma sin tocarlo. Comprobar también que lint-staged encuentra los binarios de la raíz y el código de salida del tercer caso. Borrar la rama temporal al terminar

## 13. E2E con Cypress

- [ ] 13.1 Crear `frontend/cypress.config.ts` (`baseUrl` `http://localhost:4173`, specs `cypress/e2e/**/*.cy.ts`), `frontend/cypress/tsconfig.json` y añadir `cypress/screenshots` y `cypress/videos` al `.gitignore`
- [ ] 13.2 Escribir los specs: la página inicial carga (por `data-testid`) y `/api/health` responde `200` con la forma esperada a través del proxy
- [ ] 13.3 Implementar `scripts/e2e.mjs` con los siete pasos del diseño (D7)
- [ ] 13.4 Añadir los scripts raíz `dev` (`concurrently`), `build`, `test`, `test:unit`, `test:e2e` y `db:migrate`
- [ ] 13.5 Verificar que la comprobación de tipos de frontend y de Cypress no tiene conflictos de `describe`/`it`/`expect`

## 14. Integración continua

- [ ] 14.1 Crear `.github/workflows/ci.yml` con los jobs `quality` y `e2e` del diseño (D10)
- [ ] 14.2 Verificar en local (Git Bash) que `find .claude .cursor -xtype l` no lista nada con los enlaces correctos y lista un enlace roto de prueba creado en el directorio temporal, y que el paso falla en ese caso
- [ ] 14.3 Hacer push de la rama (con confirmación previa del usuario) y verificar que ambos jobs terminan en verde

## 15. Revisar y actualizar los tests unitarios (MANDATORY)

- [ ] 15.1 Revisar que cada escenario de las specs tiene su test (unitario, integración o E2E) y que los nombres de `describe`/`it` están en inglés
- [ ] 15.2 Añadir los tests que falten y eliminar duplicados

## 16. Ejecutar los tests y verificar el estado de la base de datos (MANDATORY - AGENT MUST EXECUTE)

- [ ] 16.1 Capturar el estado previo: bases existentes, esquemas de `calendarschool_test` y tablas de `calendarschool`
- [ ] 16.2 Ejecutar los tests de los módulos cambiados (`npm run test:unit`)
- [ ] 16.3 Ejecutar la suite completa (`npm test`) con cobertura y registrar totales, duración y fallos intermitentes
- [ ] 16.4 Verificar el estado posterior: `calendarschool` sin cambios y solo los esquemas `test_n` esperados en `calendarschool_test`; restaurar si hiciera falta
- [ ] 16.5 Crear el informe `openspec/changes/bootstrap-proyecto/reports/YYYY-MM-DD-step-16-unit-test-and-db-verification.md` (en `reports/` del cambio y no en `specs/`, para que no lo procese el validador de specs)
- [ ] 16.6 Marcar este paso solo cuando los tests pasen y exista el informe

## 17. Pruebas manuales con curl (MANDATORY - AGENT MUST EXECUTE)

- [ ] 17.1 Arrancar el backend de desarrollo y comprobar la conexión a la base de datos
- [ ] 17.2 `curl -i http://localhost:3000/api/health` → `200` con el cuerpo especificado
- [ ] 17.3 Parar PostgreSQL (`docker compose stop`), repetir → `503` con `DATABASE_UNAVAILABLE` en unos 2 s y sin detalles internos; volver a levantarlo
- [ ] 17.4 `curl -i http://localhost:3000/api/does-not-exist` → `404` con `NOT_FOUND` en JSON
- [ ] 17.5 `curl -i -X POST -H "Content-Type: application/json" -d '{"a":' http://localhost:3000/api/health` → `400` con `INVALID_JSON`
- [ ] 17.6 Repetir 17.2 a través del proxy (`http://localhost:5173/api/health`) con `npm run dev`
- [ ] 17.7 Documentar comandos y respuestas en `openspec/changes/bootstrap-proyecto/reports/YYYY-MM-DD-step-17-curl.md` (sin cambios de datos que restaurar; el timeout se cubre con tests automáticos)

## 18. E2E con Cypress (MANDATORY - AGENT MUST EXECUTE)

- [ ] 18.1 Con PostgreSQL levantado, ejecutar `npm run test:e2e` y comprobar que pasa
- [ ] 18.2 Repetirlo con `npm run dev` en marcha y comprobar que el backend de E2E usa `calendarschool_test` (no llegan peticiones al backend de desarrollo)
- [ ] 18.3 Ocupar el puerto de E2E y comprobar que el script falla sin ejecutar Cypress
- [ ] 18.4 Comprobar que al terminar no quedan procesos ni puertos ocupados por el script (Windows)
- [ ] 18.5 Documentar escenarios y resultados en `openspec/changes/bootstrap-proyecto/reports/YYYY-MM-DD-step-18-e2e.md`

## 19. Actualizar la documentación técnica (MANDATORY)

- [ ] 19.1 Sustituir en `CLAUDE.md` el párrafo de "Estado actual del repositorio" por los comandos reales (instalación, dev, build, lint, test, test de un solo fichero, E2E y migraciones)
- [ ] 19.2 Actualizar `README.md` §1.4 con la secuencia de instalación (comandos de copia de `.env` en bash y PowerShell, `docker compose down -v` si el volumen ya existía), enlazando a la explicación existente de enlaces simbólicos sin duplicarla
- [ ] 19.3 Revisar con la skill `update-docs` el resto de documentación afectada (`README.md` §2.3 sobre los puertos técnicos en aplicación)
- [ ] 19.4 Comprobar la puerta de finalización de enlaces simbólicos (estándares §6): ningún enlace roto en `.claude/` ni `.cursor/`
- [ ] 19.5 Ejecutar `openspec validate bootstrap-proyecto` y confirmar que es válido
