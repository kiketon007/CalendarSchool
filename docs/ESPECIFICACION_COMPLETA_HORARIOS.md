# EspecificaciÃ³n Completa: Sistema de Horarios - CalendarSchool

**Fecha:** 30 de julio de 2026  
**Status:** âœ… BORRADOR COMPLETO LISTO PARA VALIDACIÃ“N  
**Decisiones TÃ©cnicas:** Incorporadas y confirmadas

---

## ðŸ“‹ Resumen de lo Generado

Se ha completado la **especificaciÃ³n completa del sistema de horarios** incorporando tus decisiones finales:

### âœ… 3 Borradores Completos Creados

| Story | Archivo | CAs | Status |
|-------|---------|-----|--------|
| **US-BASE** | `US-BASE_ConfigurarCalendarioBase_BORRADOR.md` | 18 | âœ… Listo |
| **US-SUBJECT** | `US-SUBJECT_GestionarAsignaturas_BORRADOR.md` | 14 | âœ… Listo |
| **US19** | `US19_CrearRestriccionCargaHoraria_BORRADOR.md` | 16 | âœ… Listo |

**Total: 48 Criterios de AceptaciÃ³n** + Requisitos tÃ©cnicos completos

---

## ðŸŽ¯ Tus Decisiones Finales (Incorporadas)

| # | DecisiÃ³n | Tu ElecciÃ³n | Impacto |
|---|----------|-------------|--------|
| **1** | Â¿Calendario predefinido? | **No (manual)** | User define estructura completa |
| **2** | Â¿Editar calendario post-uso? | **SÃ­** | Permitir ediciÃ³n, avisar si horarios en uso |
| **3** | Â¿Max # sesiones? | **8** | MÃ¡ximo 8 sesiones/dÃ­a |
| **4** | Â¿Asignaturas nivel? | **Por curso** | Una restricciÃ³n aplica a todas clases del curso |
| **5** | Â¿Algoritmo? | **CSP + Backtrack** | Ambos configurables vÃ­a setting |

---

## ðŸ“– Contenido de Cada Borrador

### US-BASE: Configurar Calendario Base (18 CAs)

**QuÃ© es:**
Define la estructura temporal del colegio (sesiones + recreo) que sirve como base para todos los horarios.

**Ejemplo:**
```
Primaria 2026-27:
Lunes-Viernes
â”œâ”€ 09:00-09:45: SesiÃ³n 1
â”œâ”€ 09:45-10:30: SesiÃ³n 2
â”œâ”€ 10:30-11:15: SesiÃ³n 3
â”œâ”€ 11:15-11:45: RECREO (especial, no se rellena)
â”œâ”€ 11:45-12:30: SesiÃ³n 4
â”œâ”€ 12:30-13:15: SesiÃ³n 5
â””â”€ 13:15-14:00: SesiÃ³n 6

Total: 25 sesiones Ãºtiles/semana
```

**Features:**
âœ… Crear calendario (auto-generaciÃ³n de sesiones)  
âœ… Editar sesiÃ³n individual  
âœ… Mover recreo  
âœ… Agregar/quitar sesiÃ³n  
âœ… Borrar calendario (cascada soft)  
âœ… Ver listado  
âœ… Validar no solapamientos  
âœ… Mostrar disponibilidad  

**Restricciones:**
- Max 8 sesiones
- DuraciÃ³n sesiÃ³n max 90 min
- DuraciÃ³n recreo max 90 min
- No solapamientos
- Se puede editar post-uso (marca horarios como NEEDS_REVIEW)

**Permisos:**
- jefe_estudios, director: CRUD
- profesor: lectura
- alumno: no acceso

---

### US-SUBJECT: Gestionar Asignaturas (14 CAs)

**QuÃ© es:**
CRUD de asignaturas (InglÃ©s, ProgramaciÃ³n, EducaciÃ³n FÃ­sica, etc.) que luego se usan en restricciones.

**Tipos de Asignatura:**
```
CORE (obligatorias):
â”œâ”€ Lengua Castellana
â”œâ”€ MatemÃ¡ticas
â”œâ”€ InglÃ©s
â”œâ”€ EducaciÃ³n FÃ­sica
â””â”€ Etc.

ELECTIVE (electivas):
â”œâ”€ FrancÃ©s
â”œâ”€ ReligiÃ³n
â””â”€ Etc.

CUSTOM (creadas por user):
â”œâ”€ ProgramaciÃ³n
â”œâ”€ RobÃ³tica
â””â”€ Yoga
```

