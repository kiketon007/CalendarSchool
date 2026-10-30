## Why

Hoy la carga de un curso solo dice cuántas sesiones semanales lleva cada asignatura, y el motor (HC3) pondrá como mucho una al día; no hay forma de pedir que Educación Física vaya en bloques de dos sesiones seguidas ni que Inglés pueda tener dos sesiones el mismo día. US19_b (`docs/User_Stories_MVP.md`, «Reglas de reparto: máximo por día y bloques», enriquecida tras la exploración del 2026-10-29) trae las dos primeras reglas de reparto y la tabla en la que vivirán también las franjas de US19_c y US19_d. Lo justifica el PRD (§3.5: las restricciones por asignatura y curso parametrizan la generación; el administrador las configura y el miembro las ve) y lo consumirá el motor (US-ALGO-RUN).

## What Changes

- **Tabla nueva `scheduling_constraints`** (migración `add_scheduling_constraints`) y enum `ConstraintType` (`MAX_PER_DAY`, `BLOCK`, `FORBIDDEN_SLOTS`, `PREFERRED_SLOTS`; esta historia solo usa los dos primeros). Una fila por (asignatura, curso, tipo), con **clave ajena compuesta** a `subject_courses(subject_id, course_id)` `ON DELETE CASCADE` y `CHECK` escritos a mano por tipo (`max_per_day` de 2 a 5, `block_size` de 2 a 3). Una regla sin su pareja es imposible, y se borra sola cuando la asignatura deja de impartirse en el curso, se borra la asignatura o se borra el curso.
- **`GET /api/courses/{id}/workload`:**
  - Cada asignatura gana `maxPerDay`, `blockSize`, `constraintCount` y sus `warnings`.
  - `calendar` gana `maxConsecutiveSessions`, el tramo más largo de sesiones sin recreo.
  - Los avisos por asignatura nuevos son `BLOCK_LARGER_THAN_LOAD` y `SUBJECT_DOES_NOT_FIT`. Se calculan al leer, en la función pura `workloadWarnings`, y nunca impiden guardar.
- **`PATCH /api/courses/{id}/workload`:**
  - Cada cambio lleva la fila entera: `{ subjectId, sessionsPerWeek, maxPerDay, blockSize }`, los cuatro obligatorios. Un `null` borra la regla y un valor la crea o la cambia. **BREAKING** respecto al contrato de US19, pero se despliega a la vez que el frontend.
  - Sin carga (`sessionsPerWeek: null`), una regla da `400` con `NOT_ALLOWED`. Fuera de rango da `OUT_OF_RANGE`.
  - Las reglas se escriben en la misma transacción y bajo los mismos bloqueos de US19.
- **La edición de una asignatura (`PUT /api/subjects/{id}`) aplica diferencias:** borra los cursos quitados (y sus reglas, por la cascada), actualiza las sesiones cambiadas e inserta los cursos nuevos. Ya no borra ni reinserta todo, así que guardar sin tocar los cursos conserva las reglas.
- **Recuentos:** `SubjectCourse` (en `GET /api/subjects` y `GET /api/subjects/{id}`) y `CourseImpact` (en el impacto y en la respuesta del borrado de un curso) ganan `constraintCount`. `COURSE_DELETED` gana `constraint_count`.
- **Avisos de pérdida:** «Se borrarán N reglas» al quitar un curso en la edición de la asignatura, al pasar a «No se imparte» en la matriz, al borrar una asignatura y al borrar un curso. La tarjeta de la asignatura muestra «1º Primaria: 3 sesiones · 2 reglas».
- **Página de la carga:**
  - Para el `ADMIN`, cada fila gana los selectores «Máximo al día» y «Bloques», deshabilitados en «No se imparte», y los avisos de la asignatura.
  - El `MEMBER` los ve como texto.
- **Log:** `COURSE_WORKLOAD_UPDATED` gana `constraints_set` y `constraints_removed`, sin nombres. Un `PATCH` que solo cambia reglas también es un cambio real.
- **Sin códigos de error nuevos:**
  - `FieldErrorCode` reutiliza `NOT_ALLOWED`.
  - `WorkloadWarningCode` gana dos valores.

