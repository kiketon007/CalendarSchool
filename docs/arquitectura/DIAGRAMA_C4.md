# Diagrama C4 - CalendarSchool Architecture

**Versión:** 3.0 · **Fecha:** 2026-10-19

Este documento tiene dos partes:

- **Parte A: arquitectura implementada ✅.** Lo que está construido y desplegado hoy: registro, sesiones, usuarios del colegio, invitaciones, restablecimiento de contraseña y pantalla de bienvenida.
- **Parte B: arquitectura objetivo 🎯.** El diseño de la generación de horarios, la cola, la caché y el modelo de 23 tablas, que se irá construyendo con las historias siguientes.

El detalle de cada decisión está en `ARQUITECTURA_COMPLETA.md`; el modelo para Structurizr, en `ARQUITECTURA_C4_STRUCTURIZR.dsl`.

---

# Parte A: arquitectura implementada ✅

## Nivel 1: Contexto del sistema

```mermaid
C4Context
    title Diagrama de Contexto C4 - CalendarSchool (implementado)

    Person(admin, "Administrador del colegio", "Registra el colegio, gestiona usuarios, genera invitaciones y restablecimientos de contraseña")
    Person(member, "Miembro del colegio", "Inicia sesión y accede a la pantalla de bienvenida")

    System(calendarschool, "CalendarSchool", "Aplicación web multicolegio: autenticación, usuarios del colegio y, en las próximas historias, horarios y comedor")

    System_Ext(recaptcha, "Google reCAPTCHA", "v3 con reto v2: protege el registro y el login")
    System_Ext(github, "GitHub Actions", "CI/CD con OIDC y copia diaria de la base de datos")
    System_Ext(dns, "DonDominio", "DNS del dominio app.calendarschools.es (dos CNAME)")

    Rel(admin, calendarschool, "Se registra, inicia sesión, gestiona usuarios e invita", "HTTPS")
    Rel(member, calendarschool, "Acepta una invitación e inicia sesión", "HTTPS")
    Rel(calendarschool, recaptcha, "Carga el script (navegador) y verifica tokens (backend)", "HTTPS")
    Rel(github, calendarschool, "Despliega y hace copias", "OIDC / AWS")
    Rel(dns, calendarschool, "Resuelve el dominio hacia CloudFront", "DNS")
```

El sistema solo distingue `ADMIN` y `MEMBER`. Los cargos del profesorado (director, jefe de estudios) son un dato informativo del profesor y no un actor ni un permiso.

---

## Nivel 2: Contenedores

```mermaid
C4Container
    title Diagrama de Contenedores - CalendarSchool (implementado)

    Person(admin, "Administrador", "ADMIN")
    Person(member, "Miembro", "MEMBER")

    System_Boundary(cs, "CalendarSchool") {
        Container(cdn, "CloudFront", "AWS CloudFront", "Punto de entrada único. CSP estricta, función spa-rewrite para las rutas de la SPA y reenvío de /api/* con la cabecera secreta X-Origin-Verify")
        Container(spa, "SPA React", "React 19 + TypeScript + Bootstrap 5.3 (Vite) en S3 privado", "Registro, login, bienvenida, usuarios, invitaciones y restablecimiento. Sesión solo en memoria")
        Container(gateway, "API Gateway", "AWS HTTP API", "ANY /{proxy+}, 10 req/s. Solo atiende a CloudFront")
        Container(backend, "Backend API", "Node.js 24 + Express 5 + TypeScript en AWS Lambda", "Casos de uso, reglas de dominio y adaptadores. Máx. 2 conexiones a la base de datos")
        ContainerDb(database, "PostgreSQL", "Supabase PostgreSQL 17 + Prisma 7", "8 tablas. Pooler en modo transacción y rol de aplicación sin permisos de esquema")
        Container(params, "SSM Parameter Store", "AWS SSM (SecureString)", "Secretos y configuración; la Lambda los lee una vez por arranque en frío")
        ContainerDb(backups, "Copias de seguridad", "AWS S3", "pg_dump diario del esquema public, retención de 30 días")
    }

    System_Ext(recaptcha, "Google reCAPTCHA", "v3 / v2")
    System_Ext(github, "GitHub Actions", "CI/CD y copias")

    Rel(admin, cdn, "Usa", "HTTPS")
    Rel(member, cdn, "Usa", "HTTPS")
    Rel(cdn, spa, "Sirve los ficheros estáticos", "OAC")
    Rel(cdn, gateway, "Reenvía /api/*", "HTTPS + X-Origin-Verify")
    Rel(gateway, backend, "Invoca", "Lambda proxy, payload 2.0")
    Rel(backend, database, "Lee y escribe", "SQL (Prisma)")
    Rel(backend, params, "Lee la configuración", "AWS SDK")
    Rel(backend, recaptcha, "Verifica tokens", "HTTPS (siteverify)")
    Rel(spa, recaptcha, "Carga el script y pide tokens", "HTTPS")
    Rel(github, backups, "Sube la copia diaria", "OIDC")
    Rel(github, database, "Aplica migraciones y hace pg_dump", "Conexión en modo sesión")
```