**Features:**
âœ… Crear asignatura (CORE/ELECTIVE/CUSTOM)  
âœ… Ver listado  
âœ… Filtrar por tipo  
âœ… Filtrar por status (ACTIVE/INACTIVE)  
âœ… Buscar por nombre  
âœ… Editar asignatura  
âœ… Borrar asignatura (cascada a restricciones)  
âœ… Inactivar (soft delete)  
âœ… Mostrar contador de usos  

**Restricciones:**
- Nombre Ãºnico
- Tipo obligatorio
- Status ACTIVE/INACTIVE

**Permisos:**
- jefe_estudios, director: CRUD
- profesor: lectura
- alumno: no acceso

---

### US19: Crear RestricciÃ³n de Carga Horaria (16 CAs)

**QuÃ© es:**
Define cuÃ¡ntas sesiones por asignatura en cada curso, y otras restricciones (disponibilidad profesor, no duplicidad).

**Tipos de RestricciÃ³n (MÃºltiples):**
```
Tipo 1: HOURS_PER_WEEK (MVP)
â”œâ”€ "InglÃ©s en 1Âº Primaria: 3 sesiones/semana"
â”œâ”€ ParÃ¡metros: { sessionsPerWeek: 3, maxPerDay: 1 }
â””â”€ ValidaciÃ³n: 1-5 sesiones, max/dÃ­a â‰¤ sesiones

Tipo 2: AVAILABILITY (Futuro)
â”œâ”€ "Prof. GarcÃ­a no disponible miÃ©rcoles"
â””â”€ ParÃ¡metros: { unavailableDays: [3], professorId: 5 }

Tipo 3: NO_DUPLICATE (Futuro)
â”œâ”€ "InglÃ©s mÃ¡ximo 1 vez/dÃ­a"
â””â”€ ParÃ¡metros: { maxPerDay: 1 }
```

**Features:**
âœ… Crear restricciÃ³n (cualquier tipo, pero MVP solo HOURS_PER_WEEK)  
âœ… Ver listado restricciones  
âœ… Filtrar por tipo, curso  
âœ… Buscar asignatura  
âœ… Mostrar suma disponibilidad (24/25 franjas)  
âœ… Barra visual de disponibilidad  
âœ… Avisar si suma > 25 (permite pero avisa)  
âœ— Editar (futuro US19+)  
âœ— Borrar (futuro US19+)  

**Restricciones:**
- Asignatura debe existir (US-SUBJECT)
- Curso debe existir
- sessionsPerWeek: 1-5
- maxPerDay (si existe): 1 a sessionsPerWeek
- UNIQUE (tipo, asignatura, curso)
- Avisar (no bloquear) si suma > 25

**Permisos:**
- jefe_estudios, director: crear, ver
- profesor: solo ver
- alumno: no acceso

---

## ðŸ—‚ï¸ Estructura de Datos Completa

```sql
-- Calendario Base
CREATE TABLE school_calendars (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  status ENUM('ACTIVE', 'INACTIVE'),
  created_at TIMESTAMP
);

CREATE TABLE calendar_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  calendarId INT NOT NULL FK â†’ school_calendars(id) CASCADE,
  sessionNumber INT NOT NULL,  -- 1-8
  startTime TIME NOT NULL,     -- 09:00
  endTime TIME NOT NULL,       -- 09:45
  duration INT NOT NULL,       -- 45 min
  isBreak BOOLEAN DEFAULT FALSE, -- TRUE para recreo
  order INT NOT NULL,          -- Orden en dÃ­a
  UNIQUE KEY (calendarId, sessionNumber)
);

-- Asignaturas
CREATE TABLE subjects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL UNIQUE,
  type ENUM('CORE', 'ELECTIVE', 'CUSTOM'),
  status ENUM('ACTIVE', 'INACTIVE'),
  description TEXT,
  created_at TIMESTAMP
);

-- Restricciones
CREATE TABLE restrictions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  type ENUM('HOURS_PER_WEEK', 'AVAILABILITY', 'NO_DUPLICATE'),
  subjectId INT NOT NULL FK â†’ subjects(id) CASCADE,
  courseId INT NOT NULL FK â†’ courses(id) CASCADE,
  params JSON,  -- { "sessionsPerWeek": 3, "maxPerDay": 1 }
  status ENUM('ACTIVE', 'INACTIVE'),
  created_at TIMESTAMP,
  UNIQUE KEY (type, subjectId, courseId)
);
```

---

## â±ï¸ Timeline Revisado

### Fase 1: EspecificaciÃ³n (2-3 semanas)
- [x] US-BASE: Borrador completo (18 CAs)
- [x] US-SUBJECT: Borrador completo (14 CAs)
- [x] US19: Borrador completo (16 CAs)
- [ ] US20: Borrador (listado restricciones)
- [ ] US-ALGO: Research algoritmos + Design

**Tiempo:** 2-3 semanas adicionales para US20 + research

