# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-11-03
- Cambio: us-algo-check
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Backend de desarrollo (`node --env-file=<env sin límites de intentos> --import tsx src/server.ts`) contra `calendarschool` migrada, puerto 3000.
- Un script de bash con `curl` y `jq` que registra dos colegios por la API, prepara los datos y comprueba cada caso (34 comprobaciones); no imprime contraseñas, tokens ni cookies.
- Preparación (colegio A): tres calendarios («Corto», de tres sesiones de 60 min; «Largo», de tres de 60 y dos de 90; y «Variable», de cinco sesiones, que se acorta a tres con celdas ya guardadas), trece cursos de una clase (uno por problema) con sus asignaturas, seis profesores, asignaciones, franjas y tramos no disponibles. Un colegio B sin datos.

## Casos comprobados

- **Colegio sin cursos:** `200`, `Cache-Control: no-store`, `ready: false` y el único bloqueante `SCHOOL_WITHOUT_COURSES`.
- **Una instalación con un problema de cada tipo:**
  - **Bloqueantes** (ocho códigos distintos): `COURSE_WITHOUT_CALENDAR` (Curso sin calendario), `WORKLOAD_EXCEEDS_SLOTS` (16 sesiones para 15), `BLOCK_LARGER_THAN_LOAD` (Plástica; el `PATCH` de un bloque mayor que la carga se guarda), `SUBJECT_DOES_NOT_FIT` (Música con lunes a jueves prohibidos), `SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR` (Inglés, clase A, Eva Soto, con el viernes prohibido y Eva sin lunes ni martes), `CLASSES_WITHOUT_PROFESSOR`, `EXCEEDS_MAX_HOURS` (Sara Vega, 22 sesiones en «Largo») y `AVAILABILITY_INSUFFICIENT` (Ana Ruiz, 15 sesiones en «Corto» y 12 libres sin los lunes).
  - **Avisos** (seis códigos distintos): `SUBJECT_INACTIVE` (Francés, en Curso inactiva), `COURSE_WITHOUT_SUBJECTS`, `MAY_EXCEED_MAX_HOURS` (Pedro Soto, 20 sesiones en «Largo»), `SEVERAL_CALENDARS` (Luis Gil, 2), `SLOTS_OUTSIDE_CALENDAR` (1 celda guardada fuera, tras acortar el calendario) y `PREFERRED_SLOTS_FORBIDDEN` (1).
  - **Orden:** los bloqueantes y los avisos van en el orden de sus códigos.
  - **Inactivas:** la asignatura inactiva no da `CLASSES_WITHOUT_PROFESSOR` ni cuenta en la carga.
  - **Clases sin profesor:** cita curso, asignatura, clases y cuántas faltan.
- **Corregir un bloqueante lo hace desaparecer:** asignar profesor a una asignatura quita uno de los `CLASSES_WITHOUT_PROFESSOR`.
- **Permisos y errores:** otro colegio solo ve `SCHOOL_WITHOUT_COURSES`; sin token, `401` con `WWW-Authenticate: Bearer`; el colegio sale de la sesión y no de `?schoolId=`; otra ruta de `/schedule` da `404`; un `MEMBER` ve exactamente lo mismo que el `ADMIN`.
- **Log:** ningún evento lleva nombres de profesores (no hay evento nuevo).
- **No fabricable por la API:** `COURSE_WITHOUT_CLASSES`, porque un curso exige al menos una clase; queda cubierto por la tabla del dominio.

## Resultados

- **Primera pasada:** 9 fallos, todos errores del script y no del backend: la clase de cada curso se guardaba en una variable dentro de `$(…)` (un subproceso), así que quedaba vacía y las asignaciones fallaban en silencio; y se buscaba el id de una asignatura de la carga horaria con `.subjectId` cuando el campo se llama `id`. Se corrigió el script.
- **Segunda pasada:** 0 fallos (34 comprobaciones), repetida una vez más para comprobar que se ejecutaban.

## Estado de la base de datos

- `calendarschool` restaurada con `TRUNCATE schools CASCADE` y `rate_limit_attempts`; los recuentos coinciden con la línea base (`diff` idéntico).
- Backend parado y puerto 3000 libre.

## Resultado

- Estado del paso 10: **PASS**
- Incidencias bloqueantes: ninguna.
