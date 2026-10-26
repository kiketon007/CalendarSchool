## Why

US-SUBJECT (`docs/User_Stories_MVP.md`, épica 5; PRD §3.5 «Cargas horarias por asignatura según cursos» y glosario §7 «Asignatura/Área») es la pieza que falta entre los cursos y el bloque de horarios: las restricciones de carga (US19), la asignación de profesores (US-PROF-ASSIGN) y la vista del horario (US-ALGO-VIEW, que pide el nombre y el color de cada asignatura) necesitan que el colegio tenga sus asignaturas, en qué cursos se imparten y cuántas sesiones semanales llevan en cada uno. Hoy no existen.

## What Changes

- **Asignaturas por colegio:** nombre único en el colegio, código opcional (de 1 a 10 caracteres, único en el colegio si se rellena), tipo (`CORE`, `ELECTIVE`, `CUSTOM`), estado (`ACTIVE`, `INACTIVE`), descripción opcional y un color obligatorio de una paleta cerrada de 12 claves.
- **Cursos en los que se imparte:** al menos un curso del colegio, cada uno con sus sesiones semanales (de 1 a 5). Una sola tabla `subject_courses` con `sessions_per_week`; borrar un curso borra sus filas en cascada y la asignatura puede quedarse sin cursos.
- `POST /api/subjects` (solo `ADMIN`: `403 FORBIDDEN` para un `MEMBER`) crea la asignatura con sus cursos en una transacción; `GET /api/subjects` (los dos roles) las lista con sus cursos.
- Códigos de error nuevos `SUBJECT_ALREADY_EXISTS` y `SUBJECT_CODE_ALREADY_EXISTS` (`409`) y el código de campo genérico `OUT_OF_RANGE`.
- Frontend: enlace «Asignaturas» en la cabecera para los dos roles; `/asignaturas` (listado con filtros por tipo y estado y búsqueda por nombre o código en el cliente; solo lectura para el `MEMBER`) y `/asignaturas/nueva` (solo `ADMIN`) con el formulario (cursos con sus sesiones, 2 por defecto; color propuesto: el primero de la paleta que no usa ninguna asignatura).
- Eventos `SUBJECT_CREATED` y `SUBJECT_CREATION_REJECTED`, sin nombres, códigos ni descripciones.
- Migración `add_subjects`: tablas `subjects` y `subject_courses`, tres enums y un `CHECK` escrito a mano.

Decisiones validadas por la persona usuaria (2026-10-26) y recogidas en la ficha de US-SUBJECT: la ficha se parte en tres (crear y ver, editar e inactivar, borrar); lo que depende de las restricciones pasa a US19; los cursos aplicables son los del colegio; escribe solo `ADMIN`; código opcional y color de paleta cerrada.

**Fuera de alcance:** editar e inactivar (US-SUBJECT_b) y borrar (US-SUBJECT_c); todo lo que depende de las restricciones (prerrelleno de sesiones, «¿actualizar restricciones?», aviso de uso, borrado en cascada de restricciones y la columna «Usos», que pasan a US19); asignar asignaturas a profesores (US-PROF-ASSIGN); las consecuencias de `INACTIVE`; colores libres; paginación y búsqueda en el servidor; ver las asignaturas desde las pantallas de cursos; y cualquier cambio en la API o el diálogo de borrado de cursos.

## Capabilities

### New Capabilities

- `school-subjects`: asignaturas del colegio (modelo, reglas de los campos, cursos con sus sesiones, paleta de colores, contrato, acceso solo `ADMIN` para escribir, concurrencia, eventos y las páginas de listado y alta).

### Modified Capabilities

- `api-error-handling`: los códigos de campo admiten `OUT_OF_RANGE`, y se añaden los conflictos `SUBJECT_ALREADY_EXISTS` y `SUBJECT_CODE_ALREADY_EXISTS`.

## Impact

- **Módulos:** backend y frontend; sin cambios de infraestructura.
- **Contrato:** `docs/api-spec.yml` (`createSubject`, `listSubjects`, `CreateSubjectRequest`, `Subject`, `SubjectCourse`, los enums y los códigos nuevos). Tipos del frontend regenerados.
- **Modelo de datos:** migración `add_subjects` (dos tablas, tres enums y el `CHECK` de `sessions_per_week`). No toca las tablas existentes; `courses` gana solo la relación inversa en Prisma. `MODELO_DATOS.md` sustituye `subjects` y `subject_courses` del modelo antiguo y elimina `subject_standard_loads`.
- **Backend:** dominio `subject`, casos de uso `CreateSubject` y `ListSubjects`, `PrismaSubjectRepository`, `subjectsRouter` (con `requireRole('ADMIN')` en el `POST`), `errorHandler`, `appError.ts` y la raíz de composición.
- **Frontend:** `subjectsService`, `subjectValidation` (tabla compartida `test-fixtures/subject-fields.json`), `utils/subjectColors.ts`, `SubjectForm`, `SubjectColorSwatch`, `SubjectsPage`, `CreateSubjectPage`, rutas, `AppHeader`, i18n y E2E.
- **Documentación:** `MODELO_DATOS.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, estándares si surge un patrón nuevo, `README.md` y arquitectura.
