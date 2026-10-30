## Why

Un colegio necesita decir en qué franjas **no** puede ir una asignatura en un curso: Religión solo martes y jueves, Educación Física nunca a primera hora. Hoy la carga (US19) y sus reglas de máximo y bloques (US19_b) no lo permiten, y el motor de generación (US-ALGO-RUN) necesitará esta regla dura (HC7). La historia es **US19_c** de `docs/User_Stories_MVP.md` (épica 5, «Configuración de Horarios»), que desarrolla el punto del PRD sobre las restricciones de carga horaria que gestiona el administrador.

US19_b dejó preparado el terreno: `scheduling_constraints` ya tiene `FORBIDDEN_SLOTS` en su enum y la comprobación «no cabe en la semana» se escribió pensando en que las franjas quitarían días.

## What Changes

- **Base de datos:** tabla hija `scheduling_constraint_slots` (migración `add_scheduling_constraint_slots`), una celda `(día 1..5, sesión 1..8)` por fila, con clave primaria `(constraint_id, day_of_week, session_number)`, cascada desde la regla y dos `CHECK` escritos a mano. La regla `FORBIDDEN_SLOTS` existe mientras tenga alguna celda.
- **API:** `GET` y `PUT /api/courses/{courseId}/subjects/{subjectId}/forbidden-slots` (`PUT` solo `ADMIN`). El `PUT` recibe el estado final (`{ slots }`, de 0 a 40 celdas); la lista vacía borra la regla. Código de error nuevo `409 COURSE_HAS_NO_CALENDAR`.
- **Avisos:** código nuevo `SLOTS_OUTSIDE_CALENDAR` (celdas que ya no existen en el calendario actual, con su recuento); `SUBJECT_DOES_NOT_FIT` pasa a calcularse **día a día** con las franjas prohibidas y los recreos.
- **Carga de un curso (contrato ampliado, no incompatible):** cada asignatura gana `forbiddenSlots` (las celdas dentro del calendario) y el calendario gana `sessionGroups` (los tramos de sesiones entre recreos), para que la matriz enlace con el número de celdas y el frontend recalcule los avisos mientras se edita.
- **Frontend:** componente `SlotGrid` (reutilizable en US19_d), página `/cursos/:courseId/carga/:subjectId/prohibidas` con cabeceras de día y de sesión que marcan la columna o la fila, el aviso de celdas fuera del calendario y los avisos recalculados al marcar; el enlace «Franjas prohibidas (n)» en la matriz del administrador y en la vista del miembro; la vista de solo lectura para `MEMBER`.

**Correcciones a la ficha**, ya aplicadas en `docs/User_Stories_MVP.md`:
- La carga expone `forbiddenSlots` (la lista) y `calendar.sessionGroups`, no solo `forbiddenSlotCount`: el frontend repite el cálculo de avisos y necesita las celdas y los recreos.
- `SubjectSlotRule.subject` lleva también `maxPerDay` y `blockSize`, que intervienen en `SUBJECT_DOES_NOT_FIT`.
- CA5 fija la carga de «Plástica» en 2 sesiones (con 1, el aviso sería `BLOCK_LARGER_THAN_LOAD`) y CA6 dice que la sesión 6 está prohibida los cinco días (de ahí las 5 celdas fuera).

**Fuera de alcance:** franjas preferidas (US19_d), el listado de reglas (US20), franjas de curso entero o de profesor (US-PROF-AVAIL), franjas por clase, copiar franjas entre cursos, borrar las franjas de un curso sin calendario y el motor de generación (solo se anota la regla).

## Capabilities

### New Capabilities
- `forbidden-slots`: leer y guardar las franjas prohibidas de una asignatura en un curso (endpoints, validación, celdas fuera del calendario, permisos, concurrencia, eventos) y su página de cuadrícula.

### Modified Capabilities
- `scheduling-constraints`: la tabla hija de celdas y su cascada, y `SUBJECT_DOES_NOT_FIT` calculado día a día con franjas y recreos; aviso nuevo `SLOTS_OUTSIDE_CALENDAR`.
- `course-workload`: el contrato de la carga (`forbiddenSlots`, `calendar.sessionGroups`, el aviso nuevo) y el enlace a las franjas en la matriz y en la vista del miembro.

## Impact

- **Backend:** `prisma/schema.prisma` y una migración; `domain/workload/workloadWarnings.ts` (cálculo por día), el repositorio de la carga (celdas y tramos), un caso de uso, un parser y un repositorio de franjas, un router propio montado bajo `/api/courses/:courseId/subjects/:subjectId`, el nuevo código de error en `appError.ts`.
- **Frontend:** servicio, `utils/courseWorkloadDraft.ts` (misma regla de avisos), `components/SlotGrid.tsx`, `pages/ForbiddenSlotsPage.tsx`, la ruta en `App.tsx`, los enlaces de `CourseWorkloadPage` e i18n.
- **Contrato:** `docs/api-spec.yml` (dos operaciones, `SubjectSlotRule`, campos nuevos de la carga, `COURSE_HAS_NO_CALENDAR` y `SLOTS_OUTSIDE_CALENDAR`).
- **Modelo de datos:** una tabla nueva; `MODELO_DATOS.md`.
- **Infraestructura:** ninguna; el despliegue aplica la migración como siempre.
