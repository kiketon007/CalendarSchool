## Context

- **Backend:** un alumno es `Student` (`domain/student/student.ts`, con `StudentSummary` sin datos sensibles). El puerto `StudentRepository` tiene `create` y `listBySchool`. `PrismaStudentRepository.create` comprueba curso y clase dentro de una transacción con el curso bloqueado `FOR SHARE` (el borrado y la edición del curso lo toman `FOR UPDATE`) y lanza `CourseNotFound`/`ClassNotFound`, que el caso de uso traduce a `400` con `NOT_FOUND` en su campo y a `STUDENT_CREATION_REJECTED`. `parseCreateStudentRequest` valida el cuerpo con la tabla `test-fixtures/student-fields.json`. Los profesores ya tienen el patrón de lectura y edición por id (US12: `parseProfessorId`, `ProfessorNotFound` → `404` en `errorHandler`, `FOR UPDATE` con `$queryRaw`, `changed_fields` en el evento).
- **Frontend:** `StudentForm` (US14) recibe `initialValues`, `courses`, `onRetryCourses`, `failureMessage` y `onSubmit`, y ya resuelve el curso y la clase que dejan de ofrecerse. `CreateStudentPage` hace la carga de cursos y el manejo de `400`/`NOT_FOUND`/fallo. `ProfessorForm` tiene `requireChanges` y `EditProfessorPage` es la referencia de página de edición. `StudentsPage` (US15) deriva filtros y página de la URL con `useSearchParams`, conserva el estado de la navegación al filtrar (el aviso de llegada) y no tiene acciones por fila.
- Decisiones de producto (ficha de US17, 2026-10-22): página propia, gana el último guardado, «Cancelar» sin preguntar, volver con la búsqueda del listado pasada en el estado de la navegación.

## Goals / Non-Goals

**Goals:**

- Leer (con los datos sensibles) y editar un alumno por id con el mismo aislamiento por colegio y el mismo `404` indistinguible que profesores y cursos.
- Mantener la coherencia curso–clase en la edición con el mismo bloqueo que el alta, sin `500` ante carreras con el borrado del curso.
- Reutilizar `StudentForm` sin cambiar el comportamiento del alta.
- Volver al listado con los filtros y la página que tenía.

**Non-Goals:**

- Control de versión, confirmación al cancelar, borrado (US18), historial, edición masiva.
- Migraciones o índices nuevos.

## Decisions

### 1. Contrato: `PUT` con el estado final, mismas reglas que el alta

`UpdateStudentRequest` tiene los mismos campos y reglas que `CreateStudentRequest`; en el contrato se declara como esquema propio con las mismas propiedades (`allOf` sobre `CreateStudentRequest` o una copia con descripción de estado final), para que una futura divergencia no cambie el alta. `classId`, `foodType` y `observations` ausentes son `null` (estado final, no «no tocar»: el formulario siempre tiene todos los campos y, a diferencia de US12, no hay un campo que pueda quedar sin cargar y guardarse igual, porque sin cursos no se puede enviar). Respuesta `{ student: Student }` para `GET` y `PUT`. Sin códigos nuevos: `NOT_FOUND`, `VALIDATION_ERROR` y `NOT_ALLOWED` ya existen.

*Alternativa descartada:* `PATCH` parcial. Obligaría a distinguir ausente de vacío en todos los campos y no lo hace ningún otro recurso.

### 2. Validación: `parseUpdateStudentRequest` = `parseCreateStudentRequest`

El parser de edición delega en el del alta (mismo resultado, mismo orden de errores) y se exporta con su propio nombre para que la ruta y los tests sean explícitos. `student-fields.json` se recorre también contra el parser de edición (un `describe.each` sobre los dos parsers en el test existente).

### 3. Puerto: `findById` y `update` devuelven `null` si el alumno no está en el colegio

```ts
findById(schoolId: string, studentId: string): Promise<Student | null>;
update(
  schoolId: string,
  studentId: string,
  student: NewStudent,
  courseId: string,
  classId: string | null,
): Promise<StudentUpdate | null>;
// StudentUpdate: { before: Student; after: Student }
```

`null` → `StudentNotFound` en el caso de uso (`404` en `errorHandler`, como `ProfessorNotFound`). `before` sirve para calcular `changed_fields` sin otra consulta ni carrera. `CourseNotFound`/`ClassNotFound` se lanzan como en el alta.

### 4. Transacción y bloqueos en `PrismaStudentRepository.update`

Orden: (1) `SELECT id FROM courses WHERE id = $course AND school_id = $school FOR SHARE` (se anota si existe, sin lanzar todavía); (2) `SELECT id FROM students WHERE id = $id AND school_id = $school FOR UPDATE` → si no hay fila, `null` (el `404` del alumno tiene prioridad sobre el curso); (3) si el curso no existía, `CourseNotFound`; (4) la clase con `findFirst({ id: classId, courseId })` → `ClassNotFound`; (5) leer `before` con sus relaciones; (6) `student.update` con todos los campos y `select` completo → `after`.

- **El curso destino se bloquea antes que el alumno**, el mismo orden que siguen el borrado (US08) y la edición del curso (US07): toman el curso `FOR UPDATE` y después escriben las filas de sus alumnos (la clave ajena `ON DELETE SET NULL`). Así no hay ciclo: si la edición del alumno tiene el curso en `FOR SHARE`, el borrado de ese curso espera; si el borrado lo tiene, la edición espera y después ve que no existe (`CourseNotFound`). El borrado del curso **actual** del alumno (otro curso) no necesita nada que tenga la edición salvo la fila del alumno, y la edición no necesita ese curso: tampoco hay ciclo, gana quien bloquee primero la fila.
- *Alternativa descartada:* bloquear primero el alumno y después el curso. Con el borrado del mismo curso en curso forma un ciclo (borrado: curso → alumno; edición: alumno → curso) que PostgreSQL resuelve abortando una transacción (`40P01`) y que obligaría a reintentar.
- No se traduce ninguna violación de clave ajena (`P2003`), igual que en el alta: con el curso bloqueado `FOR SHARE`, ni el curso ni sus clases pueden desaparecer antes del `UPDATE`, así que esa carrera no puede ocurrir. La concurrencia con el borrado del curso se prueba en integración con `Promise.all` de `PUT` y `DELETE` repetido varias veces, sin `500`.
- `updated_at` lo pone Prisma (`@updatedAt`).

