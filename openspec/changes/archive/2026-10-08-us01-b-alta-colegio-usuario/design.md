## Context

US00 dejó el esqueleto (Express 5, Prisma 7, Zod, pino, React 19) con un único endpoint, `GET /api/health`, y sin tablas. US01_a dejó el contrato de `POST /api/auth/register` en `docs/api-spec.yml` y la generación de tipos del frontend. US01_b implementa los pasos 3 a 5 del orden de procesamiento (validación → unicidad → alta); el límite de intentos (paso 1) y el captcha real (paso 2) llegan con US01_d y US01_e, y la sesión con US01_c.

Restricciones que condicionan el diseño:

- `createApp()` recibe todas sus dependencias y no lee `process.env`; solo `server.ts` es raíz de composición.
- Cobertura mínima del 90 % en backend y del 80 % en frontend; `server.ts` y `main.tsx` no pueden contener lógica.
- Cualquier cambio de API empieza en `docs/api-spec.yml`; un código de error nuevo se añade a la vez al enum `ErrorCode` y a `ERROR_CODES` (`appError.test.ts` lo comprueba).
- Las lambdas se despliegan después (`despliegue-aws`): el hash debe funcionar en AWS Lambda y la IP del cliente puede llegar en `X-Forwarded-For`.
- El modelo de datos de `MODELO_DATOS.md` (`municipalities`, `schools`, `users`) ya está diseñado; este cambio lo implementa.

## Goals / Non-Goals

**Goals:**

- Alta atómica de colegio y usuario `ADMIN`, con unicidad de email y de colegio por municipio también bajo concurrencia.
- Un único conjunto de reglas de validación por campo, probado con la misma tabla de ejemplos en backend y frontend.
- Dejar los puntos de extensión que usarán US01_c, US01_d y US01_e (puerto de captcha, orden de pasos) sin que tengan que reescribir el caso de uso.
- Aislamiento por colegio desde la primera tabla: `users.schoolId` obligatorio.

**Non-Goals:**

- Sesión, cookies y JWT (US01_c), rate limit (US01_d), reCAPTCHA real (US01_e), resiliencia del formulario (US01_f), `access_links` e invitaciones (US02_b).
- Verificación de email y prueba de carga de 1000 registros simultáneos.

## Decisions

### D1. Estructura DDD por capas

| Capa | Pieza | Responsabilidad |
|---|---|---|
| `domain/school` | `normalizeSchoolName`, `School` | Normalización del nombre y entidad con sus invariantes |
| `domain/user` | `User`, `UserRole`, `UserStatus` | Entidad de usuario (rol `ADMIN`, estado `ACTIVE`) |
| `domain/registration` | `RegistrationRepository` (puerto) | `existsUserByEmail`, `existsSchool`, `createSchoolWithAdmin` (atómico) |
| `application/registration` | `RegisterSchool` (caso de uso), `registerSchoolRequest` (Zod), puertos `PasswordHasher`, `IdGenerator`, `CaptchaVerifier` (con los errores `CaptchaFailed` y `CaptchaChallengeRequired`) | Orquesta captcha → validación → unicidad → alta; registra los eventos |
| `domain/municipality` | `Municipality`, puerto `MunicipalityRepository` | Entidad y puerto de consulta (`findAll`, `findByCode`), como el resto de repositorios |
| `application/municipality` | `ListMunicipalities` | Listado de municipios |
| `infrastructure/prisma` | `PrismaRegistrationRepository`, `PrismaMunicipalityRepository` | Transacción, mapeo de violaciones de unicidad |
| `infrastructure` | `bcryptPasswordHasher`, `uuidV7IdGenerator`, `acceptAllCaptchaVerifier` | Adaptadores de los puertos |
| `presentation/auth`, `presentation/municipality` | routers | HTTP: contexto de la petición (IP, user agent), traducción a respuestas |

`AppDependencies` incorpora `registerSchool` y `listMunicipalities` ya construidos por `server.ts`; los tests de `app.test.ts` inyectan dobles y los `*.int.test.ts` usan Prisma real. El dominio no importa nada de Prisma ni de Express.

*Alternativa descartada:* poner la lógica en el router o en un servicio único con Prisma directo. Rompería la regla de dependencias y haría imposible sustituir el captcha o probar sin base de datos.

### D2. Unicidad: comprobar antes y confiar en la base de datos

El caso de uso comprueba primero el email y después el colegio (el orden fija qué `409` se devuelve cuando ambos existen) y a continuación crea ambos registros. Esa comprobación solo da el mensaje correcto en el caso habitual: las garantías reales son los índices `UNIQUE(users.email)` y `UNIQUE(schools.normalizedName, schools.municipalityCode)`. Si la inserción falla por violación de unicidad (`P2002`), el repositorio inspecciona el campo que provocó el error y lanza el error de dominio `EmailAlreadyRegistered` o `SchoolAlreadyRegistered`, que el caso de uso propaga como el mismo `409` que la comprobación previa.

