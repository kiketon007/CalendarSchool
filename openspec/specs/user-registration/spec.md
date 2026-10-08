# user-registration Specification

## Purpose
Define el registro de un colegio y su usuario administrador (`POST /api/auth/register`): su contrato en `docs/api-spec.yml` y, el alta atómica de colegio y usuario, su validación, los duplicados, los eventos de log, el captcha provisional y el formulario de registro, y, a medida que se implementen las partes restantes de US01, la sesión, el límite de intentos, la verificación anti-bot y la resiliencia del formulario. Origen: cambios `registro-contrato` (US01_a) y `us01-b-alta-colegio-usuario` (US01_b).
## Requirements
### Requirement: Contrato del registro documentado en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/auth/register` como endpoint público (sin autenticación). La petición MUST ser un objeto JSON con `schoolName`, `municipalityCode` (código INE), `firstName`, `lastName`, `email`, `password` y `captcha`, este último con `version` (`v3` o `v2`) y `token`, todos obligatorios. Las respuestas MUST ser:
- `201`: colegio y usuario creados, con el formato de éxito común; `data` contiene el usuario (`id`, `email`, `firstName`, `lastName`) y el colegio (`id`, `name` y su municipio), sin la contraseña ni su hash.
- `400`: `VALIDATION_ERROR` con un elemento en `details` por campo inválido (`{ field, code }`), o `INVALID_JSON`.
- `409`: `EMAIL_ALREADY_REGISTERED` o `SCHOOL_ALREADY_REGISTERED`.
- `422`: `CAPTCHA_CHALLENGE_REQUIRED` (el score de reCAPTCHA v3 es menor que 0.6 y el cliente debe presentar el reto v2) o `CAPTCHA_FAILED` (token ausente, inválido o caducado, o reto v2 no superado).
- `429`: `TOO_MANY_REQUESTS`, con la cabecera `Retry-After`.
- Los errores comunes a toda la API (`413`, `415`, `500` y `503`), referenciados desde `components.responses`.

`SCHOOL_ALREADY_REGISTERED` MUST añadirse a la vez al enum `ErrorCode` del contrato y a `ERROR_CODES` del backend.

#### Scenario: Endpoint documentado
- **GIVEN** `docs/api-spec.yml`
- **WHEN** se valida como OpenAPI 3.1
- **THEN** es válido e incluye `POST /api/auth/register` con las respuestas `201`, `400`, `409`, `422`, `429`, `413`, `415`, `500` y `503`
- **AND** todas las respuestas de error referencian el formato de error común

#### Scenario: Petición documentada
- **GIVEN** la definición de `POST /api/auth/register`
- **WHEN** se consulta el esquema de la petición
- **THEN** exige `schoolName`, `municipalityCode`, `firstName`, `lastName`, `email`, `password` y `captcha` con `version` (`v3` o `v2`) y `token`
- **AND** las propiedades que no figuran en el esquema se ignoran, sin producir error

#### Scenario: Respuesta de alta sin credenciales
- **GIVEN** la definición de la respuesta `201`
- **WHEN** se consulta su esquema
- **THEN** `data` contiene el usuario (`id`, `email`, `firstName`, `lastName`) y el colegio (`id`, `name` y municipio)
- **AND** no contiene la contraseña ni su hash

#### Scenario: Dos causas distintas de 422
- **GIVEN** la definición de la respuesta `422`
- **WHEN** se consultan sus códigos de error
- **THEN** distingue `CAPTCHA_CHALLENGE_REQUIRED`, con el que el cliente presenta el reto v2, de `CAPTCHA_FAILED`, con el que el cliente informa del fallo de verificación

#### Scenario: Dos causas distintas de 409
- **GIVEN** la definición de la respuesta `409`
- **WHEN** se consultan sus códigos de error
- **THEN** distingue `EMAIL_ALREADY_REGISTERED` de `SCHOOL_ALREADY_REGISTERED`

