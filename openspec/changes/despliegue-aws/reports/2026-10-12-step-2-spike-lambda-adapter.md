# Spike del adaptador de Lambda (grupo 2, D2)

**Fecha:** 2026-10-12 · **Resultado:** `serverless-http` 4.0.0 funciona con Express 5; no hace falta cambiar a `@codegenie/serverless-express`.

## Qué se probó

`backend/src/presentation/lambda/lambdaAdapter.test.ts` invoca el handler con eventos propios de la HTTP API con payload 2.0 (`ANY /{proxy+}`) sobre `createApp` con dobles:

| Caso | Resultado |
|---|---|
| `GET /api/health` | `200` y cuerpo común `{ success, data: { status: 'ok', database: 'up' } }` |
| `POST /api/auth/register` con JSON en base64 | Express recibe el cuerpo parseado (`201`) |
| Cookie de sesión del registro | Sale en `cookies`, con `HttpOnly`, y no queda `set-cookie` en `headers` |
| Varias cookies (array) y una sola (cadena) | Cada una en su posición de `cookies` |
| `cookies` del evento | Llegan a Express como cabecera `Cookie` (`a=1; b=2`) |
| Ruta inexistente | `404 NOT_FOUND` en el formato común |

## Hallazgo

`serverless-http` rellena `cookies` solo cuando `Set-Cookie` es un array. Nuestros routers lo escriben como cadena (`res.setHeader('Set-Cookie', cookie)`), y entonces la librería lo deja en `headers['set-cookie']`. La HTTP API 2.0 junta las cabeceras repetidas en una sola, así que con más de una cookie se corromperían.

**Decisión:** `createLambdaHandler(app)` (`presentation/lambda/lambdaAdapter.ts`) envuelve `serverless(app)` y mueve `set-cookie` de `headers` a `cookies`. Los routers no cambian. Se actualizaron D2 de `design.md`, la tarea 7.3 y el escenario «Cuerpo JSON y cookies» de `serverless-runtime`.

## Dependencias

`serverless-http` (sin scripts de instalación, no requiere `allowScripts`) y `@types/aws-lambda` (desarrollo).
