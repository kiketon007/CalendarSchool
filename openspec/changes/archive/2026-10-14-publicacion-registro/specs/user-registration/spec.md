## MODIFIED Requirements

### Requirement: Contrato del registro documentado en OpenAPI
`docs/api-spec.yml` MUST documentar `POST /api/auth/register` como endpoint público (sin autenticación). La petición MUST ser un objeto JSON con `schoolName`, `municipalityCode` (código INE), `firstName`, `lastName`, `email`, `password`, `privacyPolicyAccepted` (booleano) y `captcha`, este último con `version` (`v3` o `v2`) y `token`, todos obligatorios. Las respuestas MUST ser:
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
- **THEN** exige `schoolName`, `municipalityCode`, `firstName`, `lastName`, `email`, `password`, `privacyPolicyAccepted` y `captcha` con `version` (`v3` o `v2`) y `token`
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

#### Scenario: Tipos del frontend al día
- **GIVEN** `docs/api-spec.yml` con el campo `privacyPolicyAccepted`
- **WHEN** se ejecuta `npm run api:types:check -w frontend`
- **THEN** pasa, y el tipo de la petición de registro exige `privacyPolicyAccepted` como booleano

### Requirement: Validación de los campos del registro
El backend MUST validar con Zod, tras superar los pasos previos, todos los campos con las reglas de la historia US01_b y MUST responder `400` con `VALIDATION_ERROR` y un elemento `{ field, code }` en `details` por cada campo inválido, sin dejar de informar de ninguno. Los códigos de campo son `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS` y `WEAK_PASSWORD`. Las reglas son:
- `schoolName`: obligatorio tras `trim()`, de 2 a 150 caracteres; permitidos letras del castellano y del valenciano (incluidos `à è ò ï ü ç ñ ·` y mayúsculas), dígitos, espacios, guiones, apóstrofos, puntos y `º`/`ª`.
- `municipalityCode`: obligatorio y existente en `municipalities`.
- `firstName` y `lastName`: obligatorios, de hasta 100 caracteres; mismos caracteres que el colegio salvo los puntos y `º`/`ª`.
- `email`: hasta 320 caracteres y conforme a la expresión regular de la historia (se rechazan `usuario@localhost`, direcciones IP y `usuario@`).
- `password`: de 8 caracteres a 72 bytes en UTF-8 (el límite de Bcrypt, que ignora el resto; las letras con acento y los símbolos fuera de ASCII ocupan 2 bytes o más) con al menos una mayúscula, una minúscula, un dígito y un símbolo de `!@#$%^&*()_+-=[]{}|;:,.<>?`.
- `privacyPolicyAccepted`: obligatorio y exactamente `true`. Si falta, es `false` o no es un booleano (por ejemplo, la cadena `"true"`), el código es `REQUIRED`.

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

#### Scenario: Política de privacidad no aceptada
- **WHEN** se envía un registro por lo demás válido sin `privacyPolicyAccepted`, con `false` o con la cadena `"true"`
- **THEN** responde `400` con `{ field: privacyPolicyAccepted, code: REQUIRED }` en `details`
- **AND** no se crea el colegio ni el usuario

#### Scenario: Inyección SQL y XSS
- **WHEN** un campo de texto contiene `'; DROP TABLE users; --` o `<img src=x onerror=alert(1)>`
- **THEN** la petición se rechaza con `400` por caracteres no permitidos
- **AND** las tablas siguen intactas

#### Scenario: Entrada rechazada registrada
- **WHEN** una petición se rechaza con `400 VALIDATION_ERROR`
- **THEN** se registra el evento `USER_REGISTER_FAILED` con `email` enmascarado, `ip` y `user_agent`

### Requirement: Formulario de registro con validación inline
El frontend MUST ofrecer una página de registro con los campos nombre del colegio, municipio, nombre, apellidos, email y contraseña, y la casilla de aceptación de la política de privacidad. MUST validar cada campo con las mismas reglas que el backend y mostrar el error inline, justo debajo del campo, accesible con `aria-describedby` y `role="alert"`, sin enviar el formulario si hay errores. Los errores `400` del backend MUST mostrarse bajo el campo indicado por `details`, traducidos por la pareja campo-código. Todos los textos MUST salir de i18n en `es.json` y `en.json`.

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
- **THEN** ambos recorren la misma tabla de ejemplos válidos e inválidos de cada campo, `privacyPolicyAccepted` incluido, y obtienen el mismo veredicto

## ADDED Requirements