---

## Nivel 3: Componentes del backend

```mermaid
C4Component
    title Diagrama de Componentes - Backend API (implementado)

    Container(spa, "SPA React", "React 19", "Cliente")

    Container_Boundary(api, "Backend API (Express 5 en Lambda)") {
        Component(entry, "server.ts / lambda.ts", "Puntos de entrada", "Sin lógica. Cargan la configuración y llaman a composeApp")
        Component(compose, "composeApp", "Raíz de composición", "Única que crea Prisma, los adaptadores, los casos de uso y createApp(deps)")

        Component(httpCommon, "Capa HTTP común", "Express middleware", "requireOriginVerification, requestTimeout, noStore, requireAllowedOrigin, errorHandler y formato success/data/error")
        Component(guards, "Guardas de sesión", "Express middleware", "requireAuthentication y requireRole('ADMIN')")

        Component(authRouter, "authRouter", "Express router", "register, login, refresh y logout (cookie refresh_token)")
        Component(usersRouter, "usersRouter", "Express router", "Lista, rol, baja y reactivación; generar y revocar restablecimientos")
        Component(invitationsRouter, "invitationsRouter", "Express router", "Generar, listar y revocar invitaciones (ADMIN)")
        Component(coursesRouter, "coursesRouter", "Express router", "Crear un curso con sus clases, listar los del colegio y leer, editar y borrar uno (ADMIN y MEMBER)")
        Component(publicRouters, "Routers públicos", "Express router", "Consultar y aceptar invitaciones; consultar y confirmar restablecimientos; municipios; salud")

        Component(sessionCases, "Casos de uso de sesión", "Application", "RegisterSchool, LogIn, RefreshSession, LogOut, AuthenticateRequest")
        Component(userCases, "Casos de uso de usuarios", "Application", "ListSchoolUsers y ManageSchoolUser")
        Component(linkCases, "Casos de uso de enlaces", "Application", "CreateInvitation, ListPendingInvitations, RevokeInvitation, LookupInvitation, AcceptInvitation y los cuatro de restablecimiento")
        Component(courseCases, "Casos de uso de cursos", "Application", "CreateCourse (valida el cuerpo y crea el curso con sus clases en una transacción) y ListCourses (orden natural en castellano), GetCourse y UpdateCourse (el estado final con las clases por id, en una transacción con el curso bloqueado), GetCourseDeletionImpact y DeleteCourse (qué se pierde y el borrado real con sus clases por cascada, con el curso bloqueado)")
        Component(limiter, "Limitador de intentos", "Application", "AttemptLimiter genérico por operación e IP (registro, login, invitation, password-reset)")
        Component(domain, "Reglas de dominio", "Domain", "accessLinkStatus, planUserChange, refreshTokenStatus y errores de dominio; puertos de repositorio")

        Component(prismaRepos, "Repositorios Prisma", "Infrastructure", "Registro, usuarios del colegio, sesiones, enlaces de acceso, cursos, intentos y municipios. Transacciones y bloqueo por colegio")
        Component(security, "Adaptadores de seguridad", "Infrastructure", "Bcrypt, JWT (jose), generador de tokens SHA-256 y UUIDv7")
        Component(captcha, "Verificador de captcha", "Infrastructure", "RecaptchaCaptchaVerifier (producción) o FakeCaptchaVerifier (tests)")
        Component(config, "Configuración y logs", "Infrastructure", "loadConfig, lectura de SSM y logger JSON")
    }

    ContainerDb(database, "PostgreSQL", "Supabase 17", "6 tablas")

    Rel(spa, authRouter, "POST /api/auth/*", "HTTPS + cookie")
    Rel(spa, usersRouter, "GET/PUT/POST /api/users/**", "Bearer")
    Rel(spa, invitationsRouter, "/api/invitations", "Bearer")
    Rel(spa, coursesRouter, "/api/courses", "Bearer")
    Rel(spa, publicRouters, "lookup / accept / confirm", "Token en el cuerpo")

    Rel(entry, compose, "Llama")
    Rel(compose, httpCommon, "Monta")
    Rel(httpCommon, guards, "Antes de las rutas protegidas")
    Rel(guards, sessionCases, "AuthenticateRequest")
    Rel(authRouter, sessionCases, "Usa")
    Rel(usersRouter, userCases, "Usa")
    Rel(usersRouter, linkCases, "Restablecimientos")
    Rel(invitationsRouter, linkCases, "Usa")
    Rel(coursesRouter, courseCases, "Usa")
    Rel(courseCases, domain, "cleanName, normalizeName y el puerto CourseRepository")
    Rel(publicRouters, linkCases, "Usa")
    Rel(sessionCases, limiter, "Registro y login")
    Rel(linkCases, limiter, "Enlaces no válidos")
    Rel(sessionCases, domain, "Reglas")
    Rel(userCases, domain, "planUserChange")
    Rel(linkCases, domain, "accessLinkStatus")
    Rel(domain, prismaRepos, "Puertos implementados por")
    Rel(sessionCases, security, "Hash, JWT, tokens")
    Rel(sessionCases, captcha, "Verifica")
    Rel(prismaRepos, database, "SQL", "Prisma")
    Rel(compose, config, "Lee")
```