- La alta usa `$transaction` de Prisma en su forma por lote (`$transaction([crear colegio, crear usuario])`): ambas sentencias se ejecutan en una única transacción, en ese orden, y cualquier error revierte las dos. No se necesita la forma interactiva porque el usuario no depende de ningún dato que devuelva la inserción del colegio (los identificadores los asigna la aplicación, D6).
- Si dos peticiones chocan en ambos campos a la vez, vale cualquiera de las dos respuestas `409`; solo se garantiza que exista un único registro.

*Alternativa descartada:* bloqueo con `SELECT … FOR UPDATE` o `SERIALIZABLE`: añade complejidad y reintentos sin ganar nada sobre el índice único.

### D3. Normalización del nombre del colegio

`normalizedName` = NFD → quitar marcas combinantes (`\p{M}`) → minúsculas → conservar solo `[a-z0-9]`. Se descarta cualquier otro carácter, incluidos `º`, `ª` y `·`, que no son letras ASCII tras la descomposición: así «C.E.I.P. Nº 3» y «ceip n 3» producen `ceipn3`, como exige la historia. La función vive en `domain/school` y se calcula en el servidor; el cliente no la envía. `ñ` y `ç` se reducen a `n` y `c` (consecuencia aceptada de «quitar diacríticos»).

*Alternativa descartada:* `NFKD` o conservar `\p{L}\p{N}`: `º` se convertiría en `o` o se conservaría, y los dos ejemplos de la historia dejarían de coincidir.

### D4. Validación única por campo con Zod

El esquema Zod de `application/registration` es la única definición de las reglas del backend, y devuelve `{ field, code }` por cada campo inválido (un error por campo, sin abortar en el primero) mediante un `ValidationError` de aplicación con `details`. El manejador de errores común se amplía para serializarlo como `400 VALIDATION_ERROR` con `details`, según `ValidationErrorResponse` del contrato. Las propiedades desconocidas del cuerpo (como `captcha`, que verifica otro paso) se ignoran en lugar de rechazarse: la historia no define un código de error para ellas, y así un cliente que añada campos no recibe un `400` inesperado. El contrato lo refleja sin `additionalProperties: false` en `RegisterRequest`.

El frontend reimplementa las mismas reglas en un módulo propio (el frontend no importa código del backend). Para que no diverjan, ambos recorren la misma tabla de casos válidos e inválidos, guardada en `test-fixtures/registration-fields.json` en la raíz del repositorio y leída por Vitest en los dos workspaces. La tabla incluye los ejemplos de la historia (NFD, `º`, `localhost`, IP, contraseñas sin variedad).

*Alternativa descartada:* un paquete compartido `packages/validation`. Obligaría a añadir un workspace y su build al esqueleto de US00 por un único conjunto de reglas; la tabla compartida da la misma garantía con menos infraestructura. Se reconsiderará si las reglas compartidas crecen (login, invitaciones).

### D5. Hash de contraseñas

`@node-rs/bcrypt` con cost 12. Calcula el hash en el threadpool de libuv (no bloquea el event loop), publica binarios precompilados para `linux-x64-gnu` y `linux-arm64-gnu` (los de Lambda) y no necesita `node-gyp` ni scripts de instalación, lo que evita ampliar `allowScripts` de npm 11. El puerto `PasswordHasher` aísla la librería.

*Alternativas descartadas:* `bcrypt` (módulo nativo con script de instalación y riesgo de binario incorrecto en Lambda) y `bcryptjs` (JavaScript puro: con cost 12 ocupa el hilo principal ~250 ms por registro). Argon2 queda fuera porque la historia fija Bcrypt.

**Límite de la contraseña: 72 bytes.** Bcrypt solo usa los primeros 72 bytes y `@node-rs/bcrypt` trunca el resto en silencio, lo que haría equivalentes dos contraseñas que solo difieren después. En lugar de truncar, la validación rechaza (`INVALID_LENGTH`) las contraseñas de más de 72 bytes en UTF-8, medidos con `TextEncoder`, y el adaptador pasa `rejectLongPasswords: true` como segunda barrera. La historia (US01_b, US02_c) y el contrato (`maxLength: 72`) pasan del máximo de 128 caracteres a este límite. *Alternativas descartadas:* aceptar el truncado (la contraseña real dependería del hash, no de lo que el usuario cree haber elegido) y un pre-hash con SHA-256 antes de Bcrypt (mantendría los 128 caracteres, pero cambia el algoritmo fijado por la historia y obliga a que cada flujo de login lo repita).

