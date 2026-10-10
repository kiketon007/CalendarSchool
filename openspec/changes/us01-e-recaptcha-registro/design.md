## Context

`POST /api/auth/register` sigue el orden de US01: límite de intentos (US01_d) → **captcha** → validación → email → colegio → alta, más la sesión de US01_c. El paso 2 ya tiene su sitio:

- **Contrato:** `captcha: { version: 'v3' | 'v2', token }` obligatorio y los dos `422` (`CAPTCHA_CHALLENGE_REQUIRED` y `CAPTCHA_FAILED`), desde US01_a.
- **Backend:** el puerto `CaptchaVerifier.verify(captcha: unknown)` y sus errores `CaptchaFailed` y `CaptchaChallengeRequired`, que `errorHandler` ya traduce a `422`. `RegisterSchool` llama a `verify` antes de validar el payload. El adaptador es provisional (`AcceptAllCaptchaVerifier`, acepta todo) y lo cablean `server.ts` y `test/support/realApp.ts`.
- **Frontend:** `RegisterPage` envía un token fijo (`PROVISIONAL_CAPTCHA`) y un `422` cae en el mensaje genérico. No hay ninguna variable `VITE_*` todavía.

Restricciones externas:

- **Google ya no crea claves de reCAPTCHA «clásico»** (desde el tercer trimestre de 2024): las claves nuevas se crean en un proyecto de Google Cloud y las clásicas se han migrado allí. El servicio es gratuito hasta 10.000 evaluaciones al mes. No está confirmado si una clave creada directamente en Google Cloud admite el endpoint clásico `siteverify` o exige la API de evaluaciones de Google Cloud.
- **Dos claves:** una basada en score (v3) y otra de checkbox (v2), cada una con su clave de sitio y su secreto.
- **US01_d:** cada envío del formulario es un intento. Quien recibe el reto gasta dos (el v3 con score bajo y el v2).

Historia de referencia: US01_e (CA5) de `docs/User_Stories_MVP.md`.

## Goals / Non-Goals

**Goals:**

- Verificar de verdad los tokens v3 (score ≥ 0,6) y v2, y presentar el reto v2 cuando el score es bajo, sin repetir intentos en bucle en el backend.
- Fallar cerrado si Google no responde, con un mensaje claro y distinto del fallo de verificación.
- Que desarrollo, tests y E2E no dependan de Google y puedan simular todos los casos, sin que el modo falso pueda llegar a producción.
- Informar al usuario del uso de reCAPTCHA.

**Non-Goals:**

- Crear las claves, la valoración legal del consentimiento, `Content-Security-Policy`, umbral configurable, reCAPTCHA en el login y US01_f (ver «Fuera de alcance» de la propuesta).

## Decisions

### D1. Adaptador real detrás del puerto, con `siteverify` por defecto y un spike

`RecaptchaCaptchaVerifier` (`infrastructure/`) implementa `CaptchaVerifier` llamando a `POST https://www.google.com/recaptcha/api/siteverify` (cuerpo `application/x-www-form-urlencoded` con `secret` y `response`) con el secreto de la versión del token. Recibe por constructor `fetch`, los dos secretos, el dominio esperado y un timeout, de modo que se prueba sin red.

Como no está confirmado que las claves nuevas admitan `siteverify`, la primera tarea es un **spike con claves reales**: una página local mínima obtiene un token con la clave de sitio y se verifica con `curl` contra `siteverify`. Si no funciona, se actualiza este diseño antes de seguir y el adaptador pasa a la API de evaluaciones de Google Cloud (`projects.assessments.create`, con su autenticación), sin cambiar el puerto, el caso de uso ni el resto del cambio. El cliente del frontend podría pasar entonces a `enterprise.js`, también detrás de su interfaz (D7).

Si las claves no están disponibles al empezar, el spike queda bloqueado, se implementa según la documentación de `siteverify` y la prueba con claves reales se hace antes de archivar (tarea final de curl); el registro no se publica sin ella.

Alternativas descartadas:

