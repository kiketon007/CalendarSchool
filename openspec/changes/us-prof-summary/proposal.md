## Why

Antes de generar los horarios, el colegio necesita saber si la carga que ha asignado a cada profesor cabe: un profesor no puede tener más de **23 horas lectivas** a la semana (PRD §3.2, corregido en la exploración del 2026-11-01), su disponibilidad tiene que dejarle sitio para sus sesiones, y cada asignatura de cada clase necesita un profesor. Hoy esos datos están repartidos entre la carga de cada curso, la matriz de profesores de cada curso y la disponibilidad de cada profesor, y nada los cruza. Es la historia **US-PROF-SUMMARY** (`docs/User_Stories_MVP.md`, épica 6), la última de la épica antes del motor (US-ALGO-RUN, que la recomienda como detección temprana).

## What Changes

- Nuevo endpoint de solo lectura **`GET /api/professors/summary`** (`ADMIN` y `MEMBER`, aislado por colegio) que devuelve, por profesor, sus asignaturas, sus cursos, sus sesiones a la semana, el **rango mínimo–máximo de minutos lectivos**, su estado (`NO_LOAD`, `FITS`, `MAY_EXCEED`, `EXCEEDS`) y sus avisos, y, del colegio, los cursos con celdas (asignatura, clase) sin profesor.
- El rango se calcula por calendario con las sesiones en las que el profesor puede dar clase (las que no se solapan con sus tramos no disponibles): la suma de las más cortas y de las más largas. Los recreos no cuentan.
- Avisos: más de 23 h seguro, puede pasar de 23 h, disponibilidad insuficiente en un calendario, asignaciones en cursos sin calendario (no se cuentan) y da clase en varios calendarios.
- Nueva página **`/profesores/resumen`** con la tabla (tarjetas a 360 px), el aviso de las asignaturas sin profesor, filtros en el cliente (estado, asignatura y nombre) y enlaces a la disponibilidad del profesor y a la matriz de cada curso en el que da clase.
- Enlace «Resumen de carga» en el listado `/profesores`.
- Sin cambios en el modelo de datos ni migraciones; sin códigos de error ni eventos de log nuevos.

## Capabilities

### New Capabilities
- `professor-load-summary`: el resumen de carga lectiva de los profesores del colegio (contrato, cálculo del rango, estados y avisos, celdas sin profesor, endpoint, página, filtros, accesibilidad y E2E).

### Modified Capabilities
- `school-professors`: el listado de profesores enlaza con el resumen de carga.
- `professor-assignments`: el guardado de la matriz bloquea las clases del curso (endurecimiento de la concurrencia, sin cambio visible).

## Impact

- **Contrato:** `docs/api-spec.yml` (operación `getProfessorsSummary` y esquemas `ProfessorsSummary`, `ProfessorLoad`, `ProfessorLoadWarning`, `UnassignedCourse`); se regeneran los tipos del frontend.
- **Backend:** dominio (`domain/professor/teachingLoad.ts`, función pura con la tabla `test-fixtures/teaching-load.json`), puerto y repositorio Prisma de solo lectura, caso de uso `GetProfessorsSummary` y la ruta en `professorsRouter` (antes de `/:id`).
- **Frontend:** servicio, utilidades de formato de horas y de filtros, `ProfessorsSummaryPage`, la ruta en `App.tsx`, el enlace en `ProfessorsPage` e i18n.
- **Documentación:** `backend/CLAUDE.md`, `frontend/CLAUDE.md`, el `CLAUDE.md` raíz y la arquitectura si procede. El PRD (§3.2), la ficha de US-ALGO-RUN (HC7) y `docs/US-ALGO_GenerarHorarios_ESPECIFICACION.md` ya se actualizaron en la exploración.
- **Fuera de alcance:** el detalle desplegable de un profesor (US-PROF-SUMMARY_b), exportar a CSV, el refresco automático, el aviso de «mismatch de restricción» de la ficha anterior, las reducciones por coordinación y un máximo distinto por profesor, los solapes entre calendarios distintos (los resuelve el motor, HC2 y HC7), las franjas prohibidas o preferidas en el cálculo y los recuentos en los listados de asignaturas y cursos.
