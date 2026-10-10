## Why

El registro verifica el captcha con un adaptador provisional que acepta cualquier token, y el formulario envía siempre el mismo token fijo: no distingue personas de bots. US01_e añade el paso 2 del orden de procesamiento de US01, la verificación real con Google reCAPTCHA: v3 invisible con umbral 0,6 y, si el score es bajo, un reto v2 (checkbox) en lugar de rechazar. Junto con el límite de intentos (US01_d), es requisito para publicar el registro en producción.

## What Changes

- **Verificación real en el backend:** un adaptador de reCAPTCHA sustituye al provisional detrás del puerto `CaptchaVerifier`, sin tocar el caso de uso. Para `v3` comprueba éxito, acción `register`, dominio (el de `APP_ORIGIN`) y score ≥ 0,6; con score menor responde `422 CAPTCHA_CHALLENGE_REQUIRED`. Para `v2` comprueba éxito y dominio. Cualquier otro fallo (token ausente, inválido, caducado o reutilizado, acción o dominio incorrectos, reto no superado) responde `422 CAPTCHA_FAILED`.
- **Google no responde:** si la verificación no se completa (timeout de 3 segundos, error de red o de Google, o claves mal configuradas), el registro falla cerrado con `503 CAPTCHA_UNAVAILABLE`, un código nuevo.
- **Verificador falso para desarrollo, tests y E2E:** sustituye al provisional cuando no hay claves de reCAPTCHA. Acepta cualquier token salvo unos valores reservados que simulan el score bajo, el fallo y la indisponibilidad. `loadConfig` exige las claves en producción, de modo que el falso nunca puede llegar allí.
- **Eventos de log:** `USER_REGISTER_CAPTCHA_CHALLENGE` (score bajo, con el score) y `USER_REGISTER_CAPTCHA_FAILED` (con el motivo), sin el token. La indisponibilidad la registra el manejador central como error.
- **Frontend:** un cliente de captcha obtiene un token v3 nuevo en cada envío. Ante `CAPTCHA_CHALLENGE_REQUIRED` muestra el reto v2 y reenvía con su token; ante `CAPTCHA_FAILED` y `CAPTCHA_UNAVAILABLE` muestra mensajes propios. Sin claves de sitio usa un cliente falso, con un reto simulado. El formulario muestra el aviso de privacidad y condiciones de Google. Textos por i18n.
- **Configuración:** `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET` en el backend; `VITE_RECAPTCHA_SITE_KEY_V3` y `VITE_RECAPTCHA_SITE_KEY_V2` en el frontend. En los dos casos, ambas o ninguna.
- **Contrato (`docs/api-spec.yml`):** `503 CAPTCHA_UNAVAILABLE` en `POST /api/auth/register` y en el enum `ErrorCode`, y a la vez en `ERROR_CODES`; descripción de las comprobaciones del `422`. Se regeneran los tipos.
- **Spike con claves reales:** comprobar, al empezar, si las claves creadas en Google Cloud admiten el endpoint `siteverify` o exigen la API de evaluaciones de Google Cloud (Google ya no crea claves de reCAPTCHA «clásico»). Necesita que el responsable cree las claves.
- **Documentación:** README, `CLAUDE.md`, estándares e historia de usuario (decisiones pendientes de US01_e resueltas).

## Capabilities

### New Capabilities

- `captcha-verification`: verificación de tokens de reCAPTCHA v3 y v2 con sus comprobaciones (score, acción, dominio), indisponibilidad que falla cerrado, verificador falso para entornos sin claves y su exclusión en producción, y cliente de captcha en el frontend (real o falso).

### Modified Capabilities

- `user-registration`: el captcha provisional se sustituye por la verificación real como paso 2 (requisito retirado y sustituido), con sus eventos de log y el `503 CAPTCHA_UNAVAILABLE` en el contrato; el formulario obtiene un token v3 en cada envío, presenta el reto v2 cuando se pide, muestra los mensajes de fallo e indisponibilidad y el aviso de privacidad de Google.
- `app-configuration`: secretos de reCAPTCHA en el backend, obligatorios en producción, y claves de sitio en el frontend.

## Impact

- **Backend:** `RecaptchaCaptchaVerifier` y `FakeCaptchaVerifier` en `infrastructure/` (el provisional `AcceptAllCaptchaVerifier` desaparece); error `CaptchaUnavailable`; motivo en `CaptchaFailed` y score en `CaptchaChallengeRequired`; eventos en `RegisterSchool`; `errorHandler` traduce la indisponibilidad a `503`; `server.ts` elige el verificador según la configuración. Sin dependencias nuevas: la llamada a Google usa `fetch`.
- **API:** `docs/api-spec.yml` y `backend/src/presentation/http/appError.ts` (`appError.test.ts` exige que coincidan); `frontend/src/api/generated/schema.ts` regenerado.
- **Base de datos:** sin cambios.
- **Frontend:** módulo de captcha (cliente real que carga el script de Google y cliente falso), `registrationService` (tres resultados nuevos), `RegisterPage` (reto v2, mensajes y aviso de privacidad) y claves i18n. Primera configuración por variables `VITE_*`.
- **Pruebas e infraestructura:** adaptador probado con `fetch` inyectado y respuestas grabadas de Google; E2E del flujo completo con el cliente y el verificador falsos. Los tests que envían un registro sin `captcha` pasan a recibir `422` en lugar de `400`.
- **Referencias:** US01_e (CA5) de `docs/User_Stories_MVP.md`; PRD §3.1; orden de procesamiento de US01.

### Fuera de alcance

Creación de las claves en Google Cloud (la hace el responsable de la cuenta; este cambio solo las consume), valoración legal de si reCAPTCHA exige consentimiento del usuario (queda anotada como pendiente antes de publicar), `Content-Security-Policy` (no existe todavía), umbral configurable (0,6 es una constante), reCAPTCHA en el login (US02) y resiliencia del formulario (US01_f).
