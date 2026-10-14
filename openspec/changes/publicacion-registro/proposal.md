## Why

El registro de US01 está desplegado pero cerrado en producción: CloudFront responde `404` a `/api/auth/*` (US00_b, `docs/User_Stories_MVP.md`). La historia y el cambio `despliegue-aws` dejaron como condición para abrirlo la CSP con reCAPTCHA, la prueba de las claves reales de Google y el consentimiento con sus textos legales (US01_e, «Pendiente antes de publicar»). El PRD exige que el piloto pueda registrar su colegio (§211, autenticación en el alcance del MVP).

Abrir ahora el registro sería un error de producto. El refresh token dura 24 horas y no hay login hasta US02, así que un colegio que se registrara perdería el acceso al día siguiente, y repetir el registro le daría `409`. Este cambio deja el registro **listo para publicarse** y aplaza la apertura al cambio que implemente US02.

## What Changes

- **El registro sigue cerrado hasta US02:** `/api/auth/*` sigue respondiendo `404` en CloudFront. Abrirlo (quitar la condición de `apiGuard.js`) pasa a ser parte del cambio de US02, porque el login también colgará de `/api/auth/` y el mismo cierre lo protege mientras tanto. Se actualizan todas las referencias que decían que este cambio abre el registro.
- **Claves reales de reCAPTCHA validadas:** el spike del 2026-10-14 comprobó, con claves de Google Cloud, que `siteverify` acepta los secretos v3 y v2 y que el reto v2 funciona con el mismo script. El adaptador `RecaptchaCaptchaVerifier` no cambia. Se documenta en `docs/despliegue/PUESTA_EN_MARCHA.md` el procedimiento para validar las claves de producción, incluido el secreto v2.
- **`Content-Security-Policy` estricta** en el frontend servido por CloudFront, con solo los orígenes de reCAPTCHA (`www.google.com` y `www.gstatic.com`) además del propio. Se publica directamente en modo estricto, tras validarla en local con un build servido con la misma cabecera y las claves reales.
- **Consentimiento de la política de privacidad en el registro:**
  - Una casilla obligatoria en el formulario, antes del botón de envío. Sin marcarla no se envía nada, y por tanto no se carga el script de Google.
  - El backend exige el campo `privacyPolicyAccepted` (`400` si falta o no es `true`) y guarda en el usuario la fecha y la versión de la política aceptada. **BREAKING (contrato):** un registro sin el campo nuevo responde `400`. No hay clientes externos y el registro está cerrado en producción.
  - Una página pública `/privacidad` con la política de privacidad propia, en `es` y `en`. El borrador lo redacta el agente a partir de lo que hace la aplicación; el responsable del tratamiento (nombre, NIF, domicilio y email de contacto) lo completa la persona usuaria.
- **Conservación limitada de las IP:** hoy los intentos de una IP solo se borran cuando esa IP vuelve a intentarlo, así que una IP que no vuelve se queda para siempre. Una purga diaria borra los intentos de más de 24 horas, para que la política de privacidad pueda declarar un plazo que se cumple.
- **Documentación:** `frontend/.env.example` recomienda `.env.development.local` (con `.env.local`, el build del E2E cogería las claves reales). Se actualizan `README.md`, `CLAUDE.md`, `docs/api-spec.yml`, `docs/User_Stories_MVP.md` (US00_b, US01_e y US02), `docs/Modelo_de_Datos/MODELO_DATOS.md` y `docs/arquitectura/ARQUITECTURA_COMPLETA.md`.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `cloud-deployment`:
  - El registro sigue cerrado hasta el cambio que implemente US02, no hasta este.
  - Requisito nuevo: la CSP del frontend.
  - Las copias diarias se hacen después de purgar los intentos caducados.
- `user-registration`:
  - El contrato y la validación incluyen `privacyPolicyAccepted`.
  - Requisito nuevo: el consentimiento (casilla, comprobación en el backend, fecha y versión guardadas, el script de Google no se carga sin él y la casilla no entra en el borrador).
  - Requisito nuevo: la página `/privacidad`.
- `attempt-limiting`: requisito nuevo de conservación máxima de los intentos, con la purga diaria.

## Impact

- **Backend:** el caso de uso `RegisterSchool` y su validación (`registerSchoolRequest.ts`) con el campo nuevo, la constante de versión de la política y el repositorio de registro, que guarda la fecha y la versión. La tabla compartida `test-fixtures/registration-fields.json` gana el campo.
- **Modelo de datos:** dos columnas nuevas y opcionales en `users` (`privacy_policy_accepted_at` y `privacy_policy_version`), con su migración. Son opcionales porque los usuarios invitados de US02_b aceptarán la política en otro momento. Se actualiza `MODELO_DATOS.md`.
- **API (`docs/api-spec.yml`):** el campo `privacyPolicyAccepted` en la petición de `POST /api/auth/register` y la descripción general del registro cerrado. Se regeneran los tipos del frontend. Sin códigos de error nuevos.
- **Frontend:** la casilla en `RegisterPage`, la ruta y la página `/privacidad`, textos nuevos en `es.json` y `en.json` y la configuración de `vite preview` para servir la CSP.
- **Infraestructura:** la CSP en la `ResponseHeadersPolicy` de `appStack.ts` y los comentarios de `apiGuard.js` y `scripts/smoke.mjs`. Un paso de purga en `backup.yml`, antes del volcado.
- **Pasos manuales (persona usuaria):** cargar las claves reales de producción en las variables de GitHub (`VITE_RECAPTCHA_SITE_KEY_*`) y en SSM (`RECAPTCHA_*_SECRET`), completar los datos del responsable en la política y revisar el texto legal.
- **Referencias:** US00_b, US01_e («Pendiente antes de publicar»), US02 y PRD §211.

### Fuera de alcance

- **Abrir `/api/auth/*` en producción:** va con US02 (login).
- **Validación jurídica del texto:** el agente propone un borrador ajustado al código. La revisión legal es responsabilidad de la persona usuaria antes de abrir el registro.
- **Banner de cookies:** la única cookie propia (`refresh_token`) es técnica, y reCAPTCHA se carga solo tras el consentimiento explícito del registro.
- **Ejercicio de derechos dentro de la aplicación** (acceso, supresión y exportación de datos): la política indica el email de contacto.
- **Informes de la CSP** (`report-uri`/`report-to`): no hay un servicio que los reciba.
- **Prueba de carga del registro:** sigue aplazada hasta que el registro esté abierto.
