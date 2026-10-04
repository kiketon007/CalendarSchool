# Migración: Especialidades → Múltiples Asignaturas (US09 Ampliada)

**Versión:** 1.0  
**Fecha:** 2026-08-01  
**Opción:** 2 (Deprecate Completamente)  
**Status:** 🔴 Pre-implementación (aguardando aprobación)

---

## 1. Introducción

### Problema
Campo `professors.specialty` (string simple) solo permite 1 especialidad por profesor. Necesario migrar a modelo many-to-many `professor_subjects` para soportar múltiples asignaturas.

### Solución Escogida: Opción 2 (Deprecate Completamente)
- Crear tabla `professor_subjects` (many-to-many)
- Migrar datos: `specialty` → `professor_subjects`
- Drop campo `specialty` después de validación
- **Ventaja:** Schema limpio, sin legacy fields
- **Riesgo:** Requiere migración upfront; rollback más complejo

---

## 2. Plan de Migración (3 Fases)

### Fase 1: Preparación (Pre-prod, 2-3 días)

#### 1.1. Crear tabla `professor_subjects`

```sql
-- Crear tabla many-to-many
CREATE TABLE professor_subjects (
  id INT PRIMARY KEY AUTO_INCREMENT,
  profesorId INT NOT NULL,
  subjectId INT NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (profesorId) REFERENCES professors(id) ON DELETE CASCADE,
  FOREIGN KEY (subjectId) REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE KEY unique_professor_subject (profesorId, subjectId)
);

-- Crear índices para performance
CREATE INDEX idx_professor_subjects_profesorId ON professor_subjects(profesorId);
CREATE INDEX idx_professor_subjects_subjectId ON professor_subjects(subjectId);
```

#### 1.2. Script de migración de datos

**Precondición:** Todos profesores en tabla `subjects` tienen su asignatura en tabla `subjects`.

```sql
-- Migración: professors.specialty → professor_subjects
-- 1. Para cada profesor con specialty NO NULL:
--    INSERT en professor_subjects (profesorId, subjectId) SELECT p.id, s.id FROM professors p JOIN subjects s ON s.name = p.specialty

INSERT INTO professor_subjects (profesorId, subjectId)
SELECT p.id, s.id 
FROM professors p 
JOIN subjects s ON LOWER(s.name) = LOWER(p.specialty)
WHERE p.specialty IS NOT NULL 
  AND s.status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM professor_subjects ps 
    WHERE ps.profesorId = p.id AND ps.subjectId = s.id
  );

-- 2. Validar integridad: todos profesores activos tienen ≥1 asignatura
SELECT p.id, p.firstName, p.lastName, 
  (SELECT COUNT(*) FROM professor_subjects ps WHERE ps.profesorId = p.id) as subject_count
FROM professors p
WHERE p.status = 'ACTIVE' AND p.specialty IS NOT NULL
HAVING subject_count = 0;

-- 3. Si hay resultados en validación anterior: investigar y/o asignar manualmente
```

#### 1.3. Testing en pre-prod

```sql
-- Verificar:
-- a) Todos profesores activos con specialty tienen ≥1 en professor_subjects
SELECT COUNT(*) as count_profesores_sin_asignaturas
FROM professors p
WHERE p.status = 'ACTIVE' 
  AND p.specialty IS NOT NULL
  AND (SELECT COUNT(*) FROM professor_subjects ps WHERE ps.profesorId = p.id) = 0;
-- Resultado esperado: 0

-- b) No hay duplicados en professor_subjects
SELECT profesorId, subjectId, COUNT(*) as dupes
FROM professor_subjects
GROUP BY profesorId, subjectId
HAVING dupes > 1;
-- Resultado esperado: empty set

-- c) Validar FK integridad
SELECT ps.id
FROM professor_subjects ps
LEFT JOIN professors p ON ps.profesorId = p.id
LEFT JOIN subjects s ON ps.subjectId = s.id
WHERE p.id IS NULL OR s.id IS NULL;
-- Resultado esperado: empty set
```

---

### Fase 2: Despliegue en Producción (1 día)

#### 2.1. Pre-despliegue (Maintenance Window)

1. **Backup completo:** Base de datos entera
2. **Notificación:** "Sistema en mantenimiento por actualización"
3. **Cierre de sesiones activas:** Dar 5 min para logout