---

## Nivel 3: Componentes del frontend

```mermaid
C4Component
    title Diagrama de Componentes - SPA React (implementado)

    Container_Boundary(web, "SPA React 19") {
        Component(app, "App y rutas", "react-router", "Rutas públicas: /, /registro, /login, /privacidad, /invitacion y /restablecer")
        Component(layout, "AuthenticatedLayout", "Ruta de layout", "Única guarda de sesión. Monta AppHeader y el Outlet")
        Component(roleGuard, "RequireRole", "Ruta de layout", "Comodidad: lleva a /onboarding si el rol no corresponde. Decide el backend")
        Component(session, "SessionProvider", "Contexto", "Access token y usuario solo en memoria; una renovación al montar; BroadcastChannel entre pestañas")
        Component(authFetch, "authorizedFetch", "Cliente HTTP", "Añade el Bearer y, ante 401 INVALID_SESSION, renueva una vez y repite una vez")
        Component(publicPages, "Páginas públicas", "React", "RegisterPage, LoginPage, AcceptInvitationPage y PasswordResetPage. El token del enlace se lee del fragmento y se quita de la barra")
        Component(homePage, "OnboardingPage", "React", "Bienvenida: saludo, colegio, FeatureCard por funcionalidad («Próximamente») y atajo a Usuarios para ADMIN")
        Component(coursesPages, "CoursesPage, CreateCoursePage, EditCoursePage y DeleteCourseModal", "React", "Listado de cursos (tabla desde 768 px y tarjetas por debajo, con la fecha de creación, un enlace Editar, un botón Borrar con su diálogo de confirmación y una búsqueda por nombre en el navegador) y el formulario compartido CourseForm para crear y editar, con filas de clases (que conservan su id), validación compartida con el backend y errores por campo")
        Component(usersPage, "UsersPage", "React", "Tabla de usuarios, acciones por fila, InvitationsSection y GeneratedLinkPanel")
        Component(services, "Servicios", "TypeScript", "Un servicio por recurso. Devuelven un resultado por caso, por error.code, y nunca lanzan")
        Component(support, "i18n, validación, captcha y CSP", "Transversal", "es.json y en.json, reglas de campos compartidas con el backend, módulo captcha y content-security-policy.json")
    }

    Container(gateway, "API (CloudFront → API Gateway)", "HTTPS", "")

    Rel(app, layout, "Rutas con sesión")
    Rel(layout, roleGuard, "Rutas de un rol")
    Rel(layout, session, "Lee")
    Rel(layout, homePage, "/onboarding")
    Rel(layout, coursesPages, "/cursos, /cursos/nuevo y /cursos/:id/editar")
    Rel(coursesPages, services, "Usa")
    Rel(roleGuard, usersPage, "/usuarios (ADMIN)")
    Rel(app, publicPages, "Rutas públicas")
    Rel(usersPage, services, "Usa")
    Rel(publicPages, services, "Usa")
    Rel(services, authFetch, "Peticiones autenticadas")
    Rel(authFetch, session, "Token y renovación")
    Rel(services, gateway, "fetch", "JSON")
```

