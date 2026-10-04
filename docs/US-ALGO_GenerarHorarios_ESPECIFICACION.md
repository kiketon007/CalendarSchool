# US-ALGO: Generar Horarios Automáticamente

**Versión:** 1.0  
**Fecha:** 2026-08-01  
**Status:** 🟢 Especificación Completa  
**Fase:** 4 (Post Fases 1-3: Calendarios, Restricciones, Disponibilidad Profesores)

---

## 1. Introducción

### Historia de Usuario

**Como** jefe de estudios o director,  
**Quiero** generar horarios automáticamente respetando todas las restricciones configuradas (carga horaria, disponibilidad profesores, no duplicidad diaria, sin solapamientos),  
**Para** obtener un cuadrante horario semanal completo y válido sin conflictos.

### Objetivo

Implementar algoritmo automático de generación de horarios que:
- Respete **hard constraints** (restricciones que DEBEN cumplirse)
- Optimice **soft constraints** (restricciones deseables)
- Permita elegir algoritmo (CSP vs Backtrack)
- Ejecute en background (sin bloquear UI)
- Garantice concurrencia (sincronización, sin conflictos)

---

## 2. Casos de Uso y Reglas de Negocio

### 2.1 Flujo Principal: Generar Horarios

**Actor:** Jefe de estudios o director  
**Precondiciones:**
- ✅ US-BASE: Calendario base configurado (sesiones, recreos)
- ✅ US-SUBJECT: Asignaturas creadas (CORE, ELECTIVE, CUSTOM)
- ✅ US19: Restricciones de carga configuradas (sesiones/semana por asignatura/curso)
- ✅ US20: Restricciones validadas (suma ≤ 25 franjas)
- ✅ US-PROF-AVAIL: Disponibilidad profesores configurada
- ✅ US-PROF-ASSIGN: Profesores asignados a asignaturas
- ✅ US-PROF-SUMMARY: Carga de profesores sin conflictos críticos

**Flujo:**

1. Jefe hace clic en botón "Generar Horarios"
2. Sistema muestra modal con opciones:
   - Algoritmo: [✓ CSP | ○ Backtrack] (CSP seleccionado por defecto)
   - Información: "CSP: Rápido (1-15s), Backtrack: Thorough (5-120s)"
   - Botones: [Cancelar] [Generar]
3. Jefe selecciona algoritmo y confirma
4. Sistema inicia generación en background (job queue)
5. UI muestra spinner con progreso: "Generando horarios... (0/25 sesiones)"
6. Sistema calcula horario
7. Una vez completado:
   - Si éxito: Muestra "Horario generado exitosamente" + previsualización
   - Si error: Muestra error claro con sugerencias (ej: "Reduce carga horaria")
8. Jefe puede: Ver horario, Descargar PDF, Editar restricciones, Generar nuevamente

### 2.2 Hard Constraints (DEBEN cumplirse)

**HC1 - Carga horaria exacta:**
- Cada asignatura debe tener EXACTAMENTE N sesiones/semana (de US19)
- No puede haber más ni menos sesiones que lo configurado

**HC2 - Ubicación simultánea - SINGLE_LOCATION:**
- Un profesor NO puede estar en 2 aulas simultáneamente
- Si profesor X enseña Inglés en 1º A, sesión 1, no puede enseñar Arts en 2º B, sesión 1
- Validación: UNIQUE KEY (profesorId, dayOfWeek, sessionNumber)
- Cuando especialista entra en aula: tutor queda liberado con status "Refuerzo"/"Coordinación"/"Sesión Libre"

**HC3 - Duplicidad diaria:**
- Una asignatura NO puede aparecer 2+ veces el mismo día para un grupo
- Ejemplo: Inglés máximo 1 sesión por día en 1º A
- Evita que alumnos tengan clase de Inglés lunes 1ª hora AND lunes 3ª hora

**HC4 - Profesor disponible:**
- Profesor solo puede asignarse a sesión si está marcado como disponible (US-PROF-AVAIL)
- Ejemplo: Prof. Smith no disponible Miércoles → no aparece Miércoles en horario

**HC5 - Aula disponible:**
- Aula no puede tener 2 clases simultáneamente (no doble-booking)
- Si aula A está ocupada sesión 1, no se puede asignar otra clase sesión 1

**HC6 - Asignación profesor-asignatura:**
- Profesor solo puede enseñar asignaturas asignadas (US-PROF-ASSIGN)
- Ejemplo: Prof. Smith asignado a [Inglés, Arts] → no puede enseñar Matemáticas

### 2.3 Soft Constraints (deseables pero no obligatorios)

**SC1 - Concentración horaria:**
- Preferencia: minimizar brechas en horario profesor (no dejar huecos)
- Ejemplo: Prof. Smith 1ª+2ª horas mejor que 1ª+5ª horas (menos brechas)

**SC2 - Aulas especializadas:**
- Preferencia: Educación Física en gimnasio, Ciencias en lab, etc.
- Fallback: Si no disponible, usar aula general

**SC3 - Preferencia sesiones:**
- Preferencia: distribuir carga horaria uniformemente (no todo lunes)
- Ejemplo: Inglés 3 sesiones mejor en Lun-Mié-Vie que Lun-Mar-Mié

---

## 3. Especificación Técnica de Algoritmos

### 3.1 Algoritmo CSP (Constraint Satisfaction Problem) - PRINCIPAL

**Características:**
- **Velocidad:** 1-15 segundos típicamente
- **Garantía:** Solución óptima si existe
- **Escalabilidad:** Hasta 50+ cursos

**Cómo funciona:**

