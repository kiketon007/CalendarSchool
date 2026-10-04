# Especificación Final: Sistema Completo de Generación de Horarios

**Fecha:** 31 de julio de 2026  
**Status:** ✅ ESPECIFICACIÓN COMPLETA Y VALIDADA  
**Ready for:** Development Fase 1

---

## 📋 Documentos Completados

### Fase 1: Especificación Técnica (COMPLETADA)

| Documento | CAs | Status | Descripción |
|-----------|-----|--------|------------|
| **US-BASE** | 18 | ✅ Listo | Configurar calendario base (sesiones + 2 recreos) |
| **US-SUBJECT** | 14 | ✅ Listo | Gestionar asignaturas + asociación a cursos |
| **US19** | 16 | ✅ Listo | Crear restricciones (múltiples tipos: carga + disponibilidad + descansos) |
| **US20** | 15 | ✅ Listo | Ver listado restricciones + barra disponibilidad |
| **US-ALGO** | N/A | ✅ Listo | Generar horarios (CSP + Backtrack configurables) |

**Total CAs:** 63 + Research Algorithm

### Fase 2: Ajustes Incorporados

✅ **US-BASE:** Permitir **2 recreos** (no solo 1)  
✅ **US-SUBJECT:** Asignaturas **asociadas a cursos** (ej: Inglés_1, Inglés_2)  
✅ Todos los borradores validados por usuario

---

## 🎯 5 User Stories (Descripción Ejecutiva)

### US-BASE: Configurar Calendario Base (18 CAs)
```
Permitir jefe de estudios definir estructura temporal del colegio:
├─ 1-8 sesiones/día (ej: 6 sesiones × 45 min)
├─ 0-2 recreos (ej: 11:15-11:45, 13:00-13:20)
├─ Auto-generación de horas (09:00 + sesiones)
├─ Validaciones: no solapamientos, max 90 min/sesión
└─ Edición post-uso: avisar, marcar horarios como NEEDS_REVIEW

Features clave:
- Crear/editar/borrar calendarios
- Mover recreos
- Agregar/quitar sesiones
- Ver barra disponibilidad (25 franjas = 4.5 horas)
```

### US-SUBJECT: Gestionar Asignaturas (14 CAs)
```
CRUD de asignaturas con asociación a cursos:
├─ Tipos: CORE (Lengua, Mate), ELECTIVE (Francés), CUSTOM (Yoga)
├─ Status: ACTIVE (visible en dropdowns), INACTIVE (datos persisten)
└─ Asociar a uno o múltiples cursos (ej: Inglés_1, Inglés_2, Inglés_3)

Features clave:
- Crear asignatura (user choose cursos)
- Filtrar por tipo/status
- Buscar por nombre
- Borrar con cascada a restricciones
- Mostrar # de restricciones usando asignatura
```

### US19: Crear Restricción de Carga Horaria (16 CAs)
```
Definir restricciones (múltiples tipos):

TIPO 1: HOURS_PER_WEEK (MVP)
├─ "Inglés en 1º Primaria: 3 sesiones/semana"
└─ Parámetros: sessionsPerWeek (1-5), maxPerDay (opcional)

TIPO 2: AVAILABILITY (Futuro pero arquitectura prep)
├─ "Prof. García no disponible miércoles"
└─ Parámetros: unavailableDays, professorId

TIPO 3: NO_DUPLICATE (Futuro)
├─ "Inglés máximo 1 vez/día"
└─ Parámetros: maxPerDay

Features clave:
- Crear restricción (tipo flexible JSON)
- Mostrar suma disponibilidad (24/25 franjas)
- Avisar si suma > 25 (permite pero avisa)
- UNIQUE (no duplicados)
- Validaciones: asignatura existe, curso existe, sessionsPerWeek 1-5
```

### US20: Ver Listado de Restricciones (15 CAs)
```
Visualizar todas las restricciones con análisis:

Display:
├─ Tabla: Asignatura | Curso | Tipo | Parámetros | Status
├─ Filtros combinables: Tipo + Curso + Status + Búsqueda
├─ Barra visual: [████████░░] 23/25 franjas (color verde/rojo)
└─ Desglose hover: "Inglés: 3, Lengua: 5, Mate: 5, ..."

Features clave:
- Ver todas las restricciones (activas + inactivas)
- Filtrar por tipo/curso/status
- Búsqueda case-insensitive
- Barra visual disponibilidad + desglose
- Responsive (desktop/tablet/móvil)
```

### US-ALGO: Generar Horarios (Research Completo)
```
Generar horarios automáticamente:

Entrada:
├─ Calendario base (25 sesiones/semana)
├─ Restricciones activas
├─ Profesores asignados
└─ Aulas disponibles

Salida (si éxito):
├─ Tabla: [Lunes-Viernes × Sesión 1-6]
└─ Cada celda: Clase + Asignatura + Profesor + Aula

Features clave:
- CSP (rápido, default) OR Backtrack (determinístico)
- Ambos configurables vía setting
- Timeout: 60s (CSP), 120s (BACKTRACK)
- Background job con polling UI
- Manejo errores: "Imposible generar", timeouts, crashes
```

---

## 🛠️ Arquitectura Técnica

### Base de Datos (4 tablas nuevas)

