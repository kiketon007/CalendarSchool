# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-30
- Cambio: us19-carga-horaria-por-curso
- Agente: Claude (Sonnet 5.5)

## Integración y despliegue (13.1)

- `lint`, `typecheck --workspaces` y `api:types:check`: 0 con el árbol final, antes de abrir la PR.
- PR #121 integrada en `main` (`7fff9c0`). El CI de la PR pasó.
- CI de `main` (push) en verde: lint, tests y build, E2E con Cypress, comprobación de que el commit pertenece a `main`, migraciones de la base de datos (sin migraciones nuevas), despliegue con CDK, publicación del frontend en S3, invalidación de `index.html` en CloudFront y **smoke test**.

## Comprobación con curl en `app.calendarschools.es` (13.2)

- `GET /cursos/<id>/carga`: 200, sirve la SPA y lleva `Content-Security-Policy`.
- El bundle (`assets/index-BvcngLLI.js`) contiene «Carga horaria» y «sesiones a la semana».
- `GET /api/courses/<id>/workload` sin token: 401 `INVALID_SESSION`.
- `PATCH /api/courses/<id>/workload` sin token: 401 `INVALID_SESSION`, sin cambiar datos.

## Comprobación en navegador real (la persona usuaria)

Resultado: «Todo ok». Ajuste de la carga de un curso, aviso de una carga que no cabe, aviso de un curso sin calendario, vista de `MEMBER` sin edición, escritorio y móvil, sin violaciones de CSP.

## Resultado

PASA. No hay incidencias abiertas.
