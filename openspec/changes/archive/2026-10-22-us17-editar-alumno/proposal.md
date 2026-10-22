## Why

US17 (`docs/User_Stories_MVP.md`, épica 4, PRD «Gestión de alumnos») pide mantener al día los datos de un alumno. Hoy un alumno solo se puede crear (US14): una errata en el nombre, un cambio de clase o de comedor obligan a crear otro registro, y los alumnos que se quedaron **sin curso** al borrar el suyo (US08/US14) no se pueden reasignar. Con el listado filtrable ya construido (US15), editar es el siguiente paso.

## What Changes

- `GET /api/students/{id}` para leer un alumno del colegio **con sus datos sensibles** (tipo de comida y observaciones, que el listado no trae) y `PUT /api/students/{id}` para guardar su **estado final** con las mismas reglas que el alta (`UpdateStudentRequest`), con `200 { student }`. Ambos con `Cache-Control: no-store`.
- El guardado va en una transacción que bloquea la fila del alumno (`FOR UPDATE`) y el curso con el mismo `FOR SHARE` del alta, y comprueba que la clase es de ese curso. Un alumno de otro colegio, inexistente o con un `id` que no es UUID es `404`; un curso o una clase inexistentes, de otro colegio o una clase de otro curso, `400` con `NOT_FOUND` en su campo.
- **Gana el último guardado** (como US07 y US12): sin control de versión.
- Eventos `STUDENT_UPDATED` (con los nombres de los campos cambiados) y `STUDENT_UPDATE_REJECTED`, sin nombres ni datos sensibles.
- Una página `/alumnos/:id/editar` con el `StudentForm` del alta: precarga, «Guardar» solo con cambios reales (`requireChanges`, `hasStudentChanges`), aviso bajo el curso para un alumno sin curso, «Cancelar» sin preguntar.
- Un enlace «Editar» por alumno en el listado (columna «Acciones» y tarjetas) que pasa la búsqueda de la URL del listado en el estado de la navegación; al guardar o cancelar se vuelve a `/alumnos` **con esos filtros y esa página**, y el aviso «Alumno «X» actualizado» viaja en el estado.

Decisiones validadas por la persona usuaria (2026-10-22) y recogidas en la ficha de US17.

**Fuera de alcance:** borrar un alumno (US18), también desde el formulario; control de versión o aviso de «actualizado por otro usuario»; confirmación al cancelar; «toast»; historial de cambios; edición masiva; estados y email del alumno. Sin migraciones.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-students`: nuevos requisitos de lectura y edición de un alumno (contrato, reglas, bloqueo y coherencia curso–clase, eventos y página de edición); el contrato y el acceso incluyen los dos endpoints nuevos; el listado gana la columna «Acciones» con «Editar», el regreso con los filtros y el aviso de alumno actualizado; el E2E cubre la edición.

## Impact

- **Contrato:** `docs/api-spec.yml` (`getStudent`, `updateStudent`, `UpdateStudentRequest`); sin códigos de error nuevos. Tipos del frontend regenerados.
- **Backend:** casos de uso `GetStudent` y `UpdateStudent` (con `parseUpdateStudentRequest`, que reutiliza las reglas del alta), error de dominio `StudentNotFound`, métodos `findById` y `update` del puerto `StudentRepository` y de `PrismaStudentRepository`, rutas en `studentsRouter`, `errorHandler`, raíz de composición y dobles de test.
- **Frontend:** `pages/EditStudentPage.tsx` (nuevo), `components/StudentForm.tsx` (`requireChanges` y aviso de alumno sin curso), `pages/StudentsPage.tsx` («Acciones», búsqueda en el estado y aviso), `services/studentsService.ts` (`get`, `update`), `validation/studentValidation.ts` (`hasStudentChanges`), `App.tsx`, i18n y E2E.
- **Modelo de datos:** sin migraciones; `updated_at` cambia con cada guardado.
- **Documentación:** `backend/CLAUDE.md` y `frontend/CLAUDE.md`, `docs/frontend-standards.md` (volver a un listado con filtros en la URL), `README.md`, arquitectura y la nota de US18.