- *Librería de terceros:* `fetch` basta para una llamada; no añade dependencias.
- *Verificar en el frontend:* el secreto nunca puede salir del servidor.

### D2. Comprobaciones y su traducción

| Token | Respuesta de Google | Resultado |
|---|---|---|
| `v3` | `success`, `action == 'register'`, `hostname` = el de `APP_ORIGIN`, `score >= 0.6` | acepta |
| `v3` | igual, pero `score < 0.6` | `CaptchaChallengeRequired(score)` → `422 CAPTCHA_CHALLENGE_REQUIRED` |
| `v3` | `action` o `hostname` distintos | `CaptchaFailed('ACTION_MISMATCH' \| 'HOSTNAME_MISMATCH')` |
| `v2` | `success` y `hostname` correcto | acepta |
| `v2` | `success: false` (reto no superado) | `CaptchaFailed('CHALLENGE_FAILED')` |
| cualquiera | `success: false` con `timeout-or-duplicate` | `CaptchaFailed('EXPIRED_OR_DUPLICATE')` |
| cualquiera | `success: false` con `invalid-input-response` u otro código del token | `CaptchaFailed('INVALID')` |
| — | `captcha` ausente o sin la forma `{ version: 'v3' \| 'v2', token: string no vacío }` | `CaptchaFailed('MISSING')`, sin llamar a Google |

- El umbral 0,6 es una constante (`RECAPTCHA_V3_MIN_SCORE`), como la ventana de US01_d.
- El dominio esperado es el de `APP_ORIGIN` (ya validado por `loadConfig`), así no hace falta otra variable.
- `CaptchaFailed` lleva un `reason` y `CaptchaChallengeRequired` el `score`, solo para el log: al cliente le llega siempre el mismo mensaje por código.

### D3. Google no responde: falla cerrado

Error nuevo `CaptchaUnavailable` (aplicación, con la causa), traducido por `errorHandler` a `503 CAPTCHA_UNAVAILABLE` y registrado como error (como `DatabaseUnavailable`). Se lanza cuando:

- la llamada supera **3 segundos** (`AbortSignal.timeout`), dentro de los 10 del timeout de la petición;
- hay un error de red o Google responde con un estado distinto de 2xx, o con un cuerpo que no es el esperado;
- Google responde `invalid-input-secret` o `missing-input-secret`: es un fallo de configuración nuestro, no del usuario, y no debe presentarse como «verificación fallida».

Nota de las pruebas reales con curl: Google valida **primero el token**. Con un token inválido responde `invalid-input-response` aunque el secreto sea inválido o falte, así que `invalid-input-secret` solo aparecerá con un token de formato válido y un secreto equivocado. La configuración errónea de un secreto se detectará por tanto en el primer registro real, que respondería `503`, y no al arrancar; conviene probarla con las claves propias antes de publicar.

Alternativa descartada: *fallar abierto* (dejar pasar sin verificar mientras Google no responde). Con el límite de US01_d el riesgo estaría acotado, pero un bot que detecte la caída entraría; el registro de colegios no es urgente al minuto. Es el mismo criterio que el limitador de US01_d.

### D4. Verificador falso y su exclusión en producción

`FakeCaptchaVerifier` (`infrastructure/`) sustituye a `AcceptAllCaptchaVerifier`, que desaparece. Aplica la misma comprobación de forma que el real (sin `captcha` válido, `CaptchaFailed('MISSING')`) y acepta cualquier token salvo unos valores reservados:

| `token` | Resultado |
|---|---|
| `fake-low-score` (con `version: 'v3'`) | `CaptchaChallengeRequired(0.3)` |
| `fake-fail` | `CaptchaFailed('INVALID')` |
| `fake-unavailable` | `CaptchaUnavailable` |
| cualquier otro | acepta |

