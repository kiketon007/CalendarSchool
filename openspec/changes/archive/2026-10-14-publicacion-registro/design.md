## Context

US01 está completa y desplegada con `despliegue-aws`, pero el registro está cerrado en producción: la CloudFront Function `api-guard` responde `404 NOT_FOUND` a todo `/api/auth/*`. La documentación dejó para este cambio cuatro condiciones de apertura: la CSP, las claves reales de reCAPTCHA, el consentimiento y los textos legales.

Durante la exploración del 2026-10-13/14 se decidió lo siguiente:

- **El registro no se abre en este cambio.** El refresh token dura 24 horas (`REFRESH_TOKEN_TTL_SECONDS`), no se rota y no hay login hasta US02. Un colegio registrado hoy perdería el acceso mañana, y repetir el registro le daría `409`. La apertura va con el cambio de US02.
- **Spike de claves (2026-10-14), en local con claves de Google Cloud y secretos de 40 caracteres:**
  - `siteverify` acepta el secreto v3: registro `201` desde un navegador real y desde Chrome automatizado. Los dos obtuvieron score alto, así que el reto no saltó solo.
  - El reto v2, pintado a mano con `grecaptcha.render` sobre el mismo `api.js?render=<clave v3>`, produjo un token. `siteverify` lo aceptó con el secreto v2: la respuesta fue `400 VALIDATION_ERROR`, que llega después del captcha.
  - Conclusión: `RecaptchaCaptchaVerifier` sirve tal cual.
- **Dominios observados al enviar el formulario:**
  - `www.google.com`: `api.js`, el iframe `anchor`, `webworker.js` y los `POST` a `api2/reload` y `api2/clr`.
  - `www.gstatic.com`: `recaptcha__es.js`, `styles__ltr.css` y el logo.
  - `fonts.gstatic.com`: la fuente Roboto.
  - Antes del envío no hay ninguna petición a Google: el cliente carga el script en el primer `executeV3`.
- **Decisiones de la persona usuaria:** CSP estricta directamente; casilla de consentimiento con política propia en `/privacidad`, con un borrador que redacta el agente; consentimiento comprobado y guardado en el backend; purga de intentos en este cambio.

Restricciones que se mantienen:
- El cierre de `/api/auth/*` vive solo en la infraestructura (spec `cloud-deployment`).
- La base de producción se alcanza por el *pooler* en modo transacción.
- Los textos visibles van por i18n.
- La validación del registro se comparte con `test-fixtures/registration-fields.json`.

## Goals / Non-Goals

**Goals:**
- Que abrir el registro con US02 consista solo en quitar la condición de `apiGuard.js`, con todo lo demás ya en producción y probado.
- Una CSP estricta, definida en un único sitio y probada en local y en el E2E.
- Un consentimiento demostrable: quién aceptó, cuándo y qué versión del texto.
- Una política de privacidad que diga la verdad sobre el sistema, incluido el plazo de conservación de las IP.

**Non-Goals:**
- Abrir `/api/auth/*`, que va con US02.
- Validar jurídicamente el texto.
- Banner de cookies, informes de CSP, ejercicio de derechos dentro de la aplicación y otro proveedor de captcha.

## Decisions

### D1. El cierre se mantiene y cambia de dueño

`apiGuard.js` no cambia de comportamiento; solo sus comentarios, el de `appStack.ts`, el de `scripts/smoke.mjs` y la spec `cloud-deployment`, que pasan a decir «hasta el cambio que implemente US02». El smoke test sigue esperando `404` en el registro.

- *Alternativa descartada: abrir solo `/api/auth/register` y dejar `refresh` cerrado.* No arregla el problema: sin `refresh` ni login, la sesión del registro tampoco sirve.
- *Alternativa descartada: abrir ya y alargar el refresh token.* Solo retrasa la cuenta huérfana y cambia una decisión de seguridad de US01_c.

### D2. CSP estricta definida en un único fichero JSON

La política vive en `frontend/content-security-policy.json`: un objeto de directiva a lista de fuentes, que el frontend «posee» porque describe lo que el frontend carga.

- `appStack.ts` lo lee en la síntesis con `readFileSync`, igual que ya lee las CloudFront Functions con `FunctionCode.fromFile`. Lo serializa y lo pone en `securityHeadersBehavior.contentSecurityPolicy` de la `ResponseHeadersPolicy` existente, con `override: true`.
- `vite.config.ts` lo lee y lo pone en `preview.headers`, de modo que `vite preview` (E2E y prueba local) sirve la misma cabecera.
- `server.headers` **no** lleva CSP: el servidor de desarrollo de Vite inyecta un script en línea para HMR y React Refresh, y la CSP lo bloquearía.

Directivas iniciales, que se ajustan solo si la validación local (D3) muestra una violación:

