# Research: Algoritmos para Generación de Horarios

**Objetivo:** Evaluar y elegir el mejor algoritmo para generar horarios escolares respetando restricciones (carga horaria, disponibilidad profesor, no duplicidad)

**Fecha:** 31 de julio de 2026  
**Status:** 🔵 RESEARCH COMPLETO - Recomendación: CSP + Backtrack (dual configurables)

---

## 1. Problema a Resolver

**Entrada:**
- Calendario base: 25 sesiones útiles/semana (6 sesiones × 45 min)
- Restricciones: Inglés 3 sesiones, Lengua 5, Matemáticas 5, Educación Física 2, Ciencias 2, Arte 2, Cívica 1
- Profesores asignados a clases (cada profesor enseña N asignaturas)
- Aulas disponibles (capacidad, tipo)

**Salida:**
- Horario semanal (Lunes-Viernes × Sesión 1-6)
- Cada sesión: (Clase, Asignatura, Profesor, Aula)
- Sin solapamientos, profesores no en 2 clases simultáneamente

**Restricciones (Hard constraints - deben cumplirse):**
- Cada asignatura: exactamente N sesiones/semana
- Cada profesor: máximo 8 horas/día
- Profesor no puede estar en 2 clases mismo tiempo
- Aula disponible (no doble booking)
- No duplicidad: asignatura máximo 1 vez/día por clase

**Restricciones (Soft constraints - deseable):**
- Profesor disponible en horarios especificados
- Aulas especializadas (laboratorio para ciencias, gimnasio para EF)
- Concentración: minimizar brechas en horario profesor

**Complejidad:**
- 5 cursos × 2-3 clases/curso = 10-15 clases
- 25 sesiones/semana/clase = 250-375 sesiones totales
- 10-15 profesores
- 5-10 asignaturas
- 3-5 aulas

---

## 2. Opciones de Algoritmos

### Opción A: Backtracking (Búsqueda Exhaustiva)

**Concepto:**
```
function generar_horario(clases, restricciones, sesion_actual):
  if sesion_actual == total_sesiones:
    return horario_completo  # Éxito
  
  for cada_asignatura en asignaturas:
    if puede_colocar(asignatura, sesion_actual, restricciones):
      colocar(asignatura, sesion_actual)
      resultado = generar_horario(clases, restricciones, sesion_actual+1)
      if resultado:
        return resultado
      deshacer(asignatura, sesion_actual)
  
  return NULL  # No hay solución
```

**Ventajas:**
- ✅ Garantiza solución óptima si existe
- ✅ Simple de implementar
- ✅ Fácil de debuggear
- ✅ Determinístico

**Desventajas:**
- ❌ Lentísimo con muchas variables (exponencial O(n^m))
- ❌ No escala bien (>15 clases puede tardar minutos)
- ❌ Si no hay solución, tarda igual (no sabes si es factible)

**Performance:**
```
5 cursos × 2 clases = 10 clases
25 sesiones × 10 = 250 sesiones
Peor caso: 250! combinaciones = INFINITO

Estimado: 5-30 segundos (pequeños colegios)
          30+ minutos (colegios grandes)
```

**Ejemplo implementación:**
```python
def backtrack(schedule, restrictions, class_id, session_num):
    if session_num == 25:  # 25 sesiones/semana
        if validate_all(schedule):
            return schedule
        return None
    
    class_schedule = schedule[class_id]
    for subject in subjects:
        if can_place(class_id, subject, session_num, restrictions):
            class_schedule[session_num] = subject
            # Validar profesor disponible
            if is_professor_free(subject.professor, session_num):
                result = backtrack(schedule, restrictions, class_id, session_num+1)
                if result:
                    return result
            class_schedule[session_num] = None
    
    return None
```

---

### Opción B: Constraint Satisfaction Problem (CSP)

**Concepto:**
```
Variables: cada (sesión, clase) = qué asignatura
Dominio: conjunto de asignaturas válidas para esa sesión/clase
Restricciones: 
  - Cada asignatura exactamente N veces
  - Profesor no en 2 lugares
  - Aula disponible
  - Sin duplicidad/día

Solver: Arc Consistency + Backtracking optimizado
(algoritmos como AC-3, MAC, etc.)
```

**Ventajas:**
- ✅ Optimizado para restricciones complejas
- ✅ Arc Consistency poda el espacio búsqueda
- ✅ Mucho más rápido que backtracking puro
- ✅ Herramientas disponibles (python-constraint, OR-Tools)
- ✅ Escala bien (hasta 50+ variables)

**Desventajas:**
- ⚠️ Más complejo de implementar
- ⚠️ Menos control fino que backtracking
- ⚠️ Requiere librería externa

**Performance:**
```
5-10 cursos: 1-5 segundos
10-15 cursos: 5-15 segundos
15+ cursos: 15-60 segundos (con optimizaciones)
```

