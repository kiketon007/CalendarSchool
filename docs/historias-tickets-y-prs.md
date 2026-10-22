# CalendarSchool: historias de usuario, tickets de trabajo y pull requests

Este documento reúne las secciones 5, 6 y 7 que antes estaban en el [`README.md`](../README.md): las historias de usuario con sus criterios de aceptación, los tickets de trabajo y las pull requests integradas. Se movieron aquí para aligerar el README; el contenido no ha cambiado, salvo este encabezado.

La fuente de verdad de las historias vigentes es [`User_Stories_MVP.md`](User_Stories_MVP.md); lo que sigue es el registro de las primeras historias, de sus tickets y de las PR de entrega.

---

## 5. Historias de Usuario

>### US01: Registro de usuario con email y contraseña

**Épica:** [1. Autenticación y Gestión de Sesiones](#epica-1-autenticacion-y-gestion-de-sesiones)

**Historia:**
Como visitante no autenticado, quiero crear una cuenta indicando el nombre y el municipio de mi colegio, mi nombre, email y contraseña, para acceder a CalendarSchool, asegurar la privacidad de mis credenciales y comenzar la gestión de los datos de mi colegio.

Esta historia se divide en seis partes, que se especifican e implementan por separado en este orden: US01_a → US01_b → US01_c y, después, US01_d, US01_e y US01_f en cualquier orden. Las reglas comunes de esta sección se aplican a todas ellas. US01 está completa cuando lo están sus seis partes.

| Parte | Contenido | Criterios |
|---|---|---|
| [US01_a](#us01_a-contrato-de-registro-y-tipos-generados) | Contrato de registro y tipos generados | CA7 |
| [US01_b](#us01_b-alta-atómica-de-colegio-y-usuario) | Alta atómica de colegio y usuario | CA2, CA3, CA4, CA6, CA8, CA11, CA12, CA13 |
| [US01_c](#us01_c-sesión-iniciada-tras-el-registro) | Sesión iniciada tras el registro | CA1 |
| [US01_d](#us01_d-límite-de-intentos-de-registro) | Límite de intentos de registro | CA9 |
| [US01_e](#us01_e-verificación-anti-bot-con-recaptcha) | Verificación anti-bot con reCAPTCHA | CA5 |
| [US01_f](#us01_f-resiliencia-del-formulario-en-el-navegador) | Resiliencia del formulario en el navegador | CA10 |

Los criterios conservan la numeración original de US01 (CA1-CA6) para no romper las referencias desde otras historias; los nuevos continúan a partir de CA7.

---

#### Reglas comunes

* **Orden de procesamiento obligatorio en backend:** 1) rate limit (US01_d) → 2) verificación reCAPTCHA (US01_e) → 3) validación del payload (`400`) → 4) comprobación de email existente y, después, de colegio existente (`409`) → 5) alta del colegio y del usuario (`201`); los pasos 3 a 5 son de US01_b. La existencia del email y del colegio nunca se consulta antes de superar el rate limit y el captcha, para que el formulario no sirva como herramienta gratuita de consulta de emails ni de colegios. Cada parte inserta su paso en la posición indicada sin alterar el resto.
* **Control de Timeout:** Timeout de la petición HTTP configurado a 10 segundos en backend.
* **Publicación en producción:** el registro no se publica en producción (US00_b) hasta que estén implementadas US01_d (límite de intentos) y US01_e (reCAPTCHA), porque hasta entonces el endpoint no tiene protección frente a altas automatizadas.
* **Internacionalización (i18n):** todos los mensajes de error y textos de interfaz se extraen a `es.json` y `en.json`, sin textos estáticos (*hardcoded*).
* **Aplazado hasta tener el entorno desplegado (US00_b):** la prueba de carga de **1000 registros simultáneos** (mediana de respuesta `< 800ms`, sin *starvation* de CPU por los cálculos de Bcrypt). Con Bcrypt cost 12 no es alcanzable en un único proceso de Node y solo tiene sentido medirla sobre la infraestructura real. Figura en las tareas pendientes de US00 (`docs/User_Stories_MVP.md`), para cuando estén implementadas US00_b y US01_b.

---

>### US01_a: Contrato de registro y tipos generados

**Historia:**
Como equipo de desarrollo, quiero definir el contrato del registro en `docs/api-spec.yml` y generar a partir de él los tipos TypeScript del frontend, para que backend y frontend no diverjan ni dupliquen los DTOs.

---

#### Casos de uso y reglas de negocio

* El endpoint `POST /api/auth/register` y sus respuestas (`201`, `400`, `409`, `422`, `429`) se definen primero en `docs/api-spec.yml` (OpenAPI 3), reutilizando el formato de error común (`ErrorResponse`) y `components.responses`.
* Los tipos TypeScript del frontend se **generan automáticamente** desde `docs/api-spec.yml` (p. ej. con `openapi-typescript`) mediante un script del workspace `frontend`; no se escriben a mano ni se duplican los DTOs.
* CI comprueba que los tipos generados están al día con el contrato (falla si `api-spec.yml` cambia sin regenerarlos).
* **Respuestas de error del registro:**
  * `400` con `VALIDATION_ERROR` y un elemento en `details` por cada campo inválido, con la forma `{ field, code }`. Los códigos de campo son genéricos y reutilizables: `REQUIRED`, `INVALID_LENGTH`, `INVALID_FORMAT`, `INVALID_CHARACTERS` y `WEAK_PASSWORD`. El frontend traduce la pareja campo-código mediante i18n y muestra el mensaje bajo el campo.
  * `409` con `EMAIL_ALREADY_REGISTERED` (US01_b añade `SCHOOL_ALREADY_REGISTERED`).
  * `422` con `CAPTCHA_CHALLENGE_REQUIRED`: el score de reCAPTCHA v3 es menor que 0.6 y el frontend debe presentar el reto v2.
  * `422` con `CAPTCHA_FAILED`: el token falta, no es válido o ha caducado, o no se ha superado el reto v2. Como el captcha se verifica antes que el payload (paso 2 del orden de procesamiento), un token ausente se responde así y no con `400`.
  * `429` con `TOO_MANY_REQUESTS` y la cabecera `Retry-After` (segundos que faltan para poder reintentar).
* Los códigos nuevos se añaden al enum `ErrorCode`, y las respuestas `400` y `429` se definen en `components.responses` para que las reutilicen otras historias (p. ej. el inicio de sesión, US02).
* La petición indica, junto al token de reCAPTCHA, a qué versión corresponde (v3 o v2), porque cada versión se verifica con una clave secreta distinta.
* Esta parte solo define el contrato y la generación de tipos; el endpoint lo implementan US01_b a US01_e. US01_b amplía después el contrato con el municipio del colegio (ver *Contrato* en US01_b).

---

#### Criterios de Aceptación (MVP)

* **CA7 (Contrato y tipos sincronizados):** Dado que `POST /api/auth/register` está definido en `docs/api-spec.yml`, cuando ejecuto el script de generación del workspace `frontend`, entonces se generan los tipos de la petición y de las respuestas del registro; y si modifico `api-spec.yml` sin regenerarlos, CI falla.

---

>### US01_b: Alta atómica de colegio y usuario

**Historia:**
Como visitante no autenticado, quiero crear una cuenta indicando el nombre y el municipio de mi colegio, mi nombre, apellidos, email y contraseña, para que mi colegio y mis credenciales queden registrados de forma segura.

---

#### Casos de uso y reglas de negocio

* **Orden de procesamiento:** implementa los pasos 3) validación del payload (`400`) → 4) comprobación de email existente y, después, de colegio existente (`409`) → 5) alta del colegio y del usuario (`201`) de las reglas comunes.

* **Alta del colegio:**
* El registro crea en una única operación atómica el colegio y su usuario: o se crean ambos o ninguno.
* El usuario registrado queda como administrador de su colegio (rol `ADMIN`). Un colegio puede tener varios usuarios, que se incorporan mediante un enlace de invitación (US02_b); el registro siempre crea un colegio nuevo y nunca da acceso a uno existente.
* **Colegio único por nombre y municipio:** no puede haber dos colegios con el mismo nombre normalizado en el mismo municipio. El nombre normalizado se obtiene pasando a minúsculas, quitando acentos y diacríticos y conservando solo letras y dígitos (p. ej. «C.E.I.P. Nº 3» y «ceip n 3» se consideran el mismo nombre). El nombre se guarda y se muestra tal como lo escribe el usuario. El mismo nombre en municipios distintos corresponde a colegios distintos.
* Los identificadores del colegio y del usuario son **UUIDv7** (ordenados por tiempo), coherentes con el `format: uuid` del contrato (US01_a).
* Los datos de un colegio (profesores, alumnos, cursos, restricciones, horarios, comedor) solo son visibles para los usuarios de ese colegio.

