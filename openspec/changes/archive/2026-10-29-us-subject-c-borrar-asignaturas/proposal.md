## Why

Con US-SUBJECT y US-SUBJECT_b un colegio puede crear, ver y editar sus asignaturas, pero no quitar las que ya no se imparten (una de prueba, una duplicada o la de un plan de estudios que desaparece), así que el listado y los filtros acumulan asignaturas muertas y el nombre y el código quedan ocupados para siempre. US-SUBJECT_c (`docs/User_Stories_MVP.md`) cierra el CRUD con el borrado. Lo justifica el PRD (§3.6: las asignaturas son la base de las restricciones de carga y de la asignación de profesores; el administrador las configura y el miembro las consulta), y conviene hacerlo antes de US19 y US-PROF-ASSIGN, que se apoyarán en que una asignatura borrada ya no aparezca.

## What Changes

- `DELETE /api/subjects/{id}` (solo `ADMIN`, con `403` para un `MEMBER` antes de leer el `id`): borra de verdad la asignatura; sus filas de `subject_courses` caen por `ON DELETE CASCADE` y los cursos no se tocan. Responde `200` con `{ deleted: { id } }` y `no-store`; `404 NOT_FOUND` (respuesta `SubjectNotFound`) sin distinguir `id` que no es UUID, otro colegio, inexistente o ya borrada, y sin evento.
- Bloqueo solo de la fila de la asignatura (`FOR UPDATE`); no se bloquean los cursos, así que no hay ciclos con la edición ni con el borrado de un curso.
- Evento `SUBJECT_DELETED` (`school_id`, `actor_id`, `subject_id`) sin nombres ni códigos.
- Frontend: botón «Borrar {nombre}» en cada tarjeta de `/asignaturas` solo para `ADMIN` y `DeleteSubjectModal`, que usa los datos de la tarjeta (no pide nada), lista los cursos en los que se imparte y recuerda con un texto que se puede inactivar desde «Editar»; al confirmar, la lista se actualiza sin volver a pedirla, con un aviso propio y el foco en el título.
- El nombre y el código de la asignatura borrada quedan libres.
- Sin migraciones ni códigos de error nuevos.

**Fuera de alcance:** papelera o deshacer, borrar varias a la vez, impedir el borrado de una asignatura en uso (lo decidirán US19 y US-PROF-ASSIGN), borrar desde la página de edición e inactivar desde el diálogo.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-subjects`: se añaden el borrado por `DELETE`, el diálogo de confirmación y lo que hace el listado tras borrar; cambian el contrato en OpenAPI, el acceso de cada rol, los eventos de log, la página de listado (botón «Borrar»), la accesibilidad y los E2E.

## Impact

- **Contrato (`docs/api-spec.yml`):** `deleteSubject` y `DeleteSubjectResponse`; tipos regenerados del frontend.
- **Backend:** puerto `SubjectRepository` (`delete`), `application/subjects` (`DeleteSubject`), `PrismaSubjectRepository`, `subjectsRouter`, composición y dobles de test.
- **Frontend:** `subjectsService` (`delete`), `DeleteSubjectModal`, `SubjectsPage`, i18n y el E2E de asignaturas.
- **Modelo de datos:** sin cambios (la cascada de `subject_courses` existe desde US-SUBJECT). **Infraestructura:** sin cambios.
