# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-29
- Cambio: us19-carga-horaria-por-curso
- Agente: Claude (Sonnet 5.5)

## Entorno

- Backend local en `http://localhost:3000` (`node --env-file=<copia del .env sin los secretos de reCAPTCHA> --import tsx src/server.ts`), con el verificador de captcha falso y los límites de intentos a 1000. El `.env` local lleva los secretos reales de reCAPTCHA, así que el primer arranque falló con `CAPTCHA_FAILED` al registrar; una cadena vacía no es válida para esas variables, por lo que se usó una copia temporal del `.env` sin esas dos líneas (fuera del repositorio, sin mostrar su contenido).
- Base de datos de desarrollo con las migraciones aplicadas (el cambio no añade ninguna). Dos colegios nuevos por ejecución (A y B), un `MEMBER` real creado con una invitación del administrador de A, y datos únicos por ejecución.
- Guion: `curlWorkloadC.sh` (bash + `curl`), que no imprime contraseñas, tokens ni cookies.

## Comandos ejecutados (resumen)

Todas las rutas son `/api/courses/{id}/workload` salvo las auxiliares de preparación (`/api/auth/*`, `/api/courses`, `/api/calendars`, `/api/subjects`, `/api/invitations`).

- `GET` con calendario, sin calendario, sin token, de otro colegio, inexistente y con un id que no es UUID.
- `PATCH` subiendo, añadiendo y quitando asignaturas; sin cambios reales; con una carga que no cabe; con sesiones 0, 6 y 2.5, asignatura repetida, lista vacía, sin `changes`, y con una asignatura de otro colegio y otra inexistente.
- `PATCH` y `GET` como `MEMBER` real (con un curso inexistente y con un id mal escrito y un cuerpo inválido).
- Concurrencia, cinco rondas de cada una, con peticiones simultáneas.

## Resultados

Primera ejecución: 81 correctas y 3 fallos **del guion**, que esperaba el mensaje «El curso no existe» cuando el real, igual en los tres casos de 404, es «El curso no existe en el colegio». Se corrigió la expectativa y se repitió la ejecución completa:

**Segunda ejecución: 84 correctas, 0 con fallo** (salida 0).