| Directiva | Fuentes | Motivo |
|---|---|---|
| `default-src` | `'self'` | Base |
| `script-src` | `'self' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/` | Build de Vite y reCAPTCHA; sin `'unsafe-inline'` ni `'unsafe-eval'` |
| `frame-src` | `https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/` | Iframes `anchor` y del reto v2 |
| `connect-src` | `'self' https://www.google.com/recaptcha/` | `/api` y la telemetría de reCAPTCHA v3: el script que se ejecuta en nuestra página hace `fetch` a `api2/clr`. Se supuso que lo hacía el iframe (y `connect-src 'self'`), pero la validación local (8.6) lo desmintió con 4 violaciones. Los `POST` a `api2/reload` sí los hace el iframe |
| `img-src` | `'self' data:` | Bootstrap usa SVG en `data:` para la flecha del `select`, los iconos de validación y la marca de la casilla |
| `style-src` | `'self'` | Los `style={...}` de React se aplican por CSSOM y no los afecta |
| `font-src` | `'self'` | La Roboto de `fonts.gstatic.com` la carga el iframe de Google |
| `object-src` | `'none'` | |
| `base-uri` | `'self'` | |
| `form-action` | `'self'` | |
| `frame-ancestors` | `'none'` | Coherente con `X-Frame-Options: DENY` |

Solo se aplica al comportamiento por defecto (S3). Las respuestas de `/api/*` son JSON y no ejecutan nada.

- *Alternativa descartada: Report-Only y luego estricta.* La persona usuaria eligió publicar en estricto. La validación local con las claves reales (D3) cubre el riesgo, y el registro sigue cerrado, así que un fallo no afecta a nadie.
- *Alternativa descartada: constante TypeScript compartida.* `infrastructure` importaría código de `frontend` a través de los `tsconfig` de dos workspaces. Un JSON lo leen los dos sin acoplar la compilación.
- *Alternativa descartada: CSP con `nonce` y `'strict-dynamic'`.* Es lo que recomienda Google, pero exige generar un nonce por respuesta, y S3 y CloudFront sirven `index.html` estático. La lista de orígenes de reCAPTCHA es corta y estable.

### D3. Validación de la CSP: local con claves reales, E2E y producción

1. **Local, antes del despliegue:**
   - Build del frontend con las claves de sitio reales en `frontend/.env.production.local`, que no se versiona y solo lee `vite build`.
   - `vite preview` con la CSP y el backend de desarrollo con los secretos reales.
   - Registro completo con resultado `201`, más el reto v2 forzado como en el spike, y cero violaciones en la consola.
   - Después se borra `.env.production.local`, para que el build del E2E no lo recoja.
2. **E2E:** `vite preview` sirve la CSP. Un test comprueba con `cy.request` que la cabecera está y que no hay `Report-Only`. Cypress elimina por defecto la CSP de las páginas que prueba, porque inyecta sus propios scripts. Con `experimentalCspAllowList` se conservan las directivas que no interfieren con Cypress, para detectar violaciones de nuestro propio código (por ejemplo, un `data:` o un estilo nuevo). La lista exacta se fija al implementar (ver Open Questions).
3. **Producción, tras el despliegue:** con el registro cerrado, enviar el formulario carga reCAPTCHA y obtiene el token antes de que CloudFront responda `404`. Se comprueba que no hay violaciones en la consola (escenario «reCAPTCHA permitido»).

### D4. Consentimiento: campo booleano en el contrato y datos en el usuario

- **Contrato:** `privacyPolicyAccepted` es obligatorio y su esquema en `api-spec.yml` es `type: boolean, const: true`. El cliente no envía la versión: el backend guarda la suya, porque frontend y backend se despliegan juntos desde `main` y el backend es la fuente de verdad de qué texto está vigente.
- **Validación:** `registerSchoolRequest.ts` añade `privacyPolicyAccepted: z.literal(true)`. Cualquier valor distinto, ausente incluido, se traduce a `{ field: privacyPolicyAccepted, code: REQUIRED }`. Sigue el orden de US01: límite → captcha → validación. Se añade el campo a `test-fixtures/registration-fields.json`, que recorren el backend y el frontend.
- **Dominio:**
  - `domain/user/user.ts` gana `privacyPolicyAcceptance: { acceptedAt: Date; version: string } | null`. Es opcional porque los usuarios invitados de US02_b aceptarán en otro momento.
  - La constante `PRIVACY_POLICY_VERSION` (en `domain/privacy/privacyPolicy.ts`) es la fecha de la versión del texto en formato `AAAA-MM-DD`.
