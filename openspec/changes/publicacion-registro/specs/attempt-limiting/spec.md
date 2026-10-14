## ADDED Requirements

### Requirement: Conservación máxima de los intentos
Los intentos guardados en `rate_limit_attempts` contienen la IP del cliente en su clave, así que MUST NOT conservarse más de lo necesario: todo intento con más de 24 horas de antigüedad MUST borrarse al menos una vez al día, aunque su clave no vuelva a usarse. 24 horas MUST ser mayor que la ventana de cualquier política del limitador, para que la purga nunca borre un intento que todavía cuenta. La purga MUST NOT tocar los intentos más recientes.

#### Scenario: Intento antiguo de una IP que no vuelve
- **GIVEN** un intento de la clave `register:203.0.113.7` de hace 25 horas, y ningún intento posterior de esa clave
- **WHEN** se ejecuta la purga diaria
- **THEN** el intento se borra

#### Scenario: Intentos recientes intactos
- **GIVEN** intentos de hace 1 minuto y de hace 23 horas
- **WHEN** se ejecuta la purga diaria
- **THEN** los dos se conservan

#### Scenario: Ventanas más cortas que el plazo
- **WHEN** se revisan las políticas del limitador
- **THEN** ninguna tiene una ventana igual o mayor que 24 horas
