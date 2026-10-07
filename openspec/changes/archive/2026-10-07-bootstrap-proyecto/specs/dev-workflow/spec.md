## ADDED Requirements

### Requirement: Monorepo con workspaces explícitos
El `package.json` raíz MUST declarar los workspaces de forma explícita (`["backend", "frontend"]`, sin patrones) y ofrecer los scripts `dev`, `build`, `lint`, `format`, `test`, `test:unit`, `test:e2e` y `db:migrate`. La versión de Node.js MUST fijarse a 24 LTS con `.nvmrc` y `engines`. Cypress MUST ser dependencia del workspace `frontend` y no de la raíz, con un único `package-lock.json` en la raíz.

#### Scenario: Workspaces instalados
- **WHEN** se ejecuta `npm install` en un clon limpio
- **THEN** se instalan solo los workspaces `backend` y `frontend`, y `packages/specboot` (si existe en local) no se instala

### Requirement: Instalación y arranque local
Desde un clon limpio con Node.js 24 y Docker, la secuencia `npm install` → copiar `backend/.env.example` a `backend/.env` → `docker compose up -d` → `npm run db:migrate` → `npm run dev` MUST dejar el backend y el frontend en marcha en paralelo, con las bases `calendarschool` y `calendarschool_test` creadas.

#### Scenario: Arranque completo
- **GIVEN** un clon limpio con Node.js 24 y Docker
- **WHEN** se ejecuta la secuencia de instalación
- **THEN** backend y frontend arrancan en paralelo sin errores
- **AND** desde `localhost:5173` una petición a `/api/health` llega al backend a través del proxy y responde `200`

#### Scenario: Volumen de Docker previo
- **GIVEN** un volumen de PostgreSQL creado antes de añadir el script de la base de test
- **WHEN** se ejecuta `docker compose down -v` y después `docker compose up -d`
- **THEN** existen ambas bases

### Requirement: Lint y formato
`npm run lint` MUST ejecutar ESLint en ambos workspaces y comprobar el formato con Prettier, invocando las herramientas siempre con rutas explícitas (`backend`, `frontend`) y nunca sobre la raíz. `.prettierignore` y la configuración de ESLint MUST ignorar `.claude`, `.cursor`, `ai-specs`, `docs`, `openspec` y `packages`.

#### Scenario: Proyecto limpio
- **WHEN** se ejecuta `npm run lint`
- **THEN** no hay errores de ESLint ni ficheros sin formatear

#### Scenario: Ficheros fuera del producto
- **GIVEN** un fichero mal formateado en `docs/`
- **WHEN** se ejecuta `npm run lint`
- **THEN** el comando no lo procesa ni falla por él

### Requirement: Hook de pre-commit
El repositorio MUST instalar con husky un hook de pre-commit que ejecute lint-staged con una configuración por workspace y ninguna en la raíz. Para `*.{ts,tsx,js,mjs,cjs}` MUST ejecutar `eslint --fix --max-warnings=0` y después `prettier --write`; para `*.{json,css,md,yml}`, solo `prettier --write`. El hook MUST NOT ejecutar tests ni `tsc`.

#### Scenario: Fichero mal formateado
- **GIVEN** un fichero de `backend/` mal formateado y sin errores de lint
- **WHEN** se hace commit
- **THEN** el hook lo formatea y el commit se completa

#### Scenario: Error de lint no corregible
- **GIVEN** un fichero de `backend/` con un error de lint que `--fix` no corrige
- **WHEN** se hace commit
- **THEN** el commit se bloquea

#### Scenario: Fichero fuera de los workspaces
- **GIVEN** un fichero de `docs/` mal formateado
- **WHEN** se hace commit
- **THEN** el commit se completa sin modificar el fichero

### Requirement: Integración continua
GitHub Actions MUST ejecutarse en cada push a `main` y en cada pull request (no en los push a otras ramas, para no duplicar ejecuciones cuando la rama tiene una pull request abierta) con dos jobs, ambos con PostgreSQL 18 como contenedor de servicio (`POSTGRES_DB=calendarschool_test`), `TEST_DATABASE_URL` en el entorno, caché de npm y `HUSKY=0`. El job `quality` MUST instalar sin el binario de Cypress y ejecutar lint, tests, build y una comprobación de enlaces simbólicos rotos en `.claude/` y `.cursor/`. El job `e2e` MUST cachear el binario de Cypress y ejecutar `npm run test:e2e`. El workflow MUST fallar si falla cualquier paso.

#### Scenario: Cambio correcto
- **WHEN** se abre o actualiza una pull request, o se hace push a `main`, con un cambio que pasa lint, tests, build y E2E
- **THEN** ambos jobs terminan en verde

#### Scenario: Push a una rama con pull request abierta
- **GIVEN** una rama distinta de `main` con una pull request abierta
- **WHEN** se hace push a esa rama
- **THEN** el workflow se ejecuta una sola vez, por la pull request, y no por el push

#### Scenario: Enlace simbólico roto
- **GIVEN** un enlace de `.claude/skills` que apunta a un destino inexistente
- **WHEN** se ejecuta el job `quality`
- **THEN** el job falla indicando el enlace roto

#### Scenario: Test fallido
- **GIVEN** un test que falla
- **WHEN** se ejecuta el workflow
- **THEN** el job correspondiente y el workflow fallan

### Requirement: Arquitectura del backend
`backend/src` MUST contener las cuatro capas DDD (`domain`, `application`, `presentation`, `infrastructure`). `domain` MUST quedar vacía (con `.gitkeep`) y las demás MUST contener solo infraestructura técnica, sin lógica de negocio.

#### Scenario: Revisión de capas
- **WHEN** se revisa `backend/src`
- **THEN** existen las cuatro carpetas y ninguna contiene entidades, reglas ni endpoints de negocio
