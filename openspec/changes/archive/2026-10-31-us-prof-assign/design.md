## Context

Hoy existen estas piezas:
- **Cursos con sus clases** (`classes`, con `course_id` y un `tutor_id` único). Editar o borrar un curso bloquea el curso con `FOR UPDATE`, y el borrado de una clase cae en cascada.
- **Carga por curso** (`subject_courses (subject_id, course_id, sessions_per_week)`). De ella ya cuelgan las reglas (`scheduling_constraints`) con una clave ajena compuesta en cascada.
- **Profesores:** su borrado bloquea al profesor con `FOR UPDATE` y libera su tutoría (`SET NULL` en `classes.tutor_id`).
- **Contrato del profesor:** lleva `subjects: []` desde US09, preparado para esta historia.

El motor (US-ALGO) define una variable por cada pareja (sesión, clase), así que la asignación tiene que ser **por clase**. Esto lo decidió la exploración del 2026-10-31, igual que el `PUT` con el estado final de la matriz del curso.

## Goals / Non-Goals

**Goals:**
- Un profesor por (asignatura, clase), garantizado por la base de datos, con cascadas desde todo lo que lo sostiene.
- Una matriz por curso, que es donde se ven los huecos, con lectura y escritura para los dos roles.
- `Professor.subjects` lleno y útil en el listado y en la búsqueda.
- Sin bloqueos en un orden nuevo que puedan formar ciclos con lo que ya existe.

**Non-Goals:**
- Los avisos de pérdida (US-PROF-ASSIGN_b).
- La carga total y la sobrecarga (US-PROF-SUMMARY).
- Las especialidades.
- Repartir sesiones entre profesores.
- Implementar HC6 en el motor.

## Decisions

### D1. Tabla `professor_assignments` con claves compuestas
La tabla tiene estas columnas: `id`, `school_id`, `professor_id`, `subject_id`, `course_id`, `class_id` y `created_at`.

Claves ajenas:
- `(subject_id, course_id)` a `subject_courses (subject_id, course_id)`, con `ON DELETE CASCADE`, como las reglas;
- `(class_id, course_id)` a `classes (id, course_id)`, con `ON DELETE CASCADE`. Garantiza que la clase es del curso. Exige un `@@unique([id, courseId])` en `SchoolClass`, que Prisma genera como `classes_id_course_id_key`;
- `professor_id` a `professors`, con `ON DELETE CASCADE`;
- `school_id` a `schools`.

Índices: `@@unique([subjectId, classId])`, `@@index([professorId])` y `@@index([courseId])`.

Prisma genera todo desde las relaciones, así que **no hay SQL a mano**. Aun así, se revisa el SQL de la migración, que no debe tocar los `CHECK` existentes.

- **Alternativa descartada: una fila por (profesor, asignatura, curso)**, como en la ficha original. No permite profesores distintos por clase.
- **Alternativa descartada: guardar `sessions_per_week` en la asignación.** Duplicaría la carga del curso, como la antigua `HOURS_PER_WEEK`.

### D2. El `PUT` con el estado final y diferencias
El parser `parseUpdateCourseAssignmentsRequest` (Zod, cuerpo `unknown`) valida la forma, los UUID, el máximo de 2000 entradas y los `DUPLICATE` por posición. La comprobación de referencias va en el repositorio, bajo el bloqueo.

`planAssignmentChanges(current, wanted)` es una función pura en `domain/assignment/`. Compara por la clave `subjectId-classId` y devuelve:
- `toDelete`: las que ya no vienen;
- `toChange`: las que siguen pero con otro profesor;
- `toCreate`: las nuevas;
- los recuentos `added`, `removed` y `changed`.

El repositorio aplica en este orden `deleteMany`, un `update` por cambio (así conserva `created_at`) y `createMany`, y relee la matriz en la misma transacción.

- **Alternativa descartada: borrar todo y volver a insertar.** Es más simple, pero pierde los `created_at` y escribe aunque nada cambie.

### D3. Bloqueos y referencias
La transacción de `PrismaCourseAssignmentsRepository.replace(schoolId, courseId, wanted)` sigue estos pasos:
1. **Curso:** `SELECT id FROM courses WHERE id = … AND school_id = … FOR UPDATE`. Sin fila devuelve `notFound` y no hace nada más. Es el mismo bloqueo que la edición y el borrado del curso, así que dos `PUT` se serializan y quitar una clase espera.
2. **Profesores:** bloquea con `FOR SHARE`, en orden de `id`, la unión de los profesores pedidos y de los que ya tenían asignaciones en el curso (`SELECT id FROM professors WHERE school_id = … AND (id = ANY(…) OR id IN (SELECT professor_id FROM professor_assignments WHERE course_id = …)) ORDER BY id FOR SHARE`). El borrado de un profesor (`FOR UPDATE`) espera, o hace esperar al `PUT` antes de que este toque sus filas, así que no se cruzan sobre las asignaciones. Incluir los actuales evita el ciclo que aparecería si el borrado cayera en cascada sobre filas que el `PUT` ya está borrando.
3. **Referencias:** lee las asignaturas impartidas en el curso (`subject_courses` del curso), sus clases y los profesores bloqueados, y marca `NOT_FOUND` por posición. Si hay alguno, devuelve `invalidReferences` y no escribe nada.
4. **Diferencias:** aplica D2.

