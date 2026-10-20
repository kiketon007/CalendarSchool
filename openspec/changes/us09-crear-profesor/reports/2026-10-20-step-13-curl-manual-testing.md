# Informe del paso 13 - Pruebas manuales con curl

- Fecha: 2026-10-20
- Cambio: us09-crear-profesor
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool` con la migración `add_professors` aplicada, y con el verificador de captcha falso (`backend/.env` sin `RECAPTCHA_*`).
- Dos colegios registrados por la API («Colegio Curl Doce» y «Colegio Curl Trece»), cada uno con su administrador. Los tokens de acceso se obtienen con `POST /api/auth/refresh` desde la cookie del registro. Los cuerpos con tildes se envían desde fichero (`--data-binary @fichero`) para evitar problemas de codificación de la consola. No se imprimen ni se guardan contraseñas, tokens ni cookies.
- El script (`curl_us09.sh`, en el directorio temporal de la sesión) se ejecutó dos veces: la primera detectó que una de mis comprobaciones miraba la clase equivocada (tras renombrar, «Grupo A» se ordena detrás de «B» y yo leía la primera); se corrigió la comprobación para seleccionar la clase por `id`, se limpiaron los datos y se repitió entera. Los resultados de abajo son los de la segunda ejecución: **28 comprobaciones correctas, ninguna fallida**.

## Resultados

| Caso | Respuesta |
|---|---|
| `POST /api/professors` sin clase ni cargo, con espacios repetidos en el nombre | `201`; `firstName` «José María» (espacios colapsados), `position: null`, `subjects: []`, `tutoredClass: null`; `Cache-Control: no-store` |
| Con `position: DIRECTOR` | `201`, `position: "DIRECTOR"`, `subjects: []` |
| Con una clase libre de «1º Primaria» | `201`, `tutoredClass` con la clase y su curso (`courseId`, `courseName`); en la base de datos, `classes.tutor_id` es el profesor |
| La misma clase otra vez | `409 CLASS_ALREADY_HAS_TUTOR`; el recuento de profesores no cambia y la clase conserva su tutor |
| Una clase de otro colegio | `400 VALIDATION_ERROR` con `classId: NOT_FOUND`; no se crea el profesor y la clase ajena sigue sin tutor |
| Un UUID que no existe | `400`, `classId: NOT_FOUND`; nada creado |
| `classId` mal formado | `400`, `classId: INVALID_FORMAT` |
| Sin nombre | `400`, `firstName: REQUIRED` |
| Cargo no válido | `400`, `position: INVALID_FORMAT` |
| Cuatro campos inválidos a la vez | `400`; los campos salen en el orden `firstName`, `lastName`, `position`, `classId` |
| Propiedades desconocidas (`schoolId`, `role`, `subjects`, `tutoredClass`) | `201`; se ignoran: el profesor se guarda en el colegio de la identidad y `subjects` sigue vacío |
| JSON roto | `400 INVALID_JSON` |
| `GET /api/professors` | `200`; ordenado por apellidos y luego nombre («Cera, Cabe», «García López, José María», «Mas, Pau», «Pérez, Ana», «Ruiz, Luis») |
| `GET /api/professors` del otro colegio | `200`, solo su profesor |
| `GET /api/courses` | `200`; la clase con tutor lleva `tutor` con su nombre y las demás `null` |
| `PUT` del curso renombrando la clase con tutor | `200`; la clase conserva su `id` y su tutor (comprobado por `id` y en la base de datos: `tutor_id` sigue siendo el mismo profesor) |
| `PUT` quitando esa clase | `200`; la profesora sigue existiendo y su `tutoredClass` es `null` |
| `DELETE` de un curso con una clase con tutor | `200`, `{ classCount: 2, studentCount: 0 }`; el profesor sigue existiendo y queda sin clase |
| Dos altas simultáneas con la misma clase | Una `201` y una `409`; solo se crea un profesor |
| `POST` y `GET` sin token | `401`, con `WWW-Authenticate: Bearer` |
| `GET` con un token inválido | `401` |

## Eventos del log

- `PROFESSOR_CREATED` con `school_id`, `actor_id`, `professor_id`, `has_class` y `position`; `PROFESSOR_CREATION_REJECTED` con `reason: class_has_tutor` o `class_not_found`.
- Ningún nombre de profesor aparece en el log (se buscaron los nombres usados en las pruebas: 0 coincidencias).

## Limpieza y estado final

- Se borraron los datos creados en el orden `professors` → `classes` → `courses` → `refresh_tokens` → `access_links` → `users` → `schools` (y los intentos limitados), solo de los dos colegios de la prueba.
- Comparado con la línea base del paso 12 (`snapshot7.sh`, `diff`): **idéntico** en la base de desarrollo y en todos los esquemas de la base de test.
- Se paró el backend y se comprobó con `netstat` que el puerto 3000 queda libre (0 conexiones en escucha).

## Observaciones

- Un nombre de clase se ordena de forma natural: tras renombrar «A» a «Grupo A», la lista devuelve antes «B». No es un defecto, pero conviene recordarlo al comprobar a mano una clase por posición.
- Con el tutor en el listado de cursos, una clase nunca devuelve tutores de otros colegios: la comprobación del colegio se hace al asignarlo (`course.schoolId` en el `UPDATE` condicionado).

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