```
1. DEFINIR VARIABLES
   Para cada (sesión 1-25, clase 1-N):
     variable = qué asignatura enseñar en esa sesión/clase
   
   Total variables = 25 sesiones × N clases
   Ejemplo: 25 × 10 clases = 250 variables

2. DEFINIR DOMINIO (valores posibles)
   Para cada variable (sesión s, clase c):
     dominio = asignaturas válidas para clase c
   
   Asignatura válida si:
   - Está en restricciones de clase c (US19)
   - Profesor disponible en sesión s (US-PROF-AVAIL)
   - Aula disponible en sesión s
   - Profesor no duplicado en sesión s (HC2)

3. DEFINIR RESTRICCIONES
   HC1: Sum(asignatura X en clase) = sesiones_requeridas[X]
   HC2: For all (s, prof): count(prof en sesión s) ≤ 1
   HC3: For all (día d, clase c, asig a): count(asig en día d) ≤ 1
   HC4: Professor availability check
   HC5: Room availability check
   HC6: Professor can teach subject

4. RESOLVER (Arc Consistency + Backtracking)
   Usar librería OR-Tools (Google) o python-constraint:
   - AC-3 algoritmo poda dominios
   - MAC (Maintaining Arc Consistency) durante backtracking
   - Reduce espacio búsqueda exponencialmente

5. RETORNAR SOLUCIÓN
   Si exitoso: diccionario { (sesión, clase) → asignatura }
   Si falló: NULL + error message
```

**Pseudocódigo:**

```python
from google.ortools.sat.python import cp_model

def generate_with_csp(calendar, restrictions, courses, professors):
    model = cp_model.CpModel()
    
    # Variables: (session, class_id) → subject_id
    # Dominio: 0 a num_subjects
    variables = {}
    for session in range(25):
        for class_id in range(len(courses)):
            variables[(session, class_id)] = model.NewIntVar(
                0, len(subjects)-1, f's{session}_c{class_id}'
            )
    
    # Constraint HC1: Carga horaria exacta
    for subject in subjects:
        for class_id in range(len(courses)):
            if subject in restrictions[class_id]:
                required_sessions = restrictions[class_id][subject]
                # Contar cuántas veces aparece subject en clase
                model.Add(
                    sum([variables[(s, class_id)] == subject.id 
                         for s in range(25)]) 
                    == required_sessions
                )
    
    # Constraint HC2: Ubicación simultánea (profesor no en 2 aulas)
    for session in range(25):
        for prof_id in range(len(professors)):
            # Como máximo 1 clase por sesión para profesor
            model.Add(
                sum([1 for class_id in range(len(courses))
                     if get_professor_for(subject) == prof_id
                     for subject in variables[(session, class_id)]])
                <= 1
            )
    
    # Constraint HC3: Duplicidad diaria
    for day in range(5):  # Lun-Vie
        for class_id in range(len(courses)):
            for subject in subjects:
                # Máximo 1 sesión de subject por día en clase
                sessions_in_day = [s for s in range(25) if get_day(s) == day]
                model.Add(
                    sum([variables[(s, class_id)] == subject.id 
                         for s in sessions_in_day])
                    <= 1
                )
    
    # Constraint HC4: Profesor disponible
    for session in range(25):
        for class_id in range(len(courses)):
            subject = variables[(session, class_id)]
            prof = get_professor_for(subject)
            if not is_professor_available(prof, session):
                model.Add(subject != get_subject_id(subject))
    
    # Constraint HC5: Aula disponible
    # Similar a HC2 pero por aula
    
    # Constraint HC6: Profesor puede enseñar subject
    for session in range(25):
        for class_id in range(len(courses)):
            subject = variables[(session, class_id)]
            prof = get_professor_for(subject)
            if subject not in professor_subjects[prof]:
                model.Add(subject != get_subject_id(subject))
    
    # Resolver
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60  # Timeout
    status = solver.Solve(model)
    
    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        # Retornar solución
        schedule = {}
        for (session, class_id), var in variables.items():
            schedule[(session, class_id)] = solver.Value(var)
        return schedule
    else:
        return None  # No hay solución
```

### 3.2 Algoritmo Backtrack - FALLBACK

**Características:**
- **Velocidad:** 5-120 segundos (más lento pero determinístico)
- **Garantía:** Solución óptima si existe
- **Uso:** Cuando CSP falla o para colegios pequeños

**Cómo funciona:**

```
function backtrack(schedule, restrictions, session_idx):
  if session_idx == 25:  # Todas sesiones asignadas
    if validate_all_constraints(schedule):
      return schedule  # Solución encontrada
    else:
      return NULL
  
  for each class in classes:
    for each subject in valid_subjects(class, session_idx):
      if can_place(subject, class, session_idx):
        schedule[session_idx][class] = subject
        
        # Recursión
        result = backtrack(schedule, restrictions, session_idx + 1)
        if result != NULL:
          return result  # Solución encontrada, propagar arriba
        
        # Backtrack (deshacer)
        schedule[session_idx][class] = NULL
  
  return NULL  # Sin solución posible
```

**Pseudocódigo:**

