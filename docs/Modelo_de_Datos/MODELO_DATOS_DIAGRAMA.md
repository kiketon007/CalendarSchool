# Diagrama Visual del Modelo de Datos - CalendarSchool

## 1. Diagrama ERD Completo (Mermaid)

```mermaid
erDiagram
    USERS ||--o{ USER_ROLES : has
    USER_ROLES ||--o{ ROLES : assigns
    
    USERS ||--o{ PROFESSORS : "is a"
    USERS ||--o{ STUDENTS : "is a"
    
    PROFESSORS ||--o{ PROFESSOR_SUBJECTS : teaches
    SUBJECTS ||--o{ PROFESSOR_SUBJECTS : "taught by"
    
    PROFESSORS ||--o{ PROFESSOR_AVAILABILITIES : has
    PROFESSORS ||--o{ PROFESSOR_ASSIGNMENTS : assigned
    
    SUBJECTS ||--o{ PROFESSOR_ASSIGNMENTS : assigned_to
    COURSES ||--o{ PROFESSOR_ASSIGNMENTS : for
    
    COURSES ||--o{ CLASSES : contains
    COURSES ||--o{ STUDENTS : enrolls
    COURSES ||--o{ RESTRICTIONS : defines
    
    CLASSES ||--o{ STUDENTS : has
    CLASSES ||--o{ PROFESSORS : "tutor of"
    
    SUBJECTS ||--o{ SUBJECT_COURSES : "applies to"
    COURSES ||--o{ SUBJECT_COURSES : "has"
    
    SUBJECTS ||--o{ SUBJECT_STANDARD_LOADS : "defines"
    COURSES ||--o{ SUBJECT_STANDARD_LOADS : "specifies"
    
    CALENDARS ||--o{ SESSIONS : generates
    CALENDARS ||--o{ SCHEDULES : "generates from"
    
    SUBJECTS ||--o{ RESTRICTION_DETAILS : "detailed in"
    RESTRICTIONS ||--o{ RESTRICTION_DETAILS : specifies
    
    SCHEDULES ||--o{ SCHEDULE_ENTRIES : contains
    SCHEDULE_ENTRIES ||--o{ PROFESSORS : "assigns"
    SCHEDULE_ENTRIES ||--o{ SUBJECTS : "teaches"
    SCHEDULE_ENTRIES ||--o{ CLASSES : "for"
    SCHEDULE_ENTRIES ||--o{ ROOMS : "uses"
    
    ROOMS : INT id
    ROOMS : VARCHAR name
    ROOMS : INT capacity
    ROOMS : VARCHAR type

    ROLES : INT id
    ROLES : VARCHAR name
    ROLES : JSON permissions

    USERS : INT id
    USERS : VARCHAR email
    USERS : VARCHAR password
    USERS : VARCHAR firstName
    USERS : VARCHAR lastName
    USERS : ENUM role
    USERS : ENUM status

    USER_ROLES : INT id
    USER_ROLES : INT userId
    USER_ROLES : INT roleId

    PROFESSORS : INT id
    PROFESSORS : VARCHAR email
    PROFESSORS : VARCHAR firstName
    PROFESSORS : VARCHAR lastName
    PROFESSORS : INT classId
    PROFESSORS : ENUM status

    PROFESSOR_SUBJECTS : INT id
    PROFESSOR_SUBJECTS : INT profesorId
    PROFESSOR_SUBJECTS : INT subjectId

    PROFESSOR_AVAILABILITIES : INT id
    PROFESSOR_AVAILABILITIES : INT profesorId
    PROFESSOR_AVAILABILITIES : INT dayOfWeek
    PROFESSOR_AVAILABILITIES : INT sessionNumber
    PROFESSOR_AVAILABILITIES : BOOLEAN isAvailable

    PROFESSOR_ASSIGNMENTS : INT id
    PROFESSOR_ASSIGNMENTS : INT profesorId
    PROFESSOR_ASSIGNMENTS : INT subjectId
    PROFESSOR_ASSIGNMENTS : INT courseId
    PROFESSOR_ASSIGNMENTS : INT sessionsPerWeek

    COURSES : INT id
    COURSES : VARCHAR name
    COURSES : VARCHAR level
    COURSES : INT academicYear
    COURSES : ENUM status

    CLASSES : INT id
    CLASSES : INT courseId
    CLASSES : VARCHAR name
    CLASSES : INT tutorId

    STUDENTS : INT id
    STUDENTS : VARCHAR email
    STUDENTS : VARCHAR firstName
    STUDENTS : VARCHAR lastName
    STUDENTS : INT courseId
    STUDENTS : INT classId
    STUDENTS : VARCHAR lunch_type
    STUDENTS : BOOLEAN scholarship

    SUBJECTS : INT id
    SUBJECTS : VARCHAR name
    SUBJECTS : ENUM type
    SUBJECTS : ENUM status

    SUBJECT_COURSES : INT id
    SUBJECT_COURSES : INT subjectId
    SUBJECT_COURSES : INT courseId

    SUBJECT_STANDARD_LOADS : INT id
    SUBJECT_STANDARD_LOADS : INT subjectId
    SUBJECT_STANDARD_LOADS : INT courseId
    SUBJECT_STANDARD_LOADS : INT sessionsPerWeek

    CALENDARS : INT id
    CALENDARS : VARCHAR name
    CALENDARS : TIME startTime
    CALENDARS : TIME endTime
    CALENDARS : INT sessionCount
    CALENDARS : INT sessionDuration
    CALENDARS : INT breakCount

    SESSIONS : INT id
    SESSIONS : INT calendarId
    SESSIONS : INT dayOfWeek
    SESSIONS : INT number
    SESSIONS : TIME startTime
    SESSIONS : TIME endTime
    SESSIONS : ENUM type

    RESTRICTIONS : INT id
    RESTRICTIONS : INT courseId
    RESTRICTIONS : INT classId
    RESTRICTIONS : ENUM type
    RESTRICTIONS : ENUM status

    RESTRICTION_DETAILS : INT id
    RESTRICTION_DETAILS : INT restrictionId
    RESTRICTION_DETAILS : INT subjectId
    RESTRICTION_DETAILS : INT sessionCount

    SCHEDULES : INT id
    SCHEDULES : INT calendarId
    SCHEDULES : ENUM algorithm
    SCHEDULES : ENUM status

    SCHEDULE_ENTRIES : INT id
    SCHEDULE_ENTRIES : INT scheduleId
    SCHEDULE_ENTRIES : INT classId
    SCHEDULE_ENTRIES : INT sessionNumber
    SCHEDULE_ENTRIES : INT dayOfWeek
    SCHEDULE_ENTRIES : INT subjectId
    SCHEDULE_ENTRIES : INT profesorId
    SCHEDULE_ENTRIES : INT roomId
    SCHEDULE_ENTRIES : ENUM status
```