```
=== Preparación
OK   token del colegio A y del B
OK   datos de partida (3 cursos y 2 calendarios en A, 1 curso en B; 4 asignaturas en A y 1 en B)
--- 401 sin token
OK   GET sin token -> 401
OK   WWW-Authenticate: Bearer
OK   PATCH sin token -> 401
OK   tras el 401 nada cambió (Inglés sigue con 3)
--- Lectura con calendario
OK   GET de 1º con calendario -> 200
OK   Cache-Control: no-store
OK   curso y calendario (6 sesiones al ddía)
OK   8 de 30 sesiones y sin avisos
OK   las 4 asignaturas del colegio, por nombre
OK   la inactiva aparece con su estado y sin sesiones
OK   no filtra asignaturas de otro colegio
--- Lectura sin calendario
OK   GET de 2º sin calendario -> 200
OK   calendar y available a null, 5 asignadas y el aviso
--- PATCH: subir, añadir y quitar
OK   PATCH (Inglés 4, Música 2, Lengua fuera) -> 200
OK   Cache-Control: no-store
OK   responde con la carga como quedó
OK   GET /api/subjects lo ve: Inglés con 4 en 1º
OK   Música se imparte ahora en 1º (2) y sigue en 2º
OK   Lengua se queda sin cursos
OK   Inglés sigue en 2º con 3 (no se tocó)
OK   PATCH sin cambios reales (mismas sesiones y quitar lo que no está) -> 200
--- PATCH: una carga que no cabe se guarda con su aviso
OK   PATCH a un calendario de una sesión al ddía (5 en la semana) -> 200
OK   guarda y avisa: 11 asignadas de 5
OK   una lectura posterior devuelve el mismo aviso
--- 400
OK   sesiones 0, 6 y 2.5 -> 400
OK   OUT_OF_RANGE, OUT_OF_RANGE e INVALID_FORMAT en su campo
OK   asignatura repetida -> 400
OK   DUPLICATE en la segunda
OK   lista vacdía -> 400
OK   sin changes -> 400
OK   una asignatura de otro colegio y otra que no existe -> 400
OK   NOT_FOUND en las posiciones 1 y 2
OK   no cambió nada, ni siquiera la asignatura válida
OK   la asignatura de B no recibió ningún curso de A
--- 404
OK   GET de 01a18979-9227-760a-b919-bfca423030b8 -> 404
OK   NOT_FOUND con el mismo mensaje
OK   PATCH de 01a18979-9227-760a-b919-bfca423030b8 -> 404
OK   GET de 0192f5a0-0000-7000-8000-00000000ffff -> 404
OK   NOT_FOUND con el mismo mensaje
OK   PATCH de 0192f5a0-0000-7000-8000-00000000ffff -> 404
OK   GET de no-es-un-uuid -> 404
OK   NOT_FOUND con el mismo mensaje
OK   PATCH de no-es-un-uuid -> 404
OK   tras los 404 nada cambió
--- Un MEMBER real
OK   el administrador invita a un miembro -> 201
OK   el miembro acepta la invitación -> 201
OK   login del miembro -> 204
OK   el miembro no puede ver los usuarios (es un MEMBER real) -> 403
OK   el miembro lee la carga -> 200
OK   con los mismos datos
OK   el miembro intenta cambiarla -> 403
OK   FORBIDDEN
OK   el miembro con un curso inexistente (no se revela nada) -> 403
OK   el miembro con un id mal escrito y un cuerpo inválido -> 403
OK   la carga sigue igual
--- Concurrencia (cinco rondas cada una)
OK   ronda 1: dos PATCH en asignaturas distintas -> 200 y 200, se conservan los dos
OK   ronda 2: dos PATCH en asignaturas distintas -> 200 y 200, se conservan los dos
OK   ronda 3: dos PATCH en asignaturas distintas -> 200 y 200, se conservan los dos
OK   ronda 4: dos PATCH en asignaturas distintas -> 200 y 200, se conservan los dos
OK   ronda 5: dos PATCH en asignaturas distintas -> 200 y 200, se conservan los dos
OK   ronda 1: dos PATCH en la misma asignatura -> 200 y 200, queda 4
OK   ronda 2: dos PATCH en la misma asignatura -> 200 y 200, queda 4
OK   ronda 3: dos PATCH en la misma asignatura -> 200 y 200, queda 4
OK   ronda 4: dos PATCH en la misma asignatura -> 200 y 200, queda 4
OK   ronda 5: dos PATCH en la misma asignatura -> 200 y 200, queda 4
OK   ronda 1: PATCH contra edición de la asignatura -> 200 y 200, queda 2
OK   ronda 2: PATCH contra edición de la asignatura -> 200 y 200, queda 2
OK   ronda 3: PATCH contra edición de la asignatura -> 200 y 200, queda 2
OK   ronda 4: PATCH contra edición de la asignatura -> 200 y 200, queda 2
OK   ronda 5: PATCH contra edición de la asignatura -> 200 y 200, queda 2
OK   ronda 1: PATCH contra el borrado del curso -> 200 y 200, sin 500 y curso borrado
OK   ronda 2: PATCH contra el borrado del curso -> 200 y 200, sin 500 y curso borrado
OK   ronda 3: PATCH contra el borrado del curso -> 200 y 200, sin 500 y curso borrado
OK   ronda 4: PATCH contra el borrado del curso -> 200 y 200, sin 500 y curso borrado
OK   ronda 5: PATCH contra el borrado del curso -> 200 y 200, sin 500 y curso borrado
OK   ronda 1: PATCH contra la edición del calendario -> 200 y 200, carga guardada y curso sin calendario
OK   ronda 2: PATCH contra la edición del calendario -> 200 y 200, carga guardada y curso sin calendario
OK   ronda 3: PATCH contra la edición del calendario -> 200 y 200, carga guardada y curso sin calendario
OK   ronda 4: PATCH contra la edición del calendario -> 200 y 200, carga guardada y curso sin calendario
OK   ronda 5: PATCH contra la edición del calendario -> 200 y 200, carga guardada y curso sin calendario
--- El colegio B no se ha visto afectado
OK   sigue con Francés intacta
OK   y su carga solo tiene su asignatura
Resultado: 84 correctas, 0 con fallo
```

## Registro (log del backend)

- Eventos de las dos ejecuciones: `COURSE_WORKLOAD_UPDATED` 74 (37 por ejecución; el `PATCH` sin cambios reales no deja evento), `COURSE_WORKLOAD_UPDATE_REJECTED` 6 (por ejecución, 2 `not_found` y 1 `subject_not_found`; un id que no es UUID no llega al caso de uso) y `AUTHORIZATION_DENIED` 8 (4 por ejecución: el `GET /api/users` y los tres `PATCH` del `MEMBER`).
- Los eventos solo llevan `school_id`, `actor_id`, `course_id` y los recuentos `subjects_added`, `subjects_removed` y `subjects_changed`.
- Buscados en todo el log, **no aparece ningún nombre de asignatura, código, nombre de curso, nombre de calendario, nombre de colegio ni correo** usados en las pruebas (0 coincidencias de cada uno).

## Limpieza y estado

- Datos creados por el guion en `calendarschool` (2 ejecuciones): 4 colegios, 6 usuarios, 48 cursos y clases, 14 calendarios con 24 periodos, 70 asignaturas con 76 filas de `subject_courses`, 2 enlaces de acceso, 6 sesiones y 5 intentos.
- Se vaciaron las tablas de `public` salvo `municipalities` y `_prisma_migrations` (`TRUNCATE … CASCADE`). El recuento por tabla coincide con la línea base del paso 9 (`diff` vacío).
- Backend parado, junto con el `npm run dev` y su vigilante que se habían quedado del primer arranque fallido: el puerto 3000 queda libre y no queda ningún proceso `src/server.ts`.

## Resultado

- Estado del paso 10: **PASA**.
- Problemas que bloqueen: ninguno.