La carga del curso (`PATCH` de US19) bloquea las asignaturas y después el curso con `FOR SHARE`. El `PUT` toma el curso con `FOR UPDATE` y nunca bloquea asignaturas: inserta filas que referencian `subject_courses`, lo que solo toma un `KEY SHARE` sobre esa fila. Si la carga quita la asignatura a la vez, uno espera al otro sin ciclo:
- si gana la carga, el `PUT` encuentra que la asignatura ya no se imparte y responde `400 NOT_FOUND`;
- si gana el `PUT`, la carga borra después la pareja y la cascada se lleva la asignación.

El borrado y la edición de una asignatura toman la asignatura y caen en cascada, y tampoco forman ciclo. Los tests de integración lanzan en carrera, en varias rondas, el `PUT` contra el borrado del profesor, contra el `PATCH` de la carga que quita la asignatura y contra otro `PUT`.

### D4. Router y casos de uso
`assignmentsRouter` se monta antes de `/courses` con `mergeParams`, como `workloadRouter`, y valida el `id` como UUID (si no lo es, `404`). No lleva `requireRole`.

Los casos de uso son dos:
- **`GetCourseAssignments`:** ordena con `compareText` las asignaturas, las clases y los tutores.
- **`UpdateCourseAssignments`:** valida el cuerpo, llama a `replace`, traduce `notFound` a `CourseNotFound` e `invalidReferences` a `ValidationError`, y registra los eventos.

### D5. `Professor.subjects`
`PrismaProfessorRepository` añade al `select` del profesor `assignments: { select: { classId, subject: { name }, class: { name }, subjectCourse: { sessionsPerWeek, course: { name } } } }` y lo mapea a `ProfessorSubject`. Prisma lo resuelve con unas pocas consultas fijas, no una por profesor, y en el listado lo hace en la misma lectura. La lista se ordena en la aplicación con `compareText`: primero por asignatura, después por curso y por último por clase.

El dominio cambia `subjects: readonly []` por `readonly ProfessorSubject[]`, y hay que actualizar los fixtures del backend y del frontend.

### D6. Frontend
- **`services/courseAssignmentsService.ts`:** `get` y `update`, que validan la forma y nunca lanzan.
- **`professorsService`:** valida `ProfessorSubject` y deja de exigir que la lista esté vacía.
- **`utils/courseAssignmentsDraft.ts`:** funciones puras sobre el borrador `Record<"subjectId-classId", professorId | null>`:
  - `draftFrom` crea el borrador;
  - `assignTutor(draft, classId, tutorId, subjects)` rellena solo las celdas vacías;
  - `unassignedCount` cuenta las celdas sin profesor;
  - `sessionsByProfessor` suma las sesiones de las celdas de cada profesor;
  - `hasChanges` compara con lo cargado;
  - `toBody` da la lista enviada, sin las celdas vacías y en el orden de la matriz.
- **`pages/CourseAssignmentsPage.tsx`:**
  - `useMediaQuery` decide entre la tabla desde 768 px y las tarjetas por clase;
  - pide la matriz y `professorsService.list` una vez;
  - lleva su guarda síncrona.
- **`ProfessorsPage`:** gana la columna. La búsqueda pasa a `matchesPersonSearch` el texto de las asignaturas: `utils/personSearch.ts` admite un campo extra opcional, y `/alumnos` no lo pasa.

### D7. Motor
`docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` anota que HC6 («profesor puede impartir asignatura») se resuelve con la asignación: cada (asignatura, clase) tiene exactamente un profesor, que es el que la imparte. Sin asignación no se puede generar el horario de esa clase. Cuándo avisar de eso es cosa de US-PROF-SUMMARY y de US-ALGO-RUN.

## Risks / Trade-offs

- **[Dos personas editan la matriz del mismo curso]** → El `PUT` es el estado final y gana el último. La persona usuaria lo aceptó frente a un `PATCH` por celdas. El riesgo es bajo: la matriz de un curso la edita normalmente una persona.
- **[Un borrado cae en cascada sin aviso]** → Hasta US-PROF-ASSIGN_b, quitar una asignatura, una clase o un profesor borra sus asignaciones sin avisar. Queda documentado y la historia siguiente lo cubre.
- **[El listado de profesores se vuelve más pesado]** → Son unas pocas consultas fijas para decenas de profesores. Sin paginación en el servidor, igual que ahora.
- **[Seguridad]** → Bearer obligatorio, `schoolId` solo de la identidad, `404` uniforme y referencias comprobadas contra el colegio y el curso bajo el bloqueo. Los eventos no llevan nombres.

## Migration Plan

1. Migración `add_professor_assignments`: crea el índice único `classes_id_course_id_key` (que siempre se cumple, porque `id` ya es único) y la tabla con sus claves e índices. No toca datos.
2. Se aplica en el despliegue, antes del backend nuevo. El backend anterior no lee la tabla y sigue devolviendo `subjects: []`, que es compatible.
3. Para volver atrás: revertir el merge. La tabla puede quedarse vacía.

## Open Questions

Ninguna.
