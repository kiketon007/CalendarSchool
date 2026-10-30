# Arquitectura Completa: CalendarSchool - Sistema de Generación de Horarios Escolares

**Versión:** 3.0  
**Fecha:** 2026-10-19  
**Estado:** 🚧 MVP en construcción. Están implementados y desplegados el registro, el inicio y el cierre de sesión, la gestión de los usuarios del colegio, las invitaciones, el restablecimiento de contraseña, la pantalla de bienvenida, los cursos con sus clases y los profesores con la clase que tutorizan. El resto del documento es **arquitectura objetivo**.  
**Clasificación:** Sistema de Optimización Complejos (Hard Constraints + CSP)

> **Cómo leer este documento.** ✅ marca lo que está construido y desplegado; 🎯 marca la **arquitectura objetivo**: diseño ya decidido que aún no existe en el código. La sección 0 resume el estado y cada sección posterior indica el suyo arriba. La fuente de verdad de lo construido es el código, `openspec/specs/` y los `CLAUDE.md` de `backend/` y `frontend/`.

---

## 📑 Índice

0. [Estado de implementación](#0-estado-de-implementación)
1. [Visión General](#1-visión-general)
2. [Diagrama de Componentes](#2-diagrama-de-componentes)
3. [Flujo de Datos End-to-End](#3-flujo-de-datos-end-to-end)
4. [Patrones de Diseño](#4-patrones-de-diseño)
5. [Algoritmo de Generación (CSP + Backtracking)](#5-algoritmo-de-generación-csp--backtracking)
6. [Puntos Críticos de Rendimiento](#6-puntos-críticos-de-rendimiento)
7. [Validaciones en Tiempo Real](#7-validaciones-en-tiempo-real)
8. [Auditoría y Trazabilidad GDPR](#8-auditoría-y-trazabilidad-gdpr)
9. [Seguridad](#9-seguridad)
10. [Estrategia de Testing](#10-estrategia-de-testing)
11. [Despliegue e Infraestructura](#11-despliegue-e-infraestructura)

---

## 0. Estado de implementación

### 0.1 Módulos

| Módulo | Estado | Historias |
|--------|--------|-----------|
| Esqueleto técnico: configuración, salud, tests, E2E, CI | ✅ | US00 |
| Registro de colegio y administrador, con captcha, consentimiento y límite de intentos | ✅ | US01_b a US01_f |
| Inicio de sesión, renovación y cierre de sesión | ✅ | US02, US03 |
| Usuarios del colegio: lista, cambio de rol, baja y reactivación | ✅ | US02_b1, US02_b2 |
| Invitaciones: generar, listar, revocar y aceptar | ✅ | US02_b3, US02_b4 |
| Restablecimiento de contraseña con enlace del administrador | ✅ | US02_c |
| Pantalla de bienvenida (`/onboarding`) con las funcionalidades «Próximamente» | ✅ | US04 |
| Cursos y sus clases: crear, listar con tabla o tarjetas y búsqueda por nombre, editar el nombre y las clases (que conservan su identidad al renombrarse) y borrar un curso con sus clases tras un diálogo que dice qué se pierde (cada clase puede tener un tutor, que se ve en el listado y en la edición) | ✅ | US05, US06, US07, US08 |
| Profesores: crear uno (nombre, apellidos, cargo y la clase que tutoriza, opcionales) y un listado con el total, la tutoría de cada uno, búsqueda por nombre y apellidos, paginación en el navegador (20 por página) edición (nombre, cargo y clase que tutoriza, que puede quitarse a otro profesor) y borrado (la clase que tutorizaba queda sin tutor); las asignaturas y la disponibilidad llegan con sus historias | ✅ | US09, US10, US11, US12 y US13 |
| Alumnos: crear, editar y borrar uno (nombre, apellidos, curso, clase opcional y datos de comedor: beca, tipo de comida y observaciones, que son datos sensibles y no salen en el listado) y su listado, que busca por nombre o apellidos, filtra por curso, clase, comedor y beca y pagina de 20 en 20 en el navegador, con los filtros y la página en la URL, que se conservan al editar o borrar un alumno; borrar un curso deja a sus alumnos sin curso ni clase; el número de alumnos de cada curso y clase en `/cursos` y la confirmación al quitar una clase con alumnos al editar el curso | ✅ | US14, US14_b, US15, US17 y US18 |
| Despliegue en AWS (CloudFront, S3, API Gateway, Lambda, Supabase) y copias | ✅ | `despliegue-aws` |
| Calendarios base: crear, listar, editar y borrar varios por colegio (nombre, sesiones y recreos de lunes a viernes) y asignarles cursos; solo los administradores crean, editan y borran, y un curso que se desmarca, o cuyo calendario se borra, queda sin calendario | ✅ | US-BASE, US-BASE_b y US-BASE_c |
| Asignaturas: crear, ver, editar (también inactivarlas) y borrar las del colegio (nombre, código opcional, tipo, estado, descripción y un color de una paleta cerrada) con los cursos en los que se imparten y sus sesiones semanales; filtros y búsqueda en el navegador; solo los administradores crean, editan y borran | ✅ | US-SUBJECT, US-SUBJECT_b y US-SUBJECT_c |
| Carga horaria por curso: ver el balance de sesiones frente al calendario del curso (sesiones al día × 5) con avisos que nunca impiden guardar, y ajustar la carga de cada asignatura (los administradores; todos la ven) guardando solo las filas que cambian | ✅ | US19 |
| Reglas de reparto de una asignatura en un curso: máximo de sesiones al día y bloques de 2 o 3 sesiones seguidas, escritas desde la matriz de la carga, con avisos por asignatura que no impiden guardar; las reglas caen con la pareja asignatura-curso y se avisa de las que se perderían | ✅ | US19_b |
| Reglas de reparto (máximo por día, bloques, franjas prohibidas y preferidas), su listado, aulas y otras restricciones | 🎯 | US19_b a US19_d, US20 y US21 en adelante |
| Generación de horarios (CSP + Backtracking), conflictos y visualización | 🎯 | US-ALGO |
| Gestión de comedor (alumnos, inscripciones, asistencia) | 🎯 | Por definir |
| Cola de trabajos, caché, notificaciones por email y exportaciones PDF/Excel | 🎯 | Cuando lo justifique una historia |

### 0.2 Lo construido

- **API** (contrato en `docs/api-spec.yml`, de donde salen los tipos del frontend): `POST /api/auth/register`, `/login`, `/refresh` y `/logout`; `GET /api/municipalities`; `GET /api/users`, `PUT /api/users/{id}/role`, `POST /api/users/{id}/suspend` y `/reactivate`; `POST /api/invitations`, `GET /api/invitations`, `POST /api/invitations/{id}/revoke`, `/lookup` y `/accept`; `POST /api/users/{id}/password-reset` y `.../revoke`; `POST /api/password-resets/lookup` y `/confirm`; `POST /api/courses`, `GET /api/courses`, `GET /api/courses/{id}`, `PUT /api/courses/{id}`, `GET /api/courses/{id}/impact` y `DELETE /api/courses/{id}`; `GET /api/health`.
- **Base de datos** (PostgreSQL 17, 15 tablas): `municipalities`, `schools`, `users`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `courses`, `classes`, `professors`, `students`, `calendars`, `calendar_periods`, `subjects`, `subject_courses` y `scheduling_constraints`. Roles `ADMIN` y `MEMBER`; estados de usuario `ACTIVE`, `SUSPENDED` y `DELETED`. Ver 2.0.3.
- **Frontend** (React 19, Vite): `/`, `/registro`, `/login`, `/privacidad`, `/invitacion`, `/restablecer`, y, con sesión, `/onboarding`, `/cursos`, `/cursos/nuevo` y `/usuarios` (solo `ADMIN`). Textos en español e inglés.
- **Calidad:** unitarios, integración con PostgreSQL real, E2E con Cypress y tests de la plantilla de CDK. Cobertura mínima del 90 % en backend y del 80 % en frontend. Ver 10.0.

### 0.3 Lo que sigue siendo objetivo

Todo lo que aparece en las secciones 2.1 y 2.2 y no figura arriba: BullMQ y Redis, Google OR-Tools, ElastiCache, SendGrid/SES, X-Ray, RDS/Aurora, las 15 tablas y las 7 vistas de calendarios, restricciones y horarios, los triggers de auditoría y la tabla `audit_logs`. El único bucket de S3 con datos de la aplicación guarda hoy las copias de seguridad, no exportaciones.

---

## 1. Visión General

### 1.1 Propósito

CalendarSchool resuelve el problema NP-Hard de generar horarios escolares respetando múltiples restricciones conflictivas:

- **SINGLE_LOCATION (HC2):** Profesor no puede estar en 2 aulas simultáneamente
- **AVAILABILITY (HC3):** Respetar disponibilidad de profesores
- **LOAD BALANCE (HC1):** Equilibrar carga horaria entre cursos
- **NO_DUPLICATE (HC4):** Evitar más de X sesiones misma asignatura/día
- **TIMESLOT COVERAGE (HC5):** Todas sesiones deben tener asignación válida
- **ROOM AVAILABILITY (HC6):** Aulas deben estar disponibles

### 1.2 Stack Tecnológico

| Capa | Tecnología | Estado | Notas |
|------|------------|--------|-------|
| **Backend** | Node.js 24 LTS + TypeScript + Express 5 | ✅ | DDD por capas con puertos y adaptadores |
| **Frontend** | React 19 + TypeScript + Bootstrap 5.3 (Vite), react-router, react-i18next | ✅ | Sin Redux ni Axios: estado de sesión en un contexto y `fetch` |
| **Base de datos** | PostgreSQL 17 (Supabase en producción, Docker en local) + Prisma 7 | ✅ | Migraciones explícitas con `prisma migrate deploy` |
| **Contrato de la API** | OpenAPI 3.1 (`docs/api-spec.yml`) + `openapi-typescript` | ✅ | Contrato primero; CI falla si los tipos no están al día |
| **Autenticación** | JWT HS256 (`jose`), Bcrypt (`@node-rs/bcrypt`), reCAPTCHA v3/v2 | ✅ | Ver 9.0 |
| **Validación** | Zod en el backend; reglas de campos compartidas con el frontend | ✅ | |
| **Testing** | Vitest + Testing Library + `axe-core`, Supertest, Cypress | ✅ | Ver 10.0 |
| **Despliegue** | AWS CDK: CloudFront + S3, API Gateway (HTTP API), Lambda, SSM, CloudWatch | ✅ | Ver 11.1 |
| **CI/CD** | GitHub Actions con OIDC (sin claves de larga duración) | ✅ | Ver 11.3 |
| **Motor de optimización** | Google OR-Tools / Backtracking propio | 🎯 | US-ALGO |
| **Cola de trabajos** | BullMQ (Redis) | 🎯 | Se justificará con la generación de horarios |
| **Caché** | ElastiCache (Redis) | 🎯 | |
| **Notificaciones** | SendGrid / SES | 🎯 | Hoy ningún flujo envía correo: los enlaces los copia el administrador |
| **Monitorización** | CloudWatch Logs (✅, 30 días); métricas, alarmas y X-Ray (🎯) | ✅ / 🎯 | |

### 1.3 Restricciones Críticas (Hard Constraints)

> 🎯 **Objetivo.** Las restricciones HC1-HC6 son el núcleo de la generación de horarios (US-ALGO) y todavía no existen en el código.

```
HC1: LOAD_BALANCE
└─ ∑(sesiones_profesor) ≤ capacidad_máxima
└─ Validación: BD (CHECK) + Algorithm (CSP)

HC2: SINGLE_LOCATION ⭐ CRÍTICA
└─ ¬ ∃(profesor_j en aula_a Y profesor_j en aula_b)
    con t ∈ mismo_día_sesión
└─ Validación: UNIQUE (profesorId, dayOfWeek, sessionNumber) 
└─ Detección: Vista schedule_conflicts_professor_overlap

HC3: AVAILABILITY
└─ sesión ∈ disponibilidad_profesor
└─ Validación: Algorithm (backtracking)

HC4: NO_DUPLICATE
└─ ¬ ∃ (asignatura_k aparece > X veces en día_d)
└─ Validación: CHECK + Algorithm

HC5: TIMESLOT_COVERAGE
└─ Todas las sesiones deben tener asignación válida
└─ Validación: Trigger (schedule_entries_coverage_check)

HC6: ROOM_AVAILABILITY
└─ Aula disponible en timeslot solicitado
└─ Validación: FK cascada + Algorithm
```

---

## 2. Diagrama de Componentes

### 2.0 Arquitectura implementada ✅

#### 2.0.1 Visión general

```
                         ┌───────────────────────── Google reCAPTCHA (v3 / v2) ─────────────────────────┐
                         │  script en la SPA (CSP)                         siteverify desde el backend  │
 Navegador (SPA React) ──┤                                                                              │
        │ HTTPS          └──────────────────────────────────────────────────────────────────────────────┘
        ▼
   CloudFront (app.calendarschools.es, CSP estricta)
        │ /*  (función spa-rewrite)               │ /api/*  + cabecera secreta X-Origin-Verify
        ▼                                         ▼
   S3 privado (frontend de Vite)          API Gateway (HTTP API, 10 req/s)
                                                  ▼
                                      AWS Lambda (Node.js 24, Express 5) ◄── SSM Parameter Store (secretos)
                                                  │  máx. 2 conexiones, TLS verificado
                                                  ▼
                                      Supabase PostgreSQL 17 (pooler en modo transacción)

   GitHub Actions ──OIDC──> despliegue (CDK, S3, CloudFront) y copia diaria (pg_dump ──> S3, 30 días)
```

La aplicación es un **monolito modular**: un único backend desplegado como una sola Lambda, con el frontend y la API en el mismo origen (sin CORS).

#### 2.0.2 Backend: capas y raíz de composición

Las dependencias apuntan siempre hacia el dominio. `composeApp(config, …)` es la **única** raíz de composición: crea el cliente Prisma, los adaptadores, los casos de uso y `createApp(deps)`. `server.ts` (local) y `lambda.ts` (AWS) son los dos puntos de entrada y no contienen lógica; solo ellos leen la configuración.

| Capa | Carpeta | Contenido actual |
|------|---------|------------------|
| **Presentación** | `src/presentation/` | Un router por recurso: `auth`, `users`, `invitations` (pública y autenticada), `passwordResets` (pública), `courses`, `workload` (la carga horaria de un curso, bajo `/api/courses/:id/workload`), `professors`, `students`, `calendars`, `subjects`, `municipality`, `health`. Capa HTTP común en `http/`: formato `success`/`data`/`error`, `errorHandler`, `requestTimeout`, `noStore`, `requireOriginVerification`, `requireAllowedOrigin`, `requireAuthentication` y `requireRole`. `lambda/` adapta Express a la HTTP API. |
| **Aplicación** | `src/application/` | Un caso de uso por operación, con sus puertos: `RegisterSchool`, `LogIn`, `RefreshSession`, `LogOut`, `AuthenticateRequest`, `ListSchoolUsers`, `ManageSchoolUser`, `CreateInvitation`, `ListPendingInvitations`, `RevokeInvitation`, `LookupInvitation`, `AcceptInvitation`, `CreatePasswordReset`, `RevokePasswordReset`, `LookupPasswordReset`, `ConfirmPasswordReset`, `CreateProfessor`, `ListProfessors`, `GetProfessor`, `UpdateProfessor`, `DeleteProfessor`, `CreateStudent`, `ListStudents`, `GetStudent`, `UpdateStudent`, `DeleteStudent`, `CreateCourse`, `ListCourses`, `GetCourse`, `UpdateCourse`, `GetCourseDeletionImpact`, `DeleteCourse`, `ListMunicipalities` y `CheckHealth`. `attempts/` contiene el limitador de intentos genérico, que reutilizan el registro, el login, las invitaciones y los restablecimientos. |
| **Dominio** | `src/domain/` | Reglas puras y puertos de repositorio por agregado: `accessLink` (estado deducido y errores), `user` (`planUserChange`: baja propia, último administrador, idempotencia), `session`, `school`, `course` (nombres limpios y normalizados, `CourseAlreadyExists`), `professor` (`ClassNotFound`, `ClassAlreadyHasTutor`), `student` (`CourseNotFound`, `ClassNotFound`), `attempts`, `login`, `municipality` y `privacy`. |
| **Infraestructura** | `src/infrastructure/` | Adaptadores: repositorios Prisma, `BcryptPasswordHasher`, `JoseTokenIssuer`, `CryptoSecretTokenGenerator`, `UuidV7IdGenerator`, `RecaptchaCaptchaVerifier` y `FakeCaptchaVerifier`, logger JSON, configuración y lectura de SSM (`aws/`). |

Tres tipos de ruta, según cómo se protegen:

| Tipo | Endpoints | Protección |
|------|-----------|------------|
| **Con cookie de sesión** | `/api/auth/register`, `/login`, `/refresh`, `/logout` | `requireAllowedOrigin` (compara `Origin` con `APP_ORIGIN`; no hay CORS), límite de intentos por IP y captcha en registro y login |
| **Públicas con token en el cuerpo** | `/api/invitations/lookup` y `/accept`, `/api/password-resets/lookup` y `/confirm` | Sin sesión ni cookies; límite de intentos con enlaces no válidos por IP; `410` sin distinguir la causa |
| **Con access token** | `/api/users/**` y `/api/invitations` (generar, listar, revocar) | `requireAuthentication` → `requireRole('ADMIN')`; la identidad sale de la base de datos |
| **Con access token, `ADMIN` para escribir** | `POST /api/calendars`, `PUT /api/calendars/{id}` y `DELETE /api/calendars/{id}`; `POST /api/subjects`, `PUT /api/subjects/{id}` y `DELETE /api/subjects/{id}`; `PATCH /api/courses/{id}/workload` | `requireAuthentication` → `requireRole('ADMIN')` antes de leer el `id` y el cuerpo; `GET /api/calendars`, `GET /api/calendars/{id}`, `GET /api/subjects`, `GET /api/subjects/{id}` y `GET /api/courses/{id}/workload` son para cualquier rol |
| **Con access token, cualquier rol** | `/api/courses`, `/api/courses/{id}`, `/api/courses/{id}/impact`, `/api/professors`, `/api/students` y `/api/students/{id}` | Solo `requireAuthentication`: los usan `ADMIN` y `MEMBER`; el colegio sale de la identidad |

`GET /api/municipalities` y `GET /api/health` son públicas; todo `/api` lleva `Cache-Control: no-store` salvo la lista de municipios.

#### 2.0.3 Datos

```
schools 1 ───< users 1 ───< refresh_tokens          (el id de la sesión es el `sid` del access token)
   │              │
   │              └──────< access_links >─── users   (creado por / afectado)
   └──< access_links
municipalities 1 ───< schools                       rate_limit_attempts (sin relaciones: clave `<operación>:<ip>`)
schools 1 ───< courses 1 ───< classes
schools 1 ───< students >───o courses / classes  (course_id y class_id: nulos y ON DELETE SET NULL; el alumno sobrevive al curso)
schools 1 ───< calendars 1 ───< calendar_periods   (borrado en cascada; el orden es `position`)
calendars 1 ───o courses                            (courses.calendar_id: nulo y ON DELETE SET NULL; un curso sigue como máximo un calendario)
schools 1 ───< professors 1 ───o classes            (classes.tutor_id: nulo, único y ON DELETE SET NULL; un profesor tutoriza una sola clase)
schools 1 ───< subjects 1 ───< subject_courses >─── courses   (borrado en cascada por los dos lados; clave primaria (subject_id, course_id) con sessions_per_week de 1 a 5; una asignatura puede quedarse sin cursos; la edición aplica diferencias, para conservar las reglas de reparto que cuelgan de cada pareja, y el borrado de la asignatura las arrastra)
```

| Tabla | Contenido |
|-------|-----------|
| `municipalities` | Municipios de la Comunitat Valenciana. Datos fijos cargados por migración |
| `schools` | Colegio. Único por nombre normalizado y municipio |
| `users` | Pertenece a un único colegio. `role` (`ADMIN`/`MEMBER`) y `status` son columnas, no hay tablas `roles` ni `user_roles`. Guarda la fecha y la versión de la política de privacidad aceptada |
| `refresh_tokens` | Sesión: solo el SHA-256 del token, caducidad absoluta de 24 horas y `revoked_at` |
| `rate_limit_attempts` | Un intento aceptado por fila, para el límite por IP. Se purga a las 24 horas |
| `access_links` | Invitaciones y restablecimientos (`purpose`): solo el SHA-256 del token, caducidad de 72 horas, `used_at` y `revoked_at`. El estado se deduce, no se guarda |
| `courses` | Curso de un colegio. `name` (el que se muestra) y `normalized_name` (recortado, espacios colapsados y en minúsculas); único por colegio y nombre normalizado |
| `classes` | Clase de un curso (A, B…), con borrado en cascada. Única por curso y nombre normalizado. Su `id` no cambia al renombrarla (US07), para que lo que cuelgue de ella después (tutores, alumnos, horarios) la siga encontrando. `tutor_id` (US09): nulo, único y `ON DELETE SET NULL`, así que un profesor tutoriza una sola clase y una clase tiene un solo tutor, y borrar la clase o el curso deja libre al profesor |
| `professors` | Profesor de un colegio (US09): `first_name`, `last_name`, `position` opcional (`DIRECTOR` o `JEFE_ESTUDIOS`, informativo) y fechas. Es un registro del colegio, no una cuenta: sin email ni DNI y sin borrado lógico. La clase que tutoriza se lee de `classes.tutor_id`; las asignaturas (`subjects: []` en el contrato) llegan con `US-PROF-ASSIGN` |
| `calendars` | Calendario base de un colegio (US-BASE): `name` y `normalized_name` (único por colegio). Sin fechas ni estado: la jornada es la misma de lunes a viernes |
| `calendar_periods` | Periodo de un calendario: `position` (único por calendario), `kind` (`SESSION` o `BREAK`) y la hora como minutos desde medianoche (`start_minute`, `end_minute`, con un `CHECK`). El número de sesión se deduce del orden |
| `subjects` | Asignatura de un colegio (US-SUBJECT): `name` y `normalized_name` (único por colegio), `code` y `normalized_code` opcionales (único por colegio si existe; los nulos no chocan), `type` (`CORE`, `ELECTIVE`, `CUSTOM`), `status` (`ACTIVE`, `INACTIVE`), `description` opcional y `color`, una clave de una paleta cerrada de 12 (enum de PostgreSQL; el aspecto vive en el frontend). Sin borrado lógico ni autoría |
| `scheduling_constraints` | Reglas de reparto de una asignatura en un curso (US19_b): una fila por `(subject_id, course_id, type)` con `max_per_day` (2 a 5) o `block_size` (2 o 3) según el tipo, y una clave ajena compuesta a `subject_courses` con `ON DELETE CASCADE` (caen con la pareja). Tres `CHECK` escritos a mano. Los tipos de franjas (`FORBIDDEN_SLOTS`, `PREFERRED_SLOTS`) están en el enum para US19_c y US19_d |
| `subject_courses` | Cursos en los que se imparte una asignatura (US-SUBJECT): clave primaria `(subject_id, course_id)` y `sessions_per_week`, con un `CHECK` escrito a mano (de 1 a 5). Una sola tabla en lugar de una unión y otra de cargas, así que un curso marcado siempre lleva su carga. `ON DELETE CASCADE` por los dos lados. La edición (US-SUBJECT_b) la reemplaza en una transacción y el borrado de la asignatura (US-SUBJECT_c) la elimina por la cascada. La carga horaria por curso (US19) la escribe por diferencias (solo las filas que cambian) |
| `students` | Alumno de un colegio (US14): `first_name`, `last_name`, `course_id` y `class_id` (nulos, `ON DELETE SET NULL`: si se borra el curso o la clase el alumno sigue existiendo sin ellos), `cafeteria`, `scholarship` (beca de comedor, nula sin comedor), `food_type` y `observations` (datos sensibles: nunca en el listado ni en los logs) y fechas. Dos `CHECK` escritos a mano: sin comedor no hay beca ni tipo de comida, y con comedor la beca tiene respuesta. Sin estado, email ni borrado lógico |

Todo puerto que lee o escribe datos de un colegio recibe `schoolId` como parámetro obligatorio, tomado de la identidad y nunca del cliente. Los UUID son v7 y los genera la aplicación.

#### 2.0.4 Frontend

```
main.tsx ─> BrowserRouter ─> SessionProvider ─> App (rutas)
                                   │
   públicas:  /  /registro  /login  /privacidad  /invitacion  /restablecer
   con sesión: AuthenticatedLayout (única guarda de sesión + AppHeader)
                  ├─ /onboarding   bienvenida: funcionalidades «Próximamente» y atajo a Usuarios
                  ├─ /cursos, /cursos/nuevo   listado de cursos con sus clases y formulario de alta (ADMIN y MEMBER)
                  ├─ /calendarios   listado de calendarios base (ADMIN y MEMBER)
                  ├─ /asignaturas   listado de asignaturas con filtros y búsqueda, y «Editar» y «Borrar» solo para ADMIN (ADMIN y MEMBER)
                  └─ RequireRole(ADMIN) ─> /usuarios, /calendarios/nuevo, /calendarios/:id/editar, /asignaturas/nueva, /asignaturas/:id/editar   usuarios, invitaciones y restablecimientos
```

- **Sesión:** `SessionProvider` guarda el access token y el usuario solo en memoria, renueva una vez al montar y avisa del cierre a las otras pestañas con `BroadcastChannel`. `authorizedFetch` añade el `Bearer` y, ante un `401 INVALID_SESSION`, renueva una vez y repite una vez.
- **Servicios:** uno por recurso (`usersService`, `invitationsService`, `passwordResetService`…). Devuelven un resultado por caso, interpretan la respuesta por `error.code` y nunca lanzan.
- **Páginas públicas con enlace:** leen el token del fragmento de la URL, lo quitan de la barra con `replaceState` y lo envían en el cuerpo.
- **Transversal:** textos solo en `es.json` y `en.json`, validación de campos compartida con el backend, módulo `captcha/` y CSP definida en `content-security-policy.json`, la misma que sirve `vite preview`.

### 2.1 Diagrama de Arquitectura en Capas 🎯 (objetivo)

> Diseño al que se llegará con las historias de calendarios, restricciones y horarios. Hoy solo están implementadas la autenticación y los usuarios del colegio (ver 2.0): no existen los controladores, servicios, tablas, vistas ni la cola que aquí aparecen, salvo `users` y `refresh_tokens`, con otro esquema.

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPA DE PRESENTACIÓN                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ React 19 + TypeScript + Bootstrap 5.3                       │ │
│  │ ├─ Dashboard (Resumen estado)                               │ │
│  │ ├─ CalendarConfig (US-BASE)                                 │ │
│  │ ├─ SubjectManager (US-SUBJECT)                              │ │
│  │ ├─ RestrictionBuilder (US19)                                │ │
│  │ ├─ RestrictionViewer (US20)                                 │ │
│  │ ├─ ScheduleGenerator (US-ALGO)                              │ │
│  │ └─ ScheduleViewer (Visualización)                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                    ↓ HTTP/WebSocket ↓                            │
├─────────────────────────────────────────────────────────────────┤
│                   CAPA DE APLICACIÓN                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Express.js + TypeScript (Backend API)                       │ │
│  ├─ Controllers                                                │ │
│  │  ├─ CalendarController (CRUD + sesiones)                    │ │
│  │  ├─ SubjectController (CRUD + asociaciones)                 │ │
│  │  ├─ RestrictionController (Crear + listar + validar)        │ │
│  │  ├─ ScheduleController (Generar + status + visualizar)      │ │
│  │  └─ AuthController (Login + logout + refresh)               │ │
│  │                                                              │ │
│  ├─ Services (Business Logic)                                  │ │
│  │  ├─ CalendarService (Config temporal)                       │ │
│  │  ├─ SubjectService (Gestión asignaturas)                    │ │
│  │  ├─ RestrictionService (Validación + cálculos)              │ │
│  │  ├─ ScheduleGeneratorService (Orquestación)                 │ │
│  │  │  ├─ CSPSolver (Constraint Satisfaction Problem)          │ │
│  │  │  └─ BacktrackSolver (Alternativa determinística)         │ │
│  │  └─ AuthService (JWT + refresh tokens)                      │ │
│  │                                                              │ │
│  ├─ Middleware                                                 │ │
│  │  ├─ AuthMiddleware (JWT validation)                         │ │
│  │  ├─ ErrorHandler (Manejo global errores)                    │ │
│  │  ├─ ValidationMiddleware (Schemas Zod/Joi)                  │ │
│  │  ├─ LoggingMiddleware (Auditoría)                           │ │
│  │  └─ RateLimiter (API throttling)                            │ │
│  │                                                              │ │
│  └─ Job Queue (BullMQ)                                         │ │
│     ├─ ScheduleGenerationJob (Async, timeout 120s)             │ │
│     └─ CleanupJob (Tokens expirados, cron diario)              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                    ↓ Query/Event ↓                              │
├─────────────────────────────────────────────────────────────────┤
│                   CAPA DE DATOS                                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ PostgreSQL 17 (ACID, JSON, Full-text search)               │ │
│  │                                                              │ │
│  │ Módulo 1: Autenticación                                    │ │
│  │  ├─ users                                                   │ │
│  │  ├─ roles                                                   │ │
│  │  ├─ user_roles                                              │ │
│  │  ├─ settings                                                │ │
│  │  └─ refresh_tokens ⭐ (Revocación JWT)                      │ │
│  │                                                              │ │
│  │ Módulo 2: Configuración Horarios                           │ │
│  │  ├─ calendars (Estructura base)                             │ │
│  │  ├─ sessions (1-8 sesiones + 0-2 recreos)                   │ │
│  │  ├─ subjects (Asignaturas con tipos)                        │ │
│  │  ├─ subject_courses (M:M asignatura-curso)                  │ │
│  │  └─ rooms (Aulas disponibles)                               │ │
│  │                                                              │ │
│  │ Módulo 3: Restricciones                                    │ │
│  │  ├─ restrictions (Definición)                               │ │
│  │  │  └─ type: HOURS_PER_WEEK|AVAILABILITY|NO_DUPLICATE      │ │
│  │  ├─ professor_availabilities (Matriz L-V × sesiones)        │ │
│  │  └─ restriction_audit_trail (Auditoría)                     │ │
│  │                                                              │ │
│  │ Módulo 4: Horarios Generados                               │ │
│  │  ├─ schedules (Cabecera + metadata)                         │ │
│  │  ├─ schedule_entries (Asignaciones: clase+asig+prof+aula)   │ │
│  │  ├─ schedule_generation_jobs (Tracking + errores)           │ │
│  │  └─ schedule_conflicts_* (Vistas detección)                 │ │
│  │                                                              │ │
│  │ Vistas de Análisis (7 vistas)                              │ │
│  │  ├─ professor_schedule (Horario profesor completo)          │ │
│  │  ├─ schedule_conflicts_professor_overlap (HC2: CRÍTICA)     │ │
│  │  ├─ schedule_conflicts_availability (HC3)                   │ │
│  │  ├─ schedule_conflicts_no_room (HC6)                        │ │
│  │  ├─ professor_load_summary (Carga horaria)                  │ │
│  │  ├─ professor_availability_summary (% disponible)           │ │
│  │  └─ restriction_audit_trail (Cambios restricciones)         │ │
│  │                                                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                    ↓ ORM (Prisma) ↓                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Índices Críticos (Covering)                                │ │
│  │ ├─ IX_schedules_calendar_status (Búsquedas rápidas)         │ │
│  │ ├─ IX_professor_overlap_detection (SINGLE_LOCATION)         │ │
│  │ ├─ IX_availability_check (AVAILABILITY)                     │ │
│  │ ├─ IX_subjects_name_ci (Search case-insensitive US11)       │ │
│  │ └─ [+11 más] (Ver sección de Índices)                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│              SERVICIOS EXTERNOS & INFRAESTRUCTURA                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ AWS Lambda (Función serverless)                             │ │
│  │  ├─ Trigger: API Gateway                                    │ │
│  │  ├─ Concurrency: 100 (configurable)                         │ │
│  │  └─ Timeout: 900s (máx Lambda)                              │ │
│  │                                                              │ │
│  │ AWS RDS PostgreSQL (BD gestionada)                          │ │
│  │  ├─ Multi-AZ (HA)                                           │ │
│  │  ├─ Backup automático (diario)                              │ │
│  │  └─ Read replicas (si escala)                               │ │
│  │                                                              │ │
│  │ AWS ElastiCache (Redis para BullMQ)                         │ │
│  │  ├─ Cluster mode: Sí (HA)                                   │ │
│  │  └─ TTL: Auto-cleanup                                       │ │
│  │                                                              │ │
│  │ CloudWatch (Monitoring)                                     │ │
│  │  ├─ Logs: Lambda + API requests                             │ │
│  │  ├─ Metrics: Response time, errors, duration jobs           │ │
│  │  └─ Alarms: P95 latency, error rate > 5%                    │ │
│  │                                                              │ │
│  │ Google OR-Tools (CSP solver)                                │ │
│  │  ├─ Deployment: Lambda layer                                │ │
│  │  ├─ Timeout: 60s (hardcoded)                                │ │
│  │  └─ Fallback: Backtrack solver si timeout                   │ │
│  │                                                              │ │
│  │ SendGrid / SES (Email)                                      │ │
│  │  └─ Notificaciones: Horario generado, errores, cambios      │ │
│  │                                                              │ │
│  │ S3 (Object Storage)                                         │ │
│  │  └─ Almacenamiento: PDFs/Excels exportados                  │ │
│  │                                                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Diagrama de Módulos 🎯 (objetivo)

```
                    ┌─────────────────────┐
                    │  FRONTEND (React)   │
                    └──────────┬──────────┘
                               │ API HTTP
                    ┌──────────▼──────────┐
                    │  API GATEWAY        │
                    │  (Express.js)       │
                    └──────────┬──────────┘
                               │
                ┌──────────────┼──────────────┐
                │              │              │
        ┌───────▼───────┐ ┌────▼─────┐ ┌────▼──────┐
        │  CALENDAR     │ │ SUBJECT  │ │RESTRICTION│
        │  SERVICE      │ │ SERVICE  │ │ SERVICE   │
        │               │ │          │ │           │
        │ ├─ Create     │ │├─ CRUD   │ │├─ Create  │
        │ ├─ Edit       │ ││├─ Assoc │ ││├─ List   │
        │ ├─ Delete     │ ││└─ Types │ │││├─ Sum    │
        │ └─ Generate   │ │└────────┘ │││└─ Validate
        │   Sessions   │ │            │ │            │
        └───────┬───────┘ └────────────┘ └────┬──────┘
                │                             │
                └──────────────┬──────────────┘
                               │
        ┌──────────────────────▼──────────────────────┐
        │  SCHEDULE GENERATOR SERVICE                │
        │  (Orquestación + Algoritmos)               │
        │                                            │
        │  ┌────────────────────────────────────┐   │
        │  │  CSP Solver (Google OR-Tools)      │   │
        │  │  ├─ Timeout: 60s                   │   │
        │  │  ├─ Determinístico: Sí              │   │
        │  │  └─ Retorna: solución óptima        │   │
        │  └────────────────────────────────────┘   │
        │                                            │
        │  ┌────────────────────────────────────┐   │
        │  │  Backtrack Solver                  │   │
        │  │  ├─ Timeout: 120s                  │   │
        │  │  ├─ Fallback: Si CSP falla         │   │
        │  │  └─ Retorna: primera solución válida   │
        │  └────────────────────────────────────┘   │
        │                                            │
        │  ┌────────────────────────────────────┐   │
        │  │  Conflict Detector                 │   │
        │  │  ├─ HC2: SINGLE_LOCATION (critical)    │
        │  │  ├─ HC3: AVAILABILITY              │   │
        │  │  ├─ HC4: NO_DUPLICATE              │   │
        │  │  └─ HC1,5,6: Otros                 │   │
        │  └────────────────────────────────────┘   │
        │                                            │
        └──────────────────┬───────────────────────┘
                           │
        ┌──────────────────▼───────────────────┐
        │  BULL MQ (Background Jobs)           │
        │                                      │
        │  ├─ ScheduleGenerationJob            │
        │  │  ├─ Status: queued → processing   │
        │  │  ├─ Progress: 0-100%              │
        │  │  └─ Result: success/error/timeout │
        │  │                                   │
        │  ├─ CleanupJob (cron daily)         │
        │  │  └─ Delete: expired tokens        │
        │  │                                   │
        │  └─ NotificationJob                  │
        │     └─ Email: horario generado       │
        │                                      │
        └──────────────────┬───────────────────┘
                           │
        ┌──────────────────▼───────────────────┐
        │  PostgreSQL (Prisma ORM)             │
        │                                      │
        │  └─ 23 Tablas + 7 Vistas             │
        │     (Ver diagrama anterior)          │
        │                                      │
        └──────────────────────────────────────┘
```

---

## 3. Flujo de Datos End-to-End

### 3.1 Flujo Completo: Configuración → Generación 🎯 (objetivo)

> Los flujos 3.1 y 3.2 pertenecen a la generación de horarios, aún no implementada. Los flujos que sí funcionan están en 3.3.

```
┌─ FASE 1: CONFIGURACIÓN (US-BASE, US-SUBJECT, US19, US20) ─┐
│                                                             │
│ 1. Usuario (ADMIN)         accede a CalendarSchool       │
│    ├─ Autentica: username + password                       │
│    └─ Backend genera: access_token + refresh_token         │
│       └─ Guarda tokenHash en refresh_tokens (revocable)   │
│                                                             │
│ 2. Configura Calendario Base (US-BASE)                     │
│    ├─ POST /api/calendars                                  │
│    │  ├─ Body:                                             │
│    │  │  ├─ name: "Primaria 2026-27"                       │
│    │  │  ├─ startDate: 2026-09-01                          │
│    │  │  ├─ endDate: 2027-06-15                            │
│    │  │  ├─ sessions:                                      │
│    │  │  │  ├─ {startTime: "09:00", endTime: "09:45"}      │
│    │  │  │  ├─ {startTime: "09:45", endTime: "10:30"}      │
│    │  │  │  └─ ... (6 sesiones)                            │
│    │  │  └─ breaks:                                        │
│    │  │     ├─ {afterSession: 3, startTime: "11:15",       │
│    │  │        endTime: "11:45"}                           │
│    │  │     └─ {afterSession: 5, ...} (opcional)           │
│    │  │                                                     │
│    │  ├─ Validaciones (Backend):                           │
│    │  │  ├─ startTime < endTime ✓                          │
│    │  │  ├─ No solapamientos ✓                             │
│    │  │  ├─ Duración sesión ≤ 90 min ✓                    │
│    │  │  ├─ Max 8 sesiones ✓                               │
│    │  │  └─ Transacción ACID (inicio/rollback) ✓           │
│    │  │                                                     │
│    │  └─ Response: 201 Created                             │
│    │     ├─ calendarId: 42                                 │
│    │     └─ sessions: [...23 franjas útiles]               │
│    │                                                        │
│    │ 📊 BD: INSERT calendars, sessions (trigger auto)      │
│    │    └─ Índice: IX_calendars_status para búsquedas      │
│    │                                                        │
│    └─ Frontend: Toast "Calendario creado" + redirige       │
│                                                             │
│ 3. Crea Asignaturas (US-SUBJECT)                           │
│    ├─ POST /api/subjects                                   │
│    │  ├─ Body:                                             │
│    │  │  ├─ name: "Inglés"                                 │
│    │  │  ├─ type: "CORE"                                   │
│    │  │  └─ associatedCourses: [1, 2, 3]                   │
│    │  │                                                     │
│    │  ├─ Validaciones:                                     │
│    │  │  ├─ name UNIQUE + NOT NULL ✓                       │
│    │  │  ├─ type in (CORE|ELECTIVE|CUSTOM) ✓              │
│    │  │  └─ cursos existen (FK) ✓                          │
│    │  │                                                     │
│    │  └─ Response: 201 Created                             │
│    │     └─ subjectId: 7                                   │
│    │                                                        │
│    │ 📊 BD: INSERT subjects, subject_courses (M:M)         │
│    │                                                        │
│    └─ Repite para todas asignaturas (Lengua, Mate, etc)   │
│                                                             │
│ 4. Define Restricciones (US19)                             │
│    ├─ POST /api/restrictions                               │
│    │  ├─ Body:                                             │
│    │  │  ├─ type: "HOURS_PER_WEEK"                         │
│    │  │  ├─ subjectId: 7                                   │
│    │  │  ├─ courseId: 1                                    │
│    │  │  └─ params: {                                      │
│    │  │     ├─ sessionsPerWeek: 3                          │
│    │  │     └─ maxPerDay: 1                                │
│    │  │  }                                                 │
│    │  │                                                     │
│    │  ├─ Validaciones:                                     │
│    │  │  ├─ subjectId exists ✓                             │
│    │  │  ├─ courseId exists ✓                              │
│    │  │  ├─ sessionsPerWeek ∈ [1-8] ✓                      │
│    │  │  ├─ UNIQUE (tipo, subjectId, courseId) ✓           │
│    │  │  └─ SUMA validaciones ≤ 25 (aviso si >25) ✓        │
│    │  │                                                     │
│    │  ├─ Lado servidor calcula: ∑ sesiones = 23/25 ✓      │
│    │  │                                                     │
│    │  └─ Response: 201 Created                             │
│    │     └─ restrictionId: 42                              │
│    │                                                        │
│    │ 📊 BD: INSERT restrictions                            │
│    │    + Trigger: audit log + mark horarios NEEDS_REVIEW  │
│    │                                                        │
│    └─ Repite para todas asignaturas y cursos               │
│                                                             │
│ 5. Ve Listado Restricciones (US20)                         │
│    ├─ GET /api/restrictions?type=HOURS_PER_WEEK&courseId=1 │
│    │  ├─ Query: SELECT * FROM restrictions + filtros       │
│    │  │         [Índice rápido: IX_restrictions_type]      │
│    │  │                                                     │
│    │  └─ Response:                                         │
│    │     ├─ restrictions: [...]                            │
│    │     ├─ availabilityBar:                               │
│    │     │  ├─ totalFranjas: 25                            │
│    │     │  ├─ usedFranjas: 23                             │
│    │     │  ├─ freeFranjas: 2                              │
│    │     │  └─ color: "green" (< 80%)                      │
│    │     └─ breakdown:                                     │
│    │        ├─ "Inglés": 3                                 │
│    │        ├─ "Lengua": 5                                 │
│    │        └─ ...                                         │
│    │                                                        │
│    └─ Frontend: Tabla + filtros + barra visual             │
│                                                             │
└──────────────────────────────────────────────────────────────┘

┌─ FASE 2: GENERACIÓN DE HORARIOS (US-ALGO) ─┐
│                                              │
│ 6. Inicia Generación (POST /api/schedules/generate) 
│    ├─ Body:                                  │
│    │  ├─ calendarId: 42                      │
│    │  ├─ algorithm: "CSP" | "BACKTRACK"      │
│    │  └─ courses: [1, 2, 3] (qué cursos)    │
│    │                                         │
│    ├─ Backend:                               │
│    │  ├─ 1. Enqueue Job (BullMQ)             │
│    │  │   ├─ jobId: "sched_abc123"           │
│    │  │   ├─ status: "queued"                │
│    │  │   └─ createdAt: NOW()                │
│    │  │                                      │
│    │  ├─ 2. Retorna Response 202 Accepted   │
│    │  │   └─ jobId: "sched_abc123"           │
│    │  │                                      │
│    │  └─ 📊 BD: INSERT schedule_generation_jobs
│    │                                         │
│    ├─ Frontend: Muestra spinner + "Procesando..."
│    │  └─ Polling: GET /api/schedules/generate/sched_abc123 
│    │     (cada 2 segundos)                   │
│    │                                         │
│    └─ Response (polling):                    │
│       ├─ status: "processing"                │
│       ├─ progress: 45                        │
│       └─ eta: "2 minutos"                    │
│                                              │
│ 7. BullMQ Worker ejecuta:                    │
│    ├─ Fase A: Cargar datos                   │
│    │  ├─ SELECT calendars, sessions          │
│    │  ├─ SELECT restrictions + params        │
│    │  ├─ SELECT professors + availabilities  │
│    │  ├─ SELECT rooms (ej: Aula A, B, C)     │
│    │  └─ Construir estado: {calendars, ...}  │
│    │                                         │
│    ├─ Fase B: Ejecutar Algoritmo             │
│    │  │                                      │
│    │  ├─ SI algorithm = "CSP":               │
│    │  │  ├─ Crear modelo OR-Tools:           │
│    │  │  │  ├─ Variables: 25 sesiones×cursos │
│    │  │  │  ├─ Domain: [0..6] (0=libre, 1-6=prof) │
│    │  │  │  └─ Constraints:                  │
│    │  │  │     ├─ c1: SINGLE_LOCATION (HC2) │
│    │  │  │     ├─ c2: AVAILABILITY (HC3)     │
│    │  │  │     ├─ c3: LOAD_BALANCE (HC1)     │
│    │  │  │     └─ ...                        │
│    │  │  │                                   │
│    │  │  ├─ Solve con timeout=60s            │
│    │  │  │  └─ Retorna: solution[] (si found)
│    │  │  │            : nil (si timeout)     │
│    │  │  │                                   │
│    │  │  └─ Status: SOLVED / TIMEOUT         │
│    │  │                                      │
│    │  ├─ SI algorithm = "BACKTRACK":         │
│    │  │  ├─ Recursiva depth-first:           │
│    │  │  │  └─ backtrack(slot, assignments) │
│    │  │  │                                   │
│    │  │  ├─ Checks HC1-HC6 en cada paso      │
│    │  │  ├─ Poda agresiva (pruning)          │
│    │  │  ├─ Timeout: 120s                    │
│    │  │  │                                   │
│    │  │  └─ Retorna: primera solución válida│
│    │  │                                      │
│    │  └─ SI AMBOS FALLAN:                    │
│    │     ├─ status: "FAILED"                 │
│    │     ├─ reason: "No solución encontrada" │
│    │     └─ suggestions:                     │
│    │        ├─ "Reducir sesiones Inglés"     │
│    │        ├─ "Agregar profesor"            │
│    │        └─ ...                           │
│    │                                         │
│    ├─ Fase C: Persistir resultado            │
│    │  ├─ INSERT schedules (cabecera)         │
│    │  │  ├─ calendarId, status, algorithm    │
│    │  │  ├─ solvedAt, solver: "OR-Tools"     │
│    │  │  └─ generatedBy: userId              │
│    │  │                                      │
│    │  ├─ INSERT schedule_entries (asignaciones)
│    │  │  ├─ scheduleId, courseId, dayOfWeek  │
│    │  │  ├─ sessionNumber, subjectId         │
│    │  │  ├─ professorId, roomId              │
│    │  │  └─ createdAt, createdBy: userId ✓  │
│    │  │                                      │
│    │  └─ 📊 Trigger: Detectar conflictos     │
│    │     └─ INSERT schedule_conflicts si HC  │
│    │                                         │
│    └─ Fase D: Detectar conflictos (Vistas)  │
│       ├─ SELECT FROM schedule_conflicts_*    │
│       │  ├─ professor_overlap (HC2)          │
│       │  ├─ availability (HC3)               │
│       │  ├─ no_room (HC6)                    │
│       │  └─ ... (otras)                      │
│       │                                      │
│       └─ Si conflictos:                      │
│          ├─ status: "NEEDS_REVIEW"           │
│          ├─ conflicts: [{type, detail}]      │
│          └─ Notificar usuario                │
│                                              │
│ 8. Frontend recibe resultado (polling):      │
│    ├─ status: "SOLVED"                       │
│    ├─ schedulesId: 123                       │
│    ├─ conflictsCount: 0                      │
│    └─ generatedAt: 2026-08-04 14:32:15       │
│                                              │
│    Acciones:                                 │
│    ├─ Mostrar ✓ "Horario generado"           │
│    ├─ Button: Visualizar                     │
│    └─ Button: Descargar (PDF/Excel)          │
│                                              │
└──────────────────────────────────────────────┘

┌─ FASE 3: VISUALIZACIÓN & EXPORTACIÓN ─┐
│                                         │
│ 9. Ve Horario Generado                │
│    ├─ GET /api/schedules/:scheduleId   │
│    │                                   │
│    ├─ Response:                        │
│    │  ├─ schedules: {                  │
│    │  │  ├─ id, calendarId             │
│    │  │  ├─ status: "SOLVED"           │
│    │  │  ├─ entries: [                 │
│    │  │  │  {                           │
│    │  │  │  ├─ courseId: 1              │
│    │  │  │  ├─ dayOfWeek: "MON"         │
│    │  │  │  ├─ sessionNumber: 1         │
│    │  │  │  ├─ subject: "Lengua"        │
│    │  │  │  ├─ professor: "García, M."  │
│    │  │  │  └─ room: "Aula A"           │
│    │  │  │  }, ...                      │
│    │  │  │                              │
│    │  │  └─ ]                           │
│    │  │                                 │
│    │  └─ conflicts: [] (empty = ✓)      │
│    │                                   │
│    └─ Frontend renderiza tabla:         │
│       ┌────┬───┬────┬──────┬────┐      │
│       │Day │S1 │ S2 │ ... │Aula│      │
│       ├────┼───┼────┼──────┼────┤      │
│       │LUN │Lengua │Inglés│ A  │      │
│       │    │García │      │    │      │
│       └────┴───┴────┴──────┴────┘      │
│                                         │
│ 10. Exporta Horario                    │
│     ├─ POST /api/schedules/:id/export  │
│     │  ├─ Body: { format: "PDF"|"XLSX"}│
│     │  │                               │
│     │  ├─ Backend:                     │
│     │  │  ├─ Generar PDF/Excel         │
│     │  │  ├─ Subir a S3                │
│     │  │  └─ Generar signed URL (24h)  │
│     │  │                               │
│     │  └─ Response: {                  │
│     │     └─ downloadUrl: "https://..." │
│     │                                   │
│     └─ Frontend: Descarga automática   │
│                                         │
└─────────────────────────────────────────┘
```

### 3.2 Diagrama de Estados (Estado Máquina)

```
Estado Calendario:
┌─────────┐     ┌──────────┐     ┌───────┐
│ DRAFT   │────→│ ACTIVE   │────→│ARCHIVED│
│ (nuevo) │     │(en uso)  │     │        │
└─────────┘     └──────────┘     └───────┘
                       │
                       ├→ NEEDS_REVIEW (si restricción cambió)
                       │
                       └→ FAILED_GEN (si generación falló)

Estado Restricción:
┌────────┐     ┌────────┐     ┌─────────┐
│ DRAFT  │────→│ ACTIVE │────→│INACTIVE │
│        │     │        │     │         │
└────────┘     └────────┘     └─────────┘

Estado Schedule (Horario generado):
┌──────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│  DRAFT   │───→│GENERATING   │SOLVED    │───→│PUBLISHED │
│          │    │          │  │(sin conf)│    │          │
└──────────┘    └─────────┘    └──────────┘    └──────────┘
                      │
                      ├→ FAILED (si timeout/error)
                      │
                      └→ NEEDS_REVIEW (si conflictos HC)

Estado Job (Background):
┌────────┐    ┌────────────┐    ┌──────────┐    ┌────────┐
│ QUEUED │───→│ PROCESSING │───→│ COMPLETED│   │ FAILED │
│        │    │            │    │(+ result)│   │        │
└────────┘    └────────────┘    └──────────┘   └────────┘
                      │
                      └→ TIMEOUT (120s max)
```

---

### 3.3 Flujos implementados ✅

**Registro.** La SPA envía `POST /api/auth/register` con el token de captcha v3 y la casilla de privacidad. El backend comprueba `Origin`, el límite de intentos (5 cada 15 minutos por IP), el captcha, la validación (Zod), el municipio y el email, y crea en **una transacción** el colegio, el usuario `ADMIN` y su sesión. Responde `201` con la cookie `refresh_token` (`HttpOnly`, `Secure`, `SameSite=Lax`). La SPA llama a `POST /api/auth/refresh`, guarda el access token en memoria y navega a `/onboarding`.

**Inicio de sesión.** Mismo orden: `Origin` → validación → límite de intentos **fallidos** → captcha → credenciales → estado de la cuenta → sesión. Responde `204` con la cookie. Un email inexistente, una contraseña incorrecta y un usuario dado de baja dan el mismo `401` con el mismo coste. Un reto v2 aparece si el score de v3 es bajo (`422`).

**Petición protegida.** `Authorization: Bearer` → `AuthenticateRequest` verifica el JWT y lee la sesión (`sid`) con su usuario y su colegio por clave primaria → rechaza una sesión inexistente, revocada o caducada y un usuario que no esté `ACTIVE` → `requireRole` → caso de uso con el `schoolId` de la identidad. Un cierre de sesión, una baja o un restablecimiento invalidan los access tokens al instante.

**Baja de un usuario.** Una transacción bloquea la fila del colegio (`FOR UPDATE`), aplica `planUserChange` (baja propia, último administrador, idempotencia), escribe y revoca todas las sesiones del usuario. Las operaciones de un mismo colegio van de una en una.

**Invitación.** El administrador genera el enlace (`201`, única respuesta que lo contiene: `/invitacion#<token>`). La persona invitada lo abre; la SPA lee el fragmento, lo quita de la barra y consulta (`lookup`); define sus datos y contraseña y `accept` crea la cuenta en una transacción que marca el enlace como usado. No inicia sesión: la SPA la lleva a `/login` con un aviso.

**Restablecimiento de contraseña.** Igual que la invitación, con `/restablecer#<token>`. `confirm` cambia la contraseña, marca el enlace como usado y revoca todas las sesiones del usuario en una sola transacción. Generar otro enlace revoca el anterior.

**Bienvenida.** Tras el registro o el login, `/onboarding` muestra el saludo, el colegio, las funcionalidades de horarios y comedor como «Próximamente» y, para un `ADMIN`, el atajo a `/usuarios`. No guarda estado.

**Crear un curso.** El formulario de `/cursos/nuevo` valida con las mismas reglas que el backend (tabla compartida `course-fields.json`) y envía `POST /api/courses` con el nombre y las clases. `CreateCourse` valida el cuerpo, limpia y normaliza los nombres y genera los identificadores; `PrismaCourseRepository.create` guarda el curso y todas sus clases en **una transacción** (un `create` anidado). La unicidad la decide la base de datos: un segundo curso con el mismo nombre normalizado en el colegio viola `courses_school_id_normalized_name_key` y responde `409 COURSE_ALREADY_EXISTS`; dos envíos simultáneos idénticos dan un `201` y un `409`. Con el `201` la SPA vuelve a `/cursos` con el nombre del curso en el estado de la navegación para el aviso. Las clases se devuelven con `tutor: null`.

**Listar los cursos.** `GET /api/courses` devuelve los cursos del colegio ya ordenados (números en orden natural), cada uno con sus clases y su `createdAt`, la fecha que guardó la base de datos. La SPA los muestra como una tabla desde 768 px y como tarjetas por debajo (`useMediaQuery`; solo se pinta una de las dos) y filtra por nombre en el navegador, sin acentos ni mayúsculas y sin volver a pedir nada: el servidor no recibe la búsqueda.

**Editar un curso.** `/cursos/:id/editar` pide `GET /api/courses/{id}` y rellena el formulario compartido con la creación (`CourseForm`); cada fila de una clase que ya existía guarda su `id`. «Guardar» solo se habilita con cambios reales. El `PUT /api/courses/{id}` lleva el **estado final** `{ name, classes: [{ id?, name }] }`: la clase con `id` conserva su identidad y se renombra, la que no lo trae se crea y la guardada que falta se borra. `UpdateCourse` valida el cuerpo y delega en `PrismaCourseRepository.update`, que abre una transacción, **bloquea la fila del curso** (`FOR UPDATE`, con el colegio de la identidad), lee las clases y ejecuta la función pura del dominio `planCourseUpdate`, que lanza `CourseChanged` si se pide una clase que el curso ya no tiene (`409 COURSE_CHANGED`: otra persona la borró; no se guarda nada). Después escribe en un orden que respeta el índice único no diferible `(course_id, normalized_name)`: el curso primero (un nombre ya usado falla antes de tocar las clases, `409 COURSE_ALREADY_EXISTS`), luego borra, renombra en dos fases (nombre provisional `#<i>` y definitivo, para que A↔B no choque) y crea. Un curso de otro colegio, inexistente o con un id que no es UUID es un `404` indistinguible. Un `PUT` igual a lo guardado no escribe nada. Con el `200` la SPA vuelve a `/cursos` con el aviso; con `COURSE_CHANGED` ofrece «Recargar», que vuelve a pedir el curso y descarta lo escrito. **Tutor de cada clase (US09_b):** la página pide también `GET /api/professors` y cada fila lleva un desplegable (los profesores sin clase y los de este curso). El `PUT` admite `classes[].tutorId` opcional (ausente = sin cambios, `null` = quitar); dentro de la misma transacción se leen los profesores pedidos y `planCourseUpdate(current, requested, tutors)` añade `tutorsChanged` y lanza `TutorNotFound` (`400`) o `ProfessorAlreadyTutor` (`409 PROFESSOR_ALREADY_TUTOR`, profesor de una clase de otro curso). Los tutores se escriben en dos fases (todos a `NULL` y luego asignar) por el índice único `classes_tutor_id_key`, y una carrera entre dos cursos se traduce de ese mismo índice al mismo `409`; la SPA vuelve a pedir los profesores y marca la fila.

**Borrar un curso.** El botón «Borrar {curso}» de `/cursos` abre `DeleteCourseModal`, que pide `GET /api/courses/{id}/impact` (`GetCourseDeletionImpact`: cuántas clases se perderían y, cuando existan los alumnos, cuántos alumnos tiene asignados; `studentCount` está en el contrato y vale `0` hasta US14) y no habilita «Borrar curso» hasta tenerlo. Con una sola confirmación, la SPA envía `DELETE /api/courses/{id}` (`DeleteCourse`) y `PrismaCourseRepository.delete` abre una transacción, **bloquea la fila del curso** (`FOR UPDATE`, con el colegio de la identidad), cuenta las clases y borra el curso; las clases caen por la cascada de la base de datos (`ON DELETE CASCADE`). Responde `200` con lo que se borró de verdad, que es lo que ve la persona usuaria y lo que registra `COURSE_DELETED`. Una edición simultánea espera el bloqueo y, si el borrado confirma primero, recibe `404`; de dos borrados simultáneos, uno responde `200` y el otro `404`. Un curso de otro colegio, inexistente o con un id que no es UUID es un `404` indistinguible, que el diálogo trata como «Ese curso ya no existe» (cierra y vuelve a pedir la lista). Tras el `200`, la página quita el curso de su lista sin volver a pedirla, muestra el aviso y lleva el foco al título.

**Crear un profesor.** `/profesores/nuevo` (`CreateProfessorPage`, ADMIN y MEMBER) pide una sola vez `GET /api/courses` para ofrecer, agrupadas por curso, las clases que todavía no tienen tutor; si esa carga falla, el desplegable de la clase se desactiva con un aviso y el formulario sigue sirviendo sin clase. Valida con las reglas del registro (`validateField`) y envía `POST /api/professors` con una guarda síncrona contra el doble envío. `CreateProfessor` valida el cuerpo (`parseCreateProfessorRequest`, con la tabla `test-fixtures/professor-fields.json` compartida con el frontend) y delega en `PrismaProfessorRepository.create`, que abre un `$transaction`: inserta el profesor y, si hay clase, ejecuta un `UPDATE` condicionado (`id`, `tutor_id IS NULL` y `course.school_id` del colegio de la identidad), atómico por sí mismo y sin bloqueos. Si no cambia ninguna fila, una lectura decide entre `ClassAlreadyHasTutor` (`409 CLASS_ALREADY_HAS_TUTOR`) y `ClassNotFound` (`400` con `classId: NOT_FOUND`, sin distinguir una clase de otro colegio de una inexistente), y el error deshace también el alta. Con el `201` la SPA vuelve a `/profesores` con el nombre para el aviso; un `409` marca el desplegable de la clase. Editar el curso conserva el tutor de las clases que se renombran (su `id` no cambia) y quitar la clase o borrar el curso deja libre al profesor por `ON DELETE SET NULL`. Evento `PROFESSOR_CREATED` (`school_id`, `actor_id`, `professor_id`, `has_class`, `position`) y `PROFESSOR_CREATION_REJECTED` (`reason`); nunca nombres.

---

## 4. Patrones de Diseño

> Se aplican en el código: capas, repositorios con puertos, inyección por constructor desde `composeApp` y reglas de dominio puras. 🎯 Los ejemplos con calendarios, restricciones y `RestrictionAggregate` son ilustrativos de la futura generación de horarios.

### 4.1 Arquitectura de Capas (Layered Architecture)

```
┌─ PRESENTATION (Controladores) ──────────┐
│ CalendarController, SubjectController    │
│ RestrictionController, ScheduleController│
└──────────────────────────────────────────┘
                    ↓ DTO/Validation
┌─ APPLICATION (Servicios) ───────────────┐
│ CalendarService, SubjectService          │
│ RestrictionService, ScheduleGeneratorSvc │
│ + Algoritmos (CSP, Backtrack)            │
└──────────────────────────────────────────┘
                    ↓ Query/Mutation
┌─ DOMAIN (Lógica de Negocio) ───────────┐
│ CalendarAggregate, SubjectAggregate      │
│ RestrictionAggregate, ScheduleAggregate  │
│ HardConstraintValidator                  │
└──────────────────────────────────────────┘
                    ↓ ORM
┌─ INFRASTRUCTURE (BD) ───────────────────┐
│ Prisma Models, Repositories              │
│ PostgreSQL (Tablas + Vistas + Triggers)  │
└──────────────────────────────────────────┘
```

### 4.2 Repository Pattern

```typescript
interface ICalendarRepository {
  create(data: CreateCalendarDTO): Promise<Calendar>;
  findById(id: string): Promise<Calendar | null>;
  findAll(filters?: FilterDTO): Promise<Calendar[]>;
  update(id: string, data: UpdateCalendarDTO): Promise<Calendar>;
  delete(id: string): Promise<void>;
  getSessions(calendarId: string): Promise<Session[]>;
}

interface IRestrictionRepository {
  create(data: CreateRestrictionDTO): Promise<Restriction>;
  // ... CRUD
  findConflictingRestrictions(courseId: string): Promise<Restriction[]>;
  getAvailabilitySummary(calendarId: string): Promise<AvailabilityBar>;
}

// Implementación: PrismaCalendarRepository, PrismaRestrictionRepository
```

### 4.3 Service Layer Pattern

```typescript
class CalendarService {
  constructor(
    private repo: ICalendarRepository,
    private validator: HardConstraintValidator,
    private logger: Logger
  ) {}

  async createCalendar(dto: CreateCalendarDTO): Promise<Calendar> {
    // 1. Validar entrada (Zod)
    const validated = CreateCalendarSchema.parse(dto);
    
    // 2. Validar restricciones de negocio
    await this.validator.validateDatesNotOverlap(validated);
    
    // 3. Persistir
    const calendar = await this.repo.create(validated);
    
    // 4. Generar sesiones automáticamente (trigger DB)
    // 5. Auditoría (createdBy middleware)
    
    this.logger.info(`Calendar ${calendar.id} created`, { 
      createdBy: this.context.userId 
    });
    
    return calendar;
  }

  async generateSessions(calendarId: string, config: SessionConfig): Promise<Session[]> {
    // Validar configuración
    this.validator.validateSessionConfig(config);
    
    // Generar sesiones de forma atómica
    return await this.repo.generateSessions(calendarId, config);
  }
}

class ScheduleGeneratorService {
  constructor(
    private cspSolver: CSPSolver,
    private backtrackSolver: BacktrackSolver,
    private conflictDetector: ConflictDetector,
    private jobQueue: BullQueue
  ) {}

  async generateSchedule(params: GenerateScheduleParams): Promise<Job> {
    // 1. Enqueue job con parámetros
    const job = await this.jobQueue.add('schedule-generation', params, {
      timeout: 120000, // 2 minutos
      removeOnComplete: false,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    
    return job;
  }

  async processGenerationJob(job: Job): Promise<GenerationResult> {
    // Worker ejecuta esto
    
    // 1. Cargar datos
    const [calendars, restrictions, professors, rooms] = await Promise.all([
      this.calendarRepo.findById(job.data.calendarId),
      this.restrictionRepo.findActive(job.data.calendarId),
      this.professorRepo.findAll(),
      this.roomRepo.findAll()
    ]);

    // 2. Ejecutar algoritmo
    let solution;
    try {
      solution = await Promise.race([
        this.cspSolver.solve({ calendars, restrictions, professors, rooms }),
        timeout(60000) // CSP timeout = 60s
      ]);
    } catch (e) {
      if (e instanceof TimeoutError) {
        // Fallback a backtracking
        solution = await this.backtrackSolver.solve({...});
      }
    }

    // 3. Persistir resultado
    if (solution) {
      const scheduleId = await this.scheduleRepo.create({
        calendarId: job.data.calendarId,
        status: 'SOLVED',
        algorithm: job.data.algorithm,
        generatedBy: job.data.userId,
        entries: solution.assignments
      });
      
      // 4. Detectar conflictos
      const conflicts = await this.conflictDetector.detect(scheduleId);
      
      if (conflicts.length > 0) {
        await this.scheduleRepo.updateStatus(scheduleId, 'NEEDS_REVIEW', {
          conflicts
        });
      }
      
      return { status: 'SOLVED', scheduleId, conflicts };
    } else {
      return { status: 'FAILED', reason: 'No solution found' };
    }
  }
}
```

### 4.4 Dependency Injection (Inyección de Dependencias)

```typescript
// container.ts
const container = new Container();

// Repositories
container.bind<ICalendarRepository>(
  Symbol.for('ICalendarRepository')
).to(PrismaCalendarRepository);

container.bind<IRestrictionRepository>(
  Symbol.for('IRestrictionRepository')
).to(PrismaRestrictionRepository);

// Services
container.bind<CalendarService>(CalendarService)
  .toSelf()
  .inSingletonScope();

container.bind<ScheduleGeneratorService>(ScheduleGeneratorService)
  .toSelf()
  .inSingletonScope();

// Algoritmos
container.bind<CSPSolver>(CSPSolver).toSelf().inSingletonScope();
container.bind<BacktrackSolver>(BacktrackSolver).toSelf().inSingletonScope();

// Controllers
container.bind<CalendarController>(CalendarController).toSelf();

export { container };
```

### 4.5 Aggregate Pattern (Dominio)

```typescript
class RestrictionAggregate {
  private id: string;
  private type: RestrictionType;
  private subjectId: string;
  private courseId: string;
  private params: JSON;
  private status: 'ACTIVE' | 'INACTIVE';
  private events: DomainEvent[] = [];

  static create(dto: CreateRestrictionDTO): RestrictionAggregate {
    const agg = new RestrictionAggregate();
    agg.id = uuid();
    agg.type = dto.type;
    agg.subjectId = dto.subjectId;
    agg.courseId = dto.courseId;
    agg.params = dto.params;
    agg.status = 'ACTIVE';
    
    agg.events.push(new RestrictionCreatedEvent(agg));
    
    return agg;
  }

  isConflictingWith(other: RestrictionAggregate): boolean {
    return this.type === other.type &&
           this.subjectId === other.subjectId &&
           this.courseId === other.courseId;
  }

  getAvailableFranjas(): number {
    // Calcular franjas disponibles según params
    return 25 - (this.params.sessionsPerWeek || 0);
  }

  getUncommittedEvents(): DomainEvent[] {
    return this.events;
  }

  clearEvents(): void {
    this.events = [];
  }
}
```

---

## 5. Algoritmo de Generación (CSP + Backtracking)

> 🎯 **Objetivo.** Nada de esta sección está implementado todavía (US-ALGO).

### 5.1 Constraint Satisfaction Problem (CSP) - Algoritmo Principal

```
ALGORITMO: CSP Solver (Google OR-Tools)
═══════════════════════════════════════════════════════════════

Entrada:
├─ calendars: {sessions: 25 slots}
├─ restrictions: [Inglés:3, Lengua:5, Mate:5, ...]
├─ professors: [{id, availabilities, load}]
├─ rooms: [{id, capacity, available}]
└─ courses: [1, 2, 3] (qué cursos generar)

Salida:
├─ assignment: ∀ sesión → (profesor, asignatura, aula) ✓
└─ OR: "No solución encontrada" (timeout / infeasible)

MODELADO CSP:
═════════════

Variables:
├─ x[sesión][curso] ∈ Domain(0..n_profesores)
│  donde 0 = "no asignado", 1-n = professor_id
│
└─ 25 * 10 = 250 variables (sesiones × cursos)

Dominio:
├─ x[s][c] ∈ [0, 1, 2, 3, 4, 5] (6 profesores ej)
│
└─ OR-Tools: variable.SetValues([0, 1, 2, 3, 4, 5])

Restricciones (Hard Constraints):
═════════════════════════════════

HC1: LOAD_BALANCE
  ∀ profesor_j: ∑(asignaciones_j) ≤ maxLoad_j
  → Traducción: 
     for each professor:
       solver.Add(sum(x[s][c] == prof_j for all s,c) <= capacity)

HC2: SINGLE_LOCATION ⭐ CRÍTICA
  ∀ sesión_s, curso1, curso2:
    ¬(x[s][curso1] = p AND x[s][curso2] = p) para p ≠ 0
  → Traducción:
     for s in sessions:
       for p in professors:
         # Máximo 1 asignación de profesor p en sesión s
         solver.Add(sum(x[s][c] == p for c in courses) <= 1)

HC3: AVAILABILITY
  ∀ professor_j, sesión_s:
    Si s ∉ disponibilidad_j → x[s][*] ≠ j
  → Traducción:
     for prof in professors:
       for session in prof.unavailable_sessions:
         for course in courses:
           solver.Add(x[session][course] != prof.id)

HC4: NO_DUPLICATE
  ∀ asignatura_a, curso_c, día_d:
    ∑(asignaciones_(a,c) en día_d) ≤ maxPerDay
  → Traducción:
     for subject, course, day in combinations:
       sessions_in_day = [s for s in sessions if s.day == day]
       solver.Add(sum(x[s][course] == subject_id for s in sessions_in_day) <= 1)

HC5: TIMESLOT_COVERAGE
  ∀ sesión_s, curso_c:
    x[s][c] ≠ 0 OR es recreo
  → Traducción:
     for session, course in combinations:
       if not session.isBreak:
         solver.Add(x[session][course] > 0)

HC6: ROOM_AVAILABILITY
  ∀ aula, sesión: Si aula no disponible → no asignar
  → Traducción:
     for room in rooms:
       for session in room.unavailable_sessions:
         # No permitir asignaciones que necesiten esta aula
         solver.Add(x[session][*] != assignment_requiring_room)

OBJETIVO (Soft Constraints - Optimización):
═════════════════════════════════════════════

maximize:
  1. Balance de carga (minimizar varianza)
  2. Reducir cambios de aula
  3. Minimizar gaps entre sesiones profesor

RESOLUCIÓN:
═════════════════════════════════════════════

csp_model = CpModel()

# 1. Declarar variables
variables = {}
for session in calendars.sessions:
  for course in courses:
    variables[(session.id, course.id)] = csp_model.NewIntVar(
      min_value=0,
      max_value=len(professors),
      name=f"slot_{session}_{course}"
    )

# 2. Añadir restricciones (HC1-HC6)
# ... (ver arriba)

# 3. Crear solver y resolver
solver = CpSolver()
status = solver.Solve(csp_model, timeout=60)  # 60 segundos

# 4. Procesar resultado
if status == OPTIMAL or status == FEASIBLE:
  solution = {}
  for (session, course), var in variables.items():
    assignment = solver.Value(var)
    if assignment > 0:
      solution[(session, course)] = assignment  # profesor_id
  
  return { status: 'SOLVED', assignments: solution }
else:
  return { status: 'TIMEOUT or INFEASIBLE' }

TIEMPO ESTIMADO:
════════════════

- Small (3-5 cursos): 0.5-2 segundos
- Medium (5-10 cursos): 5-15 segundos
- Large (10-20 cursos): 30-60 segundos ← TIMEOUT

VENTAJAS:
═════════

✅ Encontrar solución óptima (si tiempo permite)
✅ Determinístico
✅ Manejo automático de restricciones complejas
✅ Escalable (OR-Tools muy optimizado)

DESVENTAJAS:
═════════════

❌ Timeout posible (sistemas grandes)
❌ Complejidad oculta (no transparente)
❌ Dependencia Google OR-Tools
```

### 5.2 Backtracking Solver - Algoritmo Fallback

```
ALGORITMO: Backtracking Solver (Custom Implementation)
═══════════════════════════════════════════════════════════════

PROPÓSITO: Fallback si CSP timeout. Encontrar primera solución válida.

PSEUDO-CÓDIGO:
═════════════════

function backtrack(sessionIndex, currentAssignment):
  
  // Base case: todas sesiones asignadas
  if sessionIndex == totalSessions:
    return currentAssignment  // SOLUCIÓN ENCONTRADA
  
  // Recursive case: probar asignaciones para sesión actual
  session = sessions[sessionIndex]
  
  for professor in availableProfessors(session):
    
    // 1. Probar asignación
    currentAssignment[session] = professor
    
    // 2. Validar restricciones (HC1-HC6)
    if isValidAssignment(session, professor, currentAssignment):
      
      // 3. Poda agresiva: verificar viabilidad futura
      if canSolveRemaining(sessionIndex + 1, currentAssignment):
        
        // 4. Explorar profundidad
        solution = backtrack(sessionIndex + 1, currentAssignment)
        
        if solution != null:
          return solution  // ENCONTRADO
    
    // 5. Backtrack (deshacer)
    delete currentAssignment[session]
  
  return null  // No hay solución desde este estado

function isValidAssignment(session, professor, assignment):
  
  // HC1: LOAD_BALANCE
  if countAssignments(professor, assignment) > maxLoad[professor]:
    return false
  
  // HC2: SINGLE_LOCATION ⭐ CRÍTICA
  if existsOtherAssignmentSameSession(professor, session, assignment):
    return false
  
  // HC3: AVAILABILITY
  if not professor.availabilities.includes(session):
    return false
  
  // HC4: NO_DUPLICATE
  if subject.countInDay(session.day, assignment) > maxPerDay:
    return false
  
  // HC5, HC6: (similar)
  
  return true

function canSolveRemaining(sessionIndex, assignment):
  // Heurística: verificar si quedan recursos suficientes
  // para rellenar sesiones restantes sin violar HC
  
  // Ejemplo:
  //  remaining_slots = totalSessions - sessionIndex
  //  available_resources = count(professors con capacity > 0)
  //  if available_resources < remaining_slots:
  //    return false
  
  return true

// LLAMADA INICIAL
solution = backtrack(0, {})

OPTIMIZACIONES (Heurísticas):
══════════════════════════════

1. Ordenamiento de Variables (Variable Ordering)
   - Procesar sesiones en orden: primero más restrictivas
   - Ej: Inglés (solo 3 profs disponibles) antes que Mate (5 profs)

2. Ordenamiento de Valores (Value Ordering)
   - Probar profesores más sobrecargados primero
   - Racional: balancear carga early

3. Forward Checking
   - Después cada asignación, reducir dominios futuros
   - Si dominio se vacía → backtrack inmediatamente

4. Arc Consistency (AC-3)
   - Propagar restricciones antes de backtracking
   - Reduce búsqueda significativamente

5. Pruning Agresivo
   - Detectar "conflictos inevitables" antes de explorar
   - ¿Quedan suficientes profesores para franjas restantes?
   - ¿Hay aulas disponibles?

TIEMPO ESTIMADO:
════════════════

- Best case (fácil de resolver): 1-5 segundos
- Average case (medio): 10-40 segundos
- Worst case (muy constrained): 60-120 segundos (TIMEOUT)

VENTAJAS:
═════════

✅ Determinístico y transparente
✅ No dependencias externas
✅ Fácil debuggear
✅ Fallback confiable

DESVENTAJAS:
═════════════

❌ Más lento que CSP (peor search strategy)
❌ Solución subóptima (solo primera válida)
❌ Requiere tunning heurísticas
```

### 5.3 Flujo de Ejecución Algoritmo

```
START: Usuario click "Generar Horarios"
  │
  ├─→ BullMQ: Enqueue ScheduleGenerationJob
  │   ├─ params: {calendarId, algorithm: 'CSP', timeout: 60s}
  │   └─ Response: 202 Accepted + jobId
  │
  ├─ FRONTEND: Polling GET /api/schedules/job/:jobId cada 2s
  │
  └─→ BACKEND WORKER:
      │
      ├─ [1] LOAD DATA (2-3 segundos)
      │   ├─ SELECT calendars, sessions, breaks (indexed)
      │   ├─ SELECT restrictions + params JSON (indexed)
      │   ├─ SELECT professors + availabilities (full cache)
      │   ├─ SELECT rooms (small dataset)
      │   └─ status: "loading" → progress: 10%
      │
      ├─ [2] VALIDATE & PREPARE (1 segundo)
      │   ├─ Validar restrictions sum ≤ 25
      │   ├─ Validar profesores asignados a cursos
      │   ├─ Construir matriz restricciones (CSP model structure)
      │   └─ status: "preparing" → progress: 20%
      │
      ├─ [3] EXECUTE CSP SOLVER (0-60 segundos)
      │   │
      │   ├─ IF algorithm == 'CSP':
      │   │   ├─ Crear CpModel()
      │   │   ├─ Declarar variables (25 × cursos)
      │   │   ├─ Agregar HC1-HC6 (restricciones)
      │   │   ├─ CpSolver.Solve(timeout=60s)
      │   │   │   ├─ Status OPTIMAL/FEASIBLE:
      │   │   │   │  └─ solution = extract assignments ✓
      │   │   │   │
      │   │   │   └─ Status TIMEOUT/INFEASIBLE:
      │   │   │      └─ solution = null (fallback backtrack)
      │   │   │
      │   │   └─ status: "csp_running" → progress: (elapsed % 60)
      │   │
      │   ├─ IF solution == null (CSP failed):
      │   │   ├─ Ejecutar BacktrackSolver (120s timeout)
      │   │   ├─ status: "backtracking" → progress: 70%
      │   │   │
      │   │   └─ IF backtrack == null:
      │   │       └─ status: "FAILED" (no solución)
      │   │          → reason: "Infeasible: No solución encontrada"
      │   │          → suggestions: ["Reducir Inglés", "Agregar profesor"]
      │   │
      │   └─ ELSE solution found:
      │       └─ status: "extracting" → progress: 80%
      │
      ├─ [4] PERSIST SOLUTION (5-10 segundos)
      │   ├─ BEGIN TRANSACTION
      │   │
      │   ├─ INSERT schedules
      │   │  ├─ calendarId, status: 'SOLVED', algorithm
      │   │  ├─ generatedBy: userId, solvedAt: NOW()
      │   │  └─ metadata: {...}
      │   │
      │   ├─ INSERT schedule_entries (25 × cursos rows)
      │   │  ├─ scheduleId, courseId, dayOfWeek
      │   │  ├─ sessionNumber, subjectId, professorId
      │   │  ├─ roomId, createdBy: userId ✓
      │   │  └─ (createdAt, updatedAt auto via trigger)
      │   │
      │   ├─ TRIGGER: log audit trail
      │   │  └─ INSERT restriction_audit_trail (schedule generated)
      │   │
      │   └─ COMMIT
      │
      ├─ [5] DETECT CONFLICTS (3-5 segundos)
      │   ├─ SELECT FROM schedule_conflicts_professor_overlap
      │   │  └─ HC2 violations (profesor en 2 lugares)
      │   │
      │   ├─ SELECT FROM schedule_conflicts_availability
      │   │  └─ HC3 violations (fuera disponibilidad)
      │   │
      │   ├─ SELECT FROM schedule_conflicts_no_room
      │   │  └─ HC6 violations (aula no disponible)
      │   │
      │   ├─ IF conflicts.length > 0:
      │   │  ├─ UPDATE schedules SET status = 'NEEDS_REVIEW'
      │   │  ├─ UPDATE schedules SET conflicts = JSON[...]
      │   │  └─ Notify user: "Generado con conflictos"
      │   │
      │   └─ ELSE:
      │       └─ Status: 'SOLVED' (sin conflictos) ✓
      │
      ├─ [6] SEND NOTIFICATION
      │   ├─ Enqueue EmailJob
      │   │  └─ "Horario generado: [link]"
      │   │
      │   └─ Update WebSocket (si conectado)
      │       └─ Broadcast: schedule_generated event
      │
      └─ COMPLETE JOB
          ├─ status: "COMPLETED"
          ├─ result: {scheduleId, conflicts: 0}
          └─ completedAt: NOW()

  └─ FRONTEND RECEIVES POLLING:
      ├─ status: "COMPLETED"
      ├─ result.scheduleId: 42
      ├─ result.conflicts: 0
      │
      └─ Actions:
          ├─ Hide spinner
          ├─ Show toast: "✓ Horario generado"
          ├─ Enable button: "Visualizar"
          └─ Enable button: "Descargar"

END: User can view/download schedule
```

---

## 6. Puntos Críticos de Rendimiento

> 🎯 **Objetivo**, salvo lo que ya existe en las tablas actuales: `users` (índice por `school_id`), `refresh_tokens` (índices por `user_id` y `expires_at`, y `token_hash` único), `rate_limit_attempts` (índice `key, attempted_at`) y `access_links` (índice `school_id, purpose` y el índice único parcial de un restablecimiento pendiente por usuario). Los índices covering, la caché y la monitorización de esta sección corresponden a las tablas de horarios.

### 6.1 Índices Críticos (Covering Indexes)

```sql
-- HC2 DETECTION: SINGLE_LOCATION (CRÍTICO)
CREATE INDEX IX_schedules_professor_session ON schedule_entries(
  professorId, 
  dayOfWeek, 
  sessionNumber
) WHERE deletedAt IS NULL;

-- Búsquedas rápidas por calendar
CREATE INDEX IX_schedules_calendar_status ON schedules(
  calendarId, 
  status, 
  createdAt DESC
);

-- Búsquedas por profesor
CREATE INDEX IX_professor_schedule ON schedule_entries(
  professorId, 
  dayOfWeek
) INCLUDE (subjectId, roomId);

-- Case-insensitive search (US11)
CREATE INDEX IX_subjects_name_ci ON subjects(
  LOWER(name)
) WHERE deletedAt IS NULL;

-- Búsquedas profesor disponibilidad
CREATE INDEX IX_professor_availability ON professor_availabilities(
  professorId, 
  dayOfWeek, 
  sessionNumber
);

-- Restricciones por curso
CREATE INDEX IX_restrictions_course ON restrictions(
  courseId, 
  status
) INCLUDE (type, params);

-- Búsquedas de jobs
CREATE INDEX IX_generation_jobs ON schedule_generation_jobs(
  calendarId, 
  status, 
  createdAt DESC
);

-- Audit trail
CREATE INDEX IX_audit_trail ON restriction_audit_trail(
  restrictionId, 
  changedAt DESC
);
```

### 6.2 Query Optimization

```typescript
// ❌ LENTO: N+1 queries
async function getSchedulesWithDetails(calendarId: string) {
  const schedules = await db.schedules.findMany({
    where: { calendarId }
  });
  
  for (const schedule of schedules) {
    schedule.entries = await db.scheduleEntries.findMany({
      where: { scheduleId: schedule.id }
    }); // N queries adicionales!
  }
  
  return schedules; // ~500ms para 10 schedules
}

// ✅ RÁPIDO: Eager loading (single query)
async function getSchedulesWithDetails(calendarId: string) {
  const schedules = await db.schedules.findMany({
    where: { calendarId },
    include: {
      entries: {
        include: {
          subject: true,
          professor: true,
          room: true
        }
      }
    }
  }); // 1 query optimizado
  
  return schedules; // ~50ms
}

// ✅ RÁPIDO: Indexed search
async function searchProfessorsByCaseInsensitive(query: string) {
  const professors = await db.professors.findMany({
    where: {
      firstName: {
        search: query.toLowerCase() // Usa índice LOWER
      }
    },
    take: 10
  }); // Índice: ~5ms
  
  return professors;
}

// ❌ LENTO: Without index
// WHERE LOWER(firstName) LIKE '%' + query + '%' → Full scan

// ✅ RÁPIDO: Session detection (HC2)
async function detectProfessorOverlaps(scheduleId: string) {
  // Usa vista + índice covering
  const conflicts = await db.raw(`
    SELECT * FROM schedule_conflicts_professor_overlap
    WHERE scheduleId = $1
  `, [scheduleId]); // ~20ms (indexed)
  
  return conflicts;
}

// ❌ LENTO: Recalcular en runtime
// SELECT prof, day, session, COUNT(*)
// FROM schedule_entries
// GROUP BY prof, day, session
// HAVING COUNT(*) > 1 → Full table scan ~2000ms
```

### 6.3 Caching Strategy

```typescript
class RestrictionService {
  private restrictionCache = new Map<string, Restriction[]>();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutos

  async getRestrictions(calendarId: string): Promise<Restriction[]> {
    const cacheKey = `restrictions:${calendarId}`;
    
    // 1. Verificar cache
    if (this.restrictionCache.has(cacheKey)) {
      const cached = this.restrictionCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data; // ~1ms (memory)
      }
    }
    
    // 2. Fetch DB
    const restrictions = await this.repo.findByCalendar(calendarId);
    // ~50ms (con índice)
    
    // 3. Cache para futuras llamadas
    this.restrictionCache.set(cacheKey, {
      data: restrictions,
      timestamp: Date.now()
    });
    
    return restrictions;
  }

  invalidateCache(calendarId: string): void {
    // Llamar después UPDATE/DELETE
    this.restrictionCache.delete(`restrictions:${calendarId}`);
  }
}

// Redis para datos compartidos (multi-instance)
class ScheduleGeneratorService {
  constructor(private redis: Redis) {}

  async getCachedSchedule(scheduleId: string): Promise<Schedule | null> {
    const cached = await this.redis.get(`schedule:${scheduleId}`);
    if (cached) {
      return JSON.parse(cached); // ~5ms
    }
    
    const schedule = await this.repo.findById(scheduleId);
    
    // Cache 1 hora
    await this.redis.setex(
      `schedule:${scheduleId}`,
      3600,
      JSON.stringify(schedule)
    );
    
    return schedule;
  }
}
```

### 6.4 Monitoreo de Performance

```typescript
// CloudWatch Custom Metrics
class PerformanceMonitor {
  constructor(private cloudwatch: CloudWatch) {}

  async recordScheduleGeneration(duration: number, algorithm: string): Promise<void> {
    await this.cloudwatch.putMetricData({
      MetricData: [
        {
          MetricName: 'ScheduleGenerationDuration',
          Value: duration,
          Unit: 'Milliseconds',
          Dimensions: [{ Name: 'Algorithm', Value: algorithm }]
        }
      ]
    });
  }

  async recordDatabaseQueryTime(query: string, duration: number): Promise<void> {
    // Alertar si > 1000ms
    if (duration > 1000) {
      console.warn(`Slow query (${duration}ms): ${query}`);
    }

    await this.cloudwatch.putMetricData({
      MetricData: [{
        MetricName: 'DatabaseQueryDuration',
        Value: duration,
        Dimensions: [{ Name: 'Query', Value: query.substring(0, 50) }]
      }]
    });
  }
}

// Middleware: Auto-track request latency
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', async () => {
    const duration = Date.now() - start;
    
    await monitor.recordRequestDuration(
      req.path,
      duration,
      res.statusCode
    );
    
    // Log si lento
    if (duration > 500) {
      logger.warn(`Slow request: ${req.path} (${duration}ms)`);
    }
  });
  
  next();
});
```

---

## 7. Validaciones en Tiempo Real

> En lo implementado, la validación de los campos del registro, del login, de las invitaciones y del restablecimiento se hace en el backend (Zod) y en el frontend con **las mismas reglas**, ambos recorren la tabla `test-fixtures/registration-fields.json`. La contraseña admite de 8 caracteres a 72 bytes en UTF-8 (límite de Bcrypt) y se rechaza lo que lo supera en lugar de truncarlo. 🎯 Las validaciones de restricciones, los triggers y los CHECK de horarios son objetivo.

### 7.1 Validaciones Frontend (Instant Feedback)

```typescript
// Validación con Zod
import { z } from 'zod';

const RestrictionSchema = z.object({
  type: z.enum(['HOURS_PER_WEEK', 'AVAILABILITY', 'NO_DUPLICATE']),
  subjectId: z.number().int().positive(),
  courseId: z.number().int().positive(),
  params: z.object({
    sessionsPerWeek: z.number().int().min(1).max(8),
    maxPerDay: z.number().int().min(1).max(3).optional()
  })
});

// React component with real-time validation
function RestrictionForm() {
  const [restrictions, setRestrictions] = useState([]);
  const [totalFranjas, setTotalFranjas] = useState(0);

  useEffect(() => {
    // Recalcular suma en tiempo real
    const suma = restrictions.reduce((acc, r) => {
      return acc + (r.params.sessionsPerWeek || 0);
    }, 0);
    
    setTotalFranjas(suma);
  }, [restrictions]);

  const handleAddRestriction = (newRestriction: Restriction) => {
    try {
      // Validar
      RestrictionSchema.parse(newRestriction);
      
      // Chequear suma
      const newTotal = totalFranjas + newRestriction.params.sessionsPerWeek;
      
      if (newTotal > 25) {
        // Aviso pero permite (soft constraint)
        toast.warning(`Total: ${newTotal}/25 franjas (sobrecargado)`);
      }
      
      setRestrictions([...restrictions, newRestriction]);
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Mostrar validación específica
        toast.error(error.errors[0].message);
      }
    }
  };

  return (
    <>
      <RestrictionInput onAdd={handleAddRestriction} />
      
      <AvailabilityBar
        used={totalFranjas}
        total={25}
        status={totalFranjas > 25 ? 'warning' : 'ok'}
      />
      
      {restrictions.map(r => (
        <RestrictionRow key={r.id} restriction={r} />
      ))}
    </>
  );
}
```

### 7.2 Validaciones Backend (Hard Constraints)

```typescript
class HardConstraintValidator {
  async validateRestrictionSum(calendarId: string, newRestriction: Restriction): Promise<ValidationResult> {
    // Obtener todas restricciones activas
    const restrictions = await this.repo.findActive(calendarId);
    
    // Calcular suma
    const totalBeforeAdd = restrictions.reduce((sum, r) => {
      return sum + (r.params?.sessionsPerWeek || 0);
    }, 0);
    
    const totalAfterAdd = totalBeforeAdd + newRestriction.params.sessionsPerWeek;
    
    return {
      isValid: totalAfterAdd <= 25, // 25 franjas máximo
      message: `Total: ${totalAfterAdd}/25 franjas`,
      warning: totalAfterAdd >= 20 // Aviso si > 80%
    };
  }

  async validateSingleLocationConstraint(scheduleEntry: ScheduleEntry): Promise<void> {
    // HC2: Profesor no puede estar en 2 lugares mismo tiempo
    const existingEntry = await this.repo.findOne({
      professorId: scheduleEntry.professorId,
      dayOfWeek: scheduleEntry.dayOfWeek,
      sessionNumber: scheduleEntry.sessionNumber,
      notId: scheduleEntry.id
    });
    
    if (existingEntry && existingEntry.roomId !== scheduleEntry.roomId) {
      throw new ValidationError(
        'HC2_VIOLATION',
        `Professor cannot be in 2 rooms at same time: ` +
        `${scheduleEntry.dayOfWeek} Session ${scheduleEntry.sessionNumber}`
      );
    }
  }

  async validateAvailability(scheduleEntry: ScheduleEntry): Promise<void> {
    // HC3: Profesor debe estar disponible en sesión
    const prof = await this.professorRepo.findById(scheduleEntry.professorId);
    
    const isAvailable = prof.availabilities.some(a =>
      a.dayOfWeek === scheduleEntry.dayOfWeek &&
      a.sessionNumber === scheduleEntry.sessionNumber
    );
    
    if (!isAvailable) {
      throw new ValidationError(
        'HC3_VIOLATION',
        `Professor not available: ${prof.name} on ${scheduleEntry.dayOfWeek} Session ${scheduleEntry.sessionNumber}`
      );
    }
  }

  async validateLoadBalance(professorsMap: Map<string, number[]>): Promise<void> {
    // HC1: Carga horaria equilibrada
    for (const [profId, sessions] of professorsMap.entries()) {
      const prof = await this.professorRepo.findById(profId);
      
      if (sessions.length > prof.maxLoad) {
        throw new ValidationError(
          'HC1_VIOLATION',
          `Professor overloaded: ${prof.name} (${sessions.length}/${prof.maxLoad} sessions)`
        );
      }
    }
  }
}

// Middleware de validación global
app.post('/api/schedule-entries', async (req, res, next) => {
  try {
    const entry = req.body;
    
    // Validar esquema
    ScheduleEntrySchema.parse(entry);
    
    // Validar hard constraints
    await validator.validateSingleLocationConstraint(entry);
    await validator.validateAvailability(entry);
    
    // Pasar al siguiente middleware si todo OK
    next();
    
  } catch (error) {
    if (error instanceof ValidationError) {
      res.status(400).json({
        error: error.code,
        message: error.message
      });
    } else {
      next(error);
    }
  }
});
```

### 7.3 Triggers de Base de Datos

```sql
-- Trigger: Detectar HC2 violaciones en tiempo de insert
CREATE TRIGGER TRG_detect_single_location_violation
AFTER INSERT ON schedule_entries
FOR EACH ROW
BEGIN
  -- Verificar si profesor asignado a múltiples aulas en mismo día/sesión
  DECLARE duplicate_count INT;
  
  SELECT COUNT(*) INTO duplicate_count
  FROM schedule_entries se
  WHERE se.professorId = NEW.professorId
    AND se.dayOfWeek = NEW.dayOfWeek
    AND se.sessionNumber = NEW.sessionNumber
    AND se.roomId != NEW.roomId
    AND se.deletedAt IS NULL
    AND se.id != NEW.id;
  
  IF duplicate_count > 0 THEN
    INSERT INTO schedule_conflicts(scheduleId, conflictType, detail)
    VALUES (NEW.scheduleId, 'HC2_SINGLE_LOCATION_VIOLATION',
            CONCAT('Professor ', NEW.professorId, ' in multiple rooms'));
    
    UPDATE schedules SET status = 'NEEDS_REVIEW'
    WHERE id = NEW.scheduleId;
  END IF;
END;

-- Trigger: Auditoría de cambios en restricciones
CREATE TRIGGER TRG_audit_restriction_changes
AFTER UPDATE ON restrictions
FOR EACH ROW
BEGIN
  INSERT INTO restriction_audit_trail(
    restrictionId, 
    changedAt, 
    changedBy, 
    beforeValue, 
    afterValue
  ) VALUES (
    NEW.id,
    NOW(),
    @current_user_id,
    JSON_OBJECT('status', OLD.status, 'params', OLD.params),
    JSON_OBJECT('status', NEW.status, 'params', NEW.params)
  );
  
  -- Marcar horarios que usen esta restricción como NEEDS_REVIEW
  UPDATE schedules
  SET status = 'NEEDS_REVIEW'
  WHERE calendarId = NEW.calendarId;
END;

-- Trigger: Soft delete en profesores
CREATE TRIGGER TRG_soft_delete_professor
BEFORE DELETE ON professors
FOR EACH ROW
BEGIN
  UPDATE professors SET deletedAt = NOW() WHERE id = OLD.id;
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Use UPDATE instead';
END;
```

---

## 8. Auditoría y Trazabilidad GDPR

> **Implementado:** no existen la tabla `audit_logs`, `user_consents`, los triggers ni el borrado lógico por trigger. Hoy se cubre así:
> - **Consentimiento:** `users` guarda la fecha y la versión de la política de privacidad aceptada (un `CHECK` exige las dos o ninguna); el registro y la aceptación de una invitación la exigen.
> - **Trazabilidad:** eventos estructurados en el log JSON (`USER_ROLE_CHANGED`, `USER_SUSPENDED`, `USER_REACTIVATED`, `INVITATION_CREATED`, `INVITATION_ACCEPTED`, `PASSWORD_RESET_COMPLETED`, `AUTHORIZATION_DENIED`…), con identificadores y nunca con tokens, enlaces ni contraseñas. CloudWatch los conserva 30 días.
> - **Minimización:** la sesión no guarda la IP ni el user agent; los intentos del limitador guardan la IP y se purgan a las 24 horas, y las copias de seguridad tampoco los conservan.
> - **Copias:** `pg_dump` diario a S3 con retención de 30 días.
>
> 🎯 El audit trail en base de datos, el derecho al olvido y la exportación de datos de los ejemplos siguientes son objetivo.

### 8.1 Audit Trail Completo

```sql
-- Tabla central de auditoría
CREATE TABLE audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  entity_type VARCHAR(100) NOT NULL,  -- 'calendar', 'restriction', 'schedule', etc
  entity_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,         -- 'CREATE', 'UPDATE', 'DELETE', 'VIEW'
  performed_by INT NOT NULL FK users,
  performed_at TIMESTAMP DEFAULT NOW(),
  
  before_value JSON,  -- Estado anterior (para UPDATE)
  after_value JSON,   -- Estado nuevo
  change_summary TEXT,  -- Resumen legible: "Changed sessions from 5 to 6"
  
  ip_address VARCHAR(45),             -- Auditoría seguridad
  user_agent TEXT,
  
  INDEX IX_audit_entity (entity_type, entity_id),
  INDEX IX_audit_user (performed_by, performed_at DESC),
  INDEX IX_audit_timestamp (performed_at DESC)
);

-- Trigger automático: Registrar CREATE
CREATE TRIGGER TRG_audit_calendar_create
AFTER INSERT ON calendars
FOR EACH ROW
BEGIN
  INSERT INTO audit_logs(entity_type, entity_id, action, performed_by, after_value)
  VALUES ('calendar', NEW.id, 'CREATE', @current_user_id, 
          JSON_OBJECT('name', NEW.name, 'status', NEW.status));
END;

-- Trigger automático: Registrar UPDATE
CREATE TRIGGER TRG_audit_restriction_update
AFTER UPDATE ON restrictions
FOR EACH ROW
BEGIN
  INSERT INTO audit_logs(entity_type, entity_id, action, performed_by, 
                        before_value, after_value, change_summary)
  VALUES ('restriction', NEW.id, 'UPDATE', @current_user_id,
          JSON_OBJECT('status', OLD.status, 'params', OLD.params),
          JSON_OBJECT('status', NEW.status, 'params', NEW.params),
          CONCAT('Status: ', OLD.status, ' → ', NEW.status));
END;
```

### 8.2 GDPR Compliance

```typescript
// Soft Delete (Derecho al olvido)
class GDPRService {
  async deleteUserData(userId: string): Promise<void> {
    // 1. Marcar como eliminado (soft delete)
    await this.db.users.update({
      where: { id: userId },
      data: { deletedAt: new Date() }
    });
    
    // 2. Eliminar datos sensibles
    await this.db.users.update({
      where: { id: userId },
      data: {
        email: `deleted_${userId}@example.com`,
        password: null,
        firstName: 'DELETED',
        lastName: 'USER'
      }
    });
    
    // 3. Audit log: quién eliminó cuándo
    await this.auditService.log({
      action: 'DELETE_USER_REQUEST',
      userId: userId,
      timestamp: new Date(),
      executedBy: 'ADMIN_GDPR_REQUEST'
    });
    
    // 4. Mantener audit trail (legal requirement)
    // No eliminar audit_logs (necesario para compliance)
  }

  async exportUserData(userId: string): Promise<string> {
    // Usar vistas de auditoría para generar PDF/JSON completo
    const data = await this.db.raw(`
      SELECT 
        users.*,
        (SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'action', action,
          'timestamp', performed_at,
          'changes', change_summary
        ))
         FROM audit_logs 
         WHERE performed_by = users.id) as activity
      FROM users
      WHERE id = $1
    `, [userId]);
    
    return JSON.stringify(data, null, 2);
  }
}

// Tracking de consentimiento
class ConsentService {
  async recordConsent(userId: string, consentType: string): Promise<void> {
    await this.db.user_consents.create({
      userId,
      type: consentType,  // 'ANALYTICS', 'MARKETING', 'DATA_RETENTION'
      givenAt: new Date(),
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent
    });
  }

  async hasConsent(userId: string, consentType: string): Promise<boolean> {
    return await this.db.user_consents.findFirst({
      where: { userId, type: consentType }
    }) !== null;
  }
}
```

### 8.3 Data Retention Policy

```sql
-- Limpiar datos expirados automáticamente (cron job)
-- Ejecutar cada domingo 02:00 UTC

DELETE FROM schedule_generation_jobs
WHERE completedAt < DATE_SUB(NOW(), INTERVAL 90 DAY);

DELETE FROM refresh_tokens
WHERE expiresAt < NOW() AND isRevoked = TRUE;

DELETE FROM audit_logs
WHERE performed_at < DATE_SUB(NOW(), INTERVAL 7 YEAR);
-- Mantener 7 años para compliance

-- Archive schedules antiguos (> 2 años)
INSERT INTO schedules_archive
SELECT * FROM schedules
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 2 YEAR);

DELETE FROM schedules
WHERE createdAt < DATE_SUB(NOW(), INTERVAL 2 YEAR);
```

---

## 9. Seguridad

### 9.0 Seguridad implementada ✅

| Ámbito | Cómo está resuelto |
|--------|--------------------|
| **Sesión** | Refresh token opaco y aleatorio; en la base de datos solo está su **SHA-256** (no Bcrypt: hay que poder buscarlo por su hash). Cookie `refresh_token` `HttpOnly`, `Secure`, `SameSite=Lax`, caducidad absoluta de **24 horas** sin renovación. Access token JWT HS256 (`jose`) de 15 minutos con el id de su sesión (`sid`) |
| **Revocación** | `AuthenticateRequest` lee la sesión `sid` por clave primaria en **cada** petición protegida: un cierre de sesión, una baja o un restablecimiento invalidan los access tokens al instante. Coste: una lectura por petición |
| **Autorización** | Roles `ADMIN` y `MEMBER` en `users.role`. `requireRole` va después de `requireAuthentication`. El rol, el estado y el colegio salen de la base de datos, **no** de los claims del token. La guarda de rol del frontend es solo una comodidad |
| **Aislamiento por colegio** | Todo puerto que accede a datos de un colegio recibe `schoolId` de la identidad; ningún endpoint lo acepta del cliente. Un recurso de otro colegio da el mismo `404` que uno inexistente |
| **Contraseñas** | Bcrypt (`@node-rs/bcrypt`), de 8 caracteres a 72 bytes. La verificación de un usuario inexistente compara contra un hash ficticio del mismo coste |
| **Fuerza bruta y abuso** | Límite de intentos por IP y operación (`<operación>:<ip>`) con reserva previa y bloqueo por clave con `pg_advisory_xact_lock`; el login solo cuenta los fallidos. reCAPTCHA v3 con reto v2 en registro y login. Falla cerrado (`503`) si la base de datos no responde |
| **Enlaces de acceso** | Token aleatorio, solo su SHA-256 en la base de datos, caducidad de 72 horas, un solo uso. Viaja en el fragmento de la URL (no llega a los logs de acceso) y en el cuerpo de la petición. El `410` no distingue entre inexistente, usado, revocado o caducado |
| **Origen** | `requireAllowedOrigin` en las rutas con cookie. `X-Origin-Verify` entre CloudFront y API Gateway: sin ella, `403 ORIGIN_NOT_ALLOWED` |
| **Navegador** | `Content-Security-Policy` estricta en CloudFront (sin `unsafe-*`), `Cache-Control: no-store` en la API, textos del usuario pintados como texto plano |
| **Validación de entrada** | Zod en el backend. Sin sanitización de HTML: React escapa lo que pinta |
| **Secretos** | SSM Parameter Store (SecureString), leídos al arrancar en frío; nunca en el repositorio ni en conversaciones |
| **Inyección SQL** | Prisma con consultas parametrizadas; las consultas crudas (`$executeRaw`) usan parámetros |

Los ejemplos de 9.1 a 9.3 son el diseño original y **difieren** de lo anterior en cuatro puntos: el refresh token se guardaba con Bcrypt y duraba 7 días, guardaba la IP y el user agent, el rol se leía del token y había roles académicos separados (jefe de estudios, director, profesor y alumno) con permisos por acción. El producto solo tiene los roles `ADMIN` y `MEMBER`; los cargos del profesorado son un dato informativo. 🎯 Los permisos por acción de cada rol en los módulos de horarios se definirán con sus historias.

### 9.1 JWT + Refresh Token Revocation 🎯 (diseño original, ver 9.0)

```typescript
// Flujo seguro de autenticación
class AuthService {
  async login(email: string, password: string): Promise<AuthTokens> {
    // 1. Validar credenciales
    const user = await this.db.users.findUnique({ where: { email } });
    if (!user || !bcrypt.compare(password, user.password)) {
      throw new UnauthorizedError('Invalid credentials');
    }
    
    // 2. Generar access token (corta duración: 15 min)
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m', issuer: 'CalendarSchool' }
    );
    
    // 3. Generar refresh token (larga duración: 7 días)
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = bcrypt.hash(refreshToken);
    
    // 4. Guardar hash en BD (NO el token crudo)
    await this.db.refresh_tokens.create({
      userId: user.id,
      tokenHash,
      isRevoked: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ipAddress: this.context.ipAddress,
      userAgent: this.context.userAgent
    });
    
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string): Promise<string> {
    // 1. Hash del token
    const tokenHash = bcrypt.hash(refreshToken);
    
    // 2. Buscar en BD
    const storedToken = await this.db.refresh_tokens.findUnique({
      where: { tokenHash }
    });
    
    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid refresh token');
    }
    
    // 3. Generar nuevo access token
    const newAccessToken = jwt.sign(
      { userId: storedToken.userId },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    
    return newAccessToken;
  }

  async logout(refreshToken: string): Promise<void> {
    // 1. Hash del token
    const tokenHash = bcrypt.hash(refreshToken);
    
    // 2. Marcar como revocado (NO eliminar)
    await this.db.refresh_tokens.update({
      where: { tokenHash },
      data: { isRevoked: true }
    });
    
    // 3. Auditoría
    await this.auditService.log({
      action: 'USER_LOGOUT',
      userId: this.context.userId,
      timestamp: new Date()
    });
  }
}

// Middleware: Validar JWT
app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      // Token expirado: cliente debe usar refresh token
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
});
```

### 9.2 Control de Acceso (RBAC) 🎯 (diseño original, ver 9.0)

```typescript
// Roles y permisos
enum Permission {
  CREATE_CALENDAR = 'create:calendar',
  EDIT_CALENDAR = 'edit:calendar',
  DELETE_CALENDAR = 'delete:calendar',
  CREATE_RESTRICTION = 'create:restriction',
  GENERATE_SCHEDULE = 'generate:schedule',
  VIEW_SCHEDULES = 'view:schedules',
  // ... más
}

// Los roles reales son ADMIN y MEMBER (users.role). Qué permisos tiene cada uno en los módulos
// de horarios se definirá con las historias correspondientes.
const rolePermissions: Record<string, Permission[]> = {
  ADMIN: [/* por definir */],
  MEMBER: [/* por definir */]
};

// Middleware: Autorización
function authorize(...allowedPermissions: Permission[]) {
  return (req, res, next) => {
    const userPermissions = rolePermissions[req.user.role] || [];
    
    const hasPermission = allowedPermissions.some(p =>
      userPermissions.includes(p)
    );
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    next();
  };
}

// Uso
app.post('/api/calendars', 
  authorize(Permission.CREATE_CALENDAR),
  calendarController.create
);
```

### 9.3 Input Validation & Sanitization 🎯 (diseño original, ver 9.0)

```typescript
// Validar y sanitizar todas entradas
import DOMPurify from 'isomorphic-dompurify';

class InputValidator {
  sanitizeString(input: string): string {
    // Limpiar HTML/XSS
    return DOMPurify.sanitize(input);
  }

  validateEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  validateInteger(value: any, min: number, max: number): boolean {
    const num = parseInt(value);
    return !isNaN(num) && num >= min && num <= max;
  }

  validateJSON(jsonString: string): boolean {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }
}

// SQL Injection prevention (ORM + Parameterized queries)
// ❌ VULNERABLE:
const userInput = req.body.calendarName;
const query = `SELECT * FROM calendars WHERE name = '${userInput}'`;

// ✅ SAFE (con Prisma ORM):
const calendar = await prisma.calendars.findFirst({
  where: { name: userInput }  // Automáticamente parametrizado
});

// ✅ SAFE (con parameterized queries):
const result = await db.query('SELECT * FROM calendars WHERE name = $1', [userInput]);
```

---

## 10. Estrategia de Testing

### 10.0 Estado actual ✅

| Nivel | Herramienta | Dónde | Tests |
|-------|-------------|-------|-------|
| **Unitarios** | Vitest (+ Testing Library y `axe-core` en el frontend) | `*.test.ts(x)` junto al código; los casos de uso se prueban con dobles de los puertos | Backend 1935 (con integración), frontend 1459, infraestructura 57 |
| **Integración** | Vitest + Supertest sobre `composeApp` con PostgreSQL 17 real | `*.int.test.ts`; cada worker usa su propio esquema `test_<n>` de `calendarschool_test` y `resetDatabase()` lo vacía antes de cada test | Incluidos en los 1935 del backend |
| **E2E** | Cypress en modo headless contra el build servido con `vite preview` y un backend real | `frontend/cypress/e2e/`; `npm run test:e2e` lo orquesta igual en local y en CI | 147 en 15 ficheros |
| **Infraestructura** | Vitest con `aws-cdk-lib/assertions` | Plantilla de los stacks, CloudFront Function y smoke test, sin AWS | Incluidos en los 57 |
| **Contrato** | `openapi-typescript` + `api:types:check` | CI falla si los tipos generados no coinciden con `docs/api-spec.yml` | — |

- **Cobertura mínima:** 90 % en backend y 80 % en frontend, medida sobre unitarios más integración. `server.ts`, `lambda.ts` y `main.tsx` están excluidos y no pueden contener lógica.
- **TDD:** los tests de cada tarea se escriben primero y se ven fallar.
- **Accesibilidad:** `axe-core` (WCAG 2.1 A y AA) en los tests de las páginas; el contraste lo mide el navegador, no jsdom.
- **Datos de test:** los E2E usan datos únicos por test y la base solo se vacía al empezar. `scripts/e2eData.mjs` solo actúa sobre bases `*_test`.
- **Los ejemplos de 10.1 y 10.2** son ilustrativos de la futura generación de horarios: las cifras (5 E2E, 30 de integración, 150 unitarios) y los casos de HC1 y de restricciones no corresponden al código actual.

### 10.1 Pirámide de Testing 🎯 (ilustrativa)

```
                     /\
                    /  \
                   / E2E \        (5 tests)
                  /────────\      Cypress
                 /          \     End-to-end workflows
                /            \
               /──────────────\
              /   Integration  \   (30 tests)
             /     Tests        \  Vitest + Supertest
            /                    \ DB + Services
           /──────────────────────\
          /                        \
         /        Unit Tests        \  (150+ tests)
        /        (Vitest)            \ Individual functions
       /                              \
      /────────────────────────────────\

DISTRIBUCIÓN:
- Unit: 70% (funciones puras, servicios, validaciones)
- Integration: 20% (DB queries, APIs, workflows)
- E2E: 10% (Rutas completas usuario final)
```

### 10.2 Test Coverage 🎯 (ilustrativa)

```typescript
// Unit Test: Validar HC1 (LOAD_BALANCE)
describe('HardConstraintValidator', () => {
  describe('validateLoadBalance', () => {
    it('should reject when professor exceeds max load', async () => {
      const professorsMap = new Map([
        ['prof1', new Array(26)]  // 26 sesiones (max 25)
      ]);
      
      await expect(
        validator.validateLoadBalance(professorsMap)
      ).rejects.toThrow('HC1_VIOLATION');
    });

    it('should allow exactly at capacity', async () => {
      const professorsMap = new Map([
        ['prof1', new Array(25)]  // Exactamente 25
      ]);
      
      await expect(
        validator.validateLoadBalance(professorsMap)
      ).resolves.not.toThrow();
    });
  });
});

// Integration Test: Crear restricción y validar suma
describe('RestrictionService', () => {
  beforeEach(async () => {
    db = await setupTestDB();
    service = new RestrictionService(db);
  });

  it('should warn when total franjas > 25', async () => {
    // Insert calendar con 25 franjas
    const calendar = await db.calendars.create({
      name: 'Test Calendar',
      sessions: generateSessions(25)
    });
    
    // Crear restricciones que sumen 26
    const restrictions = [
      { subject: 'Inglés', sessionsPerWeek: 8 },
      { subject: 'Lengua', sessionsPerWeek: 10 },
      { subject: 'Mate', sessionsPerWeek: 8 }
    ];
    
    for (const r of restrictions) {
      const result = await service.createRestriction(calendar.id, r);
      // Debería avisar pero permitir
      expect(result.warning).toBeTruthy();
    }
  });
});

// E2E Test: Flujo completo usuario
describe('Schedule Generation E2E', () => {
  it('should generate valid schedule from scratch', async () => {
    // 1. Login
    const { accessToken } = await login('admin@school.edu', 'password');
    
    // 2. Crear calendario
    const calendar = await api.post('/api/calendars', {
      name: 'Primaria 2026-27',
      sessions: 6,
      breaks: 1
    }, { headers: { Authorization: `Bearer ${accessToken}` } });
    
    expect(calendar.status).toBe(201);
    expect(calendar.body.id).toBeDefined();
    
    // 3. Crear asignaturas
    const subject = await api.post('/api/subjects', {
      name: 'Inglés',
      type: 'CORE'
    });
    
    expect(subject.status).toBe(201);
    
    // 4. Crear restricción
    const restriction = await api.post('/api/restrictions', {
      subjectId: subject.body.id,
      courseId: 1,
      type: 'HOURS_PER_WEEK',
      params: { sessionsPerWeek: 3 }
    });
    
    expect(restriction.status).toBe(201);
    
    // 5. Generar horario
    const scheduleJob = await api.post('/api/schedules/generate', {
      calendarId: calendar.body.id,
      algorithm: 'CSP'
    });
    
    expect(scheduleJob.status).toBe(202);
    expect(scheduleJob.body.jobId).toBeDefined();
    
    // 6. Poll hasta completar
    let schedule;
    let attempts = 0;
    while (attempts < 60) {
      const jobStatus = await api.get(`/api/schedules/job/${scheduleJob.body.jobId}`);
      
      if (jobStatus.body.status === 'COMPLETED') {
        schedule = jobStatus.body.result;
        break;
      }
      
      await sleep(1000);
      attempts++;
    }
    
    expect(schedule).toBeDefined();
    expect(schedule.conflicts).toBe(0);
    
    // 7. Verificar horario tiene todas asignaciones
    const entries = await api.get(`/api/schedules/${schedule.scheduleId}/entries`);
    expect(entries.body.length).toBe(25);  // 5 días × 5 sesiones
  });
});
```

---

## 11. Despliegue e Infraestructura

> **Estado (cambio `despliegue-aws`):** la sección 11.1 describe lo que está desplegado en el MVP. La arquitectura de 11.4 (Aurora, ElastiCache, X-Ray, Serverless Framework) es la **arquitectura objetivo**, a la que se llegará cuando las historias que la necesitan (colas, caché, generación de horarios) lo justifiquen. La guía operativa es `docs/despliegue/PUESTA_EN_MARCHA.md`.

### 11.1 Arquitectura desplegada en el MVP

```
   Navegador ──HTTPS──> CloudFront (app.calendarschools.es)          DNS en DonDominio (2 CNAME)
                           │
          ┌────────────────┴─────────────────┐
          │ /*  (CloudFront Function         │ /api/*  (sin función: todo llega al backend,
          │      spa-rewrite)                │          también /api/auth/*)
          ▼                                  ▼  + cabecera secreta X-Origin-Verify
   S3 privado (OAC)                  API Gateway (HTTP API, ANY /{proxy+}, 10 req/s)
   frontend de Vite + cabecera CSP           │
                                             ▼
                                     AWS Lambda (nodejs24.x, x86_64, 1024 MB, 15 s)
                                     ├─ secretos: SSM Parameter Store (SecureString)
                                     ├─ logs JSON: CloudWatch (30 días)
                                     └─ máx. 2 conexiones, TLS verificado
                                             │
                                             ▼
                                     Supabase (PostgreSQL 17, plan gratuito, Fráncfort)
                                     pooler en modo transacción (:6543), rol sin permisos sobre el esquema

   GitHub Actions ──OIDC──> roles de IAM (despliegue y copias)      Copia diaria: pg_dump ──> S3 (30 días)
```

**Decisiones principales** (todas con sus alternativas en `openspec/changes/despliegue-aws/design.md`):

| Decisión | Motivo |
|---|---|
| **AWS CDK en TypeScript** (workspace `infrastructure/`), no Serverless Framework | Serverless Framework v4 exige cuenta y licencia en su servicio; CDK usa el mismo lenguaje que el resto del repositorio y se prueba con Vitest |
| **Frontend y API en el mismo origen** (`app.calendarschools.es`) | Sin CORS, y la cookie de sesión `HttpOnly` funciona |
| **Región `eu-central-1`** para todo salvo el certificado (`us-east-1`) | Los datos se quedan en la UE; CloudFront solo admite certificados de `us-east-1` |
| **Supabase (PostgreSQL 17)** en lugar de RDS/Aurora | Coste fijo cercano a 0 en un piloto de 2-3 semanas; sin VPC ni NAT. Compensa con el rol de aplicación sin permisos de esquema, Data API desactivada, TLS verificado y copias propias |
| **Secretos en SSM Parameter Store**, no en Secrets Manager | Gratis; la Lambda los lee una vez por arranque en frío |
| **Cabecera `X-Origin-Verify`** | Evita que alguien llegue a API Gateway sin pasar por CloudFront y falsee la IP que usa el límite de intentos |
| **Registro y login abiertos** desde el cambio `inicio-sesion` (US02) | El registro estuvo cerrado en CloudFront (una función que respondía `404` a `/api/auth/*`) hasta tener login, porque sin él quien se registrara no podría volver a entrar. Se abrió al final de ese cambio, con la CSP, el consentimiento, la purga, el límite de intentos fallidos y la política de privacidad ya en producción. Cerrarlo de nuevo es desplegar el commit anterior (ver la guía de puesta en marcha) |
| **`Content-Security-Policy` estricta** en la `ResponseHeadersPolicy` de CloudFront (`override: true`) | Limita scripts y marcos al propio origen y a reCAPTCHA. Se define en un único JSON (`frontend/content-security-policy.json`) que también sirve `vite preview`, así que el E2E prueba la misma cabecera que producción. Solo `connect-src` admite además `https://www.google.com/recaptcha/`, porque el script de v3 envía telemetría desde la página |
| **Purga diaria de intentos del limitador** (registro y login) en `backup.yml`, antes de `pg_dump` | Los intentos guardan la IP (dato personal): se borran los de más de 24 horas y las copias de seguridad tampoco los conservan |
| **Login que solo cuenta los intentos fallidos, con reCAPTCHA** | Un colegio suele salir por una sola IP: el intento se reserva antes de comprobar la contraseña y se libera si es correcta, así que los correctos no bloquean. No hay límite por email (sin avisos por correo bloquearía a la víctima): los ataques distribuidos los frena reCAPTCHA, que se verifica antes de comprobar la contraseña |
| **La sesión no guarda la IP ni el user agent** | Ninguna funcionalidad los usa y no habría purga: solo quedan en los logs (30 días), y la política de privacidad lo declara |
| **El access token lleva el id de su sesión (`sid`) y el middleware comprueba esa sesión en cada petición** (US03 y US02_b1) | Un JWT sin estado no se puede invalidar: tras un cierre de sesión, una baja de usuario (US02_b) o un restablecimiento de contraseña (US02_c) seguiría valiendo hasta 15 minutos, y en esos dos casos quien tiene la sesión puede ser otra persona. Una lista de exclusión de tokens costaría lo mismo por petición y necesitaría purga. El coste es una lectura por clave primaria de `refresh_tokens` por petición protegida. El middleware llega con el primer endpoint protegido; el cierre de sesión solo añade el `sid` |
| **El cierre de sesión revoca solo la sesión del navegador, es idempotente y no borra la cookie si falla** (US03) | `POST /api/auth/logout` marca `revoked_at` de la sesión de la cookie y responde `204` también si no había sesión que cerrar. Si la base de datos no responde da `503` sin borrar la cookie: fingir un cierre que el servidor no ha hecho dejaría un token válido que el usuario cree cerrado. Sin diálogo de confirmación ni «cerrar todas las sesiones» |
| **`Cache-Control: no-store` por defecto en toda la API** (US03) | Un middleware común en `/api`, antes del parser de JSON, evita que el navegador guarde datos de la sesión que se vean con el botón «Atrás» tras cerrarla, y que una ruta nueva olvide la cabecera. Solo `GET /api/municipalities` (datos públicos y fijos) mantiene su caché de un día |
| **Las pestañas del navegador se avisan del cierre de sesión con `BroadcastChannel`** (US03) | Una pestaña que cierra la sesión avisa a las demás para que pasen a `/login` sin esperar a su siguiente renovación; sin `BroadcastChannel` se degrada a descubrirlo con un `401`. No usa `localStorage`, que la sesión no toca |
| **El rol y el colegio de una petición salen de la base de datos, no del access token** (US02_b1) | El middleware lee la sesión `sid` con su usuario y su colegio en una consulta por clave primaria, que ya necesita para la decisión B, así que añadir `role`, `status` y `schoolId` no cuesta nada más. Un cambio de rol (CA8) o una baja (CA9) se aplican en la petición siguiente sin cerrar las sesiones del usuario. Se descartó dejar el rol en el token y revocar sus sesiones al cambiarlo: también es seguro, pero echa al usuario incluso cuando se le asciende. Los claims `role` y `schoolId` siguen en el token, sin usarse para autorizar |
| **Una ruta de layout única para las páginas con sesión** (US02_b1) | `AuthenticatedLayout` es la única guarda de sesión del frontend y contiene la cabecera y la navegación; las rutas de un rol cuelgan además de `RequireRole`, que es solo una comodidad (decide el backend). Las páginas públicas quedan fuera, así que no muestran la cabecera aunque haya sesión. US04 decidirá el contenido de la navegación sin tocar la estructura |
| **Peticiones autenticadas con renovación única** (US02_b1) | `authorizedFetch` añade el `Bearer` y, ante un `401 INVALID_SESSION`, renueva la sesión una vez (compartida entre las peticiones simultáneas) y repite la petición una vez. No hay renovación proactiva con temporizador: añadiría estado y casos de pestañas en segundo plano |
| **Un corte de la conexión con la base de datos es `503`, no `500`** (US03) | `pg` lanza un error sin código (`Connection terminated unexpectedly`) cuando el servidor corta la conexión durante una consulta (un reinicio de la base de datos o del *pooler*); se reconoce por su mensaje fijo y se responde `503 DATABASE_UNAVAILABLE`. Otros errores sin código siguen siendo `500`, para no ocultar fallos reales |
| **Los enlaces de invitación y de restablecimiento viajan en el fragmento de la URL, se muestran una vez y se guardan solo como SHA-256** (US02_b3, US02_b4 y US02_c) | El fragmento no llega a los logs de acceso ni a `Referer`; el hash impide recuperar un enlace si se filtra la base de datos. Un `410` único evita distinguir enlaces caducados, usados o revocados. Hoy no se envía correo: el administrador copia el enlace |
| **Límite de intentos independiente por operación** (`registro`, `login`, `invitation`, `password-reset`) | Cada operación tiene su clave y su máximo (`*_ATTEMPTS_MAX`), así que agotar uno no bloquea los demás. Solo cuentan los enlaces no válidos o los intentos fallidos |
| **Pantalla de bienvenida sin estado** (US04) | `/onboarding` es solo presentación: las funcionalidades son datos con una ruta opcional y las que aún no existen se muestran como bloques no interactivos «Próximamente». Activar un módulo es añadir su ruta |
| **Nombres únicos dentro de su colegio con el nombre normalizado y un índice único** (US05) | `courses.name` guarda lo que se muestra y `normalized_name` lo que se compara (recortado, espacios colapsados, minúsculas; se conservan acentos y `º`/`ª`), con `UNIQUE (school_id, normalized_name)`. El alta es un `create` anidado en una transacción y el conflicto lo decide el índice, nunca una consulta previa, para que dos envíos simultáneos no creen dos cursos. Se descartó un índice funcional `lower(name)` o `citext`: Prisma no los modela y habría que mantenerlos a mano en cada migración |
| **Editar un registro con los hijos que posee: el estado final en un `PUT`, la identidad por `id`, la diferencia en una función pura y la fila padre bloqueada** (US07) | Un solo `PUT` deja el curso y sus clases como se piden, en una transacción; las clases con `id` se renombran, las sin `id` se crean y las ausentes se borran, así que nada que dependa de una clase la pierde al editarla. `planCourseUpdate` (dominio) calcula la diferencia con el curso bloqueado por `FOR UPDATE`, y las escrituras van en un orden que no rompe el índice único no diferible (curso, borrar, renombrar en dos fases con `#<i>`, crear). Una clase que ya no existe es `409 COURSE_CHANGED`; en lo demás gana el último guardado. Se descartaron los endpoints por clase (no atómicos), borrar y recrear las clases (se pierde la identidad), `SERIALIZABLE` con reintentos y una columna de versión (otra historia) |
| **Borrar un registro con los hijos que posee: el impacto antes, un `DELETE` real que devuelve lo que borró, la cascada de la base de datos y la fila padre bloqueada** (US08) | `GET …/impact` dice qué se perdería (sin cambiar nada) para que el diálogo informe antes de confirmar; `DELETE` bloquea la fila del curso (`FOR UPDATE`), cuenta y borra en una transacción y las clases caen por `ON DELETE CASCADE`, así que ningún borrado a mano puede olvidar un hijo. Responde `200` con lo realmente borrado (no `204`), porque el impacto pudo cambiar tras abrir el diálogo. Los campos de historias futuras (`studentCount`) están en el contrato desde ya con una constante en el adaptador. Se descartaron el borrado lógico (otra historia si el producto lo pide), borrar las clases a mano (no atómico y olvidable) y una segunda confirmación por número de alumnos |
| **Crear un registro y asignarle una relación 1:1 con un `UPDATE` condicionado en la misma transacción** (US09) | El profesor se inserta y la clase se le asigna con `updateMany` cuyo `where` lleva las tres reglas (existe, es del colegio y no tiene tutor); es atómico por sí mismo, sin `FOR UPDATE` ni `SERIALIZABLE`, y el índice único de `classes.tutor_id` es solo la red de seguridad. Si no cambia ninguna fila, una lectura distingue el motivo y el error deshace el alta | `PrismaProfessorRepository.create`; `professors.int.test.ts` con dos altas simultáneas (`201` y `409`) |
| **Despliegue por OIDC** desde un entorno `prod` que solo admite `main` | Sin claves de AWS de larga duración en GitHub |

### 11.2 Infraestructura como código

Dos stacks de CDK, instanciados por `infrastructure/bin/app.ts` con `-c env=prod`:

- `CalendarSchool-<env>-Certificate` (`us-east-1`): el certificado de ACM, validado por DNS.
- `CalendarSchool-<env>-App` (`eu-central-1`): bucket del frontend, distribución de CloudFront con la función de las rutas de la SPA, Lambda, HTTP API, grupo de logs, bucket de copias, proveedor OIDC de GitHub y los roles de despliegue y de copias.

La Lambda se empaqueta con esbuild (ESM) y lleva `@node-rs/bcrypt` instalado para Linux x64. El nombre del entorno forma los nombres de los recursos y la ruta de SSM (`/calendarschool/<env>/`), de modo que un `staging` futuro es otro valor de `-c env`.

### 11.3 CI/CD

- `ci.yml`: en cada pull request y push a `main`, jobs `quality` (lint y formato, tipos de la API al día con el contrato, comprobación de tipos, tests con cobertura, build y enlaces simbólicos de `.claude`/`.cursor`) y `e2e` (Cypress) con PostgreSQL 17; en los push a `main`, un tercer job llama a `deploy.yml` si los dos han pasado.
- `deploy.yml`: build, migraciones (`prisma migrate deploy` antes de publicar nada), `cdk deploy --all`, publicación del frontend en S3, invalidación de `/index.html` y smoke test (`scripts/smoke.mjs`: la aplicación responde, `/api/health` da `200` con la base de datos arriba, `POST /api/auth/login` con el cuerpo vacío llega al backend y da `400 VALIDATION_ERROR` sin crear datos, y la URL directa de API Gateway da `403`). También se lanza a mano con la referencia de un commit de `main`: es el rollback.
- `backup.yml`: `pg_dump` diario del esquema `public` a S3 y una llamada a `/api/health`, que además mantiene activo el proyecto gratuito de Supabase.

### 11.4 Arquitectura objetivo (pendiente) 🎯

```
                    ┌─────────────────┐
                    │  Route 53       │
                    │  (DNS)          │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  CloudFront     │
                    │  (CDN, static)  │
                    └────────┬────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
        ┌───────▼────────┐      ┌────────▼──────┐
        │  API Gateway   │      │    S3         │
        │  (REST + WS)   │      │  (Front + PDFs)
        └───────┬────────┘      └───────────────┘
                │
        ┌───────▼────────────────────┐
        │  AWS Lambda                │
        │  (Node.js Express)         │
        │  ├─ Concurrent: 100        │
        │  ├─ Memory: 1024 MB        │
        │  ├─ Timeout: 900 sec       │
        │  └─ Layers:                │
        │     ├─ OR-Tools library    │
        │     └─ Node modules        │
        └───────┬────────────────────┘
                │
        ┌───────┴────────────────────────┐
        │                                │
    ┌───▼────────────┐        ┌──────────▼──────┐
    │  RDS Aurora    │        │  ElastiCache    │
    │  PostgreSQL    │        │  Redis          │
    │  ├─ Multi-AZ   │        │  ├─ Cluster     │
    │  ├─ Backup     │        │  └─ TTL: auto   │
    │  └─ Read rep   │        └─────────────────┘
    └────────────────┘

                ┌──────────────────────────┐
                │  CloudWatch + X-Ray      │
                │  ├─ Logs                 │
                │  ├─ Metrics              │
                │  └─ Traces               │
                └──────────────────────────┘

                ┌──────────────────────────┐
                │  AWS CDK                 │
                │  (Infraestructura as Code)
                └──────────────────────────┘
```

Esta arquitectura incorpora Aurora Multi-AZ, ElastiCache y X-Ray, y se plantea para cuando el producto lo necesite. El diseño actual es compatible con ella: la capa de datos se aísla tras los repositorios y la configuración llega siempre desde fuera.

---

## Conclusión

CalendarSchool tiene hoy un **núcleo sólido y desplegado**: registro, sesiones revocables al instante, gestión de los usuarios del colegio, invitaciones y restablecimiento de contraseña, sobre un monolito modular en capas, un contrato OpenAPI como fuente de verdad y un despliegue serverless en AWS con CI/CD y copias.

✅ **Implementado:** autenticación y usuarios, aislamiento por colegio, límite de intentos, reCAPTCHA, CSP estricta, consentimiento y minimización de datos, tests unitarios, de integración y E2E, y despliegue por OIDC.  
🎯 **Pendiente (objetivo):** calendarios, restricciones y generación de horarios con CSP + Backtracking, conflictos HC1-HC6, comedor, cola de trabajos, caché, notificaciones, exportaciones y la monitorización avanzada.

El diseño actual es compatible con el objetivo: la capa de datos se aísla tras los repositorios, la configuración llega siempre desde fuera y cada historia añade sus tablas de forma incremental.
