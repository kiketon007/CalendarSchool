# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-20
- Cambio: us09b-elegir-tutor
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool`, sin migraciones nuevas (el cambio no toca el esquema) y con el verificador de captcha falso (`backend/.env` sin `RECAPTCHA_*`).
- Dos colegios registrados por la API (a y b), cada uno con su administrador. Los tokens de acceso se obtienen con `POST /api/auth/refresh` desde la cookie del registro. Los cuerpos con tildes se envían desde fichero (`--data-binary @fichero`). No se imprimen ni se guardan contraseñas, tokens ni cookies.
- El script (`curl_us09b.sh`, en el directorio temporal de la sesión) ejecuta 39 comprobaciones y se lanzó cinco veces: las primeras detectaron errores del propio script (selección de clases y profesores). La última ejecución dio **38 correctas y 1 «fallida»**, y esa falla es un artefacto del script, no del backend: los dos `PUT` simultáneos devolvieron `200` y `409`, pero `curl -w` en Windows añade `\r\n` a cada código y la comparación no lo quitaba (el propio mensaje lo muestra: esperado `200 409`, obtenido `200 409`). Se comprobó volcando las respuestas con `od -c` (`200\r\n` y `409\r\n`). Tras cinco intentos de arreglarlo se dejó como está, según la regla de interrupción de bucles.

## Resultados

| Caso | Respuesta |
|---|---|
| `PUT /api/courses/{id}` asignando un profesor a una clase sin tutor | `200`; `GET /api/courses` devuelve la clase con `tutor`, y `GET /api/professors` el `tutoredClass` del profesor |
| Cambiar el tutor a otro profesor | `200`; la clase tiene al nuevo y el anterior queda libre (`tutoredClass: null`) |
| `tutorId: null` | `200`; la clase queda sin tutor y el profesor sigue existiendo, libre |
| Mover un profesor de la clase A a la B | `200`; B lo tiene y A queda sin tutor |
| Intercambiar los tutores de A y B en un mismo `PUT` | `200`; cada una tiene el del otro (dos fases, sin chocar con el índice único) |
| Quitar una clase y pasar su tutor a otra en el mismo `PUT` | `200`; la otra lo tiene y el tutor de la clase quitada, que no se reasigna, queda libre |
| Clase nueva con tutor | `200`; la clase se crea con su tutor |
| `PUT` sin `tutorId` (renombrar y añadir una clase) | `200`; las clases existentes conservan su tutor |
| Profesor que ya tutoriza una clase de otro curso | `409 PROFESSOR_ALREADY_TUTOR`; el nombre del curso no cambia y el profesor sigue en su clase |
| Profesor de otro colegio | `400 VALIDATION_ERROR` con `classes[1].tutorId: NOT_FOUND` |
| UUID que no existe | `400`, `classes[1].tutorId: NOT_FOUND` |
| `tutorId` mal formado | `400`, `classes[0].tutorId: INVALID_FORMAT` |
| El mismo profesor en dos clases | `400`, `classes[1].tutorId: DUPLICATE` en la segunda |
| Dos `PUT` simultáneos de cursos distintos con el mismo profesor | Uno `200` y otro `409`; el profesor tutoriza una sola clase |
| `PUT` sin token | `401` |

## Eventos del log

- `COURSE_UPDATED` con el recuento `tutors_changed`.
- `COURSE_UPDATE_REJECTED` con `reason: professor_not_found` y `reason: professor_already_tutor`.
- El log no contiene nombres de profesores ni de cursos.

## Limpieza y estado final

- Se borraron los datos creados en el orden `professors` → `classes` → `courses` → `refresh_tokens` → `access_links` → `users` → `schools`, solo de los dos colegios de la prueba.
- Comparado con la línea base tomada antes (`baseline.txt`, con `diff`): **idéntico**.
- Se paró el backend (con `taskkill` sobre el árbol del proceso) y se comprobó que el puerto 3000 queda libre (0 conexiones en escucha).

## Observaciones

- `curl -w '%{http_code}'` devuelve `\r\n` en Git Bash para Windows: en futuros scripts hay que aplicar `tr -d '\r'` a cada código.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
