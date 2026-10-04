# CalendarSchool: Diccionario de Datos Completo (v2.1 Refinada)

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

1. [Módulo 1: Autenticación](#módulo-1-autenticación-y-usuarios)
   - roles, users, user_roles, settings
   - **refresh_tokens** (NEW v2.1) — Control JWT
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

## Módulo 1: Autenticación y Usuarios

### 📊 roles

**Descripción:** Roles del sistema con permisos asociados.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `name` | VARCHAR(50) | UNIQUE, NOT NULL | Nombre del rol (ej: "jefe_estudios") |
| `description` | TEXT | NULL | Descripción del rol |
| `permissions` | JSON | NOT NULL | Permisos en formato JSON |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp de creación |

**Índices:**
- PK: `id`
- UNIQUE: `name`

**Ejemplo:**
```json
{
  "id": 1,
  "name": "jefe_estudios",
  "permissions": {
    "crear_profesor": true,
    "generar_horarios": true,
    "ver_reportes": true
  }
}
```

---

### 📊 users

**Descripción:** Usuarios del sistema con rol y estado.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Email único |
| `password` | VARCHAR(255) | NOT NULL | Hash contraseña |
| `firstName` | VARCHAR(100) | NOT NULL, CHECK len > 0 | Nombre |
| `lastName` | VARCHAR(100) | NOT NULL, CHECK len > 0 | Apellido |
| `verified` | BOOLEAN | DEFAULT FALSE | Email verificado |
| `role` | ENUM | NOT NULL | 'jefe_estudios', 'director', 'profesor', 'alumno' |
| `status` | ENUM | DEFAULT 'ACTIVE' | 'ACTIVE', 'INACTIVE', 'SUSPENDED' |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Timestamp de creación |
| `updatedAt` | TIMESTAMP | DEFAULT NOW() ON UPDATE | Timestamp actualización |

**Índices:**
- PK: `id`
- UNIQUE: `email`
- IX: `role`, `status`, `firstName`, `lastName`
- FT: Full-text search en (firstName, lastName)

---

### 📊 user_roles

**Descripción:** Relación M:M entre usuarios y roles.

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `userId` | INT | NOT NULL, FK → users.id | Usuario |
| `roleId` | INT | NOT NULL, FK → roles.id | Rol asignado |
| `assignedAt` | TIMESTAMP | DEFAULT NOW() | Timestamp asignación |

**Índices:**
- PK: `id`
- UNIQUE: (userId, roleId)
- IX: `roleId`

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

**Descripción:** Tokens de refresco persistentes con control de revocación (para logout seguro, cambio contraseña, etc).

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `userId` | INT | NOT NULL, FK → users.id | Usuario propietario del token |
| `tokenHash` | VARCHAR(255) | NOT NULL, UNIQUE | Hash del refresh token (no guardar token crudo) |
| `isRevoked` | BOOLEAN | DEFAULT FALSE | Marca revocación (logout, cambio password) |
| `expiresAt` | TIMESTAMP | NOT NULL | Cuándo expira token (ej: +7 días) |
| `userAgent` | TEXT | NULL | User-Agent del cliente (auditoría) |
| `ipAddress` | VARCHAR(45) | NULL | IP del cliente (auditoría) |
| `createdAt` | TIMESTAMP | DEFAULT NOW() | Cuándo se creó el token |

**Índices:**
- PK: `id`
- UNIQUE: `tokenHash`
- IX: `userId` (búsquedas por usuario)
- IX: `expiresAt` (limpieza automática tokens expirados)
- IX: `isRevoked` (búsquedas de tokens revocados)
- IX: `tokenHash` (validación rápida)

**Casos de Uso (US01/US02/US03):**

1. **Logout seguro (US03 CA9):**
   ```sql
   UPDATE refresh_tokens SET isRevoked = TRUE 
   WHERE tokenHash = HASH(usuario_token) AND userId = 123;
   ```

2. **Validación en refresh:**
   ```sql
   SELECT * FROM refresh_tokens 
   WHERE tokenHash = HASH(token_enviado) 
     AND isRevoked = FALSE 
     AND expiresAt > NOW();
   -- Si no retorna nada → token inválido/revocado
   ```

3. **Logout forzado por admin (US01/US02):**
   ```sql
   UPDATE refresh_tokens SET isRevoked = TRUE 
   WHERE userId = 456;  -- Todos los tokens de usuario 456
   ```

4. **Revocación por cambio contraseña (US01):**
   ```sql
   UPDATE refresh_tokens SET isRevoked = TRUE 
   WHERE userId = 789;  -- Force login nuevamente
   ```

5. **Limpieza automática (cron job):**
   ```sql
   DELETE FROM refresh_tokens 
   WHERE expiresAt < NOW() AND isRevoked = TRUE;
   ```

**Flujo de Autenticación:**
1. Login (POST /auth/login) → Genera access_token + refresh_token
2. Guardar hash en `refresh_tokens` con `isRevoked=FALSE`
3. Refresh (POST /auth/refresh + refresh_token) → Valida en BD
4. Logout (POST /auth/logout) → Marca `isRevoked=TRUE`
5. Cambio contraseña (PUT /users/password) → Revoca todos tokens usuario

---

## Módulo 2: Gestión de Cursos y Clases

### 📊 courses

**Descripción:** Cursos (niveles académicos) en la institución.

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

| Campo | Tipo | Restricciones | Descripción |
|-------|------|---|---|
| `id` | INT | PK, AI | Identificador único |
| `email` | VARCHAR(255) | NULL | Email profesor |
| `firstName` | VARCHAR(100) | NOT NULL | Nombre |
| `lastName` | VARCHAR(100) | NOT NULL | Apellido |
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

### 📊 subject_standard_loads

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
INSERT INTO subjects (name, code, type, createdBy, updatedBy)
VALUES ('Matemáticas', 'MAT', 'CORE', 1, 1);

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