- **Aplicación:** `RegisterSchool` construye la aceptación con el mismo instante que usa para el alta. `RegistrationRepository.createSchoolWithAdmin` no cambia de firma: la aceptación viaja dentro del `User` y se inserta en la misma transacción.
- **Persistencia:**
  - Migración Prisma con dos columnas que admiten `NULL` en `users`: `privacy_policy_accepted_at timestamptz` y `privacy_policy_version varchar(20)`.
  - Un `CHECK` impone que las dos sean `NULL` o ninguna lo sea.
  - Sin índices: no se consulta por ellas.
  - `MODELO_DATOS.md` se actualiza.
- **Frontend:**
  - `RegisterPage` añade una casilla de react-bootstrap (`Form.Check`), validada con el resto antes de pedir el token v3.
  - Sin marcar, no se llama a `executeV3`, y por tanto no se carga el script de Google.
  - El borrador (`registrationDraft.ts`) no cambia: su lista explícita de campos ya excluye la casilla.
- *Alternativa descartada: el cliente envía la versión que mostró.* Obliga a mantener la versión en dos sitios y a definir qué pasa si no coincide. El despliegue conjunto hace innecesaria la comprobación.
- *Alternativa descartada: tabla `consents` aparte.* Solo hay un consentimiento por usuario y no hay historial que guardar. Si mañana lo hubiera, se migra.

### D5. Página `/privacidad`

- **Página:** `pages/PrivacyPolicyPage.tsx`, con su ruta en `App.tsx`. No usa la sesión ni el captcha.
- **Texto:**
  - Va en `es.json` y `en.json`, bajo `privacyPolicy.*`, con una clave por sección (responsable, datos, finalidad, base jurídica, destinatarios, transferencias, conservación, derechos y cookies), más la fecha de última actualización.
  - Esa fecha MUST coincidir con `PRIVACY_POLICY_VERSION` (ver Risks).
- **Contenido del borrador:** se ajusta a lo que hace el sistema, según la tabla de la exploración.

  | Dato | Para qué | Dónde y cuánto tiempo |
  |---|---|---|
  | Datos del registro | Prestar el servicio | Supabase, Fráncfort |
  | Hash de la contraseña | Acceso a la cuenta | Supabase, Fráncfort |
  | IP | Limitar intentos | Máximo 48 horas en la base y 30 días en las copias (D6) |
  | Cookie técnica `refresh_token` | Mantener la sesión | 24 horas |
  | Datos que recibe reCAPTCHA | Distinguir personas de bots | Google, solo al enviar el registro, con posible transferencia a EE. UU. bajo el Marco de Privacidad de Datos UE-EE. UU. |
  | Copias de seguridad | Recuperación | S3, UE, 30 días |
  | Logs | Operación | CloudWatch, UE, 30 días |

  - **Base jurídica:** ejecución del contrato (art. 6.1.b RGPD) para la cuenta, e interés legítimo (art. 6.1.f) para la seguridad (límite de intentos y reCAPTCHA).
  - **Derechos:** acceso, rectificación, supresión, oposición, limitación y portabilidad, por email, y reclamación ante la AEPD.
- **Lo que solo aporta la persona usuaria:** los datos del responsable (nombre o razón social, NIF, domicilio y email de contacto), marcados en el borrador como `[PENDIENTE: …]`. Una tarea de verificación impide cerrar el cambio con marcadores pendientes.
- *Alternativa descartada: texto en Markdown o HTML estático.* Rompería la regla de que todo texto visible pasa por i18n y la comprobación de `locales.test.ts`.

### D6. Purga diaria de intentos en `backup.yml`

Un paso nuevo del workflow de copias, **antes** del `pg_dump`, ejecuta con `psql`, por la misma cadena de modo sesión que el volcado:

```sql
DELETE FROM rate_limit_attempts WHERE attempted_at < now() - interval '24 hours';
```

Con `set -euo pipefail` y `ON_ERROR_STOP=1`, si la purga falla el workflow falla antes de volcar. Al ir antes del volcado, las copias no contienen intentos de más de 24 horas. Peor caso de permanencia de una IP: casi 48 horas en la base (un intento justo después de la purga, borrado en la purga del día siguiente más un día) y 30 días en las copias. Eso es lo que declara la política.

La regla de 24 horas se documenta junto a las políticas del limitador. Un test unitario comprueba que ninguna política tiene una ventana igual o mayor que 24 horas (escenario «Ventanas más cortas que el plazo»).

- *Alternativa descartada: borrar en cada intento todos los intentos caducados de todas las claves.* Añade contención entre claves distintas, que hoy no se bloquean entre sí (`pg_advisory_xact_lock` por clave). Además, sin tráfico no se borra nada, que es justo el caso de la IP que no vuelve.
- *Alternativa descartada: una regla de EventBridge con una Lambda de purga.* Más infraestructura, permisos y tests para una sentencia `DELETE`. El workflow diario ya existe, ya tiene la cadena de conexión y ya falla de forma visible.
- *Alternativa descartada: `pg_cron` en Supabase.* Es configuración manual fuera del repositorio y difícil de probar.