La prueba de carga de 1000 registros simultáneos queda aplazada hasta el entorno desplegado (US00_b), donde se validará esta elección.

### D6. Identificadores UUIDv7

El puerto `IdGenerator` lo implementa la librería `uuid` (`v7()`), y los identificadores se asignan en el caso de uso, no en la base de datos. El esquema Prisma declara `id String @id @db.Uuid` sin valor por defecto.

*Alternativa descartada:* `@default(uuid(7))` de Prisma o `uuidv7()` de PostgreSQL 18: funcionarían, pero el identificador no sería conocido por el dominio antes de insertar y los tests dependerían de la base de datos.

### D7. Modelo de datos y migración

`schema.prisma` añade `Municipality`, `School` y `User` con los enums `UserRole` (`ADMIN`, `MEMBER`) y `UserStatus` (`ACTIVE`, `SUSPENDED`, `DELETED`), tal como figuran en `MODELO_DATOS.md`. Los modelos se mapean a tablas en `snake_case` plural (`@@map`). Índices: PK de cada tabla, `UNIQUE(users.email)`, `UNIQUE(schools.normalized_name, schools.municipality_code)`, `IX(users.school_id)` e `IX(municipalities.name)`.

La migración la genera `prisma migrate dev` y se completa a mano con el `INSERT` de los 542 municipios. El SQL de la carga se genera con un script puntual a partir de la relación oficial del INE (código de provincia + código de municipio, sin dígito de control) y queda anotada la fuente y la fecha en un comentario de la migración. No se usa un seed: las migraciones deben dejar la base lista, también en CI y en producción.

*Alternativa descartada:* `prisma db seed`: no se ejecuta con `migrate deploy` y dejaría producción sin municipios.

### D8. `GET /api/municipalities`

Un caso de uso trivial (`ListMunicipalities`) y un router que añade `Cache-Control: public, max-age=86400`. El listado se ordena por nombre en la aplicación (`localeCompare` en castellano) y no en la consulta, porque la intercalación de PostgreSQL depende de cómo se creó la base de datos y los nombres llevan acentos y dos formas oficiales. La validación del registro comprueba la existencia del código con el mismo repositorio, de modo que la tabla es la única fuente de verdad. Con unos 542 registros no se pagina.

### D9. Captcha provisional y orden de pasos

`RegisterSchool.execute` ejecuta, en este orden, `captchaVerifier.verify` → validación → email → colegio → alta. El adaptador `acceptAllCaptchaVerifier` acepta cualquier token; US01_e lo sustituye en `server.ts` sin tocar el caso de uso. US01_d insertará el rate limit como middleware previo en el router. El frontend envía `{ version: 'v3', token: 'provisional' }`.

### D10. Logs y datos personales

El caso de uso recibe un `RequestContext` (`ip`, `userAgent`) del router y registra los eventos a través del puerto `ApplicationLogger`, que se amplía con `info`. Los eventos llevan `event`, `email` enmascarado (`maskEmail`: primer carácter + `***` + dominio), `ip` y `user_agent`; `USER_REGISTER_DUPLICATE` añade `reason`. `createLogger` configura `redact` de pino (`password`, `*.password`, `passwordHash`, `*.passwordHash`) como defensa en profundidad: la contraseña nunca se pasa al logger. La IP se toma de `req.ip`; cómo se deriva detrás de CloudFront (`X-Forwarded-For`) lo decide US01_d.

### D11. Frontend

Página `RegisterPage` en `pages/`, montada en `/registro` por `App.tsx`, con los componentes del formulario en `components/`. Un servicio de API (`services/registrationService.ts`, con `fetch`, sin añadir axios) usa los tipos generados de `schema.ts` e interpreta la respuesta por `error.code` en un resultado con estado (`created`, `validation`, `emailAlreadyRegistered`, `schoolAlreadyRegistered`, `unexpected`). Las reglas de validación viven en `validation/registrationValidation.ts` y la tabla de ejemplos compartida se lee desde `testSupport/`, excluido de la cobertura. El estado del formulario son hooks locales; los errores se traducen con la clave `registration.errors.<campo>.<código>` y los del servidor se copian bajo el campo indicado en `details`. La carga de la lista (con estado `loading`, `ready` o `error` y reintento) está en el hook `useMunicipalities`, y la página impide enviar el formulario mientras no esté lista. El buscador de municipios es un campo de texto con lista filtrada sin acentos ni mayúsculas (WAI-ARIA combobox) que solo da por seleccionado un municipio elegido de la lista; el filtrado es en cliente, sobre la lista cacheable completa. Tras el `201` se muestra el mensaje de confirmación en la misma página (US01_c lo sustituirá).

