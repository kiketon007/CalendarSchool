## ADDED Requirements

### Requirement: Límite de intentos por clave con ventana deslizante
El sistema MUST ofrecer un limitador de intentos reutilizable que, para una clave (`<operación>:<ip>`) y una política (máximo de intentos y ventana), acepte un intento si en la ventana que termina en el instante actual hay menos intentos aceptados que el máximo, y lo rechace en caso contrario. Un intento cuenta durante toda la ventana que sigue a su instante (ventana deslizante). Un intento rechazado MUST NOT contar. Claves distintas MUST contarse por separado.

#### Scenario: Intentos dentro del máximo
- **GIVEN** una política de 5 intentos cada 15 minutos
- **WHEN** se hacen 5 intentos con la misma clave en 15 minutos
- **THEN** los 5 se aceptan

#### Scenario: Intento que supera el máximo
- **GIVEN** 5 intentos aceptados con la misma clave en los últimos 15 minutos
- **WHEN** se hace un sexto intento
- **THEN** se rechaza con el tiempo de espera hasta que el intento más antiguo salga de la ventana

#### Scenario: La ventana se desliza
- **GIVEN** 5 intentos aceptados, el primero hace 15 minutos y un segundo, y el resto hace 1 minuto
- **WHEN** se hace un nuevo intento
- **THEN** se acepta, porque el primero ya no está en la ventana

#### Scenario: Un rechazo no alarga el bloqueo
- **GIVEN** una clave bloqueada cuyo intento más antiguo sale de la ventana dentro de 60 segundos
- **WHEN** se hacen otros tres intentos durante el bloqueo
- **THEN** los tres se rechazan y ninguno se guarda
- **AND** pasados esos 60 segundos el siguiente intento se acepta

#### Scenario: Claves independientes
- **GIVEN** una clave con 5 intentos en la ventana
- **WHEN** se hace un intento con otra clave (otra IP u otra operación)
- **THEN** se acepta

### Requirement: Contador compartido y sin carreras
Los intentos MUST guardarse en PostgreSQL (tabla `rate_limit_attempts`, con identificador UUIDv7, clave e instante del intento), de modo que todas las instancias del backend compartan el mismo contador. La comprobación y el registro de un intento MUST ser atómicos por clave: varias peticiones simultáneas con la misma clave MUST NOT aceptar en conjunto más intentos que el máximo. Al registrar un intento, MUST borrarse los intentos de esa clave que ya están fuera de la ventana.

#### Scenario: Peticiones simultáneas
- **GIVEN** una política de 5 intentos y una clave sin intentos
- **WHEN** llegan 10 intentos simultáneos con esa clave
- **THEN** se aceptan exactamente 5 y se rechazan 5
- **AND** la tabla contiene 5 intentos de esa clave

#### Scenario: Instancias distintas
- **GIVEN** dos limitadores independientes sobre la misma base de datos, como dos instancias del backend
- **WHEN** cada uno registra 3 intentos de la misma clave
- **THEN** el sexto intento, en cualquiera de los dos, se rechaza

#### Scenario: Limpieza de intentos caducados
- **GIVEN** intentos de una clave con más de 15 minutos de antigüedad
- **WHEN** se registra un nuevo intento de esa clave
- **THEN** los intentos caducados de esa clave se borran y los de otras claves no se tocan

#### Scenario: Base de datos no disponible
- **WHEN** la base de datos no responde al comprobar un intento
- **THEN** el limitador lanza `DatabaseUnavailable` y el intento no se acepta (falla cerrado)

### Requirement: Respuesta 429 con Retry-After
Un intento rechazado MUST traducirse a `429` con el código `TOO_MANY_REQUESTS` en el formato de error común y la cabecera `Retry-After` con los segundos enteros que faltan para poder reintentar, redondeados hacia arriba y como mínimo 1. La respuesta MUST NOT revelar la clave ni el número de intentos.

#### Scenario: Cabecera de reintento
- **GIVEN** una clave bloqueada cuyo intento más antiguo sale de la ventana dentro de 299,2 segundos
- **WHEN** se rechaza un intento
- **THEN** responde `429` con `TOO_MANY_REQUESTS` y `Retry-After: 300`

#### Scenario: Espera mínima
- **GIVEN** una clave cuyo intento más antiguo sale de la ventana dentro de 0,1 segundos
- **WHEN** se rechaza un intento
- **THEN** `Retry-After` es `1`

### Requirement: IP real del cliente detrás de proxies de confianza
La aplicación MUST obtener la IP del cliente según `TRUST_PROXY_HOPS`: con `0`, la dirección de la conexión; con `N > 0`, la que está N saltos desde la derecha de `X-Forwarded-For`, ignorando lo que el cliente haya añadido antes. MUST aplicarse a todas las rutas con la opción `trust proxy` de Express. Si la IP no se puede determinar, la clave MUST usar `unknown`.

#### Scenario: Sin proxies
- **GIVEN** `TRUST_PROXY_HOPS` igual a `0`
- **WHEN** llega una petición con `X-Forwarded-For: 198.51.100.9`
- **THEN** la IP es la de la conexión y la cabecera se ignora

#### Scenario: Un proxy de confianza
- **GIVEN** `TRUST_PROXY_HOPS` igual a `1`
- **WHEN** llega una petición con `X-Forwarded-For: 198.51.100.9, 203.0.113.7`, donde el cliente escribió la primera
- **THEN** la IP es `203.0.113.7`

#### Scenario: El cliente no elige su clave
- **GIVEN** `TRUST_PROXY_HOPS` igual a `1` y una IP bloqueada
- **WHEN** el cliente repite la petición cambiando la primera dirección de `X-Forwarded-For`
- **THEN** sigue recibiendo `429`
