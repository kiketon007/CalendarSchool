## Context

- **Backend:** el puerto `StudentRepository` (`domain/student/studentRepository.ts`) tiene `create`, `findById`, `update` y `listBySchool`. `PrismaStudentRepository.update` (US17) bloquea el curso destino `FOR SHARE` y después la fila del alumno `FOR UPDATE` con `$queryRaw`, filtrando por colegio. `StudentNotFound` ya existe y `errorHandler` lo traduce a `404 NOT_FOUND`; `parseStudentId` (`z.uuid()`) ya convierte un `id` no válido en `StudentNotFound` antes de llamar al caso de uso. Los profesores tienen el patrón de borrado completo (US13: `DeleteProfessor`, `ProfessorRepository.delete`, `FOR UPDATE` y `PROFESSOR_DELETED` sin nombres). Las respuestas de `/api` llevan `Cache-Control: no-store`.
- **Base de datos:** `students` no tiene tablas hijas. Sus claves ajenas son hacia `schools`, `courses` (`ON DELETE SET NULL`) y `classes` (`ON DELETE SET NULL`). El borrado de un curso (US08) bloquea el curso `FOR UPDATE` y, al borrarlo, la base de datos pone a `NULL` el `course_id` y el `class_id` de sus alumnos (escribe sus filas).
- **Frontend:** `StudentsPage` (US15 y US17) pide la lista una vez, deriva los filtros y la página de la URL validándolos contra los alumnos cargados (`filtersFromParams`, `courseOptions`, `classOptions`), pagina en el navegador y tiene la columna «Acciones» con el enlace «Editar». `DeleteProfessorModal` y `ProfessorsPage` son la referencia del diálogo y de la actualización de la lista sin volver a pedirla (US13).
- **Decisiones de producto** (ficha de US18, 2026-10-22): borrado real, el diálogo no consulta al alumno, «Borrar» solo en el listado y los filtros que se vacían se conservan.

## Goals / Non-Goals

**Goals:**

- Borrar de verdad a un alumno con el mismo aislamiento por colegio y el mismo `404` indistinguible que cursos y profesores.
- Serializar el borrado con la edición y con otro borrado del mismo alumno sin interbloqueos con el borrado o la edición de cursos.
- No exponer ni registrar datos sensibles al borrar.
- Mantener intactos la URL, la búsqueda y el contexto del listado tras borrar.

**Non-Goals:**

- Baja lógica, papelera, deshacer, borrado masivo, «Borrar» en la edición, consulta de impacto en el diálogo (horarios).
- Migraciones o índices nuevos.

## Decisions

### 1. Contrato: `DELETE` sin cuerpo, `200 { deleted: { id } }`

`deleteStudent` reutiliza el parámetro `StudentId` y la respuesta `StudentNotFound` de US17, y declara `DeleteStudentResponse` (`{ success: true, data: { deleted: { id } } }`). Se responde `200` con el `id` borrado, y no `204`, para seguir el formato común de la API (`success`/`data`) que usan los borrados de cursos y profesores; al no haber nada que liberar ni contar, el `id` es lo único que informa de lo borrado. Sin códigos de error nuevos.

*Alternativa descartada:* `204 No Content`. Rompería el formato común y obligaría a un caso especial en el cliente.

### 2. Puerto: `delete(schoolId, studentId): Promise<boolean>`

`true` si borró la fila; `false` si el alumno no es del colegio o no existe (no se borra nada). El caso de uso convierte `false` en `StudentNotFound`. No devuelve más datos porque no hay nada que liberar, y así el repositorio no lee nunca los datos sensibles para borrar.

*Alternativa descartada:* devolver el `Student` borrado (como hace `update` con `before`). Leería `foodType` y `observations` sin necesidad y tentaría a registrarlos.

### 3. Transacción y bloqueo en `PrismaStudentRepository.delete`

En una transacción: `SELECT id FROM students WHERE id = $id AND school_id = $school FOR UPDATE` (si no hay fila, `false`) y `student.delete({ where: { id } })`.

- **Solo se bloquea la fila del alumno.** No hay ciclo con el borrado de un curso (curso `FOR UPDATE` → filas de sus alumnos): el borrado del alumno no necesita el curso. Tampoco con la edición (curso `FOR SHARE` → alumno `FOR UPDATE`): el borrado no espera nada que tenga la edición salvo la propia fila. Gana quien bloquee primero la fila; el otro, al obtenerla, ve que ya no existe (`404`) o, si es el borrado del curso, ya no tiene ese alumno que actualizar.
- El `FOR UPDATE` previo (y no solo un `deleteMany` filtrando por colegio) mantiene el patrón de US08 y US13 y deja claro el orden: una edición en espera no puede guardar después sobre una fila borrada.
- *Alternativa descartada:* `deleteMany({ where: { id, schoolId } })` y mirar `count`. Es atómico y también da `404` al segundo, pero se aparta del patrón del proyecto y es menos explícito con la edición concurrente.
- La concurrencia se prueba en integración con `Promise.all` (dos borrados; borrado y `PUT`; borrado del alumno y de su curso, repetido varias veces) y la atomicidad con un disparador `BEFORE DELETE` que lanza un error, como en US13.

### 4. Caso de uso `DeleteStudent` y evento

