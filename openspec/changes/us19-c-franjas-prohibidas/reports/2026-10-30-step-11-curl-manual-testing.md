# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-30
- Cambio: us19-c-franjas-prohibidas
- Agente: Claude (Sonnet 5.5)

## Entorno

- Backend local en `http://localhost:3000` (`node --env-file=<copia del .env> --import tsx src/server.ts`), con el verificador de captcha falso y los límites de intentos a 1000. El `.env` local lleva los secretos reales de reCAPTCHA; se usó una copia temporal sin esas dos líneas, fuera del repositorio y sin mostrar su contenido.
- Base de datos de desarrollo con la migración `add_scheduling_constraint_slots` aplicada.
- Dos colegios nuevos por ejecución (A y B), un `MEMBER` real creado con una invitación del administrador de A y datos únicos por ejecución.
- Guion: `curlSlots.sh` (bash + `curl` + `jq`), que no imprime contraseñas, tokens ni cookies. Los nombres del guion no llevan tildes (el `curl` de Git Bash en Windows no las envía en UTF-8; las tildes las cubren los tests de integración).

## Cobertura del guion

- **Lectura:** los siete periodos con el recreo en su sitio, sin celdas ni avisos, y `calendar: null` en un curso sin calendario.
- **Escritura:** guardar 18 celdas (lunes, miércoles y viernes), repetir el mismo estado con otro orden (200, mismas celdas ordenadas) y vaciar.
- **La carga del curso:** `calendar.sessionGroups` `[3,3]`, `forbiddenSlots` de cada asignatura (18, 0 y vacío sin calendario).
- **Avisos:** `SUBJECT_DOES_NOT_FIT` con tres días prohibidos (guardando igualmente, y el mismo aviso en la carga), y con bloques de 2 y solo la 3ª y la 4ª sesión libres, a los dos lados del recreo.
- **Calendario que cambia:** 1º pasa de 6 a 5 sesiones; la cuadrícula ignora la sesión 6 (15 celdas y 3 fuera), sale `SLOTS_OUTSIDE_CALENDAR` con `count: 3`, y guardar las quita.
- **Validación:** `400` con `OUT_OF_RANGE` y `DUPLICATE` en su campo, `400` por una sesión que no existe en el calendario, `400 REQUIRED` sin `slots` (sin cambiar nada), `409 COURSE_HAS_NO_CALENDAR` y `404` con ids que no son UUID, de otro colegio o inexistentes.
- **Permisos:** `200` del `GET` de un `MEMBER` real, `403` de su `PUT` (también con ids y cuerpo inválidos, que se miran después), `401` sin token y `404` desde otro colegio.
- **Cascadas:** el impacto cuenta las reglas; guardar una asignatura sin tocar los cursos conserva las celdas; quitar el curso desde la edición de la asignatura o desde la carga, borrar la asignatura y borrar el curso las borran.
- **Concurrencia:** cinco rondas de dos `PUT` a la vez (queda la lista entera de uno de los dos) y de un `PUT` contra el borrado del curso (el curso desaparece sin errores).
- **Log:** `SUBJECT_SLOTS_UPDATED` con `type` y `slot_count`, y `SUBJECT_SLOTS_UPDATE_REJECTED` con `reason`, sin nombres.

## Resultados

Dos ejecuciones. La primera tuvo 2 fallos **de mi guion**, no del backend: contaba las reglas del curso 1º sin sumar el bloque de «Plástica» (que se había puesto antes en el mismo curso). Con las expectativas corregidas (3 reglas en el impacto y 1 al final) se repitió el guion completo desde cero:

**Última ejecución: 57 correctas, 0 con fallo (salida 0).**

