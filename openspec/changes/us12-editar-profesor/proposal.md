## Why

US12 (`docs/User_Stories_MVP.md`, épica 3, PRD §3.3 «Gestión de profesores») pide mantener al día los datos de un profesor. Hoy un profesor solo se puede crear (US09): una errata en el nombre, un cambio de cargo o de tutoría obligan a crear otro registro. Con el listado, la tutoría y la búsqueda ya construidos (US10, US11), editar es el siguiente paso de la gestión de profesores.

## What Changes

- `GET /api/professors/{id}` para leer un profesor del colegio y `PUT /api/professors/{id}` para guardar su **estado final** `{ firstName, lastName, position, classId }` (`null` quita el cargo o la tutoría; `classId` ausente no toca la tutoría), con la respuesta `{ professor, replacedTutor }`.
- **Mover la tutoría a cualquier clase del colegio**: en una transacción se libera la clase que tutorizaba y se asigna la nueva; si tenía otro tutor, ese profesor la pierde (`replacedTutor`). Al **crear** se siguen ofreciendo solo clases libres (US09).
- **Gana el último guardado** (como US07): sin control de versión. Un profesor de otro colegio, inexistente o con un `id` que no es UUID es `404`; una clase que no existe en el colegio, `400` en `classId`.
- Eventos `PROFESSOR_UPDATED` (con los campos cambiados y si se desplazó a otro tutor) y `PROFESSOR_UPDATE_REJECTED`, sin nombres.
- Un formulario `ProfessorForm` compartido por la creación y la edición (extraído de `CreateProfessorPage`) y una página `/profesores/:id/editar`: precarga, «Guardar» solo con cambios, «Cancelar» sin preguntar, clases de otro tutor marcadas como «A · tutor: Luis Pérez» con un aviso al elegirlas, y vuelta a `/profesores` con «Profesor «X» actualizado» (y quién quedó sin tutoría).
- Un enlace «Editar» por profesor en el listado, en una columna nueva «Acciones».

Decisiones validadas por la persona usuaria (2026-10-21) y recogidas en la ficha de US12.

**Fuera de alcance:** asignaturas (`US-PROF-ASSIGN`) y la revisión de asignaciones; estados, fechas y email; control de versión o aviso de «actualizado por otro usuario»; confirmación al cancelar; borrar un profesor (US13); alumnos (US14).

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-professors`: nuevos requisitos de lectura y edición de un profesor (contrato, reglas, movimiento de la tutoría, eventos y página de edición); el contrato y el acceso incluyen los dos endpoints nuevos; el listado gana la columna «Acciones» con «Editar» y el aviso de profesor actualizado; el E2E cubre la edición.

## Impact

- **Contrato:** `docs/api-spec.yml` (`getProfessor`, `updateProfessor`, `UpdateProfessorRequest`, `UpdateProfessorResponse`); sin códigos de error nuevos. Tipos del frontend regenerados.
- **Backend:** casos de uso `GetProfessor` y `UpdateProfessor` (con `parseUpdateProfessorRequest`), error de dominio `ProfessorNotFound`, métodos `findById` y `update` del puerto `ProfessorRepository` y de `PrismaProfessorRepository`, rutas en `professorsRouter`, `errorHandler`, raíz de composición.
- **Frontend:** `components/ProfessorForm.tsx` (nuevo), `pages/EditProfessorPage.tsx` (nuevo), `pages/CreateProfessorPage.tsx` (usa el formulario), `pages/ProfessorsPage.tsx` («Acciones» y aviso), `services/professorsService.ts` (`get`, `update`), `validation/professorValidation.ts` (`hasProfessorChanges`), `App.tsx`, i18n y E2E.
- **Modelo de datos:** sin migraciones; cambia cómo se escribe `classes.tutor_id` (también desde la edición del profesor).
- **Documentación:** estándares, `CLAUDE.md` de backend y frontend, `MODELO_DATOS.md`, `README.md`, arquitectura y notas de US13 y `US-PROF-ASSIGN`.
