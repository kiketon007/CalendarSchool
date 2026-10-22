# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-10-22
- Cambio: us14b-alumnos-en-cursos
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local (`node --env-file=<plantilla> --import tsx src/server.ts`, puerto 3000) contra la base de desarrollo `calendarschool`, con el verificador de captcha falso (variables de la plantilla `.env.example`, sin `RECAPTCHA_*`). Esta historia no tiene migración.
- Script `curl_us14b.sh` (no imprime contraseñas, tokens ni cookies): registra dos colegios por `POST /api/auth/register` y obtiene el token con `POST /api/auth/refresh`. Los cuerpos con tildes se envían desde fichero (`--data-binary @fichero`).

## Datos creados

- Colegio A: «1º Primaria» (clases A y B), «2º Primaria» (clase A) y cuatro alumnos: Juan y Ana en 1º A, Eva en 1º B y Luis en 1º sin clase.
- Colegio B: «1º Primaria» (clase A) y un alumno.

## Casos y resultados (31 comprobaciones, todas correctas)

| Caso | Petición | Resultado |
| --- | --- | --- |
| Alta de un curso | `POST /api/courses` con dos clases | `201`; `studentCount` es `0` en el curso y en cada clase |
| Listado sin alumnos | `GET /api/courses` | `200`; todos los números a `0` |
| Listado con alumnos | `GET /api/courses` | `200`; «1º Primaria» con 4 en el curso, A con 2 y B con 1 (el alumno sin clase solo cuenta en el curso); «2º Primaria» con 0 en el curso y en su clase; solo los 2 cursos del colegio A |
| Lectura | `GET /api/courses/{id}` | `200`; los mismos números que el listado |
| Aislamiento | `GET /api/courses` del colegio B | `200`; 1 alumno en su curso y en su clase, sin contar los del colegio A |
| Sin sesión | `GET /api/courses` y `GET /api/courses/{id}` sin token | `401` los dos |
| Curso de otro colegio | `GET /api/courses/{id}` del colegio B con el token de A | `404` |
| Quitar una clase con alumnos | `PUT /api/courses/{1º}` sin la clase A y con `studentCount: 99` en el curso y `50` en la clase | `200`; el curso sigue con 4 y B con 1: los números enviados se ignoran y se devuelven los del estado final |
| Los alumnos de la clase quitada | `GET /api/students` | `200`; Juan y Ana siguen en «1º Primaria» con `class: null`; siguen los 4 del colegio A |
| Listado tras quitar | `GET /api/courses` | `200`; 1º con 4 y B con 1 |
| Añadir una clase | `PUT /api/courses/{1º}` con B y una clase nueva C | `200`; C nace con 0 alumnos y el curso sigue con 4 |

## Eventos del log

- `COURSE_UPDATED` aparece dos veces (las dos ediciones) y ni él ni `COURSE_CREATED` llevan el número de alumnos.
- Ningún nombre de alumno aparece en el log (se buscaron los tres apellidos usados: 0 coincidencias).

## Limpieza

- Datos creados borrados con `cleanup14.sql` (cinco alumnos, tres cursos y dos colegios `Colegio Curl%`); recuentos de la base de datos **idénticos** a la línea base (todo a 0 salvo `municipalities`, 542).
- Backend parado (`taskkill` del árbol de procesos) y puerto 3000 libre.

## Resultado

- Estado del paso 10: PASA
- Problemas bloqueantes: ninguno
