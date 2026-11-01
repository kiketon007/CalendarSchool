# Informe del paso 10 - Pruebas manuales con curl

- Fecha: 2026-11-01
- Cambio: us-prof-assign-b
- Agente: Claude Sonnet 5.5

## Comandos ejecutados

- Backend de desarrollo (`node --env-file=<env sin límites de intentos> --import tsx src/server.ts`) contra `calendarschool` migrada (16 migraciones), puerto 3000.
- Un script de bash con `curl` y `jq` que registra dos colegios por la API, prepara los datos y comprueba cada caso; no imprime contraseñas, tokens ni cookies.
- Preparación: un curso de tres clases (A, B y C) y otro de una, tres asignaturas (Matemáticas e Inglés con reglas de máximo al día), dos profesores, cuatro asignaciones en el curso 1 y una en el curso 2, y un colegio ajeno.

## Resultados

| Comprobación | Resultado |
|---|---|
| Alta de curso y de asignatura: `assignmentCount` 0 en cada clase y cada curso | OK |
| `GET` y `PATCH` de la carga: `assignmentCount` por asignatura (Inglés 2, Matemáticas 2, Música 0) | OK |
| `GET` y listado de asignaturas: Matemáticas 2 en el curso 1 y 1 en el 2 | OK |
| `GET` y listado de cursos: clases A 2, B 1, C 1 | OK |
| Impacto del curso: clases 3, reglas 2, asignaciones 4, con `Cache-Control: no-store` | OK |
| `PUT` del curso quitando la clase C: respuesta con los recuentos y el impacto baja a 3 | OK |
| `DELETE` de asignatura: respuesta sin cambios (`deleted.id`); `SUBJECT_DELETED` con `assignment_count` 1 | OK |
| `DELETE` de profesor: respuesta sin cambios (solo `freedClass`); `PROFESSOR_DELETED` con `assignment_count` 2 | OK |
| `DELETE` de curso: `deleted` con clases, reglas y asignaciones (2, 2, 2); `COURSE_DELETED` con `assignment_count` 2 | OK |
| Ningún evento de borrado lleva nombres (curso, asignatura ni profesor) | OK |
| Curso de otro colegio en el impacto: `404 NOT_FOUND`; sin token: `401` | OK |

- **Fallos:** 0 en la ejecución final. En la primera ejecución fallaron 7 comprobaciones por errores de mis expectativas en el propio script, no del backend: la matriz lista todas las asignaturas del colegio (también las no impartidas en el curso), el `DELETE` de asignatura ya devolvía `{ deleted: { id } }`, y los recuentos tras borrar al profesor y quitar la clase ya habían descontado las asignaciones eliminadas antes. Se corrigieron las expectativas y se repitió.

## Verificación de la base de datos y del entorno

- Los datos de la prueba se vaciaron con `TRUNCATE ... CASCADE` en `calendarschool`; los recuentos coinciden con la línea base del paso 9 (comparación con `diff`).
- Backend parado y puerto 3000 libre (comprobado con `netstat`).

## Resultado

- Estado del paso 10: **PASS**
- Incidencias bloqueantes: ninguna.
