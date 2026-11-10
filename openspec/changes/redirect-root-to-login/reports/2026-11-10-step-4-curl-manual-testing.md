# Paso 4 - Comprobación manual con curl

- Fecha: 2026-11-10
- Cambio: redirect-root-to-login
- Agente: Claude

## Alcance

El cambio no añade ni modifica endpoints, así que no hay peticiones nuevas a la API que probar. Con `curl` solo se puede comprobar lo que sirve el servidor: **la redirección en sí no se puede ver con `curl`, porque ocurre en el navegador al ejecutar la aplicación** (la cubren los tests de `App` y el E2E `rootRedirect.cy.ts`).

## Preparación

- `npm run build -w frontend` (código de salida 0) y `vite preview` en `:4173`, con su proxy de `/api` hacia el backend de desarrollo en `:3000` (`node --env-file=<entorno temporal> --import tsx src/server.ts`, sin las claves de reCAPTCHA) contra la base `calendarschool`.

## Resultados

| Petición | Resultado |
| --- | --- |
| `GET http://localhost:4173/` | `200 text/html` |
| `GET http://localhost:4173/login` | `200 text/html`, **el mismo `index.html` byte a byte** que `/` (la SPA decide la ruta en el navegador) |
| El HTML contiene `<div id="root">` | sí |
| `GET http://localhost:4173/api/health` (por el proxy) | `{"success":true,"data":{"status":"ok","database":"up"}}` |
| Bundle (`frontend/dist/assets/*.js`) | **no** contiene «Bienvenido a CalendarSchool» ni «Gestión y generación de horarios escolares.» (los textos de la página eliminada) y **sí** el texto «Iniciar sesión» |

## Limpieza

- El cambio no escribe en la base de datos ni la prueba creó datos: la base de desarrollo sigue con `_prisma_migrations` (21) y `municipalities` (542).
- Backend y `vite preview` parados (`taskkill /T /F` del proceso que escuchaba en cada puerto); los puertos 3000 y 4173 quedan libres (`Get-NetTCPConnection -State Listen`: 0).

## Resultado

- Paso 4: **PASA**. Incidencias bloqueantes: ninguna.
