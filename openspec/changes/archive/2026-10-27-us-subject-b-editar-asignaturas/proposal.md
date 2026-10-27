## Why

Hoy una asignatura solo se puede crear (US-SUBJECT): si cambia el plan de estudios (otro código, otro color, otras sesiones en un curso) o deja de impartirse, no hay forma de ajustarla ni de marcarla como inactiva, y una asignatura que se quedó sin cursos al borrar uno (US08) no se puede corregir. US-SUBJECT_b (`docs/User_Stories_MVP.md`) permite editar una asignatura existente, incluido su estado. Lo justifica el PRD (§3.6: las asignaturas y sus cargas son la base de las restricciones y de la generación de horarios; el administrador configura y el miembro consulta), y conviene hacerlo antes de US19, cuyas restricciones se apoyarán en asignaturas ya ajustadas.

## What Changes

- `GET /api/subjects/{id}` (`ADMIN` y `MEMBER`) devuelve una asignatura del colegio; `404 NOT_FOUND` si el `id` no es UUID, no existe o es de otro colegio.
- `PUT /api/subjects/{id}` (solo `ADMIN`, `403` para un `MEMBER` antes de validar nada) recibe el **estado final** con la forma y el parser del alta: renombra y recodifica (`409 SUBJECT_ALREADY_EXISTS` o `SUBJECT_CODE_ALREADY_EXISTS` si otra asignatura los usa; cambiar solo mayúsculas de los propios es válido), cambia tipo, estado (inactivar y reactivar), descripción y color, y **reemplaza** sus filas de `subject_courses`. Gana el último guardado. Todo en una transacción con la asignatura `FOR UPDATE` y los cursos `FOR SHARE` en orden de `id`.
- Eventos `SUBJECT_UPDATED` (con `changed_fields` y recuentos de cursos añadidos, quitados y cambiados) y `SUBJECT_UPDATE_REJECTED`, sin nombres, códigos ni descripciones.
- Frontend: enlace «Editar» en cada asignatura de `/asignaturas` solo para `ADMIN`; página `/asignaturas/:id/editar` (bajo `RequireRole role="ADMIN"`) que reutiliza `SubjectForm` con valores iniciales, «Guardar» solo con cambios reales, el aviso de asignatura sin cursos y las sesiones originales al volver a marcar un curso que ya tenía; aviso «Asignatura «X» actualizada» al volver.
- Sin migraciones ni códigos de error nuevos (`NOT_FOUND` con la respuesta reutilizable `SubjectNotFound`).

**Fuera de alcance:** borrar una asignatura (US-SUBJECT_c), actualizar restricciones al cambiar cursos o cargas (US19), las consecuencias de `INACTIVE` (US-PROF-ASSIGN y el motor de generación), detectar conflictos entre ediciones (validado: gana el último), historial de cambios y duplicar asignaturas.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-subjects`: se añaden la lectura de una asignatura, su edición por `PUT` (campos, estado y cursos reemplazados), el acceso de cada rol a las dos operaciones nuevas, sus eventos de log, el enlace «Editar» del listado, la página de edición y sus E2E; cambian el contrato en OpenAPI, la página de listado (enlace y aviso de edición), el acceso, los eventos de log, la accesibilidad y los E2E.

## Impact

- **Contrato (`docs/api-spec.yml`):** `getSubject`, `updateSubject`, `UpdateSubjectRequest` y la respuesta `SubjectNotFound`; tipos regenerados del frontend.
- **Backend:** `domain/subject` (`SubjectNotFound`, puerto con `findById` y `update`), `application/subjects` (`GetSubject`, `UpdateSubject`, `parseUpdateSubjectRequest`), `PrismaSubjectRepository`, `subjectsRouter` (`parseSubjectId`), `errorHandler`, composición y dobles de test.
- **Frontend:** `subjectsService` (`get`, `update`), `subjectValidation` (`hasSubjectChanges` y la conversión a borrador), `SubjectForm` (modo edición), `EditSubjectPage`, `SubjectsPage`, `App.tsx`, i18n y el E2E de asignaturas.
- **Modelo de datos:** sin cambios (las tablas de US-SUBJECT bastan). **Infraestructura:** sin cambios.
