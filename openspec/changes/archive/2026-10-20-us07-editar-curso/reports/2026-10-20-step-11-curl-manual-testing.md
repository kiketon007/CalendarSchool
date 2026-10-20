# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-20
- Cambio: us07-editar-curso
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local en `http://localhost:3000` contra `calendarschool` (PostgreSQL 17 en Docker), con el verificador de captcha **falso**: el `backend/.env` del equipo trae secretos reales de reCAPTCHA, así que el backend se arrancó cargando ese fichero sin las variables `RECAPTCHA_*`.
- Los scripts imprimen solo estados y comprobaciones: ningún token ni contraseña aparece en este informe. Las credenciales son de pruebas locales.
- Los cuerpos con `º` o acentos se envían desde un fichero UTF-8 (`--data-binary @fichero`), porque `curl.exe` de Windows los estropea por la línea de comandos (incidencia ya conocida).

## Datos creados (11.1)

- `POST /api/auth/register` → `201` para dos colegios (cada uno con su administrador); `POST /api/auth/refresh` → access token de cada uno.
- Colegio 1: «1º Primaria» con las clases `A`, `B` y `C`, y «6º Primaria» con `A`. Colegio 2: «2º Primaria» con `A`.

## `GET /api/courses/{id}`

| Comprobación | Resultado |
| --- | --- |
| Curso del colegio | `200`; clases `A`, `B`, `C` en orden, `tutor: null` en todas, `createdAt` igual al del alta |
| Cabecera | `Cache-Control: no-store` |

## `PUT /api/courses/{id}`

| Comprobación | Resultado |
| --- | --- |
| Renombrar el curso (`"  1º   Primaria Tarde "`), intercambiar `A` y `B` con sus `id`, quitar `C` y añadir otra `C` sin `id` | `200`; nombre «1º Primaria Tarde» (espacios limpiados); `createdAt` sin cambios; la clase con el `id` de `A` se llama `B` y la del `id` de `B`, `A` (el intercambio no choca con el índice único); la `C` nueva tiene otro `id` y la antigua ya no existe en la base de datos; `updated_at` del curso avanza |
| `PUT` idéntico al estado guardado (con los `id` actuales) | `200`; `updated_at` sin cambios; `Cache-Control: no-store` |
| Cambiar solo las mayúsculas del propio curso («1º PRIMARIA TARDE») | `200`; se guarda tal cual |
| Mismo nombre que un curso de **otro colegio** («2º Primaria») | `200` |

## Conflictos (`409`)

| Comprobación | Resultado |
| --- | --- |
| `PUT` con el `id` de la `C` quitada (y el nombre del curso cambiado) | `409 COURSE_CHANGED`; ni el curso ni las clases cambian |
| `PUT` con el `id` de una clase de **otro curso** del colegio | `409 COURSE_CHANGED` |
| `PUT` con el nombre de otro curso del colegio («6º primaria») | `409 COURSE_ALREADY_EXISTS`; sin cambios en el curso ni en sus clases |

## Validación (`400 VALIDATION_ERROR`)

| Cuerpo | `details` |
| --- | --- |
| `id` de clase `"abc"` | `classes[0].id` `INVALID_FORMAT` |
| Mismo `id` en dos clases | `classes[1].id` `DUPLICATE` |
| `classes: []` | `classes` `INVALID_LENGTH` |
| 13 clases | `classes` `INVALID_LENGTH` |
| Nombre vacío y clases `A` y ` a ` | `name` `REQUIRED` y `classes[1].name` `DUPLICATE` |

Ninguno de los `400` cambió nada en la base de datos.

## `404` y `401`

- `GET` y `PUT` de un curso de **otro colegio**: `404 NOT_FOUND`; el curso ajeno conserva su nombre.
- `GET` de un UUID que no existe: `404`. `GET` y `PUT` de un id que no es un UUID (`abc`): `404`.
- `GET` y `PUT` sin token: `401`; `PUT` con un token inválido: `401`.
- El administrador del colegio 2 lee su curso: `200`.

## Base de datos y log

- Sin clases huérfanas y sin nombres provisionales (`#…`) que hayan quedado tras las ediciones.
- Eventos `COURSE_UPDATED` (con `classes_added`, `classes_removed` y `classes_renamed`, p. ej. `1`, `1` y `2` en la primera edición) y `COURSE_UPDATE_REJECTED` con `reason: "changed"` y `reason: "duplicate"`.
- Ningún evento de edición contiene nombres de cursos o de clases, y ni los tokens ni las contraseñas aparecen en el log del backend.

## Incidencia de la primera ejecución

La primera pasada del script dio dos «FALLO» (`PUT` idéntico y cambio de mayúsculas, ambos con `409`). **No eran un defecto del producto, sino del script**: la comprobación de la cabecera `Cache-Control` reenviaba el cuerpo del primer `PUT`, que lleva la clase `C` sin `id`; eso quitó la `C` creada y creó otra, y los pasos siguientes usaban el `id` de la `C` que ya no existía, así que el servidor respondió `409 COURSE_CHANGED`, que es lo correcto. Se movió esa comprobación a un `PUT` idempotente (con todos los `id`), se borraron los datos y se repitió la ejecución completa: todas las comprobaciones salen en verde. Los eventos del log de este informe suman, por tanto, las dos ejecuciones.

## Limpieza (11.2)

- Se borraron las filas creadas (`classes`, `courses`, `refresh_tokens`, `access_links`, `users`, `schools` y `rate_limit_attempts`) de `calendarschool`, y el recuento por tabla coincide con la línea base (comparado con `diff`, en `calendarschool` y en `calendarschool_test`).
- Se paró el backend (árbol de procesos) y los puertos 3000, 3001, 4173 y 5173 quedan libres.
