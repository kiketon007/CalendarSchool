# Spike de las claves reales de reCAPTCHA (grupo 0)

**Fecha:** 2026-10-14 · **Resultado:** las claves creadas en un proyecto de Google Cloud funcionan con `siteverify`; `RecaptchaCaptchaVerifier` sirve sin cambios.

## Qué se probó

Entorno local (`npm run dev`, `NODE_ENV=development`, `APP_ORIGIN=http://localhost:5173`), con las claves de sitio en `frontend/.env.development.local` y los secretos en `backend/.env`. Cada valor tiene 40 caracteres. Ninguna clave ni secreto se copia en este informe.

| # | Pregunta | Resultado |
|---|---|---|
| a | ¿`siteverify` acepta el secreto v3? | Sí. Registro desde un navegador real y desde Chrome automatizado (Playwright): `POST /api/auth/register` → `201`, `POST /api/auth/refresh` → `200` y redirección a `/onboarding` |
| b | ¿Llegan `score`, `action=register` y `hostname=localhost`? | Sí. Si faltara alguno, el verificador habría respondido `CAPTCHA_FAILED` o `503 CAPTCHA_UNAVAILABLE` |
| c | ¿Funciona el reto v2 con claves reales y el mismo script? | Sí. Con el script cargado como lo hace la aplicación (`api.js?render=<clave v3>`), `grecaptcha.render` con la clave v2 produjo un token. `POST /api/auth/register` con `{ captcha: { version: 'v2', token } }` respondió `400 VALIDATION_ERROR` con los seis campos vacíos en `details`: el captcha se verifica antes que la validación, así que el token pasó |
| d | ¿Qué dominios usa el navegador? | `www.google.com`, `www.gstatic.com` y `fonts.gstatic.com` (ver abajo) |
| e | ¿Cuándo se carga el script? | Solo al enviar el formulario. Antes del envío no hay ninguna petición a Google |

## Peticiones a dominios externos al enviar el formulario

```
www.google.com      GET  recaptcha/api.js?render=<clave v3>
                    GET  recaptcha/api2/anchor            (iframe invisible)
                    GET  recaptcha/api2/webworker.js
                    POST recaptcha/api2/reload
                    POST recaptcha/api2/clr
www.gstatic.com     GET  recaptcha/releases/<versión>/recaptcha__es.js
                    GET  recaptcha/releases/<versión>/styles__ltr.css
                    GET  recaptcha/api2/logo_48.png
fonts.gstatic.com   GET  roboto (woff2)
```

El log de red no distingue qué peticiones salen de nuestra página y cuáles del iframe de Google. Por eso `design.md` (D2) parte de los orígenes mínimos y la tarea 8.6 valida la CSP en el navegador.

## Observaciones

- **Ningún navegador provocó el reto v2.** Chrome automatizado obtuvo un score alto, igual que el navegador real. El v2 se probó pintando la casilla a mano desde la consola.
- **El `502` del primer intento no era de reCAPTCHA.** Fue el backend reiniciándose (`node --watch`) mientras el proxy de Vite le enviaba la petición. Un segundo intento funcionó.
- **Datos de prueba.** Los registros crearon los colegios «colegio3» y «Colegio Spike Playwright» en la base de **desarrollo** local. Producción no se tocó.

## Qué queda para producción

- Confirmar que las claves de producción incluyen el dominio `calendarschools.es`: el backend exige que el `hostname` de la respuesta coincida con `APP_ORIGIN`.
- La comprobación contra producción solo puede ser parcial hasta que se abra el registro con US02 (tarea 14.4).