```python
def generate_with_backtrack(calendar, restrictions, courses, professors):
    schedule = {}  # (session, class_id) → subject_id
    
    def is_valid_placement(session, class_id, subject_id):
        """Validar hard constraints"""
        # HC2: Profesor no duplicado
        prof = get_professor(subject_id)
        for c in range(len(courses)):
            if (session, c) in schedule:
                if get_professor(schedule[(session, c)]) == prof:
                    return False
        
        # HC3: No duplicidad diaria
        day = get_day(session)
        for s in range(25):
            if get_day(s) == day and (s, class_id) in schedule:
                if schedule[(s, class_id)] == subject_id:
                    return False
        
        # HC4: Profesor disponible
        if not is_professor_available(prof, session):
            return False
        
        # HC5: Aula disponible
        if not is_room_available(class_id, session):
            return False
        
        # HC6: Profesor puede enseñar
        if subject_id not in professor_subjects[prof]:
            return False
        
        return True
    
    def backtrack(session_idx):
        """Recursión backtracking"""
        if session_idx == 25:
            # Validar carga horaria (HC1)
            for class_id in range(len(courses)):
                for subject in restrictions[class_id]:
                    required = restrictions[class_id][subject]
                    actual = sum(1 for s in range(25)
                                 if (s, class_id) in schedule
                                 and schedule[(s, class_id)] == subject)
                    if actual != required:
                        return False
            return True
        
        # Probar todas sesiones × clases
        for class_id in range(len(courses)):
            valid_subjects = get_valid_subjects(class_id)
            for subject_id in valid_subjects:
                if is_valid_placement(session_idx, class_id, subject_id):
                    schedule[(session_idx, class_id)] = subject_id
                    
                    if backtrack(session_idx + 1):
                        return True
                    
                    del schedule[(session_idx, class_id)]
        
        return False
    
    # Ejecutar recursión
    if backtrack(0):
        return schedule
    else:
        return None
```

---

## 4. Criterios de Aceptación

### CA1: Mostrar selector de algoritmo

**Dado** que hago clic en "Generar Horarios",  
**Cuando** aparece modal de configuración,  
**Entonces** veo 2 opciones de algoritmo:
- (✓) CSP — Rápido (1-15 segundos)
- ( ) Backtrack — Thorough (5-120 segundos)

Y CSP está seleccionado por defecto.

### CA2: Generar con CSP exitosamente

**Dado** que tengo restricciones válidas configuradas,  
**Cuando** selecciono CSP y presiono "Generar",  
**Entonces** sistema:
1. Inicia generación en background
2. Muestra spinner "Generando horarios... (0/25 sesiones)"
3. En <15 segundos: completa generación
4. Muestra "Horario generado exitosamente" + previsualización
5. Horario cumple HC1-HC6 (validación)

### CA3: Generar con Backtrack exitosamente

**Dado** que tengo restricciones válidas,  
**Cuando** selecciono Backtrack y presiono "Generar",  
**Entonces** sistema:
1. Inicia generación en background
2. Muestra spinner con progreso
3. En <120 segundos: completa generación
4. Muestra "Horario generado exitosamente"
5. Horario identical a CSP (determinístico)

### CA4: Hard Constraint HC1 - Carga horaria exacta

**Dado** que restricción US19 define "Inglés 3 sesiones/semana en 1º A",  
**Cuando** genero horario,  
**Entonces** horario muestra Inglés EXACTAMENTE 3 veces en 1º A
(no 2, no 4, exactamente 3).

**Validación:** `COUNT(subject='Inglés' AND class='1º A') = 3`

### CA5: Hard Constraint HC2 - Ubicación simultánea

**Dado** que Prof. Smith enseña Inglés en 1º A, sesión 1 (lunes, 09:00),  
**Cuando** genero horario,  
**Entonces** Smith NO aparece en ninguna otra clase en sesión 1
(UNIQUE (profesorId, dayOfWeek, sessionNumber) en BD).

**Validación:** `SELECT COUNT(*) FROM schedules WHERE profesorId=5 AND dayOfWeek=1 AND sessionNumber=1 → = 1`

### CA6: Hard Constraint HC3 - Duplicidad diaria

**Dado** que clase 1º A necesita Inglés 3 sesiones/semana,  
**Cuando** genero horario,  
**Entonces** Inglés aparece máximo 1 vez por día
(ejemplo: lunes 1 sesión, martes 1 sesión, miércoles 1 sesión).

**Validación:** `COUNT(subject='Inglés' AND class='1º A' AND day='Monday') ≤ 1`

### CA7: Hard Constraint HC4 - Disponibilidad profesor

**Dado** que Prof. García marcado como NO disponible miércoles (US-PROF-AVAIL),  
**Cuando** genero horario,  
**Entonces** García NO aparece en ninguna clase miércoles.

**Validación:** `SELECT COUNT(*) FROM schedules WHERE profesorId=2 AND dayOfWeek=3 → = 0`

### CA8: Hard Constraint HC5 - Aula disponible

**Dado** que Aula A asignada a clase 1º A (sesión 1),  
**Cuando** genero horario,  
**Entonces** Aula A NO está asignada a otra clase en sesión 1
(sin doble-booking).

**Validación:** `COUNT(DISTINCT classId WHERE roomId='A' AND sessionNumber=1) = 1`

### CA9: Hard Constraint HC6 - Profesor puede enseñar

**Dado** que Prof. Smith asignado a [Inglés, Arts] (US-PROF-ASSIGN),  
**Cuando** genero horario,  
**Entonces** Smith SOLO enseña Inglés o Arts (no Matemáticas, no Ciencias).

**Validación:** `SELECT DISTINCT subject FROM schedules WHERE profesorId=5 → [Inglés, Arts]`

### CA10: Especialista libera tutor con status

**Dado** que especialista (Prof. Smith - Inglés) entra en aula 1º A, sesión 1,  
**Cuando** se coloca en horario,  
**Entonces** tutor de 1º A (Prof. García) en esa sesión se marca:
- Status: "Refuerzo" | "Coordinación" | "Sesión Libre"
- NOT NULL pero con etiqueta especial
- Validación: `SELECT status FROM schedules WHERE classId=1 AND sessionNumber=1 AND role='tutor' → 'Refuerzo'`

