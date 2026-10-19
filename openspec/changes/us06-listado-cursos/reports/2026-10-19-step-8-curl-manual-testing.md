# Informe del paso 8 - Pruebas manuales con curl

- Fecha: 2026-10-19
- Cambio: us06-listado-cursos
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local en `http://localhost:3000` contra `calendarschool` (PostgreSQL 17 en Docker), con el verificador de captcha **falso**: el `backend/.env` del equipo trae secretos reales de reCAPTCHA, así que el backend se arrancó cargando ese fichero sin las variables `RECAPTCHA_*`.
- Los scripts imprimen solo estados y comprobaciones: ningún token ni contraseña aparece en este informe. Las credenciales son de pruebas locales.
- Los cuerpos con `º` o acentos se envían desde un fichero UTF-8 (`--data-binary @fichero`), porque `curl.exe` de Windows los estropea por la línea de comandos (incidencia ya conocida del paso 10 de US05).

## Datos creados (8.1)

- `POST /api/auth/register` → `201` para dos colegios (cada uno con su administrador); `POST /api/auth/refresh` → access token de cada uno.

## `createdAt` en el alta

| Comprobación | Resultado |
| --- | --- |
| `POST /api/courses` («Educación Infantil», clases `A` y `B`) | `201`; el curso lleva `id`, `name`, `createdAt` y `classes` (y nada más) |
| Formato de `createdAt` | ISO 8601 con milisegundos y `Z` |
| Comparación con la base de datos | idéntico al `created_at` de la fila (en UTC) |

## Listado

| Comprobación | Resultado |
| --- | --- |
| `GET /api/courses` | `200`, `Cache-Control: no-store` |
| Orden con «Educación Infantil», «10º Curso», «2º Primaria» y «1º Primaria» | `1º Primaria`, `2º Primaria`, `10º Curso`, `Educación Infantil` (el 2 antes que el 10) |
| `createdAt` de cada curso | ISO 8601 en todos |
| Clases | `tutor: null` |

## Parámetros de búsqueda y paginación

`GET /api/courses?search=Infantil`, `?search=zzz&page=2`, `?page=5&limit=1` y `?pageSize=1&search=` responden `200` con la misma lista, en el mismo orden, que sin parámetros: se ignoran, como dice el contrato.

## Aislamiento y sesión

- `GET /api/courses` del colegio 2: `200` con 0 cursos (no ve los del colegio 1); `POST` de «1º Primaria» en el colegio 2: `201`.
- Sin token: `401`; con un token inválido: `401`.

## Base de datos y log

- Ningún curso con `created_at` nulo ni clases huérfanas.
- Ni los tokens ni las contraseñas aparecen en el log del backend.

## Limpieza (8.2)

- Se borraron las filas creadas (`classes`, `courses`, `refresh_tokens`, `access_links`, `rate_limit_attempts`, `users`, `schools`) de `calendarschool`.
- Estado posterior comparado con la línea base del paso 7: idéntico en todos los esquemas.
- Se paró el backend y se comprobó que el **puerto 3000 queda libre**.

## Incidencias de la ejecución

- Ninguna.

## Resultado

- Estado del paso 8: PASA
- Problemas bloqueantes: ninguno
