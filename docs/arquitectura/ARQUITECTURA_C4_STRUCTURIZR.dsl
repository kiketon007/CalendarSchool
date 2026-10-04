workspace "CalendarSchool - Sistema de Generación de Horarios" "Arquitectura C4 completa del sistema CalendarSchool para colegios" {

    model {
        # ============================================================================
        # ACTORS / PERSONAS
        # ============================================================================
        jefeEstudios = person "Jefe de Estudios" "Configura calendarios, crea restricciones y genera horarios" "Actor"
        director = person "Director" "Supervisa y aprueba horarios generados" "Actor"
        profesor = person "Profesor" "Visualiza disponibilidad y horarios asignados" "Actor"
        alumno = person "Alumno" "Consulta horarios de clases" "Actor"

        # ============================================================================
        # SISTEMA PRINCIPAL
        # ============================================================================
        calendarschool = softwareSystem "CalendarSchool" "Sistema integral de generación de horarios escolares con algoritmos CSP y Backtracking" "Software System" {
            description "Automatiza creación, validación y asignación de calendarios académicos, restricciones de carga horaria, y generación de horarios optimizados para centros educativos."

            # ====== FRONTEND ======
            webApp = container "React Frontend" "React 19 + TypeScript + Bootstrap 5.3" "Web Browser" {
                description "Interfaz web responsive con componentes React interactivos para gestión de calendarios, restricciones, y visualización de horarios"
                technology "React 19, TypeScript, Bootstrap 5.3, Redux, Axios"
            }

            # ====== API GATEWAY ======
            apiGateway = container "API Gateway" "AWS API Gateway" "API Gateway" {
                description "Enrutador HTTP REST + WebSocket, CORS, rate limiting, validación de requestos"
                technology "AWS API Gateway, REST, WebSocket"
            }

            # ====== BACKEND API ======
            backend = container "Backend API" "Node.js + Express.js + TypeScript" "Web Service" {
                description "API Express.js que gestiona lógica de negocio, validaciones, algoritmos de generación de horarios"
                technology "Node.js 24.x, Express.js, TypeScript, OR-Tools, Custom Backtracking"

                # Controllers
                authController = component "AuthController" "Express Controller" "Maneja autenticación, login, logout, refresh tokens" "Component"
                calendarController = component "CalendarController" "Express Controller" "CRUD de calendarios, auto-generación de sesiones" "Component"
                subjectController = component "SubjectController" "Express Controller" "CRUD de asignaturas, asociación a cursos" "Component"
                restrictionController = component "RestrictionController" "Express Controller" "Creación de restricciones, validación de suma" "Component"
                scheduleController = component "ScheduleController" "Express Controller" "Generación de horarios, visualización, exportación" "Component"
                professorController = component "ProfessorController" "Express Controller" "CRUD profesores, disponibilidades" "Component"

                # Services
                authService = component "AuthService" "Service" "Gestión JWT, refresh tokens, logout, revocación de sesiones" "Component"
                calendarService = component "CalendarService" "Service" "Lógica de configuración de calendarios y sesiones" "Component"
                subjectService = component "SubjectService" "Service" "CRUD asignaturas con validación de unicidad y cascada" "Component"
                restrictionService = component "RestrictionService" "Service" "Validación de restricciones, cálculo de disponibilidad, detección de duplicados" "Component"
                scheduleGeneratorService = component "ScheduleGeneratorService" "Service" "Orquestación de generación: load data → algoritmo → persist → detect conflicts" "Component"
                professorService = component "ProfessorService" "Service" "Gestión profesores, disponibilidades, carga horaria" "Component"

                # Algoritmos
                cspSolver = component "CSPSolver" "Algorithm" "Google OR-Tools: Modela variables, restricciones HC1-HC6, resuelve CSP (timeout 60s)" "Component"
                backtrackSolver = component "BacktrackSolver" "Algorithm" "Custom backtracking recursivo con poda agresiva y forward checking (timeout 120s fallback)" "Component"
                conflictDetector = component "ConflictDetector" "Analyzer" "Detecta violaciones de hard constraints HC1-HC6 post-ejecución" "Component"
                hardConstraintValidator = component "HardConstraintValidator" "Validator" "Valida restricciones en tiempo real antes de guardar" "Component"

                # Middleware
                authMiddleware = component "AuthMiddleware" "Middleware" "Valida JWT access token, extrae userId, valida permisos RBAC" "Component"
                validationMiddleware = component "ValidationMiddleware" "Middleware" "Valida schemas con Zod, retorna errores descriptivos" "Component"
                errorHandler = component "ErrorHandler" "Middleware" "Manejo global de errores, logging, respuestas estandarizadas" "Component"
                loggingMiddleware = component "LoggingMiddleware" "Middleware" "Auditoría de acciones: createdBy, updatedBy, timestamps, IP address" "Component"
                rateLimiter = component "RateLimiter" "Middleware" "Throttling: 100 req/min por IP, protección brute-force" "Component"

                # Repositories
                calendarRepository = component "CalendarRepository" "Repository" "Data access: queries calendarios, sesiones, índices" "Component"
                restrictionRepository = component "RestrictionRepository" "Repository" "Data access: queries restricciones con filtros, búsqueda full-text" "Component"
                scheduleRepository = component "ScheduleRepository" "Repository" "Data access: queries horarios, entradas, jobs" "Component"
                professorRepository = component "ProfessorRepository" "Repository" "Data access: queries profesores, disponibilidades, cargas" "Component"
                userRepository = component "UserRepository" "Repository" "Data access: queries usuarios, roles, refresh tokens" "Component"

                # Relaciones internas
                authController -> authService "Llama"
                authController -> authMiddleware "Usa"
                authMiddleware -> authService "Valida"

                calendarController -> validationMiddleware "Valida input"
                calendarController -> calendarService "Llama"
                calendarService -> calendarRepository "Usa"
                calendarService -> loggingMiddleware "Audita"

                subjectController -> validationMiddleware "Valida input"
                subjectController -> subjectService "Llama"
                subjectService -> restrictionRepository "Verifica cascada"

                restrictionController -> validationMiddleware "Valida input"
                restrictionController -> restrictionService "Llama"
                restrictionService -> restrictionRepository "Usa"
                restrictionService -> hardConstraintValidator "Valida HC"

                scheduleController -> authMiddleware "Requiere permiso"
                scheduleController -> scheduleGeneratorService "Llama"
                scheduleGeneratorService -> calendarRepository "Carga datos"
                scheduleGeneratorService -> restrictionRepository "Carga restricciones"
                scheduleGeneratorService -> professorRepository "Carga profesores"
                scheduleGeneratorService -> cspSolver "Ejecuta CSP"
                scheduleGeneratorService -> backtrackSolver "Fallback si timeout"
                scheduleGeneratorService -> conflictDetector "Detecta conflictos"
                scheduleGeneratorService -> scheduleRepository "Persiste resultado"

                errorHandler -> loggingMiddleware "Audita errores"
                rateLimiter -> authMiddleware "Protege endpoints"
            }

            # ====== QUEUE SYSTEM ======
            jobQueue = container "Job Queue" "BullMQ + Redis" "Message Queue" {
                description "Procesamiento asincrónico de generación de horarios con reintentos automáticos, persistencia y monitoreo"
                technology "BullMQ 5.x, Redis, Node.js"

                scheduleGenerationJob = component "ScheduleGenerationJob" "Job Definition" "Especifica parámetros de generación: calendarId, algorithm, courses, userId" "Component"
                cleanupJob = component "CleanupJob" "Cron Job" "Limpia tokens expirados y schedules antiguos (cron daily 02:00 UTC)" "Component"
                notificationJob = component "NotificationJob" "Job Definition" "Envía emails de notificación de horarios generados" "Component"


                cleanupJob -> userRepository "Limpia tokens"
            }

            # ====== DATABASE ======
            database = container "PostgreSQL" "PostgreSQL 15 + Prisma ORM" "Database" {
                description "Base de datos ACID con 23 tablas, 7 vistas, 6 triggers, 15+ índices covering para performance crítico"
                technology "PostgreSQL 15, Prisma ORM 5.x, SQL"

                # Módulo Autenticación
                usersTable = component "users" "Table" "id, email, password (bcrypt), firstName, lastName, role, status, createdAt, updatedAt, deletedAt (soft delete)" "Table"
                rolesTable = component "roles" "Table" "id, name, permissions (JSON), description" "Table"
                userRolesTable = component "user_roles" "M:M Join" "userId, roleId, assignedAt (UNIQUE index)" "Table"
                settingsTable = component "settings" "Table" "key (PK), value, type, updatedAt" "Table"
                refreshTokensTable = component "refresh_tokens" "Table" "id, userId (FK), tokenHash (UNIQUE), isRevoked, expiresAt, userAgent, ipAddress, createdAt" "Table"

                # Módulo Calendarios
                calendarsTable = component "calendars" "Table" "id, name, description, status, startDate, endDate, createdBy, updatedBy, createdAt, updatedAt, deletedAt (soft delete)" "Table"
                sessionsTable = component "sessions" "Table" "id, calendarId (FK), sessionNumber (1-8), startTime, endTime, duration, isBreak, createdAt" "Table"

                # Módulo Asignaturas
                subjectsTable = component "subjects" "Table" "id, name (UNIQUE), type (CORE|ELECTIVE|CUSTOM), status, description, createdBy, updatedBy, createdAt, updatedAt, deletedAt" "Table"
                subjectCoursesTable = component "subject_courses" "M:M Join" "subjectId (FK), courseId (FK), assignedAt" "Table"

                # Módulo Restricciones
                restrictionsTable = component "restrictions" "Table" "id, type (HOURS_PER_WEEK|AVAILABILITY|NO_DUPLICATE), subjectId (FK), courseId (FK), params (JSON: {sessionsPerWeek, maxPerDay, ...}), status, createdBy, updatedBy, createdAt, updatedAt" "Table"
                restrictionAuditTrail = component "restriction_audit_trail" "Audit Table" "id, restrictionId (FK), changedAt, changedBy (FK users), action, beforeValue (JSON), afterValue (JSON)" "Table"

                # Módulo Horarios
                schedulesTable = component "schedules" "Table" "id, calendarId (FK), status (DRAFT|GENERATING|SOLVED|NEEDS_REVIEW|FAILED), algorithm (CSP|BACKTRACK), generatedBy (FK users), solvedAt, completedAt, metadata (JSON), createdAt, updatedAt" "Table"
                scheduleEntriesTable = component "schedule_entries" "Table" "id, scheduleId (FK), courseId (FK), dayOfWeek (MON-FRI), sessionNumber, subjectId (FK), professorId (FK), roomId (FK), status, createdBy, updatedBy, createdAt, updatedAt" "Table"
                generationJobsTable = component "schedule_generation_jobs" "Table" "id, calendarId (FK), status (QUEUED|PROCESSING|COMPLETED|FAILED|TIMEOUT), progress (0-100), result (JSON), error (TEXT), startedAt, completedAt, createdAt" "Table"

                # Módulo Profesores
                professorsTable = component "professors" "Table" "id, firstName, lastName, email (UNIQUE), maxLoad (sesiones máx), status, createdAt, updatedAt, deletedAt (soft delete)" "Table"
                professorAvailabilityTable = component "professor_availabilities" "Table" "id, professorId (FK), dayOfWeek (MON-FRI), sessionNumber (1-8), isAvailable (boolean)" "Table"

                # Vistas SQL
                professorScheduleView = component "professor_schedule" "View" "JOIN schedules → schedule_entries → professors | Horario completo por profesor | Query: SELECT prof, day, session, subject, room, course" "View"
                profOverlapView = component "schedule_conflicts_professor_overlap" "View" "HC2: Detecta profesor en 2 aulas mismo día/sesión | WHERE COUNT(*) > 1 GROUP BY prof, day, session" "View"
                availabilityConflictView = component "schedule_conflicts_availability" "View" "HC3: Asignaciones fuera de disponibilidad profesor" "View"
                noRoomView = component "schedule_conflicts_no_room" "View" "HC6: Asignaciones sin aula disponible" "View"
                professorLoadView = component "professor_load_summary" "View" "Carga horaria agregada por profesor: ∑(sesiones), disponibilidad %, estado" "View"
                professorAvailabilityView = component "professor_availability_summary" "View" "Resumen % disponibilidad por profesor" "View"

                # Índices
                idxProfessorSession = component "IX_schedule_professor_session" "Covering Index" "profesorId, dayOfWeek, sessionNumber INCLUDE (subjectId, roomId) | HC2 detection <20ms" "Index"
                idxCalendarStatus = component "IX_schedules_calendar_status" "Index" "calendarId, status, createdAt DESC | Búsquedas rápidas <50ms" "Index"
                idxRestrictionCourse = component "IX_restrictions_course" "Index" "courseId, status INCLUDE (type, params) | Filtrado restricciones <30ms" "Index"
                idxSubjectsNameCI = component "IX_subjects_name_ci" "Index" "LOWER(name) | Case-insensitive search (US11) <10ms" "Index"
                idxProfessorAvailability = component "IX_professor_availability" "Index" "profesorId, dayOfWeek, sessionNumber | Búsqueda disponibilidad <15ms" "Index"
                idxGenerationJobs = component "IX_generation_jobs_status" "Index" "calendarId, status, createdAt DESC | Polling jobs <20ms" "Index"

                # Triggers
                triggerSoftDeleteProf = component "TRG_soft_delete_professor" "Trigger" "BEFORE DELETE: Convierte DELETE en UPDATE deletedAt (soft delete GDPR)" "Trigger"
                triggerAuditRestriction = component "TRG_audit_restriction_changes" "Trigger" "AFTER UPDATE restrictions: INSERT restriction_audit_trail + mark schedules NEEDS_REVIEW" "Trigger"
                triggerDetectConflict = component "TRG_detect_single_location" "Trigger" "AFTER INSERT schedule_entries: HC2 validation, INSERT schedule_conflicts si violation" "Trigger"

                # Relaciones
                usersTable -> rolesTable "FK role"
                userRolesTable -> usersTable "FK userId"
                userRolesTable -> rolesTable "FK roleId"
                refreshTokensTable -> usersTable "FK userId"

                calendarsTable -> usersTable "FK createdBy, updatedBy"
                sessionsTable -> calendarsTable "FK calendarId"

                subjectsTable -> usersTable "FK createdBy, updatedBy"
                subjectCoursesTable -> subjectsTable "FK subjectId"

                restrictionsTable -> subjectsTable "FK subjectId"
                restrictionsTable -> usersTable "FK createdBy, updatedBy"
                restrictionAuditTrail -> restrictionsTable "FK restrictionId"

                schedulesTable -> calendarsTable "FK calendarId"
                schedulesTable -> usersTable "FK generatedBy"
                scheduleEntriesTable -> schedulesTable "FK scheduleId"
                scheduleEntriesTable -> subjectsTable "FK subjectId"
                scheduleEntriesTable -> professorsTable "FK professorId (SET NULL)"
                generationJobsTable -> calendarsTable "FK calendarId"

                professorsTable -> usersTable "FK userId (opcional)"
                professorAvailabilityTable -> professorsTable "FK professorId"

                # Vistas usan tablas
                professorScheduleView -> schedulesTable "SELECT FROM"
                professorScheduleView -> scheduleEntriesTable "SELECT FROM"
                profOverlapView -> scheduleEntriesTable "SELECT FROM, GROUP BY, HAVING COUNT > 1"
                availabilityConflictView -> scheduleEntriesTable "SELECT FROM"
                professorLoadView -> scheduleEntriesTable "SELECT FROM AGGREGATE"

                # Índices indexan tablas
                idxProfessorSession -> scheduleEntriesTable "Indexa"
                idxCalendarStatus -> schedulesTable "Indexa"
                idxRestrictionCourse -> restrictionsTable "Indexa"
                idxSubjectsNameCI -> subjectsTable "Indexa"
                idxProfessorAvailability -> professorAvailabilityTable "Indexa"
                idxGenerationJobs -> generationJobsTable "Indexa"

                # Triggers
                triggerSoftDeleteProf -> professorsTable "Activa en DELETE"
                triggerAuditRestriction -> restrictionsTable "Activa en UPDATE"
                triggerDetectConflict -> scheduleEntriesTable "Activa en INSERT"
            }

            # ====== CACHE ======
            cache = container "Redis Cache" "AWS ElastiCache Redis Cluster" "Cache" {
                description "Caché distribuida para restricciones, sesiones, datos calientes | TTL automático | Fallback a BD si miss"
                technology "Redis 7.x, ElastiCache, AWS"
            }

            # ====== STORAGE ======
            storage = container "AWS S3" "Object Storage" "File Storage" {
                description "Almacenamiento de PDFs y Excels exportados de horarios"
                technology "AWS S3, Object Storage"
            }

            # Relaciones entre contenedores
            webApp -> apiGateway "HTTP REST/WebSocket (HTTPS)"
            apiGateway -> backend "Enruta requests"
            backend -> database "SQL queries (Prisma ORM)"
            backend -> cache "Redis GET/SET (restricciones, sesiones)"
            backend -> jobQueue "Enqueue schedule generation"
            backend -> storage "Upload exported files"
            jobQueue -> backend "Dequeue + invoke worker"
            jobQueue -> database "Persist generation result"
        }

        # ============================================================================
        # SISTEMAS EXTERNOS
        # ============================================================================
        emailService = softwareSystem "Email Service" "SendGrid / AWS SES" "External System" {
            description "Envío de emails: notificaciones de horarios generados, cambios en restricciones, alerts"
        }

        orTools = softwareSystem "Google OR-Tools" "CSP Solver Library" "External System" {
            description "Librería externa para resolver problemas de satisfacción de restricciones (Constraint Satisfaction Problem)"
        }

        gitHub = softwareSystem "GitHub" "Source Control" "External System" {
            description "Control de versiones, CI/CD pipeline"
        }

        # ============================================================================
        # RELACIONES ACTORES → SISTEMA
        # ============================================================================
        jefeEstudios -> calendarschool "Crea calendarios, restricciones, genera horarios"
        director -> calendarschool "Supervisa y aprueba horarios"
        profesor -> calendarschool "Consulta disponibilidad y horarios"
        alumno -> calendarschool "Consulta horarios de clases"

        # ============================================================================
        # RELACIONES SISTEMA → EXTERNOS
        # ============================================================================
        calendarschool -> emailService "Envía notificaciones"
        calendarschool -> orTools "Resuelve CSP"
        calendarschool -> gitHub "Push código, CI/CD"
    }

    views {
        # ====== SYSTEM CONTEXT VIEW ======
        systemContext calendarschool {
            title "Contexto del Sistema - CalendarSchool"
            description "Diagrama de contexto mostrando el sistema, actores y sistemas externos"
            include "*"
            autolayout lr
        }

        # ====== CONTAINER VIEW ======
        container calendarschool {
            title "Contenedores - CalendarSchool"
            description "Descomposición del sistema en contenedores principales: Frontend, API Gateway, Backend, Queue, BD, Cache, Storage"
            include "*"
            autolayout lr
        }

        # ====== COMPONENT VIEW - BACKEND ======
        component backend {
            title "Componentes - Backend API"
            description "Descomposición interna del backend: Controllers, Services, Algorithms, Middleware, Repositories"
            include "*"
            autolayout tb
        }

        # ====== COMPONENT VIEW - DATABASE ======
        component database {
            title "Componentes - PostgreSQL"
            description "Estructura de base de datos: tablas, M:M joins, vistas, índices, triggers"
            include "*"
            autolayout tb
        }

        # ====== COMPONENT VIEW - QUEUE ======
        component jobQueue {
            title "Componentes - Job Queue"
            description "Sistema de colas asincrónico para generación de horarios"
            include "*"
            autolayout lr
        }



        # ====== STYLES ======
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
            element "Index" {
                background #ffcc99
                color #000000
                fontSize 10
            }
            element "Trigger" {
                background #ff6666
                color #ffffff
                fontSize 10
            }
            element "M:M Join" {
                background #9999cc
                color #ffffff
                fontSize 10
            }
            element "External System" {
                background #999999
                color #ffffff
                fontSize 14
            }
            element "Database" {
                shape Cylinder
            }
        }
    }

}
