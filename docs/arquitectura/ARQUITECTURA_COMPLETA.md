# Arquitectura Completa: CalendarSchool - Sistema de Generación de Horarios Escolares

**Versión:** 2.0  
**Fecha:** 2026-08-04  
**Estado:** ✅ Production-Ready  
**Clasificación:** Sistema de Optimización Complejos (Hard Constraints + CSP)

---

## 📑 Índice

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

| Capa | Tecnología | Versión | Justificación |
|------|------------|---------|---------------|
| **Backend** | Node.js + TypeScript + Express.js | LTS/5.x | Performance, async, type-safety |
| **Frontend** | React 18.3.1 + TypeScript + Bootstrap 5.3.3 | 18.3.1 | Component-driven, accessibility |
| **Database** | PostgreSQL + Prisma ORM | 15+/5.x | ACID compliance, JSON support |
| **Optimization Engine** | Google OR-Tools / Custom Backtrack | 9.7+ | CSP solver, determinístico |
| **Queue System** | BullMQ (Redis) | 5.x | Background jobs, retries |
| **Testing** | Jest + Supertest + Cypress | 29+/16+ | Unit + E2E, fixture manage |
| **Deployment** | AWS Lambda + Serverless Framework | Latest | Serverless, auto-scale, cost |
| **Monitoring** | CloudWatch + X-Ray | - | Distributed tracing, logging |

### 1.3 Restricciones Críticas (Hard Constraints)

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

### 2.1 Diagrama de Arquitectura en Capas

```
┌─────────────────────────────────────────────────────────────────┐
│                     CAPA DE PRESENTACIÓN                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ React 18 + TypeScript + Bootstrap 5.3                       │ │
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
│  │ PostgreSQL 15 (ACID, JSON, Full-text search)               │ │
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

### 2.2 Diagrama de Módulos

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

### 3.1 Flujo Completo: Configuración → Generación

```
┌─ FASE 1: CONFIGURACIÓN (US-BASE, US-SUBJECT, US19, US20) ─┐
│                                                             │
│ 1. Usuario (Jefe Estudios) accede a CalendarSchool       │
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

## 4. Patrones de Diseño

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

### 9.1 JWT + Refresh Token Revocation

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

### 9.2 Control de Acceso (RBAC)

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

const rolePermissions: Record<string, Permission[]> = {
  'jefe_estudios': [
    Permission.CREATE_CALENDAR,
    Permission.EDIT_CALENDAR,
    Permission.CREATE_RESTRICTION,
    Permission.GENERATE_SCHEDULE,
    Permission.VIEW_SCHEDULES
  ],
  'director': [
    Permission.VIEW_SCHEDULES,
    Permission.GENERATE_SCHEDULE
  ],
  'profesor': [
    Permission.VIEW_SCHEDULES
  ],
  'alumno': [
    Permission.VIEW_SCHEDULES  // Lectura solo
  ]
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

### 9.3 Input Validation & Sanitization

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

### 10.1 Pirámide de Testing

```
                     /\
                    /  \
                   / E2E \        (5 tests)
                  /────────\      Cypress
                 /          \     End-to-end workflows
                /            \
               /──────────────\
              /   Integration  \   (30 tests)
             /     Tests        \  Jest + Supertest
            /                    \ DB + Services
           /──────────────────────\
          /                        \
         /        Unit Tests        \  (150+ tests)
        /         (Jest)             \ Individual functions
       /                              \
      /────────────────────────────────\

DISTRIBUCIÓN:
- Unit: 70% (funciones puras, servicios, validaciones)
- Integration: 20% (DB queries, APIs, workflows)
- E2E: 10% (Rutas completas usuario final)
```

### 10.2 Test Coverage

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
    const { accessToken } = await login('jefe@school.edu', 'password');
    
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

### 11.1 AWS Architecture

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
                │  Serverless Framework    │
                │  (Infraestructura as Code)
                └──────────────────────────┘
```

### 11.2 Serverless Framework Configuration

```yaml
# serverless.yml
service: calendarschool-api

frameworkVersion: '4'

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  memorySize: 1024
  timeout: 900
  
  environment:
    DATABASE_URL: ${ssm:database-url~true}
    REDIS_URL: ${ssm:redis-url~true}
    JWT_SECRET: ${ssm:jwt-secret~true}
    OR_TOOLS_PATH: /opt/nodejs/or-tools
  
  iamRoleStatements:
    - Effect: Allow
      Action:
        - rds:DescribeDBInstances
        - elasticache:DescribeCacheClusters
      Resource: '*'
    - Effect: Allow
      Action:
        - s3:GetObject
        - s3:PutObject
      Resource: arn:aws:s3:::calendarschool-*/*
    - Effect: Allow
      Action:
        - logs:CreateLogGroup
        - logs:CreateLogStream
        - logs:PutLogEvents
      Resource: '*'

functions:
  api:
    handler: dist/handler.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true
      - http:
          path: /
          method: ANY
          cors: true
  
  scheduleWorker:
    handler: dist/workers/schedule.handler
    timeout: 120
    memorySize: 2048
    events:
      - sqs:
          arn: !GetAtt ScheduleQueue.Arn
          batchSize: 1

  cleanupJob:
    handler: dist/jobs/cleanup.handler
    events:
      - schedule: cron(0 2 ? * SUN *)  # Domingo 02:00 UTC

layers:
  ortools:
    path: layers/or-tools
    name: or-tools-layer
    description: Google OR-Tools library

plugins:
  - serverless-python-requirements
  - serverless-offline
  - serverless-plugin-tracing

resources:
  Resources:
    ScheduleQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: calendarschool-schedule-queue
        VisibilityTimeout: 300
        MessageRetentionPeriod: 86400
    
    ApiGatewayLog:
      Type: AWS::Logs::LogGroup
      Properties:
        LogGroupName: /aws/apigateway/calendarschool
        RetentionInDays: 30
```

### 11.3 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy CalendarSchool

on:
  push:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      
      - run: npm run lint
      
      - run: npm run test:unit
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
      
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm ci
      
      - run: npm run build
      
      - uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/download-artifact@v3
        with:
          name: dist
          path: dist/
      
      - uses: serverless/github-action@v3
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        with:
          args: deploy --stage prod

  smoke-test:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -f https://api.calendarschool.com/health || exit 1
      
      - run: |
          npm test -- --testPathPattern=smoke.test.ts
```

---

## Conclusión

CalendarSchool implementa una arquitectura **robusta, escalable y compleja** que maneja:

✅ **Restricciones NP-Hard** mediante CSP + Backtracking  
✅ **Detección automática de conflictos** con 7 vistas SQL  
✅ **Auditoría y GDPR** completa con soft deletes  
✅ **Seguridad enterprise** con JWT revocable + RBAC  
✅ **Rendimiento optimizado** con índices covering + caché  
✅ **Validaciones en tiempo real** (frontend + backend + BD)  
✅ **Testing comprehensivo** (unit + integration + E2E)  
✅ **Despliegue serverless** en AWS Lambda con CI/CD

**La arquitectura está lista para production.**