`DeleteStudent.execute({ schoolId, actorId, studentId })` llama a `delete`; `false` → `StudentNotFound` sin evento; `true` → `STUDENT_DELETED` con `school_id`, `actor_id` y `student_id`. No recibe ni conoce nombres ni datos del alumno, así que no puede registrarlos.

### 5. Ruta

`studentsRouter` añade `DELETE /:id` con `parseStudentId` y `sendSuccess(res, { deleted: { id } })`. `requireAuthentication` ya cubre el router; no exige la cabecera `Origin` (como el resto de rutas autenticadas con Bearer).

### 6. Frontend: `DeleteStudentModal` sin consulta previa

Componente siempre montado y controlado por `student: { id; name } | null` (`name` = «Nombre Apellidos» de la fila), con `onDeleted(student)`, `onGone()`, `onCancel()` y `onExited`. Copia de `DeleteProfessorModal` lo que no depende de la consulta: el último alumno pintado mientras se anima el cierre, `deletingRef` como guarda síncrona, `mounted` para no actualizar tras desmontar, `backdrop="static"` y `keyboard={false}` mientras borra, el foco inicial en «Cancelar» y el `role="alert"` del fallo, que se limpia al reabrir con otro alumno. Sin estados de carga ni «Reintentar» de la consulta.

*Alternativa descartada (decisión de producto):* consultar `GET /api/students/{id}` al abrir, como US13. No hay nada que avisar y traería al navegador los datos sensibles.

### 7. Frontend: `StudentsPage` tras borrar

- `studentToDelete` en el estado; el botón «Borrar» (`deleteButton(row)`) va junto a `editLink(row)` en la celda «Acciones» y en el `Card.Footer`. `StudentRow` gana `fullName` («Nombre Apellidos») para el diálogo y el aviso.
- **Catálogo de la lista tal como se cargó:** el estado `loaded` guarda `catalog` (la respuesta de `GET /api/students`) y `students` (la lista actual). `filtersFromParams`, `courseOptions` y `classOptions` reciben `catalog`; las filas, el total y la página, `students`. Al borrar solo cambia `students`; al volver a pedir la lista (reintento o `404`), los dos vuelven a ser la respuesta. Así un filtro por un curso que se queda sin alumnos sigue aplicado y su opción sigue en el desplegable hasta recargar, y la URL no se toca.
- **Aviso de página:** `pageNotice` (`{ kind: 'deleted', name } | { kind: 'gone' }`) tiene prioridad sobre el aviso de llegada (`noticeFrom(location.state)`), que no se muestra mientras haya uno de página. No se escribe en la URL ni en el historial: `writeUrl` sigue conservando el estado de llegada tal cual.
- **Foco:** tras `onDeleted` se cierra el diálogo y, un turno después (`onExited` o `setTimeout(0)`, como US13), el foco va al `h1` (`tabIndex={-1}`). Al cancelar, el `Modal` de Bootstrap devuelve el foco al botón que lo abrió.
- `onGone` cierra el diálogo, pone el aviso «Ese alumno ya no existe» y vuelve a pedir la lista con el mecanismo de reintento existente (`attempt + 1`).
- `studentsService.delete(authorizedFetch, id)` envía `DELETE` sin cuerpo y devuelve `deleted`, `notFound`, `unauthenticated` o `unavailable` (cualquier otra respuesta o un `200` con otra forma).

*Alternativa descartada:* validar la URL contra la lista actual (como hasta ahora). Al borrar al último alumno del curso filtrado, el filtro dejaría de aplicarse y el listado saltaría a todos los alumnos.

## Risks / Trade-offs

- **[Borrado accidental, irreversible]** → diálogo con «Cancelar» como foco inicial, botón `outline-danger` y «Esta acción no se puede deshacer». Aceptado sin deshacer (decisión de producto).
- **[Datos sensibles]** → ni el diálogo ni el repositorio los leen; el evento solo lleva identificadores; un test de integración comprueba que el log no contiene el nombre ni el tipo de comida.
- **[Interbloqueo con cursos]** → el borrado solo bloquea la fila del alumno; test de integración con borrado del alumno y de su curso a la vez, repetido.
- **[Desplegable con un curso sin alumnos]** → aceptado hasta recargar la lista: es el precio de conservar el filtro. Un curso que ya no existe en la base de datos también se sigue ofreciendo hasta recargar, como hasta ahora con los datos cargados.
- **[Edición abierta de un alumno borrado]** → la edición ya responde «Este alumno no existe o ya no está disponible» al guardar (US17).
- **Seguridad:** el colegio sale de la identidad y filtra el propio `SELECT … FOR UPDATE`; el `404` no distingue otro colegio de inexistente; un `id` no UUID no llega a la base de datos.
- **Rendimiento:** un bloqueo y un `DELETE` por clave primaria; sin índices nuevos. El listado no se vuelve a pedir tras un borrado correcto.

## Migration Plan

Sin migraciones ni cambios de infraestructura. Se despliega con el flujo habitual (CI, `prisma migrate deploy` sin migraciones pendientes, CDK, S3 y smoke test). Rollback: desplegar el commit anterior; el endpoint nuevo desaparece y los alumnos ya borrados no se recuperan (como en US08 y US13).

## Open Questions

Ninguna. Las decisiones están validadas en la ficha de US18.