---

## 2. Agrupación por Módulos

### Módulo 1: Autenticación
```
┌────────────────┐
│    USERS       │
├────────────────┤
│ id (PK)        │
│ email (UNQ)    │
│ password       │
│ firstName      │
│ lastName       │
│ role           │
│ status         │
└────────────────┘
        │
        ├─ (many-to-many) ─→ USER_ROLES ─→ ROLES
        │
        ├─ (type profesor) ─→ PROFESSORS
        │
        └─ (type alumno) ──→ STUDENTS
```

### Módulo 2: Gestión de Cursos y Clases
```
┌────────────────────────────────────────┐
│          COURSES (2026)                │
├────────────────────────────────────────┤
│ 1º Primaria    2º Primaria  ... 2º Bach│
└────────────────────────────────────────┘
        │
        ├─ CLASSES (1º A, 1º B, ...)
        │     │
        │     └─ TUTOR: PROFESSORS
        │
        ├─ STUDENTS (500+ alumnos)
        │
        └─ RESTRICTIONS (carga horaria)
```

### Módulo 3: Profesores
```
PROFESSORS
    │
    ├─ (M:M) ─→ PROFESSOR_SUBJECTS ─→ SUBJECTS
    │
    ├─ PROFESSOR_AVAILABILITIES
    │     (Grid: Lun-Vie × Sesiones 1-8)
    │
    └─ PROFESSOR_ASSIGNMENTS
          (Asignación a cursos específicos)
```

### Módulo 4: Asignaturas
```
SUBJECTS (Inglés, Mate, EF, ...)
    │
    ├─ (M:M) ─→ SUBJECT_COURSES ─→ COURSES
    │                               (Qué cursos)
    │
    └─ SUBJECT_STANDARD_LOADS ─→ COURSES
          (Sesiones/semana estándar)
          Ej: Inglés en 1º: 3 sesiones
```

