## MODIFIED Requirements

### Requirement: Cliente de captcha en el frontend
El frontend MUST obtener un token v3 nuevo, con la acción de la página (`register` en el registro, `login` en el inicio de sesión), en cada envío de su formulario, y MUST pintar el reto v2 cuando se le pida. Con claves de sitio MUST usar reCAPTCHA de Google, cargando su script solo en las páginas de registro y de inicio de sesión y la primera vez que se necesita; sin claves MUST usar un cliente falso que devuelve un token fijo y pinta un reto simulado («No soy un robot (simulado)»). Si el script de Google no carga o no responde en 10 segundos, MUST tratarse como indisponibilidad sin llamar al backend.

#### Scenario: Token nuevo en cada envío
- **WHEN** el usuario envía el formulario de registro dos veces
- **THEN** se piden dos tokens v3 distintos con la acción `register`

#### Scenario: Acción del login
- **WHEN** el usuario envía el formulario de inicio de sesión
- **THEN** se pide un token v3 con la acción `login`

#### Scenario: Script cargado solo en registro e inicio de sesión
- **WHEN** se abre Onboarding o `/privacidad`
- **THEN** no se carga el script de reCAPTCHA

#### Scenario: Script que no carga
- **GIVEN** el script de Google no carga
- **WHEN** el usuario envía el formulario de registro o de inicio de sesión
- **THEN** se muestra el mensaje de indisponibilidad y no se envía la petición

#### Scenario: Cliente falso
- **GIVEN** un build sin claves de sitio
- **WHEN** se envía el formulario
- **THEN** el token es el fijo del cliente falso y el reto, si se pide, es un botón simulado
