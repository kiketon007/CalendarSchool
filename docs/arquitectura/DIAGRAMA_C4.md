# Diagrama C4 - CalendarSchool Architecture

## Nivel 1: Contexto del Sistema

```mermaid
C4Context
    title Diagrama de Contexto C4 - CalendarSchool

    Person(jefe_estudios, "Jefe de Estudios", "Configura calendarios, restricciones y genera horarios")
    Person(director, "Director", "Supervisa y valida horarios generados")
    Person(profesor, "Profesor", "Visualiza disponibilidad y horarios")
    Person(alumno, "Alumno", "Consulta horarios de clases")

    System(calendarschool, "CalendarSchool", "Sistema integral de generación de horarios escolares con CSP/Backtracking")

    System_Ext(email_service, "Email Service", "SendGrid/SES - Notificaciones por email")
    System_Ext(storage_service, "AWS S3", "Almacenamiento de PDFs y Excels exportados")
    System_Ext(auth_provider, "JWT Auth", "Autenticación y control de sesiones")

    Rel(jefe_estudios, calendarschool, "Crea calendarios, restricciones, genera horarios")
    Rel(director, calendarschool, "Visualiza y aprueba horarios")
    Rel(profesor, calendarschool, "Consulta disponibilidad y horarios")
    Rel(alumno, calendarschool, "Consulta horarios de clases")

    Rel(calendarschool, email_service, "Envía notificaciones")
    Rel(calendarschool, storage_service, "Guarda exportaciones (PDF/Excel)")
    Rel(calendarschool, auth_provider, "Valida tokens JWT")
```

---

## Nivel 2: Contenedores

```mermaid
C4Container
    title Diagrama de Contenedores - CalendarSchool

    Person(usuario, "Usuario Final", "Jefe Estudios / Director / Profesor / Alumno")

    Container(web_app, "React Frontend", "React 18.3.1 + TypeScript + Bootstrap", "Interfaz web responsive, componentes interactivos")
    Container(api_gateway, "API Gateway", "AWS API Gateway", "Enrutador HTTP, CORS, rate limiting")
    Container(backend, "Backend API", "Node.js + Express.js + TypeScript", "Controllers, Services, Business Logic, CSP/Backtrack Solvers")
    Container(queue, "Job Queue", "BullMQ + Redis", "Procesamiento asincrónico de generación de horarios")
    Container(database, "PostgreSQL", "PostgreSQL 15 + Prisma ORM", "23 tablas, 7 vistas, triggers, índices covering")
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

## Nivel 3: Componentes (Backend)

```mermaid
C4Component
    title Diagrama de Componentes - Backend API

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

## Nivel 3: Base de Datos

```mermaid
C4Component
    title Diagrama de Componentes - PostgreSQL

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

## Nivel 3: Flujo de Algoritmo CSP

```mermaid
C4Component
    title Diagrama de Componentes - Algoritmo CSP

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
| **Contenedor (C4)** | Sistema independiente (frontend, backend, BD) |
| **Componente** | Unidad de código dentro de contenedor |
| **Flujo** | Comunicación entre elementos |
| **M:M** | Relación Many-to-Many |
| **FK** | Foreign Key (Relación BD) |
| **Índice Covering** | Índice que incluye todas columnas (sin acceso tabla) |
| **Vista** | Consulta guardada en BD para reportes |

---

## Notas Arquitectónicas

### Decisiones Clave

1. **Separación de Capas**: Frontend (React) ↔ API Gateway ↔ Backend (Lambda) ↔ PostgreSQL
   - Ventaja: Independencia, escalabilidad, reutilización

2. **Algoritmo CSP + Backtrack**:
   - CSP (Google OR-Tools): Búsqueda rápida, solución óptima
   - Backtrack: Fallback determinístico si timeout CSP

3. **Job Queue (BullMQ + Redis)**:
   - Generación asincrónica (no bloquea API)
   - Reintentos automáticos, persistencia

4. **Índices Covering**:
   - HC2 (SINGLE_LOCATION): `(profesorId, dayOfWeek, sessionNumber)` → <20ms
   - Calendar search: `(calendarId, status, createdAt DESC)` → <50ms

5. **Soft Delete**:
   - Profesores, materias, calendarios marcados con `deletedAt`
   - GDPR compliance, auditoría no destructiva

### Flujos Principales

**Crear Calendario** → POST /calendars → CalendarService → INSERT calendars + sessions (trigger) → audit_logs

**Generar Horario** → POST /schedules/generate → BullMQ.enqueue → Lambda Worker → CSP Solver (60s) → Persist + Conflict Detection → UPDATE schedules

**Buscar Restricciones** → GET /restrictions → RestrictionRepository → Caché Redis → <100ms

---