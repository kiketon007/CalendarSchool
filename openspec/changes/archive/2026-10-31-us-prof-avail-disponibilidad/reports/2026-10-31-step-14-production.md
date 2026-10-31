# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-31
- Cambio: us-prof-avail-disponibilidad
- Agente: Claude Sonnet 5.5

## Despliegue

- **PR:** #132, integrada por la persona usuaria en `main`.
- **CI del push a `main`:** verde.
  - Lint, tests y build.
  - E2E con Cypress.
  - Desplegar en producción:
    - **Migraciones de la base de datos:** `add_professor_unavailabilities` aplicada (crea la tabla, sus índices, sus claves ajenas y los cuatro `CHECK`; no toca datos existentes).
    - Despliegue de la infraestructura y el backend con CDK.
    - Publicación del frontend en S3.
    - Smoke test.
- **Incidencia:** nada que reseñar. La persona usuaria no veía al principio la opción porque probó antes de que terminara el despliegue (el CI del push seguía en marcha); tras terminar y recargar sin caché apareció.

## Comprobaciones con `curl` contra `https://app.calendarschools.es`

- `GET /profesores/<id>/disponibilidad`: `200`, `text/html`, con la `Content-Security-Policy` y `X-Content-Type-Options: nosniff`. Sirve la SPA (la CloudFront Function reescribe la ruta).
- El bundle `assets/index-*.js` contiene los textos y la ruta nuevos: «Disponible todo», «Parcialmente no disponible», `/availability`, «tramos» y «Disponibilidad de».
- `GET` y `PUT /api/professors/<id>/availability` sin token: `401`.

## Comprobación de la persona usuaria (navegador real)

- Como administrador y como miembro: el botón «Disponibilidad» aparece en el listado de profesores, entre «Editar» y «Borrar», y la funcionalidad responde como se espera.
- La persona usuaria confirmó que está todo bien.

## Resultado

- Despliegue y comprobaciones con `curl`: **PASS**.
- Comprobación en el navegador: **OK**.
