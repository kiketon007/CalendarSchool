# Informe del paso 16 - Apertura de `/api/auth/*` en producción

- Fecha: 2026-10-15
- Cambio: inicio-sesion
- Agente: Claude Sonnet 5.5

## Qué se abrió

El registro y el inicio de sesión de `https://app.calendarschools.es` pasan a ser accesibles desde internet. Se eliminó la CloudFront Function `apiGuard.js`, que respondía `404` a todo lo que cuelga de `/api/auth/` desde US00_b.

- **PR #36** (`feat(infra)!: abrir /api/auth/* en producción`), fusionada por la persona usuaria como `4d2dfa5`.
- Antes de abrir, la persona responsable confirmó la revisión legal del texto final de `/privacidad` (tareas 7.5 y 16.1).
- **Vuelta atrás:** lanzar el workflow de despliegue a mano con el SHA `3043d3ff645fae54b94baf55f0587f1a7cde928f`, el último commit que lleva la función de cierre (procedimiento en `docs/despliegue/PUESTA_EN_MARCHA.md`, «Cerrar el registro de nuevo»).

## Estado previo (tarea 15.2, con la API aún cerrada)

Tras fusionar la PR #35 (login desplegado, `3043d3f`):

- Migración `20261015141957_drop_refresh_token_client_data` aplicada en Supabase («All migrations have been successfully applied») y smoke test en verde con `POST /api/auth/register (registro cerrado)`.
- `/login`, `/registro`, `/privacidad` y `/` responden `200` con la `Content-Security-Policy` idéntica a `frontend/content-security-policy.json` y sin `Report-Only`.
- `POST /api/auth/login`, `/register` y `/refresh` responden `404 NOT_FOUND` desde CloudFront; `/api/health` y `/api/municipalities`, `200`.
- El bundle desplegado lleva `lastUpdated: 2026-10-15` (castellano e inglés) y ninguna `2026-10-14`.

## Despliegue de la apertura (tarea 16.5)

Workflow `CI` sobre `4d2dfa5` (ejecución `38773453933`): «Lint, tests y build», «E2E con Cypress» y «Desplegar en producción», los tres en verde.

- CloudFormation: `UPDATE_COMPLETE` de la distribución y `DELETE_COMPLETE` del recurso `AWS::CloudFront::Function ApiGuard14A702DE`. La pila `CalendarSchool-prod-App` tardó 50 s; la de certificados, sin cambios. «No pending migrations to apply».
- Smoke test, todas las comprobaciones en verde:
  - `OK    GET / (página de la aplicación)`
  - `OK    GET <execute-api>/api/health (sin X-Origin-Verify)`
  - `OK    POST /api/auth/login (llega al backend)`
  - `OK    GET /api/health`

  No hizo falta ningún reintento visible por la propagación de CloudFront: `cdk deploy` espera a que la distribución termine de actualizarse.

## Comprobación de reCAPTCHA en producción (tarea 16.6)

Con Playwright (navegador real) en `https://app.calendarschools.es/login`, con las claves reales y **sin crear ningún dato**: un login con un email que no existe (`no.existe.1015@example.com`) y una contraseña ficticia.

1. **Carga:** `GET /login` `200`; el bundle y la hoja de estilos `200`; `POST /api/auth/refresh` `401` (sin sesión, lo normal). **Ninguna petición a Google** hasta enviar el formulario.
2. **Al enviar**, el script de reCAPTCHA se carga y se ejecuta: `api.js?render=<clave de sitio v3>`, `recaptcha__es.js`, `api2/anchor` (con `co=` el dominio `https://app.calendarschools.es:443` y `size=invisible`), `api2/reload`, `api2/webworker.js`, y después `api2/clr` y `api2/bcn`, **todas `200`**. `api2/clr` es la que obligó a ampliar `connect-src` en `publicacion-registro`.
3. **Respuesta del backend:** `POST /api/auth/login` → `401`. La página muestra «Email o contraseña incorrectos», conserva el email y vacía la contraseña. Que la respuesta sea `401` y no `422` o `503` demuestra que el backend verificó con Google el token v3 con el **secreto v3 real**, el **dominio** de las claves (`calendarschools.es`) y un **score ≥ 0,6**, y solo entonces comprobó las credenciales.
4. **Consola:** solo tres «Failed to load resource» (`favicon.ico` `403`, y dos `401` de `refresh` y `login`). **Ninguna violación de la CSP.**

El resultado deja anotado un intento fallido de login de la IP de la prueba en `rate_limit_attempts` (no se puede consultar la base de producción desde aquí), que se borra solo en unas 48 horas.

### Lo que no se ha comprobado en producción

- **El secreto v2.** Solo se usa si Google pide el reto, y con Chrome automatizado el score es alto, así que no se llegó a él. Sigue validado en local con las claves de producción (informe `2026-10-14-spike-recaptcha-keys.md` de `publicacion-registro` y procedimiento de la guía).
- **El reto v2 en el navegador de producción.** Lo cubren los E2E con el cliente falso y las pruebas con claves reales de `publicacion-registro`.
- **Un registro y un login correctos de un usuario real.** No se hicieron para no crear datos en producción; lo cubren el E2E (78 tests) y las pruebas de integración.

## Incidencias y hallazgos

- **Filtro web corporativo.** La primera carga con Playwright devolvió un `403` del filtro FortiGuard de la red de la persona usuaria («Web Filter Block Override», categoría «Unrated», grupo `VPN_TECH`), no de la aplicación. No se usó el botón «Proceed» (esquivar una política de la organización no es decisión del agente); la persona usuaria desactivó el filtro y la comprobación se repitió. Con el `curl` de Windows pasó algo parecido: el almacén de certificados no podía comprobar la **revocación** del certificado de Amazon (`CRYPT_E_NO_REVOCATION_CHECK`) y se usó `--ssl-no-revoke`, que solo omite esa consulta y sigue validando la cadena y el nombre.
- **El `403` que se anotó como «sin identificar» en el paso 14 es el favicon.** `GET /favicon.ico` responde `403` con un XML de S3 (`AccessDenied`): el proyecto no tiene favicon y `index.html` no declara ninguno, así que el navegador lo pide por defecto y S3, a través de OAC, responde `403` a una clave que no existe. Es cosmético, pero sale en la consola de cada visitante. **Pendiente (fuera de este cambio):** añadir un favicon.
- Los intentos de login de las pruebas manuales con `curl` (informe del paso 12) se hicieron contra el backend local, no contra producción.

## Resultado

- Estado del paso 16: **PASS**
- Incidencias bloqueantes: ninguna.
- Pendiente fuera de este cambio: favicon.
