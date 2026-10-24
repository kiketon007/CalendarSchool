# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-24
- Cambio: us-base-calendario
- Agente: Claude Sonnet 5.5

## Despliegues

| PR | Contenido | CI sobre `main` | Migraciones del despliegue |
|---|---|---|---|
| #104 | US-BASE: calendarios base (backend, frontend, documentación) | Los tres jobs en éxito (E2E, lint/tests/build y «Desplegar en producción») | 11 encontradas; aplicada `20261023134046_add_calendars` |
| #105 | Orden de los periodos por hora al guardar (hallazgo de la prueba en el navegador) | Los tres jobs en éxito | 11 encontradas; «No pending migrations to apply» |

- La PR #104 falló primero en «Lint y formato» (`cypress/unsafe-to-chain-command` en `calendars.cy.ts:211`): en local se leyó el código de salida de `tail` y no el del lint. Se corrigió y se anotó en el informe del paso 11.
- Desde mi equipo, `scripts/smoke.mjs` dio `fetch failed` en las tres peticiones; con `curl --ssl-no-revoke` el mismo servidor responde bien. El smoke test del despliegue pasó en la CI.

## Comprobaciones con curl (sin crear datos)

- `GET /calendarios` y `GET /calendarios/nuevo` devuelven `200` con la SPA y la CSP.
- El bundle contiene los textos nuevos («Crear calendario», «Generar sesiones», «Cursos que siguen este calendario», «Solo los administradores pueden crear y modificar») y, tras la PR #105, «Se ordenan por hora al guardar».
- `GET /api/calendars` y `POST /api/calendars` sin token: `401 INVALID_SESSION` con `www-authenticate: Bearer` y `cache-control: no-store`. `GET /api/health`: `200`.
- Incidencia de la sonda: un primer `GET` con cuerpo recibió un `403` de CloudFront; sin cuerpo da `401`.

## Prueba en el navegador (persona usuaria)

Realizada sobre `https://app.calendarschools.es` con la versión de la PR #105 y comunicada como «las pruebas han ido bien»:

- Crear «Primaria» con el generador y un curso, con su aviso y su resumen.
- Añadir un recreo, moverlo a las 11:15–11:45 y desplazar las sesiones siguientes: se guarda y queda entre las sesiones 3 y 4 (el caso que falló antes de la PR #105).
- Recreo sin mover y recreo con solape: errores en la fila correcta.
- Mover un curso entre calendarios con el aviso previo; nombre repetido; vista de `MEMBER` de solo lectura y `/calendarios/nuevo` hacia la bienvenida.
- Escritorio y móvil sin desplazamiento horizontal, y sin violaciones de CSP.

## Hallazgo de la prueba en producción

El orden de las filas del formulario (recreo añadido al final y movido por horas) no se había probado antes: ver `2026-10-24-step-11b-e2e-orden-periodos.md`. Corregido en la PR #105 con su propio E2E.

## Resultado

- Estado del paso 13: PASA
- Problemas bloqueantes: ninguno
