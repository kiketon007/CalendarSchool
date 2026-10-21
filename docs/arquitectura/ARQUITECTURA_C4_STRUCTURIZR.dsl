workspace "CalendarSchool - Sistema de Generación de Horarios" "Arquitectura C4 de CalendarSchool. Los elementos con la etiqueta Objetivo son arquitectura diseñada pero todavía no construida; el resto está implementado y desplegado (versión 3.0, 2026-10-19)." {

    model {
        # ============================================================================
        # PERSONAS
        # ============================================================================
        # Los dos roles que distingue el sistema (users.role). Los cargos del profesorado son un dato informativo, no un actor
        admin = person "Administrador del colegio" "Registra el colegio, gestiona los usuarios, genera invitaciones y restablecimientos de contraseña" "Actor"
        member = person "Miembro del colegio" "Acepta una invitación, inicia sesión y accede a la pantalla de bienvenida" "Actor"

        # ============================================================================
        # SISTEMA PRINCIPAL
        # ============================================================================
        calendarschool = softwareSystem "CalendarSchool" "Aplicación web multicolegio: autenticación, usuarios del colegio y, en las próximas historias, generación de horarios y comedor" "Software System" {

            # ====== ENTRADA: CDN ======
            cdn = container "CloudFront" "Punto de entrada único (app.calendarschools.es): CSP estricta, función spa-rewrite para las rutas de la SPA y reenvío de /api/* con la cabecera secreta X-Origin-Verify" "AWS CloudFront" "Infraestructura"

            # ====== FRONTEND ======
            spa = container "SPA React" "Registro, login, bienvenida, usuarios, invitaciones y restablecimiento de contraseña. La sesión vive solo en memoria. Se sirve desde un S3 privado (OAC)" "React 19, TypeScript, Bootstrap 5.3, Vite, react-router, react-i18next" "Web Browser" {
                appRoutes = component "App y rutas" "Rutas públicas: /, /registro, /login, /privacidad, /invitacion y /restablecer" "react-router"
                authLayout = component "AuthenticatedLayout" "Única guarda de sesión del frontend. Monta AppHeader y el Outlet de /onboarding y /usuarios" "Ruta de layout"
                roleGuard = component "RequireRole" "Comodidad: lleva a /onboarding si el rol no corresponde. La decisión real es del backend" "Ruta de layout"
                sessionProvider = component "SessionProvider" "Access token y usuario solo en memoria, una renovación al montar y aviso a otras pestañas con BroadcastChannel" "React Context"
                authorizedFetch = component "authorizedFetch" "Añade el Bearer y, ante 401 INVALID_SESSION, renueva una vez y repite una vez" "Cliente HTTP"
                publicPages = component "Páginas públicas" "RegisterPage, LoginPage, AcceptInvitationPage y PasswordResetPage. El token del enlace se lee del fragmento de la URL y se quita de la barra" "React"
                onboardingPage = component "OnboardingPage" "Bienvenida: saludo, colegio, una FeatureCard por funcionalidad (Próximamente) y atajo a Usuarios para ADMIN. No guarda estado" "React"
                coursesPages = component "CoursesPage, CreateCoursePage, EditCoursePage y DeleteCourseModal" "Listado de cursos (tabla desde 768 px y tarjetas por debajo, con la fecha de creación, un enlace Editar, un botón Borrar con su diálogo de confirmación y una búsqueda por nombre en el navegador) y el formulario compartido CourseForm para crear y editar, con filas de clases que conservan su id y, al editar, un desplegable de tutor, validación compartida con el backend, foco en el primer error y errores del servidor por fila" "React"
                professorsPages = component "ProfessorsPage, CreateProfessorPage y EditProfessorPage" "Listado de profesores (total, tutoría, búsqueda por nombre y apellidos y paginación de 20 en 20 en el navegador, en tabla desde 768 px y tarjetas por debajo, con el borrado en un diálogo que consulta al profesor y avisa de la clase que quedará sin tutor) y formulario con el cargo y las clases libres agrupadas por curso; si no cargan, el campo de la clase se desactiva y se puede enviar sin clase" "React"
                studentsPages = component "StudentsPage, CreateStudentPage y StudentForm" "Listado mínimo de alumnos (tabla desde 768 px y tarjetas por debajo, sin datos sensibles) y formulario con el curso, la clase que depende de él, el comedor sin respuesta inicial y la beca y el tipo de comida solo con «Sí»" "React"
                usersPage = component "UsersPage" "Tabla de usuarios con acciones por fila, InvitationsSection y GeneratedLinkPanel (el enlace se muestra una vez)" "React"
                services = component "Servicios" "Uno por recurso. Devuelven un resultado por caso, por error.code, y nunca lanzan" "TypeScript"
                frontendSupport = component "i18n, validación, captcha y CSP" "es.json y en.json, reglas de campos compartidas con el backend, módulo captcha y content-security-policy.json" "Transversal"
            }

            # ====== API GATEWAY ======
            apiGateway = container "API Gateway" "ANY /{proxy+} hacia la Lambda, 10 req/s. Solo atiende a CloudFront" "AWS HTTP API" "Infraestructura"

            # ====== BACKEND ======
            backend = container "Backend API" "Monolito modular en capas (presentación, aplicación, dominio e infraestructura) con puertos y adaptadores. Máx. 2 conexiones a la base de datos" "Node.js 24, Express 5, TypeScript, AWS Lambda" "Web Service" {
                entryPoints = component "server.ts y lambda.ts" "Puntos de entrada sin lógica: cargan la configuración y llaman a composeApp" "Node.js"
                composeApp = component "composeApp" "Única raíz de composición: crea Prisma, los adaptadores, los casos de uso y createApp(deps)" "TypeScript"

                httpCommon = component "Capa HTTP común" "requireOriginVerification, requestTimeout, noStore, requireAllowedOrigin, errorHandler y formato success/data/error" "Express middleware"
                guards = component "Guardas de sesión" "requireAuthentication (Bearer + AuthenticateRequest) y requireRole('ADMIN')" "Express middleware"

                authRouter = component "authRouter" "register, login, refresh y logout (cookie refresh_token)" "Express router"
                usersRouter = component "usersRouter" "Lista, cambio de rol, baja y reactivación; generar y revocar restablecimientos de contraseña (solo ADMIN)" "Express router"
                invitationsRouter = component "invitationsRouter" "Generar, listar y revocar invitaciones (solo ADMIN)" "Express router"
                coursesRouter = component "coursesRouter" "Crear un curso con sus clases, listar los del colegio y leer, editar y borrar uno. Los usan ADMIN y MEMBER: solo requireAuthentication" "Express router"
                professorsRouter = component "professorsRouter" "Crear un profesor, con la clase que tutoriza (opcional), y listar los del colegio. Los usan ADMIN y MEMBER: solo requireAuthentication" "Express router"
                studentsRouter = component "studentsRouter" "Crear un alumno y listar los del colegio, sin tipo de comida ni observaciones. Los usan ADMIN y MEMBER: solo requireAuthentication" "Express router"
                publicRouters = component "Routers públicos" "Consultar y aceptar invitaciones; consultar y confirmar restablecimientos; municipios; salud" "Express router"

                sessionCases = component "Casos de uso de sesión" "RegisterSchool, LogIn, RefreshSession, LogOut y AuthenticateRequest" "Application"
                userCases = component "Casos de uso de usuarios" "ListSchoolUsers y ManageSchoolUser (cambio de rol, baja y reactivación en una transacción por colegio)" "Application"
                linkCases = component "Casos de uso de enlaces" "CreateInvitation, ListPendingInvitations, RevokeInvitation, LookupInvitation, AcceptInvitation, CreatePasswordReset, RevokePasswordReset, LookupPasswordReset y ConfirmPasswordReset" "Application"
                courseCases = component "Casos de uso de cursos" "CreateCourse (valida el cuerpo, ids UUIDv7, eventos sin nombres) y ListCourses (orden natural en castellano con Intl.Collator), GetCourse y UpdateCourse (estado final con las clases por id y su tutor, en una transacción con el curso bloqueado; un profesor de otro curso es 409 PROFESSOR_ALREADY_TUTOR), GetCourseDeletionImpact y DeleteCourse (qué se pierde y el borrado real con sus clases por cascada, con el curso bloqueado)" "Application"
                professorCases = component "Casos de uso de profesores" "CreateProfessor (valida el cuerpo, ids UUIDv7, eventos PROFESSOR_CREATED y PROFESSOR_CREATION_REJECTED sin nombres; ClassNotFound es 400 con classId NOT_FOUND y ClassAlreadyHasTutor es 409) ListProfessors (por apellidos y nombre), GetProfessor, UpdateProfessor y DeleteProfessor (estado final en una transacción que bloquea al profesor y las dos clases por orden de id; la clase elegida puede quitarse a otro profesor, devuelto como replacedTutor; DeleteProfessor borra con la fila bloqueada y la clase que tutorizaba queda libre por ON DELETE SET NULL, evento PROFESSOR_DELETED sin nombres)" "Application"
                studentCases = component "Casos de uso de alumnos" "CreateStudent (valida el cuerpo, ids UUIDv7, eventos STUDENT_CREATED y STUDENT_CREATION_REJECTED sin datos personales; CourseNotFound y ClassNotFound pasan a 400 con NOT_FOUND) y ListStudents (por apellidos y nombre)" "Application"
                attemptLimiter = component "Limitador de intentos" "AttemptLimiter genérico por operación e IP (registro, login, invitation y password-reset)" "Application"
                domainRules = component "Reglas y puertos de dominio" "accessLinkStatus, planUserChange, refreshTokenStatus, errores de dominio y los puertos de repositorio" "Domain"

                prismaRepos = component "Repositorios Prisma" "Registro, usuarios del colegio, sesiones, enlaces de acceso, cursos, intentos y municipios. Traducen los fallos de conexión a DatabaseUnavailable" "Infrastructure"
                securityAdapters = component "Adaptadores de seguridad" "Bcrypt (@node-rs/bcrypt), JWT HS256 (jose), generador de tokens con SHA-256 y UUIDv7" "Infrastructure"
                captchaVerifier = component "Verificador de captcha" "RecaptchaCaptchaVerifier en producción y FakeCaptchaVerifier en tests" "Infrastructure"
                configAndLogs = component "Configuración y logs" "loadConfig, lectura de SSM y logger JSON con eventos de auditoría" "Infrastructure"

                # Objetivo: generación de horarios
                calendarService = component "CalendarService" "Configuración de calendarios y sesiones" "Service" "Objetivo"
                restrictionService = component "RestrictionService" "Validación de restricciones, cálculo de disponibilidad y detección de duplicados" "Service" "Objetivo"
                scheduleGeneratorService = component "ScheduleGeneratorService" "Orquestación: cargar datos, ejecutar el algoritmo, persistir y detectar conflictos" "Service" "Objetivo"
                cspSolver = component "CSPSolver" "Google OR-Tools: variables y restricciones HC1-HC6 (timeout 60 s)" "Algorithm" "Objetivo"
                backtrackSolver = component "BacktrackSolver" "Backtracking recursivo con poda y forward checking (alternativa, timeout 120 s)" "Algorithm" "Objetivo"
                conflictDetector = component "ConflictDetector" "Detecta violaciones de HC1-HC6 tras la ejecución" "Analyzer" "Objetivo"
            }

            # ====== BASE DE DATOS ======
            database = container "PostgreSQL" "Supabase PostgreSQL 17 con Prisma 7. Pooler en modo transacción y rol de aplicación sin permisos de esquema. 8 tablas implementadas" "PostgreSQL 17, Prisma 7" "Database" {
                # Implementadas
                municipalitiesTable = component "municipalities" "code (PK, código INE), name, province. Municipios de la Comunitat Valenciana: datos fijos cargados por migración" "Tabla" "Table"
                schoolsTable = component "schools" "id (UUIDv7), name, normalized_name, municipality_code. Único por nombre normalizado y municipio" "Tabla" "Table"
                usersTable = component "users" "id, school_id, email (único), password_hash, nombres, role (ADMIN|MEMBER), status (ACTIVE|SUSPENDED|DELETED), fecha y versión de la política de privacidad aceptada" "Tabla" "Table"
                refreshTokensTable = component "refresh_tokens" "id (= sid de la sesión), user_id, token_hash (SHA-256), expires_at (24 h absolutas) y revoked_at" "Tabla" "Table"
                rateLimitTable = component "rate_limit_attempts" "id, key (operación:ip), attempted_at. Se purga a las 24 horas" "Tabla" "Table"
                accessLinksTable = component "access_links" "id, school_id, purpose (INVITATION|PASSWORD_RESET), token_hash (SHA-256), role, user_id, created_by_id, expires_at (72 h), used_at y revoked_at. Un restablecimiento pendiente por usuario (índice único parcial)" "Tabla" "Table"
                coursesTable = component "courses" "id (UUIDv7), school_id, name, normalized_name. Único por colegio y nombre normalizado (courses_school_id_normalized_name_key)" "Tabla" "Table"
                classesTable = component "classes" "id (UUIDv7), course_id, name, normalized_name. Única por curso y nombre normalizado; se borra en cascada con su curso; su id no cambia al renombrarla. tutor_id nulo y único (un profesor tutoriza una sola clase) con ON DELETE SET NULL" "Tabla" "Table"
                professorsTable = component "professors" "id (UUIDv7), school_id, first_name, last_name, position (DIRECTOR|JEFE_ESTUDIOS, opcional) y fechas. Sin email, DNI ni borrado lógico. Las asignaturas y la disponibilidad llegan con sus historias" "Tabla" "Table"
                studentsTable = component "students" "id (UUIDv7), school_id, course_id y class_id (nulos, set null), first_name, last_name, cafeteria, scholarship, food_type, observations (sensibles), fechas. Dos CHECK a mano sobre el comedor. Sin estado ni borrado lógico" "Tabla" "Table"

                # Objetivo: calendarios, restricciones y horarios
                calendarsTable = component "calendars" "Calendario escolar con su estado" "Tabla" "Table,Objetivo"
                sessionsTable = component "sessions" "Sesiones de un calendario: 1-8 y recreos" "Tabla" "Table,Objetivo"
                subjectsTable = component "subjects" "Asignaturas (CORE, ELECTIVE o CUSTOM)" "Tabla" "Table,Objetivo"
                professorAvailabilityTable = component "professor_availabilities" "Disponibilidad por día y sesión" "Tabla" "Table,Objetivo"
                restrictionsTable = component "restrictions" "HOURS_PER_WEEK, AVAILABILITY o NO_DUPLICATE" "Tabla" "Table,Objetivo"
                schedulesTable = component "schedules" "Cabecera del horario generado y su algoritmo" "Tabla" "Table,Objetivo"
                scheduleEntriesTable = component "schedule_entries" "Asignaciones: curso, asignatura, profesor y aula por día y sesión" "Tabla" "Table,Objetivo"
                generationJobsTable = component "schedule_generation_jobs" "Seguimiento de la generación asíncrona" "Tabla" "Table,Objetivo"
                conflictViews = component "Vistas, índices y triggers de conflictos" "schedule_conflicts_* (HC2, HC3, HC6), índices covering y triggers de auditoría" "Vistas y triggers" "View,Objetivo"
            }

            # ====== SERVICIOS DE APOYO ======
            parameterStore = container "SSM Parameter Store" "Secretos y configuración (SecureString); la Lambda los lee una vez por arranque en frío" "AWS SSM" "Infraestructura"
            backups = container "Copias de seguridad" "pg_dump diario del esquema public, retención de 30 días" "AWS S3" "Storage"

            # ====== OBJETIVO ======
            jobQueue = container "Job Queue" "Generación asíncrona de horarios con reintentos y persistencia; limpieza de datos caducados y notificaciones" "BullMQ 5, Redis" "Message Queue,Objetivo"
            cache = container "Redis Cache" "Caché de restricciones y datos calientes con TTL" "AWS ElastiCache Redis" "Cache,Objetivo"
            exportStorage = container "Exportaciones" "PDF y Excel de los horarios" "AWS S3" "Storage,Objetivo"
        }

        # ============================================================================
        # SISTEMAS EXTERNOS
        # ============================================================================
        recaptcha = softwareSystem "Google reCAPTCHA" "v3 con reto v2: protege el registro y el login" "External System"
        github = softwareSystem "GitHub Actions" "CI/CD con OIDC hacia AWS, migraciones y copia diaria de la base de datos" "External System"
        dns = softwareSystem "DonDominio DNS" "Resuelve app.calendarschools.es hacia CloudFront (dos CNAME)" "External System"
        emailService = softwareSystem "Email Service" "SendGrid o AWS SES: notificaciones de horarios generados y cambios" "External System,Objetivo"
        orTools = softwareSystem "Google OR-Tools" "Librería de resolución de problemas de satisfacción de restricciones" "External System,Objetivo"

        # ============================================================================
        # RELACIONES: PERSONAS
        # ============================================================================
        admin -> cdn "Usa la aplicación" "HTTPS"
        member -> cdn "Usa la aplicación" "HTTPS"

        # ============================================================================
        # RELACIONES: CONTENEDORES (implementadas)
        # ============================================================================
        cdn -> spa "Sirve los ficheros estáticos" "S3 privado con OAC"
        cdn -> apiGateway "Reenvía /api/*" "HTTPS + X-Origin-Verify"
        dns -> cdn "Resuelve el dominio" "DNS"
        authorizedFetch -> cdn "Peticiones autenticadas" "fetch, JSON"
        services -> cdn "Peticiones públicas" "fetch, JSON"
        publicPages -> recaptcha "Carga el script y pide tokens" "HTTPS"

        # SPA: dependencias internas
        appRoutes -> authLayout "Rutas con sesión"
        appRoutes -> publicPages "Rutas públicas"
        authLayout -> roleGuard "Rutas de un rol"
        authLayout -> sessionProvider "Lee la sesión"
        authLayout -> onboardingPage "/onboarding"
        authLayout -> coursesPages "/cursos, /cursos/nuevo y /cursos/:id/editar"
        coursesPages -> services "Usa"
        authLayout -> professorsPages "/profesores y /profesores/nuevo"
        authLayout -> studentsPages "/alumnos y /alumnos/nuevo"
        professorsPages -> services "Usa"
        studentsPages -> services "Usa"
        roleGuard -> usersPage "/usuarios (ADMIN)"
        usersPage -> services "Usa"
        publicPages -> services "Usa"
        onboardingPage -> sessionProvider "Lee el rol y el colegio"
        services -> authorizedFetch "Peticiones autenticadas"
        authorizedFetch -> sessionProvider "Token y renovación"
        frontendSupport -> publicPages "Textos, validación y captcha"

        # API Gateway hacia el backend
        apiGateway -> authRouter "Invoca" "Lambda proxy, payload 2.0"
        apiGateway -> usersRouter "Invoca" "Lambda proxy, payload 2.0"
        apiGateway -> invitationsRouter "Invoca" "Lambda proxy, payload 2.0"
        apiGateway -> coursesRouter "Invoca" "Lambda proxy, payload 2.0"
        apiGateway -> professorsRouter "Invoca" "Lambda proxy, payload 2.0"
        apiGateway -> studentsRouter "Invoca" "Lambda proxy, payload 2.0"
        apiGateway -> publicRouters "Invoca" "Lambda proxy, payload 2.0"

        # Backend: dependencias internas
        entryPoints -> composeApp "Llama"
        composeApp -> httpCommon "Monta"
        composeApp -> prismaRepos "Crea"
        composeApp -> securityAdapters "Crea"
        composeApp -> captchaVerifier "Elige el real o el falso"
        composeApp -> configAndLogs "Lee la configuración"
        httpCommon -> guards "Antes de las rutas protegidas"
        guards -> sessionCases "AuthenticateRequest"
        authRouter -> sessionCases "Usa"
        usersRouter -> userCases "Usa"
        usersRouter -> linkCases "Restablecimientos de contraseña"
        invitationsRouter -> linkCases "Usa"
        coursesRouter -> courseCases "Usa"
        professorsRouter -> professorCases "Usa"
        studentsRouter -> studentCases "Usa"
        publicRouters -> linkCases "Usa"
        sessionCases -> attemptLimiter "Registro y login"
        linkCases -> attemptLimiter "Enlaces no válidos"
        sessionCases -> domainRules "Reglas y puertos"
        userCases -> domainRules "planUserChange"
        linkCases -> domainRules "accessLinkStatus"
        courseCases -> domainRules "cleanName, normalizeName, planCourseUpdate y CourseRepository"
        professorCases -> domainRules "ProfessorRepository, ClassNotFound y ClassAlreadyHasTutor"
        studentCases -> domainRules "StudentRepository, CourseNotFound y ClassNotFound"
        prismaRepos -> domainRules "Implementa los puertos de"
        securityAdapters -> domainRules "Implementa los puertos de"
        captchaVerifier -> domainRules "Implementa el puerto de"

        # Backend hacia la infraestructura
        prismaRepos -> database "Lee y escribe" "SQL (Prisma)"
        configAndLogs -> parameterStore "Lee la configuración y los secretos" "AWS SDK"
        captchaVerifier -> recaptcha "Verifica tokens" "HTTPS (siteverify)"

        # Base de datos: claves foráneas
        schoolsTable -> municipalitiesTable "FK municipality_code"
        usersTable -> schoolsTable "FK school_id"
        refreshTokensTable -> usersTable "FK user_id (cascade)"
        accessLinksTable -> schoolsTable "FK school_id"
        accessLinksTable -> usersTable "FK user_id y created_by_id"
        coursesTable -> schoolsTable "FK school_id"
        classesTable -> coursesTable "FK course_id (cascade)"
        classesTable -> professorsTable "FK tutor_id (set null, único)"
        studentsTable -> schoolsTable "FK school_id"
        studentsTable -> coursesTable "FK course_id (set null)"
        studentsTable -> classesTable "FK class_id (set null)"

        # CI/CD y copias
        github -> backups "Sube la copia diaria" "OIDC"
        github -> database "Migraciones y pg_dump" "Conexión en modo sesión"
        github -> cdn "Publica el frontend e invalida index.html" "OIDC"

        # ============================================================================
        # RELACIONES: OBJETIVO
        # ============================================================================
        calendarService -> restrictionService "Consulta restricciones"
        scheduleGeneratorService -> calendarService "Carga calendarios"
        scheduleGeneratorService -> restrictionService "Carga restricciones"
        scheduleGeneratorService -> cspSolver "Ejecuta CSP"
        scheduleGeneratorService -> backtrackSolver "Alternativa si el CSP agota el tiempo"
        scheduleGeneratorService -> conflictDetector "Detecta conflictos"
        cspSolver -> orTools "Resuelve el modelo"
        scheduleGeneratorService -> jobQueue "Encola la generación"
        jobQueue -> scheduleGeneratorService "Ejecuta el trabajo"
        scheduleGeneratorService -> cache "Lee y guarda datos calientes"
        scheduleGeneratorService -> exportStorage "Sube PDF y Excel"
        jobQueue -> emailService "Envía notificaciones"

        sessionsTable -> calendarsTable "FK calendarId"
        restrictionsTable -> subjectsTable "FK subjectId"
        schedulesTable -> calendarsTable "FK calendarId"
        scheduleEntriesTable -> schedulesTable "FK scheduleId"
        scheduleEntriesTable -> subjectsTable "FK subjectId"
        scheduleEntriesTable -> professorsTable "FK professorId"
        professorAvailabilityTable -> professorsTable "FK professorId"
        generationJobsTable -> calendarsTable "FK calendarId"
        conflictViews -> scheduleEntriesTable "SELECT FROM"

        # ============================================================================
        # DESPLIEGUE
        # ============================================================================
        deploymentEnvironment "Produccion" {
            deploymentNode "Navegador de la persona usuaria" "" "Chrome, Firefox, Edge o Safari" {
                containerInstance spa
            }
            deploymentNode "AWS" "" "Amazon Web Services" {
                deploymentNode "Global (borde)" "" "CloudFront" {
                    containerInstance cdn
                }
                deploymentNode "eu-central-1 (Fráncfort)" "" "AWS" {
                    deploymentNode "S3 del frontend" "Privado, acceso solo desde CloudFront (OAC)" "S3" {
                        infrastructureNode "Bucket del frontend" "Ficheros estáticos de Vite" "S3"
                    }
                    deploymentNode "API Gateway" "HTTP API, 10 req/s" "AWS" {
                        containerInstance apiGateway
                    }
                    deploymentNode "Lambda" "nodejs24.x, x86_64, 1024 MB, 15 s" "AWS Lambda" {
                        containerInstance backend
                    }
                    deploymentNode "SSM Parameter Store" "SecureString bajo /calendarschool/prod/" "AWS SSM" {
                        containerInstance parameterStore
                    }
                    deploymentNode "S3 de copias" "Retención de 30 días" "S3" {
                        containerInstance backups
                    }
                }
            }
            deploymentNode "Supabase (Fráncfort)" "Plan gratuito" "Supabase" {
                deploymentNode "PostgreSQL 17" "Pooler en modo transacción (:6543)" "PostgreSQL" {
                    containerInstance database
                }
            }
        }
    }

    views {
        # ====== IMPLEMENTADO ======
        systemContext calendarschool "contexto" {
            title "Contexto del sistema - CalendarSchool (implementado)"
            description "Sistema, actores y sistemas externos que usa hoy"
            include *
            exclude "element.tag==Objetivo"
            autolayout lr
        }

        container calendarschool "contenedores" {
            title "Contenedores - CalendarSchool (implementado)"
            description "CloudFront, SPA, API Gateway, backend en Lambda, PostgreSQL en Supabase, SSM y copias"
            include *
            exclude "element.tag==Objetivo"
            autolayout lr
        }

        component backend "componentes-backend" {
            title "Componentes - Backend API (implementado)"
            description "Routers, middleware, casos de uso, dominio y adaptadores"
            include *
            exclude "element.tag==Objetivo"
            autolayout tb
        }

        component spa "componentes-frontend" {
            title "Componentes - SPA React (implementado)"
            description "Rutas, guardas de sesión, páginas y servicios"
            include *
            exclude "element.tag==Objetivo"
            autolayout tb
        }

        component database "datos" {
            title "Componentes - PostgreSQL (implementado)"
            description "Las 6 tablas actuales y sus claves foráneas"
            include *
            exclude "element.tag==Objetivo"
            autolayout tb
        }

        deployment calendarschool "Produccion" "despliegue" {
            title "Despliegue en producción (implementado)"
            description "AWS (CloudFront, S3, API Gateway, Lambda, SSM) y Supabase"
            include *
            autolayout lr
        }

        # ====== OBJETIVO ======
        systemContext calendarschool "contexto-objetivo" {
            title "Contexto del sistema - CalendarSchool (objetivo)"
            description "Añade los sistemas de correo y de OR-Tools"
            include *
            autolayout lr
        }

        container calendarschool "contenedores-objetivo" {
            title "Contenedores - CalendarSchool (objetivo)"
            description "Añade la cola de trabajos, la caché y el almacenamiento de exportaciones"
            include *
            autolayout lr
        }

        component backend "componentes-backend-objetivo" {
            title "Componentes - Backend API (objetivo)"
            description "Añade los servicios de calendarios, restricciones y generación de horarios con sus algoritmos"
            include *
            autolayout tb
        }

        component database "datos-objetivo" {
            title "Componentes - PostgreSQL (objetivo)"
            description "Añade las tablas de calendarios, restricciones y horarios, y las vistas de conflictos"
            include *
            autolayout tb
        }

        # ====== ESTILOS ======
        styles {
            element "Person" {
                background #08427b
                color #ffffff
                fontSize 22
                shape Person
            }
            element "Software System" {
                background #1168bd
                color #ffffff
                fontSize 22
            }
            element "Container" {
                background #438dd5
                color #ffffff
                fontSize 14
            }
            element "Component" {
                background #85bff2
                color #000000
                fontSize 12
            }
            element "Infraestructura" {
                background #6c8ebf
                color #ffffff
            }
            element "Web Browser" {
                shape WebBrowser
            }
            element "Table" {
                background #a8d695
                color #000000
                fontSize 11
            }
            element "View" {
                background #ffa500
                color #000000
                fontSize 11
            }
            element "External System" {
                background #999999
                color #ffffff
                fontSize 14
            }
            element "Database" {
                shape Cylinder
            }
            element "Storage" {
                shape Folder
            }
            element "Message Queue" {
                shape Pipe
            }
            element "Objetivo" {
                background #d9d9d9
                color #333333
                border dashed
                opacity 75
            }
        }
    }

}
