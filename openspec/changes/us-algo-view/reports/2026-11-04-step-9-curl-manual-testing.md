# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-11-04
- Cambio: us-algo-view
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Backend de desarrollo (`node --env-file=<env temporal> --import tsx src/server.ts`) contra `calendarschool` (ya migrada), puerto 3000. El `.env` temporal es una copia del de desarrollo **sin** las claves de reCAPTCHA (así se usa el verificador falso) y con los límites de intentos en 1000. Sin `SCHEDULE_WORKER_FUNCTION_NAME`: el lanzador en memoria ejecuta la generación en el propio proceso.
- Un script de bash con `curl`, `jq` y `docker exec psql` con 49 comprobaciones; no imprime contraseñas, tokens ni cookies.
- Preparación por la API (colegio A): dos cursos («Curso Uno» con las clases A y B, «Curso Dos» con una), un calendario de tres sesiones con un recreo asignado a los dos, Lengua (con código «LEN», azul, 2 sesiones por clase) para Ana en las dos clases del primero y Mates (sin código, roja, 2 sesiones) para Luis en el segundo; un miembro por el flujo de invitación; y un colegio B sin datos.

## Casos comprobados

- **Antes de generar:** `GET /api/schedule/draft` → `200`, `no-store` y `schedule: null`.
- **Con borrador** (tras `POST /api/schedule/generate` y esperar a `COMPLETED`):
  - `200`, `no-store`, estado `DRAFT`, 6 sesiones colocadas y 6 entradas.
  - Dos cursos, la clase A y la B del primero, dos asignaturas y dos profesores, cada uno una vez.
  - El calendario actual con sus 4 periodos en orden, el primero 09:00–10:00 y el recreo como `BREAK`.
  - Las horas de las entradas en `HH:MM`, ninguna entrada con nombres, el código y el color de cada asignatura (Mates sin código).
- **Aislamiento y permisos:** el colegio B, aunque pase `?schoolId=<A>`, recibe `200` con `null`; un `MEMBER` recibe `200` con el mismo borrador; sin token, `401` con `WWW-Authenticate: Bearer`.
- **Cambios posteriores a generar:**
  - Tras borrar a Luis con `DELETE /api/professors/{id}`: las 6 entradas siguen, 2 con `professorId: null`, y solo queda Ana en `professors`.
  - Tras borrar el calendario con `DELETE /api/calendars/{id}`: las 6 entradas siguen con sus horas y los dos cursos salen con `calendar: null`.
  - Con el calendario borrado, un nuevo `POST /api/schedule/generate` responde `409` (los cursos sin calendario impiden generar).
- **Log:** la lectura no deja ningún evento (es una lectura) y no aparece ningún nombre de curso, asignatura o profesor.

## Resultados

- **49 comprobaciones, 0 fallos a la primera.**
- Una de las comprobaciones es débil: «entradas ordenadas por clase, día y sesión» solo verifica que hay entradas; el orden lo comprueban los tests del caso de uso y el de integración.

## Estado de la base de datos

- `calendarschool` restaurada con `TRUNCATE schools CASCADE` y `rate_limit_attempts` (la cascada vacía las tablas de horarios); los recuentos coinciden con la línea base del paso 8 (`diff` idéntico).
- Backend parado y puerto 3000 libre (`curl` devuelve `000`).

## Resultado

- Estado del paso 9: **PASS**
- Incidencias bloqueantes: ninguna.
