## MODIFIED Requirements

### Requirement: Configuración del límite de intentos
`loadConfig` MUST aceptar cuatro variables opcionales: `TRUST_PROXY_HOPS` (entero mayor o igual que 0, por defecto `0`), número de proxies de confianza delante del backend; `REGISTRATION_ATTEMPTS_MAX` (entero mayor o igual que 1, por defecto `5`), máximo de intentos de registro por IP cada 15 minutos; `LOGIN_ATTEMPTS_MAX` (entero mayor o igual que 1, por defecto `10`), máximo de intentos fallidos de inicio de sesión por IP cada 15 minutos; e `INVITATION_ATTEMPTS_MAX` (entero mayor o igual que 1, por defecto `10`), máximo de consultas o aceptaciones de invitaciones con un enlace no válido por IP cada 15 minutos. Un valor inválido MUST impedir el arranque con un error que nombra la variable. `backend/.env.example` MUST documentarlas comentadas con sus valores por defecto.

#### Scenario: Valores por defecto
- **GIVEN** ninguna de las cuatro variables definida
- **WHEN** se carga la configuración
- **THEN** `trustProxyHops` es `0`, `registrationAttemptsMax` es `5`, `loginAttemptsMax` es `10` e `invitationAttemptsMax` es `10`

#### Scenario: Valores válidos
- **GIVEN** `TRUST_PROXY_HOPS=2`, `REGISTRATION_ATTEMPTS_MAX=1000`, `LOGIN_ATTEMPTS_MAX=1000` e `INVITATION_ATTEMPTS_MAX=1000`
- **WHEN** se carga la configuración
- **THEN** `trustProxyHops` es `2`, y `registrationAttemptsMax`, `loginAttemptsMax` e `invitationAttemptsMax` son `1000`

#### Scenario: Valores inválidos
- **GIVEN** `TRUST_PROXY_HOPS` es `-1` o `abc`, o `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` o `INVITATION_ATTEMPTS_MAX` es `0` o `2.5`
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra la variable inválida

#### Scenario: Plantilla documentada
- **WHEN** se lee `backend/.env.example`
- **THEN** contiene `TRUST_PROXY_HOPS`, `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` e `INVITATION_ATTEMPTS_MAX` comentadas, con su valor por defecto y su propósito
- **AND** `loadConfig` sigue aceptando la plantilla