```
=== Preparación
OK   token de los colegios A y B
OK   MEMBER real de A
OK   1o sigue el calendario de 6 sesiones con recreo
OK   tres asignaturas en 1o y 2o
--- Lectura sin franjas
OK   GET 200
OK   Cache-Control: no-store
OK   siete periodos con el recreo en 4o lugar
OK   sin celdas, 0 fuera y sin avisos
OK   GET de 2o (sin calendario) -> 200 con calendar null
--- Guardar y repetir
OK   PUT de lunes, miercoles y viernes (18 celdas) -> 200
OK   Cache-Control: no-store
OK   18 celdas guardadas
OK   repetir las mismas celdas (otro orden) -> 200
OK   siguen 18, ordenadas por dia y sesion
--- La carga del curso
OK   sessionGroups [3,3] y maxConsecutiveSessions 3
OK   Religion: 18 forbiddenSlots y 1 regla
OK   Ingles: sin franjas
OK   2o sin calendario: forbiddenSlots vacio
--- Avisos
OK   Ingles 3 sesiones con tres dias prohibidos -> 200 (los avisos no impiden guardar)
OK   SUBJECT_DOES_NOT_FIT
OK   la carga trae el mismo aviso para Ingles
OK   Plastica en bloques de 2 -> 200
OK   libres solo la 3a y la 4a (a los lados del recreo) -> no cabe
OK   vaciar Plastica -> 200 y sin aviso
--- Calendario que cambia
OK   1o pasa a un calendario de 5 sesiones
OK   la cuadricula ignora la sesion 6: 15 celdas y 3 fuera
OK   aviso SLOTS_OUTSIDE_CALENDAR con count 3
OK   guardar quita las celdas que sobraban
--- Validacion (400, 404, 409)
OK   forma invalida -> 400
OK   OUT_OF_RANGE, OUT_OF_RANGE y DUPLICATE
OK   sesion 6 en un calendario de 5 -> 400
OK   OUT_OF_RANGE en slots[0].sessionNumber
OK   sin slots -> 400 REQUIRED
OK   los rechazos no cambiaron nada (15 celdas)
OK   curso sin calendario -> 409
OK   COURSE_HAS_NO_CALENDAR
OK   ids no-es-un-uuid / 01a18da2-b5f8-70fd-8be6-b390a0453f14 -> 404 en GET y PUT
OK   ids 01a18da2-b36f-71ca-9f75-5611983daac7 / no-es-un-uuid -> 404 en GET y PUT
OK   ids 01a18da2-b446-71cf-89b8-1d7c43fe4e16 / 01a18da2-b5f8-70fd-8be6-b390a0453f14 -> 404 en GET y PUT
OK   ids 01a18da2-b36f-71ca-9f75-5611983daac7 / 0192f5a0-0000-7000-8000-00000000ffff -> 404 en GET y PUT
--- Permisos
OK   GET de un MEMBER -> 200
OK   PUT de un MEMBER -> 403
OK   PUT de un MEMBER con ids y cuerpo invalidos -> 403 (antes que nada)
OK   GET sin token -> 401
OK   PUT sin token -> 401
OK   el colegio B no ve las franjas de A -> 404
--- Cascadas
OK   el impacto de 1o cuenta las reglas: franjas de Religion e Ingles y el bloque de Plastica
OK   guardar la asignatura sin tocar los cursos -> 200
OK   las celdas se conservan
OK   quitar 1o desde la edicion de la asignatura -> 200
OK   la pareja ya no existe -> 404
OK   quitar Ingles desde la carga -> 200
OK   solo queda el bloque de Plastica en 1o (las franjas de Religion e Ingles cayeron)
OK   borrar Plastica -> 200
OK   sus franjas ya no existen -> 404
OK   borrar 1o -> 200 con su regla contada
--- Concurrencia (5 rondas)
OK   5 rondas sin errores y con estados validos

RESULTADO: 57 correctas, 0 con fallo
```

## Log del backend

- 36 eventos `SUBJECT_SLOTS_UPDATED` (por ejemplo `type: FORBIDDEN_SLOTS`, `slot_count: 18`) y 18 `SUBJECT_SLOTS_UPDATE_REJECTED` (16 `not_found` y 2 `no_calendar`).
- Ninguna línea del log contiene nombres de asignaturas, de cursos, de colegios ni de usuarios, ni contraseñas.

## Limpieza (11.2)

Backend parado (el puerto 3000 queda libre), datos creados borrados con `TRUNCATE … CASCADE` de las tablas de la aplicación de `calendarschool`, y recuentos idénticos a la línea base del paso 10.
