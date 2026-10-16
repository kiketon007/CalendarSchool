# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-16
- Cambio: us02-b1-usuarios-colegio
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #43 (`feature/us02-b1-usuarios-colegio`), integrada por la persona usuaria en `main` (`c24867d`, 15:35 UTC).
- La primera ejecución de CI de la PR falló en el job de lint: un acceso a `response.body.error` sobre un `any` en `users.cy.ts` (`no-unsafe-member-access`). El job de E2E había pasado. Se tipó el cuerpo (`80ff5ab`) y la segunda ejecución pasó entera. La causa de que el error llegara a CI: tras crear esa spec se midió el lint con `npm run lint | tail`, cuyo código de salida es el de `tail`; desde entonces se comprueba el código de salida real de `npm run lint`, `typecheck` y `prettier --check`.
- Ejecución de CI y despliegue sobre el commit de la integración (`38925179226`): **completada con éxito**. Lint, tests y build, E2E y «Desplegar en producción» pasan, incluidos los pasos de migraciones (sin migración pendiente), despliegue con CDK, publicación del frontend en S3, invalidación de `index.html` en CloudFront y el **smoke test** (`GET /`, `POST /api/auth/login` llega al backend, `GET <execute-api>/api/health` sin `X-Origin-Verify` y `GET /api/health`).
- Sin migración de base de datos ni cambios de infraestructura.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, con `--ssl-no-revoke` (el almacén de certificados de Windows no puede comprobar la revocación desde esta red; el certificado se sigue validando):

| Petición | Respuesta |
|---|---|
| `GET /api/users` sin `Authorization` | `401 INVALID_SESSION`, `www-authenticate: Bearer`, `cache-control: no-store`, más las cabeceras de seguridad de CloudFront (`Referrer-Policy`, `X-Content-Type-Options`, HSTS) |
| `GET /api/users` con `Authorization: Basic …` | `401 INVALID_SESSION`, `www-authenticate: Bearer` |
| `GET /api/users` con `Authorization: Bearer ` vacío | `401 INVALID_SESSION`, `www-authenticate: Bearer` |
| `GET /api/users` con un JWT firmado con otra clave | `401 INVALID_SESSION`, `www-authenticate: Bearer` |
| `GET /api/health` | `200`, `cache-control: no-store` |
| `GET /api/municipalities` | `200`, `cache-control: public, max-age=86400` (conserva su caché) |
| `GET /usuarios` (la SPA) | `200`, `text/html`, con la `Content-Security-Policy` de CloudFront |

## Comprobación con un navegador real (Playwright)

Con la autorización de la persona usuaria se creó una **cuenta de prueba** en producción y se hizo el recorrido completo:

1. `/registro`: se rellenó el formulario (colegio «Colegio Prueba Usuarios», València) con reCAPTCHA v3 real y se envió → `POST /api/auth/register` `201` y llegada a `/onboarding`.
2. La cabecera se muestra con la navegación principal y el enlace **«Usuarios»** (la cuenta es de administrador), el usuario («Prueba Usuarios»), el colegio y «Cerrar sesión».
3. Se pulsó «Usuarios» → llegada a `/usuarios` y `GET /api/users` **`200`**. La tabla muestra una fila: nombre, apellidos, email, rol «Administrador», estado «Activo» y fecha de alta «16 oct 2026».
4. Se pulsó «Cerrar sesión» → llegada a `/login`. Se abrió `/usuarios` de nuevo: `POST /api/auth/refresh` **`401`** y redirección a `/login`, sin cabecera ni tabla.

Peticiones a `/api` del recorrido: `municipalities` 200, `refresh` 401 (sin sesión), `register` 201, `refresh` 200, `users` 200, y tras cerrar la sesión `refresh` 401.

- **Consola:** el único error es el `401` de `/api/auth/refresh` del visitante sin sesión (el navegador lo registra aunque la aplicación lo trata como «sin sesión», sin mostrar nada). **Ninguna violación de CSP** en el registro, la navegación a `/usuarios` ni la petición autenticada.
- **Almacenamiento:** `sessionStorage` vacío y `localStorage` solo con `_grecaptcha`, la clave de Google; el access token no se guarda ahí ni en una cookie legible.
- No se probó el reintento tras un fallo ni la renovación del token caducado en producción: no se pueden provocar sin alterar el servicio; los cubren los E2E (`users.cy.ts`).

## Dato de prueba que queda en producción

La cuenta de prueba **sigue en la base de datos de producción** y debe borrarse a mano: usuario `prueba.usuarios.20261016@example.com`, colegio «Colegio Prueba Usuarios» (València), y su refresh token (revocado). No hay forma de borrarla desde la aplicación ni se tiene acceso a la base de datos de producción desde esta sesión. Los intentos del limitador que dejó el registro los purga la tarea diaria de `backup.yml`.

Sigue pendiente, del cambio anterior, la cuenta `prueba.cierre.20261015@example.com` («Colegio Prueba Cierre de Sesión»).

## Resultado

- Estado del paso 14: **PASS**
- Incidencias: ninguna en producción. Quedan anotados el borrado de la cuenta de prueba y el fallo de lint de CI ya corregido.