#### 2.2. Despliegue

```bash
# 1. Ejecutar migración (en transacción)
BEGIN TRANSACTION;
  -- Crear tabla professor_subjects
  CREATE TABLE professor_subjects (...);
  
  -- Migrar datos specialty → professor_subjects
  INSERT INTO professor_subjects (profesorId, subjectId)
  SELECT p.id, s.id 
  FROM professors p 
  JOIN subjects s ON LOWER(s.name) = LOWER(p.specialty)
  WHERE p.specialty IS NOT NULL AND s.status = 'ACTIVE';
  
  -- Validar
  -- [validaciones de integridad]
COMMIT;

# 2. Verificar result code == 0
# 3. Si error: ROLLBACK completamente

# 4. Deploy code (backend + frontend) que usa professor_subjects
# 5. Pruebas smoke: crear/editar/listar profesor con asignaturas
```

#### 2.3. Post-despliegue (Rollback preparado)

Si problemas detectados:
```sql
-- ROLLBACK: DROP profesor_subjects y volver a schema anterior
DROP TABLE professor_subjects;
-- Backend vuelve a lectura de campo specialty
-- Usuarios se notifican del rollback
```

---

### Fase 3: Cleanup (Semana posterior)

#### 3.1. Período de transición (3-7 días)

- Correr sistema con `professor_subjects` en producción
- Monitorear errores, anomalías, rendimiento
- Validar que todas funcionalidades funcionan (US09, US10, US11, US12)

#### 3.2. Deprecation del campo `specialty`

Cuando estable (0 errores por 7 días):

```sql
-- Opción A: Drop campo (limpieza total)
ALTER TABLE professors DROP COLUMN specialty;

-- Opción B: Mantener para rollback (más seguro)
-- ALTER TABLE professors RENAME COLUMN specialty TO specialty_DEPRECATED;
-- Comentario en código: "DEPRECATED - use professor_subjects"
```

---

## 3. Impacto en Código Existente

### Backend (AdonisJS)

#### Cambios en Model Professor

**ANTES:**
```typescript
// app/models/Professor.ts
export default class Professor extends BaseModel {
  @column()
  public firstName: string

  @column()
  public specialty: string  // ← DEPRECATED
  
  @column()
  public classId: number | null
}
```

**DESPUÉS:**
```typescript
// app/models/Professor.ts
import { manyToMany, ManyToMany } from '@adonisjs/lucid/orm'

export default class Professor extends BaseModel {
  @column()
  public firstName: string

  // DEPRECATED - use subjects relationship instead
  // @column() 
  // public specialty: string

  @column()
  public classId: number | null

  @manyToMany(() => Subject, {
    pivotTable: 'professor_subjects'
  })
  public subjects: ManyToMany<typeof Subject>
}
```

#### Cambios en APIs

**POST /api/professors (Crear)**

```typescript
// ANTES
const { firstName, lastName, specialty, classId } = request.all()
// specialty: string

// DESPUÉS
const { firstName, lastName, subjectIds, classId } = request.all()
// subjectIds: number[]

const professor = await Professor.create({ firstName, lastName, classId })
await professor.related('subjects').sync(subjectIds)
```

**GET /api/professors/:id (Obtener)**

```typescript
// ANTES
const professor = await Professor.find(id)
// Returns: { id, firstName, lastName, specialty, classId }

// DESPUÉS
const professor = await Professor.query()
  .where('id', id)
  .preload('subjects')
  .first()
// Returns: { id, firstName, lastName, subjects: [...], classId }
```

**PUT /api/professors/:id (Editar)**

```typescript
// ANTES
const professor = await Professor.find(id)
professor.specialty = 'Matemáticas'
await professor.save()

// DESPUÉS
const professor = await Professor.find(id)
await professor.related('subjects').sync(subjectIds)
// Reemplaza completamente set de asignaturas
```

### Frontend (React)

#### Cambios en Componentes

**ProfessorForm (Crear/Editar)**

