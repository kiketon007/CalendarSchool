## ADDED Requirements

### Requirement: Liberación de un intento aceptado
El limitador MUST permitir liberar un intento que acaba de aceptar, para las operaciones que solo cuentan los fallidos (el login, US02): aceptar un intento MUST devolver su identificador, y liberarlo MUST borrar solo esa fila de `rate_limit_attempts`. Mientras no se libera, el intento cuenta como cualquier otro, de modo que las peticiones simultáneas siguen sin superar el máximo. Liberar un intento que ya no existe (purgado o liberado antes) MUST NOT fallar. Las operaciones que cuentan todos los intentos (el registro) MUST NOT liberarlos.

#### Scenario: Intento liberado
- **GIVEN** una política de 10 intentos y una clave con 3 intentos en la ventana
- **WHEN** se acepta un cuarto intento y después se libera
- **THEN** la clave vuelve a tener 3 intentos en la ventana

#### Scenario: Solo se borra el intento liberado
- **GIVEN** dos intentos aceptados de la misma clave
- **WHEN** se libera el segundo
- **THEN** el primero sigue en la tabla

#### Scenario: Intentos en vuelo cuentan
- **GIVEN** una política de 10 intentos
- **WHEN** se aceptan 10 intentos que todavía no se han liberado y llega uno más
- **THEN** el undécimo se rechaza

#### Scenario: Liberación repetida
- **WHEN** se libera dos veces el mismo intento
- **THEN** la segunda liberación no falla y no borra nada más

#### Scenario: El registro no libera
- **WHEN** se completa un registro correcto
- **THEN** su intento sigue contando en `rate_limit_attempts`
