-- ============================================================================
-- CalendarSchool: DDL (Data Definition Language) - Versión Refinada con Mejoras
-- ============================================================================
-- Versión: 2.1 (Refinada con 10 mejoras aplicadas + control JWT)
-- Fecha: 2026-08-03
-- Database: flowschool
-- Charset: utf8mb4
-- Collation: utf8mb4_unicode_ci
--
-- MEJORAS APLICADAS:
-- #1: Agregar calendarId FK a restrictions (CRÍTICA)
-- #2: Soft delete profesor + cascadas consistentes (CRÍTICA)
-- #4: Corregir BUG en vista professor_schedule (CRÍTICA)
-- #5: Auditoría createdBy/updatedBy (ALTA)
-- #6: Status enum mejorado en schedule_entries (ALTA)
-- #7: Agregar updatedAt en subjects, sessions, rooms (ALTA)
-- #8: Tutor NOT NULL + validar unicidad (ALTA)
-- #9: Vistas de detección de conflictos (ALTA)
-- #10: Eliminar campo redundante totalSessions (MEDIA)
-- #12: Agregar deletedAt para soft delete (MEDIA)
--
-- ADICIONES (2026-08-03):
-- + Tabla refresh_tokens para control JWT (US01, US02, US03)
--   - Logout seguro con revocación persistente
--   - Auditoría de sesiones (userAgent, ipAddress)
--   - Soporte para logout forzado por admin
--   - Revocación automática en cambio de contraseña
-- ============================================================================

CREATE DATABASE IF NOT EXISTS flowschool
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE flowschool;

-- ============================================================================
-- MÓDULO 1: AUTENTICACIÓN Y USUARIOS
-- ============================================================================

