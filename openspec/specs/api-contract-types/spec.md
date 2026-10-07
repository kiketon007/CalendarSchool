# api-contract-types Specification

## Purpose
Define cómo el frontend obtiene los tipos TypeScript de la API: se generan desde el contrato `docs/api-spec.yml`, se versionan sin editarlos a mano y CI comprueba que están al día, para que backend y frontend no diverjan ni dupliquen los DTOs. Origen: cambio `registro-contrato` (US01_a).
## Requirements
### Requirement: Tipos del frontend generados desde el contrato
Los tipos TypeScript del frontend que describen la API MUST generarse con `openapi-typescript` a partir de `docs/api-spec.yml` mediante un script del workspace `frontend`. El fichero generado MUST versionarse, MUST NOT editarse a mano y MUST quedar excluido de ESLint, Prettier y la cobertura, para que su contenido sea exactamente el que produce el generador. Los DTOs de la API MUST NOT escribirse a mano en el frontend.

#### Scenario: Generación de los tipos
- **GIVEN** el proyecto instalado
- **WHEN** ejecuto el script de generación del workspace `frontend`
- **THEN** el fichero de tipos generado contiene los tipos de la petición y de las respuestas de `POST /api/auth/register`
- **AND** el código del frontend puede importarlos y `npm run typecheck --workspaces` pasa

#### Scenario: Contrato inválido
- **GIVEN** un `docs/api-spec.yml` que no es un documento OpenAPI válido
- **WHEN** ejecuto el script de generación
- **THEN** el script falla con un error y no escribe el fichero de tipos

#### Scenario: El hook de pre-commit no altera el fichero generado
- **GIVEN** el fichero de tipos generado modificado y preparado para commit
- **WHEN** se ejecuta el hook de pre-commit
- **THEN** el fichero se confirma sin cambios de formato y el hook no falla por él

### Requirement: Comprobación de tipos al día
El workspace `frontend` MUST ofrecer un script que compruebe, sin escribir nada, que el fichero de tipos generado coincide con lo que produce `docs/api-spec.yml`, y que termine con error si no coincide.

#### Scenario: Tipos al día
- **GIVEN** el fichero de tipos generado a partir del `docs/api-spec.yml` actual
- **WHEN** ejecuto el script de comprobación
- **THEN** termina sin error

#### Scenario: Contrato cambiado sin regenerar
- **GIVEN** un cambio en `docs/api-spec.yml` que afecta a los tipos y no se ha regenerado el fichero
- **WHEN** ejecuto el script de comprobación
- **THEN** termina con error indicando que los tipos no están al día