- **Selección:** la hace `createCaptchaVerifier` (`infrastructure/`, con su test, porque `server.ts` no se prueba) y `server.ts` solo la cablea: con `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET`, el real; sin ninguno, el falso. `realApp` usa el falso por defecto y admite otro por opción (como hoy).
- **Salvaguarda:** `loadConfig` exige los dos secretos cuando `NODE_ENV=production` (y que vayan juntos en cualquier entorno), así que en producción no se puede arrancar con el falso. Al arrancar con el falso se registra un aviso (`warn`).
- **Frontend sin claves de sitio:** usa su cliente falso (D7). Si por error se publicara un frontend sin claves contra un backend de producción, el backend real rechazaría su token falso: falla del lado seguro, por eso la salvaguarda está en el backend y no en el build.

### D5. Eventos de log

`RegisterSchool` envuelve la llamada a `verify` (el único sitio con el contexto de la petición) y registra:

- `USER_REGISTER_CAPTCHA_CHALLENGE` (`info`): score bajo y reto pedido, con `score`, `ip` y `user_agent`.
- `USER_REGISTER_CAPTCHA_FAILED` (`warn`): con `reason`, `version`, `ip` y `user_agent`.

Ninguno lleva el token ni el email (aún sin validar). `CaptchaUnavailable` lo registra `errorHandler` como error con su causa, como `DatabaseUnavailable`.

### D6. Contrato

- `CAPTCHA_UNAVAILABLE` se añade al enum `ErrorCode` y a `ERROR_CODES` a la vez (`appError.test.ts`).
- `POST /api/auth/register`: el `503` documenta también `CAPTCHA_UNAVAILABLE` (además de los comunes) y el `422` describe las comprobaciones de D2. El orden de procesamiento de la descripción no cambia.
- Se regeneran los tipos del frontend.

### D7. Cliente de captcha en el frontend

```
captcha/
  captchaConfig.ts      # lee VITE_RECAPTCHA_SITE_KEY_V3/V2 (ambas o ninguna); único sitio que lee import.meta.env
  captchaClient.ts      # interfaz: executeV3(action) → token; renderV2(contenedor, onToken) → reset
  recaptchaClient.ts    # carga https://www.google.com/recaptcha/api.js?render=<clave v3> la primera vez
  fakeCaptchaClient.ts  # v3 → 'fake-v3-token'; v2 → botón «No soy un robot (simulado)» que da 'fake-v2-token'
  useCaptchaClient.ts   # elige el real o el falso según la configuración
```

- El script de Google **solo se carga en la página de registro**, la primera vez que se necesita, no en toda la aplicación.
- `executeV3('register')` se llama **en cada envío**: los tokens caducan a los 2 minutos y no se reutilizan.
- El reto v2 se pinta con `grecaptcha.render(contenedor, { sitekey: <clave v2>, callback })` sobre el mismo script.
- Si el script no carga (red, bloqueador de anuncios) o no responde en 10 segundos, el formulario muestra el mensaje de indisponibilidad sin llamar al backend, y no gasta un intento.

**Flujo de `RegisterPage`:**

```
envío ─▶ token v3 ─▶ POST ─┬─ 201 ─────────────────────▶ sesión y /onboarding (US01_c)
                           ├─ 422 CHALLENGE_REQUIRED ──▶ muestra el reto v2 y el texto «confirma que no eres un robot»;
                           │                              el siguiente envío lleva { version: 'v2', token del reto }
                           ├─ 422 CAPTCHA_FAILED ──────▶ «no hemos podido verificar…»; reinicia el reto si estaba visible
                           ├─ 503 CAPTCHA_UNAVAILABLE ─▶ «la verificación no está disponible…»
                           └─ resto (400, 409, 429…) ──▶ como hasta ahora
```

- El botón de envío queda deshabilitado mientras el reto v2 está visible y sin resolver.
- El reto conserva **todos** los datos, contraseña incluida: no es un error de lo escrito. `CAPTCHA_FAILED` y `CAPTCHA_UNAVAILABLE` borran la contraseña, como el resto de fallos del servidor.
- Bajo el botón se muestra el aviso de Google («Este sitio está protegido por reCAPTCHA y se aplican la Política de privacidad y las Condiciones del servicio de Google»), con enlaces que se abren en otra pestaña.
- `registrationService` añade los resultados `captchaChallengeRequired`, `captchaFailed` y `captchaUnavailable`.