### Fase 2: Development (6-8 semanas)
- [ ] US-BASE: Calendario base (1.5 semanas)
- [ ] US-SUBJECT: CRUD asignaturas (1 semana)
- [ ] US19 + US20: Restricciones (2 semanas)
- [ ] US-ALGO: Algoritmo CSP + Backtrack (3-4 semanas)

**Total:** 8-11 semanas (igual estimaciÃ³n anterior)

---

## âœ¨ PrÃ³ximos Pasos

### Inmediatos
1. âœ… **Validar borradores** (US-BASE, US-SUBJECT, US19)
   - Â¿CAs cubren todo?
   - Â¿Requisitos tÃ©cnicos claros?
   - Â¿Modelos BD correctos?

2. **Crear US20** (Ver Restricciones Activas)
   - Listado + filtros
   - Mostrar suma total
   - Barra visual

3. **Research Algoritmos**
   - CSP (Constraint Satisfaction Problem)
   - Backtracking
   - Comparativa + prototipo

### A Largo Plazo
4. **Incorporar al User_Stories_MVP.md**
   - Agregar US-BASE, US-SUBJECT
   - Actualizar US19, US20
   - Agregar US-ALGO

5. **Iniciar Development**
   - Fase 1: Calendario base
   - Fase 2: Asignaturas
   - Fase 3: Restricciones
   - Fase 4: Algoritmo

---

## ðŸ“ Notas Importantes

### DecisiÃ³n 1: Editar Post-Uso
**Permitir editar calendario tras crear horarios:**
- Si user edita horas: horarios se marcan como NEEDS_REVIEW
- No se eliminan horarios
- User puede revisar y decidir si regenerar
- MitigaciÃ³n: avisar claramente

### DecisiÃ³n 2: Algoritmo Dual
**ConfiguraciÃ³n permite elegir CSP o Backtrack:**
- setting en BD: `schedule_algorithm` = 'CSP' | 'BACKTRACK'
- UI: OpciÃ³n en "Generar Horarios" o setting admin
- Ambos deben dar resultado idÃ©ntico (diferencia en performance)

### DecisiÃ³n 3: MÃºltiples Tipos
**Arquitectura preparada para tipos, MVP solo HOURS_PER_WEEK:**
- Modelo JSON params permite agregar tipos sin cambiar schema
- AVAILABILITY y NO_DUPLICATE son casos de uso frecuentes
- Futuro: permitir user crear restricciones de estos tipos

### DecisiÃ³n 4: Avisar, No Bloquear
**Si suma > 25 franjas:**
- Sistema AVISA (warning)
- Pero PERMITE crear restricciÃ³n
- User es responsable de validez
- Algoritmo dirÃ¡ si es factible generar horario

---

## ðŸŽ¯ Checklist ValidaciÃ³n

Antes de pasar a development, validar:

- [ ] US-BASE: 18 CAs son suficientes
- [ ] US-BASE: Modelo BD es correcto
- [ ] US-BASE: Endpoints REST estÃ¡n bien diseÃ±ados
- [ ] US-SUBJECT: 14 CAs cubren CRUD completo
- [ ] US-SUBJECT: Cascada borrado es segura
- [ ] US19: 16 CAs son suficientes
- [ ] US19: Validaciones son correctas
- [ ] US19: Avisos son claros para user
- [ ] Permisos son consistentes (jefe + director everywhere)
- [ ] Modelos BD tienen Ã­ndices y constraints
- [ ] Transacciones atÃ³micas en lugares crÃ­ticos

---

## ðŸ“Š EstadÃ­sticas Finales

| MÃ©trica | Cantidad |
|---------|----------|
| **User Stories Nuevas** | 3 (BASE, SUBJECT, ALGO) |
| **User Stories Existentes (Ampliadas)** | 2 (US19, US20) |
| **Total CAs Horarios** | 48 + US20 (~15) + US-ALGO (~15) = 78 |
| **LÃ­neas DocumentaciÃ³n** | 2000+ |
| **Modelos BD** | 4 tablas nuevas |
| **Endpoints API** | 15+ |
| **Componentes React** | 30+ |
| **Testing Unit** | 20+ test suites |

---

## ðŸš€ Listo para Siguiente Fase

âœ… EspecificaciÃ³n completa de horarios (3 capas)  
âœ… Borrados listos: US-BASE, US-SUBJECT, US19  
âœ… Decisiones tÃ©cnicas confirmadas  
âœ… Modelos BD definidos  
âœ… Requisitos tÃ©cnicos frontend/backend  
âœ… Criterios de aceptaciÃ³n detallados  

**Â¿Validamos estos borradores y procedemos con implementaciÃ³n?** ðŸŽ¯


