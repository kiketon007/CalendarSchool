## Why

US18 (`docs/User_Stories_MVP.md`, épica 4, PRD «Gestión de alumnos») pide poder borrar a un alumno que ya no está en el colegio. Hoy un alumno se puede crear (US14), listar y filtrar (US15) y editar (US17), pero no eliminar: los registros de alumnos que se fueron se acumulan en el listado y en los filtros, y siguen guardando datos de menores (incluidos el tipo de comida y las observaciones, datos sensibles) que ya no hacen falta.

## What Changes

- `DELETE /api/students/{id}` borra **de verdad** al alumno del colegio en una transacción con la fila bloqueada (`FOR UPDATE`, filtrando por colegio) y responde `200 { deleted: { id } }` con `Cache-Control: no-store`. Un alumno de otro colegio, inexistente, ya borrado o con un `id` que no es UUID es `404` indistinguible; sin sesión, `401`. Sin cuerpo en la petición ni códigos de error nuevos.
- El borrado solo bloquea la fila del alumno: una edición o un segundo borrado simultáneos esperan y responden `404` si el borrado confirma antes, y no puede interbloquearse con el borrado de un curso ni con la edición.
- Evento `STUDENT_DELETED` solo con identificadores (`school_id`, `actor_id`, `student_id`); un `404` no deja evento.
- Un botón «Borrar» (`outline-danger`, `aria-label` «Borrar {Apellidos, Nombre}») junto a «Editar» en cada fila y cada tarjeta de `/alumnos`, que abre un diálogo de confirmación (`DeleteStudentModal`) **sin consultar al alumno**: título «¿Borrar a {Nombre Apellidos}?», «Esta acción no se puede deshacer», foco inicial en «Cancelar», una sola confirmación y guarda contra la doble pulsación.
- Tras borrar, el alumno sale de la lista cargada **sin volver a pedirla**, la URL del listado (filtros y página) y el texto de búsqueda no se tocan, un aviso dice «Alumno «X» eliminado» y el foco pasa al título. La URL y los desplegables de filtros se validan contra la lista **tal como se cargó**, para que un filtro cuyo curso o clase se queda sin alumnos siga aplicado (resultado vacío con «Limpiar filtros») en lugar de saltar a todos los alumnos.
- Un `404` al confirmar cierra el diálogo, avisa «Ese alumno ya no existe» y vuelve a pedir la lista; cualquier otro fallo se queda en el diálogo y se puede reintentar.

Decisiones validadas por la persona usuaria (2026-10-22) y recogidas en la ficha de US18: borrado real, diálogo sin consulta previa y «Borrar» solo en el listado.

**Fuera de alcance:** baja lógica o papelera y deshacer; «Borrar» en la página de edición; doble confirmación; «toast»; sincronización automática del listado; borrado masivo; límite de borrados por minuto; la consulta de impacto en el diálogo (llegará cuando existan los horarios). La ficha anterior hablaba de una tabla `students_meals` y de «registros de comedor» que no existen: el comedor, la beca y el tipo de comida son columnas del propio alumno. Sin migraciones.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `school-students`: nuevo requisito de borrado de un alumno (contrato, borrado real con bloqueo, aislamiento, concurrencia y evento) y del diálogo de confirmación; el contrato y el acceso incluyen el endpoint nuevo; el listado gana «Borrar» junto a «Editar», el aviso de alumno eliminado y la validación de los filtros contra la lista tal como se cargó; el E2E cubre el borrado.

## Impact

- **Contrato:** `docs/api-spec.yml` (`deleteStudent`, `DeleteStudentResponse`); sin códigos de error nuevos. Tipos del frontend regenerados.
- **Backend:** caso de uso `DeleteStudent`, método `delete` del puerto `StudentRepository` y de `PrismaStudentRepository`, ruta `DELETE /:id` en `studentsRouter`, raíz de composición y dobles de test. `StudentNotFound` y su `404` ya existen (US17).
- **Frontend:** `components/DeleteStudentModal.tsx` (nuevo), `pages/StudentsPage.tsx` (botón, diálogo, aviso, foco y catálogo de filtros), `services/studentsService.ts` (`delete`), i18n y E2E.
- **Modelo de datos:** sin migraciones; `students` no tiene tablas hijas.
- **Documentación:** `backend/CLAUDE.md` y `frontend/CLAUDE.md`, `README.md`, arquitectura (`ARQUITECTURA_COMPLETA.md`, `DIAGRAMA_C4.md` y el DSL) y la ficha de US18.