#### Scenario: Códigos de error sincronizados
- **WHEN** se ejecutan los tests del backend
- **THEN** `SCHOOL_ALREADY_REGISTERED` figura en el enum `ErrorCode` del contrato y en `ERROR_CODES`, y `appError.test.ts` pasa

### Requirement: Alta atómica de colegio y usuario
`POST /api/auth/register` MUST crear, en una única transacción, el colegio y su usuario, o ninguno de los dos. El usuario MUST quedar con rol `ADMIN` y estado `ACTIVE`, sin enviar ningún correo de confirmación. Los identificadores de colegio y usuario MUST ser UUIDv7. La respuesta MUST ser `201` con el formato de éxito común y sin la contraseña ni su hash. El registro MUST crear siempre un colegio nuevo y nunca dar acceso a uno existente.

#### Scenario: Alta correcta
- **WHEN** se envía un registro con datos válidos, un email no registrado y un colegio inexistente en ese municipio
- **THEN** responde `201` con el usuario (`id`, `email`, `firstName`, `lastName`) y el colegio (`id`, `name`, municipio)
- **AND** en la base de datos existen el colegio y el usuario, este con rol `ADMIN`, estado `ACTIVE` y `schoolId` igual al id del colegio
- **AND** ambos identificadores son UUID versión 7

#### Scenario: Fallo al crear el usuario
- **WHEN** falla la inserción del usuario después de insertar el colegio
- **THEN** la transacción se revierte y no existe ni el colegio ni el usuario
- **AND** responde con el error común correspondiente, sin detalles técnicos

#### Scenario: Base de datos no disponible
- **WHEN** la base de datos no responde mientras se procesa un registro válido
- **THEN** responde `503` con `DATABASE_UNAVAILABLE` en el formato de error común, sin detalles técnicos
- **AND** no se crea ni el colegio ni el usuario

#### Scenario: Nunca se accede a un colegio existente
- **GIVEN** un colegio ya registrado con sus usuarios
- **WHEN** se envía un registro para ese mismo colegio con otro email
- **THEN** no se crea ningún usuario en ese colegio

### Requirement: Almacenamiento seguro de credenciales y normalización
El sistema MUST almacenar la contraseña solo como hash Bcrypt con cost factor 12, calculado de forma asíncrona sin bloquear el event loop con una librería compatible con AWS Lambda. MUST almacenar el email sin espacios al inicio ni al final y en minúsculas. MUST normalizar a NFC todos los textos de entrada antes de validarlos. El nombre del colegio y los nombres de la persona MUST guardarse tal como los escribe el usuario, ya recortados y en NFC.

#### Scenario: Hash Bcrypt cost 12
- **WHEN** se registra un usuario con la contraseña `Secreta123!`
- **THEN** `passwordHash` empieza por `$2` seguido de `$12$`, no contiene la contraseña y se verifica con ella
- **AND** dos registros con la misma contraseña producen hashes distintos

#### Scenario: Email normalizado
- **WHEN** se registra con el email `  Jose.Garcia@Example.COM  `
- **THEN** se guarda `jose.garcia@example.com` y la respuesta devuelve ese valor

#### Scenario: Acentos descompuestos
- **WHEN** se envía el nombre `José` con la `é` descompuesta (`e` + U+0301, NFD)
- **THEN** la validación de caracteres lo acepta y se guarda en NFC

