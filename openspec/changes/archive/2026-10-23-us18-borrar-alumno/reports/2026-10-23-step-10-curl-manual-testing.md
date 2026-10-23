# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-23
- Cambio: us18-borrar-alumno
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=backend/.env.example --import tsx src/server.ts`, puerto 3000) contra la base `calendarschool` de desarrollo, sin migraciones pendientes. Se usó la plantilla de desarrollo y no `backend/.env`, que lleva claves reales de reCAPTCHA: así el captcha es el falso. Se arrancó con `REGISTRATION_ATTEMPTS_MAX`, `LOGIN_ATTEMPTS_MAX` e `INVITATION_ATTEMPTS_MAX` a 1000, porque todas las peticiones vienen de la misma IP.
- Dos colegios creados por la API (`Colegio Curl Dieciocho A` y `B`) con su administrador cada uno, y un `MEMBER` del colegio A creado por la API con una invitación (`POST /api/invitations`, `accept`, login y `refresh`). El script no imprime contraseñas, tokens ni cookies; el acceso se obtiene con `POST /api/auth/refresh` y los ficheros temporales se borraron al terminar.
- Los cuerpos JSON se envían con los acentos como escapes `\uXXXX`: Git Bash pasa los argumentos a `curl.exe` en la página de códigos de Windows y un `é` literal llegaba al backend como un carácter no válido (`INVALID_CHARACTERS`).

## Qué se comprobó

- **Borrado:** `DELETE /api/students/{id}` responde `200` con `{ "success": true, "data": { "deleted": { "id": "<id>" } } }` y `Cache-Control: no-store`. Después, `GET /api/students/{id}` del borrado es `404`, el listado ya no lo trae (de 3 alumnos quedan 2) y sigue sin datos sensibles, y el curso conserva sus dos clases y el resto de alumnos.
- **`404` y `401`:** borrar por segunda vez, un `id` inexistente, `abc` y un alumno de otro colegio son `404 NOT_FOUND` sin borrar nada (el alumno del colegio B sigue existiendo); sin token es `401` con `WWW-Authenticate: Bearer`, y el alumno sigue existiendo.
- **`MEMBER`:** el miembro (`GET /api/users` le da `403`, así que es un `MEMBER` de verdad) borra a un alumno del colegio con `200`.
- **Concurrencia:** cinco rondas borrando a la vez un alumno y su curso (siempre `200` y `200`, nunca `500`) y cinco rondas con dos `DELETE` simultáneos del mismo alumno (siempre un `200` y un `404`).
- **Log del servidor:** hay eventos `STUDENT_DELETED` y todos llevan exactamente `school_id`, `actor_id` y `student_id` (más los campos comunes del log). En los eventos `STUDENT_*` no aparece ningún nombre, apellido, curso, tipo de comida ni observación («Juan», «García», «Álvarez», «Eva», «Gil», «Mario», «Pau», «Soler», «frutos», «Diabetes», «Primaria»: 0 apariciones). No hay entradas de error (`level` 50 o 60).

## Resultado de la ejecución

```
OK   token del colegio A / B
--- DELETE /api/students/{id}: borrado
OK   borrar a Juan -> 200
OK   respuesta { deleted: { id } }
OK   Cache-Control: no-store
OK   leer al borrado -> 404
OK   el listado ya no lo trae (quedan 2)
OK   el listado sigue sin datos sensibles -> false
OK   el curso sigue existiendo con sus 2 clases
OK   los alumnos restantes siguen en el curso
--- DELETE: 404 y 401
OK   borrado repetido -> 404 / código NOT_FOUND
OK   id inexistente -> 404 / id que no es UUID -> 404 / alumno de otro colegio -> 404
OK   el alumno del colegio B sigue existiendo -> 200
OK   sin token -> 401 / WWW-Authenticate: Bearer
OK   tras el 401, Ana sigue existiendo -> 200
--- Un MEMBER puede borrar
OK   aceptar la invitación (201), login (204), rol del miembro (403 en /api/users)
OK   el miembro borra a Mario -> 200 / Mario ya no existe -> 404
--- Concurrencia
OK   cinco rondas con 200 y 200, nunca 500
OK   cinco rondas con un 200 y un 404
--- Borrar el resto
OK   borrar a Ana, a Eva y a Pau (con el token de su colegio) -> 200; el colegio A se queda sin alumnos
FALLOS: 0
```

## Incidencias de la preparación (no del código)

- El primer intento falló entero (`401` en todo) porque el backend arrancó con `backend/.env` y sus claves reales de reCAPTCHA: el registro daba `CAPTCHA_FAILED`. Se reinició con la plantilla de desarrollo.
- Los intentos fallidos agotaron el límite de registros por IP (`429`, guardado en `rate_limit_attempts`): se vació esa tabla de la base de desarrollo y se arrancó con los límites a 1000.
- Los acentos en los cuerpos (ver «Entorno») y un alumno de ejemplo creado sin clase con `classId` vacío eran errores del script, no del endpoint.

## Verificación de la base de datos

- Línea base (`counts14.sh`): todo a 0 salvo `municipalities` (542) en `calendarschool` y en `calendarschool_test` (`public` y `test_1` a `test_4`).
- Tras la prueba se borraron los datos creados de la base de desarrollo (`students`, `classes`, `courses`, `professors`, `refresh_tokens`, `access_links`, `rate_limit_attempts`, `users` y `schools`) y el recuento volvió a ser **idéntico** a la línea base.
- Backend parado con `taskkill` y puerto 3000 comprobado: ya no escucha nadie.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