---

## Nivel 3: Base de datos

```mermaid
C4Component
    title Diagrama de Componentes - PostgreSQL (implementado)

    Component(municipalities, "municipalities", "Tabla", "code (PK, código INE), name, province. Municipios de la Comunitat Valenciana: datos fijos cargados por migración")
    Component(schools, "schools", "Tabla", "id (UUIDv7), name, normalized_name, municipality_code. Único por nombre normalizado y municipio")
    Component(users, "users", "Tabla", "id, school_id, email (único), password_hash, nombres, role (ADMIN|MEMBER), status (ACTIVE|SUSPENDED|DELETED), fecha y versión de la política de privacidad")
    Component(refresh, "refresh_tokens", "Tabla", "id (= sid de la sesión), user_id, token_hash (SHA-256), expires_at (24 h), revoked_at")
    Component(attempts, "rate_limit_attempts", "Tabla", "id, key (operación:ip), attempted_at. Se purga a las 24 horas")
    Component(links, "access_links", "Tabla", "id, school_id, purpose (INVITATION|PASSWORD_RESET), token_hash (SHA-256), role, user_id, created_by_id, expires_at (72 h), used_at, revoked_at")
    Component(courses, "courses", "Tabla", "id (UUIDv7), school_id, name, normalized_name. Único por colegio y nombre normalizado")
    Component(classes, "classes", "Tabla", "id (UUIDv7), course_id, name, normalized_name. Única por curso y nombre normalizado; se borra con su curso; su id no cambia al renombrarla. Sin tutor_id hasta US09")

    Rel(schools, municipalities, "FK municipality_code")
    Rel(users, schools, "FK school_id")
    Rel(refresh, users, "FK user_id (cascade)")
    Rel(links, schools, "FK school_id")
    Rel(links, users, "FK user_id y created_by_id")
    Rel(courses, schools, "FK school_id")
    Rel(classes, courses, "FK course_id (cascade)")
```

Particularidades que Prisma no modela y están escritas a mano en las migraciones: el `CHECK` de `users` (fecha y versión de la política, las dos o ninguna), el `CHECK` de `access_links` (`role` solo en invitaciones, `user_id` solo en restablecimientos) y el índice único parcial `access_links_pending_reset_user_key` (un restablecimiento pendiente por usuario).

---

## Flujos principales

**Petición protegida (identidad y autorización):**

```mermaid
sequenceDiagram
    participant S as SPA
    participant B as Backend (Lambda)
    participant D as PostgreSQL

    S->>B: GET /api/users (Authorization: Bearer)
    B->>B: Verifica el JWT (HS256, 15 min)
    B->>D: Lee la sesión sid con su usuario y su colegio (clave primaria)
    D-->>B: Sesión, usuario, rol y colegio
    B->>B: Rechaza si está revocada, caducada o el usuario no está ACTIVE (401)
    B->>B: requireRole('ADMIN') (403)
    B->>D: Lista los usuarios del colegio de la identidad
    D-->>B: Usuarios
    B-->>S: 200 (Cache-Control: no-store)
    Note over S,B: Ante 401 INVALID_SESSION la SPA renueva una vez con la cookie y repite una vez
```

**Invitación de una persona al colegio:**

```mermaid
sequenceDiagram
    actor A as Administrador
    actor P as Persona invitada
    participant S as SPA
    participant B as Backend
    participant D as PostgreSQL

    A->>S: Genera una invitación (rol MEMBER)
    S->>B: POST /api/invitations
    B->>D: Guarda el SHA-256 del token (caduca a las 72 h)
    B-->>S: 201 con /invitacion#token (única respuesta con el enlace)
    A->>P: Le entrega el enlace
    P->>S: Abre /invitacion#token
    S->>S: Lee el fragmento y lo quita de la barra
    S->>B: POST /api/invitations/lookup (token en el cuerpo)
    B->>B: Límite de intentos por IP (429) y enlace pendiente (410)
    B-->>S: Colegio y email enmascarado
    P->>S: Completa sus datos y acepta la política
    S->>B: POST /api/invitations/accept
    B->>D: Transacción: marca used_at y crea el usuario con el colegio y el rol del enlace
    B-->>S: 201 (sin sesión)
    S->>P: Navega a /login con el aviso «cuenta creada»
```