### CA11: Concurrencia - sin conflictos de sesiones

**Dado** que múltiples procesos intentan generar horarios simultáneamente,  
**Cuando** se ejecutan en paralelo,  
**Entonces** sistema garantiza:
1. Cada generación tiene su propio contexto (no interfieren)
2. Última generación exitosa reemplaza anterior
3. No hay datos corruptos (transacción atómica)

### CA12: Timeout CSP <60 segundos

**Dado** que CSP configurado con timeout 60 segundos,  
**Cuando** se generan horarios en colegio mediano (10 cursos, 30 clases),  
**Entonces** generación completa en <60 segundos o error "Generación tardó demasiado".

### CA13: Timeout Backtrack <120 segundos

**Dado** que Backtrack configurado con timeout 120 segundos,  
**Cuando** se generan horarios,  
**Entonces** generación completa en <120 segundos o error timeout.

### CA14: Error - Restricciones imposibles

**Dado** que restricciones totales (ej: 50 sesiones) > franjas disponibles (25),  
**Cuando** intento generar,  
**Entonces** sistema retorna error claro:
"Imposible generar horario. Suma restricciones (50) > franjas disponibles (25). Acciones: reducir carga horaria o añadir sesiones."

### CA15: Error - Profesor no disponible suficientemente

**Dado** que Prof. Smith asignado a 20 sesiones/semana pero disponible solo 15 franjas,  
**Cuando** intento generar,  
**Entonces** sistema retorna error:
"Profesor Smith sobrecargado (20 sesiones > 15 franjas disponibles). Edita disponibilidad en US-PROF-AVAIL."

### CA16: UI - Progreso generación en background

**Dado** que generación está en progreso,  
**Cuando** veo UI,  
**Entonces** spinner muestra:
- Porcentaje: "Generando horarios... 45% (11/25 sesiones)"
- Status: "CSP" o "Backtrack" según algoritmo
- Botón "Cancelar" (detiene job)

### CA17: UI - Visualización previa horario

**Dado** que generación completada exitosamente,  
**Cuando** veo resultados,  
**Entonces** aparece tabla:
- Encabezados: Lunes | Martes | Miércoles | Jueves | Viernes
- Filas: Sesión 1-6 (o 1-8 según calendario)
- Celdas: "Asignatura (Profesor)" en cada sesión/clase
- Colores: Diferente color por asignatura para claridad

### CA18: Acción - Descargar PDF horario

**Dado** que horario generado,  
**Cuando** presiono "Descargar PDF",  
**Entonces** sistema genera PDF con:
- Encabezado: Nombre colegio, curso, semana (fecha)
- Tabla horario (Lun-Vie × sesiones)
- Leyenda: colores = asignaturas
- Descarga en navegador

### CA19: Acción - Editar restricciones y regenerar

**Dado** que horario generado pero insatisfecho,  
**Cuando** presiono "Editar restricciones",  
**Entonces** navega a US19 (restricciones)
Y al guardar cambios, permite regenerar desde mismo modal
(sin cerrar UI).

### CA20: Permisos - solo jefe de estudios/director

**Dado** que soy profesor,  
**Cuando** intento acceder a "Generar Horarios",  
**Entonces** error 403 Forbidden + botón no visible en UI.

---

## 5. Requisitos Técnicos

### 5.1 Backend (AdonisJS)

**Rutas:**

```typescript
// POST /api/schedule/generate — Iniciar generación
Route.post('schedule/generate', 'ScheduleController.generate')
  .middleware(['auth', 'can:jefe_estudios,director'])

// GET /api/schedule/generate/:jobId — Polling estado
Route.get('schedule/generate/:jobId', 'ScheduleController.status')
  .middleware(['auth'])

// GET /api/schedule/:scheduleId — Obtener horario generado
Route.get('schedule/:scheduleId', 'ScheduleController.show')
  .middleware(['auth'])

// DELETE /api/schedule/generate/:jobId — Cancelar generación
Route.delete('schedule/generate/:jobId', 'ScheduleController.cancel')
  .middleware(['auth', 'can:jefe_estudios,director'])
```

**Controllers:**

