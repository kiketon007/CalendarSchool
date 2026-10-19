# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-19
- Cambio: us05-crear-cursos
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local en `http://localhost:3000` contra `calendarschool` (PostgreSQL 17 en Docker) con la migración `add_courses_and_classes` aplicada y con el verificador de captcha **falso**: el `backend/.env` del equipo trae secretos reales de reCAPTCHA, así que el backend se arrancó cargando ese fichero sin las variables `RECAPTCHA_*`.
- Los scripts imprimen solo estados y comprobaciones: ningún token, enlace ni contraseña aparece en este informe. Las credenciales son de pruebas locales.
- Los cuerpos con `º`, `ª` o `á` se envían desde un fichero UTF-8 (`--data-binary @fichero`). Ver «Incidencias».

## Datos creados (10.1)

- `POST /api/auth/register` → `201` para dos colegios (cada uno con su administrador); `POST /api/auth/refresh` → access token de cada uno.
- Con SQL: un `MEMBER` activo del colegio 1 (hash de Bcrypt de coste 10); `POST /api/auth/login` → `204` y `refresh` → access token.

## Crear y listar

| Petición | Resultado |
| --- | --- |
| `POST /api/courses` (administrador, `"  1º   Primaria "` con las clases `B` y ` A `) | `201`; curso «1º Primaria» (espacios normalizados), clases `B` y `A` en el orden recibido, `tutor: null` |
| `POST` de «Infantil 3 años» (clases `1ªA` y `Grupo A`), «10º Curso» y «2º Primaria» | `201` los tres |
| `GET /api/courses` | `200`, `Cache-Control: no-store`; orden `1º Primaria`, `2º Primaria`, `10º Curso`, `Infantil 3 años` (el 2 antes que el 10); clases del primero `A`, `B` |

## Validación (400) y unicidad (409)

| Petición | Respuesta |
| --- | --- |
| Sin nombre | `400`, `{name, REQUIRED}` |
| `classes: []` | `400`, `{classes, INVALID_LENGTH}` |
| 13 clases | `400`, `{classes, INVALID_LENGTH}` |
| Clases `A` y ` a ` | `400`, `{classes[1].name, DUPLICATE}` |
| Nombre `1º <b>Primaria</b>` y clase `A/B` | `400`, `{name, INVALID_CHARACTERS}` y `{classes[0].name, INVALID_CHARACTERS}` |
| SQL en el nombre (`x'; DROP TABLE courses; --`) | `400` |
| Nombre de 101 caracteres / clase de 11 caracteres | `400` / `400` |
| Cuerpo `{}` | `400` |
| JSON roto | `400 INVALID_JSON` |
| Mismo nombre con otras mayúsculas y espacios (` 1º  PRIMARIA`) | `409 COURSE_ALREADY_EXISTS` |
| El mismo nombre en el colegio 2 | `201` |
| Cuerpo con `schoolId` del colegio 1 y `tutorId` (desde el colegio 1) | `201`: se ignoran |

## Aislamiento, roles y sesión

- `GET /api/courses` del colegio 2: `200`, solo ve su «1º Primaria».
- `MEMBER`: `POST` → `201` y `GET` → `200` (ve los 6 cursos de su colegio).
- Sin token: `POST` y `GET` → `401 INVALID_SESSION`; con un token inválido, `401`.

## Concurrencia

- Tres `POST` simultáneos idénticos de «Simultáneo» (con dos clases): `201`, `409` y `409`. En la base de datos, 1 curso y 2 clases.
- La primera pasada con dos peticiones simultáneas no sirvió (ver «Incidencias»); se repitió con tres.

## Base de datos y log

- Filas: 6 cursos en el colegio 1, con los nombres normalizados esperados (`10º curso`, `1º primaria`, `2º primaria`, `3º primaria`, `4º primaria`, `infantil 3 años`), sin clases huérfanas, sin cursos sin clases y sin cursos fuera de los dos colegios de prueba.
- Log: eventos `COURSE_CREATED` (con `school_id` y `class_count`) y `COURSE_CREATION_REJECTED` (uno por cada `409`). Ningún nombre de curso o de clase, ningún token ni contraseña aparece en el log.
- Base de datos parada (`docker stop calendarschool-postgres-1`): `GET` y `POST /api/courses` → `503 DATABASE_UNAVAILABLE` (la autenticación falla antes que el caso de uso, como en el resto de endpoints protegidos). No se creó nada. Tras `docker start` y esperar a `pg_isready`, `GET` vuelve a responder `200`.

## Incidencias de la ejecución (no del producto)

- **Cuerpos con caracteres no ASCII.** La primera pasada falló con `400 INVALID_CHARACTERS` en todos los `POST` con `º`, `ª` o `á`. No era del producto: `curl.exe` de Windows recibe el cuerpo por la línea de comandos y estropea esos caracteres. Se comprobó con tres peticiones (ASCII por `-d` → `201`; `º` por `-d` → `400`; `º ª á` desde un fichero UTF-8 → `201`) y se cambió el script para enviar los cuerpos desde un fichero. Se borraron los datos de la primera pasada y se repitió entera; los resultados de este informe son los de la repetición.
- La sección de altas simultáneas del script seguía usando `-d` con «Simultáneo», así que dio dos `400`; se repitió a mano con un fichero.

## Limpieza (10.2)

- Se borraron las filas creadas (`classes`, `courses`, `refresh_tokens`, `access_links`, `rate_limit_attempts`, `users`, `schools`) de `calendarschool`.
- Estado posterior comparado con la línea base del paso 9: idéntico en todos los esquemas.
- Se paró el backend y se comprobó que el **puerto 3000 queda libre**.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
