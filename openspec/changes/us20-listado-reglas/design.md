## Context

Las reglas de reparto viven en `scheduling_constraints`, con una fila por `(asignatura, curso, tipo)` y una clave ajena compuesta a `subject_courses` en cascada. Las celdas de las franjas están en `scheduling_constraint_slots`. Hoy solo se leen curso a curso:
- `PrismaCourseWorkloadRepository.readWorkload` las lee todas las de un curso;
- `PrismaSubjectSlotsRepository.find` lee una pareja.

Los avisos son funciones puras de `domain/workload/workloadWarnings.ts`:
- `subjectWarnings(rules, day, slots)` da `BLOCK_LARGER_THAN_LOAD`, `SUBJECT_DOES_NOT_FIT` y `SLOTS_OUTSIDE_CALENDAR`;
- `preferredSlotsWarnings(preferred, forbidden)` da `PREFERRED_SLOTS_FORBIDDEN`;
- `workloadWarnings`, del curso, da `COURSE_WITHOUT_CALENDAR` y `WORKLOAD_EXCEEDS_SLOTS`.

`buildCourseWorkload` (en `application/`) las combina para la carga de un curso. La jornada se resume con `sessionGroupsOf` (`domain/calendar/sessionGroups.ts`).

US20 añade una lectura de **todo el colegio**. Es de solo lectura, para los dos roles, y reparte los avisos por regla (decisión validada el 2026-10-31). No hay migraciones.

## Goals / Non-Goals

**Goals:**
- Un único `GET /api/constraints` que lea de una vez las reglas del colegio con lo necesario para sus avisos.
- Que el listado y la carga del curso **no puedan contradecirse**. Los avisos salen de las mismas funciones puras y solo cambia a qué fila van.
- Una página `/reglas` con filtros en el cliente, siguiendo los patrones de `/cursos` (tabla o tarjetas por ancho) y de `/asignaturas` (filtros en el estado).

**Non-Goals:**
- Editar, borrar, paginar o filtrar en el servidor.
- Guardar avisos.
- Avisos de curso entero en el listado, como `WORKLOAD_EXCEEDS_SLOTS`: es un balance del curso, no de una regla, y se ve en la carga.
- Comprobar el horario completo (US-ALGO-RUN).

## Decisions

### D1. Una lectura por colegio, agrupada por pareja
La lectura es un puerto nuevo, `ConstraintListRepository.listBySchool(schoolId)`, en `domain/constraints/`, implementado por `PrismaConstraintListRepository` en `infrastructure/prisma/`. Hace **una** llamada de Prisma:
- `subjectCourse.findMany({ where: { subject: { schoolId }, constraints: { some: {} } } })`, es decir, solo las parejas con alguna regla;
- con `select` de las sesiones de la pareja;
- la asignatura (`id`, `name`, `code`, `color`, `status`);
- el curso, con su calendario (`periods.kind` por `position`);
- y las reglas de la pareja con sus celdas.

Prisma la resuelve con unas pocas consultas fijas, sin una por curso.

El repositorio devuelve un `ConstraintListSnapshot`: la lista de parejas, cada una con:
- `course`;
- `subject`;
- `sessionsPerWeek`;
- `calendar`: `{ sessionGroups }` o `null`;
- `rules`: `{ id, type, maxPerDay, blockSize, slots }`, con **todas** las celdas guardadas.

Separar las celdas dentro y fuera del calendario es lógica de dominio, igual que en `readWorkload`, pero aquí la hace la aplicación con el número de sesiones: así se prueba sin base de datos.

- **Alternativa descartada: leer la carga curso a curso** con el repositorio existente. Serían N + 1 lecturas y leería todas las asignaturas del colegio en cada curso, aunque no tengan reglas.
- **Alternativa descartada: partir de `schedulingConstraint.findMany`.** Para calcular «no cabe» hacen falta todas las reglas de la pareja, así que habría que reagrupar las filas. Partir de `subject_courses` las da ya agrupadas.
- **Aislamiento:** el filtro por `subject.schoolId` basta, porque la pareja solo une filas del mismo colegio. Además `scheduling_constraints.school_id` lo duplica, y el test de integración cubre que un colegio no ve las reglas de otro.

### D2. Repartir los avisos en `application/constraints/buildConstraintList.ts`
La función es pura y vive en `application/` porque ordena con `compareText` (`byName`), igual que `buildCourseWorkload`. Para cada pareja:
1. Calcula `sessionsPerDay` (la suma de `sessionGroups`, o 0 sin calendario) y parte las celdas de cada regla de franjas en `inside` (sesión ≤ `sessionsPerDay`) y `outside`.
2. Si el curso tiene calendario, `subjectWarnings({ sessionsPerWeek, maxPerDay, blockSize }, { sessionGroups }, { cells: forbidden.inside, outsideCount: 0 })` da los avisos de la pareja que no dependen de las celdas fuera. Con `outsideCount: 0` no mezcla las dos cuadrículas, y el recuento de cada una se añade después. Sin calendario, se llama con `day = null` y solo puede salir `BLOCK_LARGER_THAN_LOAD`.
3. Reparte según la tabla de abajo.
4. Ordena por curso, asignatura y tipo, con `TYPE_ORDER` = máximo, bloques, prohibidas y preferidas.

Reparto de los avisos:

| Aviso | MAX_PER_DAY | BLOCK | FORBIDDEN_SLOTS | PREFERRED_SLOTS |
| --- | --- | --- | --- | --- |
| `BLOCK_LARGER_THAN_LOAD` | — | sí | — | — |
| `SUBJECT_DOES_NOT_FIT` (con calendario) | sí | sí | sí | — |
| `COURSE_WITHOUT_CALENDAR` (sin calendario) | sí | sí, después del anterior | sí | sí |
| `SLOTS_OUTSIDE_CALENDAR` (con calendario y sus celdas fuera) | — | — | sí, las suyas | sí, las suyas |
| `PREFERRED_SLOTS_FORBIDDEN` (`preferredSlotsWarnings(preferred.inside, forbidden.inside)`) | — | — | — | sí |

