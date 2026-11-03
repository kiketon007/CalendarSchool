# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-11-03
- Cambio: us-algo-run-motor
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Backend de desarrollo (`node --env-file=<env sin límites de intentos> --import tsx src/server.ts`) contra `calendarschool` migrada, puerto 3000.
- Un script de bash con `curl` y `jq` que registra dos colegios por la API, prepara los datos y comprueba cada caso (21 comprobaciones); no imprime contraseñas, tokens ni cookies.
- Preparación (colegio A): un calendario «Corto» (tres sesiones de 60 minutos, 15 franjas a la semana) asignado a tres cursos de una clase; Lengua en los tres (5 sesiones), Matemáticas en 2º y 3º, Inglés en 2º, Francés **inactiva** en 3º; tres profesores y todas las asignaciones. Un colegio B sin datos.

## Casos comprobados

- **El aviso `WORKLOAD_BELOW_SLOTS`:** `200` y `Cache-Control: no-store`; `ready: true` y sin bloqueantes (el aviso no impide generar); avisan 1º Primaria (5 asignadas para 15) y 3º Primaria (10 para 15), en el orden de los cursos; 2º Primaria, con 15 sesiones para 15, no avisa.
- **Inactivas:** Francés (inactiva, 5 sesiones) no cuenta: 3º Primaria sale con 10 asignadas y no con 15, y además se avisa de `SUBJECT_INACTIVE`, que va antes en la lista.
- **Orden:** `SUBJECT_INACTIVE`, `WORKLOAD_BELOW_SLOTS`, `WORKLOAD_BELOW_SLOTS`.
- **Completar la carga lo quita:** con dos asignaturas más en 1º Primaria (15 sesiones en total) el aviso desaparece, solo queda 3º Primaria, y `ready` sigue siendo `true`.
- **Aislamiento y permisos:** el colegio B no ve avisos de huecos libres; sin token, `401` con `WWW-Authenticate: Bearer`.
- **El motor aún no tiene endpoint** en este cambio: `POST /api/schedule/generate` responde `404`. La ejecución, el endpoint y las tablas llegan con `us-algo-run-ejecucion`.
- **Log:** ningún evento del log lleva nombres de profesores, cursos ni asignaturas (el aviso no añade eventos).

## Resultados

- **Primeras pasadas:** varios fallos, todos errores del script y no del backend: la tilde de «José» y el ordinal «º» viajaban en la codificación de la consola de Windows y el backend los rechazaba con `INVALID_CHARACTERS` (se usaron nombres sin tilde para el usuario y escapes JSON `º` para los cursos); y los correos del registro deben ser únicos en cada ejecución (se añadió una marca de tiempo).
- **Última pasada:** 0 fallos (21 comprobaciones), repetida una vez más para comprobar que se ejecutaban.

## Estado de la base de datos

- `calendarschool` restaurada con `TRUNCATE schools CASCADE` y `rate_limit_attempts`; los recuentos coinciden con la línea base (`diff` idéntico).
- Backend parado y puerto 3000 libre (`curl` devuelve `000`).

## Resultado

- Estado del paso 9: **PASS**
- Incidencias bloqueantes: ninguna.