El restablecimiento de contraseña sigue el mismo patrón con `/restablecer#token`; al confirmar, la transacción cambia la contraseña y revoca todas las sesiones abiertas del usuario.

**Crear un curso con sus clases:**

```mermaid
sequenceDiagram
    participant S as SPA
    participant B as Backend (Lambda)
    participant D as PostgreSQL

    S->>S: Valida el formulario con las reglas compartidas
    S->>B: POST /api/courses (nombre y clases, Bearer)
    B->>B: Autentica y toma el colegio de la identidad
    B->>B: Valida y limpia el cuerpo (400 con classes[i].name)
    B->>D: Un create anidado: el curso y todas sus clases en una transacción
    alt El nombre normalizado es nuevo en el colegio
        D-->>B: Curso y clases creados
        B-->>S: 201 con las clases y tutor null
        S->>S: Navega a /cursos con el nombre para el aviso
    else Viola courses_school_id_normalized_name_key
        D-->>B: Violación del índice único
        B-->>S: 409 COURSE_ALREADY_EXISTS
        S->>S: Marca el nombre y conserva lo escrito
    end
```

**Editar un curso:**

```mermaid
sequenceDiagram
    participant S as SPA
    participant B as Backend (Lambda)
    participant D as PostgreSQL

    S->>B: GET /api/courses/{id} (Bearer)
    B-->>S: 200 con las clases y su id (404 si es de otro colegio o no existe)
    S->>S: Rellena el formulario; Guardar solo con cambios reales
    S->>B: PUT /api/courses/{id} (nombre y clases con id si ya existían)
    B->>B: Autentica, toma el colegio de la identidad y valida el cuerpo
    B->>D: Transacción: bloquea la fila del curso (FOR UPDATE) y lee sus clases
    B->>B: planCourseUpdate (qué se borra, se renombra y se crea)
    alt Pide una clase que el curso ya no tiene
        B-->>S: 409 COURSE_CHANGED (no se guarda nada)
        S->>S: Avisa y ofrece Recargar
    else El nombre lo tiene otro curso del colegio
        D-->>B: Violación del índice único del curso
        B-->>S: 409 COURSE_ALREADY_EXISTS (se deshace todo)
        S->>S: Marca el nombre y conserva lo escrito
    else Se guarda
        B->>D: Curso, borrar, renombrar en dos fases y crear
        B-->>S: 200 con el curso final
        S->>S: Navega a /cursos con el aviso
    end
```

**Borrar un curso:**

```mermaid
sequenceDiagram
    participant S as SPA
    participant B as Backend (Lambda)
    participant D as PostgreSQL

    S->>B: GET /api/courses/{id}/impact (Bearer)
    B-->>S: 200 con classCount y studentCount (404 si es de otro colegio o no existe)
    S->>S: Diálogo: qué se pierde y Esta acción no se puede deshacer
    S->>B: DELETE /api/courses/{id}
    B->>B: Autentica y toma el colegio de la identidad
    B->>D: Transacción: bloquea la fila del curso (FOR UPDATE), cuenta las clases y borra el curso
    alt El curso existe en el colegio
        D-->>B: Curso borrado y clases borradas por la cascada
        B-->>S: 200 con lo que se borró de verdad
        S->>S: Quita el curso de la lista, avisa y lleva el foco al título
    else Ya no existe (otra persona lo borró)
        B-->>S: 404 NOT_FOUND
        S->>S: Cierra el diálogo, vuelve a pedir la lista y avisa
    end
```

---

# Parte B: arquitectura objetivo 🎯

> Los diagramas siguientes son el diseño de la generación de horarios y de la infraestructura ampliada. **No están construidos**: no existen la cola, la caché, el solver ni la mayoría de las tablas. Se irán incorporando con las historias de calendarios, restricciones y horarios. Lo que sí existe (`users`, `refresh_tokens`) tiene hoy otro esquema (ver el Nivel 3 de la base de datos de la parte A).

## Nivel 1 (objetivo): Contexto del sistema

