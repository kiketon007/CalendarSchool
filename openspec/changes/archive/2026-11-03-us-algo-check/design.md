## Context

US-ALGO-CHECK es la primera historia de la generación automática. Las comprobaciones ya existen, pero repartidas y calculadas sobre lecturas distintas:
- `buildCourseWorkload` y `workloadWarnings`/`subjectWarnings` (`domain/workload/`) en la carga de cada curso;
- `buildConstraintList` en el listado de reglas;
- `teachingLoadOf` y las celdas sin profesor en el resumen de carga.

Ninguna cruza las franjas prohibidas de una asignatura con la disponibilidad de su profesor, y el estado `INACTIVE` de una asignatura hoy no cambia nada en ellas. El motor (US-ALGO-RUN) necesitará justo estos datos, así que la lectura de esta historia es la entrada del motor.

## Goals / Non-Goals

**Goals:**
- Una sola lectura del colegio (la foto del problema) que reutilizará el motor.
- Una función pura con todas las comprobaciones, probada con una tabla de casos, que reutilice la lógica existente sin copiarla.
- Una página que diga si se puede generar y lleve a corregir cada problema.

**Non-Goals:**
- Generar (US-ALGO-RUN), corregir desde la página, alinear la carga del curso y el resumen con la regla de las inactivas (US-SUBJECT_d), aulas.
- Garantizar que exista un horario: la comprobación es necesaria, no suficiente.

## Decisions

### 1. Capas

| Pieza | Capa | Motivo |
|---|---|---|
| `SchedulingProblem` y `SchedulingProblemRepository` | `domain/schedule/` | La entrada del motor es del dominio de la generación, no de los profesores ni de la carga. |
| `readinessOf`, `unavailableCellsOf` | `domain/schedule/` | Reglas puras (como `teachingLoadOf`); el comparador de nombres se inyecta porque `compareText` es de `application`. |
| `PrismaSchedulingProblemRepository` | `infrastructure/prisma/` | Las consultas y `translateDatabaseErrors`. |
| `GetScheduleReadiness` | `application/schedule/` | Lee la foto y llama a `readinessOf` con `compareText`. |
| `scheduleRouter` (`/schedule`) | `presentation/schedule/` | El recurso de la generación tendrá más rutas (US-ALGO-RUN: crear, consultar y cancelar una generación). |

### 2. La foto guarda datos en bruto, no avisos

El repositorio devuelve lo guardado: los periodos del calendario, las celdas prohibidas y preferidas tal como están y los tramos en minutos. Los cálculos (sesiones por día, celdas fuera del calendario, celdas no disponibles) los hace el dominio. Así el motor recibe lo mismo y decide con la misma regla.

**Alternativa descartada:** reutilizar `buildCourseWorkload` curso a curso, que ya resume el calendario. Haría una lectura por curso y daría al motor una forma pensada para otra pantalla.

### 3. Reutilizar las funciones existentes, no copiarlas

- `workloadWarnings({ assignedSessions, availableSessions })` → carga del curso.
- `subjectWarnings(rules, { sessionGroups }, { cells, outsideCount })` → bloques y «no cabe»; una segunda llamada con las celdas prohibidas más las del profesor da «no cabe con su profesor».
- `preferredSlotsWarnings` → preferidas prohibidas.
- `sessionGroupsOf(kinds)` → los tramos del calendario.
- `teachingLoadOf(assignments, unavailable, compareNames)` → 23 h, disponibilidad y varios calendarios, con solo las asignaturas activas.

La única regla nueva es `unavailableCellsOf(calendar periods, intervals)`: la celda `(día, n)` no está disponible si la sesión `n` se solapa con un tramo de ese día. Es la misma regla de solape que `teachingLoadOf`, y por eso vive junto a ella.

### 4. Las inactivas se filtran al principio

`readinessOf` separa primero las asignaturas inactivas (que solo producen `SUBJECT_INACTIVE`) y comprueba el resto. Ninguna otra comprobación ve una inactiva, y el motor aplicará el mismo filtro.

### 5. Una consulta grande con `include`, sin N+1

Dos llamadas de Prisma como mucho:
1. Los cursos con calendario (periodos ordenados), clases y `subjects`, cada uno con la asignatura (id, nombre, estado), sus `constraints` con sus `slots` y sus `assignments` (clase y profesor).
2. Los profesores con sus tramos.

Para un colegio típico es una respuesta de unos pocos cientos de filas.

### 6. La presentación de cada problema, en un mapa por código

En el frontend, un componente `ReadinessIssueItem` decide el texto y los enlaces según el `code` y sus referencias, con una entrada por código. Los textos van en `schedule.readiness.issues.<CODE>` con sus plurales. Un código desconocido no llega a pintarse, porque el servicio lo rechaza.

### Rendimiento y seguridad

- **Rendimiento:** dos consultas para el colegio entero y un cálculo en memoria. No afecta al motor ni a sus límites de tiempo.
- **Seguridad:** Bearer; `schoolId` de la identidad en las dos consultas; los dos roles leen; `no-store`; sin nombres en el log (no hay evento).

### Modelo de datos

Sin cambios ni migraciones.

## Risks / Trade-offs

- **[Cifras distintas de otras pantallas por las inactivas]** → el aviso `SUBJECT_INACTIVE` lo explica; alinear la carga y el resumen queda en US-SUBJECT_d.
- **[Comprobación necesaria, no suficiente]** → la página lo dice con una nota fija; el motor dirá `INFEASIBLE` si aun así no encuentra horario.
- **[La forma de la foto condiciona el motor]** → se decide aquí con datos en bruto, que es lo que necesita un motor; si US-ALGO-RUN necesita más, se añade a la foto y a sus tests.
- **[Muchos problemas en un colegio recién creado]** → se listan todos; agruparlos por curso o filtrarlos queda para más adelante si hace falta.

## Migration Plan

Sin migración. Se despliega como siempre. Un frontend nuevo contra un backend antiguo recibe `404` y muestra el error con «Reintentar» durante los minutos del despliegue. Rollback: revertir el commit.

## Open Questions

Ninguna. Las decisiones de la exploración y del enriquecimiento del 2026-11-02 están validadas.