* **Estatus de la Cuenta:**
* La cuenta se crea directamente en estado `ACTIVE`. La verificación de email por enlace queda fuera del MVP (PRD §3.1), por lo que no se envía ningún correo de confirmación.

* **Almacenamiento seguro de credenciales:**
* Algoritmo **Bcrypt con Cost Factor 12**, con la sal aleatoria por hash que genera el propio algoritmo. El hash se calcula de forma **asíncrona, sin bloquear el event loop**, con una librería que funcione en AWS Lambda (US00_b).
* Normalización obligatoria: Emails siempre almacenados en **minúsculas** (`toLowerCase()`) y con eliminación de espacios al inicio/final (`trim()`).

* **Email ya registrado:**
* Re-registración con email usado: se informa explícitamente de que el email ya está registrado y se ofrece ir al login (CA3, PRD §3.1). Es un riesgo de enumeración aceptado y acotado (ver *Riesgos y Mitigaciones*).
* Si dos registros simultáneos usan el mismo email, solo uno se crea y el otro recibe la respuesta de CA3.
* Si el email y el colegio ya están registrados, se informa del email (se comprueba primero).

* **Colegio ya registrado:**
* Si el colegio ya existe en ese municipio, se informa de ello y se indica que hay que pedir una invitación a un administrador del colegio (CA12). Es un riesgo de enumeración aceptado, como el del email (ver *Riesgos y Mitigaciones*).
* Si dos registros simultáneos crean el mismo colegio, solo uno se crea y el otro recibe la respuesta de CA12.

* **Feedback Visual e Inline:**
* Los mensajes de error de validación se muestran inline, justo debajo de cada campo correspondiente (nombre del colegio, municipio, nombre, apellidos, email, contraseña).

* **Contrato (amplía US01_a):** `RegisterRequest` añade `municipalityCode` (código INE); `RegisteredSchool` añade el municipio; el `409` admite también `SCHOOL_ALREADY_REGISTERED`; y se añade el endpoint público `GET /api/municipalities` (sin autenticación y cacheable), del que el formulario obtiene la lista. La tabla de municipios es la única fuente de verdad: la usan el endpoint y la validación del backend.

* **reCAPTCHA provisional hasta US01_e:** US01_b crea el puerto de verificación del captcha con un adaptador provisional que acepta cualquier token, y el formulario envía un token fijo. US01_e sustituye el adaptador por la verificación real y añade el widget, sin cambiar el resto del registro.

* **Tras el alta (hasta US01_c):** el formulario se sustituye por un mensaje de confirmación de que el colegio y la cuenta se han creado. US01_c lo cambia por el inicio de sesión y la redirección a Onboarding.

* **Normalización Unicode:** todos los textos de entrada se normalizan a NFC antes de validarlos, para que un texto con acentos descompuestos (NFD, habitual al pegar desde macOS) no falle las reglas de caracteres permitidos.

* **Validación en el backend y en el formulario:** las reglas de cada campo se implementan en los dos lados (Zod en el backend; validación inline en el formulario). Para que no diverjan, los tests de ambos usan la misma tabla de ejemplos válidos e inválidos de *Restricciones de campos y formatos*.

* **Fuera de alcance:** el inicio de sesión tras el registro y la redirección a Onboarding (US01_c), y la invitación de otros usuarios (US02_b).

---

#### Restricciones de campos y formatos

##### 0. Nombre del colegio

* **Obligatorio.** Se eliminan los espacios al inicio y al final (`trim()`) antes de validar.
* **Caracteres permitidos:** A-Z, a-z, 0-9, acentos y caracteres del castellano y el valenciano (á, é, í, ó, ú, à, è, ò, ï, ü, ç, ñ, · y sus mayúsculas), espacios, guiones, apóstrofos, puntos y `º`/`ª`.
* **Límite:** entre 2 y 150 caracteres.
* **Ejemplos permitidos:**
* `"CEIP Lluís Vives"` ✓
* `"C.E.I.P. Nº 3"` ✓
* `"Escola Mare de Déu"` ✓
* Fuera del MVP: código de centro de la Conselleria.

##### 0.1. Municipio

* **Obligatorio.** Se elige de la lista cerrada de los municipios de la Comunitat Valenciana, identificados por su código INE; no se admite texto libre, porque muchos municipios tienen dos nombres oficiales (p. ej. «Alicante/Alacant», «Elche/Elx»).
* El formulario ofrece un buscador sobre la lista, que muestra el nombre oficial del municipio y su provincia.
* La lista se carga en la base de datos como datos fijos a partir de la relación oficial de municipios del INE.

##### 1. Nombre y Apellidos (campos separados)

* **Caracteres permitidos:** A-Z, a-z, 0-9, acentos y caracteres del castellano y el valenciano (á, é, í, ó, ú, à, è, ò, ï, ü, ç, ñ, · y sus mayúsculas), espacios, guiones y apóstrofos.
* **Límite:** 100 caracteres por campo.
* **Ejemplos permitidos:**
* Nombre: `"José María"` ✓
* Apellidos: `"García-López"` ✓
* Nombre: `"Pere Lluís"` ✓
* Apellidos: `"Çanyelles i Col·lell"` ✓


##### 2. Email (RFC 5321 SMTP Compliance)

* **Longitud máxima:** 320 caracteres totales.
* **Regex de validación:**
```regex
^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$
```

* **Formatos Aceptados:**
* `usuario+tag@dominio.com` ✓
* `usuario@sub-dominio.com` ✓
* `usuario@dominio.co.uk` ✓

* **Formatos Rechazados:**
* `usuario@localhost` ✗
* `usuario@192.168.1.1` ✗
* `usuario@` ✗


##### 3. Contraseña (Estandarizada para Registro y Reset)

* **Longitud:** Mínimo **8 caracteres**, máximo **72 bytes en UTF-8** (límite de Bcrypt, que ignora el resto; las letras con acento y los símbolos fuera de ASCII ocupan 2 bytes o más) *(corregido el límite inferior de 12)*.
* **Variedad requerida:** Al menos una letra mayúscula, una minúscula, un número y un carácter especial/símbolo (`!@#$%^&*()_+-=[]{}|;:,.<>?`).

---

#### Criterios de Aceptación (MVP)

* **CA8 (Alta del colegio y de la cuenta):** Dado que estoy en la pantalla de registro, cuando envío un nombre de colegio, un municipio, un nombre, unos apellidos, un email y una contraseña válidos, entonces el sistema responde `201`, crea en una única operación el colegio y la cuenta asociada a él en estado `ACTIVE` y con rol `ADMIN`, almacena el email en minúsculas y sin espacios al inicio ni al final y la contraseña solo como hash Bcrypt (cost 12), y registra el evento `USER_REGISTER_SUCCESS`. Si falla la creación de cualquiera de los dos, no se crea ninguno.
* **CA2 (Error de longitud de contraseña):** Dado que intento registrarme con una contraseña fuera del rango permitido (menos de 8 caracteres o más de 72 bytes), cuando intento enviar el formulario, veo un error inline "La contraseña debe tener entre 8 y 72 caracteres (los acentos y los símbolos especiales cuentan por más de uno)" y el formulario no se envía.
* **CA3 (Manejo de Email existente y Privacidad):** Dado que intento registrarme con un email que ya existe en el sistema, cuando envío el formulario, el sistema responde `409` con el código `EMAIL_ALREADY_REGISTERED`, muestra el mensaje "Este email ya está registrado" con un enlace hacia la pantalla de login, no crea ni el colegio ni la cuenta, y registra el evento `USER_REGISTER_DUPLICATE`. Si dos registros simultáneos usan el mismo email, solo uno se crea y el otro recibe esta misma respuesta.
* **CA4 (Formato de email inválido):** Dado que ingreso un email con sintaxis inválida (sin `@`, dominio incompleto, caracteres prohibidos o dirección IP), cuando envío el formulario, veo un error inline "Formato de email inválido" y el formulario no se envía.
* **CA6 (Nombre del colegio inválido):** Dado que dejo vacío el nombre del colegio o introduzco uno con menos de 2 o más de 150 caracteres, o con caracteres no permitidos, cuando intento enviar el formulario, veo un error inline "El nombre del colegio debe tener entre 2 y 150 caracteres válidos" y el formulario no se envía.
* **CA11 (Contraseña sin la variedad requerida):** Dado que introduzco una contraseña de entre 8 caracteres y 72 bytes a la que le falta una mayúscula, una minúscula, un número o un símbolo, cuando intento enviar el formulario, veo un error inline "La contraseña debe contener al menos una mayúscula, una minúscula, un número y un símbolo" y el formulario no se envía; si la petición llega al backend, responde `400` con `VALIDATION_ERROR` y el código de campo `WEAK_PASSWORD` para `password`.
* **CA12 (Colegio ya registrado):** Dado que ya existe un colegio con el mismo nombre normalizado en el mismo municipio, cuando envío el formulario con un email no registrado, el sistema responde `409` con el código `SCHOOL_ALREADY_REGISTERED`, muestra el mensaje "Este colegio ya está registrado en ese municipio. Pide a un administrador del colegio que te invite.", no crea ni el colegio ni la cuenta, y registra el evento `USER_REGISTER_DUPLICATE` con `reason` `SCHOOL`. Si dos registros simultáneos crean el mismo colegio, solo uno se crea y el otro recibe esta misma respuesta.
* **CA13 (Municipio no válido):** Dado que no elijo ningún municipio de la lista, cuando intento enviar el formulario, veo un error inline "Selecciona el municipio del colegio en la lista" y el formulario no se envía; si la petición llega al backend sin municipio o con un código que no existe, responde `400` con `VALIDATION_ERROR` y el código de campo `REQUIRED` o `INVALID_FORMAT` para `municipalityCode`.

