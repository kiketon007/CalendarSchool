# Paso 12: despliegue y comprobación en producción

Fecha: 2026-10-29. Resultado: **PASA**.

## Despliegue

- PR #118 integrada en `main` (`a8699ca`, commit `f40b3c4`).
- CI y despliegue (run 40862983397) en verde: build, migraciones, CDK, publicación en S3, invalidación de `index.html` y smoke test.
- Migraciones: `No pending migrations to apply` (el cambio no lleva migraciones).

## Comprobaciones con curl (https://app.calendarschools.es)

| Comprobación | Resultado |
| --- | --- |
| `GET /asignaturas` | `200`, sirve la SPA con `Content-Security-Policy` |
| Bundle `index-CCccMYp6.js` | contiene los textos nuevos del borrado (aviso de eliminada, «Esa asignatura ya no existe», «No se imparte en ningún curso», recordatorio de inactivar, título del diálogo) |
| `DELETE /api/subjects/{id}` sin token | `401 INVALID_SESSION`, `cache-control: no-store`, sin tocar datos |
| `GET /api/subjects` sin token (control) | `401` |

## Comprobación en navegador real (la persona usuaria)

Informa de que todo fue bien: borrado de una asignatura con cursos y de otra sin cursos, cancelación sin efecto, listado como `MEMBER` sin «Borrar», escritorio y móvil, sin violaciones de CSP.