```mermaid
C4Context
    title Diagrama de Contexto C4 - CalendarSchool (objetivo)

    Person(admin, "Administrador del colegio", "Gestiona usuarios, configura calendarios y restricciones y genera horarios")
    Person(member, "Miembro del colegio", "Consulta y trabaja con los horarios de su colegio")

    System(calendarschool, "CalendarSchool", "Sistema integral de generación de horarios escolares con CSP/Backtracking")

    System_Ext(email_service, "Email Service", "SendGrid/SES - Notificaciones por email")
    System_Ext(storage_service, "AWS S3", "Almacenamiento de PDFs y Excels exportados")
    System_Ext(auth_provider, "JWT Auth", "Autenticación y control de sesiones")

    Rel(admin, calendarschool, "Gestiona usuarios, configura calendarios y restricciones y genera horarios")
    Rel(member, calendarschool, "Consulta y trabaja con los horarios")

    Rel(calendarschool, email_service, "Envía notificaciones")
    Rel(calendarschool, storage_service, "Guarda exportaciones (PDF/Excel)")
    Rel(calendarschool, auth_provider, "Valida tokens JWT")
```

---

## Nivel 2 (objetivo): Contenedores

```mermaid
C4Container
    title Diagrama de Contenedores - CalendarSchool (objetivo)

    Person(usuario, "Usuario del colegio", "Administrador (ADMIN) o miembro (MEMBER)")

    Container(web_app, "React Frontend", "React 19 + TypeScript + Bootstrap", "Interfaz web responsive, componentes interactivos")
    Container(api_gateway, "API Gateway", "AWS API Gateway", "Enrutador HTTP, CORS, rate limiting")
    Container(backend, "Backend API", "Node.js + Express.js + TypeScript", "Controllers, Services, Business Logic, CSP/Backtrack Solvers")
    Container(queue, "Job Queue", "BullMQ + Redis", "Procesamiento asincrónico de generación de horarios")
    Container(database, "PostgreSQL", "PostgreSQL 17 (Supabase) + Prisma ORM", "23 tablas, 7 vistas, triggers, índices covering")
    Container(cache, "Redis Cache", "ElastiCache Redis", "Caché de restricciones, sesiones, datos calientes")

    Rel(usuario, web_app, "Usa", "HTTPS/WebSocket")
    Rel(web_app, api_gateway, "Envía requests", "HTTP REST")
    Rel(api_gateway, backend, "Enruta", "HTTP")
    Rel(backend, database, "Lee/Escribe", "SQL + Prisma")
    Rel(backend, cache, "Accede", "Redis Protocol")
    Rel(backend, queue, "Enqueue jobs", "Redis")
    Rel(queue, backend, "Ejecuta worker", "Node.js Process")
    Rel(queue, database, "Persiste resultado", "SQL")
```

---

## Nivel 3 (objetivo): Componentes del backend

```mermaid
C4Component
    title Diagrama de Componentes - Backend API (objetivo)

    Container(user_client, "Cliente (React)", "")

    Component(auth_controller, "AuthController", "Express", "Login, Logout, Refresh")
    Component(calendar_controller, "CalendarController", "Express", "CRUD calendarios + sesiones")
    Component(subject_controller, "SubjectController", "Express", "CRUD asignaturas")
    Component(restriction_controller, "RestrictionController", "Express", "Crear restricciones + validar")
    Component(schedule_controller, "ScheduleController", "Express", "Generar horarios + visualizar")

    Component(auth_service, "AuthService", "Business Logic", "JWT, Refresh tokens, Logout")
    Component(calendar_service, "CalendarService", "Business Logic", "Gestión calendarios + sesiones")
    Component(subject_service, "SubjectService", "Business Logic", "CRUD asignaturas + asociaciones")
    Component(restriction_service, "RestrictionService", "Business Logic", "Validación restricciones + suma")
    Component(schedule_generator_svc, "ScheduleGeneratorService", "Business Logic", "Orquestación + algoritmos")

    Component(csp_solver, "CSPSolver", "Google OR-Tools", "Constraint Satisfaction Problem (60s timeout)")
    Component(backtrack_solver, "BacktrackSolver", "Custom Algorithm", "Backtracking (120s timeout fallback)")
    Component(conflict_detector, "ConflictDetector", "Analyzer", "Detecta HC1-HC6 violations")

    Component(middleware_auth, "AuthMiddleware", "Express", "Valida JWT + permisos")
    Component(middleware_validation, "ValidationMiddleware", "Express", "Zod schemas")
    Component(middleware_error, "ErrorHandler", "Express", "Manejo global de errores")
    Component(middleware_logging, "LoggingMiddleware", "Express", "Auditoría + trazas")

    Component(repository_calendar, "CalendarRepository", "Data Access", "Queries calendarios")
    Component(repository_restriction, "RestrictionRepository", "Data Access", "Queries restricciones")
    Component(repository_schedule, "ScheduleRepository", "Data Access", "Queries horarios")

    Rel(user_client, auth_controller, "POST /auth/login", "HTTP")
    Rel(user_client, calendar_controller, "GET/POST /calendars", "HTTP")
    Rel(user_client, restriction_controller, "POST /restrictions", "HTTP")
    Rel(user_client, schedule_controller, "POST /schedules/generate", "HTTP")

    Rel(auth_controller, auth_service, "Llama", "")
    Rel(calendar_controller, calendar_service, "Llama", "")
    Rel(restriction_controller, restriction_service, "Llama", "")
    Rel(schedule_controller, schedule_generator_svc, "Llama", "")

    Rel(middleware_auth, auth_service, "Valida", "")
    Rel(middleware_validation, calendar_service, "Valida", "")

    Rel(calendar_service, repository_calendar, "Usa", "")
    Rel(restriction_service, repository_restriction, "Usa", "")
    Rel(schedule_generator_svc, repository_schedule, "Usa", "")

    Rel(schedule_generator_svc, csp_solver, "Ejecuta", "CSP model")
    Rel(schedule_generator_svc, backtrack_solver, "Fallback si timeout", "")
    Rel(schedule_generator_svc, conflict_detector, "Detecta conflictos", "")

    Rel(middleware_logging, middleware_auth, "Audita", "")
    Rel(middleware_error, middleware_validation, "Maneja", "")
```

