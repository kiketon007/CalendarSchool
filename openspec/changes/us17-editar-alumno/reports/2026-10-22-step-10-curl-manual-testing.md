# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-22
- Cambio: us17-editar-alumno
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=<plantilla de desarrollo> --import tsx src/server.ts`, puerto 3000) contra la base `calendarschool` de desarrollo, sin migraciones pendientes (`npm run db:migrate`: «No pending migrations to apply»). CAPTCHA falso, el de desarrollo.
- Dos colegios creados por la API (`Colegio Curl Diecisiete A` y `B`) con su administrador cada uno. El script no imprime contraseñas, tokens ni cookies; el acceso se obtiene con `POST /api/auth/refresh` y se guarda solo en un fichero temporal que se borró al terminar.

## Qué se comprobó

- `GET /api/students/{id}`: `200` con las nueve claves del alumno, también `foodType` y `observations`, y `Cache-Control: no-store`; `404 NOT_FOUND` para un `id` inexistente, uno que no es UUID y un alumno de otro colegio; `401` sin token.
- `PUT /api/students/{id}`: cambiar nombre (recortado), apellidos, curso, clase y comedor (la beca, el tipo de comida y las observaciones quedan a `null`); el cambio se ve al leer y en el listado, que sigue sin datos sensibles. El cuerpo es el estado final: lo que falta (`classId`, `foodType`, `observations`) queda vacío. Con `Cache-Control: no-store`.
- Reasignar un alumno cuyo curso se borró (queda con `course: null` y `class: null`) a un curso y una clase.
- Validación: `400` con los errores en el orden del alta (`firstName`, `lastName`, `courseId`, `scholarship` y `foodType` con `NOT_ALLOWED`); `courseId` de otro colegio, curso inexistente, clase de otro colegio y clase inexistente son `400` con `NOT_FOUND` en su campo; después de todos esos intentos, Juan sigue como estaba.
- Aislamiento y sesión: editar un alumno de otro colegio es `404` y no cambia nada (se lee con el token de su colegio); un `id` que no es UUID es `404` aunque el cuerpo sea inválido; alumno inexistente `404`; sin token `401`; `schoolId`, `id` y `status` en el cuerpo se ignoran (el `id` no cambia y el alumno sigue en su colegio).
- Concurrencia: cinco rondas de `PUT` hacia un curso a la vez que se hace `DELETE` de ese curso: el `DELETE` siempre `200` y el `PUT` `200` o `400`, nunca `500`.
- Log del servidor: hay eventos `STUDENT_UPDATED` (con `changed_fields`) y `STUDENT_UPDATE_REJECTED` con los tres motivos (`not_found`, `course_not_found` y `class_not_found`), y no aparece ningún nombre, apellido, tipo de comida ni observación.

## Resultado de la ejecución

```
registro a: 201
registro b: 201
OK   curso 1º del colegio A -> 201 -> 201
OK   curso 2º del colegio A -> 201 -> 201
OK   curso del colegio B -> 201 -> 201
OK   Juan -> 201 -> 201
OK   Eva -> 201 -> 201
OK   Pau (colegio B) -> 201 -> 201
--- GET /api/students/{id}
OK   leer a Juan -> 200 -> 200
OK   claves del alumno (con los datos sensibles) -> cafeteria,class,course,firstName,foodType,id,lastName,observations,scholarship
OK   datos de Juan -> Juan|García|1º Primaria|A|true|true|Vegetariana|Necesita apoyo
OK   GET con Cache-Control: no-store -> cache-control: no-store
OK   id inexistente -> 404 -> 404
OK   código NOT_FOUND -> NOT_FOUND
OK   id que no es UUID -> 404 -> 404
OK   alumno de otro colegio -> 404 -> 404
OK   GET sin token -> 401 -> 401
--- PUT /api/students/{id}: cambiar nombre, curso, clase y comedor
OK   editar a Juan -> 200 -> 200
OK   resultado -> Juanito|García López|2º Primaria|A|false|null|null|null
OK   PUT con Cache-Control: no-store -> cache-control: no-store
OK   al leer, lo mismo -> Juanito|2º Primaria|A|false|null
OK   el listado muestra el cambio -> García López Juanito|2º Primaria
OK   el listado sigue sin datos sensibles -> 0
--- PUT: estado final y comedor con beca
OK   Juan con comedor y sin clase -> 200 -> 200
OK   sin clase y con beca -> null|true|Sin gluten|Nota
OK   lo que falta queda vacío -> 200 -> 200
OK   clase B, sin comida ni observaciones -> B|false|null|null
--- PUT: reasignar un alumno sin curso
OK   borrar el curso 2º -> 200 -> 200
OK   Eva queda sin curso ni clase -> null|null
OK   reasignar a Eva -> 200 -> 200
OK   Eva en 1º Primaria A -> 1º Primaria|A
--- PUT: validación y NOT_FOUND, sin cambiar nada
OK   campos inválidos -> 400 -> 400
OK   errores en orden -> firstName:REQUIRED,lastName:INVALID_CHARACTERS,courseId:INVALID_FORMAT,scholarship:NOT_ALLOWED,foodType:NOT_ALLOWED
OK   curso de otro colegio -> 400 -> 400
OK   courseId NOT_FOUND -> courseId:NOT_FOUND
OK   clase de otro colegio -> 400 -> 400
OK   classId NOT_FOUND -> classId:NOT_FOUND
OK   clase inexistente -> 400 -> 400
OK   curso inexistente -> 400 -> 400
OK   Juan no ha cambiado -> Juan|1º Primaria|B
--- PUT: aislamiento, sesión e ignorados
OK   alumno de otro colegio -> 404 -> 404
OK   Pau no ha cambiado -> Pau
OK   id que no es UUID, aunque el cuerpo sea inválido -> 404 -> 404
OK   alumno inexistente -> 404 -> 404
OK   PUT sin token -> 401 -> 401
OK   con schoolId, id y status en el cuerpo -> 200 -> 200
OK   el id no cambia -> 01a16484-c126-715c-bc80-455d9e334984
OK   sigue en el colegio A -> Juan
--- PUT contra el borrado del curso destino: nunca 500
OK   cinco rondas sin 500 (PUT 200 o 400, DELETE 200) -> 0
--- log
OK   hay eventos STUDENT_UPDATED -> yes
OK   con changed_fields -> yes
OK   hay eventos STUDENT_UPDATE_REJECTED -> yes
OK   motivos not_found, course_not_found y class_not_found -> 3
OK   ningún nombre, tipo de comida ni observación en el log -> 0

RESUMEN: 52 correctas, 0 fallidas
```

## Limpieza

- Borrados con SQL los datos creados (el `DELETE` de alumnos devolvió 3 filas, el de sesiones 2, el de cursos 2, el de usuarios 2 y el de colegios 2), parado el backend (`taskkill` del proceso y sus hijos) y comprobado que el puerto 3000 queda libre.
- Recuentos de `users`, `schools`, `refresh_tokens`, `rate_limit_attempts`, `access_links`, `municipalities`, `courses`, `classes`, `professors` y `students` en `calendarschool.public`, `calendarschool_test.public` y `test_1` a `test_4`: **idénticos** a la línea base (todo a 0 salvo `municipalities`, 542).

## Resultado

- Estado del paso 10: PASA (52 comprobaciones correctas, 0 fallidas)
- Problemas bloqueantes: ninguno