### D8. Estrategia de pruebas

- **Adaptador real:** tests unitarios con `fetch` simulado y respuestas grabadas con la forma de Google (score alto, score bajo, acción y dominio incorrectos, `timeout-or-duplicate`, `invalid-input-secret`, `500`, timeout, cuerpo inválido); se comprueba la URL, el método y el cuerpo enviados y que se usa el secreto de la versión del token.
- **Falso, configuración, eventos y HTTP:** unitarios y de ruta con Supertest; integración con `realApp` y el falso.
- **Frontend:** `RegisterPage` con un cliente falso controlado por el test; el cliente real con un `grecaptcha` simulado en `window`.
- **E2E:** backend con el verificador falso y frontend con el cliente falso. El flujo del reto se prueba de verdad: `cy.intercept` cambia el token del primer envío por `fake-low-score`, el formulario muestra el reto simulado, se pulsa y el segundo envío llega al backend y da `201`. `CAPTCHA_FAILED` y `CAPTCHA_UNAVAILABLE` cambiando el token por `fake-fail` y `fake-unavailable`.
- **Claves reales:** spike al principio (D1) y prueba manual con `curl` y navegador al final, si las claves están disponibles.

### D9. Interacción con el límite de intentos

El limitador de US01_d sigue siendo el paso 1: cuenta cada envío, también los de score bajo y los del reto. Quien recibe el reto gasta dos de sus 5 intentos; se considera aceptable y se documenta en la historia. Un fallo del script en el navegador (D7) no llega al backend y no gasta intentos.

## Risks / Trade-offs

- **[Las claves nuevas pueden exigir la API de evaluaciones de Google Cloud]** → spike al principio y adaptador aislado detrás del puerto; si cambia, se actualiza el diseño antes de seguir.
- **[Dependencia de la creación de claves por el responsable]** → todo el cambio se implementa y prueba con los falsos; la prueba con claves reales es la última barrera antes de publicar.
- **[Privacidad: reCAPTCHA envía datos a Google y puede fijar cookies]** → aviso en el formulario y carga del script solo en el registro; la valoración de si hace falta consentimiento queda pendiente para quien lleve la parte legal, antes de publicar.
- **[Bloqueadores de anuncios o redes que bloquean Google]** → mensaje de indisponibilidad claro sin gastar intentos; el registro no es posible sin captcha, por diseño.
- **[Usuarios con score bajo gastan dos intentos]** → aceptable con 5 intentos cada 15 minutos (D9).
- **[Tests que registraban sin `captcha`]** → pasan a recibir `422 CAPTCHA_FAILED` en lugar de `400`; se revisan en las tareas.
- **[Coste]** → gratuito hasta 10.000 evaluaciones al mes, muy por encima del volumen de altas de colegios.

## Migration Plan

1. Sin migración de base de datos.
2. Variables nuevas: en local y E2E no se definen (se usan los falsos). En producción, `despliegue-aws` debe proveer `RECAPTCHA_V3_SECRET` y `RECAPTCHA_V2_SECRET` (cifrados) y las claves de sitio en el build del frontend; sin los secretos el backend no arranca.
3. Reversión: revertir el commit; el puerto y el contrato no cambian de forma incompatible (solo se añade `CAPTCHA_UNAVAILABLE`).

## Open Questions

- ¿Admiten las claves creadas en Google Cloud el endpoint `siteverify`? El spike (D1) no pudo resolverlo porque aún no existen claves propias: solo se ha probado la ruta v2 con la clave de prueba pública de Google. Probar con una clave v3 (score) y otra v2 propias es requisito previo a publicar; si `siteverify` no las admite, solo cambia `RecaptchaCaptchaVerifier` (API de evaluaciones de Cloud).
- ¿Exige reCAPTCHA consentimiento del usuario en este contexto? Pendiente de quien lleve la parte legal antes de publicar.
