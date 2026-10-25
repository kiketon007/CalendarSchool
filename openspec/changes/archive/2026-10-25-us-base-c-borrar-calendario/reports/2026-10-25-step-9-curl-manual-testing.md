# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-10-25
- Cambio: us-base-c-borrar-calendario
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=.env.example --import tsx src/server.ts` desde `backend/`, puerto 3000) contra la base `calendarschool` de desarrollo, sin migraciones nuevas (esta historia no añade ninguna). Se usó la plantilla de desarrollo y no `backend/.env`, que lleva claves reales de reCAPTCHA: así el captcha es el falso. Se arrancó con `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX`, `INVITATION_ATTEMPTS_MAX` y `PASSWORD_RESET_ATTEMPTS_MAX` a 1000, porque todas las peticiones vienen de la misma IP.
- Dos colegios creados por la API (`Colegio Zeta Curl A` y `B`) con su administrador cada uno, y un `MEMBER` del colegio A creado con una invitación (`POST /api/invitations`, `accept`, login y `refresh`). El script no imprime contraseñas, tokens ni cookies; el acceso se obtiene con `POST /api/auth/refresh` y los ficheros temporales se borraron al terminar.
- Todos los nombres de los cuerpos JSON son ASCII, con los prefijos `Zeta` (calendarios) y `Zcurso` (cursos) más un número aleatorio, para poder buscarlos en el log.

## Qué se comprobó

- **Borrar con cursos (`DELETE /api/calendars/{id}`, solo `ADMIN`):** `200`, `Cache-Control: no-store`, exactamente las claves `courseCount` e `id` en `deleted`, el `id` del borrado y `courseCount: 2`. `GET /api/calendars/{id}` da `404`, el listado ya no lo trae y conserva el otro calendario. Los dos cursos siguen existiendo (`GET /api/courses/{id}` da `200`) y ninguno está en ningún calendario; se pueden reasignar a otro con un `PUT` (`200`).
- **Borrar sin cursos y con un curso reasignado:** `courseCount: 0` para un calendario sin cursos y `1` para el que acababa de recibir un curso.
- **`404 NOT_FOUND` sin borrar nada:** un calendario de otro colegio, uno inexistente, un `id` que no es UUID y uno ya borrado. El calendario del otro colegio sigue existiendo.
- **Sesión:** `DELETE` sin token es `401` con `WWW-Authenticate: Bearer`.
- **Un `MEMBER` real** (`GET /api/users` le da `403`): lee el calendario con `200`, pero el `DELETE` es `403 FORBIDDEN` con un calendario propio, con un `id` inexistente y con uno que no es UUID (nunca `404`). El calendario sigue con su curso.
- **Concurrencia (cinco rondas cada una):**
  - Dos borrados del mismo calendario a la vez: siempre `200` y `404`, y el curso queda sin calendario.
  - Un borrado y una edición del mismo calendario (que le asigna otro curso): borrado `200`, edición `200` o `404`, el calendario desaparece y ninguno de los dos cursos queda en un calendario.
  - Un borrado y la edición de otro calendario que se lleva uno de sus cursos: `200` y `200`, el curso movido queda en el otro calendario y el que no se movió, sin calendario.
  - Un borrado y el borrado de uno de sus cursos: `200` y `200`, el curso borrado da `404` y el otro sigue existiendo.
  - Ninguna ronda dio `500` ni se quedó bloqueada.
- **Log del servidor** (122 líneas):
  - 23 eventos `CALENDAR_DELETED`, uno por cada borrado con `200` (3 de las pruebas secuenciales y 20 de las carreras); ningún `404` dejó evento. Los `course_count` vistos son 0 (una vez), 1 (11 veces) y 2 (11 veces).
  - Claves de un evento: `actor_id`, `calendar_id`, `course_count`, `school_id` (más los comunes: `event`, `level`, `msg`, `time`, `pid` y `hostname`).
  - 4 `AUTHORIZATION_DENIED`: los 3 `DELETE` del `MEMBER` y su `GET /api/users`.
  - Cero apariciones de `Zeta`, `Zcurso`, `Miembro`, `Garcia` y `Jose`. Las 2 apariciones de «Colegio» son el mensaje fijo «Colegio y usuario administrador registrados», sin nombres.
  - Ninguna entrada de error (`level` 50 o 60).

## Resultado de la ejecución

38 comprobaciones `OK` y `FALLOS: 0` (código de salida 0); 23 borrados con `200`, que coinciden con los 23 eventos.

## Incidencias de la preparación (no del código)

- **Primera ejecución con 10 fallos, todos del script:** el contador que daba nombres únicos a los cursos y calendarios se incrementaba dentro de `$(…)`, que es un subproceso, así que todos se llamaban igual y el segundo daba `409` (el id quedaba vacío y el resto de comprobaciones fallaba en cascada). Se paró el backend, se vació la base de desarrollo, se cambió el contador por `$RANDOM` y se repitió todo con un log limpio. La segunda ejecución es la que se documenta aquí.
- La aplicación no tuvo ningún fallo en ninguna de las dos ejecuciones.

## Verificación de la base de datos

- Línea base (`countsCal.sh`): todo a 0 salvo `municipalities` (542) en `calendarschool` y en `calendarschool_test.public` y `test_1` a `test_4`.
- Tras las pruebas se vaciaron los datos creados de la base de desarrollo (`TRUNCATE … CASCADE` salvo `municipalities` y `_prisma_migrations`) y el recuento volvió a ser **idéntico** a la línea base.
- Backend parado con `taskkill` y puerto 3000 comprobado: ya no escucha ni conecta nadie (solo quedan conexiones cerradas en `TIME_WAIT` de los clientes de `curl`).

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
