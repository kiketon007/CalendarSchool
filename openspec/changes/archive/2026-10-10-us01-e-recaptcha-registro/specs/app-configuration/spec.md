## ADDED Requirements

### Requirement: Configuración de reCAPTCHA
En el backend, `loadConfig` MUST aceptar `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET` como cadenas no vacías, las dos o ninguna, y MUST exigirlas cuando `NODE_ENV` es `production`. Un valor inválido MUST impedir el arranque con un error que nombra la variable sin mostrar su valor. En el frontend, `VITE_RECAPTCHA_SITE_KEY_V3` y `VITE_RECAPTCHA_SITE_KEY_V2` MUST definirse las dos o ninguna, y un único módulo MUST leerlas. Las plantillas de entorno MUST documentarlas comentadas.

#### Scenario: Sin secretos en desarrollo
- **GIVEN** `NODE_ENV=development` sin ninguno de los dos secretos
- **WHEN** se carga la configuración
- **THEN** no hay configuración de reCAPTCHA y el backend usará el verificador falso

#### Scenario: Con los dos secretos
- **GIVEN** los dos secretos definidos
- **WHEN** se carga la configuración
- **THEN** la configuración contiene los dos secretos

#### Scenario: Solo uno de los dos
- **GIVEN** solo `RECAPTCHA_V3_SECRET` definida, o solo `RECAPTCHA_V2_SECRET`
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra la variable que falta

#### Scenario: Producción sin secretos
- **GIVEN** `NODE_ENV=production` sin los secretos
- **WHEN** se carga la configuración
- **THEN** lanza `ConfigError` que nombra `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET`, sin mostrar ningún valor

#### Scenario: Claves de sitio incompletas en el frontend
- **GIVEN** solo una de las dos claves de sitio definida
- **WHEN** se lee la configuración del captcha en el frontend
- **THEN** lanza un error que nombra la que falta

#### Scenario: Plantillas documentadas
- **WHEN** se leen `backend/.env.example` y `frontend/.env.example`
- **THEN** contienen las variables de reCAPTCHA comentadas, con su propósito
- **AND** `loadConfig` sigue aceptando la plantilla del backend
