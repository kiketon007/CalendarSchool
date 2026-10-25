# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-10-25
- Cambio: us-base-b-editar-calendario
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=backend/.env.example --import tsx src/server.ts`, puerto 3000) contra la base `calendarschool` de desarrollo, que ya tenía la migración `add_calendars` (esta historia no añade ninguna). Se usó la plantilla de desarrollo y no `backend/.env`, que lleva claves reales de reCAPTCHA: así el captcha es el falso. Se arrancó con `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` e `INVITATION_ATTEMPTS_MAX` a 1000, porque todas las peticiones vienen de la misma IP, y se vació `rate_limit_attempts` antes.
- Dos colegios creados por la API (`Colegio Curl Edicion A` y `B`) con su administrador cada uno, y un `MEMBER` del colegio A creado con una invitación (`POST /api/invitations`, `accept`, login y `refresh`). El script no imprime contraseñas, tokens ni cookies; el acceso se obtiene con `POST /api/auth/refresh` y los ficheros temporales se borraron al terminar.
- Todos los nombres de los cuerpos JSON son ASCII (no hay acentos que `curl.exe` pueda recibir en la página de códigos de Windows).

## Qué se comprobó

- **Leer (`GET /api/calendars/{id}`):** `200`, `Cache-Control: no-store`, exactamente las claves `courses`, `createdAt`, `id`, `name` y `periods`, los siete periodos en orden y los cursos en orden natural («Curso 2» antes que «Curso 10»). Un calendario de otro colegio, uno inexistente y un `id` que no es UUID: `404 NOT_FOUND` los tres.
- **Editar (`PUT`, solo `ADMIN`):**
  - Renombrar, cambiar la jornada (el recreo pasa a 11:15–12:00) y cambiar los cursos en una sola petición: `200`, `no-store`, el nombre y los periodos nuevos, los cursos «el que sigue, el movido desde otro calendario y el nuevo» en orden natural, la misma `id` y la misma fecha de creación. «Infantil» se queda sin el curso que le quitaron y el curso que se dejó fuera no está en ningún calendario.
  - Un `PUT` idéntico a lo guardado devuelve `200` con el mismo calendario, byte a byte.
  - Cambiar solo las mayúsculas del propio nombre: `200`.
  - Sin `courseIds`: `200` y el calendario queda sin cursos (que quedan sin calendario); volver a asignar dos cursos: `200`.
- **`409`:** el nombre de otro calendario, sin distinguir mayúsculas ni espacios (`«  infantil »`), es `409 CALENDAR_ALREADY_EXISTS` y el calendario no cambia; otro colegio puede usar ese nombre.
- **Validación (`400`), con los errores exactos y en orden:** nombre vacío, sin periodos y curso mal escrito; más de 90 minutos (`TOO_LONG`); solapamiento (`OVERLAP`); recreo al principio (`NOT_ALLOWED`); hora mal escrita (`INVALID_FORMAT`); curso de otro colegio e inexistente (`courseIds[1]` y `courseIds[2]` con `NOT_FOUND`); curso repetido (`DUPLICATE`). Después de todos esos intentos el calendario es exactamente el que era y el curso del otro colegio no se tocó.
- **Sesión y `404` al editar:** `GET` y `PUT` sin token son `401` con `WWW-Authenticate: Bearer`. Un `PUT` con cuerpo válido a un calendario de otro colegio, inexistente o con `id` que no es UUID responde `404 NOT_FOUND` y no cambia nada (ni el nombre del calendario ajeno ni el calendario de los cursos).
- **Un `MEMBER` real** (`GET /api/users` le da `403`): lee un calendario con `200`, pero el `PUT` es `403 FORBIDDEN`, y también `403` (no `404` ni `400`) con un `id` inexistente, con un `id` que no es UUID y con un cuerpo inválido; no cambia nada.
- **La API de los cursos no cambia:** `GET /api/courses` devuelve las claves de siempre (`classes`, `createdAt`, `id`, `name` y `studentCount`) y `GET /api/courses/{id}` no lleva ni `calendar` ni `calendarId`, con cursos que siguen un calendario.
- **Concurrencia (cinco rondas cada una):**
  - Dos ediciones del mismo calendario a la vez (nombre, jornada y curso distintos): siempre `200` y `200`, y el estado final es entero el de una de ellas (nombre, periodos y curso de la misma), nunca una mezcla.
  - Una edición que asigna un curso a la vez que se borra ese curso: edición `200` o `400`, borrado `200`, nunca `500`.
  - Una edición y un alta con dos cursos en común (en orden distinto): `200` y `201`, sin interbloqueo.
- **Log del servidor** (130 `CALENDAR_UPDATED`, 21 `CALENDAR_UPDATE_REJECTED`, 116 `CALENDAR_CREATED` y 20 `AUTHORIZATION_DENIED`):
  - `CALENDAR_UPDATED` lleva `actor_id`, `break_count`, `calendar_id`, `changed_fields`, `courses_added`, `courses_removed`, `school_id` y `session_count` (más los campos comunes del log). Los `changed_fields` vistos son `[]`, `["name"]`, `["courses"]`, `["name","courses"]` y `["name","periods","courses"]`.
  - `CALENDAR_UPDATE_REJECTED`: 5 con `reason: duplicate`, 6 con `course_not_found` y 10 con `not_found`.
  - Ningún nombre de calendario, de curso ni de persona aparece (cero apariciones de «Primaria», «Infantil», «Edita», «Carrera», «Comun», «Miembro», «Fantasma» ni «Del miembro»; las 176 apariciones de «Curso » son los mensajes fijos «Curso creado» y «Curso borrado», sin ningún nombre real de curso).
  - No hay entradas de error (`level` 50 o 60).

## Resultado de la ejecución

56 comprobaciones `OK` y `FALLOS: 0` (código de salida 0).

## Incidencias de la preparación (no del código)

- **Datos de test mal planteados:** en la primera ejecución falló una comprobación porque mi propio `PUT` al colegio B (para probar que otro colegio puede usar el nombre) iba sin `courseIds` y dejó a su curso sin calendario, que es el comportamiento correcto. Se añadió el curso al cuerpo del `PUT`.
- **Saltos de línea de Windows:** `jq.exe` termina las líneas con CRLF, así que la comparación byte a byte del `PUT` idéntico daba «distinto» aunque las dos respuestas eran iguales (se comprobó con una reproducción mínima y con `od -c`: solo difería un `\r`). El script normaliza el `\r` antes de comparar.
- Ninguna de las dos incidencias era un fallo de la aplicación.

## Verificación de la base de datos

- Línea base (`countsCal.sh`): todo a 0 salvo `municipalities` (542) en `calendarschool` y en `calendarschool_test.public` y `test_1` a `test_4`.
- Tras las pruebas se vaciaron los datos creados de la base de desarrollo (`TRUNCATE … CASCADE` salvo `municipalities` y `_prisma_migrations`) y el recuento volvió a ser **idéntico** a la línea base.
- Backend parado con `taskkill` y puerto 3000 comprobado: ya no escucha nadie.

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