```typescript
// ScheduleController.ts

async generate(ctx: HttpContext) {
  // 1. Validar permiso
  if (!ctx.auth.user.can('jefe_estudios', 'director')) {
    return ctx.response.forbidden()
  }
  
  // 2. Obtener algoritmo del request
  const { algorithm = 'CSP' } = ctx.request.all()
  if (!['CSP', 'BACKTRACK'].includes(algorithm)) {
    return ctx.response.badRequest({ error: 'Invalid algorithm' })
  }
  
  // 3. Validar prerequisitos (US-BASE, US-SUBJECT, US19, etc.)
  const calendar = await Calendar.find(...)
  if (!calendar) {
    return ctx.response.unprocessableEntity({
      error: 'Calendario base no configurado. Completa US-BASE primero.'
    })
  }
  
  const restrictions = await Restriction.where('status', 'ACTIVE').fetch()
  if (restrictions.length === 0) {
    return ctx.response.unprocessableEntity({
      error: 'Sin restricciones configuradas. Completa US19 primero.'
    })
  }
  
  // 4. Validar restricciones no imposibles
  const totalSessions = await calculateTotalSessions(restrictions)
  if (totalSessions > 25) {
    return ctx.response.unprocessableEntity({
      error: `Restricciones imposibles. Total ${totalSessions} > 25 franjas disponibles.`
    })
  }
  
  // 5. Crear job en BullMQ
  const job = await ScheduleGenerationJob.dispatch({
    calendarId: calendar.id,
    algorithm: algorithm,
    userId: ctx.auth.user.id
  })
  
  // 6. Retornar jobId
  return {
    jobId: job.id,
    status: 'PENDING',
    algorithm: algorithm
  }
}

async status(ctx: HttpContext) {
  const job = await ScheduleGenerationJob.find(ctx.params.jobId)
  if (!job) {
    return ctx.response.notFound()
  }
  
  if (job.status === 'COMPLETED') {
    return {
      status: 'COMPLETED',
      scheduleId: job.scheduleId,
      generatedAt: job.completedAt
    }
  } else if (job.status === 'FAILED') {
    return {
      status: 'FAILED',
      error: job.error,
      errorType: job.errorType  // 'INFEASIBLE', 'TIMEOUT', 'INTERNAL'
    }
  } else {
    return {
      status: 'PENDING',
      progress: job.progress,  // 0-100
      currentSession: job.currentSession,
      algorithm: job.algorithm
    }
  }
}

async show(ctx: HttpContext) {
  const schedule = await Schedule.query()
    .where('id', ctx.params.scheduleId)
    .preload('entries', (query) => {
      query.preload('subject').preload('professor').preload('class')
    })
    .first()
  
  if (!schedule) {
    return ctx.response.notFound()
  }
  
  return formatScheduleForUI(schedule)
}

async cancel(ctx: HttpContext) {
  const job = await ScheduleGenerationJob.find(ctx.params.jobId)
  if (!job) {
    return ctx.response.notFound()
  }
  
  if (job.status === 'PENDING') {
    job.status = 'CANCELLED'
    await job.save()
    return { status: 'CANCELLED' }
  }
  
  return ctx.response.unprocessableEntity({
    error: 'Job no está en estado PENDING'
  })
}
```

### 5.2 Worker (BullMQ Job)

```typescript
// jobs/ScheduleGenerationJob.ts

import { JobsContract } from '@adonisjs/core/contracts'
import ScheduleGenerator from 'App/Services/ScheduleGenerator'

export default class ScheduleGenerationJob implements JobsContract {
  name = 'schedule.generation'
  
  async handle(job: Job<{ calendarId: number, algorithm: string }>) {
    const { calendarId, algorithm } = job.data
    
    try {
      // 1. Obtener datos
      const calendar = await Calendar.find(calendarId)
      const restrictions = await Restriction.where('status', 'ACTIVE').fetch()
      const courses = await Course.fetch()
      const professors = await Professor.preload('subjects').fetch()
      const availabilities = await ProfessorAvailability.fetch()
      
      // 2. Ejecutar algoritmo
      let schedule
      if (algorithm === 'CSP') {
        schedule = await ScheduleGenerator.generateWithCSP({
          calendar,
          restrictions,
          courses,
          professors,
          availabilities
        })
      } else {
        schedule = await ScheduleGenerator.generateWithBacktrack({
          calendar,
          restrictions,
          courses,
          professors,
          availabilities
        })
      }
      
      if (!schedule) {
        throw new ScheduleGenerationError(
          'INFEASIBLE',
          'No se encontró solución válida con restricciones actuales.'
        )
      }
      
      // 3. Guardar en BD (transacción atómica)
      const savedSchedule = await Database.transaction(async (trx) => {
        const sched = await Schedule.create(
          { calendarId, algorithm, generatedAt: DateTime.now() },
          { client: trx }
        )
        
        // Guardar entries (cada sesión × clase)
        const entries = schedule.map((entry) => ({
          scheduleId: sched.id,
          classId: entry.classId,
          sessionNumber: entry.sessionNumber,
          dayOfWeek: entry.dayOfWeek,
          subjectId: entry.subjectId,
          professorId: entry.professorId,
          roomId: entry.roomId
        }))
        
        await ScheduleEntry.createMany(entries, { client: trx })
        return sched
      })
      
      // 4. Marcar job COMPLETED
      job.data.scheduleId = savedSchedule.id
      return {
        status: 'COMPLETED',
        scheduleId: savedSchedule.id
      }
      
    } catch (error) {
      if (error instanceof ScheduleGenerationError) {
        return {
          status: 'FAILED',
          errorType: error.type,
          error: error.message
        }
      } else if (error.message.includes('timeout')) {
        return {
          status: 'FAILED',
          errorType: 'TIMEOUT',
          error: `Generación excedió timeout (${algorithm === 'CSP' ? '60s' : '120s'}). Intenta con menos restricciones.`
        }
      } else {
        return {
          status: 'FAILED',
          errorType: 'INTERNAL',
          error: error.message
        }
      }
    }
  }
}
```

### 5.3 Service: ScheduleGenerator

