## MODIFIED Requirements

### Requirement: Integración continua
GitHub Actions MUST ejecutarse en cada push a `main` y en cada pull request (no en los push a otras ramas, para no duplicar ejecuciones cuando la rama tiene una pull request abierta) con dos jobs, ambos con PostgreSQL 17 como contenedor de servicio (`POSTGRES_DB=calendarschool_test`), la misma versión mayor que la base de producción, `TEST_DATABASE_URL` en el entorno, caché de npm y `HUSKY=0`. El job `quality` MUST instalar sin el binario de Cypress y ejecutar lint, la comprobación de que los tipos de la API generados están al día con `docs/api-spec.yml`, tests (incluidos los del workspace `infrastructure`), build y una comprobación de enlaces simbólicos rotos en `.claude/` y `.cursor/`. El job `e2e` MUST cachear el binario de Cypress y ejecutar `npm run test:e2e`. En los push a `main`, un tercer job MUST llamar al workflow de despliegue solo cuando `quality` y `e2e` han pasado. El workflow MUST fallar si falla cualquier paso.

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

#### Scenario: Tipos de la API desactualizados
- **GIVEN** una pull request que cambia `docs/api-spec.yml` sin regenerar los tipos del frontend
- **WHEN** se ejecuta el job `quality`
- **THEN** el job falla en la comprobación de tipos y el workflow falla

#### Scenario: Despliegue tras CI en main
- **GIVEN** un push a `main` con `quality` y `e2e` en verde
- **WHEN** terminan los dos jobs
- **THEN** se ejecuta el job de despliegue

#### Scenario: Sin despliegue en pull requests
- **WHEN** se ejecuta el workflow por una pull request
- **THEN** el job de despliegue no se ejecuta

### Requirement: Monorepo con workspaces explícitos
El `package.json` raíz MUST declarar los workspaces de forma explícita (`["backend", "frontend", "infrastructure"]`, sin patrones) y ofrecer los scripts `dev`, `build`, `lint`, `format`, `test`, `test:unit`, `test:e2e` y `db:migrate`. La versión de Node.js MUST fijarse a 24 LTS con `.nvmrc` y `engines`. Cypress MUST ser dependencia del workspace `frontend` y no de la raíz, con un único `package-lock.json` en la raíz. `lint`, `format` y lint-staged MUST incluir `infrastructure` con rutas explícitas.

#### Scenario: Workspaces instalados
- **WHEN** se ejecuta `npm install` en un clon limpio
- **THEN** se instalan solo los workspaces `backend`, `frontend` e `infrastructure`, y `packages/specboot` (si existe en local) no se instala

### Requirement: Instalación y arranque local
Desde un clon limpio con Node.js 24 y Docker, la secuencia `npm install` → copiar `backend/.env.example` a `backend/.env` → `docker compose up -d` → `npm run db:migrate` → `npm run dev` MUST dejar el backend y el frontend en marcha en paralelo, con las bases `calendarschool` y `calendarschool_test` creadas en PostgreSQL 17, la misma versión mayor que la base de producción.

#### Scenario: Arranque completo
- **GIVEN** un clon limpio con Node.js 24 y Docker
- **WHEN** se ejecuta la secuencia de instalación
- **THEN** backend y frontend arrancan en paralelo sin errores
- **AND** desde `localhost:5173` una petición a `/api/health` llega al backend a través del proxy y responde `200`

#### Scenario: Volumen de Docker previo
- **GIVEN** un volumen de PostgreSQL creado antes de añadir el script de la base de test, o con otra versión mayor de PostgreSQL
- **WHEN** se ejecuta `docker compose down -v` y después `docker compose up -d`
- **THEN** existen ambas bases en PostgreSQL 17
