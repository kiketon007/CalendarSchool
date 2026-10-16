# Informe del paso 13 - Despliegue y comprobación en producción

- Fecha: 2026-10-15
- Cambio: cierre-sesion
- Agente: Claude Sonnet 5.5

## Despliegue

- PR #40 (`feature/cierre-sesion`), integrada por la persona usuaria en `main` (`cf75dcd`).
- Ejecución de CI y despliegue sobre ese commit: **completada con éxito** (incluido su smoke test).
- Sin migración de base de datos ni cambios de infraestructura.

## Comprobaciones con `curl` (sin crear datos)

Contra `https://app.calendarschools.es`, con `--ssl-no-revoke` (el almacén de certificados de Windows no puede comprobar la revocación):

| Petición | Respuesta |
|---|---|
| `GET /api/health` | `200`, `cache-control: no-store` |
| `GET /api/municipalities` | `200`, `cache-control: public, max-age=86400` (conserva su caché) |
| `GET /api/no-existe` | `404`, `cache-control: no-store` |
| `POST /api/auth/logout` sin cookie y con `Origin: https://app.calendarschools.es` | `204`, `cache-control: no-store`, `set-cookie: refresh_token=; Max-Age=0; Path=/api/auth; HttpOnly; Secure; SameSite=Lax`, más las cabeceras de seguridad de CloudFront (CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`) |
| `POST /api/auth/logout` sin `Origin` | `403 ORIGIN_NOT_ALLOWED`, `cache-control: no-store`, sin `Set-Cookie` |

## Comprobación con un navegador real (Playwright)

Con la autorización de la persona usuaria se creó una **cuenta de prueba** en producción y se hizo el recorrido completo:

1. `/registro`: se rellenó el formulario (colegio «Colegio Prueba Cierre de Sesión», València) con reCAPTCHA v3 real y se envió → `POST /api/auth/register` `201` y llegada a `/onboarding`.
2. La cabecera se muestra con el usuario («Prueba Cierre»), el colegio y el botón «Cerrar sesión».
3. Se pulsó «Cerrar sesión» → `POST /api/auth/logout` **`204`** y llegada a `/login`.
4. Se abrió `/onboarding` de nuevo: `POST /api/auth/refresh` **`401`** y redirección a `/login`, sin cabecera.

Peticiones a `/api` del recorrido: `municipalities` 200, `refresh` 401 (sin sesión), `register` 201, `refresh` 200, `logout` 204.

- **Consola:** el único error es el `401` de `/api/auth/refresh` del visitante sin sesión (el navegador lo registra aunque la aplicación lo trata como «sin sesión», sin mostrar nada). **Ninguna violación de CSP.**
- **Almacenamiento:** `sessionStorage` vacío y `localStorage` solo con `_grecaptcha`, la clave de Google; la sesión no se guarda ahí.

## Dato de prueba que queda en producción

La cuenta de prueba **sigue en la base de datos de producción** y debe borrarse a mano: usuario `prueba.cierre.20261015@example.com`, colegio «Colegio Prueba Cierre de Sesión» (València), y su refresh token (revocado). No hay forma de borrarla desde la aplicación ni se tiene acceso a la base de datos de producción desde esta sesión. Los intentos del limitador que dejó el registro los purga la tarea diaria de `backup.yml`.

## Resultado

- Estado del paso 13: **PASS**
- Incidencias: ninguna. Queda anotado el borrado de la cuenta de prueba.