```typescript
// ANTES: SpecialtyDropdown
<select name="specialty" value={specialty} onChange={setSpecialty}>
  <option>Inglés</option>
  <option>Matemáticas</option>
</select>

// DESPUÉS: SubjectsCheckboxList
<fieldset>
  {subjects.map(subject => (
    <label key={subject.id}>
      <input 
        type="checkbox" 
        checked={selectedSubjectIds.includes(subject.id)}
        onChange={(e) => {
          if (e.target.checked) {
            setSelectedSubjectIds([...selectedSubjectIds, subject.id])
          } else {
            setSelectedSubjectIds(selectedSubjectIds.filter(id => id !== subject.id))
          }
        }}
      />
      {subject.name} ({subject.type})
    </label>
  ))}
</fieldset>
```

**ProfessorList (Listado)**

```typescript
// ANTES: mostrar especialidad simple
<td>{professor.specialty}</td>

// DESPUÉS: mostrar asignaturas con badge expandible
<td>
  {professor.subjects.length <= 2 
    ? professor.subjects.map(s => s.name).join(', ')
    : <span className="badge cursor-pointer" onClick={() => setExpandedId(professor.id)}>
        {professor.subjects.length} asignaturas
      </span>
  }
  {expandedId === professor.id && (
    <div className="popup">
      {professor.subjects.map(s => <div>{s.name}</div>)}
    </div>
  )}
</td>
```

---

## 4. Testing Plan

### Unit Tests (Backend)

```typescript
// tests/unit/models/professor.test.ts
test('Professor.create with subjectIds creates relationships', async (assert) => {
  const professor = await Professor.create({
    firstName: 'John',
    lastName: 'Smith',
  })
  await professor.related('subjects').sync([1, 3, 5])
  
  await professor.load('subjects')
  assert.lengthOf(professor.subjects, 3)
})

test('Professor.update subjects replaces all', async (assert) => {
  // ... setup professor with [1, 3, 5]
  await professor.related('subjects').sync([1, 2])
  await professor.refresh()
  
  assert.lengthOf(professor.subjects, 2)
  assert.isTrue(professor.subjects.some(s => s.id === 1))
  assert.isFalse(professor.subjects.some(s => s.id === 5))
})

test('Validation: minimum 1 subject required', async (assert) => {
  const { validate } = await import('@adonisjs/core/services/validator')
  
  try {
    await validate(data, {
      subjectIds: 'required|array|minItems:1'
    })
    assert.fail('Should have failed')
  } catch (e) {
    assert.isTrue(e.messages.subjectIds.length > 0)
  }
})
```

### Integration Tests (Frontend)

```typescript
// tests/integration/ProfessorForm.test.tsx
describe('ProfessorForm - Multiselect Subjects', () => {
  it('should create professor with multiple subjects', async () => {
    render(<CreateProfessorForm />)
    
    const nameInput = screen.getByPlaceholderText('Nombre')
    const lastNameInput = screen.getByPlaceholderText('Apellido')
    const englishCheckbox = screen.getByLabelText('Inglés')
    const artsCheckbox = screen.getByLabelText('Arts')
    const saveButton = screen.getByText('Guardar')
    
    await userEvent.type(nameInput, 'John')
    await userEvent.type(lastNameInput, 'Smith')
    await userEvent.click(englishCheckbox)
    await userEvent.click(artsCheckbox)
    await userEvent.click(saveButton)
    
    // Mock API: POST /api/professors with subjectIds: [1, 3]
    await waitFor(() => {
      expect(screen.getByText(/Profesor creado/)).toBeInTheDocument()
    })
  })
})
```

### E2E Tests (Cypress)

```typescript
// cypress/e2e/professors.cy.ts
describe('US09: Create Professor with Multiple Subjects', () => {
  it('should create professor with 3 subjects', () => {
    cy.visit('/admin/professors')
    cy.get('[data-testid="btn-create-professor"]').click()
    
    cy.get('input[name="firstName"]').type('José María')
    cy.get('input[name="lastName"]').type('García López')
    
    cy.get('input[id="subject-1"]').check()  // Inglés
    cy.get('input[id="subject-3"]').check()  // Arts
    cy.get('input[id="subject-5"]').check()  // Matemáticas
    
    cy.get('button[type="submit"]').click()
    
    cy.contains('Profesor creado correctamente').should('be.visible')
    cy.contains('García López, José María | Inglés, Arts, Matemáticas').should('exist')
  })
  
  it('should prevent saving with 0 subjects', () => {
    cy.visit('/admin/professors/create')
    cy.get('input[name="firstName"]').type('Test')
    cy.get('input[name="lastName"]').type('Prof')
    
    // No checkboxes checked
    cy.get('button[type="submit"]').click()
    
    cy.contains('Debe seleccionar al menos 1 asignatura').should('be.visible')
  })
})
```

