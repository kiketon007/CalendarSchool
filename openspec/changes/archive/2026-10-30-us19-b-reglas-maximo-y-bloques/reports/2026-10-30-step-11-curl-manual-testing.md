# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-30
- Cambio: us19-b-reglas-maximo-y-bloques
- Agente: Claude (Sonnet 5.5)

## Entorno

- Backend local en `http://localhost:3000` (`node --env-file=<copia del .env> --import tsx src/server.ts`), con el verificador de captcha falso y los límites de intentos a 1000. El `.env` local lleva los secretos reales de reCAPTCHA; se usó una copia temporal sin esas dos líneas, fuera del repositorio y sin mostrar su contenido.
- Base de datos de desarrollo con la migración `add_scheduling_constraints` aplicada.
- Dos colegios nuevos por ejecución (A y B), un `MEMBER` real creado con una invitación del administrador de A y datos únicos por ejecución.
- Guion: `curlRules.sh` (bash + `curl` + `jq`), que no imprime contraseñas, tokens ni cookies.
- **Textos sin acentos:** el `curl` de Git Bash en Windows no envía en UTF-8 los argumentos con tildes, y el registro respondió `400 INVALID_CHARACTERS` en el nombre. Los nombres del guion son ASCII («Ingles», «Educacion Fisica», «1o»); el comportamiento con tildes lo cubren los tests de integración.

## Cobertura del guion

- **Lectura y escritura de las reglas:** poner, cambiar y quitar el máximo y el bloque en la carga de un curso, con `constraintCount` y `maxConsecutiveSessions` (6 en un calendario sin recreo; 2 en uno con el recreo tras la 1ª sesión).
- **Avisos por asignatura:** `SUBJECT_DOES_NOT_FIT` (3 sesiones en bloques de 3 con el recreo tras la 1ª), `BLOCK_LARGER_THAN_LOAD` (1 sesión en bloques de 2), una asignatura que cabe (4 en bloques de 2) y que los avisos del curso van aparte. Los avisos no impiden guardar (`200`).
- **Validación:** máximo 1 y 6 y bloque 4 (`OUT_OF_RANGE`), reglas con `sessionsPerWeek: null` (`NOT_ALLOWED`) y campos ausentes (`REQUIRED`), todo con `400` y sin cambiar nada.
- **Recuentos:** `constraintCount` en `GET /api/subjects`, en el impacto y en el borrado del curso.
- **Cascadas:** guardar una asignatura sin tocar los cursos conserva sus reglas; quitar un curso desde la asignatura y desde la carga las borra; borrar el curso y la asignatura también.
- **Permisos:** `403` del `PATCH` de un `MEMBER` real, `200` en su `GET` y en el impacto, `401` sin token y `404` con un curso de otro colegio.
- **Concurrencia:** cinco rondas de reglas contra la edición de la asignatura que quita el curso y contra el borrado del curso.
- **Log:** `COURSE_WORKLOAD_UPDATED` con `constraints_set` y `constraints_removed`, y `COURSE_DELETED` con `constraint_count`.

## Resultados

Tres ejecuciones. Las dos primeras fallaron por errores **del guion**, no del backend: la primera, por los acentos (arriba); la segunda y la tercera, por expectativas mías mal calculadas (tras borrar la asignatura quedaba la regla de otra asignatura en el curso, y «Plastica 2 sesiones en bloques de 2» es una regla, no dos). Se corrigieron y se repitió el guion completo desde cero:

**Última ejecución: 52 correctas, 0 con fallo (salida 0).**

```
=== Preparación
OK   token de los colegios A y B
OK   MEMBER real de A
OK   1o sigue el calendario de 6 sesiones
OK   2o sigue el calendario con recreo
OK   tres asignaturas en 1o y 2o
--- Lectura sin reglas
OK   GET 200
OK   calendar.maxConsecutiveSessions de 1o
OK   Ingles sin reglas: maxPerDay null, blockSize null, 0 reglas
OK   maxConsecutiveSessions de 2o (recreo tras la 1ª)
--- Poner reglas
OK   PATCH con reglas -> 200
OK   Cache-Control: no-store
OK   Ingles: máximo 2, bloque 2, 2 reglas
OK   Educacion Fisica: bloque 3, 1 regla
OK   sin avisos en 1o (calendario de 6 seguidas)
OK   GET /api/subjects: constraintCount de Ingles en 1o
OK   constraintCount de Ingles en 2o
--- Avisos por asignatura (2o: 3 sesiones, recreo tras la 1ª)
OK   PATCH -> 200 (los avisos no impiden guardar)
OK   Educacion Fisica 3 en bloques de 3: SUBJECT_DOES_NOT_FIT
OK   Plastica 1 en bloques de 2: BLOCK_LARGER_THAN_LOAD
OK   Ingles 4 en bloques de 2 (recreo tras la 1ª): sin avisos
OK   los avisos del curso van aparte
OK   una lectura posterior devuelve los mismos avisos
--- Validación (400 sin cambios)
OK   máximo 1 y bloque 4, máximo 6 -> 400
OK   OUT_OF_RANGE en los tres campos
OK   regla sin carga -> 400
OK   NOT_ALLOWED en máximo y bloque
OK   sin maxPerDay ni blockSize -> 400 REQUIRED
OK   no cambió nada (Ingles sigue con 2 reglas)
--- Cambiar y quitar reglas
OK   cambiar el máximo, quitar el bloque y quitar la regla de EF -> 200
OK   Ingles: 3 sin bloque, 1 regla
OK   Educacion Fisica sin reglas
--- Cascadas: editar la asignatura
OK   guardar la asignatura sin tocar los cursos -> 200
OK   Ingles conserva sus 2 reglas en 1o
OK   quitar 1o de la asignatura -> 200
OK   Ingles ya no se imparte en 1o y no tiene reglas allí
OK   las de 2o siguen (1 regla de bloque)
--- Cascadas: quitar desde la carga
OK   sessionsPerWeek null con reglas a null -> 200
OK   Ingles sin reglas en 2o
--- Impacto y borrado del curso
OK   impacto: constraintCount 3
OK   un MEMBER ve el impacto -> 200
OK   borrar 1o -> 200
OK   deleted.constraintCount 3
OK   las asignaturas siguen y ya no tienen a 1o
--- Borrar la asignatura se lleva sus reglas
OK   antes de borrar: 2 reglas en 2o (una de Plastica y una de Educacion Fisica)
OK   borrar la asignatura -> 200
OK   solo queda la regla de Educacion Fisica en 2o (la de Plastica cayo)
--- Permisos
OK   PATCH de un MEMBER -> 403
OK   GET de un MEMBER -> 200
OK   PATCH sin token -> 401
OK   impacto sin token -> 401
OK   curso de otro colegio -> 404
--- Concurrencia (5 rondas): reglas contra edición que quita el curso, y contra borrado del curso
OK   5 rondas sin errores y con estados válidos

RESULTADO: 52 correctas, 0 con fallo
```

## Log del backend

- 36 eventos `COURSE_WORKLOAD_UPDATED` con los recuentos (por ejemplo `constraints_set: 3, constraints_removed: 0`) y `COURSE_DELETED` con `class_count`, `student_count` y `constraint_count: 3`.
- Ninguna línea del log contiene nombres de asignaturas, de colegios ni de usuarios, ni contraseñas.

## Limpieza (11.2)

Backend parado (el puerto 3000 queda libre), datos creados borrados con `TRUNCATE … CASCADE` de las tablas de la aplicación de `calendarschool`, y recuentos idénticos a la línea base del paso 10.
