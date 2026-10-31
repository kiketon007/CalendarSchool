# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-31
- Cambio: us20-listado-reglas
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) con la plantilla de desarrollo, captcha falso y los límites de intentos a 1000, contra la base de desarrollo `calendarschool`.
- Un script (`curlConstraints.sh`, en el directorio temporal de la sesión, fuera del repositorio) registra dos colegios (A y B) y recorre los casos de abajo con `curl` y `jq`. No imprime contraseñas, tokens ni cookies. Los nombres de los datos van sin acentos, porque el `curl` de Git Bash no envía UTF-8 correctamente.
- Resultado global: **37 comprobaciones, 0 fallos.**

## Comandos y resultados

Todas las rutas son `http://localhost:3000/api/...`, con `Authorization: Bearer <token>` salvo donde se dice.

- **Listado vacío:** `GET /constraints` de un colegio nuevo responde `200` con `constraints: []` y `Cache-Control: no-store`.
- **Preparación del colegio A:**
  - Tres calendarios de jornada (6 sesiones con un recreo entre la 3ª y la 4ª) para tres cursos, y un colegio B aparte.
  - Reglas escritas con `PATCH /courses/{id}/workload` y `PUT /courses/{id}/subjects/{id}/forbidden-slots|preferred-slots`:
    - Inglés: máximo 2 y bloques de 2.
    - Religión: 18 prohibidas (lunes a miércoles enteros).
    - Matemáticas: 5 sesiones, máximo 2, el lunes a jueves entero prohibido y 4 preferidas (una de ellas prohibida).
    - Música: 1 sesión, máximo 2 y bloques de 2.
    - Plástica: 3 prohibidas y 2 preferidas.
  - Se borró el calendario del curso de Música (el curso queda sin calendario) y se acortó el de Plástica de 6 a 5 sesiones.
- **Listado con los cuatro tipos:** `GET /constraints` responde `200` con las 10 reglas:
  - **Orden:** por curso, asignatura y tipo (máximo, bloques, prohibidas y preferidas).
  - **Valores:** cada regla lleva solo el suyo (`maxPerDay`, `blockSize` o `slotCount`) y `null` en los otros dos. Las 24 prohibidas de Matemáticas, las 18 de Religión y las 4 preferidas se cuentan bien, y las de Plástica solo cuentan las que existen en el calendario acortado (1 y 1).
  - **Asignatura:** nombre, código (`null` sin código), color y estado.
- **Avisos por regla:**
  - Matemáticas: `SUBJECT_DOES_NOT_FIT` en el máximo y en las prohibidas; la regla de preferidas solo lleva `PREFERRED_SLOTS_FORBIDDEN` con `count` 1.
  - Música (curso sin calendario): el máximo lleva `COURSE_WITHOUT_CALENDAR`; los bloques, `BLOCK_LARGER_THAN_LOAD` y después `COURSE_WITHOUT_CALENDAR`.
  - Plástica: `SLOTS_OUTSIDE_CALENDAR` con `count` 2 en las prohibidas y con `count` 1 en las preferidas.
  - Inglés y Religión: sin avisos.
- **Coherencia con la carga:**
  - La unión de los códigos de aviso de las reglas de Matemáticas coincide con los de esa asignatura en `GET /courses/{id}/workload`.
  - La carga de Plástica suma en un solo `SLOTS_OUTSIDE_CALENDAR` las celdas fuera de las dos cuadrículas (`count` 3), mientras que el listado las reparte (2 y 1).
- **Permisos:**
  - Sin token: `401` con `WWW-Authenticate: Bearer`.
  - Un `MEMBER` real (invitación, aceptación y login): `200` con las mismas 10 reglas, idénticas a las del `ADMIN`.
  - Un `schoolId` en la consulta se ignora.
- **Aislamiento:** el colegio B solo ve su regla («Lengua», máximo al día).
- **Cascada:**
  - Quitar Inglés del curso (`PATCH` con sesiones `null`) saca sus reglas del listado.
  - Borrar Matemáticas (`DELETE /subjects/{id}`) quita sus tres.
  - Quedan las 5 de Música, Plástica y Religión.
- **Log:** `COURSE_WORKLOAD_UPDATED` y compañía, sin nombres de asignaturas ni de cursos (comprobado buscándolos en el log) y sin ningún evento de nivel `error` ni `fatal`. El listado no emite evento propio.

## Limpieza y estado

- Se borraron los datos creados (`TRUNCATE public.schools CASCADE` y `rate_limit_attempts` en `calendarschool`).
- La base de desarrollo vuelve a la línea base: solo las 14 migraciones y los 542 municipios.
- Se paró el backend y el puerto 3000 quedó libre (comprobado con `netstat`).

## Resultado

- Estado del paso 10: **PASS**
- Incidencias bloqueantes: ninguna.