CREATE TABLE roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions JSON NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  role ENUM('jefe_estudios', 'director', 'profesor', 'alumno') NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT chk_firstName CHECK (LENGTH(firstName) > 0 AND LENGTH(firstName) <= 100),
  CONSTRAINT chk_lastName CHECK (LENGTH(lastName) > 0 AND LENGTH(lastName) <= 100),

  UNIQUE INDEX idx_email (email),
  INDEX idx_role (role),
  INDEX idx_status (status),
  INDEX idx_firstName (firstName),
  INDEX idx_lastName (lastName),
  FULLTEXT INDEX idx_user_search (firstName, lastName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_roles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  roleId INT NOT NULL,
  assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (roleId) REFERENCES roles(id) ON DELETE CASCADE,

  UNIQUE INDEX idx_user_role (userId, roleId),
  INDEX idx_roleId (roleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  type VARCHAR(50),
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE refresh_tokens (
  id INT PRIMARY KEY AUTO_INCREMENT,
  userId INT NOT NULL,
  tokenHash VARCHAR(255) NOT NULL UNIQUE,
  isRevoked BOOLEAN NOT NULL DEFAULT FALSE,
  expiresAt TIMESTAMP NOT NULL,
  userAgent TEXT,
  ipAddress VARCHAR(45),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_refresh_tokens_user (userId),
  INDEX idx_refresh_tokens_expires (expiresAt),
  INDEX idx_refresh_tokens_revoked (isRevoked),
  INDEX idx_refresh_tokens_token_hash (tokenHash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MÓDULO 2: GESTIÓN DE CURSOS Y CLASES
-- ============================================================================

CREATE TABLE courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  level VARCHAR(50) NOT NULL,
  academicYear INT NOT NULL,
  status ENUM('ACTIVE', 'ARCHIVED') DEFAULT 'ACTIVE',
  -- MEJORA #5: Auditoría
  createdBy INT,
  updatedBy INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updatedBy) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE INDEX idx_course_code (code, academicYear),
  INDEX idx_level (level),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rooms (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) UNIQUE NOT NULL,
  capacity INT DEFAULT 30,
  type VARCHAR(50),
  floor INT,
  status ENUM('ACTIVE', 'MAINTENANCE') DEFAULT 'ACTIVE',
  -- MEJORA #7: Agregar updatedAt
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_type (type),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE classes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  courseId INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  -- MEJORA #8: tutorId NOT NULL
  tutorId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,

  UNIQUE INDEX idx_class_unique (courseId, name),
  INDEX idx_courseId (courseId),
  -- MEJORA #8: Índice para validar unicidad tutor
  INDEX idx_classes_tutor_active (tutorId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MÓDULO 3: GESTIÓN DE PROFESORES
-- ============================================================================

CREATE TABLE professors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255),
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  classId INT,
  -- MEJORA #2: Soft delete profesor
  status ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'RETIRED') DEFAULT 'ACTIVE',
  deletedAt TIMESTAMP NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT chk_prof_firstName CHECK (LENGTH(firstName) > 0 AND LENGTH(firstName) <= 100),
  CONSTRAINT chk_prof_lastName CHECK (LENGTH(lastName) > 0 AND LENGTH(lastName) <= 100),

  UNIQUE INDEX idx_class_tutor (classId),
  INDEX idx_firstName (firstName),
  INDEX idx_lastName (lastName),
  -- MEJORA #2: Soft delete index
  INDEX idx_status (status),
  INDEX idx_deletedAt (deletedAt),
  -- US11: Búsqueda case-insensitive sin acentos
  INDEX idx_professors_search_names (firstName COLLATE utf8mb4_general_ci, lastName COLLATE utf8mb4_general_ci),
  FULLTEXT INDEX idx_professor_search (firstName, lastName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Agregar FK de classes a professors (MEJORA #8: tutorId NOT NULL)
ALTER TABLE classes ADD CONSTRAINT fk_tutorId FOREIGN KEY (tutorId) REFERENCES professors(id) ON DELETE RESTRICT;

-- MEJORA #8: Trigger para validar un profesor no tutoriza múltiples clases
CREATE TRIGGER check_single_tutor_per_professor_insert
BEFORE INSERT ON classes
FOR EACH ROW
BEGIN
  IF (SELECT COUNT(*) FROM classes WHERE tutorId = NEW.tutorId AND id != NEW.id) > 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Professor already tutors another class';
  END IF;
END;

CREATE TRIGGER check_single_tutor_per_professor_update
BEFORE UPDATE ON classes
FOR EACH ROW
BEGIN
  IF (SELECT COUNT(*) FROM classes WHERE tutorId = NEW.tutorId AND id != NEW.id) > 0 THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Professor already tutors another class';
  END IF;
END;

CREATE TABLE subjects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(50) UNIQUE,
  type ENUM('CORE', 'ELECTIVE', 'CUSTOM') NOT NULL,
  description TEXT,
  status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
  -- MEJORA #12: Agregar deletedAt
  deletedAt TIMESTAMP NULL,
  -- MEJORA #5: Auditoría
  createdBy INT,
  updatedBy INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- MEJORA #7: Agregar updatedAt
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updatedBy) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_type (type),
  INDEX idx_status (status),
  INDEX idx_code (code),
  INDEX idx_deletedAt (deletedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE professor_subjects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  profesorId INT NOT NULL,
  subjectId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (profesorId) REFERENCES professors(id) ON DELETE CASCADE,
  FOREIGN KEY (subjectId) REFERENCES subjects(id) ON DELETE CASCADE,

  UNIQUE INDEX idx_professor_subject (profesorId, subjectId),
  INDEX idx_profesorId (profesorId),
  INDEX idx_subjectId (subjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE professor_availabilities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  profesorId INT NOT NULL,
  dayOfWeek INT NOT NULL COMMENT '1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie',
  sessionNumber INT NOT NULL COMMENT 'Número sesión (1-8)',
  isAvailable BOOLEAN DEFAULT FALSE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (profesorId) REFERENCES professors(id) ON DELETE CASCADE,

  UNIQUE INDEX idx_availability_unique (profesorId, dayOfWeek, sessionNumber),
  INDEX idx_profesorId (profesorId),
  INDEX idx_dayOfWeek (dayOfWeek)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MEJORA #10: professor_assignments sin totalSessions (se calcula en app)
CREATE TABLE professor_assignments (
  id INT PRIMARY KEY AUTO_INCREMENT,
  profesorId INT NOT NULL,
  subjectId INT NOT NULL,
  courseId INT NOT NULL,
  sessionsPerWeek INT,
  status ENUM('ACTIVE', 'NEEDS_REVIEW', 'ARCHIVED') DEFAULT 'ACTIVE',
  -- MEJORA #5: Auditoría
  createdBy INT,
  updatedBy INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (profesorId) REFERENCES professors(id) ON DELETE CASCADE,
  FOREIGN KEY (subjectId) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updatedBy) REFERENCES users(id) ON DELETE SET NULL,

  UNIQUE INDEX idx_assignment_unique (profesorId, subjectId, courseId),
  INDEX idx_profesorId (profesorId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MÓDULO 4: GESTIÓN DE ALUMNOS
-- ============================================================================

CREATE TABLE students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255),
  firstName VARCHAR(100) NOT NULL,
  lastName VARCHAR(100) NOT NULL,
  courseId INT NOT NULL,
  classId INT,
  lunch_type VARCHAR(50),
  scholarship BOOLEAN DEFAULT FALSE,
  observations LONGTEXT,
  status ENUM('ACTIVE', 'INACTIVE', 'GRADUATED') DEFAULT 'ACTIVE',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE RESTRICT,
  FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE SET NULL,

  INDEX idx_courseId (courseId),
  INDEX idx_classId (classId),
  INDEX idx_status (status),
  FULLTEXT INDEX idx_student_search (firstName, lastName)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MÓDULO 5: CONFIGURACIÓN DE HORARIOS
-- ============================================================================

CREATE TABLE calendars (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  academicYear INT,
  startDate DATE NOT NULL,
  endDate DATE NOT NULL,
  startTime TIME NOT NULL,
  endTime TIME NOT NULL,
  sessionCount INT NOT NULL,
  sessionDuration INT NOT NULL,
  breakCount INT DEFAULT 1,
  totalFrames INT,
  status ENUM('ACTIVE', 'ARCHIVED') DEFAULT 'ACTIVE',
  -- MEJORA #12: Agregar deletedAt
  deletedAt TIMESTAMP NULL,
  -- MEJORA #5: Auditoría
  createdBy INT,
  updatedBy INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updatedBy) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_academicYear (academicYear),
  INDEX idx_status (status),
  INDEX idx_deletedAt (deletedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  calendarId INT NOT NULL,
  number INT,
  dayOfWeek INT NOT NULL,
  startTime TIME NOT NULL,
  endTime TIME NOT NULL,
  type ENUM('class', 'break'),
  -- MEJORA #7: Agregar updatedAt
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (calendarId) REFERENCES calendars(id) ON DELETE CASCADE,

  UNIQUE INDEX idx_session_unique (calendarId, dayOfWeek, number),
  INDEX idx_calendarId (calendarId),
  INDEX idx_dayOfWeek (dayOfWeek)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subject_courses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  subjectId INT NOT NULL,
  courseId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (subjectId) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,

  UNIQUE INDEX idx_subject_course (subjectId, courseId),
  INDEX idx_courseId (courseId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subject_standard_loads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  subjectId INT NOT NULL,
  courseId INT NOT NULL,
  sessionsPerWeek INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (subjectId) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,

  UNIQUE INDEX idx_load_unique (subjectId, courseId),
  INDEX idx_subjectId (subjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MÓDULO 6: RESTRICCIONES DE CARGA HORARIA
-- ============================================================================

CREATE TABLE restrictions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  -- MEJORA #1: Agregar calendarId FK (CRÍTICA)
  calendarId INT NOT NULL,
  courseId INT NOT NULL,
  classId INT,
  type ENUM('HOURS_PER_WEEK', 'AVAILABILITY', 'NO_DUPLICATE', 'SINGLE_LOCATION') NOT NULL,
  status ENUM('ACTIVE', 'DRAFT', 'ARCHIVED') DEFAULT 'ACTIVE',
  -- MEJORA #5: Auditoría
  createdBy INT,
  updatedBy INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (calendarId) REFERENCES calendars(id) ON DELETE CASCADE,
  FOREIGN KEY (courseId) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updatedBy) REFERENCES users(id) ON DELETE SET NULL,

  -- MEJORA #1: Índice para búsquedas por calendar
  INDEX idx_calendar_restrictions (calendarId),
  INDEX idx_courseId (courseId),
  INDEX idx_classId (classId),
  INDEX idx_type (type),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE restriction_details (
  id INT PRIMARY KEY AUTO_INCREMENT,
  restrictionId INT NOT NULL,
  subjectId INT NOT NULL,
  sessionCount INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (restrictionId) REFERENCES restrictions(id) ON DELETE CASCADE,
  FOREIGN KEY (subjectId) REFERENCES subjects(id) ON DELETE CASCADE,

  INDEX idx_restrictionId (restrictionId),
  INDEX idx_subjectId (subjectId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MÓDULO 7: HORARIOS GENERADOS
-- ============================================================================

CREATE TABLE schedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  calendarId INT NOT NULL,
  algorithm ENUM('CSP', 'BACKTRACK'),
  generatedAt TIMESTAMP,
  status ENUM('ACTIVE', 'ARCHIVED', 'NEEDS_REVIEW') DEFAULT 'ACTIVE',
  -- MEJORA #5: Auditoría
  createdBy INT,
  updatedBy INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (calendarId) REFERENCES calendars(id) ON DELETE CASCADE,
  FOREIGN KEY (createdBy) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updatedBy) REFERENCES users(id) ON DELETE SET NULL,

  INDEX idx_calendarId (calendarId),
  INDEX idx_algorithm (algorithm),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MEJORA #6: Status enum mejorado para schedule_entries
CREATE TABLE schedule_entries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  scheduleId INT NOT NULL,
  classId INT NOT NULL,
  sessionNumber INT NOT NULL,
  dayOfWeek INT NOT NULL,
  subjectId INT NOT NULL,
  -- MEJORA #2: cascada SET NULL (soft delete profesor)
  profesorId INT,
  roomId INT,
  roleType ENUM('tutor', 'specialist', 'support') DEFAULT 'tutor',
  -- MEJORA #6: Status enum mejorado
  status ENUM(
    'scheduled',
    'manual_edited',
    'conflict_pending',
    'approved',
    'cancelled'
  ) DEFAULT 'scheduled',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (scheduleId) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (subjectId) REFERENCES subjects(id) ON DELETE RESTRICT,
  -- MEJORA #2: cambiar a SET NULL para soft delete profesor
  FOREIGN KEY (profesorId) REFERENCES professors(id) ON DELETE SET NULL,
  FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE SET NULL,

  -- HC2: SINGLE_LOCATION - Profesor no en 2 aulas sesión
  UNIQUE INDEX idx_professor_location (profesorId, dayOfWeek, sessionNumber),

  -- Única entrada por clase/sesión
  UNIQUE INDEX idx_schedule_slot (scheduleId, classId, sessionNumber),

  -- Búsquedas frecuentes
  INDEX idx_scheduleId (scheduleId),
  INDEX idx_classId (classId),
  INDEX idx_profesorId (profesorId),
  INDEX idx_subjectId (subjectId),
  INDEX idx_roomId (roomId),
  INDEX idx_dayOfWeek (dayOfWeek),
  -- MEJORA #11: Índice para búsqueda profesor/día/sesión con status
  INDEX idx_schedule_entries_professor_status (profesorId, dayOfWeek, status),
  -- MEJORA #13: Índice covering para búsqueda aula/día/sesión
  INDEX idx_schedule_entries_room_day_session (roomId, dayOfWeek, sessionNumber)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MEJORA #2: Trigger para marcar entries como conflicto cuando profesor se borra
CREATE TRIGGER mark_schedule_conflict_on_professor_delete
AFTER UPDATE ON professors
FOR EACH ROW
BEGIN
  IF NEW.deletedAt IS NOT NULL AND OLD.deletedAt IS NULL THEN
    UPDATE schedule_entries
    SET status = 'conflict_pending'
    WHERE profesorId = NEW.id;
  END IF;
END;

-- MEJORA #2: Trigger para marcar entries cuando profesor se marca RETIRED
CREATE TRIGGER mark_schedule_conflict_on_professor_retire
AFTER UPDATE ON professors
FOR EACH ROW
BEGIN
  IF NEW.status = 'RETIRED' AND OLD.status != 'RETIRED' THEN
    UPDATE schedule_entries
    SET status = 'conflict_pending'
    WHERE profesorId = NEW.id;
  END IF;
END;

CREATE TABLE schedule_generation_jobs (
  id VARCHAR(255) PRIMARY KEY,
  calendarId INT NOT NULL,
  algorithm ENUM('CSP', 'BACKTRACK'),
  status ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'),
  scheduleId INT,
  progress INT,
  currentSession INT,
  error TEXT,
  errorType VARCHAR(50),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completedAt TIMESTAMP NULL,

  INDEX idx_status (status),
  INDEX idx_calendarId (calendarId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- MEJORA #3: Relación M:M faltante students ↔ schedules
-- ============================================================================

CREATE TABLE student_schedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  studentId INT NOT NULL,
  scheduleId INT NOT NULL,
  scheduleEntryId INT NOT NULL,
  assignedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (studentId) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (scheduleId) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (scheduleEntryId) REFERENCES schedule_entries(id) ON DELETE CASCADE,

  UNIQUE INDEX idx_student_schedule (studentId, scheduleId, scheduleEntryId),
  INDEX idx_student (studentId),
  INDEX idx_schedule (scheduleId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger automático: cuando se crea schedule_entry, agregar a students de esa clase
CREATE TRIGGER populate_student_schedules
AFTER INSERT ON schedule_entries
FOR EACH ROW
BEGIN
  INSERT INTO student_schedules (studentId, scheduleId, scheduleEntryId)
  SELECT s.id, NEW.scheduleId, NEW.id
  FROM students s
  WHERE s.classId = NEW.classId
  AND s.status = 'ACTIVE'
  ON DUPLICATE KEY UPDATE assignedAt = CURRENT_TIMESTAMP;
END;

-- ============================================================================
-- US11: BÚSQUEDA CASE-INSENSITIVE SIN ACENTOS
-- ============================================================================

-- Ejemplos de queries para búsqueda de profesores (case-insensitive, sin acentos):

-- FORMA 1: Usar COLLATE utf8mb4_general_ci (ignora acentos y mayúsculas)
-- SELECT * FROM professors
-- WHERE firstName COLLATE utf8mb4_general_ci LIKE 'josé%'
-- AND deletedAt IS NULL;
-- ✅ Encuentra: José, JOSÉ, josé, jose

-- FORMA 2: Full-text search (menos flexible pero más rápido)
-- SELECT * FROM professors
-- WHERE MATCH(firstName, lastName) AGAINST('josé' IN BOOLEAN MODE)
-- AND deletedAt IS NULL;

-- FORMA 3: Usar índice covering (recomendado para app)
-- SELECT * FROM professors
-- WHERE LOWER(firstName) LIKE LOWER('josé%')
--    OR LOWER(lastName) LIKE LOWER('%garcía%')
-- AND deletedAt IS NULL;
-- ℹ️ Nota: MySQL LOWER() no elimina acentos automáticamente
--    pero combinado con COLLATE utf8mb4_general_ci en el índice, funciona

-- ============================================================================
-- VISTAS (MEJORA #9: Vistas de detección de conflictos)
-- ============================================================================

-- Vista 1: Corregida professor_schedule (MEJORA #4: Corregir BUG)
CREATE OR REPLACE VIEW professor_schedule AS
SELECT
  p.id as profesorId,
  CONCAT(p.firstName, ' ', p.lastName) as profesorName,
  se.dayOfWeek,
  sess.number as sessionNumber,
  sess.startTime,
  sess.endTime,
  subj.name as subjectName,
  c.name as className,
  r.name as roomName,
  sch.id as scheduleId,
  sch.algorithm,
  sch.generatedAt,
  se.status
FROM schedule_entries se
JOIN schedules sch ON sch.id = se.scheduleId
JOIN professors p ON se.profesorId = p.id
JOIN subjects subj ON se.subjectId = subj.id
JOIN classes c ON se.classId = c.id
JOIN sessions sess ON sess.calendarId = sch.calendarId
                   AND sess.dayOfWeek = se.dayOfWeek
                   AND sess.number = se.sessionNumber
LEFT JOIN rooms r ON se.roomId = r.id
WHERE p.deletedAt IS NULL
ORDER BY p.id, se.dayOfWeek, sess.number;

-- Vista 2: Detectar HC2 violado (profesor en 2 aulas)
CREATE OR REPLACE VIEW schedule_conflicts_professor_overlap AS
SELECT
  sch.id as scheduleId,
  p.id as profesorId,
  CONCAT(p.firstName, ' ', p.lastName) as profesorName,
  se.dayOfWeek,
  se.sessionNumber,
  COUNT(*) as conflict_count,
  GROUP_CONCAT(CONCAT(c.name, ' - ', s.name) SEPARATOR ', ') as conflicting_entries
FROM schedule_entries se
JOIN schedules sch ON sch.id = se.scheduleId
JOIN professors p ON se.profesorId = p.id
JOIN classes c ON se.classId = c.id
JOIN subjects s ON se.subjectId = s.id
WHERE se.profesorId IS NOT NULL
GROUP BY sch.id, se.profesorId, se.dayOfWeek, se.sessionNumber
HAVING COUNT(*) > 1;

-- Vista 3: Sin aula asignada
CREATE OR REPLACE VIEW schedule_conflicts_no_room AS
SELECT
  sch.id as scheduleId,
  se.id as entryId,
  c.name as className,
  s.name as subjectName,
  CONCAT(p.firstName, ' ', p.lastName) as profesorName,
  se.dayOfWeek,
  se.sessionNumber
FROM schedule_entries se
JOIN schedules sch ON sch.id = se.scheduleId
JOIN classes c ON se.classId = c.id
JOIN subjects s ON se.subjectId = s.id
LEFT JOIN professors p ON se.profesorId = p.id
WHERE se.roomId IS NULL;

-- Vista 4: Fuera de disponibilidad
CREATE OR REPLACE VIEW schedule_conflicts_availability AS
SELECT
  sch.id as scheduleId,
  se.profesorId,
  CONCAT(p.firstName, ' ', p.lastName) as profesorName,
  se.dayOfWeek,
  se.sessionNumber,
  c.name as className,
  s.name as subjectName
FROM schedule_entries se
JOIN schedules sch ON sch.id = se.scheduleId
JOIN professors p ON se.profesorId = p.id
JOIN classes c ON se.classId = c.id
JOIN subjects s ON se.subjectId = s.id
LEFT JOIN professor_availabilities pa ON pa.profesorId = se.profesorId
                                      AND pa.dayOfWeek = se.dayOfWeek
                                      AND pa.sessionNumber = se.sessionNumber
WHERE se.profesorId IS NOT NULL
  AND (pa.id IS NULL OR pa.isAvailable = FALSE);

-- Vista 5: Carga de profesor (agregado de sesiones)
CREATE OR REPLACE VIEW professor_load AS
SELECT
  p.id,
  CONCAT(p.firstName, ' ', p.lastName) as name,
  COUNT(DISTINCT pa.id) as totalAssignments,
  SUM(pa.sessionsPerWeek) as totalSessionsPerWeek,
  COUNT(DISTINCT ps.subjectId) as numSubjects
FROM professors p
LEFT JOIN professor_assignments pa ON p.id = pa.profesorId AND pa.status = 'ACTIVE'
LEFT JOIN professor_subjects ps ON p.id = ps.profesorId
WHERE p.deletedAt IS NULL
GROUP BY p.id;

-- Vista 6: Disponibilidad profesor (resumen)
CREATE OR REPLACE VIEW professor_availability_summary AS
SELECT
  p.id,
  CONCAT(p.firstName, ' ', p.lastName) as name,
  COUNT(CASE WHEN pa.isAvailable = TRUE THEN 1 END) as availableSlots,
  COUNT(*) as totalSlots,
  ROUND(COUNT(CASE WHEN pa.isAvailable = TRUE THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) as availabilityPercentage
FROM professors p
LEFT JOIN professor_availabilities pa ON p.id = pa.profesorId
WHERE p.deletedAt IS NULL
GROUP BY p.id;

-- Vista 7: Auditoría de restricciones (con createdBy/updatedBy)
CREATE OR REPLACE VIEW restriction_audit_trail AS
SELECT
  r.id,
  r.type,
  c.name as courseName,
  cl.name as className,
  s.name as subjectName,
  rd.sessionCount,
  r.status,
  CONCAT(uc.firstName, ' ', uc.lastName) as createdByName,
  CONCAT(uu.firstName, ' ', uu.lastName) as updatedByName,
  r.createdAt,
  r.updatedAt
FROM restrictions r
JOIN courses c ON r.courseId = c.id
JOIN calendars cal ON r.calendarId = cal.id
LEFT JOIN classes cl ON r.classId = cl.id
LEFT JOIN restriction_details rd ON rd.restrictionId = r.id
LEFT JOIN subjects s ON rd.subjectId = s.id
LEFT JOIN users uc ON r.createdBy = uc.id
LEFT JOIN users uu ON r.updatedBy = uu.id
WHERE r.status = 'ACTIVE'
AND cal.deletedAt IS NULL
ORDER BY r.courseId, r.classId, r.type;

-- ============================================================================
-- INSERCIONES INICIALES
-- ============================================================================

INSERT INTO roles (name, description, permissions) VALUES
('jefe_estudios', 'Jefe de Estudios', JSON_OBJECT(
  'crear_profesor', JSON_TRUE(),
  'editar_profesor', JSON_TRUE(),
  'borrar_profesor', JSON_TRUE(),
  'generar_horarios', JSON_TRUE(),
  'ver_reportes', JSON_TRUE()
)),
('director', 'Director', JSON_OBJECT(
  'crear_profesor', JSON_TRUE(),
  'editar_profesor', JSON_TRUE(),
  'borrar_profesor', JSON_TRUE(),
  'generar_horarios', JSON_TRUE(),
  'ver_reportes', JSON_TRUE(),
  'aprobar_cambios', JSON_TRUE()
)),
('profesor', 'Profesor', JSON_OBJECT(
  'ver_horario', JSON_TRUE(),
  'ver_alumnos', JSON_TRUE(),
  'ver_mi_carga', JSON_TRUE()
)),
('alumno', 'Alumno', JSON_OBJECT(
  'ver_horario', JSON_TRUE(),
  'ver_calificaciones', JSON_TRUE()
));

INSERT INTO settings (key, value, type) VALUES
('schedule_algorithm', 'CSP', 'string'),
('jwt_access_ttl', '900', 'integer'),
('jwt_refresh_ttl', '86400', 'integer'),
('password_min_length', '8', 'integer'),
('max_sessions_per_day', '8', 'integer'),
('hash_cost', '12', 'integer'),
('recaptcha_v3_enabled', 'true', 'boolean');

-- ============================================================================
-- ÍNDICES DE RENDIMIENTO ADICIONALES
-- ============================================================================

CREATE INDEX idx_student_cafeteria ON students(lunch_type);
CREATE INDEX idx_student_scholarship ON students(scholarship);
CREATE INDEX idx_course_subjects ON subject_courses(courseId, subjectId);

-- ============================================================================
-- FIN DE SCRIPT DDL - VERSION 2.0 REFINADA
-- ============================================================================
-- Cambios principales en v2.0:
-- ✅ #1: Agregada relación calendars ↔ restrictions (FK + índice)
-- ✅ #2: Soft delete profesor (status enum, deletedAt, triggers, cascada SET NULL)
-- ✅ #3: M:M students ↔ schedules con trigger automático
-- ✅ #4: Vista professor_schedule corregida (JOIN correcto)
-- ✅ #5: Auditoría createdBy/updatedBy en 7 tablas clave
-- ✅ #6: Status enum mejorado en schedule_entries
-- ✅ #7: Agregado updatedAt en subjects, sessions, rooms
-- ✅ #8: tutorId NOT NULL en classes + triggers validación unicidad
-- ✅ #9: 7 vistas de soporte (profesor_schedule, 3 conflictos, 3 reportes)
-- ✅ #10: Eliminado campo redundante totalSessions de professor_assignments
-- ✅ #12: Agregado deletedAt para soft delete en subjects, calendars
-- ✅ #11, #13: Índices de performance adicionales (profesor/día/sesión, aula/día/sesión)
-- ============================================================================