```typescript
// services/ScheduleGenerator.ts

import { ScheduleGenerationError } from 'App/Exceptions'

export default class ScheduleGenerator {
  
  static async generateWithCSP(context: GenerationContext) {
    const { calendar, restrictions, courses, professors, availabilities } = context
    
    // Implementar CSP con OR-Tools
    // (ver pseudocódigo en sección 3.1)
    
    // Retornar array de ScheduleEntry
    return entries
  }
  
  static async generateWithBacktrack(context: GenerationContext) {
    const { calendar, restrictions, courses, professors, availabilities } = context
    
    // Implementar Backtracking con recursión
    // (ver pseudocódigo en sección 3.2)
    
    return entries
  }
}

// Helper: Validar hard constraints
export async function validateHardConstraints(schedule: ScheduleEntry[]) {
  const errors = []
  
  // HC1: Carga horaria exacta
  for (const [classId, restrictions] of Object.entries(classRestrictions)) {
    for (const [subject, required] of Object.entries(restrictions)) {
      const actual = schedule.filter(e => 
        e.classId === classId && e.subjectId === subject
      ).length
      if (actual !== required) {
        errors.push(`HC1 violation: ${subject} en clase ${classId}`)
      }
    }
  }
  
  // HC2: Ubicación simultánea
  for (const session of range(25)) {
    const professors = new Set()
    for (const entry of schedule.filter(e => e.sessionNumber === session)) {
      if (professors.has(entry.professorId)) {
        errors.push(`HC2 violation: Professor ${entry.professorId} en 2 clases sesión ${session}`)
      }
      professors.add(entry.professorId)
    }
  }
  
  // HC3: Duplicidad diaria
  for (const classId of range(numClasses)) {
    for (const day of range(5)) {
      const subjects = new Set()
      for (const entry of schedule.filter(e => 
        e.classId === classId && getDayOfWeek(e.sessionNumber) === day
      )) {
        if (subjects.has(entry.subjectId)) {
          errors.push(`HC3 violation: ${entry.subjectId} 2x day ${day} en clase ${classId}`)
        }
        subjects.add(entry.subjectId)
      }
    }
  }
  
  // HC4: Disponibilidad profesor
  // HC5: Aula disponible
  // HC6: Profesor puede enseñar
  // ... (similar)
  
  return errors.length === 0
}
```

### 5.4 Frontend (React)

```typescript
// Components/GenerateScheduleModal.tsx

import { useState } from 'react'
import { Modal, Button, Radio, Spinner, Alert } from 'shadcn/ui'

export function GenerateScheduleModal({ isOpen, onClose, onSuccess }) {
  const [algorithm, setAlgorithm] = useState('CSP')
  const [isGenerating, setIsGenerating] = useState(false)
  const [jobId, setJobId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  
  async function handleGenerateSchedule() {
    setIsGenerating(true)
    setError(null)
    
    try {
      // 1. Iniciar generación
      const response = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ algorithm })
      })
      
      if (!response.ok) {
        const data = await response.json()
        setError(data.error)
        return
      }
      
      const { jobId: id } = await response.json()
      setJobId(id)
      
      // 2. Polling cada 2 segundos
      const pollInterval = setInterval(async () => {
        const statusResponse = await fetch(`/api/schedule/generate/${id}`)
        const { status, error: apiError, progress: p, scheduleId } = await statusResponse.json()
        
        if (status === 'COMPLETED') {
          clearInterval(pollInterval)
          setIsGenerating(false)
          onSuccess(scheduleId)
          onClose()
        } else if (status === 'FAILED') {
          clearInterval(pollInterval)
          setIsGenerating(false)
          setError(apiError)
        } else {
          setProgress(p || 0)
        }
      }, 2000)
      
    } catch (err) {
      setError(err.message)
      setIsGenerating(false)
    }
  }
  
  function handleCancel() {
    if (jobId && isGenerating) {
      fetch(`/api/schedule/generate/${jobId}`, { method: 'DELETE' })
      setIsGenerating(false)
    }
    onClose()
  }
  
  return (
    <Modal isOpen={isOpen} onClose={handleCancel}>
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-4">Generar Horarios</h2>
        
        {!isGenerating ? (
          <>
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">Algoritmo:</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="CSP"
                    checked={algorithm === 'CSP'}
                    onChange={(e) => setAlgorithm(e.target.value)}
                  />
                  <span className="ml-2">
                    CSP (Rápido: 1-15 segundos) — Recomendado
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="BACKTRACK"
                    checked={algorithm === 'BACKTRACK'}
                    onChange={(e) => setAlgorithm(e.target.value)}
                  />
                  <span className="ml-2">
                    Backtrack (Detallado: 5-120 segundos)
                  </span>
                </label>
              </div>
            </div>
            
            {error && (
              <Alert variant="destructive" className="mb-4">
                {error}
              </Alert>
            )}
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button onClick={handleGenerateSchedule}>
                Generar
              </Button>
            </div>
          </>
        ) : (
          <>
            <Spinner className="mb-4" />
            <p className="mb-2">Generando horarios... {progress}%</p>
            <div className="w-full bg-gray-200 rounded h-2 mb-4">
              <div
                className="bg-blue-500 h-2 rounded transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <Button
              variant="outline"
              onClick={handleCancel}
              className="w-full"
            >
              Cancelar
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

// Components/ScheduleView.tsx
export function ScheduleView({ scheduleId }) {
  const [schedule, setSchedule] = useState(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    fetch(`/api/schedule/${scheduleId}`)
      .then(r => r.json())
      .then(data => {
        setSchedule(data)
        setLoading(false)
      })
  }, [scheduleId])
  
  if (loading) return <Spinner />
  
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Horario Generado</h2>
      
      {/* Tabla horario */}
      <table className="w-full border-collapse border">
        <thead>
          <tr>
            <th className="border p-2">Sesión</th>
            <th className="border p-2">Lunes</th>
            <th className="border p-2">Martes</th>
            <th className="border p-2">Miércoles</th>
            <th className="border p-2">Jueves</th>
            <th className="border p-2">Viernes</th>
          </tr>
        </thead>
        <tbody>
          {range(6).map(session => (
            <tr key={session}>
              <td className="border p-2">Sesión {session + 1}</td>
              {range(5).map(day => {
                const entry = schedule.entries.find(
                  e => e.sessionNumber === session && e.dayOfWeek === day
                )
                return (
                  <td
                    key={`${session}-${day}`}
                    className="border p-2 bg-blue-100"
                  >
                    {entry ? (
                      <div>
                        <strong>{entry.subject.name}</strong>
                        <br />
                        <small>{entry.professor.firstName}</small>
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      
      {/* Botones acciones */}
      <div className="mt-6 flex gap-2">
        <Button onClick={() => downloadPDF(scheduleId)}>
          Descargar PDF
        </Button>
        <Button variant="outline" onClick={() => /* editar */ }>
          Editar Restricciones
        </Button>
        <Button variant="outline" onClick={() => /* generar de nuevo */ }>
          Generar de Nuevo
        </Button>
      </div>
    </div>
  )
}
```

