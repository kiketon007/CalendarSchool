# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-10-26
- Cambio: us-subject-b-editar-asignaturas
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=.env.example --import tsx src/server.ts`, puerto 3000) contra la base `calendarschool` de desarrollo. Se usó la plantilla de desarrollo y no `backend/.env`, que lleva claves reales de reCAPTCHA: así el captcha es el falso. Se arrancó con `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` e `INVITATION_ATTEMPTS_MAX` a 1000, porque todas las peticiones vienen de la misma IP.
- Dos colegios creados por la API (`Colegio Curl Edicion A` y `B`) con su administrador cada uno, cinco cursos (cuatro en A y uno en B), tres asignaturas de partida y un `MEMBER` real del colegio A creado con una invitación (`POST /api/invitations`, `accept`, login y `refresh`). El guion no imprime contraseñas, tokens ni cookies; el acceso se obtiene con `POST /api/auth/refresh`.
- Los acentos de los cuerpos JSON se envían como escapes `\uXXXX`: Git Bash pasa los argumentos a `curl.exe` en la página de códigos de Windows.

## Qué se comprobó

- **Leer (`GET /api/subjects/{id}`):**
  - `200` con `Cache-Control: no-store`, los cursos en orden natural (1º, 10º) con sus sesiones y exactamente las claves `code`, `color`, `courses`, `createdAt`, `description`, `id`, `name`, `status` y `type`.
  - Una asignatura de otro colegio, una inexistente y un id que no es un UUID dan `404 NOT_FOUND` con el mismo mensaje.
- **Editar (`PUT /api/subjects/{id}`, solo `ADMIN`):**
  - Todos los campos a la vez (nombre con espacios de más, código de solo espacios, descripción vacía, tipo, estado, color y otros cursos con otras sesiones): `200`, `no-store`, nombre limpio, código y descripción a `null` (no texto vacío), cursos en orden natural con las sesiones nuevas, mismo `id` y misma fecha de alta. Al leerla de nuevo devuelve exactamente lo mismo, y el listado la muestra inactiva.
  - Reactivarla y ponerle un código con espacios (se recorta), cambiar solo las mayúsculas del propio nombre y código, un `PUT` idéntico a lo guardado y devolverla a su estado de partida: todos `200`.
  - Un `schoolId` y un `id` en el cuerpo se ignoran: el `id` sigue siendo el de la ruta y el colegio B no se ve afectado.
- **Validación (`400`) con los errores exactos y en orden:** todo inválido (`name` `REQUIRED`, `code` `INVALID_CHARACTERS`, `type` y `color` `INVALID_FORMAT`, dos `OUT_OF_RANGE` y un `DUPLICATE`), sin cursos (`REQUIRED`), curso de otro colegio y curso inexistente (`courses[1].courseId` y `courses[2].courseId` con `NOT_FOUND`) y JSON roto (`INVALID_JSON`). Tras todos los rechazos la asignatura no cambió.
- **`409`:** el nombre de otra asignatura sin distinguir mayúsculas ni espacios es `SUBJECT_ALREADY_EXISTS`; el código de otra sin distinguir mayúsculas, `SUBJECT_CODE_ALREADY_EXISTS`; con los dos repetidos se responde por el nombre. Otro colegio sí puede usar el mismo nombre y código (`200`).
- **Asignatura sin cursos:** se borró el único curso de Programación con `DELETE /api/courses/{id}`; la asignatura siguió existiendo con `courses: []`; guardarla sin cursos es `400` con `REQUIRED` en `courses`, y con un curso, `200`.
- **No existe, otro colegio y sin sesión:** editar la asignatura de otro colegio, una inexistente o un id mal escrito con un cuerpo inválido es `404` (el id va antes que el cuerpo) y no cambia nada. `GET` y `PUT` sin token son `401` con `WWW-Authenticate: Bearer`.
- **Un `MEMBER` real** (`GET /api/users` le da `403`): lee la asignatura con `200` y recibe `403 FORBIDDEN` al editarla con un cuerpo válido, con un id inexistente y un cuerpo inválido, y con un id mal escrito (no se revela nada ni se valida). La asignatura no cambió.
- **Concurrencia (cinco rondas cada una):**
  - Dos ediciones de la misma asignatura con estados distintos (nombre, tipo, estado, color y cursos con sesiones): siempre `200` y `200`, y queda el estado entero de una de ellas, nunca una mezcla.
  - Dos asignaturas editadas a la vez hacia el mismo nombre y el mismo código: siempre un `200` y un `409`.
  - La edición que pide un curso a la vez que se borra ese curso: edición `200` o `400`, borrado `200`, nunca `500`, y la asignatura queda sin ese curso.
- **Log del servidor (cubre las dos ejecuciones del guion):**
  - 55 eventos `SUBJECT_UPDATED` solo con `actor_id`, `changed_fields`, `courses_added`, `courses_changed`, `courses_removed`, `event`, `school_id` y `subject_id` (más los campos comunes del log). `changed_fields` toma todas las combinaciones esperadas, también `[]` en los `PUT` idénticos.
  - 23 `SUBJECT_UPDATE_REJECTED`: 4 `not_found`, 14 `duplicate_name`, 2 `duplicate_code` y 3 `course_not_found`.
  - 8 `AUTHORIZATION_DENIED` (los `PUT` del miembro y su `GET /api/users`).
  - Ningún nombre, código ni descripción aparece en el log («Inglés», «Programación», «Francés», «Lengua extranjera», `ING`, `ing`, `PRG`, «Gana A», «Pareja»: 0 apariciones).
  - No hay entradas de error (`level` 50 o 60).

## Resultado del guion

**85 comprobaciones correctas y 0 con fallo.** En la primera ejecución fallaron 2 por un error del propio guion, no de la aplicación: la prueba de «el colegio sale de la sesión» dejaba a Inglés con un solo curso y los dos controles posteriores esperaban dos. Se corrigió el guion (esa prueba conserva sus dos cursos) y se repitió entero.

## Restauración

- Se borraron los datos creados (`TRUNCATE … CASCADE` de todas las tablas de `calendarschool` menos `municipalities` y `_prisma_migrations`; la base de desarrollo estaba vacía antes de empezar).
- Se paró el backend (proceso en el puerto 3000) y el puerto quedó libre: solo quedan conexiones en `TIME_WAIT`.
- El recuento de todas las tablas de `calendarschool`, `calendarschool_test.public` y los esquemas `test_1` a `test_4` coincide con la línea base del paso 8 (`diff` sin diferencias).

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
