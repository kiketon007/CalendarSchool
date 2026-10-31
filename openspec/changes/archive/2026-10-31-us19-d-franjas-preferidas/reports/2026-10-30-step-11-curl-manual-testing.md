# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-30
- Cambio: us19-d-franjas-preferidas
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local en `http://localhost:3000` (`node --env-file=… --import tsx src/server.ts`), con el captcha falso y los límites de intentos altos, contra la base `calendarschool` migrada (14 migraciones; este cambio no añade ninguna).
- Dos colegios (A y B) registrados por la propia API. Con el A: dos cursos (uno con un calendario de 6 sesiones con el recreo tras la 3ª, otro sin calendario), cuatro asignaturas y un `MEMBER` real creado con una invitación. El colegio B sirve para comprobar el aislamiento.
- El script es `curlPreferred.sh` (en el directorio temporal, no se versiona). No imprime contraseñas, tokens ni cookies. Usa nombres sin acentos porque el `curl` de Git Bash no manda UTF-8.
- Se ejecutó dos veces: en la primera, 3 comprobaciones fallaron por errores del propio script (la precedencia de un filtro de `jq` y un campo que solo existe en el log); corregido el script, la segunda ejecución terminó con **0 fallos**. Lo que sigue es la segunda.

## Comprobaciones (todas OK)

**Lectura (`GET /api/courses/{courseId}/subjects/{subjectId}/preferred-slots`)**
- `200` con `Cache-Control: no-store`, 7 periodos (6 sesiones y el recreo), `slots: []`, `forbiddenSlots: []` y sin avisos.
- La ruta de prohibidas **no** lleva `forbiddenSlots`.

**Escritura (`PUT`)**
- 10 celdas (las sesiones 1 y 2 de lunes a viernes): `200` con 10 celdas. La carga del curso muestra `preferredSlotCount: 10`, `constraintCount: 1` y `forbiddenSlots: []`.
- El mismo `PUT` otra vez: `200`, y no se registra un segundo evento.
- Lista vacía: `200`, `constraintCount` baja de 2 a 1 y las 6 celdas prohibidas siguen.

**Contradicción con las prohibidas**
- Con el lunes entero prohibido, un `PUT` de preferidas con el lunes 1ª y el martes 1ª responde `200` con `PREFERRED_SLOTS_FORBIDDEN` y `count: 1`, y con `forbiddenSlots` de 6 celdas.
- La carga muestra `preferredSlotCount: 2`, el mismo aviso y `constraintCount: 2`.
- La ruta de prohibidas no cambia ni avisa.
- Al dejar solo el martes 1ª, el aviso desaparece.

**Solo las prohibidas deciden si cabe**
- Una asignatura de 3 sesiones con tres días enteros como preferidas: sin `SUBJECT_DOES_NOT_FIT`.
- Con los mismos tres días como prohibidas: `SUBJECT_DOES_NOT_FIT`, y en las preferidas, `[SUBJECT_DOES_NOT_FIT, PREFERRED_SLOTS_FORBIDDEN(18)]`.

**Celdas fuera del calendario**
- Preferidas 1:6, 2:6 y 1:1, y prohibida 3:6; el calendario pasa a 5 sesiones.
- Las preferidas devuelven 1 celda dentro y `outsideCalendarCount: 2`.
- La carga devuelve `SLOTS_OUTSIDE_CALENDAR` con `count: 3` (suma de las dos reglas) y `preferredSlotCount: 1`.
- Guardar las quita: `outsideCalendarCount: 0`.

**Validación y errores**
- `400` con `slots[0].dayOfWeek` y `slots[1].sessionNumber` `OUT_OF_RANGE` y `slots[3]` `DUPLICATE`.
- `400` `OUT_OF_RANGE` en una sesión que ya no existe en el calendario actual.
- `409 COURSE_HAS_NO_CALENDAR` en un curso sin calendario.
- `404` en estos casos: asignatura que no se imparte en el curso, asignatura inexistente, `id` mal formado, curso de otro colegio y `PUT` desde otro colegio.

**Permisos**
- Sin token: `401` en `GET` y en `PUT`.
- `MEMBER` real (por invitación): `GET` `200`, `PUT` `403 FORBIDDEN`, y `403` también con un `id` mal formado y un cuerpo inválido (el rol se comprueba antes). Tras los rechazos no cambió nada.

**Cascadas**
- Quitar la asignatura del curso desde la carga: `200`, no queda ninguna celda y el log registra `constraints_removed: 2` (las dos reglas).
- Borrar una asignatura con las dos reglas: `200`.

**Concurrencia** (5 rondas, un `PUT` de preferidas y uno de prohibidas a la vez sobre la misma asignatura)
- Los 10 `PUT` respondieron `200`; cada regla quedó con las celdas enteras de su `PUT` (3 y 2).

**Log**
- `SUBJECT_SLOTS_UPDATED` con `type: PREFERRED_SLOTS` o `FORBIDDEN_SLOTS`, según la ruta, y `SUBJECT_SLOTS_UPDATE_REJECTED` con `type: PREFERRED_SLOTS` y `reason` `not_found` o `no_calendar`.
- Ningún nombre de asignatura, de curso ni de colegio aparece en el log (0 coincidencias).

## Restauración

- Se vaciaron `schools` y `users` (con sus dependientes por cascada) y los intentos de límite en `calendarschool`.
- Los recuentos por tabla coinciden con la línea base del paso 10.
- Backend parado y puerto 3000 libre.

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
