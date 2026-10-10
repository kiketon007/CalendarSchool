## ADDED Requirements

### Requirement: Configuración del límite de intentos
`loadConfig` MUST aceptar dos variables opcionales: `TRUST_PROXY_HOPS` (entero mayor o igual que 0, por defecto `0`), número de proxies de confianza delante del backend, y `REGISTRATION_ATTEMPTS_MAX` (entero mayor o igual que 1, por defecto `5`), máximo de intentos de registro por IP cada 15 minutos. Un valor inválido MUST impedir el arranque con un error que nombra la variable. `backend/.env.example` MUST documentarlas comentadas con sus valores por defecto.

#### Scenario: Valores por defecto
- **GIVEN** ninguna de las dos variables definida
- **WHEN** se carga la configuración
- **THEN** `trustProxyHops` es `0` y `registrationAttemptsMax` es `5`

#### Scenario: Valores válidos
- **GIVEN** `TRUST_PROXY_HOPS=2` y `REGISTRATION_ATTEMPTS_MAX=1000`
- **WHEN** se carga la configuración
- **THEN** `trustProxyHops` es `2` y `registrationAttemptsMax` es `1000`

#### Scenario: Valores inválidos
- **GIVEN** `TRUST_PROXY_HOPS` es `-1` o `abc`, o `REGISTRATION_ATTEMPTS_MAX` es `0` o `2.5`
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra la variable inválida

#### Scenario: Plantilla documentada
- **WHEN** se lee `backend/.env.example`
- **THEN** contiene `TRUST_PROXY_HOPS` y `REGISTRATION_ATTEMPTS_MAX` comentadas, con su valor por defecto y su propósito
- **AND** `loadConfig` sigue aceptando la plantilla
