# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-22
- Cambio: us14-crear-alumno
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #88 (`feature/us14-crear-alumno`), integrada por la persona usuaria en `main` (`ad9a40b`).
- Ejecución de CI y despliegue sobre el commit de la integración (`39673083275`): **completada con éxito**. Lint, tests y build, E2E con Cypress y «Desplegar en producción» pasan.
- Migraciones: «10 migrations found in prisma/migrations»; se aplicó `20261021193052_add_students` y terminó con «All migrations have been successfully applied». El registro del job «Desplegar» es el de producción (no el de la base de test del CI).
- Despliegue con CDK, publicación del frontend en S3 e invalidación de `index.html` en CloudFront: correctos. Smoke test contra el dominio de producción: correcto.

## Comprobaciones con `curl` (sin crear ni borrar datos)

Contra `https://app.calendarschools.es`, sin cabecera `Authorization` ni cookies (con `--ssl-no-revoke`, como en comprobaciones anteriores):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200` |
| `GET /alumnos` | `200`, el `index.html` de la SPA |
| Cabecera `Content-Security-Policy` | Presente, sin ninguna directiva con `unsafe-` |
| Bundle principal desplegado (`assets/index-B2bM80S6.js`) | `200`; contiene «Crear un alumno», «Anota solo lo necesario», «¿Come en el comedor?», «quedan sin curso» y «Todavía no hay alumnos» |
| `POST /api/students` sin token | `401` |
| `GET /api/students` sin token | `401` |

## Comprobación con un navegador real

La hizo la persona usuaria, porque esta sesión no tiene acceso a producción. Se le pidió comprobar, en escritorio y en el móvil o con la ventana a 360 px: «Alumnos» en la cabecera y el listado vacío o con alumnos; crear un alumno con curso, clase, comedor, beca, tipo de comida y observaciones (que no aparecen en el listado); crear otro sin clase y sin comedor (sin los campos de beca ni tipo de comida); la validación con el formulario vacío y el reinicio de la clase al cambiar de curso; borrar un curso con alumnos («quedan sin curso») y ver «Sin curso» en `/alumnos`; que no hay desplazamiento horizontal a 360 px y que la consola no muestra violaciones de CSP. Confirmó que **las pruebas fueron bien**, sin indicar ninguna incidencia.

## Datos de prueba en producción

Esta sesión no creó ni borró ningún dato en producción. Los alumnos y cursos de la prueba manual los creó la persona usuaria.

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
