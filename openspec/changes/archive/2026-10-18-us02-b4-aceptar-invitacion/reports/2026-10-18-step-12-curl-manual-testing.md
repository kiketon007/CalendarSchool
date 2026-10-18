# Informe del paso 12 - Pruebas manuales con curl

- Fecha: 2026-10-18
- Cambio: us02-b4-aceptar-invitacion
- Agente: Claude Sonnet 5.5

## Entorno

- Backend de desarrollo en `http://localhost:3000`, arrancado con `node --env-file=<copia de backend/.env sin las claves de reCAPTCHA> --import tsx src/server.ts`. Sin secretos de reCAPTCHA se usa el verificador falso (el backend lo avisa en el log con `CAPTCHA_FAKE_VERIFIER`). La copia del `.env` estaba en el directorio temporal de la sesión y se borró al terminar.
- Para la prueba del límite de intentos (puntos 18 a 21) se reinició el backend con `INVITATION_ATTEMPTS_MAX=3` en el entorno y se vaciaron antes los intentos `invitation:*` de la tabla `rate_limit_attempts`. El resto de las pruebas usa el valor por defecto (10).
- Base de datos de desarrollo `calendarschool` (PostgreSQL 17 en Docker Compose), con `APP_ORIGIN=http://localhost:5173`. Línea base: `users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `access_links` (usados y sin usar) a 0 y `municipalities` a 542.
- Datos de prueba: un colegio («CEIP Manual B4») con su administrador, creado por `POST /api/auth/register`; tres invitaciones generadas con `POST /api/invitations` (miembro, administrador y una tercera de miembro que se revocó) y las cuentas que se crearon aceptándolas. Todos los emails llevan el prefijo `manual.` y el mismo sufijo numérico.
- Los tokens de los enlaces, las cookies y las contraseñas se guardaron en ficheros temporales y no se muestran aquí; las respuestas de las tablas no incluyen ningún token. Los endpoints de la persona invitada se llamaron sin cabecera `Authorization` ni `Origin`.
- Todas las comprobaciones se hicieron con `curl` desde la propia sesión; el estado de la base de datos se leyó con `psql`.

## Consultar la invitación (`POST /api/invitations/lookup`)

| # | Petición | Respuesta |
|---|---|---|
| 1 | `lookup` con el token de la invitación de miembro, sin `Authorization` | `200` con `school.name` y `role: MEMBER`; `Cache-Control: no-store` |
| 2 | El mismo `lookup` otras dos veces | `200` las tres veces; en la base de datos la invitación sigue sin `used_at` y sin `revoked_at` |
| 3 | `lookup` con `{}` (sin token) | `410 ACCESS_LINK_INVALID` |
| 4 | `lookup` con un token inexistente | `410 ACCESS_LINK_INVALID` |
| 5 | `lookup` con el token de una invitación revocada | `410 ACCESS_LINK_INVALID` |
| 6 | `lookup` con `{"token": 42}` | `410 ACCESS_LINK_INVALID` |

## Aceptar la invitación (`POST /api/invitations/accept`)

| # | Petición | Respuesta |
|---|---|---|
| 7 | Token válido, nombre vacío, email sin `@`, contraseña sin variedad y sin `privacyPolicyAccepted` | `400 VALIDATION_ERROR` con un detalle por campo: `firstName REQUIRED`, `email INVALID_FORMAT`, `password WEAK_PASSWORD` y `privacyPolicyAccepted REQUIRED` |
| 8 | Token válido y el email del administrador en mayúsculas | `409 EMAIL_ALREADY_REGISTERED`; la invitación sigue pendiente (`used_at` nulo) |
| 9 | Token válido, datos válidos y además `role: "ADMIN"` y un `schoolId` inventado en el cuerpo | `201` con `data` de dos claves (`user` y `school`), sin `Set-Cookie` y con `Cache-Control: no-store` |
| 10 | Fila del usuario creado en la base de datos | rol `MEMBER` y estado `ACTIVE`, con la fecha y la versión de la política de privacidad, en el colegio de la invitación (el `role` y el `schoolId` del cuerpo se ignoraron) |
| 11 | Fila de la invitación | `used_at` informado |
| 12 | Aceptar otra vez la misma invitación con otro email | `410 ACCESS_LINK_INVALID`; no se crea ningún usuario con ese email |
| 13 | `POST /api/auth/login` con la cuenta nueva | `204` |

## Aceptaciones simultáneas, registro, base de datos y límite

| # | Petición | Respuesta |
|---|---|---|
| 14 | Dos `accept` en paralelo de la invitación de administrador, con emails distintos | `201` y `410`; se crea un único usuario, de rol `ADMIN` |
| 15 | Registro del backend de la primera ejecución | ninguna coincidencia con los tokens, sus hashes SHA-256, la contraseña ni el texto `invitacion#`; sí aparecen `INVITATION_CREATED` (3), `INVITATION_ACCEPTED` (2) e `INVITATION_ACCEPT_REJECTED` (3) |
| 16 | `lookup` y `accept` con PostgreSQL parado (`docker stop`) | `503 DATABASE_UNAVAILABLE` en las dos |
| 17 | `lookup` tras volver a arrancar la base | respuesta correcta (`410` con el token revocado) en el primer intento, sin reiniciar el backend |
| 18 | Con `INVITATION_ATTEMPTS_MAX=3`: tres `lookup` con tokens inexistentes | `410` las tres |
| 19 | Un cuarto `lookup` | `429 TOO_MANY_REQUESTS` con `Retry-After: 900` |
| 20 | `accept` con el límite agotado | `429` |
| 21 | Registro de la segunda ejecución | contiene `INVITATION_RATE_LIMITED` (2) y no contiene el token |

## Limpieza

- Se borraron los datos creados: 3 enlaces de acceso (antes que los usuarios, por las claves foráneas `RESTRICT`), 2 sesiones, 3 usuarios, 1 colegio y 4 intentos del limitador.
- El estado de `calendarschool` es idéntico a la línea base (`users`, `schools`, `refresh_tokens`, `rate_limit_attempts` y `access_links` a 0, `municipalities` a 542, 7 migraciones).
- El backend se paró (`taskkill`) y el puerto 3000 quedó libre.
- Se borraron del directorio temporal el `.env` sin reCAPTCHA, los tokens, las cookies y las respuestas.

## Resultado

- Estado del paso 12: PASA
- Problemas bloqueantes: ninguno
- Observación: con el límite agotado, `Retry-After` vale 900 segundos (15 minutos) porque los tres intentos fallidos se hicieron en el mismo instante que el cuarto; el valor baja a medida que el intento más antiguo se acerca al final de la ventana.
