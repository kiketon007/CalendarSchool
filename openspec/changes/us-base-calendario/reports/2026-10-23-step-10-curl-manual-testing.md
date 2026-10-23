# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-23
- Cambio: us-base-calendario
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=backend/.env.example --import tsx src/server.ts`, puerto 3000) contra la base `calendarschool` de desarrollo, con la migración `add_calendars` aplicada. Se usó la plantilla de desarrollo y no `backend/.env`, que lleva claves reales de reCAPTCHA: así el captcha es el falso. Se arrancó con `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` e `INVITATION_ATTEMPTS_MAX` a 1000, porque todas las peticiones vienen de la misma IP.
- Dos colegios creados por la API (`Colegio Curl Calendarios A` y `B`) con su administrador cada uno, y un `MEMBER` del colegio A creado por la API con una invitación (`POST /api/invitations`, `accept`, login y `refresh`). El script no imprime contraseñas, tokens ni cookies; el acceso se obtiene con `POST /api/auth/refresh` y los ficheros temporales se borraron al terminar.
- Los acentos de los cuerpos JSON se envían como escapes `\uXXXX`: Git Bash pasa los argumentos a `curl.exe` en la página de códigos de Windows y una `é` literal llega al backend como un carácter no válido (`INVALID_CHARACTERS`).

## Qué se comprobó

- **Crear (`POST /api/calendars`, solo `ADMIN`):**
  - La jornada de Primaria de `Horarios.docx` (seis sesiones de 45 minutos y un recreo de 30 tras la tercera) con dos cursos: `201`, `Cache-Control: no-store`, los siete periodos en el orden recibido, los cursos en orden natural («1º Primaria», «2º Primaria») y exactamente las claves `courses`, `createdAt`, `id`, `name` y `periods`.
  - La de Infantil, con el recreo de 11:15 a 12:00 y la cuarta sesión de 30 minutos: `201`.
  - Un calendario sin `courseIds`: `201`.
- **Listar (`GET /api/calendars`):** `200`, `no-store`, ordenados por nombre («Infantil», «Primaria», «Sin cursos»), con sus periodos y sus cursos.
- **Mover un curso:** crear un calendario con un curso que ya seguía otro lo mueve (el nuevo lo lleva y «Primaria» conserva solo el otro).
- **Validación (`400`), con los errores exactos y en orden:** nombre vacío, sin periodos y curso mal escrito; más de 90 minutos (`TOO_LONG`); fin igual al inicio (`INVALID_RANGE`); solapamiento (`OVERLAP`); recreo al principio (`NOT_ALLOWED`); novena sesión (`INVALID_LENGTH`); hora mal escrita (`INVALID_FORMAT`); curso de otro colegio y curso inexistente (`courseIds[0]` y `courseIds[1]` con `NOT_FOUND`); curso repetido (`DUPLICATE`). Después de todos esos intentos no se creó ningún calendario y el curso del otro colegio no se tocó.
- **`409`:** el mismo nombre sin distinguir mayúsculas ni espacios (`«  primaria »`) es `409 CALENDAR_ALREADY_EXISTS`; otro colegio puede usar el nombre (`201`) y ve solo el suyo.
- **Sesión y roles:** `GET` y `POST` sin token son `401` con `WWW-Authenticate: Bearer`. Un `MEMBER` real (`GET /api/users` le da `403`) lista los mismos 4 calendarios con `200`, pero `POST` es `403 FORBIDDEN` aunque el cuerpo sea válido o no (no llega a validarse) y no se crea nada.
- **La API de los cursos no cambia:** `GET /api/courses` devuelve las mismas claves de siempre (`classes`, `createdAt`, `id`, `name` y `studentCount`) y `GET /api/courses/{id}` no lleva ni `calendar` ni `calendarId`, con cursos que siguen un calendario.
- **Concurrencia (cinco rondas cada una):** dos altas a la vez con el mismo nombre dan siempre un `201` y un `409`; el alta con un curso a la vez que se borra ese curso da `201` o `400` y el borrado `200`, nunca `500`; dos altas a la vez con los mismos cursos en distinto orden dan `201` y `201`, sin interbloqueo.
- **Log del servidor:**
  - 25 eventos `CALENDAR_CREATED` con las claves `actor_id`, `break_count`, `calendar_id`, `course_count`, `school_id` y `session_count` (más los campos comunes del log) y los recuentos esperados (p. ej. 6 sesiones, 1 recreo y 2 cursos).
  - 6 `CALENDAR_CREATION_REJECTED` con `reason: duplicate` y 1 con `course_not_found`.
  - 3 `AUTHORIZATION_DENIED` (los dos `POST` del miembro y su `GET /api/users`).
  - Ningún nombre de calendario, de curso ni de persona aparece en esos eventos («Primaria», «Infantil», «Sin cursos», «Segundo ciclo», «Del miembro», «Doble», «Comun», «Carrera», «Garc», «Miembro»: 0 apariciones).
  - No hay entradas de error (`level` 50 o 60).

## Resultado de la ejecución

```
OK   token del colegio A / B
--- POST /api/calendars
OK   crear Primaria -> 201 / Cache-Control: no-store / siete periodos en orden
OK   cursos en orden natural / claves del calendario
OK   crear Infantil con la sesion 4 de 30 minutos -> 201 / recreo 11:15-12:00
OK   crear sin cursos (courseIds ausente) -> 201
--- GET /api/calendars
OK   listar -> 200 / no-store / ordenados por nombre / cursos de Primaria / Sin cursos
--- Mover un curso de un calendario a otro
OK   crear con un curso que ya seguia otro -> 201 / el nuevo lo lleva / Primaria conserva el otro
--- POST: validacion (400)
OK   nombre vacio, sin periodos y curso mal escrito / mas de 90 minutos / fin igual al inicio
OK   solapamiento / recreo al principio / novena sesion / hora mal escrita
OK   curso de otro colegio y curso inexistente / curso repetido
OK   el curso de otro colegio no se ha tocado / no se ha creado ninguno de los rechazados
--- POST: 409
OK   mismo nombre sin distinguir mayusculas ni espacios -> 409 CALENDAR_ALREADY_EXISTS
OK   otro colegio puede usar el nombre -> 201 / el colegio B ve solo el suyo
--- 401
OK   GET y POST sin token -> 401 / WWW-Authenticate: Bearer
--- Un MEMBER lee pero no crea
OK   invitacion (201), login (204), GET /api/users -> 403, lista los 4 calendarios (200)
OK   POST -> 403 FORBIDDEN, tambien con un cuerpo no valido; no se creo nada
--- La API de los cursos no cambia
OK   GET /api/courses y GET /api/courses/{id} sin calendar
--- Concurrencia
OK   cinco rondas con un 201 y un 409
OK   cinco rondas: alta 201 o 400 y borrado 200, nunca 500
OK   cinco rondas con 201 y 201, sin interbloqueo
FALLOS: 0
```

## Incidencias de la preparación (no del código)

- El primer intento falló entero (`401` en todo) porque el script se escribió con las vocales acentuadas ya como caracteres y no como escapes `\uXXXX` (la herramienta que escribe ficheros interpreta los escapes): el registro daba `INVALID_CHARACTERS` y no había token. Se restauraron los escapes en las líneas de los cuerpos y se repitió desde una base de desarrollo vacía.

## Verificación de la base de datos

- Línea base (`countsCal.sh`): todo a 0 salvo `municipalities` (542) en `calendarschool` y en los esquemas `test_1` a `test_4`.
- Tras la prueba se borraron los datos creados de la base de desarrollo (`students`, `classes`, `courses`, `professors`, `refresh_tokens`, `access_links`, `rate_limit_attempts`, `calendar_periods`, `calendars`, `users` y `schools`) y el recuento volvió a ser **idéntico** a la línea base.
- Backend parado con `taskkill` y puerto 3000 comprobado: ya no escucha nadie.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