---

## Nivel 3 (objetivo): Base de datos

```mermaid
C4Component
    title Diagrama de Componentes - PostgreSQL (objetivo)

    Component(users_table, "users", "Tabla", "id, email, password, role, status")
    Component(roles_table, "roles", "Tabla", "id, name, permissions JSON")
    Component(refresh_tokens_table, "refresh_tokens", "Tabla", "id, userId, tokenHash, isRevoked, expiresAt")

    Component(calendars_table, "calendars", "Tabla", "id, name, startDate, endDate, status")
    Component(sessions_table, "sessions", "Tabla", "id, calendarId, sessionNumber, startTime, endTime, isBreak")

    Component(subjects_table, "subjects", "Tabla", "id, name, type (CORE/ELECTIVE), status")
    Component(subject_courses_table, "subject_courses", "M:M", "subjectId, courseId")

    Component(restrictions_table, "restrictions", "Tabla", "id, type, subjectId, courseId, params JSON, status")
    Component(restriction_audit_table, "restriction_audit_trail", "Tabla", "id, restrictionId, changedAt, changedBy, beforeValue, afterValue")

    Component(schedules_table, "schedules", "Tabla", "id, calendarId, status, algorithm, generatedBy, solvedAt")
    Component(schedule_entries_table, "schedule_entries", "Tabla", "id, scheduleId, courseId, dayOfWeek, sessionNumber, subjectId, professorId, roomId")
    Component(generation_jobs_table, "schedule_generation_jobs", "Tabla", "id, calendarId, status, progress, result JSON")

    Component(view_professor_overlap, "schedule_conflicts_professor_overlap", "Vista", "HC2: Detecta profesor en 2 aulas simultaneas")
    Component(view_availability, "schedule_conflicts_availability", "Vista", "HC3: Fuera de disponibilidad")
    Component(view_professor_load, "professor_load_summary", "Vista", "Carga horaria por profesor")

    Component(idx_single_location, "IX_professor_session", "Índice Covering", "profesorId, dayOfWeek, sessionNumber + subjectId, roomId")
    Component(idx_calendar_status, "IX_calendar_status", "Índice", "calendarId, status, createdAt DESC")
    Component(idx_restriction_course, "IX_restriction_course", "Índice", "courseId, status + type, params")

    Rel(users_table, roles_table, "FK role", "")
    Rel(refresh_tokens_table, users_table, "FK userId", "")

    Rel(sessions_table, calendars_table, "FK calendarId", "")
    Rel(subject_courses_table, subjects_table, "FK subjectId", "")

    Rel(restrictions_table, subjects_table, "FK subjectId", "")
    Rel(restriction_audit_table, restrictions_table, "FK restrictionId", "")

    Rel(schedule_entries_table, schedules_table, "FK scheduleId", "")
    Rel(generation_jobs_table, calendars_table, "FK calendarId", "")

    Rel(view_professor_overlap, schedule_entries_table, "SELECT FROM", "")
    Rel(view_availability, schedule_entries_table, "SELECT FROM", "")
    Rel(view_professor_load, schedule_entries_table, "SELECT FROM AGGREGATE", "")

    Rel(idx_single_location, schedule_entries_table, "Indexa", "")
    Rel(idx_calendar_status, schedules_table, "Indexa", "")
    Rel(idx_restriction_course, restrictions_table, "Indexa", "")
```