---

## 5. Rollback Strategy

Si se detectan problemas en producción post-despliegue:

### Escenario A: Problema detectado antes de DROP specialty

```sql
-- 1. Rollback de datos (restaurar profesor_subjects vacía si queda)
TRUNCATE TABLE professor_subjects;

-- 2. Restablecer acceso al campo specialty
-- (no cambiar nada, campo sigue existiendo)

-- 3. Deploy anterior de código (backend lee specialty nuevamente)
-- git revert [commit-id]
```

### Escenario B: Problema después de DROP specialty

```sql
-- 1. Restaurar desde backup anterior a migración
-- $ restore_backup.sh [timestamp-pre-migration]

-- 2. Anular migración completamente
-- Verificar integridad post-restore

-- 3. Deploy anterior de código
-- git revert [commit-id]

-- 4. Investigar root cause
-- 5. Retry migración con ajustes
```

---

## 6. Monitoreo Post-Migración

### Métricas a Monitorear

```sql
-- Dashboard query: estado de migración
SELECT 
  COUNT(DISTINCT p.id) as total_profesores,
  COUNT(DISTINCT CASE WHEN p.specialty IS NOT NULL THEN p.id END) as with_legacy_specialty,
  COUNT(DISTINCT ps.profesorId) as with_new_subjects,
  COUNT(DISTINCT CASE 
    WHEN p.specialty IS NOT NULL 
    AND (SELECT COUNT(*) FROM professor_subjects ps2 WHERE ps2.profesorId = p.id) = 0 
    THEN p.id 
  END) as profesores_sin_sync
FROM professors p
LEFT JOIN professor_subjects ps ON p.id = ps.profesorId;

-- Esperado post-migración:
-- total_profesores = N
-- with_legacy_specialty = N (todos tienen entrada legacy)
-- with_new_subjects = N (todos migrados)
-- profesores_sin_sync = 0 (coherencia)
```

### Alertas

- **Error rate en /api/professors:** > 1% → página de alertas
- **Latencia en GET /api/professors:** > 500ms → índices verificar
- **Inconsistencias profesor_subjects:** cualquiera → investigar
- **Errores de validación subjectIds:** > 10/hora → revert

---

## 7. Timeline

| Fase | Duración | Hito |
|------|----------|------|
| **Preparación** | 2-3 días | Tabla creada, script validado en pre-prod |
| **Despliegue** | 1 día | Migración ejecutada, código en prod, smoke tests OK |
| **Período de transición** | 3-7 días | Monitoreo, 0 errores después 7 días |
| **Cleanup** | 1-2 horas | DROP specialty (cuando seguro) |
| **TOTAL** | ~10-12 días | Go-live con schema limpio |

---

## 8. Responsabilidades

| Rol | Tarea |
|-----|-------|
| **DBA** | Crear tabla, validar integridad, backup, restore si necesario |
| **Backend Dev** | Implementar nuevo schema en ORM, nuevas APIs, tests |
| **Frontend Dev** | Cambiar UI (multiselect, badges), integración APIs |
| **QA** | Unit tests, integration tests, E2E, stress test |
| **DevOps** | Coordinar despliegue, rollback runbook, monitoreo |
| **Product Owner** | Aprobar rollout, comunicar cambios a usuarios |

---

## 9. Aprobaciones Requeridas

- [ ] DBA: Validar script migración
- [ ] Tech Lead Backend: Revisar cambios ORM
- [ ] Tech Lead Frontend: Revisar cambios UI
- [ ] QA: Validar plan testing
- [ ] Product Owner: Aprobar timeline
- [ ] DevOps: Validar runbook rollback

---

## 10. Referencias

- US09 Ampliada: `docs/User_Stories_MVP.md` (línea ~1182)
- US09 Mejora: `docs/US09_MEJORA_MultiplesEspecialidades_BORRADOR.md`
- Arquitectura profesores: `docs/ARQUITECTURA_PROFESORES_DISPONIBILIDAD.md`