---

#### Requisitos Técnicos, QA y Riesgos

##### Requisitos de Testing

* **Unit Tests:** Validaciones de Regex de email, longitud/reglas de contraseña, sanitización `trim()`/`toLowerCase()` y generadores de hashing.
* **Tests de Seguridad:** Inyección SQL y XSS en campos de texto.
* **Tests de Accesibilidad:** Cumplimiento normativo **WCAG 2.1 AA** (foco en errores inline accesibles por lectores de pantalla via `aria-describedby` y `role="alert"`).
* **Datos de los E2E:** es la primera parte que escribe datos en los E2E. `scripts/e2e.mjs` vacía las tablas del esquema `public` de `calendarschool_test` (salvo `_prisma_migrations` y `municipalities`, datos fijos cargados por migración) después de migrar y antes de arrancar el backend, con la misma salvaguarda que `resetDatabase()` (solo bases cuyo nombre termina en `_test`). Cada ejecución parte de cero, y los datos de una ejecución fallida quedan disponibles para investigarla.

##### Riesgos y Mitigaciones

* **Protección XSS/SQLi:** Uso estricto de ORM/consultas preparadas y escape de variables HTML en frontend.
* **Enumeración de emails (riesgo aceptado):** el registro revela si un email ya está registrado (CA3), porque el registro con acceso inmediato (CA1) haría detectable cualquier respuesta genérica sin verificación por email, que queda fuera del MVP. Se acota con el orden de procesamiento (rate limit y reCAPTCHA antes de consultar la base de datos) y con el evento `USER_REGISTER_DUPLICATE` para detectar consultas masivas. Si en el futuro se añade la verificación por email, revisar esta decisión.
* **Enumeración de colegios (riesgo aceptado):** el registro revela si un colegio ya está registrado en un municipio (CA12), y con ello qué colegios usan CalendarSchool. Se acota igual que la enumeración de emails.
* **Ocupación del nombre de un colegio (riesgo aceptado):** sin verificación de identidad, cualquiera puede registrar el nombre de un colegio antes que el propio colegio, que ya no podría darse de alta. En el MVP, con un colegio piloto, se resuelve con soporte manual; revisar antes de ampliar el uso.
* **Observabilidad (Auditoría de Logs):**
* Registrar eventos estructurados: `USER_REGISTER_SUCCESS` (alta creada), `USER_REGISTER_FAILED` (entrada rechazada con `400 VALIDATION_ERROR`) y `USER_REGISTER_DUPLICATE` (`409`, con `reason` `EMAIL` o `SCHOOL`). Los rechazos por límite de intentos y por captcha los definen US01_d y US01_e; los errores internos ya los registra el manejador central.
* **Payload del log:** `timestamp` + `email` **enmascarado** + `ip` + `user_agent`.
* **Datos personales en los logs (RGPD, regla común a la autenticación: US01, US02 y US03):** el email se registra enmascarado (primer carácter y dominio, p. ej. `j***@example.com`); la IP y el user agent, completos, porque bastan para detectar consultas masivas. La contraseña nunca se registra (se elimina del log con `redact` de pino). Los logs se conservan 30 días (US00_b).

---

>### US01_c: Sesión iniciada tras el registro

**Historia:**
Como usuario recién registrado, quiero que mi sesión se inicie automáticamente al terminar el registro, para empezar a configurar mi colegio sin tener que iniciar sesión.

---

#### Casos de uso y reglas de negocio

* **Gestión de Sesiones y Tokens:**
* **Cookie de Sesión / Refresh Token:** Configurada con `HttpOnly`, `Secure` y `SameSite=Lax` (permite conservar la sesión al llegar a la aplicación desde enlaces externos) con **TTL de 24 horas**.
* **Access Token (JWT en memoria):** **TTL de 15 minutos**.
* La infraestructura de tokens que se crea aquí la reutilizan el inicio de sesión (US02) y el cierre de sesión (US03).
* **Obtención del access token:** el registro fija la cookie de sesión pero no devuelve ningún access token. El frontend lo obtiene con `POST /api/auth/refresh`, que lee la cookie y devuelve el access token, el usuario y su colegio. Esa misma llamada comprueba que el navegador ha aceptado la cookie, y es la que recupera la sesión al recargar la página, porque el access token solo vive en memoria.
* **Protección CSRF y fijación de sesión:** `POST /api/auth/refresh` solo acepta peticiones cuya cabecera `Origin` coincide con el origen configurado de la aplicación (`403 ORIGIN_NOT_ALLOWED` en otro caso) y no se habilita CORS. El identificador de sesión lo genera siempre el servidor tras el alta: una cookie enviada por el cliente se ignora.

* **Onboarding:** tras el registro, el usuario es redirigido automáticamente a la pantalla de bienvenida (US04 - Onboarding).

* **Compatibilidad con cookies deshabilitadas:** si tras el alta el navegador no ha aceptado la cookie, se avisa en la propia página de que la cuenta está creada y se requieren cookies para mantener la sesión activa. Si la sesión no se puede comprobar por otra causa (sin conexión o error del servidor), se muestra un mensaje distinto («cuenta creada, sesión no iniciada»). En ambos casos no se vuelve a ofrecer el formulario, porque reenviarlo daría un `409`.

---

#### Criterios de Aceptación (MVP)

* **CA1 (Registro exitoso y Onboarding):** Dado que estoy en la pantalla de registro, cuando ingreso el nombre de mi colegio, un email válido, un nombre, apellidos y una contraseña válida de entre 8 caracteres y 72 bytes, entonces se crean el colegio y la cuenta asociada a él, se almacena el email en minúsculas sanitizado, se inicia la sesión mediante cookie segura y soy redirigido automáticamente a la pantalla de bienvenida (US04 - Onboarding).

---

#### Requisitos Técnicos, QA y Riesgos

* **E2E Tests (Cypress):** Flujo completo de Registro -> Redirección a Onboarding.
* **Tests de Seguridad:** validación de políticas CORS, ataques de fijación de sesión y bypass CSRF.
* **Cookies:** Flag `HttpOnly` activado, flag `Secure` activado, propiedad `SameSite=Lax`.

---

#### Decisiones tomadas

* **Persistencia de los refresh tokens:** la tabla `refresh_tokens` (`MODELO_DATOS.md`) se crea en esta parte, con el token opaco guardado solo como hash SHA-256 y con revocación (`revokedAt`), para que US02 y US03 reutilicen la infraestructura sin cambiar el formato de la cookie. **Actualización (`inicio-sesion`, US02):** la tabla ya no guarda la IP ni el user agent del cliente (columnas `ip_address` y `user_agent`, borradas por migración): ninguna funcionalidad los usaba y no se purgaban, así que la IP habría durado más de lo que declara la política de privacidad. Solo quedan en los logs (30 días).
* **Pantalla de bienvenida:** el registro y el login redirigen a `/onboarding`, la página de inicio (US04): da la bienvenida con el nombre del usuario y del colegio, muestra las funcionalidades de horarios y de comedor como «Próximamente» y, al administrador, el atajo a «Usuarios»; sin sesión redirige a `/login` (US02).
* **Fuera de esta parte:** la rotación de refresh tokens, el límite de sesiones simultáneas y la limpieza programada de tokens caducados.