### 5. Caso de uso `UpdateStudent` y eventos

Valida el cuerpo, llama a `update`, calcula `changed_fields` comparando `before` y `after` campo a campo (en el orden del alta; `courseId`/`classId` por `id`) y registra `STUDENT_UPDATED` con `has_class` y `cafeteria` de `after`. `null` → `STUDENT_UPDATE_REJECTED { reason: 'not_found' }` y `StudentNotFound`; `CourseNotFound`/`ClassNotFound` → `reason: course_not_found | class_not_found` y el mismo `400` que el alta (se reutiliza la conversión a `ValidationError` de `createStudent.ts`, extraída a una función compartida). Nunca valores en los eventos. `GetStudent` lanza `StudentNotFound` sin evento (como `GetProfessor`).

### 6. Rutas

`studentsRouter` añade `GET /:id` y `PUT /:id` con un `parseStudentId` (UUID o `StudentNotFound`, como `parseProfessorId`) y `Cache-Control: no-store` en ambas respuestas. `requireAuthentication` ya cubre el router.

### 7. Frontend: `StudentForm` con `requireChanges` y aviso de alumno sin curso

- `requireChanges?: boolean` deshabilita «Guardar» mientras `hasStudentChanges(initialValues, values)` sea falso. `hasStudentChanges` vive en `validation/studentValidation.ts` y compara el **cuerpo que se enviaría**: `studentsService` exporta la función pura `toStudentBody` (el cuerpo del alta y de la edición, sin lo vacío) y `hasStudentChanges` la aplica a los dos valores ya limpios (nombres y tipo de comida con los espacios colapsados, observaciones recortadas) y compara el resultado. Así «añadir espacios» o «Sí → No → Sí con los campos vacíos» no cuentan como cambio, y la regla no puede divergir del envío.
- El aviso «Este alumno no tiene curso…» lo decide la página con una prop `courseMissingNotice?: boolean` (solo en edición, cuando el alumno llegó con `course: null`), ligado por `aria-describedby` junto a los que ya tenga el desplegable. Desaparece al elegir un curso.
- El alta no pasa ninguna de las dos props: su comportamiento no cambia y sus tests siguen pasando.

### 8. Frontend: `EditStudentPage` y el regreso con filtros

- Carga el alumno (`studentsService.get`) y los cursos (`coursesService.list`) en paralelo, una vez con `StrictMode` (el patrón de `EditProfessorPage`). Estados: cargando, `notFound`, error con «Reintentar» y formulario. `initialValues` se construye desde `Student` (`course?.id ?? ''`, `class?.id ?? ''`, `cafeteria ? 'yes' : 'no'`, beca y textos).
- `StudentsPage` pone en el `Link` de «Editar» `state={{ listSearch: location.search }}`. `EditStudentPage` lee `listSearch` con una guarda (`returnSearchFrom(state)`, en `utils/studentFilters.ts` o un módulo propio): solo se acepta un texto vacío o que empiece por `?` y no contenga `#` ni saltos de línea; cualquier otra cosa es `''`. La ruta de vuelta es siempre `{ pathname: '/alumnos', search }`, así que no es una redirección abierta aunque el estado se manipule. `StudentsPage` ya valida cada parámetro contra los alumnos cargados.
- Tras el `200`: `navigate({ pathname: '/alumnos', search }, { replace: true, state: { studentUpdated: 'Nombre Apellidos' } })`. «Cancelar» es un `Link` al mismo destino. El aviso lo lee `StudentsPage` con la guarda ampliada a `studentUpdated` y lo conserva al filtrar, como `studentCreated`.
- *Alternativa descartada (decisión de producto):* un parámetro `?volver=` en la URL de edición, que sobrevive a recargar pero ensucia la URL y exige validar una redirección.

## Risks / Trade-offs

- **[Deadlock con el borrado o la edición del curso]** → mismo orden de bloqueo que ellos (curso antes que alumnos) y test de integración con concurrencia repetida; documentado en `backend/CLAUDE.md`.
- **[Datos sensibles en la respuesta de un alumno]** → solo en `GET`/`PUT` por id, con `no-store`; nunca en eventos (`changed_fields` lleva nombres de campo, no valores); el título del documento no lleva el nombre.
- **[Perder el último guardado ajeno]** → aceptado (gana el último), como en cursos y profesores.
- **[La búsqueda de vuelta no existe en un enlace directo]** → el estado de la navegación vive en el historial del navegador y sobrevive a recargar, pero un enlace directo no lo trae: se vuelve a `/alumnos` sin filtros, sin error (aceptado en la decisión).
- **[El alumno editado deja de cumplir los filtros]** → no aparece; el aviso sigue visible y la página se acota a la última (regla de US15).
- **Seguridad:** el colegio sale siempre de la identidad; el `404` no distingue «otro colegio» de «no existe»; el curso y la clase se validan dentro del colegio.
- **Rendimiento:** dos bloqueos, dos lecturas y un `UPDATE` por guardado; sin índices nuevos (las búsquedas son por clave primaria).