**Ejemplo librería (Python):**
```python
from constraint import Problem, AllDifferentConstraint

problem = Problem()

# Variables: cada sesión/clase
for session in range(25):
  for clase in range(10):
    problem.addVariable((session, clase), subjects)

# Restricciones
# 1. Cada asignatura exactamente N veces
for subject in subjects:
  problem.addConstraint(
    lambda *args: sum(1 for x in args if x == subject) == subject.sessions,
    [(s, c) for s in range(25) for c in range(10)]
  )

# 2. Profesor no en 2 clases
for session in range(25):
  for class1, class2 in combinations(range(10), 2):
    problem.addConstraint(
      lambda x, y: x.professor != y.professor,
      [(session, class1), (session, class2)]
    )

# Resolver
solutions = problem.getSolutions()
```

---

### Opción C: Algoritmo Genético (Evolución)

**Concepto:**
```
1. Generar población random (100 horarios inválidos)
2. Evaluar fitness (qué tan bien cumplen restricciones)
3. Seleccionar mejores 50%
4. Cruzar + Mutar → nueva generación
5. Repetir hasta convergencia o N generaciones
```

**Ventajas:**
- ✅ Muy rápido (segundos)
- ✅ Maneja bien restricciones soft
- ✅ Puede encontrar múltiples soluciones
- ✅ Escalable (N generaciones × población size)

**Desventajas:**
- ❌ No garantiza solución óptima
- ❌ Puede quedar atrapado en local minima
- ❌ No determinístico (resultados varían)
- ❌ Complejo de debuggear

**Performance:**
```
50 generaciones × 100 población = 5000 iteraciones
Estimado: 0.5-2 segundos (muy rápido)
```

**Ejemplo:**
```python
import random

def generate_random_schedule():
    return {(session, clase): random.choice(subjects) for session in range(25) for clase in range(10)}

def fitness(schedule):
    score = 0
    # Penalizar violaciones
    for subject in subjects:
        count = sum(1 for s in schedule.values() if s == subject)
        score -= abs(count - subject.sessions) ** 2
    # Penalizar profesor en 2 clases
    for session in range(25):
        professors = [schedule[(session, c)].professor for c in range(10)]
        score -= len(professors) - len(set(professors))
    return score

def evolve(population, generations=50):
    for gen in range(generations):
        # Evaluar
        fitness_scores = [(schedule, fitness(schedule)) for schedule in population]
        # Seleccionar mejores 50%
        fitness_scores.sort(key=lambda x: x[1], reverse=True)
        best = [s[0] for s in fitness_scores[:len(population)//2]]
        # Cruzar + Mutar
        population = best.copy()
        for _ in range(len(population)//2):
            parent1, parent2 = random.sample(best, 2)
            child = crossover(parent1, parent2)
            child = mutate(child)
            population.append(child)
    return best[0]
```

---

### Opción D: Integer Linear Programming (ILP)

**Concepto:**
```
Modelar como problema de optimización lineal:

Variables binarias: x[session][clase][subject] = 1 si asignatura en esa sesión/clase
Objetivo: Minimizar violaciones soft constraints
Sujeto a: 
  - Hard constraints como ecuaciones lineales
  - Soft constraints como términos en objetivo

Solver: CPLEX, Gurobi, CBC (open-source)
```

**Ventajas:**
- ✅ Solución matemáticamente óptima
- ✅ Resuelve restricciones complejas
- ✅ Muy robusto

**Desventajas:**
- ❌ Lentísimo (minutos para instancias medianas)
- ❌ Requiere licencia comercial (Gurobi, CPLEX)
- ❌ Overkill para este problema
- ❌ Muy complejo de implementar

**Performance:**
```
Instancias pequeñas: 10-30 segundos
Instancias medianas: 1-5 minutos
Instancias grandes: 5+ minutos
```

**Recomendación:** NO usar (ILP es para problemas mucho más complejos)

---

## 3. Comparativa

| Criterio | Backtrack | CSP | Genético | ILP |
|----------|-----------|-----|----------|-----|
| **Velocidad** | Lento (5-30s) | Rápido (1-15s) | Muy rápido (0.5-2s) | Muy lento (1-5m) |
| **Óptimo garantizado** | ✅ Sí | ✅ Sí | ❌ No | ✅ Sí |
| **Complejidad implementación** | ⭐ Baja | ⭐⭐ Media | ⭐⭐⭐ Alta | ⭐⭐⭐⭐ Muy alta |
| **Escalabilidad** | Pobre | Buena | Excelente | Pobre |
| **Determinístico** | ✅ Sí | ✅ Sí | ❌ No | ✅ Sí |
| **Maneja soft constraints** | Difícil | Fácil | ✅ Excelente | ✅ Excelente |
| **Debug** | ✅ Fácil | Medio | Difícil | Muy difícil |
| **Ideal para MVP** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ❌ |