### 5.5 Base de Datos

**Nuevas tablas:**

```sql
-- Tabla: schedules (horario generado)
CREATE TABLE schedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  calendarId INT NOT NULL FK→calendars(id),
  algorithm ENUM('CSP', 'BACKTRACK'),
  generatedAt TIMESTAMP,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX(calendarId),
  FOREIGN KEY (calendarId) REFERENCES calendars(id) ON DELETE CASCADE
);

-- Tabla: schedule_entries (cada sesión de clase)
CREATE TABLE schedule_entries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  scheduleId INT NOT NULL FK→schedules(id),
  classId INT NOT NULL FK→classes(id),
  sessionNumber INT NOT NULL (1-8),
  dayOfWeek INT NOT NULL (1-5, Lun-Vie),
  subjectId INT NOT NULL FK→subjects(id),
  professorId INT NOT NULL FK→professors(id),
  roomId INT nullable FK→rooms(id),
  roleType ENUM('tutor', 'specialist', 'support') DEFAULT 'tutor',
  status ENUM('active', 'support', 'coordination', 'free') DEFAULT 'active',
  createdAt TIMESTAMP,
  UNIQUE KEY unique_session (scheduleId, classId, sessionNumber),
  UNIQUE KEY unique_professor_location (professorId, dayOfWeek, sessionNumber),  -- HC2
  INDEX(scheduleId),
  INDEX(classId),
  INDEX(professorId),
  FOREIGN KEY (scheduleId) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (classId) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (subjectId) REFERENCES subjects(id) ON DELETE RESTRICT,
  FOREIGN KEY (professorId) REFERENCES professors(id) ON DELETE RESTRICT,
  FOREIGN KEY (roomId) REFERENCES rooms(id) ON DELETE SET NULL
);

-- Tabla: schedule_generation_jobs (BullMQ tracking)
CREATE TABLE schedule_generation_jobs (
  id VARCHAR(255) PRIMARY KEY,
  calendarId INT NOT NULL,
  algorithm ENUM('CSP', 'BACKTRACK'),
  status ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'),
  scheduleId INT nullable,
  progress INT (0-100) DEFAULT 0,
  currentSession INT,
  error TEXT nullable,
  errorType VARCHAR(50) nullable (INFEASIBLE, TIMEOUT, INTERNAL),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completedAt TIMESTAMP nullable,
  INDEX(status),
  FOREIGN KEY (scheduleId) REFERENCES schedules(id) ON DELETE SET NULL
);
```

---

## 6. Excepciones y Manejo de Errores

### Excepción: ScheduleGenerationError

```typescript
export class ScheduleGenerationError extends Exception {
  public readonly type: 'INFEASIBLE' | 'TIMEOUT' | 'INTERNAL'
  
  constructor(type: string, message: string) {
    super(message)
    this.type = type
  }
}
```

### Escenarios de Error

**Escenario 1: Restricciones imposibles (INFEASIBLE)**
```
Detección: Suma total de sesiones requeridas > 25 franjas disponibles
Error message: "Imposible generar horario. Restricciones totales (45 sesiones) > franjas disponibles (25). 
               Acciones: (1) Reduce carga en US19, (2) Añade más sesiones en US-BASE, (3) Añade aulas."
```

**Escenario 2: Profesor sobrecargado (INFEASIBLE)**
```
Detección: Profesor asignado a más sesiones que disponibilidad
Error message: "Profesor García sobrecargado (30 sesiones > 20 franjas disponibles). 
               Edita disponibilidad en US-PROF-AVAIL o reduce asignaciones en US-PROF-ASSIGN."
```

**Escenario 3: Timeout CSP (TIMEOUT)**
```
Detección: CSP no encuentra solución en <60 segundos
Error message: "Generación de horarios con CSP tardó >60 segundos. 
               Intenta: (1) Usar Backtrack, (2) Simplificar restricciones, (3) Aumentar aulas"
```

**Escenario 4: Timeout Backtrack (TIMEOUT)**
```
Detección: Backtrack no encuentra solución en <120 segundos
Error message: "Generación de horarios con Backtrack tardó >120 segundos. 
               Problema muy complejo. Simplifica restricciones significativamente."
```

**Escenario 5: Error interno (INTERNAL)**
```
Detección: Error no predicho (BD, librería, etc.)
Error message: "Error interno durante generación. Contacta administrador."
Stack trace: Loguear en servidor para debugging
```

---

## 7. Transacciones y Concurrencia

### Garantías de Consistencia

**Lectura de datos:**
- No locking (read-only)
- Snapshot isolation para ver datos consistentes

**Escritura de horario:**
- Transacción atómica: si falla cualquier INSERT, ROLLBACK completo
- Secuencia: CREATE schedule → INSERT entries → COMMIT
- Si error: ROLLBACK automático, job marcado FAILED

**Concurrencia simultánea:**
- Múltiples jobs pueden generarse en paralelo
- Cada job independiente (no interfieren)
- Última generación exitosa reemplaza anterior (app logic)
- BD ACID garantiza no hay corrupción de datos

**Código:**

