# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-21
- Cambio: us14-crear-alumno
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool`, con la migración `add_students` ya aplicada y el verificador de captcha falso (variables de la plantilla `.env.example`, sin `RECAPTCHA_*`).
- Script `curl_us14.sh` (no imprime contraseñas, tokens ni cookies): registra dos colegios por `POST /api/auth/register` y obtiene el token con `POST /api/auth/refresh`. Los cuerpos con tildes se envían desde fichero (`--data-binary @fichero`).

## Datos creados

- Colegio A: «1º Primaria» (clases A y B) y «2º Primaria» (clase A), con cinco alumnos.
- Colegio B: «1º Primaria» (clase A) y un alumno.

## Casos y resultados (54 comprobaciones, todas correctas)

| Caso | Petición | Resultado |
| --- | --- | --- |
| Alta completa | `POST /api/students` con clase, comedor, beca, tipo de comida y observaciones | `201` con curso y clase con su nombre y los datos sensibles en la respuesta |
| Sin clase y sin comedor | `POST` con solo curso y `cafeteria: false` | `201`, `class`, `scholarship`, `foodType` y `observations` a `null` |
| Con comedor y sin beca | `POST` con `cafeteria: true`, `scholarship: false` | `201` |
| Nombre con espacios y guion | `"  José   María "`, `"García-López"` | `201`, nombre limpio «José María» |
| Listado | `GET /api/students` | `200`, 5 alumnos del colegio A (no el del B), ordenados Álvarez Ana, García Eva, García Juan, García-López José María, Pérez Luis; sin las claves `foodType` ni `observations` y sin sus textos |
| Campos inválidos | nombre vacío, apellido `<b>`, curso `abc`, beca y tipo de comida sin comedor | `400` con `firstName`, `lastName`, `courseId`, `scholarship` y `foodType` en ese orden (`REQUIRED`, `INVALID_CHARACTERS`, `INVALID_FORMAT`, `NOT_ALLOWED`, `NOT_ALLOWED`) |
| Comedor sin beca | `cafeteria: true` sin `scholarship` | `400` `scholarship REQUIRED` |
| Sin curso ni comedor | cuerpo solo con apellido | `400` con `firstName`, `courseId` y `cafeteria` `REQUIRED` |
| Clase de otro curso, de otro colegio | `classId` de 2º, o del colegio B | `400` `classId NOT_FOUND` |
| Curso de otro colegio, inexistente | `courseId` del colegio B, o un UUID aleatorio | `400` `courseId NOT_FOUND` |
| Observaciones de 5001 caracteres | | `400` `observations INVALID_LENGTH` |
| JSON roto | `{"firstName":` | `400` |
| Sin token | `POST` y `GET` | `401`; no se creó nada de lo rechazado (5 alumnos en A y 1 en B) |
| Impacto de un curso con alumnos | `GET /api/courses/{1º}/impact` | `200`, 2 clases y **4 alumnos** (los de las clases y el que no tenía clase) |
| Quitar una clase | `PUT /api/courses/{1º}` sin la clase A | `200`; Juan sigue en «1º Primaria» con `class: null` y Luis conserva la clase B |
| Borrar el curso | `DELETE /api/courses/{1º}` | `200`, `classCount: 1` y `studentCount: 4`; los 5 alumnos siguen existiendo y 4 quedan con `course` y `class` a `null`; Eva sigue en «2º Primaria A» |
| Alta en el curso ya borrado | `POST` con ese `courseId` | `400` `courseId NOT_FOUND` |

## Eventos del log

- Seis `STUDENT_CREATED` (cinco del colegio A y uno del B), con `school_id`, `actor_id`, `student_id`, `has_class` y `cafeteria`.
- Cinco `STUDENT_CREATION_REJECTED`: dos `class_not_found` (clase de otro curso y de otro colegio) y tres `course_not_found` (curso de otro colegio, inexistente y ya borrado). Los errores de validación del cuerpo no dejan evento de rechazo.
- Ningún nombre, apellido, tipo de comida, observaciones ni nombre de colegio aparece en el log (se buscaron los usados: 0 coincidencias).

## Limpieza

- Datos creados borrados con `cleanup14.sql` (alumnos y colegios `Colegio Curl%`); recuentos de la base de datos **idénticos** a la línea base.
- Backend parado (`taskkill` del árbol de procesos) y puerto 3000 libre.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
