## Why

Un colegio quiere decir en qué franjas **es mejor** que vaya una asignatura en un curso: Matemáticas por la mañana, Educación Física después del recreo. Las franjas prohibidas (US19_c) dicen dónde no puede ir, pero no dónde se prefiere, y el motor de generación (US-ALGO-RUN) necesitará esta regla blanda (SC4). La historia es **US19_d** de `docs/User_Stories_MVP.md` (épica 5, «Configuración de Horarios»), que desarrolla el punto del PRD sobre las restricciones que gestiona el administrador.

US19_b y US19_c dejaron casi todo hecho: `PREFERRED_SLOTS` ya está en el enum de `scheduling_constraints`, las celdas tienen su tabla hija (`scheduling_constraint_slots`) y la cuadrícula (`SlotGrid`), el router de franjas y su repositorio se escribieron pensando en un segundo tipo. **No hay migraciones.**

## What Changes

- **API:** `GET` y `PUT /api/courses/{courseId}/subjects/{subjectId}/preferred-slots` (`PUT` solo `ADMIN`), con el mismo cuerpo, validación, códigos, bloqueos y eventos que las prohibidas. La lectura añade `forbiddenSlots` (las celdas prohibidas de la pareja) para pintarlas. El servidor **acepta** guardar una preferida prohibida: gana la prohibida y se avisa. Sin códigos de error nuevos.
- **Aviso nuevo `PREFERRED_SLOTS_FORBIDDEN`** (con el recuento): hay franjas preferidas que también están prohibidas y se ignorarán. Se ve en la página de preferidas y en la carga del curso.
- **Carga de un curso (contrato ampliado, no incompatible):** cada asignatura gana `preferredSlotCount`; `SLOTS_OUTSIDE_CALENDAR` cuenta las celdas fuera del calendario de las dos reglas de franjas.
- **Lo común se comparte por tipo:** el repositorio, los casos de uso y la página de franjas reciben el tipo (`FORBIDDEN_SLOTS` o `PREFERRED_SLOTS`) en lugar de duplicarse. `SUBJECT_SLOTS_UPDATE_REJECTED` gana `type`, como ya lo tenía `SUBJECT_SLOTS_UPDATED`.
- **Frontend:** `SlotGrid` gana el modo «preferidas». En ese modo una celda prohibida se ve como «Prohibida» y su botón está deshabilitado con el motivo en su nombre accesible, y una preferida que después se prohibió se ve como «Preferida · prohibida, se ignora» y se puede desmarcar. Las cabeceras de día y de sesión no marcan las celdas prohibidas. Además:
  - una página `/cursos/:courseId/carga/:subjectId/preferidas`, la misma de las prohibidas con otro tipo;
  - el enlace «Franjas preferidas (n)» junto al de las prohibidas, en la matriz y en la vista del miembro;
  - la vista de solo lectura para `MEMBER`.

**Correcciones a la ficha**, ya aplicadas en `docs/User_Stories_MVP.md`:
- `forbiddenSlots` es un campo **opcional** de `SubjectSlotRule`, presente solo en la lectura de las preferidas, en lugar de un esquema nuevo. Evita duplicar el esquema, y el contrato ya usa este patrón en `WorkloadWarning`.
- No hay `pages/PreferredSlotsPage.tsx`: la página de las prohibidas pasa a ser `SubjectSlotsPage` y recibe el tipo. La ficha marca la duplicación como riesgo.
- Lo que la ficha no decía:
  - `PREFERRED_SLOTS_FORBIDDEN` también sale en la carga del curso.
  - `SLOTS_OUTSIDE_CALENDAR` suma las dos reglas en la carga.
  - Las cabeceras no marcan celdas prohibidas.
  - El evento de rechazo lleva `type`.
  - La página de las prohibidas no avisa de las preferidas que tapa.

**Fuera de alcance:**
- Pesos o prioridades entre preferencias.
- Preferencias de profesor (US-PROF-AVAIL), de curso entero o por clase.
- Avisar en la página de prohibidas de las preferidas que se van a ignorar.
- Copiar franjas entre cursos.
- El listado de reglas (US20).
- El motor de generación: solo se anota SC4.

## Capabilities

### New Capabilities
- `preferred-slots`: leer y guardar las franjas preferidas de una asignatura en un curso, su contradicción con las prohibidas (aviso y estado de la celda) y su página.

### Modified Capabilities
- `scheduling-constraints`: la tabla de celdas guarda también las de `PREFERRED_SLOTS`, y una pareja puede tener las dos reglas de franjas a la vez.
- `forbidden-slots`: `SlotGrid` gana el modo «preferidas» y `SUBJECT_SLOTS_UPDATE_REJECTED` lleva `type`.
- `course-workload`: `preferredSlotCount`, el aviso `PREFERRED_SLOTS_FORBIDDEN`, `SLOTS_OUTSIDE_CALENDAR` sumando las dos reglas, y el enlace a las preferidas en la matriz y en la vista del miembro.

## Impact

- **Backend:** el repositorio de franjas y sus casos de uso reciben el tipo (`GetSubjectSlots`/`UpdateSubjectSlots` sustituyen a los de prohibidas). `buildSubjectSlotRule` añade `forbiddenSlots` y el aviso nuevo. El router de franjas sirve las dos rutas. El repositorio de la carga lee las celdas preferidas. Hay una función pura nueva para el aviso de contradicción.
- **Frontend:** `slotsService` (con el tipo), `SlotGrid` (modo preferidas), `ForbiddenSlotsPage` → `SubjectSlotsPage`, la ruta nueva en `App.tsx`, `utils/courseWorkloadDraft.ts` (conserva el aviso nuevo), los enlaces de `CourseWorkloadPage`, `SubjectWarnings` e i18n.
- **Contrato:** `docs/api-spec.yml`:
  - dos operaciones nuevas;
  - `SubjectSlotRule.forbiddenSlots`;
  - `CourseWorkloadSubject.preferredSlotCount`;
  - `PREFERRED_SLOTS_FORBIDDEN` en `WorkloadWarningCode`.
- **Modelo de datos:** sin cambios de esquema; `MODELO_DATOS.md` documenta que la tabla de celdas guarda también las preferidas.
- **Docs:** `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` (SC4) y `docs/User_Stories_MVP.md`.
- **Infraestructura:** ninguna.