```sql
school_calendars
├─ id, name, description, status
└─ calendar_sessions (hasta 8 sesiones + 2 recreos)
   ├─ sessionNumber (1-8)
   ├─ startTime, endTime, duration
   └─ isBreak (TRUE para recreo)

subjects
├─ id, name, type (CORE/ELECTIVE/CUSTOM)
├─ status (ACTIVE/INACTIVE)
└─ description

subject_courses (asociación many-to-many)
├─ subjectId FK → subjects(id)
└─ courseId FK → courses(id)

restrictions
├─ id, type (HOURS_PER_WEEK, AVAILABILITY, NO_DUPLICATE)
├─ subjectId FK → subjects(id)
├─ courseId FK → courses(id)
├─ params JSON ({"sessionsPerWeek": 3, "maxPerDay": 1})
└─ status (ACTIVE/INACTIVE)
```

### APIs

**US-BASE:**
```
POST /api/calendar - Crear
GET /api/calendar - Listar
PUT /api/calendar/:id - Editar
DELETE /api/calendar/:id - Borrar
```

**US-SUBJECT:**
```
POST /api/subjects - Crear
GET /api/subjects - Listar
PUT /api/subjects/:id - Editar
DELETE /api/subjects/:id - Borrar
```

**US19:**
```
POST /api/restrictions - Crear
GET /api/restrictions - Listar (con filtros)
GET /api/restrictions/summary - Suma disponibilidad
```

**US20:**
```
GET /api/restrictions - Listar con filtros
GET /api/restrictions/summary - Resumen + desglose
```

**US-ALGO:**
```
POST /api/schedule/generate - Iniciar generación (retorna jobId)
GET /api/schedule/generate/:jobId - Polling estado
```

### Frontend Componentes

**US-BASE:** CalendarForm, SessionTable, BreakEditor, AvailabilityDisplay  
**US-SUBJECT:** SubjectForm, SubjectList, CourseAssociation  
**US19:** RestrictionForm, RestrictionTable, AvailabilityBar  
**US20:** RestrictionList, FilterBar, SearchInput, AvailabilityTooltip  
**US-ALGO:** GenerateButton, ProgressSpinner, ScheduleViewer, AlgorithmSelector

---

## 🔧 Decisiones Técnicas Confirmadas

| # | Decisión | Tu Elección | Impacto |
|---|----------|-------------|---------|
| **1** | Calendario manual | No predefinido | User libertad total |
| **2** | Editar post-uso | Sí permitir | Avisar, mark NEEDS_REVIEW |
| **3** | Max sesiones | 8 | Suficiente para escuelas |
| **4** | Asignaturas nivel | Por curso | Una restricción → todas clases |
| **5** | Algoritmo | CSP + Backtrack | Dual configurables |

---

## 📊 Criterios de Aceptación Totales

- **US-BASE:** 18 CAs (calendario + sesiones + recreos)
- **US-SUBJECT:** 14 CAs (CRUD + asociación cursos)
- **US19:** 16 CAs (restricciones múltiples tipos)
- **US20:** 15 CAs (listado + filtros + barra)
- **US-ALGO:** Research + architecture (no CAs, pero detallado)

**Total: 63 CAs + Research Algoritmo**

---

## ✅ Testing Strategy

### Unit Tests
- Validaciones (duración max 90min, unique restricciones, etc.)
- Cálculo suma disponibilidad
- Permisos (jefe + director only)
- Cascadas (delete asignatura borra restricciones)

### E2E Tests
- Crear calendario completo
- Crear asignaturas + asociar cursos
- Crear restricciones + validar suma
- Ver listado con filtros
- Generar horarios (CSP + Backtrack)
- Manejo errores (sin solución, timeout)

### Performance Tests
- CSP: < 15 segundos (10-15 cursos)
- Backtrack: < 120 segundos (5-10 cursos)
- Listar restricciones: < 2 segundos (1000 restricciones)

---

## ⏱️ Timeline Revisado

### Fase 1: Development US-BASE + US-SUBJECT (1.5-2 semanas)
- Setup DB, models, migrations
- API endpoints (CRUD)
- React components (forms, tables, dropdowns)
- Testing (unit + E2E)
- Validaciones (backend + frontend)

### Fase 2: Development US19 + US20 (2 semanas)
- API endpoints (crear, listar con filtros)
- React components (restriction form, list, barra)
- Validaciones (unique, suma, avisos)
- Testing (unit + E2E)

### Fase 3: Development US-ALGO (3-4 semanas)
- Implementar CSP (OR-Tools)
- Implementar Backtrack
- Background job queue (BullMQ)
- Testing (ambos algoritmos, edge cases)
- Manejo errores

**Total: 6.5-8 semanas**

---

## 🚀 Ready for Development

✅ Todas las especificaciones completadas  
✅ Criterios de aceptación claros (63 CAs)  
✅ Requisitos técnicos detallados (BD, API, Frontend)  
✅ Research algoritmo finalizado (CSP recomendado)  
✅ Testing strategy definida  
✅ Timeline estimado  

**Status:** LISTO PARA INICIAR FASE 1 DE DEVELOPMENT

---

## 📁 Archivos de Referencia

```
docs/
├── US-BASE_ConfigurarCalendarioBase_BORRADOR.md
├── US-SUBJECT_GestionarAsignaturas_BORRADOR.md
├── US19_CrearRestriccionCargaHoraria_BORRADOR.md
├── US20_VerRestriccionesActivas_BORRADOR.md
├── RESEARCH_ALGORITMOS_GENERACION_HORARIOS.md
├── ARQUITECTURA_HORARIOS_COMPLETA.md
└── ESPECIFICACION_FINAL_SISTEMA_HORARIOS.md (este archivo)
```

---

**Próximo paso:** Incorporar estas 5 nuevas stories al User_Stories_MVP.md y comenzar Fase 1 de development.