Sin calendario no se añade `SLOTS_OUTSIDE_CALENDAR`, aunque todas las celdas estén «fuera»: `COURSE_WITHOUT_CALENDAR` ya dice que no se puede comprobar, y la ficha lo pide así. `slotCount` es `inside.length`.

- **Alternativa descartada: los avisos de la asignatura en cada fila**, como decía la ficha original. Repite avisos y pone en una regla el problema de otra. La persona usuaria eligió el reparto.
- **Alternativa descartada: una función nueva de avisos por regla en el dominio.** Duplicaría `SUBJECT_DOES_NOT_FIT`, la regla más delicada, que ya prueba la tabla compartida `test-fixtures/subject-warnings.json`. Repartir lo que dan las funciones existentes garantiza que no se contradigan.

### D3. Caso de uso, router y contrato
- **Caso de uso:** `ListConstraints` (`application/constraints/listConstraints.ts`) recibe el repositorio, llama a `listBySchool(identity.schoolId)` y devuelve `buildConstraintList(snapshot)`. No registra evento: es una lectura, como `ListSubjects`.
- **Router:** `constraintsRouter` (`presentation/constraints/`) usa `requireAuthentication` sin `requireRole` y responde `200` con `{ constraints }`. El `no-store` ya lo pone `noStore.ts`. Se monta en `app.ts` como `/constraints`, antes de `notFoundHandler`, sin `mergeParams` ni conflicto con `/courses`.
- **Contrato:** `docs/api-spec.yml` gana:
  - `listConstraints`;
  - `ConstraintType`, el enum del dominio de Prisma (hoy es un tipo de TypeScript implícito; el contrato lo nombra);
  - `SchedulingConstraint`, que reutiliza `WorkloadWarning`, `SubjectColor` y `SubjectStatus`;
  - `ListConstraintsResponse`.
  `appDoubles.ts` gana el doble de `listConstraints`.

### D4. Frontend
- **Servicio:** `services/constraintsService.ts` (`list`) valida la forma, con cada valor solo en su tipo. Lo desconocido es `unavailable`.
- **Filtros:** `utils/constraintFilters.ts` tiene `matchesConstraintFilters(rule, filters)`, `courseOptions(rules)` (cursos únicos con `compareText`, como el orden del servidor) y `hasActiveFilters`.
- **Página:** `pages/ConstraintsPage.tsx` sigue a `CoursesPage`:
  - `useMediaQuery`, con una `Table` o un `ul` de `Card` a partir de las mismas filas preparadas con `useMemo`;
  - carga única con dos `ref`s para `StrictMode`;
  - «Reintentar»;
  - los filtros en un `useState`.
- **Enlaces:** `ruleLink(rule)` da la ruta del tipo, y el texto y el `aria-label` salen del rol.
- **Avisos:** cada fila los pinta con `SubjectWarnings`. Hoy no tiene texto para `COURSE_WITHOUT_CALENDAR`, porque en la carga ese aviso lo dice `WorkloadBalance`. Se añade la clave `workload.subjectWarnings.COURSE_WITHOUT_CALENDAR` («No se puede comprobar: el curso no tiene calendario»). El nombre de la región es el de la asignatura con su regla, para que no se repita entre filas.
- **Validación de los avisos:** se reutilizan `isWorkloadWarning` y `isSlotCell`, que ya exporta `courseWorkloadService`.
- **Ruta y cabecera:** la ruta va en `App.tsx` dentro de `AuthenticatedLayout`, sin `RequireRole`. `AppHeader` gana «Reglas» después de «Asignaturas»; el `nav` ya hace `flex-wrap`.
- **Alternativa descartada: filtros en la URL**, como en alumnos. Las asignaturas no lo hacen, y la ficha lo deja en el estado. Se puede añadir sin cambiar la API.

## Risks / Trade-offs

- **[El listado y la carga se separan con el tiempo]** → D2 no reimplementa nada, y un test de integración compara, para un curso con calendario, la unión de los códigos del listado con los de la carga.
- **[Muchas reglas en un colegio grande]** → Como mucho son 4 por pareja. Unas 200 asignaturas × 12 cursos serían ~10 000 filas, pero un colegio real tiene decenas de parejas con reglas. La consulta tiene un número fijo de viajes a la base de datos y usa los índices `scheduling_constraints(school_id)` y `subject_courses(course_id)`. El rendimiento del motor (CSP < 60 s) no se ve afectado.
- **[`COURSE_WITHOUT_CALENDAR` cambia de nivel]** → En la carga es un aviso del curso y aquí va en cada regla. El código y el texto son los mismos, y la especificación lo deja explícito.
- **[Una regla de franjas sin celdas dentro del calendario]** → La regla existe mientras tenga celdas guardadas, aunque todas queden fuera. Se lista con «0 franjas» y su aviso, y se arregla en su cuadrícula.
- **[Seguridad]** → Bearer obligatorio, identidad leída de la base de datos (decisión B), `schoolId` solo de la identidad y `no-store`. Los nombres no van al log.

## Migration Plan

No hay cambios de esquema ni datos que migrar. El despliegue es el habitual: CI y después AWS. Para volver atrás basta con revertir el merge, porque el endpoint y la página son nuevos y nadie más depende de ellos.

## Open Questions

Ninguna. Las dos decisiones de la ficha (avisos por regla y `/reglas`) quedaron validadas el 2026-10-31.