### Módulo 5: Configuración Horarios
```
CALENDARS (Estructura: sesiones, recreos, horas)
    │
    ├─ SESSIONS (Lun-Vie × Ses 1-8)
    │     Ej: Lunes Ses1 09:00-09:45
    │
    └─ RESTRICTIONS (Carga horaria)
          │
          └─ RESTRICTION_DETAILS
                (Inglés 3 sesiones, Mate 5, ...)
```

### Módulo 6: Horarios Generados
```
SCHEDULES (resultado de US-ALGO)
    │
    └─ SCHEDULE_ENTRIES (250-500 filas)
          [cada sesión × clase]
          Ej: Lunes Ses1 1ºA → Inglés (Smith, Aula A)
          
          CRÍTICO: SINGLE_LOCATION
          UNIQUE (profesorId, dayOfWeek, sessionNumber)
```

---

## 3. Flujos de Datos Principales

### Flujo 1: Crear Profesor
```
1. US09: POST /api/professors
   {name, asignaturas[]}
   ↓
2. CREATE professors (id, firstName, lastName)
   ↓
3. INSERT professor_subjects (profesorId, subjectId) × N
```

### Flujo 2: Configurar Disponibilidad Profesor
```
1. US-PROF-AVAIL: Grid (Lun-Vie × Ses 1-8)
   ↓
2. INSERT professor_availabilities (profesorId, dayOfWeek, sessionNumber, isAvailable)
   → 40 filas por profesor (5 días × 8 sesiones)
```

### Flujo 3: Definir Restricciones de Carga
```
1. US19: Seleccionar curso (1º A)
   ↓
2. CREATE restrictions (courseId, classId, type='HOURS_PER_WEEK')
   ↓
3. INSERT restriction_details:
   - Inglés: 3 sesiones
   - Mate: 5 sesiones
   - EF: 2 sesiones
   ...
```

### Flujo 4: Generar Horarios (US-ALGO)
```
1. POST /api/schedule/generate {algorithm: 'CSP'}
   ↓
2. BullMQ Job: ScheduleGenerationJob
   ├─ Obtener calendarios, restricciones, profesores, disponibilidades
   ├─ Ejecutar CSP o Backtrack
   ├─ Validar HC1-6
   └─ Guardar en BD (transacción atómica)
   ↓
3. CREATE schedules (calendarId, algorithm, status)
   ↓
4. INSERT schedule_entries × 250-500:
   - Lun Ses1 1ºA → Inglés (Smith, A) → status='active'
   - Lun Ses1 1ºB → Mate (García, B) → status='active'
   - ...
   
   VALIDAR: UNIQUE (profesorId, dayOfWeek, sessionNumber)
   → Prof. Smith NO puede estar en 2 aulas Lun Ses1
```

---

## 4. Índices Clave para Performance

```
BÚSQUEDA USUARIO
├─ users.email (UNIQUE)
├─ users.firstName, users.lastName (FULLTEXT)
└─ users.role, users.status

BÚSQUEDA PROFESOR
├─ professors.firstName, professors.lastName (FULLTEXT)
├─ professor_subjects.profesorId
├─ professor_availabilities.profesorId, dayOfWeek, sessionNumber (UNIQUE)
└─ professor_assignments.profesorId, subjectId, courseId (UNIQUE)

BÚSQUEDA HORARIOS
├─ schedule_entries.scheduleId, classId (UNIQUE)
├─ schedule_entries.profesorId, dayOfWeek, sessionNumber (UNIQUE) ← HC2 CRITICAL
├─ schedule_entries.classId, dayOfWeek
└─ schedule_entries.profesorId, dayOfWeek

BÚSQUEDA RESTRICCIONES
├─ restrictions.courseId, classId
├─ restriction_details.subjectId, restrictionId
└─ subject_standard_loads.subjectId, courseId (UNIQUE)
```

---

## 5. Ejemplo de Datos: Colegio Mediano

