# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-10-29
- Cambio: us-subject-c-borrar-asignaturas
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=.env.example --import tsx src/server.ts`, puerto 3000) contra la base `calendarschool` de desarrollo. Se usó la plantilla de desarrollo y no `backend/.env`, que lleva claves reales de reCAPTCHA: así el captcha es el falso. Se arrancó con `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` e `INVITATION_ATTEMPTS_MAX` a 1000, porque todas las peticiones vienen de la misma IP.
- Dos colegios creados por la API (`Colegio Curl Borrado A` y `B`) con su administrador cada uno, tres cursos (dos en A y uno en B), cuatro asignaturas de partida (Inglés con dos cursos, Música y Programación en A, Francés en B) y un `MEMBER` real del colegio A creado con una invitación (`POST /api/invitations`, `accept`, login y `refresh`). El guion no imprime contraseñas, tokens ni cookies.
- Los acentos de los cuerpos JSON se envían como escapes `\uXXXX`: Git Bash pasa los argumentos a `curl.exe` en la página de códigos de Windows.

## Qué se comprobó

- **Sin sesión:** `DELETE /api/subjects/{id}` sin token es `401` con `WWW-Authenticate: Bearer`, y la asignatura sigue existiendo.
- **Borrar con cursos (`DELETE /api/subjects/{id}`, solo `ADMIN`):**
  - `200` con `Cache-Control: no-store` y el cuerpo exacto `{ success: true, data: { deleted: { id } } }`.
  - `GET /{id}` pasa a `404`, el listado ya no la trae y conserva las otras, los dos cursos siguen existiendo y otra asignatura que compartía un curso no cambió.
  - El nombre y el código quedan libres: se crea otra «Inglés» con el código `ING` y recibe un id distinto.
- **Borrar sin cursos:** tras borrar el único curso de Programación por la API, la asignatura sigue existiendo con `courses: []` y su borrado es `200` con su `id`.
- **`404 NOT_FOUND` con el mismo mensaje en todos los casos:** la ya borrada (también al intentar editarla con `PUT`), la de otro colegio (que sigue existiendo para el suyo), una inexistente y un id que no es un UUID.
- **Un `MEMBER` real** (`GET /api/users` le da `403`): recibe `403 FORBIDDEN` al borrar una asignatura existente, con un id inexistente y con un id mal escrito (no se revela nada), y sigue leyendo la asignatura con `200`.
- **Concurrencia (cinco rondas cada una):**
  - Dos borrados a la vez de la misma asignatura: siempre un `200` y un `404`.
  - Un borrado contra una edición de la misma: el borrado es `200`, la edición `200` o `404`, nunca `500`, y la asignatura queda borrada.
  - El borrado de una asignatura contra el de uno de sus cursos: `200` y `200`, sin `500`, y la asignatura queda borrada.
- **Aislamiento:** el colegio B conserva su asignatura y su curso intactos tras todo lo anterior.
- **Log del servidor:**
  - 17 eventos `SUBJECT_DELETED` (1 con cursos, 1 sin cursos y 15 de las rondas de concurrencia), solo con `actor_id`, `event`, `school_id` y `subject_id` (más los campos comunes del log).
  - 4 `AUTHORIZATION_DENIED` (los tres borrados del miembro y su `GET /api/users`), 1 `AUTHENTICATION_REJECTED` (el `DELETE` sin token) y 6 `SUBJECT_UPDATE_REJECTED` (la edición de la borrada y las ediciones que perdieron la carrera).
  - Ningún nombre ni código aparece en el log («Inglés», «Música», «Programación», «Francés», «Lengua extranjera», `ING`, `MUS`, `PRG`, `FRA` y los nombres de las rondas: 0 apariciones).
  - No hay entradas de error (`level` 50 o 60). Un borrado que responde `404` no deja evento `SUBJECT_DELETED`.

## Resultado del guion

**50 comprobaciones correctas y 0 con fallo.** En el primer intento el guion se paró en la preparación (`400` al crear un curso) por un error del propio guion, no de la aplicación: los acentos se habían escrito literales en lugar de como escapes `\uXXXX`. Se corrigió y se repitió entero.

## Limpieza

- Los datos creados se borraron con un `TRUNCATE … CASCADE` de las tablas de `calendarschool.public` (salvo `municipalities` y `_prisma_migrations`); el recuento coincide con la línea base del paso 8 (`diff` sin diferencias).
- El backend se paró y el puerto 3000 quedó libre (`netstat` sin ningún proceso escuchando).

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
