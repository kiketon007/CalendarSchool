# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-26
- Cambio: us-subject-asignaturas
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=.env.example --import tsx src/server.ts`, puerto 3000) contra la base `calendarschool` de desarrollo, con la migración `add_subjects` aplicada. Se usó la plantilla de desarrollo y no `backend/.env`, que lleva claves reales de reCAPTCHA: así el captcha es el falso. Se arrancó con `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` e `INVITATION_ATTEMPTS_MAX` a 1000, porque todas las peticiones vienen de la misma IP.
- Dos colegios creados por la API (`Colegio Curl Asignaturas A` y `B`) con su administrador cada uno, y un `MEMBER` real del colegio A creado con una invitación (`POST /api/invitations`, `accept`, login y `refresh`). El guion no imprime contraseñas, tokens ni cookies; el acceso se obtiene con `POST /api/auth/refresh`.
- Los acentos de los cuerpos JSON se envían como escapes `\uXXXX`: Git Bash pasa los argumentos a `curl.exe` en la página de códigos de Windows.

## Qué se comprobó

- **Crear (`POST /api/subjects`, solo `ADMIN`):**
  - Inglés con tres cursos, el código `« ING »` recortado, descripción y color: `201`, `Cache-Control: no-store`, tipo, estado, color y descripción correctos, y exactamente las claves `code`, `color`, `courses`, `createdAt`, `description`, `id`, `name`, `status` y `type`.
  - Los cursos de la respuesta, en orden natural (1º, 2º, 10º) con sus sesiones, aunque se enviaron como 10º, 1º y 2º.
  - Programación sin código ni descripción, y Música con un código y una descripción solo con espacios: `201` con `null`, nunca un texto vacío. Dos asignaturas sin código y con el mismo color: `201`.
- **Listar (`GET /api/subjects`):** `200`, `no-store`, ordenadas por nombre (Inglés, Música, Plástica, Programación), con los tres cursos de Inglés.
- **Validación (`400`), con los errores exactos y en orden:** todo inválido (`name` `REQUIRED`, `code` `INVALID_CHARACTERS`, `type` y `color` `INVALID_FORMAT`, dos `OUT_OF_RANGE` y un `DUPLICATE`); sin cursos (`REQUIRED`); media sesión (`INVALID_FORMAT`); 101 cursos (`INVALID_LENGTH`); nombre, código y descripción demasiado largos; curso de otro colegio y curso inexistente (`courses[1].courseId` y `courses[2].courseId` con `NOT_FOUND`); JSON roto (`INVALID_JSON`). Tras todos esos intentos no se creó ninguna asignatura y el colegio B no ve nada del A.
- **`409`:** el mismo nombre sin distinguir mayúsculas ni espacios es `SUBJECT_ALREADY_EXISTS`; el mismo código sin distinguir mayúsculas, `SUBJECT_CODE_ALREADY_EXISTS`; con los dos repetidos se responde por el nombre. Otro colegio puede usar el mismo nombre y código (`201`) y ve solo la suya.
- **El colegio sale de la sesión:** un `schoolId` y un `id` en el cuerpo se ignoran (`201` con un `id` propio).
- **Sesión y roles:** `GET` y `POST` sin token son `401` con `WWW-Authenticate: Bearer`. Un `MEMBER` real (`GET /api/users` le da `403`) lista las mismas 5 asignaturas que el administrador con `200`, pero `POST` es `403 FORBIDDEN` con un cuerpo válido y también con uno inválido (no llega a validarse) y no se crea nada.
- **La API de los cursos no cambia:** `GET /api/courses` devuelve las mismas claves de siempre (`classes`, `createdAt`, `id`, `name` y `studentCount`), el detalle no lleva asignaturas, y `DELETE /api/courses/{id}` de un curso con una asignatura responde `200` con su forma de siempre; la asignatura sigue existiendo, sin ese curso.
- **Concurrencia (cinco rondas cada una):** dos altas a la vez con el mismo nombre dan siempre un `201` y un `409`; el alta con un curso a la vez que se borra ese curso da `201` (o `400`) y el borrado `200`, nunca `500`.
- **Log del servidor:**
  - 16 eventos `SUBJECT_CREATED` solo con `actor_id`, `course_count`, `event`, `school_id` y `subject_id` (más los campos comunes del log).
  - 9 `SUBJECT_CREATION_REJECTED`: 7 `duplicate_name`, 1 `duplicate_code` y 1 `course_not_found`.
  - 3 `AUTHORIZATION_DENIED` (los dos `POST` del miembro y su `GET /api/users`).
  - Ningún nombre, código ni descripción aparece en el log («Inglés», «Programación», «Música», «Plástica», «Lengua extranjera», `ING`, `ing`: 0 apariciones).
  - No hay entradas de error (`level` 50 o 60).

## Un fallo encontrado y corregido

En la primera ejecución falló una comprobación (68 correctas y 1 con fallo): la respuesta del `POST` devolvía los cursos en el orden en que se enviaron (10º, 1º, 2º) y no en orden natural, como exige la spec. `ListSubjects` los ordenaba, pero `CreateSubject` no, y los tests de integración solo comprobaban el orden del listado. Se escribió primero un test unitario y otro de integración HTTP que fallaban, se corrigió `CreateSubject` para ordenar los cursos con `byName` y se repitió el guion entero: **69 correctas y 0 con fallo**.

## Restauración

- Se borraron los datos creados (`TRUNCATE … CASCADE` de todas las tablas de `calendarschool` menos `municipalities` y `_prisma_migrations`; la base de desarrollo estaba vacía antes de empezar).
- Los esquemas `test_<n>` de la base de test conservaban una fila por mis ejecuciones sueltas de ficheros de integración (`resetDatabase()` vacía antes de cada test, no al terminar); se vaciaron igual.
- El recuento posterior es **idéntico** a la línea base del paso 9 (`diff` sin diferencias).
- El backend se paró y los puertos 3000, 3001 y 4173 quedaron libres.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