---

## 4. Recomendación: CSP + Backtrack (Dual Configurables)

**Decisión:** Implementar AMBOS como opciones configurables

### 4.1 Por qué CSP como principal

```
- Mejor balance velocidad/complejidad
- Maneja restricciones complejas bien
- Escalable a colegios grandes
- Librería Python (python-constraint) es simple
- OR-Tools (Google) es robusto y open-source
```

### 4.2 Por qué Backtrack como fallback

```
- Más fácil de entender/debuggear
- Garantiza solución óptima si existe
- Para colegios pequeños es suficiente
- User puede elegir según necesidad
```

### 4.3 Implementación (Pseudocódigo)

```
setting: schedule_algorithm = 'CSP' | 'BACKTRACK'

function generate_schedule(calendar, restrictions, courses, professors):
  if schedule_algorithm == 'CSP':
    return generate_with_csp(calendar, restrictions, courses, professors)
  else:
    return generate_with_backtrack(calendar, restrictions, courses, professors)

function generate_with_csp():
  # Usar OR-Tools o python-constraint
  # Más rápido, mejor para instancias grandes
  # Timeout: 60 segundos

function generate_with_backtrack():
  # Recursión simple + poda
  # Más lento pero determinístico
  # Timeout: 120 segundos
```

---

## 5. Arquitectura de Implementación

### 5.1 Backend (AdonisJS)

```typescript
// routes/api.ts
Route.post('schedule/generate', 'ScheduleController.generate')
  .middleware(['auth', 'can:jefe_estudios,director'])

// controllers/ScheduleController.ts
async generate(ctx: HttpContext) {
  // 1. Obtener calendario base
  const calendar = await Calendar.find(...)
  
  // 2. Obtener restricciones
  const restrictions = await Restriction.where('status', 'ACTIVE').fetch()
  
  // 3. Obtener cursos, clases, profesores
  const courses = await Course.fetch()
  const classes = await Class.fetch()
  const professors = await Professor.fetch()
  
  // 4. Elegir algoritmo (de setting)
  const algorithm = await Setting.getValue('schedule_algorithm')
  
  // 5. Llamar algoritmo (en worker/background)
  const job = await ScheduleGenerationJob.dispatch({
    calendarId: calendar.id,
    algorithm: algorithm,
    restrictions: restrictions.toJSON(),
    courses: courses.toJSON(),
    professors: professors.toJSON()
  }, 'schedule-generation')
  
  // 6. Retornar job ID para polling
  return { jobId: job.id, status: 'PENDING' }
}

// Polling endpoint
Route.get('schedule/generate/:jobId', 'ScheduleController.status')

async status(ctx: HttpContext) {
  const job = await ScheduleGenerationJob.find(ctx.params.jobId)
  if (job.status == 'COMPLETED'):
    return { status: 'COMPLETED', schedule: job.result }
  else if (job.status == 'FAILED'):
    return { status: 'FAILED', error: job.error }
  else:
    return { status: 'PENDING', progress: job.progress }
}
```

### 5.2 Worker (Job Queue - BullMQ o similar)

```typescript
// jobs/ScheduleGenerationJob.ts

export default class ScheduleGenerationJob implements JobsContract {
  async handle(data: any) {
    try {
      const { calendarId, algorithm, restrictions, courses, professors } = data
      
      // Parsear entrada
      const calendar = parseCalendar(calendarId)
      const restrictionsObj = parseRestrictions(restrictions)
      
      // Ejecutar algoritmo
      let schedule
      if (algorithm === 'CSP') {
        schedule = await generateWithCSP(calendar, restrictionsObj, courses, professors)
      } else {
        schedule = await generateWithBacktrack(calendar, restrictionsObj, courses, professors)
      }
      
      // Guardar horario en BD
      const savedSchedule = await Schedule.create({ ...schedule, calendarId })
      
      // Marcar job como COMPLETED
      return { status: 'COMPLETED', scheduleId: savedSchedule.id }
    } catch (error) {
      // Marcar job como FAILED
      return { status: 'FAILED', error: error.message }
    }
  }
}

async function generateWithCSP(calendar, restrictions, courses, professors) {
  // Usar librería python-constraint o OR-Tools
  // ...
  // Retornar horario: { classId, dayOfWeek, sessionNumber, subjectId, professorId, roomId }
}

async function generateWithBacktrack(calendar, restrictions, courses, professors) {
  // Backtracking recursivo
  // ...
  // Retornar horario (mismo formato)
}
```

### 5.3 Frontend