### D7. Claves de producción y documentación

- **`PUESTA_EN_MARCHA.md`, paso 3:**
  - Explica que las claves se crean en un proyecto de Google Cloud (v3 por score y v2 de casilla, con el dominio `calendarschools.es`) y que sus secretos heredados funcionan con `siteverify`.
  - Sustituye «queda para `publicacion-registro`» por el procedimiento del spike para validar el secreto v2 sin crear datos: el reto pintado desde la consola y un `POST` que debe responder `400 VALIDATION_ERROR`.
  - Con el registro cerrado, ese procedimiento solo se puede hacer en local con las claves de producción, que deben incluir `localhost` en sus dominios. Las comprobaciones contra producción quedan para la apertura con US02.
- **`frontend/.env.example`:** recomienda `.env.development.local`.

## Risks / Trade-offs

- **[Una directiva de la CSP rompe reCAPTCHA en un navegador o versión de Google que no probamos]** → Google publica los orígenes que necesita y son estables. La validación local y la comprobación en producción con el registro cerrado lo detectan sin usuarios afectados. Corregir es cambiar el JSON y redesplegar.
- **[Google cambia sus orígenes o añade uno nuevo]** → el reCAPTCHA del registro fallaría como «verificación no disponible», no de forma silenciosa. El E2E no lo detecta porque usa el cliente falso. Mitigación: el smoke test de la apertura con US02 y la consola en producción.
- **[Cypress elimina la CSP y el E2E deja de vigilarla]** → test explícito de la cabecera con `cy.request`. `experimentalCspAllowList` se configura para conservar todo lo posible (ver Open Questions).
- **[`PRIVACY_POLICY_VERSION` y la fecha de la página se desincronizan]** → un test del backend lee `frontend/src/i18n/es.json` y `en.json` y compara su fecha con la constante. Es el mismo patrón entre workspaces que `test-fixtures/registration-fields.json`.
- **[El borrador legal tiene errores u omisiones]** → está fuera del alcance del agente validarlo. El registro sigue cerrado hasta US02, lo que deja margen para la revisión. La tarea final recuerda que no se abre sin esa revisión.
- **[Contrato incompatible: un cliente sin `privacyPolicyAccepted` recibe `400`]** → solo existe nuestro frontend, que se despliega a la vez, y producción está cerrada.
- **[La purga borra con el rol propietario (`MIGRATION_DATABASE_URL`)]** → es la misma cadena que ya usa el workflow para el volcado. La sentencia es fija y versionada, sin entrada externa.
- **[Usuarios de desarrollo sin aceptación]** → las columnas admiten `NULL`. En producción no hay usuarios, porque el registro está cerrado.

## Migration Plan

1. Merge a `main`. El despliegue aplica la migración, que añade dos columnas con `NULL`, sin bloqueo largo y sin datos que migrar. Después publica el backend, la infraestructura (CSP) y el frontend.
2. Antes o justo después: la persona usuaria actualiza las variables de GitHub `VITE_RECAPTCHA_SITE_KEY_V3`/`_V2` y los parámetros de SSM `RECAPTCHA_V3_SECRET`/`_V2_SECRET` con las claves de producción. El siguiente despliegue o arranque en frío los recoge.
3. Comprobación en producción: cabecera CSP, `/privacidad` y el envío del formulario sin violaciones con `404` de CloudFront.
4. **Rollback:** `workflow_dispatch` de `deploy.yml` con el commit anterior. La migración es aditiva, así que el código anterior funciona con las columnas nuevas. La CSP desaparece con la `ResponseHeadersPolicy` anterior.

## Open Questions

- **Lista exacta de `experimentalCspAllowList` en Cypress (decidido, Cypress 16.1.1):** array con las seis directivas permitidas (`default-src`, `child-src`, `frame-src`, `script-src`, `script-src-elem`, `form-action`). Con `true`, Cypress quitaría esas seis, que son las que vigilan los scripts; el array las conserva. `frame-ancestors` se elimina siempre, así que solo se comprueba con la cabecera (`cy.request`). Falta confirmar en la tarea 8.5 que la página sigue funcionando bajo Cypress con la CSP aplicada; si no, el E2E se limita a comprobar la cabecera y la vigilancia de violaciones queda en la validación local y en producción.
- **`style-src` (resuelto en local):** la validación local (8.6) no mostró ninguna violación de `style-src`, así que no se añade excepción. Se vuelve a comprobar en producción (grupo 14).
- **Datos del responsable del tratamiento:** los aporta la persona usuaria durante la implementación.