*Alternativa descartada:* librería de formularios (react-hook-form, Formik): para seis campos la validación propia, compartida con la tabla de casos, es más sencilla y no añade dependencia.

### D12. Base de datos no disponible

El contrato declara `503 DATABASE_UNAVAILABLE` para el registro y para el listado de municipios. Los repositorios Prisma traducen los fallos de conexión (códigos `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND` y `P1000`, `P1001`, `P1002`, `P1008` y `P1017`, que son los que Prisma 7 con el adaptador de PostgreSQL devuelve al no poder conectar) al error de aplicación `DatabaseUnavailable`, y el manejador central lo responde con `503` y registra la causa en el log, sin exponerla en la respuesta. Se hace en el repositorio y no en el manejador para que la capa de presentación no conozca Prisma.

*Alternativa descartada:* reconocer los errores de Prisma en `errorHandler`: acoplaría la presentación a la infraestructura. Una extensión del cliente (`$extends`) que traduzca todas las consultas también cambiaría el tipo del cliente que usan los tests.

### D13. Datos de los E2E

`scripts/e2e.mjs` vacía todas las tablas de `public` salvo `_prisma_migrations` y `municipalities` con un `TRUNCATE … CASCADE` tras migrar y antes de arrancar el backend, con la misma salvaguarda de nombre `_test` que `resetDatabase()`. Se vacía al comenzar, no al terminar, para conservar los datos de una ejecución fallida. `resetDatabase()` de los tests de integración también debe conservar `municipalities`: es dato fijo, no dato de test.

## Risks / Trade-offs

- **[Enumeración de emails y de colegios, y ocupación del nombre de un colegio]** → Riesgos aceptados por la historia. Se acotan con el orden de pasos (las consultas ocurren tras el rate limit y el captcha, aún por llegar) y con `USER_REGISTER_DUPLICATE`. Hasta US01_d y US01_e el endpoint no debe publicarse en producción.
- **[Cost 12 consume CPU]** → Hilo del threadpool, no el event loop. La capacidad real se mide en la prueba de carga aplazada; si no cumple, se ajusta la memoria de la Lambda, no el cost.
- **[Bcrypt solo usa los primeros 72 bytes de la contraseña]** → El máximo de la contraseña es de 72 bytes en UTF-8 (D5), no de 128 caracteres, de modo que nunca se trunca en silencio. Consecuencia: una contraseña con acentos o símbolos fuera de ASCII admite menos de 72 caracteres, y el mensaje de error lo explica. El inicio de sesión (US02) y el restablecimiento (US02_c) deben aplicar el mismo límite.
- **[Binario nativo de `@node-rs/bcrypt` en Lambda]** → Se verifica que el paquete publica el binario de la arquitectura elegida al desplegar (`despliegue-aws`); el puerto permite cambiar a otra librería sin tocar el caso de uso.
- **[Municipios desactualizados]** → Los municipios cambian rara vez; se actualizan con una migración nueva. Se anota la fuente en la migración.
- **[Reglas duplicadas en backend y frontend]** → Mitigado por la tabla de casos común; un cambio de regla sin actualizarla rompe ambos suites.
- **[`resetDatabase()` y `municipalities`]** → Si vaciara también esa tabla, los tests de integración perderían los datos de referencia; se excluye explícitamente y se prueba.
- **[Colegio normalizado agresivo]** → «CEIP 3» y «C.E.I.P.3» colisionan, y `ñ`/`n` también. Es el comportamiento pedido; la colisión da soporte manual, no pérdida de datos.

## Migration Plan

1. Crear la migración (tablas, enums, índices y carga de municipios) y aplicarla con `npm run db:migrate`; nunca es implícito.
2. Regenerar el cliente Prisma (`postinstall`) y los tipos del frontend (`npm run api:types -w frontend`).
3. Desplegar backend y frontend a la vez; el frontend depende de `GET /api/municipalities`.
4. **Rollback:** revertir el código; la migración es solo aditiva (tablas nuevas), así que puede quedarse sin efecto en el comportamiento anterior. Eliminar las tablas requeriría una migración manual inversa y solo es aceptable mientras no haya datos reales.

## Open Questions

- **Fuente del listado del INE:** hay que descargar la relación oficial vigente y comprobar que suma 542 municipios (141 + 135 + 266); si el INE publica una cifra distinta, se actualizan las especificaciones.
- **Ubicación de la tabla de casos compartida (resuelta en la tarea 0.3):** `test-fixtures/` en la raíz se importa sin problemas desde Vitest y `tsc` de ambos workspaces (`import … with { type: 'json' }` en el backend, NodeNext) y no afecta al build del backend, que solo compila `src/` sin tests.