**Fuera de alcance:**
- Franjas prohibidas y preferidas (US19_c, US19_d).
- Listado de reglas (US20).
- Bloques que cruzan un recreo.
- Reglas por clase o de curso entero.
- Comprobar si el horario completo es posible (US-ALGO-RUN).
- La disponibilidad de los profesores (US-PROF-AVAIL).
- Cambiar el motor (aún no existe; `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` solo se anota).

## Capabilities

### New Capabilities

- `scheduling-constraints`: las reglas de reparto de una asignatura en un curso. Cubre:
  - La tabla, el enum, los `CHECK`, la clave compuesta y la cascada.
  - El significado de `MAX_PER_DAY` y `BLOCK`, con el valor por defecto de una sesión al día.
  - Los avisos por asignatura (`BLOCK_LARGER_THAN_LOAD`, `SUBJECT_DOES_NOT_FIT`) en `workloadWarnings`.

### Modified Capabilities

- `course-workload`:
  - El contrato de lectura y escritura gana las reglas, `constraintCount`, `maxConsecutiveSessions` y los avisos por asignatura.
  - El `PATCH` escribe las reglas, con su validación (`NOT_ALLOWED`), atomicidad, concurrencia y eventos.
  - La matriz del `ADMIN` gana los dos selectores y el aviso de pérdida, y la vista del `MEMBER` muestra las reglas.
  - El E2E se amplía.
- `school-subjects`:
  - La edición aplica diferencias sobre `subject_courses` y conserva las reglas de los cursos que siguen.
  - `SubjectCourse` gana `constraintCount`, la tarjeta muestra «· N reglas» y hay avisos de pérdida en la edición y en el diálogo de borrado.
- `school-courses`:
  - `CourseImpact` gana `constraintCount`, en el impacto y en el borrado.
  - `COURSE_DELETED` gana `constraint_count`.
  - El diálogo de borrado avisa de las reglas que se borran.

## Impact

- **Contrato (`docs/api-spec.yml`):** `CourseWorkloadSubject`, `CourseWorkload.calendar`, `CourseWorkloadChange`, `WorkloadWarningCode`, `SubjectCourse` y `CourseImpact`. Hay que regenerar los tipos del frontend y actualizar `api/schema.test.ts`.
- **Modelo de datos:** `backend/prisma/schema.prisma` (`SchedulingConstraint`, `ConstraintType` y la relación con `SubjectCourse`), la migración `add_scheduling_constraints` (revisada a mano, con sus `CHECK`) y `MODELO_DATOS.md`.
- **Backend:**
  - `domain/workload` (avisos por asignatura y el tipo del cambio).
  - El parser y el caso de uso de la carga.
  - `prismaCourseWorkloadRepository` (las reglas, en la misma transacción).
  - `prismaSubjectRepository` (diferencias y `constraintCount`).
  - `prismaCourseRepository` (`constraintCount` en el impacto y el borrado).
  - `deleteCourse` (el evento) y los dobles de test.
- **Frontend:**
  - `courseWorkloadService`, `utils/courseWorkloadDraft.ts`, `CourseWorkloadPage` y `WorkloadBalance` (si hace falta).
  - `subjectsService`, `SubjectsPage`, `SubjectForm`/`EditSubjectPage` y `DeleteSubjectModal`.
  - `coursesService` y `DeleteCourseModal`.
  - i18n, y los E2E `workload.cy.ts`, `subjects.cy.ts` y `courses.cy.ts`.
- **Documentación:**
  - README, arquitectura y C4.
  - Los `CLAUDE.md` de backend y frontend.
  - `docs/backend-standards.md` (clave ajena compuesta a una tabla de unión y edición por diferencias).
  - La anotación de HC3 en `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md`.
- **Infraestructura:** sin cambios; la migración la aplica el despliegue.
