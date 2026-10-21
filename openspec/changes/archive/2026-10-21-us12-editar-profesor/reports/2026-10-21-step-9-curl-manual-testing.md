# Informe del paso 9 - Pruebas manuales con curl

- Fecha: 2026-10-21
- Cambio: us12-editar-profesor
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool`, con el verificador de captcha falso (variables de la plantilla `.env.example`, sin `RECAPTCHA_*`). Sin migraciones nuevas.
- Dos colegios registrados por la API («Colegio Curl Doce A» y «Colegio Curl Doce B»), cada uno con su administrador; el A con los cursos «1º Primaria» (clases A y B) y «2º Primaria» (clase A) y tres profesores (Ana en 1º A, Luis en 2º A y Eva sin clase), y el B con un curso y un profesor. Los tokens se obtienen con `POST /api/auth/refresh` desde la cookie del registro. Los cuerpos con tildes se envían desde fichero (`--data-binary @fichero`). No se imprimen ni se guardan contraseñas, tokens ni cookies.
- El script (`curl_us12.sh`, en el directorio temporal de la sesión) se ejecutó dos veces. La primera dio 43 correctas y 1 fallida por un error del propio script: generaba los UUID aleatorios con `/proc/sys/kernel/random/uuid`, que no existe en Git Bash para Windows, así que la URL «de un profesor inexistente» quedó vacía y devolvió la lista (`200`) y, de paso, la prueba de la clase inexistente pasaba por el motivo equivocado (`classId` vacío, formato inválido). Se cambió a `crypto.randomUUID()` de Node, se añadió la comprobación de que el código de ese `400` es `NOT_FOUND`, se limpiaron los datos y se repitió entera. Los resultados de abajo son los de la segunda ejecución: **45 comprobaciones correctas, ninguna fallida**.

## Resultados

| Caso | Respuesta |
|---|---|
| `GET /api/professors/{id}` de un profesor del colegio | `200`; con `tutoredClass` (nombre de la clase y del curso) y `subjects: []` |
| `GET` de un profesor de otro colegio, de un UUID que no existe y de `abc` | `404 NOT_FOUND` los tres |
| `GET` y `PUT` sin token | `401` |
| `PUT` de nombre, apellidos y cargo sin `classId` | `200`; datos guardados, la tutoría intacta y `replacedTutor: null` |
| `PUT` con `position: null` | `200`; sin cargo |
| `PUT` con la clase libre 1º B | `200`; Ana tutora de 1º B y 1º A queda libre (comprobado en `GET /api/courses`) |
| `PUT` con la clase 2º A, que tutoriza Luis | `200`; `replacedTutor` es Luis Pérez, 2º A tiene a Ana, 1º B queda libre y Luis queda sin tutoría |
| `PUT` con la clase que ya tutoriza | `200`; sin cambios y `replacedTutor: null` |
| `PUT` con `classId: null` | `200`; Ana sin clase y 2º A sin tutor |
| `PUT` con una clase de otro colegio y con una que no existe | `400 VALIDATION_ERROR` con `classId: NOT_FOUND` los dos |
| `PUT` con nombre vacío, cargo `BOSS` y `classId: abc` | `400`; los campos salen en el orden `firstName`, `position`, `classId` |
| `PUT` de un profesor de otro colegio | `404`; el profesor no cambia |
| `PUT` con `id` mal formado | `404` |
| `PUT` con JSON roto | `400` |
| Dos `PUT` simultáneos de profesores distintos a la misma clase | `200` y `200`; la clase queda con un solo tutor y en total hay una sola clase con tutor entre las de los dos |

## Eventos del log

- `PROFESSOR_UPDATED` con `changed_fields` (`["class"]` o `["firstName","lastName","position"]`), `tutor_changed` y `replaced_tutor`, y `PROFESSOR_UPDATE_REJECTED` con `reason: "class_not_found"` o `"not_found"`. El log recoge las dos ejecuciones del script.
- Ningún nombre de profesor aparece en el log (se buscaron los usados: 0 coincidencias).

## Limpieza y estado final

- Se borraron los datos de los dos colegios de la prueba (`professors` → `courses` → `refresh_tokens` → `access_links` → `users` → `schools`, y los intentos limitados), también tras la primera ejecución.
- Comparado con la línea base del paso 8 (`diff`): **idéntico** en la base de desarrollo y en todos los esquemas de la base de test.
- Se paró el backend (con `taskkill` sobre el árbol del proceso) y se comprobó que el puerto 3000 queda libre (0 conexiones en escucha).

## Observaciones

- En Git Bash para Windows no hay `/proc`: los scripts futuros deben generar UUID con Node.

## Resultado

- Estado del paso 9: PASA
- Problemas bloqueantes: ninguno
