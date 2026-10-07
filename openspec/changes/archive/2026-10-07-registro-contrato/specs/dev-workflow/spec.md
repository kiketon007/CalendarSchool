## MODIFIED Requirements

### Requirement: Integración continua
GitHub Actions MUST ejecutarse en cada push a `main` y en cada pull request (no en los push a otras ramas, para no duplicar ejecuciones cuando la rama tiene una pull request abierta) con dos jobs, ambos con PostgreSQL 18 como contenedor de servicio (`POSTGRES_DB=calendarschool_test`), `TEST_DATABASE_URL` en el entorno, caché de npm y `HUSKY=0`. El job `quality` MUST instalar sin el binario de Cypress y ejecutar lint, la comprobación de que los tipos de la API generados están al día con `docs/api-spec.yml`, tests, build y una comprobación de enlaces simbólicos rotos en `.claude/` y `.cursor/`. El job `e2e` MUST cachear el binario de Cypress y ejecutar `npm run test:e2e`. El workflow MUST fallar si falla cualquier paso.

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
