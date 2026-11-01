# Paso 13: despliegue y comprobación en producción (us-prof-summary)

Fecha: 2026-11-01. Entorno: `https://app.calendarschools.es`.

## Integración y CI

- PR #138 integrada en `main` (`7118956`), con un commit (`575ae6b`).
- CI de la PR: lint, tests, build y E2E en verde (319 de 319 en local, 5 nuevos).
- CI del push a `main` (run 41341694679): lint, tests, build, E2E, despliegue de CDK, publicación en S3, invalidación de CloudFront y smoke test, todo en verde.

## Producción con curl

| Comprobación | Resultado |
| --- | --- |
| `GET /` | `200` |
| `GET /profesores/resumen` (ruta de la SPA) | `200` |
| Bundle `index--41y9AjF.js` con «Resumen de carga», «Faltan profesores», «Todas las asignaturas tienen profesor en todas las clases», «Load summary» y la ruta `/profesores/resumen` | los cinco presentes |
| `GET /api/professors/summary` sin token | `401` (no `404`: la ruta va antes de `/:id`) |
| `GET /api/professors/<id inexistente>` sin token | `401` |

## Prueba en un navegador real

La persona usuaria probó el resumen de carga en producción (enlace desde `/profesores`, rangos de horas y estados, avisos de disponibilidad, de cursos sin calendario y de varios calendarios, aviso de cursos con asignaturas sin profesor, filtros, enlaces, inglés, 360 px y un usuario `MEMBER`) y confirmó que todas las pruebas estaban correctas.
