# CalendarSchool: Diccionario de Datos (v3.0)

**Versión:** 3.0 (sustituye a la v2.1, diseñada para MySQL)
**Fecha:** 2026-11-11
**Base de datos:** PostgreSQL 17 (la misma versión mayor en local, en CI y en Supabase), gestionada con Prisma
**Fuente de verdad:** `backend/prisma/schema.prisma` y sus migraciones (`backend/prisma/migrations/`). Este documento las describe; si difieren, manda el esquema. El modelo se construye de forma incremental: cada historia añade sus tablas en el esquema y actualiza aquí la sección correspondiente.

> **Qué cambió en la v3.0.** El modelo está **migrado por completo** a PostgreSQL: las 21 tablas de abajo existen. La v2.1 (MySQL, sin aislamiento por colegio, con aulas, restricciones genéricas, vistas y disparadores) ya no describe nada del producto. Su historia está en el control de versiones; lo que desaparece y por qué está en [Cambios respecto a la v2.1](#cambios-respecto-a-la-v21). El DDL de la v2.1 (`MODELO_DATOS_SQL_DDAL.sql`, MySQL) se eliminó del repositorio y solo queda en el historial de git: no lo uses para generar esquemas.

## Resumen

| Módulo | Tablas | Para qué sirve |
|---|---|---|
| 1. Colegios, usuarios y autenticación | `municipalities`, `schools`, `users`, `refresh_tokens`, `rate_limit_attempts`, `access_links` | Registro del colegio, sesión, invitaciones y restablecimientos de contraseña |
| 2. Cursos, clases y alumnos | `courses`, `classes`, `students` | Estructura académica del colegio |
| 3. Profesores | `professors`, `professor_unavailabilities`, `professor_assignments` | Profesores, cuándo no pueden dar clase y qué imparten |
| 4. Calendarios | `calendars`, `calendar_periods` | Estructura de la jornada (sesiones y recreos) |
| 5. Asignaturas y reglas | `subjects`, `subject_courses`, `scheduling_constraints`, `scheduling_constraint_slots` | Asignaturas, su carga por curso y las reglas de reparto |
| 6. Horarios generados | `schedules`, `schedule_entries`, `schedule_generations` | Borrador, horario oficial y ejecuciones del generador |

El diagrama entidad-relación está en [`MODELO_DATOS_DIAGRAMA.md`](./MODELO_DATOS_DIAGRAMA.md).

## Convenciones

- **Identificadores:** `UUID` (UUIDv7, ordenados por tiempo) generados por la aplicación, no por la base de datos. Excepciones: `municipalities.code` (código INE, `CHAR(5)`) y las claves primarias compuestas de `subject_courses` y `scheduling_constraint_slots`.
- **Fechas:** `TIMESTAMPTZ`. Las columnas se llaman `created_at` y `updated_at`; `updated_at` lo mantiene Prisma. Las tablas de solo inserción o con vida corta (`refresh_tokens`, `scheduling_constraint_slots`, `professor_unavailabilities`, `professor_assignments`) no tienen `updated_at`.
- **Horas:** se guardan como **minutos desde las 00:00** (`SMALLINT`), nunca como `TIME`: evita las zonas horarias de `TIME` con Prisma. Un tramo o una sesión es el intervalo semiabierto `[start_minute, end_minute)`.
- **Días:** `day_of_week` va de 1 (lunes) a 5 (viernes). No hay sábados ni domingos.
- **Nombres:** tablas en plural y columnas en `snake_case` (`normalized_name`, `school_id`). En el esquema de Prisma los atributos van en `camelCase`. `class` es palabra reservada, así que el modelo `SchoolClass` es la tabla `classes`.
- **Aislamiento por colegio:** todo dato de un colegio cuelga de `schools` y la aplicación toma el `school_id` de la identidad de la sesión, nunca del cliente. Las tablas de datos del colegio llevan `school_id`; las hijas (`classes`, `calendar_periods`, `subject_courses`, `scheduling_constraint_slots`, `schedule_entries`) lo heredan de su padre.
- **Unicidad por nombre normalizado:** `name` guarda el texto tal como se muestra (recortado y con los espacios colapsados) y `normalized_name`, el texto que se compara (minúsculas). Un índice único sobre `(school_id, normalized_name)` garantiza la unicidad sin consulta previa. En `schools` el nombre normalizado, además, quita acentos y signos.
- **Borrado real:** no hay borrado lógico (`deleted_at`) ni papelera. Lo que depende de una fila borrada se resuelve en la base de datos con `ON DELETE CASCADE` o `SET NULL`, nunca a mano; ver [Reglas de borrado](#reglas-de-borrado-y-cascadas).
- **Auditoría:** no hay `created_by`/`updated_by` salvo donde el negocio lo exige (`access_links.created_by_id`, `schedules.created_by_id`, `schedules.confirmed_by_id`, `schedule_generations.created_by_id`). La traza de las demás altas, cambios y borrados va en el log de la aplicación (`<ENTIDAD>_CREATED|UPDATED|DELETED`), sin datos personales.
- **SQL escrito a mano:** Prisma no modela los `CHECK` ni los índices únicos parciales. Están en el `migration.sql` de cada tabla (ver [Restricciones escritas a mano](#restricciones-escritas-a-mano)); un `prisma migrate dev` posterior puede proponer borrarlos, así que se revisa siempre el SQL generado.

## Inventario de tablas y migraciones

| Tabla | Modelo Prisma | Migración | Historia |
|---|---|---|---|
| `municipalities`, `schools`, `users` | `Municipality`, `School`, `User` | `20261008142315_add_municipalities_schools_users` | US01_b |
| `refresh_tokens` | `RefreshToken` | `20261009104834_add_refresh_tokens` | US01_c |
| `rate_limit_attempts` | `RateLimitAttempt` | `20261009211202_add_rate_limit_attempts` | US01_d |
| `users` (política de privacidad) | `User` | `20261014132125_add_privacy_policy_acceptance` | `publicacion-registro` |
| `refresh_tokens` (sin IP ni user agent) | `RefreshToken` | `20261015141957_drop_refresh_token_client_data` | `inicio-sesion` |
| `access_links` | `AccessLink` | `20261017180747_add_access_links` | US02_b3 |
| `courses`, `classes` | `Course`, `SchoolClass` | `20261019142532_add_courses_and_classes` | US05 |
| `professors` (y `classes.tutor_id`) | `Professor` | `20261020142755_add_professors` | US09 |
| `students` | `Student` | `20261021193052_add_students` | US14 |
| `calendars`, `calendar_periods` (y `courses.calendar_id`) | `Calendar`, `CalendarPeriod` | `20261023134046_add_calendars` | US-BASE |
| `subjects`, `subject_courses` | `Subject`, `SubjectCourse` | `20261026122302_add_subjects` | US-SUBJECT |
| `scheduling_constraints` | `SchedulingConstraint` | `20261030105431_add_scheduling_constraints` | US19_b |
| `scheduling_constraint_slots` | `SchedulingConstraintSlot` | `20261030153909_add_scheduling_constraint_slots` | US19_c |
| `professor_unavailabilities` | `ProfessorUnavailability` | `20261031133435_add_professor_unavailabilities` | US-PROF-AVAIL |
| `professor_assignments` (y `classes` `UNIQUE (id, course_id)`) | `ProfessorAssignment` | `20261031160000_add_professor_assignments` | US-PROF-ASSIGN |
| `schedules`, `schedule_entries`, `schedule_generations` | `Schedule`, `ScheduleEntry`, `ScheduleGeneration` | `20261104114453_add_schedule_tables` | US-ALGO-RUN |
| `schedules` (confirmación) | `Schedule` | `20261105173345_confirm_schedules` | US-ALGO-CONFIRM |
| `schedules.score`, `schedule_generations` (`improve`, `phase`, `score`) | `Schedule`, `ScheduleGeneration` | `20261106152430_schedule_score` | US-ALGO-RUN_b |
| `schedules.engine` y `schedule_generations.engine` (valor `ORTOOLS`) | `ScheduleEngine` | `20261109205641_schedule_engine_ortools` | US-ALGO-ORTOOLS |
| `schedule_generations.engine` (columna) | `ScheduleGeneration` | `20261110093415_schedule_generation_engine` | US-ALGO-ORTOOLS |

`20261006201558_init` es la migración inicial vacía. US08, US-SUBJECT_b/c, US19, US20, US-PROF-SUMMARY y las historias de ver el horario no tienen migración: reutilizan tablas existentes.

## Enumeraciones

| Enum | Valores | Se usa en |
|---|---|---|
| `UserRole` | `ADMIN`, `MEMBER` | `users.role`, `access_links.role` |
| `UserStatus` | `ACTIVE`, `SUSPENDED` (baja reactivable), `DELETED` | `users.status` |
| `AccessLinkPurpose` | `INVITATION`, `PASSWORD_RESET` | `access_links.purpose` |
| `ProfessorPosition` | `DIRECTOR`, `JEFE_ESTUDIOS` | `professors.position` (informativo, no concede permisos) |
| `CalendarPeriodKind` | `SESSION`, `BREAK` | `calendar_periods.kind` |
| `SubjectType` | `CORE`, `ELECTIVE`, `CUSTOM` | `subjects.type` |
| `SubjectStatus` | `ACTIVE`, `INACTIVE` | `subjects.status` |
| `SubjectColor` | `blue`, `indigo`, `purple`, `pink`, `red`, `orange`, `yellow`, `green`, `teal`, `cyan`, `brown`, `gray` | `subjects.color` (paleta cerrada; ampliarla exige una migración) |
| `ConstraintType` | `MAX_PER_DAY`, `BLOCK`, `FORBIDDEN_SLOTS`, `PREFERRED_SLOTS` | `scheduling_constraints.type` |
| `ScheduleStatus` | `DRAFT`, `OFFICIAL` | `schedules.status` |
| `ScheduleEngine` | `BACKTRACKING`, `ORTOOLS` | `schedules.engine`, `schedule_generations.engine` |
| `GenerationStatus` | `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` | `schedule_generations.status` |
| `GenerationPhase` | `SEARCHING`, `IMPROVING` | `schedule_generations.phase` |
| `GenerationErrorCode` | `NOT_READY`, `INFEASIBLE`, `TIMEOUT`, `INTERNAL` | `schedule_generations.error_code` |

---

## Módulo 1: Colegios, usuarios y autenticación

### municipalities

Municipios de la Comunitat Valenciana, según la relación oficial del INE. Son **datos fijos** que carga la propia migración (542 municipios: 141 de Alicante, 135 de Castellón y 266 de Valencia; relación a 1 de enero de 2026, sin dígito de control). Los usa la validación del registro y `GET /api/municipalities`. Para actualizarlos se añade una migración. `resetDatabase()` de los tests y la limpieza del E2E no vacían esta tabla.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `code` | CHAR(5) | PK | Código INE: 2 dígitos de provincia y 3 de municipio |
| `name` | VARCHAR(100) | NOT NULL | Nombre oficial, que puede tener dos formas (p. ej. «Alicante/Alacant») |
| `province` | VARCHAR(30) | NOT NULL | Provincia, tal como la nombra el INE |

Índices: PK `code`; IX `name` (buscador del formulario).

### schools

Colegios. Cada colegio aísla sus datos de los de los demás.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `name` | VARCHAR(150) | NOT NULL | Nombre tal como lo escribe el usuario |
| `normalized_name` | VARCHAR(150) | NOT NULL | En minúsculas, sin acentos y solo con letras y dígitos ASCII: «C.E.I.P. Nº 3» y «ceip n 3» dan `ceipn3` |
| `municipality_code` | CHAR(5) | NOT NULL, FK → `municipalities.code` | Municipio del colegio |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE (`normalized_name`, `municipality_code`) — un colegio es único por nombre y municipio (`409 SCHOOL_ALREADY_REGISTERED`).

### users

Usuarios con cuenta. Cada usuario pertenece a un único colegio y no está vinculado a una ficha de profesor.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | Colegio |
| `email` | VARCHAR(320) | NOT NULL, UNIQUE | Normalizado (sin espacios y en minúsculas), único en todo el sistema (`409 EMAIL_ALREADY_REGISTERED`) |
| `password_hash` | VARCHAR(60) | NOT NULL | Hash Bcrypt (cost 12). La contraseña admite de 8 caracteres a 72 bytes UTF-8, el límite de Bcrypt |
| `first_name`, `last_name` | VARCHAR(100) | NOT NULL | |
| `role` | `UserRole` | NOT NULL | |
| `status` | `UserStatus` | NOT NULL, DEFAULT `ACTIVE` | |
| `privacy_policy_accepted_at` | TIMESTAMPTZ | NULL | Instante en que se aceptó la política de privacidad |
| `privacy_policy_version` | VARCHAR(20) | NULL | Versión (`AAAA-MM-DD`) de la política aceptada; coincide con `PRIVACY_POLICY_VERSION` y con `privacyPolicy.lastUpdated` de `es.json` y `en.json` |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE `email`; IX `school_id`. CHECK `users_privacy_policy_acceptance_check`: las dos columnas de la política van juntas o ninguna.

Reglas de la aplicación: el usuario que registra el colegio es `ADMIN`; el resto entra por invitación. El registro y la aceptación de una invitación rellenan la política (la columna sigue admitiendo `NULL` porque el diseño original preveía aceptarla más tarde). Cada colegio tiene siempre al menos un `ADMIN` `ACTIVE` (`409 LAST_ADMIN_REQUIRED`). No hay verificación de email.

### refresh_tokens

Sesiones de los usuarios. El refresh token es un valor aleatorio de 256 bits que viaja en la cookie `refresh_token` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`); **solo se guarda su hash**.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7. Es el `sid` del access token |
| `user_id` | UUID | NOT NULL, FK → `users.id` `ON DELETE CASCADE` | Propietario |
| `token_hash` | CHAR(64) | NOT NULL, UNIQUE | SHA-256 en hexadecimal; nunca el token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Creación + 24 horas. La sesión no se renueva ni se rota: caducidad absoluta |
| `revoked_at` | TIMESTAMPTZ | NULL | Instante de la revocación; nulo mientras es válido. La revocación es idempotente y conserva el primer instante |
| `created_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE `token_hash`; IX `user_id`; IX `expires_at` (limpieza futura de caducados).

Un token es utilizable si existe, `revoked_at` es nulo, `expires_at` es futuro y su usuario está `ACTIVE`. **No guarda la IP ni el user agent** (se borraron en `20261015141957_drop_refresh_token_client_data`: ninguna funcionalidad los leía y conservarlos excedía la política de privacidad); solo quedan en los logs de actividad (30 días). Cada petición con bearer lee esta fila por clave primaria y por eso un cierre de sesión, una baja o un restablecimiento se aplican en la petición siguiente.

### rate_limit_attempts

Intentos de las operaciones limitadas por IP, compartidos entre todas las instancias del backend. Tabla de trabajo, sin relaciones con el resto del modelo.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `key` | VARCHAR(200) | NOT NULL | `<operación>:<ip>`, p. ej. `register:203.0.113.7`. Operaciones: `register`, `login`, `invitation`, `password-reset` |
| `attempted_at` | TIMESTAMPTZ | NOT NULL | Instante del intento, según el reloj de la aplicación |

Índices: PK `id`; IX (`key`, `attempted_at`).

Una fila por intento **aceptado** (un rechazado no se guarda). `PrismaAttemptRepository` serializa por clave con `pg_advisory_xact_lock`, borra los intentos fuera de la ventana de esa clave y cuenta antes de insertar. Ventana deslizante de 15 minutos; máximos: registro 5, login 10 fallidos, invitaciones y restablecimientos 10 con enlace no válido. El login y los enlaces reservan el intento antes de comprobar y lo liberan (`release`) si tiene éxito. La clave contiene una **IP, dato personal**: `backup.yml` borra cada día, antes de `pg_dump`, los de más de 24 horas (`infrastructure/supabase/purge-rate-limit-attempts.sql`), así que tampoco las copias los conservan más.

### access_links

Enlaces de acceso de un solo uso que genera un administrador: invitaciones y restablecimientos de contraseña. Solo se guarda el hash del token; el enlace completo se muestra una vez y no se puede recuperar.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | |
| `purpose` | `AccessLinkPurpose` | NOT NULL | |
| `token_hash` | CHAR(64) | NOT NULL, UNIQUE | SHA-256 del token (aleatorio, ≥ 128 bits) |
| `role` | `UserRole` | NULL | Rol del invitado. Obligatorio en las invitaciones, nulo en los restablecimientos |
| `user_id` | UUID | NULL, FK → `users.id` `ON DELETE RESTRICT` | Usuario afectado. Obligatorio en los restablecimientos, nulo en las invitaciones |
| `created_by_id` | UUID | NOT NULL, FK → `users.id` | Administrador que lo generó |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Creación + 72 horas |
| `used_at`, `revoked_at` | TIMESTAMPTZ | NULL | Cuándo se usó / se revocó |
| `created_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE `token_hash`; IX (`school_id`, `purpose`). A mano: CHECK `access_links_purpose_fields_check` y UNIQUE parcial `access_links_pending_reset_user_key` (un solo restablecimiento pendiente por usuario). Todas las claves ajenas son `RESTRICT`: no hay borrado en cascada de los enlaces.

El **estado no se guarda**: `accessLinkStatus` lo deduce (usado → revocado → caducado → pendiente) y un enlace deja de valer en el instante exacto de `expires_at`. Un enlace inválido, de cualquier causa, responde `410 ACCESS_LINK_INVALID`. Aceptar una invitación o confirmar un restablecimiento marca `used_at` con un `UPDATE` condicionado a «pendiente» y hace la escritura (crear el usuario, cambiar la contraseña y revocar todas sus sesiones) en la misma transacción, de modo que dos envíos simultáneos no lo usan dos veces. Al generar otro restablecimiento, la aplicación revoca todos los abiertos del usuario —también los caducados sin revocar, porque el índice parcial no mira `expires_at`— y reintenta una vez si dos administradores compiten.

---

## Módulo 2: Cursos, clases y alumnos

### courses

Cursos (niveles) de un colegio.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | |
| `name` | VARCHAR(100) | NOT NULL | Recortado y con los espacios colapsados |
| `normalized_name` | VARCHAR(100) | NOT NULL | En minúsculas; conserva acentos y `º`/`ª` |
| `calendar_id` | UUID | NULL, FK → `calendars.id` `ON DELETE SET NULL` | Calendario base que sigue el curso; como mucho uno |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE (`school_id`, `normalized_name`); IX `calendar_id`. No tiene `code`, `level`, `academic_year` ni `status`: ninguna historia los usa. El calendario se asigna desde el formulario del calendario; la API de los cursos no lo expone.

### classes

Clases o grupos (A, B…) de un curso. Modelo `SchoolClass`.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7. **Estable**: no cambia al renombrar la clase |
| `course_id` | UUID | NOT NULL, FK → `courses.id` `ON DELETE CASCADE` | |
| `tutor_id` | UUID | NULL, UNIQUE, FK → `professors.id` `ON DELETE SET NULL` | Tutor opcional. Un profesor tutoriza como mucho una clase |
| `name` | VARCHAR(10) | NOT NULL | |
| `normalized_name` | VARCHAR(10) | NOT NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE (`course_id`, `normalized_name`); UNIQUE `tutor_id` (`classes_tutor_id_key`; PostgreSQL admite varios nulos, así que varias clases sin tutor conviven); UNIQUE (`id`, `course_id`) (`classes_id_course_id_key`), que existe solo para la clave ajena compuesta de `professor_assignments` y `schedule_entries`: garantiza que la clase es del curso.

Editar un curso conserva las clases que llegan con su `id`, crea las nuevas y borra las ausentes; los índices únicos no son diferibles, así que renombrar y mover tutores se escribe **en dos fases** (primero a un valor provisional o a `NULL`, después al definitivo).

### students

Alumnos de un colegio.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | |
| `course_id` | UUID | NULL, FK → `courses.id` `ON DELETE SET NULL` | Obligatorio al crear, pero el alumno sigue existiendo sin curso si se borra |
| `class_id` | UUID | NULL, FK → `classes.id` `ON DELETE SET NULL` | Quitar solo la clase lo deja en su curso |
| `first_name`, `last_name` | VARCHAR(100) | NOT NULL | |
| `cafeteria` | BOOLEAN | NOT NULL | Si come en el comedor |
| `scholarship` | BOOLEAN | NULL | Beca de comedor. Nulo si no come en el comedor |
| `food_type` | VARCHAR(255) | NULL | Tipo de comida (**dato sensible**). Nulo si no come en el comedor o no se indicó |
| `observations` | TEXT | NULL | Observaciones (**dato sensible**); 5000 caracteres como máximo, que limita la aplicación |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; IX `school_id`; IX `course_id`; IX `class_id`. A mano: CHECK `students_cafeteria_check` (sin comedor no hay beca ni tipo de comida) y `students_scholarship_check` (con comedor la beca tiene respuesta).

`food_type` y `observations` pueden ser datos de salud de menores: nunca salen en el listado ni en los logs. No hay `email`, `status` ni asignación de alumnos a horarios (`student_schedules` no existe).

---

## Módulo 3: Profesores

### professors

Profesores de un colegio. Un profesor es un **registro del colegio, no una cuenta**.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | |
| `first_name`, `last_name` | VARCHAR(100) | NOT NULL | Sin unicidad: puede haber dos profesores con el mismo nombre |
| `position` | `ProfessorPosition` | NULL | Cargo; nulo = sin cargo. Informativo |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; IX `school_id`. Sin `email`, DNI, `status` ni `deleted_at`. La clase que tutoriza **no** se guarda aquí: se lee de `classes.tutor_id`, la fuente única de la relación 1:1. El borrado es real y deja libre su clase (`SET NULL`); sus tramos y asignaciones caen en cascada y sus entradas de horario quedan sin profesor.

### professor_unavailabilities

Tramos en los que un profesor **no** puede dar clase. Un profesor sin filas está disponible siempre. Se guardan **horas**, no números de sesión, porque un profesor da clase en cursos con calendarios distintos y la «sesión 3» no es la misma hora en todos.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | Duplica el del profesor para filtrar sin unir |
| `professor_id` | UUID | NOT NULL, FK → `professors.id` `ON DELETE CASCADE` | |
| `day_of_week` | SMALLINT | NOT NULL | 1 a 5 |
| `start_minute`, `end_minute` | SMALLINT | NOT NULL | El tramo es `[start_minute, end_minute)` |
| `created_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; IX `school_id`; IX `professor_id`. A mano: CHECK `_day_of_week_check` (1 a 5), `_start_minute_check` (≥ 0), `_end_minute_check` (≤ 1439) y `_range_check` (inicio < fin). Sin unicidad: la **normalización** es del dominio (`normalizeUnavailability`, que ordena los tramos y une los que se solapan o se tocan), así que lo mismo se guarda siempre igual. Una sesión `[s, e)` es imposible para el profesor si algún tramo `[a, b)` cumple `a < e` y `s < b` (HC4).

### professor_assignments

Quién imparte una asignatura en una clase: **una fila por `(asignatura, clase)`, con un solo profesor**. Las sesiones semanales no se repiten aquí: son las de `subject_courses.sessions_per_week`.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | |
| `professor_id` | UUID | NOT NULL, FK → `professors.id` `ON DELETE CASCADE` | |
| `subject_id`, `course_id` | UUID | NOT NULL, FK compuesta → `subject_courses (subject_id, course_id)` `ON DELETE CASCADE` | La asignatura **en ese curso** |
| `class_id` | UUID | NOT NULL, FK compuesta → `classes (id, course_id)` `ON DELETE CASCADE` | La clase, **del mismo curso** |
| `created_at` | TIMESTAMPTZ | NOT NULL | Se conserva al cambiar de profesor |

Índices: PK `id`; UNIQUE (`subject_id`, `class_id`); IX `professor_id`; IX `course_id`. Las dos claves compuestas comparten `course_id`, así que la fila solo existe si la asignatura se imparte en el curso y la clase es de él. Desaparece sola al quitar la asignatura del curso, borrar la asignatura, la clase, el curso o el profesor. Sin `CHECK`. Fuera del modelo: repartir una asignatura entre dos profesores y las especialidades.

---

## Módulo 4: Calendarios

### calendars

Calendarios base: una estructura de jornada (p. ej. «Primaria» o «Infantil») **igual de lunes a viernes**. Un colegio puede tener varios.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | |
| `name` | VARCHAR(100) | NOT NULL | |
| `normalized_name` | VARCHAR(100) | NOT NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE (`school_id`, `normalized_name`). No tiene fechas, año académico ni estado: es solo la estructura semanal. Cada curso sigue como máximo un calendario (`courses.calendar_id`); crear un calendario con un curso que ya seguía otro lo mueve. **Borrar** un calendario elimina sus periodos (cascada) y deja a sus cursos con `calendar_id` nulo; nunca los borra.

### calendar_periods

Un periodo de la jornada: una sesión o un recreo. Sustituye a `sessions` de la v2.1.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `calendar_id` | UUID | NOT NULL, FK → `calendars.id` `ON DELETE CASCADE` | |
| `position` | SMALLINT | NOT NULL | Orden en el día, desde 1 |
| `kind` | `CalendarPeriodKind` | NOT NULL | `SESSION` o `BREAK` |
| `start_minute`, `end_minute` | SMALLINT | NOT NULL | Minutos desde las 00:00 |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE (`calendar_id`, `position`). A mano: CHECK `calendar_periods_minutes_check` (`start_minute >= 0`, `end_minute <= 1439`, `end_minute > start_minute`). No hay `day_of_week`: los periodos valen de lunes a viernes. **El número de una sesión no se guarda**: es su orden entre las filas `SESSION`. Reglas de la aplicación: de 1 a 8 sesiones, de 0 a 2 recreos entre dos sesiones, hasta 90 minutos por periodo y sin solapes con el anterior (se permiten huecos). **Editar un calendario borra sus periodos y los vuelve a crear**, así que sus `id` cambian; nada los referencia.

---

## Módulo 5: Asignaturas y reglas de reparto

### subjects

Asignaturas de un colegio.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | |
| `name` | VARCHAR(100) | NOT NULL | |
| `normalized_name` | VARCHAR(100) | NOT NULL | |
| `code` | VARCHAR(10) | NULL | Código corto opcional, tal como se escribió; nunca una cadena vacía |
| `normalized_code` | VARCHAR(10) | NULL | En minúsculas; nulo cuando `code` es nulo |
| `type` | `SubjectType` | NOT NULL | |
| `status` | `SubjectStatus` | NOT NULL | Las asignaturas `INACTIVE` no cuentan en ninguna comprobación previa a generar |
| `description` | VARCHAR(500) | NULL | Nula si está vacía |
| `color` | `SubjectColor` | NOT NULL | Clave de una paleta cerrada de 12; puede repetirse. El aspecto vive en el frontend |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE (`school_id`, `normalized_name`) y UNIQUE (`school_id`, `normalized_code`). PostgreSQL trata los `NULL` como distintos en un índice único, así que varias asignaturas sin código no chocan y no hace falta un índice parcial. Con nombre y código repetidos se responde por el nombre (el primer índice). El borrado es real: libera el nombre y el código y arrastra `subject_courses` por la cascada.

### subject_courses

Curso en el que se imparte una asignatura y las sesiones semanales que lleva en él. **Fusiona** la unión M:M y la carga estándar de la v2.1 (`subject_standard_loads`).

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `subject_id` | UUID | PK, FK → `subjects.id` `ON DELETE CASCADE` | |
| `course_id` | UUID | PK, FK → `courses.id` `ON DELETE CASCADE` | |
| `sessions_per_week` | SMALLINT | NOT NULL | De 1 a 5 |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK (`subject_id`, `course_id`); IX `course_id`. A mano: CHECK `subject_courses_sessions_per_week_check` (1 a 5). Borrar un curso borra sus filas y la asignatura puede quedarse **sin cursos**: la regla «al menos un curso» se comprueba al guardar, no en la base de datos. Como `scheduling_constraints` y `professor_assignments` cuelgan de la pareja con una clave ajena compuesta en cascada, las dos pantallas que la editan (la asignatura y la carga horaria del curso) **aplican diferencias** en lugar de reemplazar las filas: un reemplazo borraría las reglas y las asignaciones en cada guardado. Las sesiones disponibles de un curso se calculan al leer (sesiones del calendario × 5) y no se guardan.

### scheduling_constraints

Reglas de reparto de una asignatura en un curso. Una fila por `(asignatura, curso, tipo)`. Sustituye a `restrictions` y `restriction_details` de la v2.1.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` | De la identidad, nunca del cliente |
| `subject_id`, `course_id` | UUID | NOT NULL, FK compuesta → `subject_courses (subject_id, course_id)` `ON DELETE CASCADE` | La pareja de la que cuelga |
| `type` | `ConstraintType` | NOT NULL | |
| `max_per_day` | SMALLINT | NULL | De 2 a 5; solo en `MAX_PER_DAY` (sin regla, el máximo es una sesión suelta al día) |
| `block_size` | SMALLINT | NULL | 2 o 3; solo en `BLOCK` |
| `created_at`, `updated_at` | TIMESTAMPTZ | NOT NULL | |

Índices: PK `id`; UNIQUE (`subject_id`, `course_id`, `type`); IX `course_id`; IX `school_id`. A mano: CHECK `_max_per_day_check`, `_block_check` y `_slots_check` (los tipos de franjas llevan las dos columnas nulas). Las reglas de franjas (`FORBIDDEN_SLOTS`, dura, y `PREFERRED_SLOTS`, blanda) tienen sus celdas en la tabla siguiente. La regla se borra al dejar de impartirse la asignatura en el curso, al borrar la asignatura y al borrar el curso.

### scheduling_constraint_slots

Celdas (día × sesión) de una regla de franjas. Sirve a las dos: una misma pareja puede tener prohibidas y preferidas con celdas en común (gana la prohibida).

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `constraint_id` | UUID | PK, FK → `scheduling_constraints.id` `ON DELETE CASCADE` | |
| `day_of_week` | SMALLINT | PK | 1 a 5 |
| `session_number` | SMALLINT | PK | **Orden** de la sesión entre las sesiones de la jornada del calendario del curso, no su hora; 1 a 8 |
| `created_at` | TIMESTAMPTZ | NOT NULL | |

Clave primaria de las tres columnas, que impide repetir una celda. A mano: CHECK `_day_of_week_check` (1 a 5) y `_session_number_check` (1 a 8; si US-BASE sube el máximo de sesiones, hay que cambiarlo con una migración). Una regla de franjas existe solo mientras tenga alguna celda (lo garantiza la aplicación). Si el calendario cambia, las celdas cuya sesión ya no existe se conservan, se ignoran al leer (con un aviso y su recuento) y se quitan cuando alguien guarda la cuadrícula.

---

## Módulo 6: Horarios generados

### schedules

Un horario generado: el **borrador** que produce la generación o el **oficial** que confirma el administrador. Confirmar promueve el borrador a `OFFICIAL` en su sitio, sin copiar entradas. El oficial **vigente** es el que no tiene `replaced_at`; al confirmar otro, el anterior recibe `replaced_at` y **se conserva** como histórico, con sus entradas. No se usa un estado `ARCHIVED`: PostgreSQL no deja usar en la misma migración un valor de enum que acaba de añadir.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` `ON DELETE CASCADE` | |
| `status` | `ScheduleStatus` | NOT NULL | |
| `engine` | `ScheduleEngine` | NOT NULL | Motor que encontró el horario válido que se mejoró; si OR-Tools falla y se usa el otro, `BACKTRACKING` |
| `placed_sessions` | INT | NOT NULL | Una entrada por sesión colocada |
| `generated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `created_by_id` | UUID | NOT NULL, FK → `users.id` | Administrador que inició la generación |
| `confirmed_at` | TIMESTAMPTZ | NULL | Nulo en un borrador |
| `confirmed_by_id` | UUID | NULL, FK → `users.id` `ON DELETE RESTRICT` | Nulo en un borrador |
| `replaced_at` | TIMESTAMPTZ | NULL | Nulo en un borrador y en el oficial vigente |
| `score` | JSONB | NULL | Puntuación al generarlo: `total`, `preferredMisses`, `preferredTotal`, `professorGaps`, `consecutiveDays` e `initialTotal`, seis enteros no negativos. Nulo en horarios anteriores a la historia. Se valida al leer (`isScheduleScore`): un JSON que no tenga esa forma se trata como nulo |

Índices: PK `id`; IX `school_id`. A mano: UNIQUE parcial `schedules_draft_key` sobre `school_id` donde `status = 'DRAFT'` (**un borrador por colegio**; una generación nueva sustituye al anterior) y UNIQUE parcial `schedules_official_key` sobre `school_id` donde `status = 'OFFICIAL' AND replaced_at IS NULL` (**un oficial vigente por colegio**). CHECK `schedules_placed_sessions_check` (`placed_sessions >= 0`), `schedules_draft_unconfirmed_check` (un borrador no lleva confirmación ni sustitución), `schedules_official_confirmed_check` (un oficial sí) y `schedules_replaced_after_confirmed_check` (`replaced_at` no es anterior a `confirmed_at`). Descartar un borrador lo borra; un oficial, vigente o sustituido, no se borra.

### schedule_entries

Una sesión colocada en un horario: una clase imparte una asignatura con un profesor en una celda.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `schedule_id` | UUID | NOT NULL, FK → `schedules.id` `ON DELETE CASCADE` | |
| `course_id`, `class_id` | UUID | NOT NULL, FK compuesta → `classes (id, course_id)` `ON DELETE CASCADE` | La clase es del curso |
| `subject_id` | UUID | NOT NULL, FK → `subjects.id` `ON DELETE CASCADE` | |
| `professor_id` | UUID | NULL, FK → `professors.id` `ON DELETE SET NULL` | Nulo si se borró el profesor: el borrador es desechable |
| `day_of_week` | SMALLINT | NOT NULL | 1 a 5 |
| `session_number` | SMALLINT | NOT NULL | Orden de la sesión en la jornada, 1 a 8 |
| `start_minute`, `end_minute` | SMALLINT | NOT NULL | **Copiados del calendario al generar**, para que el horario no cambie si después se edita el calendario. La sesión es `[start_minute, end_minute)` |

Índices: PK `id`; UNIQUE `schedule_entries_cell_key` sobre (`schedule_id`, `class_id`, `day_of_week`, `session_number`) — HC5, una asignatura por clase y hueco; IX `class_id`; IX `subject_id`; IX `professor_id`. A mano: CHECK `_day_of_week_check` (1 a 5), `_session_number_check` (1 a 8), `_start_minute_check` (≥ 0), `_end_minute_check` (≤ 1440) y `_range_check` (inicio < fin). **No hay clave única por profesor**: HC2 (un profesor en un solo sitio) se compara por intervalos de hora entre calendarios distintos y lo garantiza el validador del motor. Las franjas que la carga no llena **no tienen entrada**. No hay aulas.

### schedule_generations

Una ejecución del generador: la fila es la cola y el estado que consulta la pantalla. Sustituye a `schedule_generation_jobs` de la v2.1.

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | UUID | PK | UUIDv7 |
| `school_id` | UUID | NOT NULL, FK → `schools.id` `ON DELETE CASCADE` | |
| `created_by_id` | UUID | NOT NULL, FK → `users.id` | Administrador que la inició |
| `status` | `GenerationStatus` | NOT NULL, DEFAULT `QUEUED` | |
| `placed`, `total` | INT | NOT NULL, DEFAULT 0 | Sesiones colocadas (el máximo alcanzado) y sesiones que hay que colocar |
| `improve` | BOOLEAN | NOT NULL, DEFAULT true | Si se pidió mejorar el horario con las preferencias; las filas anteriores lo tienen activado |
| `phase` | `GenerationPhase` | NOT NULL, DEFAULT `SEARCHING` | No vuelve atrás |
| `engine` | `ScheduleEngine` | NOT NULL, DEFAULT `BACKTRACKING` | Motor que busca el horario o que lo encontró. Se fija al crearla con el motor configurado (`SCHEDULE_ENGINE`) y pasa a `BACKTRACKING` si OR-Tools falla; las filas anteriores son `BACKTRACKING` |
| `score` | JSONB | NULL | Puntuación del mejor horario hasta ahora; mismo JSON que `schedules.score` |
| `error_code` | `GenerationErrorCode` | NULL | |
| `error_message` | VARCHAR(500) | NULL | Texto corto en castellano, sin traza |
| `error_details` | JSONB | NULL | El motivo y la lección de `INFEASIBLE` |
| `schedule_id` | UUID | NULL, FK → `schedules.id` `ON DELETE SET NULL` | El borrador guardado; nulo si no terminó bien o si el horario se borró |
| `heartbeat_at` | TIMESTAMPTZ | NULL | Último latido del worker; sin latido durante 90 s la generación está atascada |
| `cancel_requested` | BOOLEAN | NOT NULL, DEFAULT false | Señal de cancelación que lee el worker |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `started_at`, `finished_at` | TIMESTAMPTZ | NULL | Reclamación por el worker y fin |

Índices: PK `id`; IX (`school_id`, `created_at`); IX `schedule_id`. A mano: UNIQUE parcial `schedule_generations_in_progress_key` sobre `school_id` donde `status IN ('QUEUED','RUNNING')` (**una sola generación en curso por colegio**: es la exclusión mutua, y dos peticiones simultáneas dan `409 GENERATION_IN_PROGRESS` al segundo) y CHECK `schedule_generations_progress_check` (`placed >= 0 AND total >= 0`). El worker reclama la fila con `UPDATE … WHERE status = 'QUEUED'`, que es la idempotencia que sustituye a los reintentos de Lambda (desactivados).

---

## Reglas de borrado y cascadas

| Al borrar… | Se borra en cascada | Queda con `NULL` | Lo impide (`RESTRICT`) |
|---|---|---|---|
| un **usuario** (la aplicación no los borra: cambia su `status`) | `refresh_tokens` | | enlaces de acceso y horarios que creó o confirmó |
| un **curso** | `classes`, `subject_courses` (y con ellas reglas, celdas y asignaciones) | `students.course_id`, `students.class_id` (por la clase) | |
| una **clase** | `professor_assignments`, `schedule_entries` | `students.class_id` | |
| una **asignatura** | `subject_courses` (y con ellas reglas, celdas y asignaciones), `schedule_entries` | | |
| un **profesor** | `professor_unavailabilities`, `professor_assignments` | `classes.tutor_id`, `schedule_entries.professor_id` | |
| un **calendario** | `calendar_periods` | `courses.calendar_id` | |
| un **horario** | `schedule_entries` | `schedule_generations.schedule_id` | |
| un **colegio** (la aplicación no los borra) | `schedules`, `schedule_generations` | | el resto de tablas del colegio |

## Datos personales y sensibles

- **Menores:** `students.food_type` y `students.observations` pueden ser datos de salud. No salen en el listado de alumnos ni en los logs, y hay tests que buscan esos textos en todo el log.
- **IP:** solo en `rate_limit_attempts.key` (24 horas) y en los logs de actividad (30 días). `refresh_tokens` no la guarda.
- **Secretos:** `password_hash` (Bcrypt), `refresh_tokens.token_hash` y `access_links.token_hash` (SHA-256). Nunca el valor en claro.
- **Política de privacidad:** `users.privacy_policy_accepted_at` y `privacy_policy_version` dejan constancia de qué texto se aceptó y cuándo.

## Restricciones escritas a mano

Los `CHECK` y los índices únicos parciales viven en el `migration.sql`, generado con `prisma migrate dev --create-only`. Cada uno tiene un test de integración que intenta romperlo con un `INSERT` directo (`*Schema.int.test.ts`).

| Tabla | Restricción | Regla |
|---|---|---|
| `users` | `users_privacy_policy_acceptance_check` | Fecha y versión de la política, juntas o ninguna |
| `access_links` | `access_links_purpose_fields_check` | `role` solo en invitaciones; `user_id` solo en restablecimientos |
| `access_links` | `access_links_pending_reset_user_key` (único parcial) | Un restablecimiento pendiente por usuario |
| `students` | `students_cafeteria_check`, `students_scholarship_check` | Sin comedor no hay beca ni tipo de comida; con comedor la beca tiene respuesta |
| `calendar_periods` | `calendar_periods_minutes_check` | `0 <= start_minute < end_minute <= 1439` |
| `subject_courses` | `subject_courses_sessions_per_week_check` | 1 a 5 sesiones por semana |
| `scheduling_constraints` | `_max_per_day_check`, `_block_check`, `_slots_check` | Cada tipo lleva solo su columna |
| `scheduling_constraint_slots` | `_day_of_week_check`, `_session_number_check` | Día 1 a 5, sesión 1 a 8 |
| `professor_unavailabilities` | `_day_of_week_check`, `_start_minute_check`, `_end_minute_check`, `_range_check` | Día 1 a 5; `0 <= start < end <= 1439` |
| `schedules` | `schedules_draft_key`, `schedules_official_key` (únicos parciales) | Un borrador y un oficial vigente por colegio |
| `schedules` | `_placed_sessions_check`, `_draft_unconfirmed_check`, `_official_confirmed_check`, `_replaced_after_confirmed_check` | Coherencia entre estado y confirmación |
| `schedule_entries` | `_day_of_week_check`, `_session_number_check`, `_start_minute_check`, `_end_minute_check`, `_range_check` | Día 1 a 5, sesión 1 a 8, `0 <= start < end <= 1440` |
| `schedule_generations` | `schedule_generations_in_progress_key` (único parcial) | Una generación en curso por colegio |
| `schedule_generations` | `schedule_generations_progress_check` | `placed` y `total` no negativos |

## Concurrencia

Cada escritura abre una transacción interactiva y bloquea con `SELECT … FOR UPDATE` / `FOR SHARE`, filtrando por colegio. El orden global, que evita ciclos, es: colegio (solo la gestión de usuarios) → calendario → cursos en orden de `id` → asignaturas en orden de `id` → profesores en orden de `id` → clases en orden de `id`. Las asignaciones de un curso toman primero el curso (`FOR UPDATE`) y después los profesores, las asignaturas del curso y sus clases (`FOR SHARE`). Los *advisory locks* son siempre `_xact_`, porque en producción la aplicación usa el _pooler_ de Supabase en modo transacción. Cuando dos escrituras no comparten bloqueo, la red de seguridad es el índice único y su violación se traduce a un error de dominio. El detalle de cada orden está en `backend/CLAUDE.md`.

## Cambios respecto a la v2.1

**Tablas de la v2.1 que ya no existen** (y por qué):

| v2.1 | Estado | Motivo |
|---|---|---|
| `roles`, `user_roles` | Eliminadas | El rol es un atributo de `users` dentro de su colegio (`ADMIN` o `MEMBER`) |
| `rooms` | Eliminada | El producto no gestiona aulas; no hay `room_id` en los horarios |
| `professor_subjects` | Eliminada | Lo que un profesor imparte sale de `professor_assignments` (HC6); no hay especialidades |
| `professor_availabilities` | Sustituida por `professor_unavailabilities` | Guarda solo los tramos **no** disponibles, en horas, no una fila por día y sesión |
| `sessions` | Sustituida por `calendar_periods` | Sin `day_of_week` (la jornada es igual de lunes a viernes); la hora va en minutos |
| `subject_standard_loads` | Fusionada en `subject_courses` | Tenía la misma clave; la carga es `sessions_per_week` |
| `restrictions`, `restriction_details` | Sustituidas por `scheduling_constraints` y `scheduling_constraint_slots` | La carga semanal vive en `subject_courses`, la disponibilidad en `professor_unavailabilities` y la ubicación única es una regla fija del algoritmo |
| `student_schedules` | Eliminada | Ninguna historia asigna alumnos a horarios; el horario se genera por clase |
| `schedule_generation_jobs` | Sustituida por `schedule_generations` | Es además la cola del worker |
| Vistas 1 a 7 y disparadores | Eliminados | Eran de MySQL y dependían de tablas que ya no existen; las reglas se aplican en el dominio y con `CHECK` e índices |

**Decisiones transversales:** claves `UUIDv7` en lugar de `INT AUTO_INCREMENT`; `school_id` en toda raíz de agregado; unicidad por colegio sobre un nombre normalizado; borrado real en lugar de `deleted_at`; sin `created_by`/`updated_by` genéricos; horas en minutos; PostgreSQL 17 en lugar de MySQL 8.

**Pendiente de decisión:** `settings` (configuración global clave-valor de la v2.1) **no está implementada** y ninguna historia la necesita todavía; la configuración vive en variables de entorno validadas en `config.ts` y en SSM. Si una historia la reclama, se diseñará con su `school_id` si la configuración es por colegio.

## Cómo actualizar este documento

1. Cambia primero `backend/prisma/schema.prisma` y crea la migración (`prisma migrate dev --create-only`, revisa el SQL).
2. Actualiza aquí la tabla afectada, el [inventario de migraciones](#inventario-de-tablas-y-migraciones), las [restricciones escritas a mano](#restricciones-escritas-a-mano) y el diagrama de `MODELO_DATOS_DIAGRAMA.md`.
3. Si una historia no toca el esquema pero cambia cómo se escribe una tabla (nuevo orden de bloqueo, nueva regla de la aplicación), anota la regla en la tabla correspondiente y en `backend/CLAUDE.md`.