### Volumen de Datos
```
users:          150 filas
  ├─ jefe_estudios:  2
  ├─ director:       1
  ├─ profesor:      25
  └─ alumno:       120

courses:         10 filas (1º-6º Primaria, 1º-4º ESO, 1º-2º Bach)
classes:         40 filas (3-5 clases por curso)

professors:      25 filas
professor_subjects:     40 filas (1-2 asignaturas por profesor)
professor_availabilities: 1000 filas (25 × 40 slots por profesor)

subjects:        25 filas (Inglés, Mate, EF, etc.)
subject_courses: 50 filas (asignatura × curso)
subject_standard_loads: 50 filas (cargas estándar)

students:       600 filas (15 alumnos × 40 clases)

calendars:        3 filas (calendario por año)
sessions:        50 filas (25 × 2 para semana/recreo)

restrictions:    40 filas (4 por curso aprox)
restriction_details: 200 filas (5 asignaturas × 40 restricciones)

schedules:        5 filas (5 horarios generados/año)
schedule_entries: 1000 filas (25 franjas × 40 clases)
  
TOTAL: ~3500 filas (base de datos pequeña, muy eficiente)
```

---

## 6. Consultas de Ejemplo

### Obtener horario de un profesor
```sql
SELECT 
  sess.dayOfWeek,
  sess.startTime,
  sess.endTime,
  subj.name,
  c.name,
  r.name
FROM schedule_entries se
JOIN sessions sess ON se.dayOfWeek = sess.dayOfWeek
JOIN subjects subj ON se.subjectId = subj.id
JOIN classes c ON se.classId = c.id
LEFT JOIN rooms r ON se.roomId = r.id
WHERE se.profesorId = 5  -- Prof. Smith
ORDER BY sess.dayOfWeek, sess.number;
```

### Verificar SINGLE_LOCATION (HC2)
```sql
-- Mostrar conflictos: profesor en 2 aulas sesión
SELECT 
  profesorId,
  dayOfWeek,
  sessionNumber,
  COUNT(*) as conflict_count
FROM schedule_entries
GROUP BY profesorId, dayOfWeek, sessionNumber
HAVING COUNT(*) > 1;
-- Resultado esperado: 0 filas (no hay conflictos)
```

### Ver carga de profesor
```sql
SELECT 
  p.id,
  CONCAT(p.firstName, ' ', p.lastName) as name,
  STRING_AGG(DISTINCT s.name, ', ') as subjects,
  COUNT(se.id) as total_sessions,
  SUM(CASE WHEN pa.isAvailable THEN 1 ELSE 0 END) as available_slots
FROM professors p
LEFT JOIN professor_subjects ps ON p.id = ps.profesorId
LEFT JOIN subjects s ON ps.subjectId = s.id
LEFT JOIN schedule_entries se ON p.id = se.profesorId
LEFT JOIN professor_availabilities pa ON p.id = pa.profesorId
GROUP BY p.id
ORDER BY total_sessions DESC;
```

---

## 7. Resumen: 22 Tablas Organizadas

| # | Tabla | Módulo | Propósito |
|----|-------|--------|-----------|
| 1 | users | Auth | Usuarios (jefes, directores, profesores, alumnos) |
| 2 | user_roles | Auth | Relación usuario-rol (M:M) |
| 3 | roles | Auth | Roles del sistema (jefe_estudios, director, profesor, alumno) |
| 4 | settings | Auth | Configuración global |
| 5 | courses | Cursos | Cursos educativos (1º Primaria, 2º ESO, etc.) |
| 6 | classes | Cursos | Clases dentro de cursos (1º A, 1º B) |
| 7 | rooms | Cursos | Aulas |
| 8 | professors | Profesores | Datos de profesores |
| 9 | professor_subjects | Profesores | Relación profesor-asignatura (M:M) |
| 10 | professor_availabilities | Profesores | Grid de disponibilidad (Lun-Vie × Ses) |
| 11 | professor_assignments | Profesores | Asignación a cursos específicos |
| 12 | students | Alumnos | Datos de alumnos |
| 13 | subjects | Horarios | Asignaturas |
| 14 | subject_courses | Horarios | Relación asignatura-curso (M:M) |
| 15 | subject_standard_loads | Horarios | Cargas estándar (sesiones/semana) |
| 16 | calendars | Horarios | Calendarios base (sesiones, recreos) |
| 17 | sessions | Horarios | Sesiones generadas |
| 18 | restrictions | Restricciones | Restricciones de carga horaria |
| 19 | restriction_details | Restricciones | Detalles de restricciones |
| 20 | schedules | Horarios | Horarios generados |
| 21 | schedule_entries | Horarios | Entradas de horario (CRITICAL: HC2) |
| 22 | schedule_generation_jobs | Horarios | Tracking BullMQ jobs |

---

## 8. Constraints Críticos

