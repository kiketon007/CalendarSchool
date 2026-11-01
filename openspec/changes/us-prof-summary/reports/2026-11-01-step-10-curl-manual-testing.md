# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-11-01
- Cambio: us-prof-summary
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Backend de desarrollo (`node --env-file=<env sin límites de intentos> --import tsx src/server.ts`) contra `calendarschool` migrada, puerto 3000.
- Un script de bash con `curl` y `jq` que registra dos colegios por la API, prepara los datos y comprueba cada caso; no imprime contraseñas, tokens ni cookies. Los resultados esperados están calculados a mano en sus comentarios.
- Preparación (colegio A): cuatro cursos de dos clases (A y B) y dos calendarios: «Mixto» (3 sesiones de 60 min, recreo y 2 de 45 min: 15 de 60 y 10 de 45 a la semana) en el curso 1, y «Largo» (3 de 60 y 2 de 90: 15 de 60 y 10 de 90) en los cursos 2 y 4; el curso 3 sin calendario. Once asignaturas con carga, cinco profesores y las asignaciones que dan los cuatro estados. Un colegio B sin datos.

## Casos comprobados

- **Colegio vacío:** `200`, `Cache-Control: no-store` y `{ maxTeachingMinutes: 1380, professors: [], unassigned: [] }`.
- **Orden:** los cinco profesores por apellido (Garcia, Perez, Ruiz, Soto, Vega).
- **Rango, estado y avisos por profesor:**
  - Garcia: 10 sesiones en «Mixto», de 450 (10 × 45) a 600 (10 × 60), `FITS`, sin avisos.
  - Perez: 3 sesiones en «Mixto» (135–180), 2 en «Largo» (120–180) y 3 en un curso sin calendario que no suman: 8 sesiones, 255–360, `FITS`, con `COURSE_WITHOUT_CALENDAR` (Curso 3, 1 asignación) y `SEVERAL_CALENDARS` (2).
  - Ruiz: `NO_LOAD`, 0 sesiones, sin avisos.
  - Soto: 20 sesiones en «Largo», de 1350 (15 × 60 + 5 × 90) a 1500 (10 × 90 + 10 × 60), `MAY_EXCEED`, con `MAY_EXCEED_MAX_HOURS`.
  - Vega: 22 sesiones en «Largo», de 1530 a 1620, `EXCEEDS`, con `EXCEEDS_MAX_HOURS`.
- **Asignaturas de cada profesor y cursos:** Garcia lista Lengua en A y B con 5 sesiones; Perez da clase en los cursos 1, 2 y 3, por nombre.
- **Asignaturas sin profesor:** Curso 1: 1; Curso 2: 5; Curso 3: 1; Curso 4: 5.
- **La disponibilidad entra en el cálculo:**
  - Con lunes a miércoles bloqueados quedan justo 10 sesiones libres para 10 de carga: sin aviso y rango de un solo valor, 540 (2 × (3 × 60 + 2 × 45)).
  - Con el jueves también bloqueado quedan 5: aparece `AVAILABILITY_INSUFFICIENT` con «Mixto», 10 sesiones y 5 disponibles, y el rango se calcula con todas las sesiones del calendario (450–600).
- **Permisos y errores:** otro colegio ve listas vacías; sin token, `401` con `WWW-Authenticate: Bearer`; `/api/professors/summary` responde `200` (no se toma por un id) y un id inexistente sigue dando `404 NOT_FOUND`; el colegio sale de la sesión y no de `?schoolId=`; un `MEMBER` recibe exactamente lo mismo que el `ADMIN`.
- **Log:** ningún evento lleva nombres de profesores (no hay evento nuevo).

## Resultados

- **Primera pasada:** 1 fallo, una expectativa errónea del script (esperaba el rango 450–600 con 10 sesiones libres para 10 de carga; con todas las libres en uso es 540–540). No era un fallo del backend. Se corrigió el script y se repitió entero.
- **Segunda pasada:** 0 fallos.

## Estado de la base de datos

- `calendarschool` restaurada con `TRUNCATE schools CASCADE` y `rate_limit_attempts`; los recuentos coinciden con la línea base (`diff` idéntico).
- Backend parado y puerto 3000 libre.

## Resultado

- Estado del paso 10: **PASS**
- Incidencias bloqueantes: ninguna.