---

>### US01_d: Límite de intentos de registro

**Historia:**
Como responsable de CalendarSchool, quiero limitar los intentos de registro por origen, para que el formulario no sirva para ataques de fuerza bruta ni para consultar en masa qué emails o colegios están registrados.

---

#### Casos de uso y reglas de negocio

* **Gestión de tráfico y Brute Force:**
* Rate limiting por IP/Fingerprint (máximo 5 intentos de registro por cada 15 minutos, contando todos los intentos, también los que usan un email ya registrado). Si se supera, se devuelve HTTP `429 Too Many Requests`.
* Es el paso 1 del orden de procesamiento: se aplica antes de verificar el captcha, validar el payload o consultar la base de datos.

---

#### Criterios de Aceptación (MVP)

* **CA9 (Límite de intentos):** Dado que desde una misma IP se han hecho 5 intentos de registro en los últimos 15 minutos, usen o no un email ya registrado, cuando hago un sexto intento, entonces recibo `429` sin que se verifique el captcha, se valide el payload ni se consulte si el email existe, y veo un mensaje que me indica que lo intente más tarde.

---

#### Decisiones tomadas

* **Dónde se guarda el contador:** en una tabla de PostgreSQL (`rate_limit_attempts`), compartida entre las instancias de AWS Lambda (US00_b). El throttling de API Gateway limita por ruta y no por IP, y las reglas de tasa de WAF no admiten «5 intentos en 15 minutos»; pueden añadirse después como protección extra. Cada intento aceptado es una fila y la ventana es deslizante; una transacción con un bloqueo consultivo por clave (`pg_advisory_xact_lock`) impide que peticiones simultáneas superen el máximo.
* **El `429` no cuenta como intento:** así quien reintenta durante el bloqueo no lo alarga; `Retry-After` indica los segundos que faltan para que el intento más antiguo salga de la ventana. Cuentan los intentos con cuerpo JSON válido, se acepten o no después; un JSON mal formado responde `400 INVALID_JSON` sin contar.
* **"Fingerprint":** queda fuera del MVP, porque no está definida y el cliente puede falsearla. El límite es solo por IP.
* **Mecanismo reutilizable:** el limitador es genérico (clave `<operación>:<ip>` y política), para que el login (US02) y las invitaciones (US02_b y US02_c) lo reutilicen con su propia política.
* **Configuración:** `REGISTRATION_ATTEMPTS_MAX` (5 por defecto, y 1000 en el E2E, donde todas las peticiones llegan desde la misma IP) y `TRUST_PROXY_HOPS` (0 por defecto).
* **IP real del cliente:** detrás del proxy de Vite, o de CloudFront y API Gateway en producción (US00_b), la IP que ve Express no es la del cliente, que llega en `X-Forwarded-For`. Se resuelve con `trust proxy` de Express y la variable `TRUST_PROXY_HOPS`: con N proxies de confianza se toma la dirección que está N saltos desde la derecha de la cabecera, ignorando lo que el cliente haya escrito antes. **Pendiente para `despliegue-aws`:** fijar `TRUST_PROXY_HOPS` en producción y cerrar la llamada directa a API Gateway sin pasar por CloudFront (p. ex. con una cabecera secreta que añada CloudFront), porque quien llegue directamente puede elegir su IP. Además, el registro no debe publicarse hasta entonces (CA9 solo protege si la IP no se puede falsear).

---

>### US01_e: Verificación anti-bot con reCAPTCHA

**Historia:**
Como responsable de CalendarSchool, quiero distinguir los registros hechos por personas de los automatizados, para impedir altas masivas sin molestar a los usuarios legítimos.

---

#### Casos de uso y reglas de negocio

* **Protección Anti-bot (Google reCAPTCHA v3):**
* Integración transparente en frontend. Score umbral: `≥ 0.6`.
* **Fallback:** Si el score es `< 0.6`, presentar de forma interactiva un reto **reCAPTCHA v2 / Challenge** explícito al usuario en lugar de reintentar en bucle en backend.
* Es el paso 2 del orden de procesamiento: se aplica después del rate limit y antes de validar el payload o consultar la base de datos.

---

#### Criterios de Aceptación (MVP)

* **CA5 (Fallos de Captcha y Reto Anti-bot):** Dado que un intento de registro obtiene un score de reCAPTCHA v3 menor a 0.6, el sistema solicita completar un reto visual secundario (reCAPTCHA v2 Checkbox) para verificar que soy un usuario humano antes de procesar el registro.

---

#### Decisiones tomadas

* **reCAPTCHA en desarrollo, tests y E2E:** un verificador falso, elegido por configuración: sin secretos de reCAPTCHA el backend lo usa y avisa en el log; con ellos, el real. `loadConfig` exige los dos secretos en producción, así que el falso nunca puede llegar allí. Acepta cualquier token salvo los reservados `fake-low-score` (con `v3`, pide el reto), `fake-fail` y `fake-unavailable`. En el frontend, un cliente falso equivalente sin claves de sitio, con un reto simulado. Así los tests no dependen de Google y pueden simular el score bajo, el fallo y la indisponibilidad.
* **Google no responde:** el registro **falla cerrado**: `503` con el código nuevo `CAPTCHA_UNAVAILABLE` (distinto de `CAPTCHA_FAILED`, para no decir al usuario que su verificación ha fallado), con un timeout de 3 segundos hacia Google. Se descartó dejar pasar el registro sin verificar: un bot que detectara la caída entraría, y el registro de colegios no es urgente al minuto.
* **Umbral y comprobaciones:** el score mínimo de v3 es 0,6 (constante). Además del score se comprueban la acción `register` y el dominio de la aplicación (`APP_ORIGIN`), y cada token sirve una sola vez y caduca a los 2 minutos, así que el frontend pide uno nuevo en cada envío.
* **Interacción con el límite de intentos (US01_d):** quien recibe el reto gasta dos de sus 5 intentos (el v3 con score bajo y el v2). Se considera aceptable.
* **Orden:** el captcha se verifica antes que la validación, así que un registro sin `captcha` responde `422 CAPTCHA_FAILED` y no `400`.
* **Privacidad:** el formulario muestra el aviso de privacidad y condiciones de Google, que la propia Google exige.

#### Pendiente antes de publicar

* **Prueba con claves reales de Google Cloud:** aún no existen (Google ya no crea claves de reCAPTCHA «clásico»; hay que crearlas en un proyecto de Google Cloud, una por score para v3 y otra de checkbox para v2). Debe confirmarse con ellas si el endpoint `siteverify` las admite o si hace falta la API de evaluaciones de Google Cloud (solo cambiaría el adaptador `RecaptchaCaptchaVerifier`) y probar el flujo completo en el navegador. Con la clave de prueba pública de v2 de Google ya se ha comprobado la ruta v2 contra Google real. Un secreto mal configurado solo se detecta en el primer registro real (Google valida primero el token) y daría `503`.
* **Consentimiento:** valorar con quien lleve la parte legal si reCAPTCHA exige consentimiento del usuario en este contexto (envía datos del navegador a Google y puede fijar cookies).
* **`Content-Security-Policy`:** no existe todavía; si se añade, habrá que permitir los dominios de Google.

---

>### US01_f: Resiliencia del formulario en el navegador

**Historia:**
Como visitante que se está registrando, quiero no perder lo que he escrito si se interrumpe el navegador y que un envío repetido no cree cuentas duplicadas, para completar el registro sin repetir trabajo.

---

#### Casos de uso y reglas de negocio

* **Flujos de resiliencia de navegador:**
* Manejo de registro tras crash/cierre de navegador: Conservación de datos de formulario mediante `sessionStorage` (excepto la contraseña) hasta que el usuario complete el proceso.
* Múltiples pestañas/navegadores simultáneos: Bloqueo de solicitudes duplicadas concurrentes mediante token de formulario único por sesión.

---

#### Criterios de Aceptación (MVP)

* **CA10 (Conservación del formulario):** Dado que he rellenado parte del formulario de registro, cuando recargo la página, entonces los campos conservan lo que escribí salvo la contraseña, que nunca se guarda; y tras un registro exitoso esos datos se borran.

---

#### Decisiones tomadas