### Requirement: Validación de los campos del registro
El backend MUST validar con Zod, tras superar los pasos previos, todos los campos con las reglas de la historia US01_b y MUST responder `400` con `VALIDATION_ERROR` y un elemento `{ field, code }` en `details` por cada campo inválido, sin dejar de informar de ninguno. Los códigos de campo son `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS` y `WEAK_PASSWORD`. Las reglas son:
- `schoolName`: obligatorio tras `trim()`, de 2 a 150 caracteres; permitidos letras del castellano y del valenciano (incluidos `à è ò ï ü ç ñ ·` y mayúsculas), dígitos, espacios, guiones, apóstrofos, puntos y `º`/`ª`.
- `municipalityCode`: obligatorio y existente en `municipalities`.
- `firstName` y `lastName`: obligatorios, de hasta 100 caracteres; mismos caracteres que el colegio salvo los puntos y `º`/`ª`.
- `email`: hasta 320 caracteres y conforme a la expresión regular de la historia (se rechazan `usuario@localhost`, direcciones IP y `usuario@`).
- `password`: de 8 caracteres a 72 bytes en UTF-8 (el límite de Bcrypt, que ignora el resto; las letras con acento y los símbolos fuera de ASCII ocupan 2 bytes o más) con al menos una mayúscula, una minúscula, un dígito y un símbolo de `!@#$%^&*()_+-=[]{}|;:,.<>?`.

#### Scenario: Varios campos inválidos
- **WHEN** se envía un registro con un email sin `@` y una contraseña de 5 caracteres
- **THEN** responde `400` con `VALIDATION_ERROR`
- **AND** `details` contiene `{ field: email, code: INVALID_FORMAT }` y `{ field: password, code: INVALID_LENGTH }`

#### Scenario: Contraseña sin la variedad requerida
- **WHEN** se envía una contraseña de 12 caracteres sin ningún símbolo
- **THEN** responde `400` con `{ field: password, code: WEAK_PASSWORD }` en `details`

#### Scenario: Contraseña más larga que el límite de Bcrypt
- **WHEN** se envía una contraseña de 73 bytes en UTF-8, ya sea de 73 caracteres ASCII o de 37 caracteres con acentos
- **THEN** responde `400` con `{ field: password, code: INVALID_LENGTH }` en `details`
- **AND** una contraseña de exactamente 72 bytes con la variedad requerida se acepta

#### Scenario: Nombre del colegio inválido
- **WHEN** el nombre del colegio está vacío tras `trim()`, tiene 1 o 151 caracteres, o contiene `<script>`
- **THEN** responde `400` con `{ field: schoolName, code }` donde `code` es `REQUIRED`, `INVALID_LENGTH` o `INVALID_CHARACTERS` según el caso

#### Scenario: Municipio no válido
- **WHEN** falta `municipalityCode`, o su valor no existe en `municipalities`
- **THEN** responde `400` con `{ field: municipalityCode, code }` donde `code` es `REQUIRED` si falta e `INVALID_FORMAT` si no existe

#### Scenario: Inyección SQL y XSS
- **WHEN** un campo de texto contiene `'; DROP TABLE users; --` o `<img src=x onerror=alert(1)>`
- **THEN** la petición se rechaza con `400` por caracteres no permitidos
- **AND** las tablas siguen intactas

#### Scenario: Entrada rechazada registrada
- **WHEN** una petición se rechaza con `400 VALIDATION_ERROR`
- **THEN** se registra el evento `USER_REGISTER_FAILED` con `email` enmascarado, `ip` y `user_agent`

### Requirement: Email ya registrado
Si el email normalizado ya existe, el sistema MUST responder `409` con `EMAIL_ALREADY_REGISTERED`, sin crear el colegio ni el usuario, y registrar `USER_REGISTER_DUPLICATE` con `reason` `EMAIL`. El email MUST comprobarse antes que el colegio. Si dos registros simultáneos usan el mismo email, solo uno MUST crearse y el otro MUST recibir esta misma respuesta.

#### Scenario: Email existente
- **GIVEN** un usuario registrado con `jose@example.com`
- **WHEN** se registra otro colegio con `JOSE@example.com`
- **THEN** responde `409` con `EMAIL_ALREADY_REGISTERED`
- **AND** no se crea ningún colegio ni usuario nuevos
- **AND** se registra `USER_REGISTER_DUPLICATE` con `reason` `EMAIL`

