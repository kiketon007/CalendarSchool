# CalendarSchool: Diccionario de Datos Completo (v2.1 Refinada)

> **⚠️ Estado (2026-10-08):** este diccionario describe la versión 2.1, diseñada para MySQL y sin aislamiento por colegio. Se mantiene como referencia funcional mientras el modelo se migra **de forma incremental** a PostgreSQL 17 + Prisma: cada historia añade sus tablas en `backend/prisma/schema.prisma` y actualiza aquí la sección correspondiente.
>
> Decisiones ya tomadas que este documento aún no refleja:
> - Las raíces de agregado (`courses`, `rooms`, `professors`, `subjects`, `students`, `calendars`, `restrictions`) llevan `school_id`, y la unicidad de códigos y nombres pasa a ser por colegio. El Módulo 1 ya refleja `schools` y `users`.
> - **Ya implementadas en `backend/prisma/schema.prisma`**: `municipalities`, `schools` y `users` (US01_b, migración `20261008142315_add_municipalities_schools_users`) `refresh_tokens` (US01_c, migración `20261009104834_add_refresh_tokens`) y `rate_limit_attempts` (US01_d, migración `20261009211202_add_rate_limit_attempts`). `access_links` (US02_b3, migración `20261017180747_add_access_links`; el `CHECK` y el índice único parcial están escritos a mano en el SQL, porque Prisma no los modela). La migración `20261015141957_drop_refresh_token_client_data` (cambio `inicio-sesion`, US02) borra de `refresh_tokens` las columnas `ip_address` y `user_agent`. `courses` y `classes` (US05, migración `20261019142532_add_courses_and_classes`). `professors` y `classes.tutor_id` (US09, migración `20261020142755_add_professors`). El resto de tablas sigue pendiente de migrar con su historia.
> - El cargo del profesor (`position`) ya está reflejado en `professors`.
> - **Calendario base (US-BASE, migración `20261023134046_add_calendars`)**: `calendars` y `sessions` se sustituyen por `calendars` y `calendar_periods` (solo la estructura semanal, sin fechas ni estado) y `courses` gana `calendar_id`. Ver el estado en las dos secciones.
> - **Asignaturas (US-SUBJECT, migración `20261026122302_add_subjects`; US-SUBJECT_b y US-SUBJECT_c, sin migraciones)**: `subjects` y `subject_courses` ya están implementadas y se pueden crear, ver, editar y borrar (el borrado es real y arrastra las filas de `subject_courses` por la cascada); `subject_standard_loads` desaparece, porque la carga semanal de cada curso vive en `subject_courses.sessions_per_week`. **US19 (sin migraciones)** añade un segundo camino de escritura sobre esa misma tabla: la carga horaria por curso (`PATCH /api/courses/{id}/workload`) crea, actualiza o borra solo las filas del curso que cambian (las actualizadas conservan `created_at`), con el mismo orden de bloqueo que la edición de una asignatura (asignaturas `FOR UPDATE` en orden de `id` y después el curso `FOR SHARE`). Las sesiones disponibles de un curso se calculan al leer: sesiones del calendario × 5, sin guardarlas. Ver el estado en las tres secciones.
>
> El DDL `MODELO_DATOS_SQL_DDAL.sql` está **obsoleto** (solo referencia histórica).

**Versión:** 2.1 (Con 10 mejoras aplicadas + control JWT)  
**Fecha:** 2026-08-03  
**Base de datos:** `flowschool`  
**Charset:** `utf8mb4`  
**Collation:** `utf8mb4_unicode_ci`

## Resumen Ejecutivo

Este documento describe el modelo de datos completo para CalendarSchool, aplicando 10 mejoras críticas y de alto impacto identificadas en el análisis de refinamiento. Los cambios mejoran:

- **Integridad referencial**: Relación calendars↔restrictions añadida (CRÍTICA)
- **Soft delete consistente**: Patrón implementado para profesores (CRÍTICA)
- **Auditoría completa**: Campos createdBy/updatedBy en 7 tablas (ALTA)
- **Detección de conflictos**: 7 vistas nuevas para análisis de horarios (ALTA)
- **Status tracking mejorado**: Enum refinado en schedule_entries (ALTA)
- **Validaciones de datos**: Triggers para tutores y eventos de soft delete (ALTA)

---

## 📋 Tabla de Contenidos