```typescript
// Componente: GenerateScheduleButton

const [generating, setGenerating] = useState(false)
const [jobId, setJobId] = useState(null)
const [result, setResult] = useState(null)

async function handleGenerateSchedule() {
  setGenerating(true)
  
  // 1. Llamar POST /api/schedule/generate
  const response = await fetch('/api/schedule/generate', { method: 'POST' })
  const { jobId } = await response.json()
  setJobId(jobId)
  
  // 2. Polling GET /api/schedule/generate/:jobId cada 2 segundos
  const pollInterval = setInterval(async () => {
    const statusResponse = await fetch(`/api/schedule/generate/${jobId}`)
    const { status, schedule, error } = await statusResponse.json()
    
    if (status === 'COMPLETED') {
      setResult(schedule)
      setGenerating(false)
      clearInterval(pollInterval)
      showSuccessToast('Horario generado exitosamente')
    } else if (status === 'FAILED') {
      setGenerating(false)
      clearInterval(pollInterval)
      showErrorToast(`Error: ${error}`)
    }
  }, 2000)
}

return (
  <button 
    onClick={handleGenerateSchedule} 
    disabled={generating}
  >
    {generating ? 'Generando horarios...' : 'Generar Horarios'}
  </button>
)
```

---

## 6. Flujo Completo de Generación

```
1. USER (UI)
   └─ Click "Generar Horarios"

2. FRONTEND
   └─ POST /api/schedule/generate
   
3. BACKEND
   ├─ Validar permiso (jefe_estudios || director)
   ├─ Validar calendario base existe
   ├─ Validar restricciones existen
   ├─ Crear job con estado PENDING
   └─ Retornar jobId

4. USER (UI)
   └─ Ver spinner "Generando horarios..."
   └─ Poll GET /api/schedule/generate/:jobId cada 2s

5. WORKER (Background)
   ├─ Obtener algoritmo de setting (CSP o BACKTRACK)
   ├─ Ejecutar algoritmo (timeout 60s para CSP, 120s para BACKTRACK)
   ├─ Si éxito: guardar horario en BD, marcar job COMPLETED
   └─ Si error: marcar job FAILED con mensaje error

6. FRONTEND
   ├─ Poll detecta COMPLETED
   ├─ Mostrar "Horario generado exitosamente"
   └─ Opción: Ver horario, Editar restricciones, Exportar

7. USER
   └─ Ver horario (tabla Lunes-Viernes × Sesión 1-6)
```

---

## 7. Manejo de Errores

### Escenario 1: No hay solución factible
```
Algoritmo intenta todas las combinaciones
Retorna: "Imposible generar horario con restricciones actuales"
Sugerencia: "Reducir sesiones por asignatura o aumentar aulas"
```

### Escenario 2: Timeout (>60s para CSP, >120s para BACKTRACK)
```
Algoritmo se aborta
Retorna: "Generación tardó demasiado. Intenta con menos restricciones"
```

### Escenario 3: Error fatal (crash)
```
Job captura excepción
Retorna: "Error interno. Contacta al administrador"
Logs: registrar stack trace
```

---

## 8. Testing

### Test 1: Colegio pequeño (5 cursos, 2 clases, 10 asignaturas)
```
Entrada: calendario 25 franjas, 10 cursos, 15 sesiones totales
Esperado: Solución en < 5 segundos (CSP) o < 30 segundos (BACKTRACK)
Ambos algoritmos deben dar misma solución
```

### Test 2: Colegio mediano (10 cursos, 3 clases, 15 asignaturas)
```
Entrada: calendario 25 franjas, 30 clases, 75 sesiones totales
Esperado: Solución en < 15 segundos (CSP) o 1-2 minutos (BACKTRACK)
CSP debe ser más rápido
```

### Test 3: Restricciones conflictivas
```
Entrada: 50 sesiones en 25 disponibles
Esperado: "Imposible generar horario"
No crash, error claro
```

---

## 9. Configuración en BD

```sql
-- Tabla: settings
INSERT INTO settings (key, value) VALUES ('schedule_algorithm', 'CSP');
-- User puede cambiar vía UI a 'BACKTRACK'
```

---

## 10. Resumen Recomendación

| Aspecto | Elección |
|--------|----------|
| **Algoritmo Principal** | CSP (velocidad + robustez) |
| **Algoritmo Alternativo** | Backtrack (determinístico + fácil debug) |
| **Librería CSP** | OR-Tools (Google, robusto) o python-constraint (simple) |
| **Timeout CSP** | 60 segundos |
| **Timeout BACKTRACK** | 120 segundos |
| **Ejecución** | Background job (BullMQ + worker) |
| **UI Feedback** | Polling cada 2 segundos, spinner animado |
| **Escalabilidad** | Soporta hasta 50+ cursos con CSP |

---

**Próximo paso:** Implementar ambos algoritmos en workers, con configuración switcheable via BD setting.