```
┌─────────────────────────────────────────────────────┐
│          CONSTRAINTS DE NEGOCIO                    │
├─────────────────────────────────────────────────────┤

HC1: CARGA HORARIA EXACTA
  ├─ Cada asignatura exactamente N sesiones/semana
  └─ Validación: COUNT(subject X en clase) = N

HC2: UBICACIÓN SIMULTÁNEA (SINGLE_LOCATION) ⚡ CRITICAL
  ├─ Profesor NO puede estar en 2 aulas sesión
  ├─ BD: UNIQUE (profesorId, dayOfWeek, sessionNumber)
  └─ Cascada: especialista libera tutor

HC3: DUPLICIDAD DIARIA
  ├─ MAX 1 sesión de asignatura por día/grupo
  └─ Validación: COUNT(...AND day) ≤ 1

HC4: DISPONIBILIDAD PROFESOR
  ├─ Profesor solo en sesiones disponibles
  └─ Validación: professor_availabilities.isAvailable = TRUE

HC5: AULA DISPONIBLE
  ├─ Sin doble-booking de aulas
  └─ Validación: 1 clase por aula por sesión

HC6: PROFESOR PUEDE ENSEÑAR
  ├─ Solo asignaturas asignadas
  └─ Validación: subject ∈ professor_subjects[prof]

TUTORÍA
  ├─ Un tutor por clase máximo
  └─ BD: UNIQUE (classId) WHERE tutorId IS NOT NULL

PROFESOR TUTOR
  ├─ Un profesor máximo tutor de 1 clase
  └─ BD: UNIQUE (tutorId) WHERE tutorId IS NOT NULL
```

---

## 9. Flujo Generación Horarios (Detallado)

```
US-ALGO: POST /api/schedule/generate {algorithm: 'CSP'}
│
├─ 1. VALIDAR PREREQUISITOS
│     ├─ ✓ Calendario base existe (calendars)
│     ├─ ✓ Asignaturas existen (subjects, subject_courses)
│     ├─ ✓ Restricciones definidas (restrictions, restriction_details)
│     ├─ ✓ Disponibilidades configuradas (professor_availabilities)
│     └─ ✓ Asignaciones profesor-asignatura (professor_assignments)
│
├─ 2. OBTENER DATOS
│     ├─ Calendarios → estructura (sesiones, recreos)
│     ├─ Restricciones → cargas horarias
│     ├─ Profesores → disponibilidades
│     └─ Clases → alumnas que necesitan horario
│
├─ 3. EJECUTAR ALGORITMO (CSP o Backtrack)
│     ├─ CSP:
│     │  ├─ Variables: (sesión, clase) → asignatura
│     │  ├─ Dominio: asignaturas válidas
│     │  ├─ Constraints: HC1-6
│     │  ├─ Solver: AC-3 + Backtracking
│     │  └─ Timeout: 60 segundos
│     │
│     └─ Backtrack:
│        ├─ Recursión simple
│        ├─ Poda HC1-6 en cada paso
│        └─ Timeout: 120 segundos
│
├─ 4. VALIDAR HARD CONSTRAINTS
│     ├─ ✓ HC1: Carga horaria exacta
│     ├─ ✓ HC2: SINGLE_LOCATION (profesor no en 2 aulas)
│     ├─ ✓ HC3: Duplicidad diaria
│     ├─ ✓ HC4: Disponibilidad profesor
│     ├─ ✓ HC5: Aula disponible
│     └─ ✓ HC6: Profesor puede enseñar
│
├─ 5. GUARDAR EN BD (TRANSACCIÓN ATÓMICA)
│     BEGIN
│       ├─ CREATE schedules (id, calendarId, algorithm)
│       ├─ INSERT schedule_entries × 250-500
│       │  ├─ Validar UNIQUE (profesorId, dayOfWeek, sessionNumber) → HC2
│       │  ├─ Validar UNIQUE (scheduleId, classId, sessionNumber)
│       │  └─ Marcar status='active' o 'support' si especialista
│       └─ COMMIT (o ROLLBACK si error)
│
└─ 6. RETORNAR RESULTADO
      ├─ Si exitoso: {status: 'COMPLETED', scheduleId: 123}
      ├─ Si INFEASIBLE: {status: 'FAILED', error: '...'}
      ├─ Si TIMEOUT: {status: 'FAILED', error: '...'}
      └─ Si ERROR: {status: 'FAILED', error: '...'}
```

---

**Modelo de Datos Completo y Listo para Implementación** ✅