### Requirement: Consentimiento de la política de privacidad
El formulario de registro MUST mostrar, antes del botón de envío, una casilla sin marcar con el texto «He leído y acepto la política de privacidad», cuyo enlace abre `/privacidad` en otra pestaña (`target="_blank"` y `rel="noopener noreferrer"`). Si la casilla no está marcada al enviar, el formulario MUST mostrar bajo ella «Debes aceptar la política de privacidad para crear la cuenta», con la misma accesibilidad que el resto de errores, y MUST NOT pedir un token de reCAPTCHA, cargar el script de Google ni llamar al servidor. La petición MUST llevar `privacyPolicyAccepted: true`. La casilla MUST NOT guardarse en el borrador del formulario: tras recargar la página aparece sin marcar.

Al crear el usuario, el backend MUST guardar en él la fecha de aceptación (el instante del alta) y la versión vigente de la política, en la misma transacción que el colegio y el usuario. La versión es una constante del backend que MUST cambiar cada vez que cambia el texto de la política.

#### Scenario: Envío sin aceptar la política
- **GIVEN** todos los campos son válidos y la casilla no está marcada
- **WHEN** el usuario envía el formulario
- **THEN** ve «Debes aceptar la política de privacidad para crear la cuenta» bajo la casilla, con `role="alert"`
- **AND** no se carga el script de reCAPTCHA y no se realiza ninguna petición

#### Scenario: Envío aceptando la política
- **GIVEN** todos los campos son válidos y la casilla está marcada
- **WHEN** el usuario envía el formulario
- **THEN** la petición lleva `privacyPolicyAccepted: true` y el token de reCAPTCHA

#### Scenario: Aceptación guardada
- **WHEN** se completa un registro con `privacyPolicyAccepted: true`
- **THEN** el usuario creado tiene la fecha de aceptación igual al instante del alta y la versión vigente de la política

#### Scenario: Sin aceptación no hay alta
- **WHEN** falla el alta (por ejemplo, `409 EMAIL_ALREADY_REGISTERED`)
- **THEN** no queda guardada ninguna aceptación

#### Scenario: La casilla no se conserva
- **GIVEN** he marcado la casilla y escrito el resto de campos
- **WHEN** recargo la página
- **THEN** los campos conservables se restauran y la casilla aparece sin marcar

#### Scenario: Enlace a la política
- **WHEN** se abre la página de registro
- **THEN** el texto de la casilla enlaza a `/privacidad` con `target="_blank"` y `rel="noopener noreferrer"`

### Requirement: Página de política de privacidad
El frontend MUST ofrecer una página pública `/privacidad`, accesible sin sesión, con la política de privacidad de CalendarSchool y la fecha de su última actualización. El texto MUST venir de i18n (`es.json` y `en.json`) y MUST describir al menos: el responsable del tratamiento y su email de contacto; los datos que se tratan en el registro (nombre del colegio, municipio, nombre, apellidos, email y contraseña, esta solo como hash); la IP y su plazo de conservación; la cookie de sesión `refresh_token` y su duración; reCAPTCHA de Google, los datos que recibe y cuándo se carga; los proveedores que tratan los datos (Supabase y AWS en la Unión Europea, y Google); los plazos de conservación, incluidas las copias de seguridad (30 días) y los logs (30 días); la base jurídica; y los derechos de las personas interesadas, con la posibilidad de reclamar ante la Agencia Española de Protección de Datos. La página MUST cumplir WCAG 2.1 AA y MUST NOT cargar el script de reCAPTCHA.

#### Scenario: Página visible sin sesión
- **GIVEN** un visitante sin sesión
- **WHEN** abre `/privacidad`
- **THEN** ve la política de privacidad con la fecha de última actualización, sin redirecciones

#### Scenario: Contenido mínimo
- **WHEN** se abre `/privacidad`
- **THEN** la página nombra al responsable y su email de contacto, los datos del registro, la IP, la cookie `refresh_token`, reCAPTCHA, los proveedores, los plazos de conservación, la base jurídica y los derechos con la reclamación ante la AEPD

#### Scenario: Recarga directa en producción
- **GIVEN** el entorno desplegado
- **WHEN** se recarga `https://app.calendarschools.es/privacidad`
- **THEN** la respuesta es `200` con `index.html` y la aplicación pinta la política

#### Scenario: Accesibilidad
- **WHEN** se analiza la página con las herramientas automáticas de accesibilidad
- **THEN** no hay violaciones WCAG 2.1 AA

#### Scenario: Sin reCAPTCHA
- **WHEN** se abre `/privacidad`
- **THEN** no se realiza ninguna petición a dominios de Google