```typescript
const savedSchedule = await Database.transaction(async (trx) => {
  // Crear schedule
  const sched = await Schedule.create(
    { calendarId, algorithm, generatedAt: DateTime.now() },
    { client: trx }
  )
  
  // Insertar entries
  await ScheduleEntry.createMany(entries, { client: trx })
  
  // Si llegamos aquí: COMMIT automático
  // Si error en cualquier punto: ROLLBACK automático
  return sched
})
```

---

## 8. Testing

### Test 1: Colegio pequeño - CSP exitoso

```typescript
test('Generate schedule with CSP - Small school', async () => {
  // Setup: 5 cursos, 2 clases, 10 asignaturas, restricciones válidas
  const { jobId } = await api.post('/api/schedule/generate', { algorithm: 'CSP' })
  
  // Poll hasta COMPLETED
  let status = 'PENDING'
  while (status === 'PENDING') {
    const response = await api.get(`/api/schedule/generate/${jobId}`)
    status = response.status
    if (response.status === 'COMPLETED') {
      scheduleId = response.scheduleId
    }
  }
  
  // Validar hard constraints
  const schedule = await api.get(`/api/schedule/${scheduleId}`)
  validateHardConstraints(schedule).should.be.true
  
  // Validar ejecución <15s
  const duration = Date.now() - startTime
  duration.should.be.lessThan(15000)
})
```

### Test 2: Restricciones imposibles - Error claro

```typescript
test('Generate schedule with impossible restrictions', async () => {
  // Setup: 50 sesiones en 25 franjas (imposible)
  const { status, error } = await api.post('/api/schedule/generate', { algorithm: 'CSP' })
  
  status.should.equal('FAILED')
  error.should.include('Imposible generar horario')
  error.should.include('50')
  error.should.include('25')
})
```

### Test 3: HC2 - Ubicación simultánea

```typescript
test('HC2: Professor cannot be in 2 classrooms at same session', async () => {
  const schedule = await generateAndFetch()
  
  // Validar no hay 2 sesiones del mismo profesor en misma hora
  const entries = schedule.entries
  const byProfessor = groupBy(entries, 'professorId')
  
  for (const [profId, prof_entries] of Object.entries(byProfessor)) {
    const bySession = groupBy(prof_entries, 'sessionNumber')
    for (const [session, sessions] of Object.entries(bySession)) {
      sessions.length.should.equal(1)  // Máximo 1 por sesión
    }
  }
})
```

### Test 4: HC3 - Duplicidad diaria

```typescript
test('HC3: Subject cannot appear 2x same day in class', async () => {
  const schedule = await generateAndFetch()
  
  // Por cada clase, validar no hay 2 sesiones misma asignatura mismo día
  const byClass = groupBy(schedule.entries, 'classId')
  for (const [classId, class_entries] of Object.entries(byClass)) {
    const bySubjectDay = {}
    for (const entry of class_entries) {
      const key = `${entry.subjectId}_${entry.dayOfWeek}`
      bySubjectDay[key] = (bySubjectDay[key] || 0) + 1
      bySubjectDay[key].should.be.lessThanOrEqual(1)
    }
  }
})
```

---

## 9. Documentos de Referencia

**Prerequisitos completados:**
- ✅ `docs/US-BASE_ConfigurarCalendarioBase_BORRADOR.md`
- ✅ `docs/US-SUBJECT_GestionarAsignaturas_AMPLIADA_BORRADOR.md`
- ✅ `docs/US19_CrearRestriccionCargaHoraria_BORRADOR.md`
- ✅ `docs/US20_VerRestriccionesActivas_BORRADOR.md`
- ✅ `docs/US-PROF-AVAIL_ConfigurarDisponibilidad_BORRADOR.md`
- ✅ `docs/US-PROF-ASSIGN_AsignarAsignaturas_BORRADOR.md`
- ✅ `docs/US-PROF-SUMMARY_ResumenCarga_BORRADOR.md`

**Research algoritmo:**
- ✅ `docs/RESEARCH_ALGORITMOS_GENERACION_HORARIOS.md`

**Implementación:**
- `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (este documento)

---

## 10. Timeline de Implementación

| Fase | Duración | Entregable |
|------|----------|-----------|
| **Backend APIs** | 2-3 días | POST/GET /api/schedule/generate, ScheduleController, worker setup |
| **CSP Algorithm** | 3-4 días | Implementar con OR-Tools, validación hard constraints |
| **Backtrack Algorithm** | 2-3 días | Implementar fallback, testing |
| **Frontend UI** | 2-3 días | Modal selector, spinner, visualización tabla, descarga PDF |
| **Testing & Debugging** | 2-3 días | Unit tests, integration tests, E2E tests |
| **Deployment & Monitoring** | 1-2 días | Setup BullMQ worker, logs, alertas |
| **TOTAL** | ~12-18 días | Fase 4 completa |

---

## 11. Resumen Ejecutivo

| Aspecto | Especificación |
|--------|-----------------|
| **Algoritmo Principal** | CSP (1-15s, robusto) |
| **Algoritmo Fallback** | Backtrack (5-120s, determinístico) |
| **UI Selector** | Modal con 2 opciones, CSP por defecto |
| **Hard Constraints** | HC1-6 (carga, ubicación, duplicidad, disponibilidad, aula, profesor-subject) |
| **Soft Constraints** | SC1-3 (concentración, aulas especializadas, distribución uniforme) |
| **Concurrencia** | BullMQ worker, transacciones atómicas, sin conflictos |
| **Timeout CSP** | 60 segundos |
| **Timeout Backtrack** | 120 segundos |
| **Escalabilidad** | Hasta 50+ cursos (CSP) |
| **CAs** | 20 criterios de aceptación |
| **Testing** | Unit, integration, E2E tests incluidos |