* **Alcance del borrador:** `sessionStorage`, que sobrevive a las recargas y a la restauración de sesión del navegador tras un cierre inesperado, pero no al cierre deliberado de la pestaña. No se usa `localStorage`: el borrador contiene datos personales (nombre, apellidos, email) y en un colegio es habitual el equipo compartido (secretaría, sala de profesores). Cada pestaña tiene su propio borrador.
* **Qué se guarda:** el nombre del colegio, el municipio, el nombre, los apellidos y el email, en cada cambio. La contraseña nunca. Un borrador corrupto o manipulado se ignora, un municipio que no está en la lista se descarta y, si el navegador no permite usar el almacenamiento, el formulario funciona igual sin conservar nada.
* **Cuándo se borra:** tras un registro correcto (`201`), incluso si no se puede iniciar la sesión (la cuenta ya existe). Ante un `409`, `429`, fallo de captcha o error inesperado se conserva. El reto v2 y el aviso de demasiados intentos no se conservan.
* **Sin token de formulario único:** antes del registro no hay sesión, y la unicidad del email y del colegio en la base de datos (US01_b) ya impide que dos envíos simultáneos creen dos cuentas: el segundo recibe su `409`. El envío repetido desde la misma pestaña (doble clic, Enter repetido) se bloquea en el cliente con una guarda síncrona y el botón deshabilitado. Exigir un token habría supuesto un endpoint y una tabla nuevos para la misma garantía.

---


>### US05: Crear un curso con clases y tutores