#### Scenario: Email y colegio existentes
- **GIVEN** que el email y el colegio indicados ya están registrados
- **WHEN** se envía el registro
- **THEN** responde `409` con `EMAIL_ALREADY_REGISTERED`, no con `SCHOOL_ALREADY_REGISTERED`

#### Scenario: Registros simultáneos con el mismo email
- **WHEN** dos peticiones con el mismo email y colegios distintos se procesan a la vez
- **THEN** una responde `201` y la otra `409` con `EMAIL_ALREADY_REGISTERED`
- **AND** existe un único usuario con ese email y el colegio de la petición rechazada no queda creado

### Requirement: Colegio ya registrado en el municipio
Si ya existe un colegio con el mismo nombre normalizado en el mismo municipio, el sistema MUST responder `409` con `SCHOOL_ALREADY_REGISTERED`, sin crear el colegio ni el usuario, y registrar `USER_REGISTER_DUPLICATE` con `reason` `SCHOOL`. El nombre normalizado se obtiene pasando a minúsculas, quitando acentos y diacríticos y conservando solo letras y dígitos. El mismo nombre en municipios distintos MUST corresponder a colegios distintos. Si dos registros simultáneos crean el mismo colegio, solo uno MUST crearse y el otro MUST recibir esta misma respuesta.

#### Scenario: Mismo nombre con distinta escritura
- **GIVEN** el colegio «C.E.I.P. Nº 3» registrado en un municipio
- **WHEN** se registra «ceip n 3» con un email nuevo en ese municipio
- **THEN** responde `409` con `SCHOOL_ALREADY_REGISTERED`
- **AND** se registra `USER_REGISTER_DUPLICATE` con `reason` `SCHOOL`

#### Scenario: Mismo nombre en otro municipio
- **GIVEN** el colegio «CEIP Lluís Vives» registrado en un municipio
- **WHEN** se registra «CEIP Lluís Vives» en otro municipio con un email nuevo
- **THEN** responde `201` y existen dos colegios distintos

#### Scenario: El nombre se guarda como lo escribe el usuario
- **WHEN** se registra «CEIP Lluís Vives»
- **THEN** `name` es `CEIP Lluís Vives` y `normalizedName` es `ceiplluisvives`

#### Scenario: Registros simultáneos del mismo colegio
- **WHEN** dos peticiones con el mismo colegio y municipio y emails distintos se procesan a la vez
- **THEN** una responde `201` y la otra `409` con `SCHOOL_ALREADY_REGISTERED`
- **AND** existe un único colegio con un único usuario

### Requirement: Registro de eventos sin datos sensibles
El sistema MUST registrar con pino los eventos `USER_REGISTER_SUCCESS`, `USER_REGISTER_FAILED` y `USER_REGISTER_DUPLICATE`, con marca de tiempo (el campo `time` de pino), `email` enmascarado (primer carácter y dominio, p. ej. `j***@example.com`), `ip` y `user_agent` completos. La contraseña MUST eliminarse de los logs con `redact` de pino y no registrarse nunca.

#### Scenario: Alta registrada
- **WHEN** se completa un registro
- **THEN** se registra `USER_REGISTER_SUCCESS` con el email enmascarado, la IP y el user agent

#### Scenario: Contraseña ausente de los logs
- **WHEN** se procesa cualquier registro, correcto o rechazado
- **THEN** ninguna línea de log contiene la contraseña ni su hash

### Requirement: Verificación de captcha provisional
El registro MUST pasar por un puerto de verificación de captcha, con un adaptador provisional que acepta cualquier token, ejecutado antes de validar el payload. El formulario MUST enviar un token fijo con `version` `v3`. La sustitución por la verificación real corresponde a US01_e y no MUST cambiar el resto del flujo.

#### Scenario: Token provisional aceptado
- **WHEN** se envía un registro con cualquier `captcha.token`
- **THEN** el puerto de verificación lo acepta y el registro continúa con la validación del payload

#### Scenario: Sustituible sin tocar el caso de uso
- **WHEN** un test inyecta un verificador que rechaza el token
- **THEN** el caso de uso termina sin validar el payload ni consultar la base de datos

