# Informe del paso 14 - Despliegue y comprobación en producción

- Fecha: 2026-10-14
- Cambio: publicacion-registro
- Agente: Claude Sonnet 5.5

Ninguna clave, secreto ni valor de cookie se copia en este informe. El registro **sigue cerrado** en producción (`/api/auth/*` responde `404` desde CloudFront): este paso solo despliega y comprueba lo que lo prepara para US02.

## 14.1 Claves de producción

La persona usuaria confirmó que las claves de reCAPTCHA cargadas el 12 de octubre (las variables `VITE_RECAPTCHA_SITE_KEY_V3` y `_V2` del entorno `prod` de GitHub y los parámetros `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET` de SSM) son las reales de Google Cloud. El agente solo pudo ver que las dos variables existían, con su fecha de última modificación; no tiene credenciales de AWS en la máquina, así que no consultó SSM.

Que las claves incluyan `calendarschools.es` no se pudo comprobar directamente, y el servidor no lo verifica mientras el registro esté cerrado. La señal en el navegador es que Google concede el token de v3 (ver 14.4). **Sigue sin comprobarse** el dominio de la clave v2 y el `hostname` que `siteverify` devuelve con las claves de producción: queda para la apertura con US02.

## 14.2 Integración y despliegue

| Hecho | Detalle |
|---|---|
| PR | #31 `feat(registro): consentimiento, /privacidad, CSP y purga de intentos (publicacion-registro)`, con 8 commits; fusionada en `main` (merge `34b2b4e`) a las 20:46 UTC por la persona usuaria |
| Run de CI | `38634845297` sobre `34b2b4e`: éxito en «Lint, tests y build», «E2E con Cypress» y «Desplegar en producción» |
| Migración | `Applying migration 20261014132125_add_privacy_policy_acceptance` y «All migrations have been successfully applied» (5 migraciones en total) |
| CloudFormation | `CalendarSchool-prod-App` en `UPDATE_COMPLETE` en 66 s; se actualizaron `ResponseHeadersPolicy` (`SecurityHeaders`), la Lambda `ApiFunction` y la función `ApiGuard` |
| Frontend | Publicado en S3 e invalidado `/index.html` |
| Smoke test | 4 comprobaciones OK: `POST /api/auth/register (registro cerrado)`, `GET /`, `GET <execute-api>/api/health (sin X-Origin-Verify)` y `GET /api/health` |

## 14.3 Comprobaciones con `curl` contra `https://app.calendarschools.es`

| Petición | Resultado |
|---|---|
| `GET /registro` | `200`; `Content-Security-Policy` idéntica byte a byte a la serializada desde `frontend/content-security-policy.json`; 0 cabeceras `Report-Only` |
| `GET /privacidad` | `200`; la misma CSP idéntica; 0 cabeceras `Report-Only` |
| `POST /api/auth/register` con `{}` | `404` `{"success":false,"error":{"code":"NOT_FOUND",…}}` |
| `POST /api/auth/refresh` con `{}` | `404 NOT_FOUND` |

Además llegan `Strict-Transport-Security` (`max-age=31536000; includeSubDomains`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Referrer-Policy: strict-origin-when-cross-origin`. El HTML se sirve con `Cache-Control: no-cache` y `X-Cache: RefreshHit`, así que CloudFront lo revalida y no sirve una política antigua (la duda que dejó la validación local).

## 14.4 Playwright en `https://app.calendarschools.es/registro`

Contexto de navegador limpio, formulario rellenado con datos de prueba (`e2e.prod.<marca>@example.com`), casilla de la política marcada y envío.

- **Violaciones de CSP: 0** (listener de `securitypolicyviolation`).
- **reCAPTCHA cargó entero:** `api.js`, `recaptcha__es.js`, `api2/anchor`, `webworker.js`, la fuente del iframe, `POST api2/reload` y `POST api2/clr`. Este último es el que bloqueaba `connect-src 'self'` en la validación local.
- **Token obtenido:** la petición de registro salió con `captcha.version: "v3"`, un token de 2382 caracteres y `privacyPolicyAccepted: true`.
- **Respuesta:** `404` de CloudFront. El formulario muestra el aviso genérico «No hemos podido completar el registro. Inténtalo de nuevo más tarde.» No se creó ningún dato.
- **Errores en la consola:** en una segunda pasada que registró todas las respuestas ≥ 400 solo salieron `POST /api/auth/refresh` (la renovación de sesión al montar) y `POST /api/auth/register`, ambas `404`, que es lo esperado con el registro cerrado.
- **Un `403` no reproducido:** la primera pasada mostró en la consola un error `403` (además de los dos `404`) que no volvió a aparecer en la segunda. No se identificó su origen; es probable que fuera una petición a Google, pero no se ha comprobado. No hubo violaciones asociadas ni afectó al flujo.
- La carpeta `.playwright-mcp/` creada se borró.

## 14.5 `backup.yml` a mano

Run `38636395007` (`workflow_dispatch` sobre `main`): éxito. Los pasos corrieron en este orden: instalar el cliente de PostgreSQL 17, credenciales de AWS por OIDC, **«Purgar intentos caducados»** (20:57:40), **«Volcar la base de datos y subirla a S3»** (desde 20:57:41) y «Comprobar /api/health».

- La purga ejecutó `psql -v ON_ERROR_STOP=1 --file infrastructure/supabase/purge-rate-limit-attempts.sql` y respondió `DELETE 0`, un segundo antes de que empezara `pg_dump`.
- **`DELETE 0` no demuestra que la purga borre:** en producción no hay intentos guardados mientras el registro esté cerrado. Lo probado es que el SQL corre en Supabase con el rol propietario, sin error y antes del volcado. Que borra las filas de más de 24 h lo demuestra `purgeRateLimitAttempts.int.test.ts`, contra PostgreSQL real.
- El volcado se subió como `calendarschool-2026-10-14.dump`. El nombre solo lleva la fecha, así que **sustituyó** a la copia que había hecho el schedule a las 08:44 UTC de ese día. El contenido es equivalente y el nuevo incluye la migración de hoy.

## Pendiente fuera de este cambio

- **Revisión legal del texto de `/privacidad`:** la persona usuaria indicó que lo ha revisado. Es condición para abrir el registro con US02.
- **Apertura del registro (US02):** quitar la condición de `apiGuard.js` y cambiar el smoke test. Entonces se comprobarán el dominio de las claves de producción con `siteverify` y el secreto v2 (procedimiento en `docs/despliegue/PUESTA_EN_MARCHA.md`).
- **`style-src` en producción:** no hubo violaciones en la prueba de 14.4, así que no hace falta la excepción que preveía `design.md`.
- **El `403` no reproducido** de 14.4, si se vuelve a ver.

## Resultado

- Estado del paso 14: **PASS**
- Incidencias bloqueantes: ninguna.
