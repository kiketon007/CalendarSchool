# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-10-20
- Cambio: us08-borrar-curso
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local en `http://localhost:3000` contra `calendarschool` (PostgreSQL 17 en Docker), con el verificador de captcha **falso**: el `backend/.env` del equipo trae secretos reales de reCAPTCHA, así que el backend se arrancó cargando ese fichero sin las variables `RECAPTCHA_*`.
- Los scripts imprimen solo estados y comprobaciones: ningún token ni contraseña aparece en este informe. Las credenciales son de pruebas locales.
- Los cuerpos con `º` o acentos se envían desde un fichero UTF-8 (`--data-binary @fichero`), porque `curl.exe` de Windows los estropea por la línea de comandos (incidencia ya conocida).

## Datos creados (9.1)

- `POST /api/auth/register` → `201` para dos colegios (cada uno con su administrador); `POST /api/auth/refresh` → access token de cada uno.
- Colegio 1: «1º Primaria» con las clases `A`, `B` y `C`, «2º Primaria» con `A` e «Infantil» con 12 clases. Colegio 2: «3º Primaria» con `A` y `B`. En total, 4 cursos y 18 clases.

## `GET /api/courses/{id}/impact`

| Comprobación | Resultado |
| --- | --- |
| Impacto de «1º Primaria» | `200`, `{ "impact": { "classCount": 3, "studentCount": 0 } }` |
| Cabecera | `Cache-Control: no-store` |
| Efecto en la base de datos | Ninguno: el curso y sus 3 clases siguen ahí |
| Impacto de «Infantil» (12 clases) | `200`, `classCount: 12`, `studentCount: 0` |

## `DELETE /api/courses/{id}`

| Comprobación | Resultado |
| --- | --- |
| Borrar «1º Primaria» | `200`, `{ "deleted": { "classCount": 3, "studentCount": 0 } }` |
| Base de datos | El curso ya no existe y sus clases tampoco (0); «2º Primaria» (1 clase) e «Infantil» (12 clases) siguen intactos |
| Repetir el `DELETE` | `404 NOT_FOUND` |
| `GET`, `PUT` e impacto del curso borrado | `404` los tres |
| Listado | Ya no incluye «1º Primaria» |
| Borrar «Infantil» (12 clases) | `200`, `classCount: 12`, `Cache-Control: no-store`; 0 clases quedan |
| Dos `DELETE` simultáneos del mismo curso | Un `200` y un `404`; el curso y sus clases ya no existen |

## Aislamiento, ids inválidos y sesión

- Impacto y `DELETE` de un curso de **otro colegio**: `404 NOT_FOUND`; el curso ajeno conserva su curso y sus 2 clases. El administrador del colegio 2 borra el suyo con un `200` (`classCount: 2`).
- Impacto y `DELETE` de un UUID que no existe y de un id que no es un UUID (`abc`): `404`.
- Sin token: `401` (impacto y `DELETE`); `DELETE` con un token inválido: `401`. «2º Primaria» sigue existiendo tras los intentos fallidos.

## Base de datos y log

- Sin clases huérfanas tras los borrados.
- Cuatro eventos `COURSE_DELETED` (uno por cada `200`: `class_count` 3, 12, 2 y 2, `student_count` 0). Los `404` no dejan evento.
- Ningún evento contiene nombres de cursos o de clases, y ni los tokens ni las contraseñas aparecen en el log del backend.

## Notas sobre el script

- El script envió además un `DELETE` a un id mal formado que no sale en las tablas (respondió `404`, sin efecto). Los dos estados de los borrados simultáneos salen pegados en su salida (`200` y `404`) porque los ficheros temporales no llevan salto de línea.

## Limpieza (9.2)

- Se borraron las filas creadas (`classes`, `courses`, `refresh_tokens`, `access_links`, `users`, `schools` y `rate_limit_attempts`) de `calendarschool`, y el recuento por tabla coincide con la línea base (comparado con `diff`, en `calendarschool` y en `calendarschool_test`).
- Se paró el backend (árbol de procesos) y los puertos 3000, 3001, 4173 y 5173 quedan libres.