### Requirement: Formulario de registro con validación inline
El frontend MUST ofrecer una página de registro con los campos nombre del colegio, municipio, nombre, apellidos, email y contraseña. MUST validar cada campo con las mismas reglas que el backend y mostrar el error inline, justo debajo del campo, accesible con `aria-describedby` y `role="alert"`, sin enviar el formulario si hay errores. Los errores `400` del backend MUST mostrarse bajo el campo indicado por `details`, traducidos por la pareja campo-código. Todos los textos MUST salir de i18n en `es.json` y `en.json`.

#### Scenario: Contraseña fuera de rango
- **WHEN** el usuario envía una contraseña de menos de 8 caracteres o de más de 72 bytes
- **THEN** ve bajo el campo «La contraseña debe tener entre 8 y 72 caracteres (los acentos y los símbolos especiales cuentan por más de uno)» y no se realiza ninguna petición

#### Scenario: Contraseña sin variedad
- **WHEN** el usuario introduce una contraseña de 8 caracteres a 72 bytes sin mayúscula, minúscula, número o símbolo
- **THEN** ve «La contraseña debe contener al menos una mayúscula, una minúscula, un número y un símbolo» y no se realiza ninguna petición

#### Scenario: Email inválido
- **WHEN** el usuario introduce un email sin `@`, con dominio incompleto, con caracteres prohibidos o con una dirección IP
- **THEN** ve «Formato de email inválido» bajo el campo y el formulario no se envía

#### Scenario: Nombre del colegio inválido
- **WHEN** el nombre del colegio está vacío, tiene menos de 2 o más de 150 caracteres, o contiene caracteres no permitidos
- **THEN** ve «El nombre del colegio debe tener entre 2 y 150 caracteres válidos» y el formulario no se envía

#### Scenario: Sin municipio
- **WHEN** el usuario no elige ningún municipio de la lista
- **THEN** ve «Selecciona el municipio del colegio en la lista» y el formulario no se envía

#### Scenario: Accesibilidad de los errores
- **WHEN** un campo muestra un error
- **THEN** el campo tiene `aria-invalid="true"` y `aria-describedby` apunta al mensaje, que tiene `role="alert"`
- **AND** la página no tiene violaciones WCAG 2.1 AA detectables automáticamente

#### Scenario: Reglas compartidas entre backend y formulario
- **WHEN** se ejecutan los tests del backend y del frontend
- **THEN** ambos recorren la misma tabla de ejemplos válidos e inválidos de cada campo y obtienen el mismo veredicto

### Requirement: Respuestas del servidor en el formulario
Tras enviar el formulario, el frontend MUST mostrar, según la respuesta: `201`, un mensaje de confirmación de que el colegio y la cuenta se han creado, que sustituye al formulario; `409 EMAIL_ALREADY_REGISTERED`, «Este email ya está registrado» con un enlace a la pantalla de login; `409 SCHOOL_ALREADY_REGISTERED`, «Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.»; `400`, los errores bajo cada campo; y cualquier otro error, un mensaje genérico en lenguaje claro sin detalles técnicos.

#### Scenario: Registro correcto
- **WHEN** el servidor responde `201`
- **THEN** el formulario se sustituye por el mensaje de confirmación y no se muestra la contraseña

#### Scenario: Email ya registrado
- **WHEN** el servidor responde `409` con `EMAIL_ALREADY_REGISTERED`
- **THEN** se muestra «Este email ya está registrado» con un enlace al login

#### Scenario: Colegio ya registrado
- **WHEN** el servidor responde `409` con `SCHOOL_ALREADY_REGISTERED`
- **THEN** se muestra «Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.»

#### Scenario: Error inesperado
- **WHEN** el servidor responde `500` o no hay conexión
- **THEN** se muestra un mensaje genérico sin códigos ni trazas y el formulario conserva los datos introducidos salvo la contraseña