**Épica:** [2. Gestión de Cursos y Estructura Base](#epica-2-gestion-de-cursos-y-estructura-base)

**Historia:** Como usuario del colegio, quiero crear un curso (ej. "1º Primaria") con sus clases (A, B, etc.) y asignar un tutor a cada una, para estructurar la organización del colegio.


#### Casos de uso y reglas de negocio

* **Estructura de curso y clases:**
  * Curso = nivel educativo (ej. "1º Primaria", "Infantil 3 años", "6º Primaria").
  * Cada curso puede tener múltiples clases (A, B, C, etc.).
  * Cada clase requiere un tutor asignado.

* **Validación de nombres:**
  * Nombre de curso debe ser único (no se permite duplicar nombres de cursos).
  * Nombre de clase debe ser único DENTRO del mismo curso (no puede haber dos "A" en "1º Primaria").
  * Caracteres permitidos: alfanuméricos (A-Z, a-z, 0-9) + caracteres especiales (º, Âª, -, espacio, etc.).
  * Ambos campos son obligatorios.

* **Gestión de tutores:**
  * Un tutor solo puede ser tutor de UNA clase (no puede tutorizar múltiples clases simultáneamente).
  * Tutor debe existir en BD como profesor del colegio y estar en estado ACTIVE.
  * Se muestra dropdown filtrable con lista de profesores disponibles (nombre + apellido).
  * Si no hay profesores disponibles, se muestra mensaje claro.

* **Protección de formulario:**
  * Botón "Guardar" se deshabilita tras primer clic (previene doble envío).
  * Si usuario intenta enviar dos veces rápidamente, solo se crea UN curso.

* **Sincronización y cascada:**
  * Si un profesor es borrado (US09 - Borrar profesor):
    * Se elimina automáticamente como tutor de la clase.
    * Se elimina de los horarios en los que esté asignado (US19).
    * Clase queda SIN tutor (requiere reasignar).

* **Manejo de errores:**
  * Errores de validación se muestran inline debajo del campo correspondiente.
  * Errores del servidor se muestran con mensaje claro, sin tecnicismos.
  * Si servidor falla: "No se pudo crear el curso. Intenta de nuevo".


#### Restricciones de campos y formatos

##### Nombre de Curso
* **Carácter obligatorio**: Sí.
* **Caracteres permitidos**: Alfanuméricos (A-Z, a-z, 0-9) + especiales (º, Âª, -, /, espacio).
* **Límite**: 100 caracteres máximo.
* **Unicidad**: No puede haber dos cursos con mismo nombre.
* **Ejemplos válidos**: "1º Primaria", "Infantil 3 años", "6º Primaria", "2Âª ESO".

##### Nombre de Clase
* **Carácter obligatorio**: Sí.
* **Caracteres permitidos**: Alfanuméricos (A-Z, a-z, 0-9) + especiales (º, Âª).
* **Límite**: 10 caracteres máximo.
* **Unicidad**: Dentro del MISMO curso (no puede haber dos "A").
* **Ejemplos válidos**: "A", "B", "1ÂªA", "Grupo A".
* **Sin límite máximo**: Se pueden crear N clases por curso.

##### Tutor
* **Carácter obligatorio**: Sí, una clase sin tutor no puede crearse.
* **Validación**: Profesor debe existir en BD y estar ACTIVE.
* **Restricción crítica**: Un tutor solo puede estar asignado a UNA clase en todo el colegio.
* **Interfaz**: Dropdown filtrable por nombre/apellido con búsqueda en tiempo real.
* **Fallback**: Si no hay profesores disponibles, mostrar mensaje "No hay profesores disponibles. Crea profesores primero en Gestión de Profesores".


#### Criterios de Aceptación (Ampliados - 10 CAs)

* **CA1 (Crear curso exitoso):** Dado que estoy en la sección de gestión de cursos, cuando completo el formulario con nombre de nivel ("1º Primaria"), clases ("A", "B") y asigno tutores VÀLIDOS para cada clase, entonces el curso se crea exitosamente, aparece en el listado, y cada clase muestra el tutor asignado.

* **CA2 (Nombre de nivel obligatorio):** Dado que intento crear un curso sin indicar nombre de nivel, cuando intento enviar el formulario, entonces veo error inline "El nombre del nivel es obligatorio" y el formulario no se envía.

* **CA3 (Al menos una clase obligatoria):** Dado que intento crear un curso sin asignar al menos una clase, cuando intento enviar el formulario, entonces veo error "Debe indicar al menos una clase para el curso" y el formulario no se envía.

* **CA4 (Tutor válido requerido):** Dado que intento asignar un tutor inválido o no existente a una clase, cuando intento enviar el formulario, entonces veo error inline "Debe asignar un tutor válido a cada clase".

* **CA5 (Curso aparece en listado):** Dado que cree exitosamente un curso "1º Primaria" con clases A (tutor Juan) y B (tutor María), cuando veo el listado de cursos, entonces aparece "1º Primaria" con estructura: Clase A - Juan, Clase B - María.

* **CA6 (Nombre de curso es único):** Dado que intento crear un segundo curso con mismo nombre "1º Primaria", cuando intento enviar el formulario, entonces veo error "Este curso ya existe en el sistema. Usa otro nombre".

* **CA7 (Nombre de clase es único dentro del curso):** Dado que intento crear dos clases con mismo nombre ("A") en el mismo curso "1º Primaria", cuando intento enviar el formulario, entonces veo error "Ya existe una clase A en este curso".

* **CA8 (Un tutor en una sola clase):** Dado que asigno profesor "Juan" como tutor de clase A en "1º Primaria", cuando intento asignar "Juan" como tutor de otra clase en el mismo u otro curso, entonces veo error "Este profesor ya es tutor de otra clase. Elige otro profesor".

* **CA9 (Protección contra doble envío):** Dado que presiono "Guardar" dos veces rápidamente, cuando intento guardar, entonces botón "Guardar" se deshabilita tras primer clic, y solo se crea UN curso (no duplicados).

* **CA10 (Interfaz de selección de tutor y fallback):** Dado que intento asignar tutor a una clase, cuando hago clic en campo de tutor, entonces aparece dropdown filtrable con lista de profesores disponibles (nombre + apellido). Si no hay profesores disponibles, veo mensaje "No hay profesores disponibles. Crea profesores primero en Gestión de Profesores".

* **CA11 (Sincronización cascada - profesor borrado):** Dado que un profesor es borrado del sistema (US09), cuando se ejecuta eliminación, entonces ese profesor se remueve automáticamente como tutor de la clase, se elimina de los horarios donde estaba asignado (US19), y clase queda sin tutor (requiere reasignación).

* **CA12 (Manejo de errores server-side):** Dado que frontend valida OK pero backend falla (ej., profesor borrado simultáneamente), cuando intento guardar, entonces veo error claro "No se pudo crear el curso. Intenta de nuevo" (SIN mensajes técnicos).

* **CA13 (Caracteres especiales permitidos):** Dado que intento crear curso con nombre "1º Primaria", "Infantil 3 años", "6Âª Primaria", cuando envío el formulario, entonces se acepta (alfanuméricos + º, Âª, -, / permitidos).


#### Requisitos Técnicos, QA y Riesgos

##### Requisitos de Testing (Pre-release)

* **Unit Tests:** Validación de uniqueness (curso, clase), validación de tutor, restricción "un tutor por clase".
* **E2E Tests:** Crear curso completo ✗
* **Tests de Seguridad:** Prevención de doble envío, SQL injection en nombre de curso.
* **Tests de Cascada:** Borrar profesor ✗
* **Performance:** Búsqueda de tutores en dropdown con 1000+ profesores (búsqueda filtrada).

##### Riesgos y Mitigaciones

* **Integridad referencial:**
  * Un tutor asignado a clase NO puede ser eliminado de profesor (cascade delete en BD).
  * Si profesor es borrado, clase debe quedar sin tutor (permitir null en BD).
  * Horarios con ese profesor deben ser actualizados/eliminados (cascada).

* **Concurrencia:**
  * Si dos admin crean clase y asignan mismo tutor simultáneamente, segundo intento falla.
  * Validación en BD: UNIQUE constraint en (class_id, teacher_id).

* **Observabilidad (Auditoría de Logs):**
  * Registrar eventos: `COURSE_CREATED`, `CLASS_CREATED`, `TEACHER_ASSIGNED`.
  * **Payload del log**: timestamp + usuario + course_id + clase_ids + teacher_ids.

* **Internacionalización (i18n):**
  * Extraer mensajes de error a archivos JSON para multiidioma (futura expansión).


#### Dependencias

* **Depende de US09 (Crear profesor)**: Debe haber profesores disponibles para asignar como tutores.
* **Impacta en US19 (Generación de horarios)**: Horarios se crean basándose en profesores asignados a clases.
* **Impacta en US08 (Borrar curso)**: No se puede borrar curso con alumnos asignados.


---


>### US09: Crear un profesor

**Épica:** [3. Gestión de Profesores](#epica-3-gestion-de-profesores)

**Historia:** Como usuario del colegio, quiero crear un profesor indicando su nombre, apellido, múltiples asignaturas que puede impartir, su cargo y si es tutor de un curso, para configurar la estructura docente del colegio con flexibilidad para profesores que enseñan varias materias.
  

**Casos de uso y reglas de negocio:**
* **Acceso a creación:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede crear profesores. Botón "Crear Profesor" está en listado de profesores (US10). Se abre formulario con campos: nombre, apellido, asignaturas (multiselect), cargo (opcional), tutor de clase (opcional).

* **Campos obligatorios:** Nombre (obligatorio), Apellido (obligatorio), Asignaturas (obligatorio - multiselect, mínimo 1, máximo N), Tutor de clase (opcional, profesor puede crearse sin clase asignada, tutor_id = NULL), Email (NO obligatorio, no se solicita en formulario de creación).

* **Validación de nombre y apellido:** Caracteres permitidos: alfanuméricos (A-Z, a-z, 0-9), acentos (á, é, í, ó, ú, ñ), guiones (-), apóstrofos ('), espacios. Límite: 100 caracteres por campo. No puede ser solo espacios (debe tener caracteres alfanuméricos). NO hay validación de unicidad: pueden existir múltiples profesores con mismo nombre + apellido.

* **Gestión de asignaturas:** Asignaturas: checkboxes multiselect. Mínimo 1 asignatura requerida (validación). Máximo: N asignaturas (sin límite explícito, pero práctico ~10). Solo se muestran asignaturas con status ACTIVE (de US-SUBJECT). Múltiples profesores pueden tener las MISMAS asignaturas (sin restricción de unicidad). Ejemplos: Prof. Smith [Inglés, Arts], Prof. García [Inglés, Valenciano], Prof. López [Educación Física].

* **Integración con US-SUBJECT:** Sistema pre-carga lista de asignaturas desde tabla subjects WHERE status = 'ACTIVE'. Cada asignatura muestra tipo (CORE/ELECTIVE/CUSTOM) como ayuda visual. Si no hay asignaturas disponibles, mostrar aviso "No hay asignaturas ACTIVE disponibles. Crear primero en US-SUBJECT".

* **Gestión de tutoría:** Tutor de clase es opcional. Un profesor puede ser tutor de UNA sola clase (restricción heredada de US05). Profesor se crea SIN tutor (tutor_id = NULL) y se asigna después si es necesario.

* **Cargo:** opcional, con los valores "Director" o "Jefe de estudios" (vacío por defecto). Es un dato informativo del profesor y no concede permisos en la aplicación (PRD §3.2); los permisos dependen del rol del usuario (`ADMIN` o `MEMBER`). Es independiente de la tutoría: un profesor puede tener cargo y ser tutor a la vez.

* **Estado del profesor:** Profesor se crea en estado ACTIVE automáticamente. No hay campo para cambiar estado al crear.

* **Permisos:** Cualquier usuario del colegio (`ADMIN` o `MEMBER`) puede crear profesores, que se crean en su colegio. Sin sesión iniciada, la API responde `401`.

* **Feedback post-creación:** Formulario se cierra. Listado de profesores se actualiza inmediatamente. Notificación de éxito: "Profesor creado correctamente" (toast/snackbar). Profesor aparece en listado con nombre, asignaturas (separadas por comas) y estado de tutoría.
  
<br>

**Criterios de Aceptación:**
* **CA1 (Crear profesor con 1 asignatura):** Dado que estoy en sección gestión de profesores, cuando completo formulario con nombre "José María", apellido "García López", selecciono asignatura "Inglés" (checkbox), marco "Sin tutor" (opcional), entonces profesor se crea exitosamente en estado ACTIVE con 1 asignatura.

* **CA2 (Crear profesor con múltiples asignaturas):** Dado que completo nombre "Smith", apellido "John", selecciono 3 asignaturas [✗

* **CA3 (Nombre y apellido obligatorios):** Dado que intento crear profesor sin nombre o sin apellido, cuando intento guardar, entonces veo error inline "Nombre y apellido son obligatorios" y formulario no se envía.

* **CA4 (Asignaturas obligatorio - mínimo 1):** Dado que no selecciono ninguna asignatura, cuando intento guardar, entonces veo error "Debe seleccionar al menos 1 asignatura" y formulario no se envía.

* **CA5 (Profesor aparece en listado con asignaturas):** Dado que cree exitosamente profesor "Smith, John" con asignaturas [Inglés, Arts] sin tutor, cuando veo listado de profesores, entonces aparece: "Smith, John | Inglés, Arts | Sin tutoría".

* **CA6 (Badge expandible de asignaturas en listado):** Dado que profesor tiene 3+ asignaturas, cuando veo badge "3 asignaturas" en listado, entonces puedo hacer clic para expandir y ver detalle: [Inglés, Arts, Matemáticas] (con tipo CORE/ELECTIVE/CUSTOM).

* **CA7 (Tutor en una sola clase - restricción):** Dado que intento asignar profesor como tutor de múltiples clases simultáneamente, cuando intento guardar, entonces veo error "Un profesor solo puede ser tutor de una clase" y formulario no se envía.

* **CA8 (Validar clase existe):** Dado que intento asignar profesor a clase que no existe, cuando intento guardar, entonces veo error "La clase seleccionada no existe" y formulario no se envía.

* **CA9 (Caracteres especiales permitidos):** Dado que creo profesor con nombre "José María García-López" o "D'Angelo MÀ¼ller", cuando guardo, entonces se acepta (acentos, guiones, apóstrofos permitidos).

* **CA10 (Nombre no solo espacios):** Dado que intento crear profesor con nombre "     " (solo espacios), cuando intento guardar, entonces veo error "El nombre debe contener caracteres alfanuméricos" y formulario no se envía.

* **CA11 (Acceso de cualquier usuario del colegio):** Dado que soy `MEMBER`, cuando creo un profesor, entonces se crea en mi colegio igual que si fuera `ADMIN`; sin sesión iniciada, la API responde `401`.

* **CA12 (Validar asignaturas existen y ACTIVE):** Dado que intento enviar asignatura con ID que no existe o está INACTIVE, cuando guardo vía API, entonces recibo error "Una o más asignaturas no existen o no están activas" y no se crea profesor.

* **CA13 (Transacción atómica: profesor + asignaturas):** Dado que guardo profesor con 3 asignaturas, cuando se produce error en INSERT INTO professor_subjects, entonces toda transacción hace ROLLBACK (no se crea profesor ni asignaturas parciales).

* **CA14 (Mostrar solo asignaturas ACTIVE):** Dado que hay asignaturas con status INACTIVE en BD, cuando abro formulario, entonces checkbox lista solo muestra asignaturas con status = 'ACTIVE' (filtro automático).

<br>

* **CA15 (Cargo del profesor):** Dado que creo un profesor y elijo el cargo "Jefe de estudios", cuando guardo, entonces el profesor se crea con ese cargo; si no elijo ninguno, se crea sin cargo. El cargo no cambia los permisos de ningún usuario.

**Requisitos Técnicos:**
* Frontend: Componentes CreateProfessorForm (nombre, apellido, asignaturas multiselect, cargo, tutor), SubjectsCheckboxList (checkboxes multiselect con tipo CORE/ELECTIVE/CUSTOM), ClassDropdown (clases sin tutor), NotificationToast (éxito/error). API: POST /api/professors (crear profesor).
* Backend: Ruta POST /api/professors con autenticación (usuario `ADMIN` o `MEMBER`; el profesor se crea en el colegio del usuario), firstName + lastName (obligatorio, 100 chars, caracteres válidos), position (opcional: DIRECTOR | JEFE_ESTUDIOS), subjectIds array (obligatorio, mínimo 1, máximo N), cada subjectId validar existe y status='ACTIVE', classId (opcional, debe existir, sin otro tutor). Transacción BD completa (INSERT professors + INSERT professor_subjects). Response: { professor: { id, firstName, lastName, position, subjectIds, subjects: [...], classId, status: 'ACTIVE' } }.
* BD: Tabla professors con id, firstName, lastName, position (nullable: DIRECTOR | JEFE_ESTUDIOS), specialty (nullable, DEPRECATED - backward compat), classId (nullable), status, created_at. Àndices en firstName, lastName, status. NUEVA TABLA: professor_subjects (id, profesorId FK✗

<br>

**Decisiones Tomadas:**
| Decisión | Justificación |
|----------|---------------|
| **Múltiples asignaturas** | Realidad: profesores enseñan varias materias (Smith: Inglés+Arts) |
| **Multiselect (checkboxes)** | Claro, visual, mejor UX que dropdown múltiple |
| **Mínimo 1 asignatura** | Profesor debe poder enseñar algo (validación en BD) |
| **Solo ACTIVE en dropdown** | No confundir con asignaturas inactivas |
| **Many-to-many professor_subjects** | Flexible, permite N asignaturas por profesor sin límite |
| **specialty DEPRECATED** | Backward compat: campo sigue existiendo pero no usado. Read prioriza professor_subjects. Write siempre a profesor_subjects. |
| **Migración Opción 2** | Deprecate completamente: migrar datos legacy specialty✗
| **Profesor sin clase al crear** | Tutor se asigna después en US05/US07, orden flexible |
| **NO validar unicidad nombre** | Múltiples profesores pueden compartir nombre |
| **Un tutor por clase** | Restricción heredada de US05 |
| **Permisos: cualquier usuario del colegio** | `ADMIN` y `MEMBER` gestionan profesores (PRD §3.1) |
| **Cargo informativo** | Director y jefe de estudios son un dato del profesor, no un permiso |
| **Transacción atómica** | INSERT profesor + INSERT professor_subjects en una transacción, ROLLBACK si falla alguna |


---


## 6. Tickets de Trabajo


> **Nota:** estos tickets son anteriores a la división de US01 en partes y al stack actual (mencionan AdonisJS, Vine y Tailwind, y no incluyen el colegio). Se indica a qué parte corresponde cada uno; su contenido se revisará al abordar esa parte.

>### BE1 — Modelo de Datos y Migración (`users`) --> Corresponde a US01_b

**Objetivo:** Diseñar e implementar la tabla `users` vía migración AdonisJS, sentando la base de datos para el registro.

**Responsabilidades consolidadas:**

1. **Modelo de datos (Migración AdonisJS)**
   - Tabla `users`: 
     - PK: `id` (uuid)
     - `firstName` (string, 100 chars, A-Z a-z 0-9, acentos y caracteres del castellano y el valenciano, espacios, guiones, apóstrofos)
     - `lastName` (string, 100 chars, mismos caracteres)
     - `email` (string, 320 chars máx, **unique constraint**, stored lowercase)
     - `passwordHash` (string, Bcrypt output)
     - `status` (enum: `ACTIVE`, `SUSPENDED`, `DELETED`)
     - `createdAt`, `updatedAt` (timestamps)
   - Índice: `UNIQUE(email)`
   - Soft delete: `deletedAt` nullable

2. **Modelo ORM (AdonisJS Lucid)**
   - Crear modelo `User` con:
     - Relaciones (si hay; ej. hasMany `refresh_tokens`)
     - Métodos de validación o helpers si son reutilizables

**Flujo de la tarea:**
1. Crear migración de BD (tabla `users` con todos los campos y índices)
2. Crear modelo ORM `User` (AdonisJS Lucid)

---

<br>

>### BE2 — API de Registro (`POST /api/auth/register`)  --> Corresponde a US01_b (con los pasos de US01_d y US01_e)

**Objetivo:** Crear el endpoint REST que valida, hashea y persiste el usuario en la tabla `users` previamente creada.

**Responsabilidades consolidadas:**

1. **Endpoint REST**
   - Path: `POST /api/auth/register`
   - Request body:
     ```json
     {
       "firstName": "José",
       "lastName": "García-López",
       "email": "usuario@dominio.com",
       "password": "SecurePass123!",
       "reCaptchaToken": "token_from_v3_or_v2"
     }
     ```
   - Response (201 Created):
     ```json
     {
       "userId": "uuid",
       "accessToken": "jwt_15min",
       "refreshToken": "token_for_cookie"
     }
     ```
   - Error responses:
     - 400 (Bad Request): validación fallida → `{ errorCode, message }`
     - 409 (Conflict): email ya existe → `{ errorCode: "EMAIL_ALREADY_REGISTERED", message, action: "login_link" }`
     - 429 (Too Many Requests): rate limit superado → `{ errorCode: "RATE_LIMITED" }`
     - 422 (Unprocessable Entity): captcha fallido → `{ errorCode: "CAPTCHA_FAILED" }`

2. **Validación de payload (Vine schema)**
   - **firstName**: obligatorio, 1-100 chars, regex: `^[A-Za-z0-9áéíóúàèòïüçñÁÉÍÓÚÀÈÒÏÜÇÑ·\s\-']+$` (normalizar a Unicode NFC antes de validar)
   - **lastName**: obligatorio, 1-100 chars, mismos caracteres
   - **email**: obligatorio, RFC 5321 regex, máx. 320 chars
     ```regex
     ^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$
     ```
   - **password**: obligatorio, 8 caracteres a 72 bytes, debe contener: mayúscula + minúscula + número + símbolo (`!@#$%^&*()_+-=[]{}|;:,.<>?`)
   - **reCaptchaToken**: obligatorio (string no vacío)

3. **Hashing de contraseña**
   - Algoritmo: **Bcrypt** con cost factor 12 (o dinámico según carga CPU)
   - Librería: `bcrypt` o `argon2` (definir según stack base-standards.md)
   - Nunca almacenar contraseña en texto plano

4. **Manejo de email duplicado (CA3, riesgo de enumeración aceptado)**
   - Orden obligatorio: rate limit → reCAPTCHA → validación del payload → comprobación de email → alta.
   - La comprobación usa el email ya normalizado (`trim()` + minúsculas) y excluye los usuarios borrados (`deletedAt IS NULL`).
   - Si existe: `409` con `{ errorCode: "EMAIL_ALREADY_REGISTERED", message: "Este email ya está registrado", action: "login_link" }` y log `USER_REGISTER_DUPLICATE`.
   - La violación de la restricción `UNIQUE` de la base de datos (registros simultáneos) se traduce a la misma respuesta `409`.

5. **Timeout HTTP**
   - Configurar: **10 segundos** en el middleware de timeout del backend

**Flujo de la tarea:**
1. Crear schema de validación (Vine)
2. Crear controller `AuthController::register()`
3. Registrar ruta `POST /api/auth/register`
4. Implementar lógica de validación contra esquema
5. Implementar hashing de contraseña y persistencia
6. Implementar respuestas de error según códigos especificados
7. Verificar timeout HTTP 10s configurado

--- 

<br>
 
>### FE1 — Formulario de Registro e Integración reCAPTCHA --> Corresponde a US01_b, US01_c, US01_e y US01_f

**Objetivo:** Crear interfaz de registro con validación en tiempo real, reCAPTCHA v3+v2, y manejo de errores.

**Responsabilidades consolidadas:**

1. **Componente de Formulario**
   - Path: `src/components/AuthRegisterForm.tsx` (o .jsx)
   - Campos controlados (React state):
     - `firstName` (string)
     - `lastName` (string)
     - `email` (string)
     - `password` (string)
   - Botón "Registrarse" con estado `loading` (deshabilitado mientras se procesa)
   - Validación en tiempo real (on blur/change):
     - Mostrar errores inline bajo cada campo
     - Estilos: `aria-describedby` + `role="alert"` para accesibilidad
     - Mensajes dinámicos según error (email inválido, contraseña débil, etc.)

2. **Integración reCAPTCHA v3 + Fallback v2**
   - Librería: `@react-google-recaptcha/react` o similar
   - v3 (transparente, automático):
     - Script de Google en `<head>` o componente wrapper
     - Generar token en `handleSubmit()` automáticamente
     - Score retornado desde Google (no visible al usuario)
   - Fallback v2 (checkbox explícito):
     - Si v3 retorna score < 0.6, renderizar challenge v2
     - Usuario marca checkbox "No soy un robot"
     - Solo si v2 completado, proceder con envío

3. **Validación de Formulario (Espejo del Backend)**
   - Regex email RFC 5321 (JavaScript)
   - Reglas de contraseña: 8 caracteres a 72 bytes, mayúscula+minúscula+número+símbolo
   - Mostrar indicador visual de fortaleza de contraseña (ej: barra roja/amarilla/verde)
   - Errores inline:
     - Email: "Formato de email inválido"
     - Contraseña: "La contraseña debe tener entre 8 y 72 caracteres (los acentos y los símbolos especiales cuentan por más de uno)"
     - Contraseña débil: "La contraseña debe contener mayúscula, minúscula, número y símbolo"

4. **Bloqueo de Envíos Duplicados (CSRF + Idempotencia)**
   - Generar token único por sesión: `sessionStorage.setItem('formToken', uuid())`
   - Incluir en cada envío: `{ ..., _token: formToken }`
   - Backend valida: si mismo token en < 1 segundo, rechazar 400
   - Frontend desabilita botón mientras se procesa (no permitir re-envío)

5. **Detección de Cookies Deshabilitadas**
   - Test: intentar escribir en cookie antes de enviar
   - Si falla: mostrar `<Alert role="alert" aria-live="polite">Las cookies son necesarias para mantener la sesión.</Alert>`
   - No bloquear registro, solo advertencia

6. **Manejo de Respuestas y Redirección**
   - Éxito (201):
     - Guardar `accessToken` en memory (estado global o Context)
     - Guardar `refreshToken` en cookie (ya viene del servidor, solo confirmar)
     - Redirigir a `/welcome` (US04)
   - Errores:
     - 400 (validación): mostrar en alert rojo general o inline
     - 409 (email duplicado): "Este email ya está registrado. [Ir a login]"
     - 429 (rate limit): "Demasiados intentos. Intenta de nuevo en 15 minutos."
     - 422 (captcha fallido): "Verificación fallida. Intenta de nuevo."

7. **Estilos y Responsive**
   - Framework: Tailwind v4 + shadcn/ui (según stack)
   - Mobile-first: layout responsive (sm, md, lg breakpoints)
   - Contraste WCAG 2.1 AA mínimo

**Flujo de la tarea:**
1. Crear componente `AuthRegisterForm.tsx`
2. Setup reCAPTCHA (cargar script, provider wrapper)
3. Implementar validaciones en tiempo real
4. Conectar con `POST /api/auth/register`
5. Manejar respuestas y errores según códigos
6. Agregar estilos y responsive
7. Verificar accesibilidad (WCAG 2.1 AA)

---

## 7. Pull Requests

Cada historia se entrega en una pull request propia desde una rama `feature/<historia>` hacia `main`. La PR pasa «Lint, tests y build» y «E2E con Cypress»; al integrarla se despliega en producción y, una vez comprobado el despliegue, otra PR pequeña archiva el cambio de OpenSpec, añade el informe de producción y sincroniza las specs. Estas son las PR de funcionalidad integradas hasta ahora (la lista completa está en [GitHub](https://github.com/kiketon007/CalendarSchool/pulls?q=is%3Apr+is%3Amerged)):

| PR | Cambio |
|---|---|
| [#2](https://github.com/kiketon007/CalendarSchool/pull/2) | Arranque del proyecto (US00) |
| [#12](https://github.com/kiketon007/CalendarSchool/pull/12) | Contrato del registro y tipos de la API generados (US01_a) |
| [#18](https://github.com/kiketon007/CalendarSchool/pull/18) | Alta atómica de colegio y usuario administrador (US01_b) |
| [#19](https://github.com/kiketon007/CalendarSchool/pull/19) | Sesión iniciada tras el registro (US01_c) |
| [#20](https://github.com/kiketon007/CalendarSchool/pull/20) | Límite de intentos de registro por IP (US01_d) |
| [#21](https://github.com/kiketon007/CalendarSchool/pull/21) | Verificación de reCAPTCHA en el registro (US01_e) |
| [#22](https://github.com/kiketon007/CalendarSchool/pull/22) | Conservar el formulario de registro y evitar envíos repetidos (US01_f) |
| [#23](https://github.com/kiketon007/CalendarSchool/pull/23) | Despliegue en AWS con CDK y despliegue continuo |
| [#31](https://github.com/kiketon007/CalendarSchool/pull/31) | Consentimiento, /privacidad, CSP y purga de intentos |
| [#35](https://github.com/kiketon007/CalendarSchool/pull/35) | Inicio de sesión con límite de intentos fallidos y reCAPTCHA (US02) |
| [#36](https://github.com/kiketon007/CalendarSchool/pull/36) | Abrir /api/auth/* en producción (registro y login) |
| [#40](https://github.com/kiketon007/CalendarSchool/pull/40) | Cierre de sesión (US03) |
| [#43](https://github.com/kiketon007/CalendarSchool/pull/43) | Usuarios del colegio y endpoints protegidos (US02_b1) |
| [#47](https://github.com/kiketon007/CalendarSchool/pull/47) | Gestión de usuarios del colegio: rol, baja y reactivación (US02_b2) |
| [#49](https://github.com/kiketon007/CalendarSchool/pull/49) | Generar, listar y revocar invitaciones (US02_b3) |
| [#52](https://github.com/kiketon007/CalendarSchool/pull/52) | Aceptar una invitación y crear la cuenta (US02_b4) |
| [#55](https://github.com/kiketon007/CalendarSchool/pull/55) | Restablecer la contraseña con un enlace del administrador (US02_c) |
| [#58](https://github.com/kiketon007/CalendarSchool/pull/58) | Pantalla de bienvenida definitiva (US04) |
| [#62](https://github.com/kiketon007/CalendarSchool/pull/62) | Crear un curso con sus clases y listar los cursos (US05) |
| [#65](https://github.com/kiketon007/CalendarSchool/pull/65) | Listado de cursos con tabla, tarjetas y búsqueda (US06) |
| [#68](https://github.com/kiketon007/CalendarSchool/pull/68) | Editar un curso y sus clases (US07) |
| [#71](https://github.com/kiketon007/CalendarSchool/pull/71) | Borrar un curso con sus clases (US08) |
| [#74](https://github.com/kiketon007/CalendarSchool/pull/74) | Crear y listar profesores con la clase que tutorizan (US09) |
| [#77](https://github.com/kiketon007/CalendarSchool/pull/77) | Elegir el tutor de cada clase desde la edición del curso (US09_b) |
| [#80](https://github.com/kiketon007/CalendarSchool/pull/80) | Total, tutoría y paginación en el listado de profesores (US10) |
| [#82](https://github.com/kiketon007/CalendarSchool/pull/82) | Buscar profesores por nombre y apellidos (US11) |
| [#84](https://github.com/kiketon007/CalendarSchool/pull/84) | Leer y editar un profesor (US12) |
| [#86](https://github.com/kiketon007/CalendarSchool/pull/86) | Borrar un profesor (US13) |
| [#88](https://github.com/kiketon007/CalendarSchool/pull/88) | Crear un alumno y listarlos (US14) |
| [#90](https://github.com/kiketon007/CalendarSchool/pull/90) | Alumnos en los cursos y confirmación al quitar una clase con alumnos (US14_b) |
| [#92](https://github.com/kiketon007/CalendarSchool/pull/92) | Total, paginación, búsqueda y filtros en el listado de alumnos (US15) |
| [#94](https://github.com/kiketon007/CalendarSchool/pull/94) | Editar un alumno (US17) |