1. [Módulo 1: Colegios, usuarios y autenticación](#módulo-1-colegios-usuarios-y-autenticación)
   - municipalities, schools, users, access_links (diseño de 2026-10-08)
   - settings (v2.1), **refresh_tokens** (US01_c) — Control JWT
   - **rate_limit_attempts** (US01_d) — Límite de intentos
2. [Módulo 2: Cursos y Clases](#módulo-2-gestión-de-cursos-y-clases)
3. [Módulo 3: Profesores](#módulo-3-gestión-de-profesores)
4. [Módulo 4: Estudiantes](#módulo-4-gestión-de-estudiantes)
5. [Módulo 5: Configuración de Horarios](#módulo-5-configuración-de-horarios)
6. [Módulo 6: Restricciones](#módulo-6-restricciones-de-carga-horaria)
7. [Módulo 7: Horarios Generados](#módulo-7-horarios-generados)
8. [Vistas y Reportes](#vistas-y-reportes)
9. [Ejemplo de Datos](#ejemplo-de-datos)
10. [Queries Comunes](#queries-comunes)

---

## Módulo 1: Colegios, Usuarios y Autenticación

> **Diseño acordado el 2026-10-08** (PRD §3.1; US01_b, US02_b y US02_c), ya en PostgreSQL (17 en local, en CI y en Supabase, la misma versión mayor). Se implementa con esas historias, que lo confirman o ajustan al hacerlo. Sustituye a las tablas `roles`, `users` y `user_roles` de la v2.1: el rol es un atributo del usuario dentro de su colegio. `settings` sigue como en la v2.1 hasta que lo revise la historia que lo necesite; `refresh_tokens` ya está revisada por US01_c (`userId` es UUID, el token se guarda con SHA-256 y la revocación es `revokedAt`).
>
> Los identificadores son **UUIDv7** (ordenados por tiempo, generados por la aplicación). Las fechas son `TIMESTAMPTZ`.
>
> **Estado de implementación (2026-10-18):** `municipalities`, `schools` y `users` están implementadas (US01_b) `refresh_tokens` (US01_c) y `rate_limit_attempts` (US01_d). `access_links` está implementada desde el cambio `us02-b3-invitaciones` (2026-10-18: lo usan las invitaciones) y la usan también los restablecimientos desde `us02-c-restablecer-contrasena` (2026-10-19) y `settings` sigue como diseño. El cambio `publicacion-registro` (2026-10-14) añade a `users` la aceptación de la política de privacidad (`privacyPolicyAcceptedAt` y `privacyPolicyVersion`) y fija la conservación de `rate_limit_attempts`. El cambio `inicio-sesion` (2026-10-15) quita de `refresh_tokens` la IP y el user agent del cliente y hace que el login use `rate_limit_attempts` con la clave `login:<ip>`. En las tablas se usa el nombre del atributo del modelo Prisma (camelCase); en la base de datos las tablas son plurales y las columnas van en `snake_case` (`normalizedName` → `normalized_name`, `schoolId` → `school_id`, `passwordHash` → `password_hash`).

### 📊 municipalities

**Descripción:** Municipios de la Comunitat Valenciana, según la relación oficial del INE. Son datos fijos que se cargan con la propia migración (542 municipios: 141 de Alicante, 135 de Castellón y 266 de Valencia; fuente: INE, relación a 1 de enero de 2026, sin dígito de control). Los usa la validación del registro y el endpoint público `GET /api/municipalities` (US01_b). Para actualizarlos se añade una migración nueva. `resetDatabase()` de los tests y la limpieza del E2E no vacían esta tabla.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `code` | CHAR(5) | PK | Código INE del municipio (2 dígitos de provincia + 3 de municipio) |
| `name` | VARCHAR(100) | NOT NULL | Nombre oficial, que puede tener dos formas (p. ej. "Alacant/Alicante") |
| `province` | VARCHAR(30) | NOT NULL | Provincia, tal como la nombra el INE (p. ej. "Alicante/Alacant") |

**Índices:**
- PK: `code`
- IX: `name` (buscador del formulario)

---

### 📊 schools

**Descripción:** Colegios. Cada colegio aísla sus datos de los de los demás.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | UUID | PK | Identificador (UUIDv7) |
| `name` | VARCHAR(150) | NOT NULL | Nombre tal como lo escribe el usuario |
| `normalizedName` | VARCHAR(150) | NOT NULL | Nombre en minúsculas, sin acentos ni diacríticos y solo con letras y dígitos ASCII (US01_b): «C.E.I.P. Nº 3» y «ceip n 3» dan `ceipn3`. Lo calcula la aplicación |
| `municipalityCode` | CHAR(5) | NOT NULL, FK → municipalities.code | Municipio del colegio |
| `createdAt` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Timestamp de creación |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | Timestamp de actualización |

**Índices:**
- PK: `id`
- UNIQUE: (`normalizedName`, `municipalityCode`) — un colegio es único por nombre y municipio (`409 SCHOOL_ALREADY_REGISTERED`; en PostgreSQL, `schools_normalized_name_municipality_code_key`)

---

### 📊 users

**Descripción:** Usuarios con cuenta en CalendarSchool. Cada usuario pertenece a un único colegio. No están vinculados a una ficha de profesor.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | UUID | PK | Identificador (UUIDv7) |
| `schoolId` | UUID | NOT NULL, FK → schools.id | Colegio del usuario |
| `email` | VARCHAR(320) | UNIQUE, NOT NULL | Email normalizado (`trim()` y minúsculas), único en todo el sistema |
| `passwordHash` | VARCHAR(60) | NOT NULL | Hash Bcrypt (cost 12). La contraseña admite de 8 caracteres a 72 bytes en UTF-8, el máximo que usa Bcrypt |
| `firstName` | VARCHAR(100) | NOT NULL | Nombre |
| `lastName` | VARCHAR(100) | NOT NULL | Apellidos |
| `role` | ENUM | NOT NULL | 'ADMIN', 'MEMBER' (PRD §3.1) |
| `status` | ENUM | NOT NULL, DEFAULT 'ACTIVE' | 'ACTIVE', 'SUSPENDED' (dado de baja, reactivable; US02_b), 'DELETED' |
| `privacyPolicyAcceptedAt` | TIMESTAMPTZ | NULL | Instante en que el usuario aceptó la política de privacidad; el mismo instante del alta en el registro |
| `privacyPolicyVersion` | VARCHAR(20) | NULL | Versión del texto aceptado: la fecha `AAAA-MM-DD` de `PRIVACY_POLICY_VERSION`, que coincide con `privacyPolicy.lastUpdated` de `es.json` y `en.json` |
| `createdAt` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Timestamp de creación |
| `updatedAt` | TIMESTAMPTZ | NOT NULL | Timestamp de actualización |

**Índices:**
- PK: `id`
- UNIQUE: `email` (`409 EMAIL_ALREADY_REGISTERED`; en PostgreSQL, `users_email_key`)
- IX: `schoolId`
- CHECK: `users_privacy_policy_acceptance_check`, `(privacyPolicyAcceptedAt IS NULL) = (privacyPolicyVersion IS NULL)` (las dos columnas van juntas o no hay ninguna)

**Reglas (aplicación):**
- El usuario que registra el colegio es `ADMIN` (US01_b); el resto se incorpora con una invitación (US02_b).
- El registro exige `privacyPolicyAccepted: true` (`400 REQUIRED` en otro caso) y guarda la aceptación con la fecha y la versión vigentes en el backend; el cliente no envía la versión. Los usuarios que se incorporan por invitación (US02_b4) la aceptan al crear su cuenta, con la misma casilla, la fecha y la versión vigentes: también las tienen rellenas. Las columnas siguen admitiendo `NULL` porque el diseño original preveía aceptarla más tarde.
- Cada colegio tiene siempre al menos un `ADMIN` en estado `ACTIVE` (`409 LAST_ADMIN_REQUIRED`).
- Sin verificación de email en el MVP: no hay columna `verified`.

---

### 📊 access_links

**Descripción:** Enlaces de acceso de un solo uso que genera un administrador: invitaciones (US02_b) y restablecimientos de contraseña (US02_c). Solo se guarda el hash del token; el enlace completo se muestra una vez y no se puede recuperar.

**Estado:** implementada en `backend/prisma/schema.prisma` (modelo `AccessLink`, enum `AccessLinkPurpose`) con la migración `20261017180747_add_access_links`. En la base de datos la tabla es `access_links` y las columnas van en `snake_case` (`schoolId` → `school_id`, `tokenHash` → `token_hash`, `createdById` → `created_by_id`, `expiresAt` → `expires_at`, `usedAt` → `used_at`, `revokedAt` → `revoked_at`, `createdAt` → `created_at`). Se escriben invitaciones y restablecimientos: US02_b3 genera, lista y revoca las invitaciones, US02_b4 las acepta (fija `usedAt` y crea el usuario en la misma transacción) y US02_c genera, revoca, consulta y confirma los restablecimientos de contraseña (no hay migración nueva: reutiliza esta tabla).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | UUID | PK | Identificador (UUIDv7) |
| `schoolId` | UUID | NOT NULL, FK → schools.id | Colegio del enlace |
| `purpose` | ENUM | NOT NULL | 'INVITATION', 'PASSWORD_RESET' |
| `tokenHash` | CHAR(64) | UNIQUE, NOT NULL | SHA-256 del token (aleatorio, ≥ 128 bits); nunca el token |
| `role` | ENUM | NULL | Rol del invitado ('ADMIN', 'MEMBER'); obligatorio si `purpose` = 'INVITATION' |
| `userId` | UUID | NULL, FK → users.id | Usuario afectado; obligatorio si `purpose` = 'PASSWORD_RESET' |
| `createdById` | UUID | NOT NULL, FK → users.id | Administrador que generó el enlace |
| `expiresAt` | TIMESTAMPTZ | NOT NULL | Caducidad: `createdAt` + 72 horas |
| `usedAt` | TIMESTAMPTZ | NULL | Cuándo se usó |
| `revokedAt` | TIMESTAMPTZ | NULL | Cuándo se revocó |
| `createdAt` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Timestamp de creación |

**Índices y restricciones:**
- PK: `id`
- UNIQUE: `tokenHash`
- IX: (`schoolId`, `purpose`) — listas de invitaciones y restablecimientos pendientes
- CHECK: `role` obligatorio solo en invitaciones y `userId` obligatorio solo en restablecimientos
- UNIQUE parcial: (`userId`) WHERE `purpose` = 'PASSWORD_RESET' AND `usedAt` IS NULL AND `revokedAt` IS NULL — un solo restablecimiento pendiente por usuario (al generar otro, la aplicación revoca **todos** los abiertos del usuario, también los caducados que nadie revocó, porque el índice no mira `expiresAt` y un caducado sin revocar seguiría ocupándolo; si dos administradores generan a la vez y el índice rechaza al segundo, la aplicación reintenta una vez)
- FK: `schoolId`, `userId` y `createdById` con `ON DELETE RESTRICT`: no hay borrado en cascada de los enlaces

> **⚠️ SQL escrito a mano:** el `CHECK` (`access_links_purpose_fields_check`: una invitación lleva `role` y no `userId`; un restablecimiento, al revés) y el índice único parcial (`access_links_pending_reset_user_key`) están en el `migration.sql`, no en `schema.prisma`, porque Prisma no los modela. Un `prisma migrate dev` posterior puede proponer borrarlos: revisa siempre el SQL generado. Los prueba `accessLinksSchema.int.test.ts` con inserciones directas.

**Notas:**
- Un enlace es válido si `usedAt` y `revokedAt` son NULL y `expiresAt` > now(). Si no, responde `410 ACCESS_LINK_INVALID`. El estado nunca se guarda: `accessLinkStatus` lo deduce (usado → revocado → caducado → pendiente) y un enlace deja de valer en el instante exacto de `expiresAt`.
- Aceptar una invitación (`POST /api/invitations/accept`, público) ejecuta en una sola transacción un `UPDATE` de `usedAt` condicionado a «pendiente» y el `INSERT` del usuario `ACTIVE`, con el colegio y el rol del enlace. Con dos aceptaciones simultáneas, la segunda espera el bloqueo de la fila y, al volver a evaluar la condición, no actualiza nada (`410 ACCESS_LINK_INVALID`). Si el email ya existe (`users_email_key`), la transacción se deshace y el enlace sigue pendiente (`409`). Consultar el enlace (`POST /api/invitations/lookup`) no escribe nada.
- Las invitaciones pendientes de un colegio (`GET /api/invitations`) son las de `purpose` = 'INVITATION' sin usar, sin revocar y sin caducar, de la más reciente a la más antigua; incluyen las de administradores dados de baja y nunca devuelven el token ni su hash. Revocar (`POST /api/invitations/{id}/revoke`) es idempotente y un restablecimiento o el enlace de otro colegio dan `404`.
- Basta un hash rápido (SHA-256) porque el token es aleatorio y de alta entropía; no es una contraseña elegida por una persona.
- Marcar el enlace como usado y crear el usuario (o cambiar la contraseña) ocurren en la misma transacción, para que dos envíos simultáneos no lo usen dos veces.
- Confirmar un restablecimiento (`POST /api/password-resets/confirm`, público) ejecuta en una sola transacción: el `UPDATE` de `usedAt` condicionado a «pendiente», el cambio de `users.passwordHash` solo si el usuario sigue `ACTIVE` (si no, se deshace todo, enlace incluido, y responde `410`) y la revocación de todas las sesiones abiertas del usuario (`refresh_tokens.revokedAt`). Consultar el enlace (`POST /api/password-resets/lookup`) no escribe nada y solo sirve para un restablecimiento pendiente de un usuario `ACTIVE`; la respuesta lleva el email enmascarado.
- Un restablecimiento pendiente (no usado, no revocado y no caducado) se muestra en la lista de usuarios como `passwordResetPending`; el enlace de otro propósito o de otro colegio nunca cuenta.

---

### 📊 settings

**Descripción:** Configuración global del sistema.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `key` | VARCHAR(100) | PK | Clave configuración |
| `value` | TEXT | NOT NULL | Valor |
| `type` | VARCHAR(50) | NULL | Tipo: string, integer, boolean |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Última actualización |

**Ejemplos:**
- `schedule_algorithm`: 'CSP' (constraint satisfaction)
- `jwt_access_ttl`: 900 (segundos)
- `max_sessions_per_day`: 8

---

### 📊 refresh_tokens

**Descripción:** Refresh tokens de las sesiones, persistentes y con control de revocación (logout seguro, cambio de contraseña, etc.). Implementada en US01_c. El refresh token es un valor aleatorio de 256 bits que viaja en la cookie `refresh_token` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`); en la base de datos solo se guarda su hash.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | UUID | PK | UUIDv7 generado por la aplicación |
| `userId` | UUID | NOT NULL, FK → users.id (`ON DELETE CASCADE`) | Usuario propietario del token; sus tokens se borran con él |
| `tokenHash` | CHAR(64) | NOT NULL, UNIQUE | SHA-256 del token en hexadecimal (nunca el token en claro; con 256 bits de entropía no hace falta Bcrypt) |
| `expiresAt` | TIMESTAMPTZ | NOT NULL | Caducidad absoluta: creación + 24 horas. La sesión no se renueva ni se rota |
| `revokedAt` | TIMESTAMPTZ | NULL | Instante de la revocación (logout, US03; cambio de contraseña); nulo mientras el token es válido. Lo informa `POST /api/auth/logout` y no se vuelve a cambiar (la revocación es idempotente: una sesión ya revocada conserva su primer instante). Sustituye al booleano `isRevoked` de la v2.1 y dice además cuándo se revocó |
| `createdAt` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Cuándo se creó el token |

**Sin datos del cliente:** la tabla no guarda la IP ni el user agent de la sesión (las columnas `ip_address` y `user_agent` de la versión inicial se borraron en `20261015141957_drop_refresh_token_client_data`). Ninguna funcionalidad las leía y nada las purgaba, así que habrían conservado un dato personal mientras existiera la cuenta, más de lo que declara la política de privacidad. La IP y el user agent de una sesión solo quedan en los logs de actividad (30 días). Si una historia futura (p. ej. la lista de sesiones de US03) los necesita, se reintroducen junto con su purga y su línea en la política.

**Índices:**
- PK: `id`
- UNIQUE: `tokenHash` (validación rápida: se busca por igualdad)
- IX: `userId` (búsquedas por usuario)
- IX: `expiresAt` (limpieza futura de tokens caducados)

**Un token es utilizable** si existe, `revokedAt` es nulo, `expiresAt` es posterior al instante actual y su usuario está `ACTIVE`. La revocación prevalece sobre la caducidad al informar de la causa (solo en el log; al cliente se le responde siempre `401 INVALID_SESSION`).

**Casos de Uso (US01/US02/US03):**

1. **Alta de la primera sesión (US01_c):** el registro inserta el colegio, el usuario y su refresh token en la misma transacción; si falla cualquiera de las tres inserciones no se crea ninguna. **Inicio de sesión (US02):** `POST /api/auth/login` inserta un refresh token nuevo para el usuario (`PrismaRefreshTokenRepository.save`) y no toca los que ya tenía, de modo que un usuario puede tener varias sesiones a la vez.

2. **Renovación (`POST /api/auth/refresh`, US01_c):**
   ```sql
   SELECT rt.*, u.status
   FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
   WHERE rt.token_hash = sha256(token_de_la_cookie);
   -- La aplicación comprueba revoked_at IS NULL, expires_at > now() y u.status = 'ACTIVE'.
   -- Si no se cumple → 401 INVALID_SESSION. No se rota el token ni se amplía su caducidad.
   ```

3. **Logout seguro (`POST /api/auth/logout`, US03):** revoca solo la sesión de la cookie, sin borrarla, y solo si aún era válida:
   ```sql
   UPDATE refresh_tokens SET revoked_at = now()
   WHERE id = :id AND revoked_at IS NULL;  -- el id sale de buscar token_hash = sha256(token_de_la_cookie)
   ```
   Es atómico (dos cierres simultáneos no se pisan) e idempotente: sin cookie, con un token desconocido, ya revocado o caducado no cambia nada y responde igualmente `204`. Las demás sesiones del usuario siguen válidas. Si la base de datos no responde, el cierre falla con `503` y la cookie no se borra.

   **El `id` de esta fila es el `sid` del access token** (US03): `POST /api/auth/refresh` lo firma en el JWT, y el middleware de los endpoints protegidos (llega con el primero) leerá esta fila por clave primaria en cada petición y rechazará el token si `revoked_at` está informado, la sesión ha caducado o el usuario no está `ACTIVE`.

4. **Logout forzado por admin o cambio de contraseña (US02/US03):**
   ```sql
   UPDATE refresh_tokens SET revoked_at = now()
   WHERE user_id = :userId AND revoked_at IS NULL;  -- Todos los tokens del usuario
   ```

5. **Limpieza futura (tarea programada, fuera de US01_c):**
   ```sql
   DELETE FROM refresh_tokens WHERE expires_at < now();
   ```

**Flujo de Autenticación:**
1. Registro (`POST /api/auth/register`, US01_c) → inserta el hash en `refresh_tokens` y fija la cookie `refresh_token`; el cuerpo de la respuesta no lleva tokens
2. El frontend llama a `POST /api/auth/refresh` (con `Origin` igual a `APP_ORIGIN`) → valida en BD y devuelve el access token (JWT HS256, 15 min, solo en memoria del navegador); también lo hace al cargar la aplicación
3. Login (`POST /auth/login`, US02) → mismo patrón: crea el refresh token y fija la cookie
4. Logout (`POST /api/auth/logout`, US03) → marca `revokedAt` de la sesión de la cookie y borra la cookie; el frontend descarta la sesión de la memoria y avisa a las demás pestañas
5. Cambio de contraseña → revoca todos los tokens del usuario

### 📊 rate_limit_attempts

**Descripción:** Intentos de las operaciones limitadas por IP, compartidos entre todas las instancias del backend. Implementada en US01_d para el registro (`POST /api/auth/register`: 5 intentos por IP cada 15 minutos) y reutilizada por el login (US02: clave `login:<ip>`, 10 intentos **fallidos** por IP cada 15 minutos, `LOGIN_ATTEMPTS_MAX`); las invitaciones públicas (US02_b4: clave `invitation:<ip>`, 10 intentos con un enlace **no válido** por IP cada 15 minutos, `INVITATION_ATTEMPTS_MAX`; la consulta y la aceptación la comparten) y los restablecimientos públicos (US02_c: clave `password-reset:<ip>`, mismo criterio y contador aparte, `PASSWORD_RESET_ATTEMPTS_MAX`; la consulta y la confirmación la comparten). Es una tabla de trabajo: no tiene relaciones con el resto del modelo.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | UUID | PK | UUIDv7 generado por la aplicación |
| `key` | VARCHAR(200) | NOT NULL | `<operación>:<ip>`, p. ej. `register:203.0.113.7` o `login:203.0.113.7`. Una IPv6 completa cabe de sobra |
| `attemptedAt` | TIMESTAMPTZ | NOT NULL | Instante del intento, según el reloj de la aplicación |

**Índices:**
- PK: `id`
- IX: `(key, attemptedAt)` (el recuento y el borrado de una clave filtran por clave e instante)

**Cómo se usa (`PrismaAttemptRepository.register`):** una fila por cada intento **aceptado**. En una transacción por intento:
1. `SELECT pg_advisory_xact_lock(hashtextextended(key, 0))` serializa las peticiones de la misma clave (las de otras claves no esperan) hasta el fin de la transacción.
2. `DELETE FROM rate_limit_attempts WHERE key = :key AND attempted_at <= :now - :ventana` retira los intentos que ya salieron de la ventana.
3. Se cuentan los de la clave. Si hay menos que el máximo, se inserta el intento y se acepta. Si no, **no se inserta**: un intento rechazado no cuenta, y `Retry-After` es el instante del intento más antiguo más la ventana, menos el instante actual.

**Intentos que se liberan (`PrismaAttemptRepository.release`, US02):** `register` devuelve el identificador de la fila insertada, y quien lo pide puede borrarla con `release(attemptId)` (un `deleteMany` por id: liberar una fila que ya no existe no es un error y no necesita el bloqueo). El login solo cuenta los fallidos: reserva el intento antes de comprobar la contraseña y lo libera si es correcta, de modo que los logins correctos no dejan fila y los intentos en vuelo cuentan (peticiones simultáneas no superan el máximo). El registro nunca libera.

Un intento cuenta durante los 15 minutos siguientes a su instante (ventana deslizante), y en el instante exacto en que los cumple ya no cuenta. La clave `<operación>:<ip>` contiene una **IP, que es un dato personal**, así que la tabla no guarda nada más de lo necesario ni durante más tiempo. El borrado del paso 2 solo actúa sobre la clave que vuelve a usarse; una clave abandonada deja hasta 5 filas. Por eso `backup.yml` ejecuta cada día, antes de `pg_dump`, `DELETE FROM rate_limit_attempts WHERE attempted_at < now() - interval '24 hours'` (`infrastructure/supabase/purge-rate-limit-attempts.sql`; constante `ATTEMPT_RETENTION_HOURS` = 24), con lo que tampoco las copias de seguridad llevan intentos de más de un día.

---

## Módulo 2: Gestión de Cursos y Clases

### 📊 courses

**Descripción:** Cursos (niveles académicos) en la institución.

**Estado:** desde US-BASE, el modelo `Course` lleva `calendar_id` (UUID, **nulo**, FK → `calendars` con `ON DELETE SET NULL` e índice): el calendario base que sigue el curso, como máximo uno. Se asigna desde el formulario del calendario y la API de los cursos no lo expone todavía.

**Estado:** implementada en `backend/prisma/schema.prisma` (modelo `Course`) con la migración `20261019142532_add_courses_and_classes` (US05). Difiere de la definición de abajo (v2.1): `id` es UUIDv7, lleva `school_id` (FK → `schools`), `name` (`VARCHAR(100)`, el nombre que se muestra) y `normalized_name` (`VARCHAR(100)`: recortado, con los espacios colapsados y en minúsculas, conservando acentos y `º`/`ª`), y la unicidad es `UNIQUE (school_id, normalized_name)` (`courses_school_id_normalized_name_key`). Sin `code`, `level`, `academicYear`, `status` ni `createdBy`/`updatedBy`: ninguna historia los usa todavía y la traza va en el log (`COURSE_CREATED`, `COURSE_UPDATED`). Editar el curso (US07) cambia `name` y `normalized_name` y renueva `updated_at`; el propio curso no cuenta para la unicidad de su nombre.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `name` | VARCHAR(100) | NOT NULL | Nombre curso (ej: "1º ESO") |
| `code` | VARCHAR(50) | UNIQUE, NOT NULL | Código único curso |
| `level` | VARCHAR(50) | NOT NULL | Nivel educativo |
| `academicYear` | INT | NOT NULL | Año académico |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'ARCHIVED' |
| **`createdBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario creación |
| **`updatedBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario última edición |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: (code, academicYear)
- IX: `level`, `status`

---

### 📊 rooms

**Descripción:** Aulas físicas disponibles.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `name` | VARCHAR(100) | UNIQUE, NOT NULL | Nombre aula (ej: "101") |
| `capacity` | INT | DEFAULT 30 | Capacidad |
| `type` | VARCHAR(50) | NULL | Tipo: "regular", "laboratorio", "informática" |
| `floor` | INT | NULL | Piso |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'MAINTENANCE' |
| **`createdAt`** | TIMESTAMP | DEFAULT NOW() | **[MEJORA #7]** Timestamp creación |
| **`updatedAt`** | TIMESTAMP | DEFAULT NOW() ON UPDATE | **[MEJORA #7]** Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: `name`
- IX: `type`, `status`

---

### 📊 classes

**Descripción:** Grupos de alumnos dentro de un curso.

**Estado:** implementada (modelo `SchoolClass`, tabla `classes`; `class` es palabra reservada) con la misma migración de US05. Difiere de la definición de abajo (v2.1): `id` es UUIDv7, `course_id` es FK → `courses` con `ON DELETE CASCADE`, `name` (`VARCHAR(10)`) y `normalized_name` (`VARCHAR(10)`), con `UNIQUE (course_id, normalized_name)`, que sirve también de índice por `course_id`. **`tutor_id` (US09)**: el tutor es opcional (PRD §3.4), así que la columna es nula, FK → `professors` con `ON DELETE SET NULL` y con un índice único (`classes_tutor_id_key`): un profesor tutoriza una sola clase y una clase tiene un solo tutor, y varias clases sin tutor conviven (PostgreSQL admite varios nulos). Se asigna al crear el profesor con un `UPDATE` condicionado (la clase existe, es del colegio y no tiene tutor) en la misma transacción; la API devuelve `tutor: { id, firstName, lastName }` o `null`. **Identidad estable (US07):** el `id` de una clase no cambia al renombrarla; editar un curso (`PUT /api/courses/{id}`) conserva las clases que llegan con su `id`, crea las que no lo traen y borra las que faltan, de modo que lo que cuelgue de una clase en el futuro (tutor, alumnos, horarios) no se pierde al editarla. La edición bloquea la fila del curso (`FOR UPDATE`) y, como `UNIQUE (course_id, normalized_name)` no es diferible, escribe en este orden: borrar las ausentes, renombrar en dos fases (nombre provisional `#<i>`, que ningún nombre válido puede igualar, y después el definitivo) y crear las nuevas; sin migración. **Borrado real (US08):** `DELETE /api/courses/{id}` borra el curso y la base de datos borra sus clases por `ON DELETE CASCADE`, en una transacción con la fila del curso bloqueada (`FOR UPDATE`). El borrado devuelve cuántas clases (y alumnos asignados: siempre `0` hasta US14) se perdieron. El tutor (US09) ya cumple esto: borrar el curso o quitar una clase deja libre al profesor (`ON DELETE SET NULL`) en lugar de bloquear el borrado. La clase del alumno (US14) debe hacer lo mismo para no bloquearlo. Editar el curso conserva el tutor de las clases que se renombran, porque su `id` no cambia. **Tutoría desde la edición del profesor (US12, sin migración):** `PUT /api/professors/{id}` mueve `classes.tutor_id` en una transacción con la fila del profesor bloqueada y, a la vez y por orden de `id`, las dos clases implicadas (la que deja y la que toma): libera la propia y asigna la nueva, y si la nueva tenía otro tutor, ese profesor la pierde (`tutor_id` pasa al editado con el mismo `UPDATE`). El orden fijo evita el interbloqueo entre ediciones que se cruzan, y el índice único sigue siendo la red de seguridad frente a la edición de un curso. **Tutor desde la edición (US09_b, sin migración):** el `PUT /api/courses/{id}` escribe `classes.tutor_id` en dos fases dentro de la transacción (primero `NULL` en todas las clases cuyo tutor cambia y luego la asignación), porque `classes_tutor_id_key` no es diferible y así un movimiento o intercambio no choca; un profesor de una clase de otro curso es `409` y, si dos ediciones de cursos distintos compiten, la violación del propio índice se traduce al mismo `409`.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `courseId` | INT | NOT NULL, FK → courses.id | Curso |
| `name` | VARCHAR(100) | NOT NULL | Nombre (ej: "A", "B") |
| **`tutorId`** | INT | **NOT NULL** (MEJORA #8), FK → professors.id | Profesor tutor (validado por trigger) |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: (courseId, name)
- UNIQUE: (tutorId) — Un profesor tutoriza una sola clase
- IX: `courseId`

**Triggers (MEJORA #8):**
- `check_single_tutor_per_professor_insert`: Valida que un profesor no tutorize múltiples clases
- `check_single_tutor_per_professor_update`: Idem en updates

---

## Módulo 3: Gestión de Profesores

### 📊 professors

**Descripción:** Profesores de la institución.

**Estado:** implementada (US09, modelo `Professor`, migración `20261020142755_add_professors`) solo en parte. Difiere de la definición de abajo (v2.1): `id` es UUIDv7, lleva `school_id` (FK → `schools`, con índice), `first_name` y `last_name` (`VARCHAR(100)`, con las reglas del nombre del registro y **sin unicidad**: puede haber dos profesores con el mismo nombre), `position` (enum `ProfessorPosition`: `DIRECTOR` o `JEFE_ESTUDIOS`, nulo = sin cargo; dato informativo que no concede permisos) y `created_at`/`updated_at`. Un profesor es un registro del colegio, no una cuenta: **sin `email`**, ni DNI, y sin `status` ni `deletedAt` (no se edita ni se borra todavía). **Sin `classId`**: la clase que tutoriza se lee de `classes.tutor_id` (único, `ON DELETE SET NULL`), que es la fuente única de la relación 1:1. Las asignaturas (`professor_subjects`, la API devuelve `subjects: []`), la disponibilidad y la carga máxima llegan con sus historias (`US-PROF-ASSIGN`, US10 a US13). US13: el borrado es real (`DELETE`, sin `deleted_at`) y la clase que tutorizaba queda sin tutor porque `classes.tutor_id` es `ON DELETE SET NULL`; el resto de relaciones del profesor aún no existen.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `email` | VARCHAR(255) | NULL | Email profesor |
| `firstName` | VARCHAR(100) | NOT NULL | Nombre |
| `lastName` | VARCHAR(100) | NOT NULL | Apellido |
| `position` | ENUM | NULL | Cargo: 'DIRECTOR', 'JEFE_ESTUDIOS' (US09, US12). Dato informativo; no concede permisos |
| `classId` | INT | FK → classes.id | Clase que tutoriza (redund. con tutorId) |
| **`status`** | ENUM | DEFAULT 'ACTIVE' | **[MEJORA #2]** 'ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RETIRED' |
| **`deletedAt`** | TIMESTAMP | NULL | **[MEJORA #12]** Marca soft delete |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: (classId) — Tutor de clase
- IX: `firstName`, `lastName`, `status`, `deletedAt`
- **IX: `firstName`, `lastName` COLLATE utf8mb4_general_ci** — **[US11]** Búsqueda case-insensitive sin acentos
- FT: Full-text search en (firstName, lastName)

**Búsqueda (US11): Case-insensitive sin acentos**

MySQL soporta búsqueda case-insensitive sin acentos mediante `COLLATE utf8mb4_general_ci`:

```sql
-- Búsqueda: encontrar profesor "José García" independiente de mayúsculas/acentos
SELECT * FROM professors
WHERE firstName COLLATE utf8mb4_general_ci LIKE 'josé%'
  AND lastName COLLATE utf8mb4_general_ci LIKE '%garcia%'
  AND deletedAt IS NULL;

-- ✅ Encuentra: José, JOSÉ, jose, José García, JOSÉ GARCÍA, etc.
```

**Alternativas:**

1. **Full-Text Search** (más rápido, menos flexible):
   ```sql
   SELECT * FROM professors
   WHERE MATCH(firstName, lastName) AGAINST('josé garcía' IN BOOLEAN MODE)
   AND deletedAt IS NULL;
   ```

2. **LOWER() combinado con índice** (flexible pero requiere app logic):
   ```sql
   -- En app: normalizar búsqueda
   SELECT * FROM professors
   WHERE LOWER(CONCAT(firstName, ' ', lastName)) LIKE LOWER('%josé%')
   AND deletedAt IS NULL;
   ```

**Triggers (MEJORA #2):**
- `mark_schedule_conflict_on_professor_delete`: Marca schedule_entries como 'conflict_pending' cuando deletedAt se activa
- `mark_schedule_conflict_on_professor_retire`: Marca conflictos cuando status = 'RETIRED'

**Cascadas (MEJORA #2):**
- DELETE professor → schedule_entries.profesorId = NULL (SET NULL)
- Permite auditoría sin pérdida de datos de horarios

---

### 📊 subjects

**Estado:** implementada (US-SUBJECT, modelo `Subject`, migración `20261026122302_add_subjects`) solo en parte. Difiere de la definición de abajo (v2.1): `id` es UUIDv7, lleva `school_id` (FK → `schools`, sin cascada) y **no hay `code` único global**. Guarda `name` y `normalized_name` (`VARCHAR(100)`, sin mayúsculas ni espacios de más; **único por colegio** junto a `school_id`), un `code` **opcional** de 1 a 10 caracteres con su `normalized_code` (`VARCHAR(10)`, en minúsculas; **único por colegio** si existe: las filas sin código guardan `NULL` en las dos columnas y no chocan entre sí porque PostgreSQL trata los nulos como distintos en un índice único, así que basta un `@@unique` normal y no hace falta un índice parcial), `type` (enum `SubjectType`: `CORE`, `ELECTIVE`, `CUSTOM`), `status` (enum `SubjectStatus`: `ACTIVE`, `INACTIVE`; por ahora solo se guarda y se filtra), `description` (`VARCHAR(500)`, nula), **`color`** (enum `SubjectColor`, una paleta cerrada de 12 claves: `blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray`; se guarda la clave, no el aspecto, y puede repetirse entre asignaturas), `created_at` y `updated_at`. No tiene `deletedAt` ni `createdBy`/`updatedBy`: el borrado (US-SUBJECT_c) es real, sin papelera: libera el nombre y el código, borra sus filas de `subject_courses` por la cascada y deja el rastro solo en el evento `SUBJECT_DELETED` del log (`school_id`, `actor_id` y `subject_id`, sin nombre ni código). Se bloquea solo la fila de la asignatura (`FOR UPDATE`); los cursos no se bloquean. Los cursos en los que se imparte están en `subject_courses`.

**Descripción:** Materias/asignaturas.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `name` | VARCHAR(100) | NOT NULL | Nombre materia |
| `code` | VARCHAR(50) | UNIQUE | Código |
| `type` | ENUM | NOT NULL | 'CORE', 'ELECTIVE', 'CUSTOM' |
| `description` | TEXT | NULL | Descripción |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'INACTIVE' |
| **`deletedAt`** | TIMESTAMP | NULL | **[MEJORA #12]** Soft delete |
| **`createdBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario creación |
| **`updatedBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario actualización |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| **`updatedAt`** | TIMESTAMP | DEFAULT NOW() ON UPDATE | **[MEJORA #7]** Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: `code`
- IX: `type`, `status`, `deletedAt`

---

### 📊 professor_subjects

**Descripción:** Relación M:M profesor ↔ materias que imparte.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `profesorId` | INT | NOT NULL, FK → professors.id | Profesor |
| `subjectId` | INT | NOT NULL, FK → subjects.id | Materia |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |

**Índices:**
- PK: `id`
- UNIQUE: (profesorId, subjectId)
- IX: `profesorId`, `subjectId`

---

### 📊 professor_availabilities

**Descripción:** Disponibilidad horaria de cada profesor.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `profesorId` | INT | NOT NULL, FK → professors.id | Profesor |
| `dayOfWeek` | INT | NOT NULL | 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie |
| `sessionNumber` | INT | NOT NULL | Número sesión (1-8) |
| `isAvailable` | BOOLEAN | DEFAULT FALSE | Disponible en ese slot |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: (profesorId, dayOfWeek, sessionNumber)
- IX: `profesorId`, `dayOfWeek`

---

### 📊 professor_assignments

**Descripción:** Asignación de profesor a materia en curso.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `profesorId` | INT | NOT NULL, FK → professors.id | Profesor |
| `subjectId` | INT | NOT NULL, FK → subjects.id | Materia |
| `courseId` | INT | NOT NULL, FK → courses.id | Curso |
| `sessionsPerWeek` | INT | NULL | Sesiones semanales recomendadas |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'NEEDS_REVIEW', 'ARCHIVED' |
| **`createdBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario creación |
| **`updatedBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario actualización |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Cambios (MEJORA #10):**
- ❌ Campo `totalSessions` ELIMINADO (se calcula en app con `COUNT(*) FROM schedule_entries`)
- Reduce redundancia y garantiza consistencia

**Índices:**
- PK: `id`
- UNIQUE: (profesorId, subjectId, courseId)
- IX: `profesorId`

---

## Módulo 4: Gestión de Estudiantes

### 📊 students

**Estado:** implementada (US14, modelo `Student`, migración `20261021193052_add_students`) solo en parte. Difiere de la definición de abajo (v2.1): `id` es UUIDv7, lleva `school_id` (FK → `schools`, sin cascada, como `courses` y `professors`), `course_id` y `class_id` son **nulos** con `ON DELETE SET NULL` (el curso es obligatorio al crear, pero si se borra el curso o la clase el alumno sigue existiendo sin ellos), no tiene `email` ni `status` (hasta que una historia los necesite; US18 decidirá cómo se borra), `lunch_type` se sustituye por `cafeteria` (BOOLEAN, si come en el comedor) y `food_type` (VARCHAR(255), tipo de comida), `scholarship` (beca de comedor) es nulo si no come en el comedor, y `observations` es `TEXT` (5000 caracteres como máximo, los limita la aplicación). `food_type` y `observations` son datos sensibles (pueden ser datos de salud de menores): no salen en el listado ni en los logs. Dos `CHECK` escritos a mano en la migración: sin comedor no hay beca ni tipo de comida, y con comedor la beca tiene respuesta. La búsqueda de texto completo y los estados `INACTIVE` y `GRADUATED` quedan para sus historias (US15 y US16).

**Descripción:** Alumnos inscritos en cursos.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `email` | VARCHAR(255) | NULL | Email estudiante |
| `firstName` | VARCHAR(100) | NOT NULL | Nombre |
| `lastName` | VARCHAR(100) | NOT NULL | Apellido |
| `courseId` | INT | NOT NULL, FK → courses.id | Curso asignado |
| `classId` | INT | FK → classes.id | Clase/grupo (NULL si no asignado) |
| `lunch_type` | VARCHAR(50) | NULL | Tipo comida: "full", "media", "ninguna" |
| `scholarship` | BOOLEAN | DEFAULT FALSE | Tiene beca |
| `observations` | LONGTEXT | NULL | Notas |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'INACTIVE', 'GRADUATED' |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- IX: `courseId`, `classId`, `status`
- FT: Full-text search en (firstName, lastName)

---

### 📊 student_schedules

**Descripción:** Relación M:M estudiantes ↔ horarios (MEJORA #3 - Faltante).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `studentId` | INT | NOT NULL, FK → students.id | Estudiante |
| `scheduleId` | INT | NOT NULL, FK → schedules.id | Horario asignado |
| `scheduleEntryId` | INT | NOT NULL, FK → schedule_entries.id | Entrada horaria específica |
| `assignedAt` | TIMESTAMP | DEFAULT NOW() | Timestamp asignación |

**Índices:**
- PK: `id`
- UNIQUE: (studentId, scheduleId, scheduleEntryId)
- IX: `studentId`, `scheduleId`

**Trigger automático:**
```sql
CREATE TRIGGER populate_student_schedules
AFTER INSERT ON schedule_entries
FOR EACH ROW
BEGIN
  INSERT INTO student_schedules (studentId, scheduleId, scheduleEntryId)
  SELECT s.id, NEW.scheduleId, NEW.id
  FROM students s
  WHERE s.classId = NEW.classId AND s.status = 'ACTIVE'
  ON DUPLICATE KEY UPDATE assignedAt = CURRENT_TIMESTAMP;
END;
```

---

## Módulo 5: Configuración de Horarios

### 📊 calendars

**Estado:** implementada (US-BASE, modelo `Calendar`, migración `20261023134046_add_calendars`) solo en parte. Difiere de la definición de abajo (v2.1): `id` es UUIDv7, lleva `school_id` (FK → `schools`, sin cascada) y **varios calendarios por colegio**; solo guarda `name`, `normalized_name` (`VARCHAR(100)`, sin mayúsculas, acentos ni espacios de más; **único por colegio** junto a `school_id`), `createdAt` y `updatedAt`. No tiene fechas (`academicYear`, `startDate`, `endDate`), `startTime`, `endTime`, `sessionCount`, `sessionDuration`, `breakCount`, `totalFrames`, `status`, `deletedAt` ni `createdBy`/`updatedBy`: la jornada es **la misma de lunes a viernes** y se deduce de sus periodos, y el borrado (US-BASE_c) es real, sin papelera. Cada curso sigue como máximo un calendario (`courses.calendar_id`, nulo, `ON DELETE SET NULL`, con índice); crear un calendario con un curso que ya seguía otro lo mueve. **Borrar un calendario (US-BASE_c)** elimina la fila de `calendars`: sus periodos caen por la cascada (`calendar_periods.calendar_id`, `ON DELETE CASCADE`) y los cursos que lo seguían **no se borran**, quedan con `calendar_id` nulo por el `SET NULL`; nada se hace a mano. Antes de borrar se bloquean el calendario y sus cursos (`FOR UPDATE`, en orden de `id`) para contar exactamente los cursos que quedan sin calendario. Sin migraciones: la cascada y el `SET NULL` existen desde US-BASE.

**Descripción:** Configuración calendárica (horario escolar).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `name` | VARCHAR(100) | NOT NULL | Nombre (ej: "2025-2026") |
| `academicYear` | INT | NULL | Año académico |
| `startDate` | DATE | NOT NULL | Fecha inicio |
| `endDate` | DATE | NOT NULL | Fecha fin |
| `startTime` | TIME | NOT NULL | Hora inicio jornada (ej: 08:00) |
| `endTime` | TIME | NOT NULL | Hora fin jornada (ej: 16:00) |
| `sessionCount` | INT | NOT NULL | Número sesiones día (ej: 8) |
| `sessionDuration` | INT | NOT NULL | Duración sesión en minutos (ej: 55) |
| `breakCount` | INT | DEFAULT 1 | Número descansos |
| `totalFrames` | INT | NULL | Total slots = sessionCount * 5 días |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'ARCHIVED' |
| **`deletedAt`** | TIMESTAMP | NULL | **[MEJORA #12]** Soft delete |
| **`createdBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario creación |
| **`updatedBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario actualización |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- IX: `academicYear`, `status`, `deletedAt`

---

### 📊 sessions

**Estado:** implementada con otro nombre (US-BASE): la tabla real es `calendar_periods`. Difiere de la definición de abajo (v2.1): `id` es UUIDv7, `calendar_id` es FK → `calendars` con `ON DELETE CASCADE`, **no hay `dayOfWeek`** (los periodos valen de lunes a viernes), `position` (`SMALLINT`, desde 1) da el orden y es único por calendario, `kind` es el enum `CalendarPeriodKind` (`SESSION` o `BREAK`) y la hora se guarda como minutos desde medianoche en `start_minute` y `end_minute` (`SMALLINT`) con el `CHECK` `calendar_periods_minutes_check` (`start_minute >= 0`, `end_minute <= 1439`, `end_minute > start_minute`). El **número de sesión no se guarda**: se deduce del orden de las filas `SESSION`. Reglas de la aplicación: de 1 a 8 sesiones, de 0 a 2 recreos entre dos sesiones, hasta 90 minutos por periodo y sin solapes con el periodo anterior (se permiten huecos). **Editar un calendario (US-BASE_b) borra todos sus periodos y vuelve a crearlos** con `position` desde 1, así que sus `id` cambian; nada los referencia todavía. Borrar el calendario (US-BASE_c) los elimina todos por la cascada.

**Descripción:** Sesiones individuales dentro del calendario.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `calendarId` | INT | NOT NULL, FK → calendars.id | Calendario |
| `number` | INT | NULL | Número sesión (1-8) |
| `dayOfWeek` | INT | NOT NULL | 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie |
| `startTime` | TIME | NOT NULL | Hora inicio |
| `endTime` | TIME | NOT NULL | Hora fin |
| `type` | ENUM | NULL | 'class' o 'break' |
| **`createdAt`** | TIMESTAMP | DEFAULT NOW() | **[MEJORA #7]** Timestamp creación |
| **`updatedAt`** | TIMESTAMP | DEFAULT NOW() ON UPDATE | **[MEJORA #7]** Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: (calendarId, dayOfWeek, number)
- IX: `calendarId`, `dayOfWeek`

---

### 📊 subject_courses

**Estado:** implementada (US-SUBJECT, modelo `SubjectCourse`, migración `20261026122302_add_subjects`) y **fusionada con `subject_standard_loads`**. Difiere de la definición de abajo (v2.1): no tiene `id` (la **clave primaria es `(subject_id, course_id)`**: la pareja identifica la fila y, desde US19_b, `scheduling_constraints` la referencia con una clave ajena compuesta; por eso la edición de una asignatura aplica diferencias en lugar de reescribir el conjunto), lleva `sessions_per_week` (`SMALLINT`, **de 1 a 5**, con el `CHECK` escrito a mano `subject_courses_sessions_per_week_check`) y `created_at` y `updated_at`. Las dos claves ajenas son `ON DELETE CASCADE`: borrar un curso borra sus filas y **la asignatura sigue existiendo, quizá sin ningún curso** (la regla «al menos un curso» se comprueba al guardar, también al editar, no en la base de datos); borrar una asignatura (US-SUBJECT_c) borra sus filas y los cursos no se tocan. Índice en `course_id`. Con una sola tabla es imposible un curso marcado sin su carga o una carga sin curso. **La edición de una asignatura (US-SUBJECT_b) reemplaza sus filas en una transacción** (se borran y se insertan las recibidas, con la asignatura bloqueada `FOR UPDATE` y los cursos pedidos y actuales `FOR SHARE` en orden de `id`): el `created_at` de las filas se renueva en cada edición, y mientras nada las referencie no importa; si US19 las referencia, habrá que aplicar diferencias.

**Descripción:** Relación M:M materias ↔ cursos.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `subjectId` | INT | NOT NULL, FK → subjects.id | Materia |
| `courseId` | INT | NOT NULL, FK → courses.id | Curso |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |

**Índices:**
- PK: `id`
- UNIQUE: (subjectId, courseId)
- IX: `courseId`

---

### 📊 scheduling_constraints

**Estado:** implementada (US19_b, modelo `SchedulingConstraint`, migración `add_scheduling_constraints`) solo con los tipos `MAX_PER_DAY` y `BLOCK`; `FORBIDDEN_SLOTS` y `PREFERRED_SLOTS` están en el enum para US19_c y US19_d, que añadirán las celdas en una tabla hija. Es la tabla de reglas de reparto de una asignatura en un curso y sustituye a `restrictions` para esas reglas (la carga semanal sigue en `subject_courses.sessions_per_week`; la disponibilidad del profesor irá a US-PROF-AVAIL y la ubicación única es una regla fija del algoritmo).

**Descripción:** una fila por `(asignatura, curso, tipo)`.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | UUID | PK | UUIDv7 generado por la aplicación |
| `school_id` | UUID | NOT NULL, FK → schools.id | Colegio (de la identidad, nunca del cliente) |
| `subject_id`, `course_id` | UUID | NOT NULL, **FK compuesta → subject_courses (subject_id, course_id) ON DELETE CASCADE** | La pareja de la que cuelga la regla |
| `type` | ENUM `ConstraintType` | NOT NULL | `MAX_PER_DAY`, `BLOCK`, `FORBIDDEN_SLOTS`, `PREFERRED_SLOTS` |
| `max_per_day` | SMALLINT | NULL | De 2 a 5; solo en `MAX_PER_DAY` (sin regla, el máximo es una sesión al día) |
| `block_size` | SMALLINT | NULL | 2 o 3; solo en `BLOCK` |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | Fechas |

**Restricciones:** UNIQUE `(subject_id, course_id, type)`; CHECK `scheduling_constraints_max_per_day_check` (una fila `MAX_PER_DAY` exige `max_per_day` de 2 a 5 y `block_size` nulo), `scheduling_constraints_block_check` (una `BLOCK` exige `block_size` de 2 a 3 y `max_per_day` nulo) y `scheduling_constraints_slots_check` (las de franjas, las dos columnas nulas), los tres escritos a mano en la migración.

**Índices:** PK, UNIQUE `(subject_id, course_id, type)`, IX `course_id`, IX `school_id`.

**Cascada:** la regla se borra al dejar de impartirse la asignatura en el curso (desde la edición de la asignatura o desde la carga del curso), al borrar la asignatura y al borrar el curso. La edición de asignaturas aplica diferencias sobre `subject_courses` para no perderlas en cada guardado.

---

### 📊 scheduling_constraint_slots

**Estado:** implementada (US19_c, modelo `SchedulingConstraintSlot`, migración `add_scheduling_constraint_slots`) para las reglas `FORBIDDEN_SLOTS`; US19_d la reutilizará para `PREFERRED_SLOTS`. Es la tabla hija de las celdas de una regla de franjas de `scheduling_constraints`.

**Descripción:** una fila por celda (día × sesión) de una regla.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `constraint_id` | UUID | PK, FK → scheduling_constraints.id ON DELETE CASCADE | La regla a la que pertenece |
| `day_of_week` | SMALLINT | PK, CHECK 1..5 | De lunes (1) a viernes (5) |
| `session_number` | SMALLINT | PK, CHECK 1..8 | El **orden** de la sesión entre las sesiones de la jornada del calendario del curso, no su hora; 8 es el máximo de sesiones de un calendario (US-BASE) |
| `created_at` | TIMESTAMPTZ | NOT NULL | Fecha |

**Restricciones:** clave primaria `(constraint_id, day_of_week, session_number)`, que impide repetir una celda; `CHECK` `scheduling_constraint_slots_day_of_week_check` y `scheduling_constraint_slots_session_number_check`, escritos a mano en la migración. Si US-BASE sube el máximo de sesiones, hay que cambiar el segundo con una migración.

**Cascada:** las celdas caen con su regla, y con ella al dejar de impartirse la asignatura en el curso, al borrar la asignatura y al borrar el curso. Una regla de franjas existe solo mientras tenga alguna celda (lo garantiza la aplicación).

**Calendario que cambia:** las celdas cuya sesión ya no existe se conservan, se ignoran al leer (con un aviso y su recuento) y se quitan cuando alguien guarda la cuadrícula.

---

### 📊 subject_standard_loads

**Estado:** **eliminada del modelo** (US-SUBJECT). Tenía la misma clave `(subjectId, courseId)` que `subject_courses`, así que se fusionó con ella: la carga estándar de una asignatura en un curso es `subject_courses.sessions_per_week`. Se conserva la definición de abajo (v2.1) solo como referencia histórica; no se creará esta tabla.

**Descripción:** Carga horaria estándar (sesiones/semana) por materia-curso.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `subjectId` | INT | NOT NULL, FK → subjects.id | Materia |
| `courseId` | INT | NOT NULL, FK → courses.id | Curso |
| `sessionsPerWeek` | INT | NOT NULL | Sesiones semanales requeridas (ej: 3) |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: (subjectId, courseId)
- IX: `subjectId`

---

## Módulo 6: Restricciones de Carga Horaria

### 📊 restrictions

**Descripción:** Restricciones sobre generación de horarios.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| **`calendarId`** | INT | NOT NULL (MEJORA #1), FK → calendars.id | **[CRÍTICA]** Calendario restricción |
| `courseId` | INT | NOT NULL, FK → courses.id | Curso |
| `classId` | INT | FK → classes.id | Clase (opcional) |
| `type` | ENUM | NOT NULL | 'HOURS_PER_WEEK', 'AVAILABILITY', 'NO_DUPLICATE', 'SINGLE_LOCATION' |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'DRAFT', 'ARCHIVED' |
| **`createdBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario creación |
| **`updatedBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario actualización |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Mejora #1 (CRÍTICA):**
- Antes: restrictions NO tenía relación con calendars
- Ahora: FK calendarId permite validar restricciones contra calendario específico
- Índice: `idx_calendar_restrictions` para búsquedas rápidas

**Índices:**
- PK: `id`
- IX: `calendarId` (NUEVO), `courseId`, `classId`, `type`, `status`

---

### 📊 restriction_details

**Descripción:** Detalles de cada restricción (materias afectadas).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `restrictionId` | INT | NOT NULL, FK → restrictions.id | Restricción |
| `subjectId` | INT | NOT NULL, FK → subjects.id | Materia |
| `sessionCount` | INT | NULL | Sesiones límite |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |

**Índices:**
- PK: `id`
- IX: `restrictionId`, `subjectId`

---

## Módulo 7: Horarios Generados

### 📊 schedules

**Descripción:** Horarios generados (una versión del horario completo).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `calendarId` | INT | NOT NULL, FK → calendars.id | Calendario base |
| `algorithm` | ENUM | NULL | 'CSP', 'BACKTRACK' |
| `generatedAt` | TIMESTAMP | NULL | Cuándo se generó |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'ARCHIVED', 'NEEDS_REVIEW' |
| **`createdBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario generación |
| **`updatedBy`** | INT | FK → users.id | **[MEJORA #5]** Usuario última edición |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- IX: `calendarId`, `algorithm`, `status`

---

### 📊 schedule_entries

**Descripción:** Entradas individuales en horario (clase × sesión).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `scheduleId` | INT | NOT NULL, FK → schedules.id | Horario |
| `classId` | INT | NOT NULL, FK → classes.id | Clase |
| `sessionNumber` | INT | NOT NULL | Número sesión (1-8) |
| `dayOfWeek` | INT | NOT NULL | 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie |
| `subjectId` | INT | NOT NULL, FK → subjects.id | Materia |
| `profesorId` | INT | **SET NULL** (MEJORA #2), FK → professors.id | Profesor (NULL si borrado) |
| `roomId` | INT | FK → rooms.id | Aula asignada |
| `roleType` | ENUM | DEFAULT 'tutor' | 'tutor', 'specialist', 'support' |
| **`status`** | ENUM | DEFAULT 'scheduled' | **[MEJORA #6]** Mejorado: 'scheduled', 'manual_edited', 'conflict_pending', 'approved', 'cancelled' |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp creación |

**Cambios Mejora #6:**
- Antes: ('active', 'support', 'coordination', 'free') ← Vago
- Ahora: ('scheduled', 'manual_edited', 'conflict_pending', 'approved', 'cancelled') ← Claro

**Constrains de Integridad (Hard Constraints):**
- **HC2 SINGLE_LOCATION:** UNIQUE (profesorId, dayOfWeek, sessionNumber)
  - Un profesor no en 2 aulas a la vez
- **HC3:** UNIQUE (scheduleId, classId, sessionNumber)
  - Una clase una sola entrada por sesión

**Índices:**
- PK: `id`
- UNIQUE: (profesorId, dayOfWeek, sessionNumber) — HC2
- UNIQUE: (scheduleId, classId, sessionNumber) — HC3
- IX: `scheduleId`, `classId`, `profesorId`, `subjectId`, `roomId`, `dayOfWeek`
- IX: `profesorId`, `dayOfWeek`, `status` — Búsquedas de conflictos
- IX: `roomId`, `dayOfWeek`, `sessionNumber` — Búsquedas de aula

**Triggers (MEJORA #2, #6):**
- `mark_schedule_conflict_on_professor_delete`: Cuando profesor.deletedAt se activa
- `mark_schedule_conflict_on_professor_retire`: Cuando profesor.status = 'RETIRED'

---

### 📊 schedule_generation_jobs

**Descripción:** Control de trabajos de generación de horario.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | VARCHAR(255) | PK | UUID del job |
| `calendarId` | INT | NOT NULL, FK → calendars.id | Calendario procesado |
| `algorithm` | ENUM | NULL | 'CSP', 'BACKTRACK' |
| `status` | ENUM | NULL | 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED' |
| `scheduleId` | INT | FK → schedules.id | Horario generado (si éxito) |
| `progress` | INT | NULL | Porcentaje (0-100) |
| `currentSession` | INT | NULL | Sesión procesada actualmente |
| `error` | TEXT | NULL | Mensaje error (si falló) |
| `errorType` | VARCHAR(50) | NULL | Tipo error: 'CONSTRAINT_VIOLATION', 'TIMEOUT', 'INVALID_DATA' |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp inicio |
| `completedAt` | TIMESTAMP | NULL | Timestamp fin |

**Índices:**
- PK: `id`
- IX: `status`, `calendarId`

---

## Vistas y Reportes

### 🔍 Vista 1: professor_schedule

**Propósito:** Horario completo de cada profesor.

**Mejora #4 (CRÍTICA):** BUG corregido
- Antes: `sess.calendarId = se.scheduleId` ← INCORRECTO
- Ahora: `sess.calendarId = sch.calendarId` ← CORRECTO

```sql
SELECT
  p.id, CONCAT(p.firstName, ' ', p.lastName) as name,
  se.dayOfWeek, sess.number, sess.startTime, sess.endTime,
  subj.name, c.name, r.name, se.status
FROM schedule_entries se
JOIN schedules sch ON sch.id = se.scheduleId
JOIN professors p ON se.profesorId = p.id
JOIN subjects subj ON se.subjectId = subj.id
JOIN classes c ON se.classId = c.id
JOIN sessions sess ON sess.calendarId = sch.calendarId
                   AND sess.dayOfWeek = se.dayOfWeek
                   AND sess.number = se.sessionNumber
```

---

### 🔍 Vista 2: schedule_conflicts_professor_overlap

**Propósito:** Detectar HC2 violado (profesor en 2 aulas).

```sql
SELECT
  sch.id, p.id, COUNT(*) as conflict_count
FROM schedule_entries se
JOIN schedules sch ON sch.id = se.scheduleId
JOIN professors p ON se.profesorId = p.id
GROUP BY sch.id, se.profesorId, se.dayOfWeek, se.sessionNumber
HAVING COUNT(*) > 1
```

---

### 🔍 Vista 3: schedule_conflicts_no_room

**Propósito:** Entradas sin aula asignada.

```sql
SELECT se.id, c.name, CONCAT(p.firstName, ' ', p.lastName), se.dayOfWeek
FROM schedule_entries se
JOIN classes c ON se.classId = c.id
LEFT JOIN professors p ON se.profesorId = p.id
WHERE se.roomId IS NULL
```

---

### 🔍 Vista 4: schedule_conflicts_availability

**Propósito:** Sesiones fuera de disponibilidad profesor.

```sql
SELECT se.id, p.id, se.dayOfWeek, se.sessionNumber
FROM schedule_entries se
JOIN professors p ON se.profesorId = p.id
LEFT JOIN professor_availabilities pa
  ON pa.profesorId = se.profesorId
  AND pa.dayOfWeek = se.dayOfWeek
  AND pa.sessionNumber = se.sessionNumber
WHERE se.profesorId IS NOT NULL
  AND (pa.id IS NULL OR pa.isAvailable = FALSE)
```

---

### 🔍 Vista 5: professor_load

**Propósito:** Carga horaria de cada profesor.

```sql
SELECT
  p.id,
  COUNT(DISTINCT pa.id) as totalAssignments,
  SUM(pa.sessionsPerWeek) as totalSessionsPerWeek,
  COUNT(DISTINCT ps.subjectId) as numSubjects
FROM professors p
LEFT JOIN professor_assignments pa ON p.id = pa.profesorId
LEFT JOIN professor_subjects ps ON p.id = ps.profesorId
WHERE p.deletedAt IS NULL
GROUP BY p.id
```

---

### 🔍 Vista 6: professor_availability_summary

**Propósito:** Resumen disponibilidad (porcentaje slots libres).

```sql
SELECT
  p.id,
  COUNT(CASE WHEN pa.isAvailable = TRUE THEN 1 END) as availableSlots,
  COUNT(*) as totalSlots,
  ROUND(COUNT(CASE WHEN pa.isAvailable = TRUE THEN 1 END) * 100.0
        / NULLIF(COUNT(*), 0), 2) as availabilityPercentage
FROM professors p
LEFT JOIN professor_availabilities pa ON p.id = pa.profesorId
WHERE p.deletedAt IS NULL
GROUP BY p.id
```

---

### 🔍 Vista 7: restriction_audit_trail

**Propósito:** Auditoría completa de restricciones (MEJORA #5).

```sql
SELECT
  r.id, r.type, c.name as courseName,
  CONCAT(uc.firstName, ' ', uc.lastName) as createdBy,
  CONCAT(uu.firstName, ' ', uu.lastName) as updatedBy,
  r.createdAt, r.updatedAt
FROM restrictions r
JOIN courses c ON r.courseId = c.id
JOIN calendars cal ON r.calendarId = cal.id
LEFT JOIN users uc ON r.createdBy = uc.id
LEFT JOIN users uu ON r.updatedBy = uu.id
WHERE r.status = 'ACTIVE'
```

---

## Ejemplo de Datos

### Escenario: Instituto de Educación Secundaria (500 alumnos)

```
Cursos:         4 (1º-4º ESO)
Clases/curso:   3-4 grupos (A, B, C, D)
Total clases:   13 grupos
Profesores:     45
Materias:       22
Aulas:          20
Capacidad:      30 alumnos/aula promedio
Sesiones/día:   8 (08:00-16:00, de 55 minutos)
```

**Inserciones de ejemplo:**

```sql
-- Crear usuario administrador
INSERT INTO users (email, firstName, lastName, role, status)
VALUES ('director@school.edu', 'Juan', 'García', 'director', 'ACTIVE');

-- Crear curso
INSERT INTO courses (name, code, level, academicYear, createdBy, updatedBy)
VALUES ('1º ESO', 'ESO1', 'ESO', 2025, 1, 1);

-- Crear profesor
INSERT INTO professors (firstName, lastName, status)
VALUES ('María', 'López', 'ACTIVE');

-- Crear materia
-- Modelo real (US-SUBJECT): sin createdBy/updatedBy, con el nombre normalizado, el color y el colegio.
INSERT INTO subjects (id, school_id, name, normalized_name, code, normalized_code, type, status, color)
VALUES (gen_random_uuid(), '<id del colegio>', 'Matemáticas', 'matemáticas', 'MAT', 'mat', 'CORE', 'ACTIVE', 'red');

-- Asignar profesor a materia
INSERT INTO professor_subjects (profesorId, subjectId)
VALUES (1, 1);

-- Crear clase
INSERT INTO classes (courseId, name, tutorId)
VALUES (1, 'A', 1); -- Profesor 1 es tutor

-- Crear aula
INSERT INTO rooms (name, capacity, type)
VALUES ('101', 30, 'regular');

-- Crear calendario
INSERT INTO calendars 
  (name, academicYear, startDate, endDate, startTime, endTime, 
   sessionCount, sessionDuration, createdBy, updatedBy)
VALUES 
  ('2025-2026', 2025, '2025-09-01', '2026-06-15', '08:00', '16:00', 
   8, 55, 1, 1);

-- Crear sesiones del calendario
INSERT INTO sessions 
  (calendarId, number, dayOfWeek, startTime, endTime, type)
VALUES
  (1, 1, 1, '08:00', '08:55', 'class'),
  (1, 2, 1, '08:55', '09:50', 'class'),
  (1, 3, 1, '09:50', '10:45', 'class'),
  -- ... más sesiones

-- Crear restricción (MEJORA #1: ahora con calendarId)
INSERT INTO restrictions 
  (calendarId, courseId, classId, type, status, createdBy, updatedBy)
VALUES
  (1, 1, 1, 'SINGLE_LOCATION', 'ACTIVE', 1, 1);

-- Crear horario
INSERT INTO schedules (calendarId, algorithm, status, createdBy, updatedBy)
VALUES (1, 'CSP', 'ACTIVE', 1, 1);

-- Entrada de horario
INSERT INTO schedule_entries
  (scheduleId, classId, sessionNumber, dayOfWeek, subjectId, profesorId, roomId, status)
VALUES
  (1, 1, 1, 1, 1, 1, 1, 'scheduled');

-- Asignar estudiante a horario (MEJORA #3: M:M)
INSERT INTO student_schedules (studentId, scheduleId, scheduleEntryId)
VALUES (1, 1, 1);
```

---

## Queries Comunes

### ✅ Obtener horario de un profesor

```sql
SELECT * FROM professor_schedule
WHERE profesorId = 1
ORDER BY dayOfWeek, sessionNumber;
```

---

### ✅ Detectar conflictos en un horario

```sql
SELECT * FROM schedule_conflicts_professor_overlap
WHERE scheduleId = 1;

SELECT * FROM schedule_conflicts_no_room
WHERE scheduleId = 1;

SELECT * FROM schedule_conflicts_availability
WHERE scheduleId = 1;
```

---

### ✅ Carga horaria de profesor

```sql
SELECT * FROM professor_load
WHERE id = 1;
```

---

### ✅ Disponibilidad de profesor

```sql
SELECT * FROM professor_availability_summary
WHERE id = 1;
```

---

### ✅ Auditoría de cambios en restricción

```sql
SELECT * FROM restriction_audit_trail
WHERE id = 1;
```

---

### ✅ Profesores con status RETIRED (MEJORA #2)

```sql
SELECT * FROM professors
WHERE status = 'RETIRED'
  AND deletedAt IS NULL;
```

---

### ✅ Ver horarios de un estudiante (MEJORA #3)

```sql
SELECT 
  ss.studentId,
  c.name as courseName,
  s.name as subjectName,
  se.dayOfWeek,
  sess.number as sessionNumber,
  sess.startTime,
  sess.endTime,
  r.name as roomName,
  CONCAT(p.firstName, ' ', p.lastName) as profesorName
FROM student_schedules ss
JOIN schedule_entries se ON ss.scheduleEntryId = se.id
JOIN schedules sch ON ss.scheduleId = sch.id
JOIN sessions sess ON sess.calendarId = sch.calendarId
                   AND sess.dayOfWeek = se.dayOfWeek
                   AND sess.number = se.sessionNumber
JOIN classes c ON se.classId = c.id
JOIN subjects s ON se.subjectId = s.id
LEFT JOIN rooms r ON se.roomId = r.id
LEFT JOIN professors p ON se.profesorId = p.id
WHERE ss.studentId = 123
ORDER BY se.dayOfWeek, sess.number;
```

---

### ✅ Validar integridad HC2 (SINGLE_LOCATION)

```sql
SELECT 
  p.id,
  CONCAT(p.firstName, ' ', p.lastName) as profesorName,
  se.dayOfWeek,
  se.sessionNumber,
  COUNT(*) as slot_count,
  GROUP_CONCAT(c.name SEPARATOR ', ') as classes
FROM schedule_entries se
JOIN professors p ON se.profesorId = p.id
JOIN classes c ON se.classId = c.id
GROUP BY se.profesorId, se.dayOfWeek, se.sessionNumber
HAVING COUNT(*) > 1;
-- Debería retornar 0 filas si HC2 se respeta
```

---