---

## Nivel 3 (objetivo): Flujo del algoritmo CSP

```mermaid
C4Component
    title Diagrama de Componentes - Algoritmo CSP (objetivo)

    Component(input_loader, "DataLoader", "Module", "Carga BD: calendars, restrictions, professors, rooms")
    Component(model_builder, "CspModelBuilder", "Module", "Construye modelo OR-Tools")
    Component(var_declarator, "VariableDeclarator", "Module", "Declara 25 × cursos variables")
    Component(constraint_adder, "ConstraintAdder", "Module", "Añade HC1-HC6 restricciones")
    Component(solver_executor, "CpSolver", "Google OR-Tools", "Resuelve CSP (timeout 60s)")
    Component(solution_extractor, "SolutionExtractor", "Module", "Extrae assignments si solved")
    Component(conflict_checker, "ConflictChecker", "Module", "Detecta HC violations en resultado")

    Rel(input_loader, model_builder, "Pasa datos", "")
    Rel(model_builder, var_declarator, "Crea modelo", "")
    Rel(var_declarator, constraint_adder, "Declara variables", "")
    Rel(constraint_adder, solver_executor, "Pasa modelo", "")
    Rel(solver_executor, solution_extractor, "Retorna solución", "")
    Rel(solution_extractor, conflict_checker, "Pasa resultado", "")
```

---


## Leyenda

| Símbolo | Significado |
|---------|------------|
| ✅ / Parte A | Implementado y desplegado |
| 🎯 / Parte B | Arquitectura objetivo, aún no construida |
| **Contenedor (C4)** | Sistema independiente (frontend, backend, BD) |
| **Componente** | Unidad de código dentro de un contenedor |
| **FK** | Foreign Key (relación de BD) |
| **Índice Covering** | Índice que incluye todas las columnas (sin acceso a tabla) |
| **Vista** | Consulta guardada en BD para reportes |

---

## Notas Arquitectónicas

### Decisiones clave de lo implementado

1. **Monolito modular en capas con puertos y adaptadores.** Presentación → aplicación → dominio, con la infraestructura implementando los puertos. Una única raíz de composición (`composeApp`) y dos puntos de entrada sin lógica.
2. **Mismo origen para la SPA y la API.** CloudFront sirve ambos; no hay CORS y la cookie de sesión `HttpOnly` funciona.
3. **Sesión revocable al instante.** El access token (15 min) lleva el id de su sesión y cada petición protegida lo comprueba por clave primaria; el rol y el colegio salen de la base de datos.
4. **Enlaces de un solo uso.** Invitaciones y restablecimientos viajan en el fragmento de la URL, se muestran una vez y solo se guarda su SHA-256.
5. **Aislamiento por colegio.** Todo puerto que accede a datos de un colegio recibe `schoolId` de la identidad, nunca del cliente.
6. **Contrato primero.** `docs/api-spec.yml` es la fuente de los tipos del frontend; CI falla si no están al día.

### Del objetivo, lo que se mantiene como línea de diseño

1. **Algoritmo CSP + Backtracking:** CSP (Google OR-Tools) como camino principal y Backtracking determinista como alternativa.
2. **Job Queue (BullMQ + Redis):** generación asíncrona, con reintentos y persistencia.
3. **Índices covering** para detectar HC2 (`profesorId, dayOfWeek, sessionNumber`) y buscar calendarios.
4. **Borrado lógico y auditoría** de profesores, asignaturas y calendarios.

### Flujos del objetivo

**Crear calendario** → POST /calendars → CalendarService → INSERT calendars + sessions (trigger) → audit_logs

**Generar horario** → POST /schedules/generate → BullMQ.enqueue → worker → CSP Solver (60 s) → persistir y detectar conflictos → UPDATE schedules

**Buscar restricciones** → GET /restrictions → RestrictionRepository → caché Redis → <100 ms

---
