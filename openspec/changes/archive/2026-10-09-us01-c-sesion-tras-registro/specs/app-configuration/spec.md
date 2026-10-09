## ADDED Requirements

### Requirement: Configuración de la sesión
`loadConfig` MUST exigir `JWT_SECRET` (cadena de al menos 32 caracteres) y `APP_ORIGIN` (URL con esquema `http` o `https` y host, sin ruta, y que `loadConfig` normaliza a su origen) y MUST NOT arrancar el backend si falta alguna o es inválida. El error MUST nombrar la variable sin mostrar su valor. `backend/.env.example` y el entorno del backend de `scripts/e2e.mjs` MUST definirlas con valores de desarrollo; como CI solo arranca el backend a través de ese script, el workflow no necesita definirlas.

#### Scenario: Secreto ausente
- **GIVEN** `JWT_SECRET` no está definida
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que indica `JWT_SECRET` sin mostrar ningún valor

#### Scenario: Secreto demasiado corto
- **GIVEN** `JWT_SECRET` tiene 31 caracteres
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que indica `JWT_SECRET`
- **AND** el mensaje no contiene el valor del secreto

#### Scenario: Origen inválido
- **GIVEN** `APP_ORIGIN` es `localhost:5173` (sin esquema) o `http://localhost:5173/app` (con ruta)
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que indica `APP_ORIGIN`

#### Scenario: Configuración de sesión válida
- **GIVEN** `JWT_SECRET` de 32 o más caracteres y `APP_ORIGIN` igual a `http://localhost:5173`
- **WHEN** se carga la configuración
- **THEN** el objeto devuelto contiene `jwtSecret` y `appOrigin`

#### Scenario: Plantilla actualizada
- **WHEN** se lee `backend/.env.example`
- **THEN** contiene `JWT_SECRET` y `APP_ORIGIN` con valores de desarrollo que `loadConfig` acepta
