# Informe del paso 11 - Pruebas manuales con curl

- Fecha: 2026-10-31
- Cambio: us-prof-assign
- Agente: Claude Sonnet 5.5

## Entorno

- Backend local en `http://localhost:3000` (`node --env-file=… --import tsx src/server.ts`), con los límites de intentos elevados solo para la prueba, contra la base `calendarschool` migrada (16 migraciones, incluida `add_professor_assignments`).
- Script `curlAssign.sh` (en el directorio temporal de la sesión, no versionado): registra dos colegios con el captcha simulado, prepara datos con la propia API y comprueba cada respuesta. No imprime contraseñas, tokens ni cookies.
- Datos de partida: colegio A con los cursos «1 Primaria» (clases A, con tutor, y B) y «2 Primaria» (clase A), un calendario, las asignaturas Matemáticas (en los dos cursos), Inglés (en el 1.º) y Música (inactiva, en el 2.º), y tres profesores; colegio B con un curso, una asignatura y un profesor.

## Comprobaciones (50 respuestas verificadas, 0 fallos)

- **Matriz:** `GET /api/courses/{id}/assignments` devuelve `200` con `Cache-Control: no-store`, las asignaturas del curso por nombre con sus sesiones, las clases con su tutor (la A con tutor y la B sin él) y la asignatura inactiva en la matriz.
- **Escritura:**
  - `PUT` que asigna tres celdas: `200` y el `GET` devuelve lo mismo.
  - Las mismas celdas en otro orden: `200` sin cambios.
  - Estado final que cambia una celda, quita otra y crea una: `200` con dos asignaciones.
  - Lista vacía: el curso queda sin profesores.
  - Asignatura inactiva asignable; un mismo profesor en dos clases.
- **Validación (`400`, con campo y código):** asignatura no impartida en el curso (`assignments[0].subjectId` `NOT_FOUND`), clase de otro curso (`classId` `NOT_FOUND`), profesor de otro colegio (`professorId` `NOT_FOUND`), misma asignatura y clase dos veces (`assignments[1]` `DUPLICATE`), lista ausente (`REQUIRED`) e ids que no son UUID. Después de los rechazos no cambió nada.
- **Errores y sesión:** `404 NOT_FOUND` en `GET` y `PUT` para un curso de otro colegio, uno inexistente y un id que no es UUID (que gana a un cuerpo inválido); sin token, `401` con `WWW-Authenticate: Bearer`; el 404 y el 401 no cambiaron nada.
- **Profesores:** el listado, la lectura y la edición de un profesor llevan `subjects` con asignatura, curso, clase y sesiones, ordenadas; un profesor sin asignaciones tiene la lista vacía.
- **Permisos:** un `MEMBER` real (invitación aceptada, login y renovación) lee y guarda la matriz con `200`.
- **Concurrencia:** dos `PUT` a la vez sobre el mismo curso, cinco rondas: siempre dos `200` y el estado entero de uno de los dos, sin mezclas.
- **Cascadas:** «No se imparte» en la carga (se va la asignación y la asignatura sale de la matriz), quitar la clase B del curso (se va su asignación), borrar al profesor, borrar la asignatura y borrar el curso: en todos los casos las asignaciones desaparecen y ningún profesor conserva asignaturas.
- **Log:** 19 eventos `COURSE_ASSIGNMENTS_UPDATED` (con `added`, `removed` y `changed`, solo cuando hubo cambios) y 5 `COURSE_ASSIGNMENTS_UPDATE_REJECTED`, con ids y recuentos; ningún nombre de profesor, asignatura, curso ni email aparece en el log.

## Limpieza

- Datos creados borrados con `TRUNCATE public.schools CASCADE` y `TRUNCATE public.rate_limit_attempts` en `calendarschool`; los recuentos por tabla son idénticos a la línea base del paso 10.
- Backend parado y puerto 3000 libre (comprobado).

## Resultado

- Estado del paso 11: **PASS**
- Incidencias bloqueantes: ninguna.
