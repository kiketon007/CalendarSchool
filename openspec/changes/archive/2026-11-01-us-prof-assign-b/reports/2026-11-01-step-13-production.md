# Paso 13: despliegue y comprobación en producción (us-prof-assign-b)

Fecha: 2026-11-01. Entorno: `https://app.calendarschools.es`.

## Integración y CI

- PR #136 integrada en `main` (`a574f02`), con dos commits: `2401bb9` (la historia) y `3e77773`.
- El primer CI de la rama falló en un test de integración, `prismaCourseAssignmentsRepository.int.test.ts` («guarda o ve que la asignatura ya no se imparte a la vez»). No era un fallo de los cambios de esta historia: era una carrera ya existente de US-PROF-ASSIGN. El `PUT` de asignaciones leía `subject_courses` sin bloquearlo y, si la fila se borraba antes del `INSERT`, la clave ajena daba `P2003` y un `500`. Se reprodujo en local (4 de 6 ejecuciones) y se corrigió con `FOR SHARE` sobre esas filas (tarea 3.5, delta de la spec, diseño y `backend/CLAUDE.md`); después, 8 de 8 verdes.
- CI del push a `main` (run 41297176410): lint, tests, build, E2E, despliegue de CDK, publicación en S3, invalidación de CloudFront y smoke test, todo en verde.

## Producción con curl

| Comprobación | Resultado |
| --- | --- |
| `GET /` | `200` |
| Bundle `index-BvB1xct3.js` con «asignaciones de profesores», «Se quitará también su asignación de profesor» y el texto en inglés | los tres presentes |
| `GET /api/courses/<id>/impact` sin token | `401` |
| `GET /api/courses/<id>/workload` sin token | `401` |

## Prueba en un navegador real

La persona usuaria probó los avisos de las asignaciones que se pierden (carga horaria, edición de asignatura, diálogos de borrar asignatura, curso y profesor, y quitar una clase) y confirmó que todo estaba correcto.
