## Context

- **Backend:** los profesores viven en `professors` y su tutoría en `classes.tutor_id` (nulo, único, `ON DELETE SET NULL`): borrar la fila del profesor deja su clase sin tutor sin tocarla. `PrismaProfessorRepository` ya tiene `findById` y `update`, que bloquea la fila del profesor con `SELECT … FOR UPDATE`. `professorsRouter` tiene `parseProfessorId` (UUID o `ProfessorNotFound` → `404`). Los cursos ya tienen un borrado real con el mismo patrón (US08: `CourseRepository.delete` bloquea, cuenta y borra, devuelve lo borrado o `null`).
- **Frontend:** `ProfessorsPage` tiene la columna «Acciones» con «Editar», el total, la búsqueda y la paginación sobre la lista cargada, y lee avisos de la navegación. `DeleteCourseModal` (US08) es un diálogo que hace sus propias peticiones (impacto al abrirse, borrado al confirmar), con guarda síncrona, y la página mueve el foco al título un turno después de `onExited`.
- Decisiones de producto (ficha de US13): borrado real, el diálogo consulta la tutoría al abrirse, sin límite de borrados.

## Goals / Non-Goals

**Goals:**

- Un borrado real, atómico y seguro frente a la edición simultánea, que informe de lo que se liberó de verdad.
- Un diálogo con datos al día, que no deja confirmar a ciegas, y una lista que se actualiza sin volver a pedirse.
- Repetir el patrón de US08 para que borrar un curso y un profesor se comporten igual.

**Non-Goals:**

- Borrado lógico, deshacer, borrado múltiple, límite de borrados, tiempo real.
- Alumnos y horarios (no existen todavía).

## Decisions

### 1. Contrato: `200` con lo liberado, no `204`

`DELETE /api/professors/{id}` responde `{ deleted: { freedClass: { id, name, courseName } | null } }`, leído dentro de la transacción que borra, como `DELETE /api/courses/{id}` devuelve lo que borró. El aviso final dice lo que pasó de verdad aunque la tutoría cambiara después de abrir el diálogo. No hay endpoint de impacto: la consulta del diálogo es `GET /api/professors/{id}` (US12), que ya trae `tutoredClass`.

*Alternativa descartada:* `204` sin cuerpo. Obligaría al aviso a usar la tutoría que vio el diálogo, que puede estar desfasada.

*Alternativa descartada:* un `GET /api/professors/{id}/impact` como el de los cursos. Hoy el único impacto es la clase que se libera, que ya está en el profesor; cuando haya alumnos u horarios (US14 y siguientes) podrá añadirse.

### 2. Puerto y transacción

`ProfessorRepository.delete(schoolId, professorId): Promise<DeletedProfessor | null>`, con `DeletedProfessor = { freedClass: { id, name, courseName } | null }`. En un `$transaction`:

1. `SELECT id FROM professors WHERE id = $1 AND school_id = $2 FOR UPDATE` (`$queryRaw`): sin fila → `null`. Una edición (`PUT`) simultánea del mismo profesor espera este bloqueo y, si el borrado confirma primero, no encuentra la fila (`404`); de dos borrados, el segundo no encuentra nada.
2. Leer la clase que tutoriza (`schoolClass.findFirst({ where: { tutorId }, select: { id, name, course: { name } } })`).
3. `professor.delete`: la clave ajena pone `classes.tutor_id` a `NULL` en la misma sentencia; no se escribe la clase a mano.

`DeleteProfessor` traduce `null` en `ProfessorNotFound` (`404`, sin evento) y registra `PROFESSOR_DELETED` con `freed_class`. La ruta usa `parseProfessorId`.

*Alternativa descartada:* `UPDATE classes SET tutor_id = NULL` explícito antes del `DELETE`, como proponía la ficha original. Duplica lo que ya garantiza la clave ajena y abre la puerta a olvidarlo en otro camino de borrado.

### 3. `DeleteProfessorModal`, a imagen de `DeleteCourseModal`

Recibe `professor` (`{ id, name }` o `null` = cerrado), `onDeleted(professor, freedClass)`, `onGone`, `onCancel` y `onExited`. Siempre montado y gobernado por `show` (para que react-bootstrap devuelva el foco al botón al cancelar), foco inicial en «Cancelar», sin «X», título como nombre. Hace sus propias peticiones: al abrirse, `professorsService.get` una sola vez por apertura (clave `id:intento` en una `ref`, para `StrictMode` y para descartar respuestas de una apertura anterior); al confirmar, `professorsService.delete` con guarda síncrona (`ref`), «Borrando…» y `backdrop="static"`/`keyboard={false}` mientras dura. Un `404` en cualquiera de los dos pasos llama a `onGone`; otro fallo se queda dentro con un `role="alert"`.

*Alternativa descartada:* generalizar `DeleteCourseModal` en un diálogo común. Los textos, las consultas y lo que se muestra difieren; un componente genérico con muchos parámetros sería más difícil de leer que dos diálogos pequeños con el mismo patrón. Se anota en `frontend-standards.md` el patrón, no un componente.

### 4. La página tras borrar

`ProfessorsPage` guarda el profesor que se borra (`useState`), pasa `onDeleted`, que quita al profesor de la lista cargada (`setList` con `filter`), fija el aviso de la página (`pageNotice`, con prioridad sobre el de la navegación, como `CoursesPage`) y marca que hay que mover el foco; `onExited` lleva el foco al `h1` (`tabIndex={-1}`) con `setTimeout(…, 0)`, porque react-bootstrap suelta la captura de foco justo después de `onExited`. La búsqueda y la paginación se recalculan solas: el filtro y `Math.min(page, pageCount)` ya trabajan sobre la lista cargada. `onGone` muestra «Ese profesor ya no existe» y vuelve a pedir la lista (`retry`).

## Risks / Trade-offs

- [Borrar sin querer] → título con el nombre, la tutoría que se pierde, «no se puede deshacer» y foco inicial en «Cancelar».
- [El foco tras borrar no se reproduce en jsdom] → se prueba el `setTimeout` en el test de componente y con `have.focus` en el E2E, como en US08.
- [Una edición de curso (US09_b) abierta con este profesor como tutor] → al guardar recibe `400 classes[<i>].tutorId: NOT_FOUND`, que ya muestra en la fila; no hace falta nada nuevo.
- [Cuando existan alumnos u horarios] → el diálogo tendrá que contar lo que se pierde; se deja nota en US14 y en las historias de horarios.

## Migration Plan

Sin migraciones. Despliegue normal (backend en Lambda y frontend en S3). Para volver atrás basta con revertir el commit.

## Open Questions

Ninguna: las decisiones de producto están validadas en la ficha de US13 (2026-10-21).
