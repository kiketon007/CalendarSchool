## Context

US01_b crea el colegio y el administrador y responde `201` sin sesión. El backend no tiene todavía ninguna noción de autenticación: no hay JWT, cookies, middleware de autenticación ni `JWT_SECRET` en `loadConfig`. US01_c añade la primera infraestructura de sesión y la reutilizarán el inicio de sesión (US02) y el cierre de sesión (US03), por lo que el diseño debe dejar listos la revocación y la renovación.

Estado de partida relevante:

- `RegisterSchool` (`application/registration/`) orquesta captcha → validación → duplicados → `RegistrationRepository.createSchoolWithAdmin` (transacción) y devuelve usuario y colegio.
- `authRouter` monta `POST /register`; `createApp` recibe los casos de uso ya construidos y solo `server.ts` lee `process.env`.
- `docs/Modelo_de_Datos/MODELO_DATOS.md` describe `refresh_tokens` con `userId` entero y `isRevoked`; la nota del módulo 1 dice que US01_c la revisa.
- Frontend y API comparten origen gracias al proxy de Vite (`dev` y `preview`); en producción (S3/CloudFront + API Gateway) el origen puede ser distinto, y lo resuelve `despliegue-aws`.

Historia de referencia: US01_c (CA1) de `docs/User_Stories_MVP.md`, PRD §3.1.

## Goals / Non-Goals

**Goals:**

- Iniciar la sesión al registrar: cookie de refresh (`HttpOnly`, `Secure`, `SameSite=Lax`, 24 h) y access JWT de 15 min en memoria.
- Persistir los refresh tokens de forma revocable, para que US03 solo tenga que marcarlos como revocados.
- Permitir que la sesión sobreviva a una recarga con `POST /api/auth/refresh`.
- Redirigir a una página provisional `/onboarding` y avisar si las cookies están deshabilitadas.

**Non-Goals:**

- Inicio y cierre de sesión (US02, US03), rotación de refresh tokens, límite de sesiones simultáneas y limpieza de tokens caducados.
- Middleware que exija el access token en rutas protegidas: no existe todavía ninguna ruta protegida. Lo introduce la primera historia que la necesite, reutilizando `TokenIssuer.verify`.
- Pantalla real de Onboarding (US04).

## Decisions

### D1. Refresh token opaco, persistido y revocable

El refresh token es una cadena aleatoria de 32 bytes (`crypto.randomBytes`, codificada en base64url). En base de datos solo se guarda su hash SHA-256 (`token_hash`, `CHAR(64)`, único). Como el token ya tiene 256 bits de entropía, no hace falta Bcrypt: un hash rápido permite buscarlo por igualdad con el índice único.

Tabla `refresh_tokens` (Prisma `RefreshToken`):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (PK) | UUIDv7 de la aplicación |
| `userId` | UUID, FK → `users.id` | índice |
| `tokenHash` | CHAR(64), único | SHA-256 en hexadecimal |
| `expiresAt` | TIMESTAMPTZ | creación + 24 h; índice para una limpieza futura |
| `revokedAt` | TIMESTAMPTZ, nulo | sustituye a `isRevoked`: indica también cuándo se revocó |
| `userAgent` | VARCHAR(512), nulo | auditoría |
| `ipAddress` | VARCHAR(45), nulo | auditoría |
| `createdAt` | TIMESTAMPTZ | por defecto `now()` |

Alternativas descartadas:

- *JWT sin estado como cookie:* no se puede revocar, y sin revocación el cierre de sesión de US03 no cerraría nada. Por eso se resolvió crear la tabla en esta parte.
- *Guardar el token en claro:* una fuga de la base de datos daría sesiones válidas.
- *Hash Bcrypt del token:* innecesario con 256 bits de entropía y obligaría a buscar por usuario en lugar de por índice único.

### D2. Access token: JWT HS256 firmado con `jose`

El access token es un JWT HS256 de 15 min con `sub` (id de usuario), `schoolId` y `role`, firmado con `JWT_SECRET`. Se usa `jose` por ser JavaScript puro, sin dependencias nativas, compatible con AWS Lambda. Solo lo emite `POST /api/auth/refresh` (D5): el registro no devuelve access token. Se expone detrás de un puerto `TokenIssuer` (`issueAccessToken`, `verifyAccessToken`) de la capa de aplicación; el adaptador `JoseTokenIssuer` vive en `infrastructure/`. `verifyAccessToken` se implementa y prueba aquí, aunque ninguna ruta lo use todavía, para que el contrato quede fijado.

`JWT_SECRET` es obligatorio, de al menos 32 caracteres, y lo valida `loadConfig` (el mensaje de `ConfigError` nunca muestra su valor). En producción llega desde SSM/Secrets Manager (`despliegue-aws`).

Alternativa descartada: RS256. Exige gestionar un par de claves y no aporta nada mientras el único verificador sea el propio backend.

### D3. Cookie de sesión

- Nombre `refresh_token`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Max-Age=86400` y `Path=/api/auth`, de modo que el navegador solo la envíe a los endpoints de autenticación.
- `Secure` se activa siempre. Chrome y Firefox lo aceptan sobre `http://localhost` (contexto seguro); Safari no, y queda como limitación conocida del desarrollo local.
- La construcción de la cabecera (`Set-Cookie`, y su borrado) vive en `presentation/auth/sessionCookie.ts`; el dominio y la aplicación no saben que existen las cookies. La lectura usa el paquete `cookie`, que Express ya trae como dependencia transitiva y pasa a ser explícito.
- Las respuestas que fijan la cookie o devuelven un access token llevan `Cache-Control: no-store`.
- Alternativa descartada: el prefijo `__Host-refresh_token`, que impide que un subdominio inyecte la cookie. Exige `Path=/`, de modo que la cookie viajaría con todas las peticiones a la API; hoy no hay subdominios que la amenacen, así que se prefiere limitarla a `/api/auth`. Se reconsiderará si `despliegue-aws` sirve la aplicación bajo un dominio compartido.

### D4. Atomicidad: el refresh token se crea en la misma transacción que el alta

`RegistrationRepository.createSchoolWithAdmin` recibe un tercer argumento, el registro del refresh token, y lo inserta con el colegio y el usuario en la misma transacción. Así nunca queda un usuario recién creado sin sesión por un fallo intermedio. El caso de uso genera el token y su hash antes de abrir la transacción. El alta no emite access token: el frontend lo obtiene después con `POST /api/auth/refresh` (D9).

Alternativas descartadas:

- *Emitir la sesión tras el alta en una segunda operación:* si fallase, habría un `201` sin sesión o un `500` con la cuenta ya creada y un reintento que devuelve `409`.
- *Un servicio de sesión llamado desde la transacción:* acoplaría el repositorio de registro con el de sesión; se prefiere un único repositorio transaccional.

Consecuencia: `RegistrationRepository` conoce el concepto de refresh token. Es aceptable porque el alta de un usuario incluye, por requisito, su primera sesión.

### D5. `POST /api/auth/refresh`

Caso de uso `RefreshSession` (aplicación): busca el hash en `RefreshTokenRepository.findByHash`, comprueba que existe, no está revocado (`revokedAt` nulo), no ha caducado y que el usuario sigue `ACTIVE`, y emite un access token nuevo. No rota el refresh token: la sesión dura 24 h desde el alta, tal como pide la historia. Cualquier fallo lanza `InvalidSession` (`401`, `INVALID_SESSION`), sin distinguir la causa al cliente; la causa (`reason`: `MISSING`, `UNKNOWN`, `REVOKED`, `EXPIRED`, `USER_INACTIVE`) solo va al log, en el evento `SESSION_REFRESH_FAILED`. Cuando falla, la respuesta borra la cookie. El éxito registra `SESSION_REFRESHED`; ambos eventos llevan IP y user agent y nunca el token.

La respuesta `200` devuelve `session` (`accessToken`, `expiresIn`), el usuario (`id`, `email`, `firstName`, `lastName`, `role`) y su colegio (`id`, `name`), para que el frontend muestre la sesión tras el registro o una recarga sin otra llamada. Es la única operación que emite access tokens: el registro solo fija la cookie, y el inicio de sesión de US02 podrá seguir el mismo patrón.

Alternativa descartada: devolver también `session` en el `201` del registro. Como el frontend llama siempre a `refresh` tras el alta para comprobar la cookie (D9), ese token se descartaría al instante; mantenerlo ensancharía el contrato y daría dos caminos para obtener la sesión.

### D6. Protección CSRF de `refresh`

`SameSite=Lax` ya impide que un POST iniciado desde otro sitio lleve la cookie, pero se añade defensa en profundidad con un guard `requireAllowedOrigin` (en `presentation/http/`) que exige que la cabecera `Origin` coincida con `APP_ORIGIN`. Si falta o no coincide, responde `403` con `ORIGIN_NOT_ALLOWED` sin tocar la base de datos. `APP_ORIGIN` es una variable de entorno nueva y obligatoria (URL con esquema y host, sin ruta) que valida `loadConfig`; el E2E la apunta a su `vite preview`.

Se descartó comparar `Origin` con `Host`: detrás del proxy de Vite y de API Gateway el `Host` recibido no es fiable, y la configuración explícita deja claro qué orígenes se aceptan. También se descartó un token CSRF: no hay formularios renderizados por el servidor, y `SameSite=Lax` junto con la comprobación de origen cubre el vector. El registro (`POST /register`) no emite ni usa una cookie previa, por lo que no necesita el guard y tampoco hay riesgo de fijación de sesión: el identificador de sesión se genera siempre en el servidor tras el alta y nunca se acepta del cliente.

CORS no se activa: frontend y API comparten origen en desarrollo, E2E y, según `despliegue-aws`, en producción. Si ese cambio decide otro origen, activará CORS con credenciales y `APP_ORIGIN` como única entrada permitida.

### D7. Capas y piezas nuevas

```
domain/session/
  refreshToken.ts               # entidad y regla de vigencia (refreshTokenStatus: USABLE | REVOKED | EXPIRED)
  refreshTokenRepository.ts     # puerto: findByHash
  sessionErrors.ts              # InvalidSession
application/session/
  tokenIssuer.ts                # puerto: issueAccessToken / verifyAccessToken
  refreshTokenGenerator.ts      # puerto: generate() → { token, hash }; hash(token)
  createSession.ts              # genera el refresh token, su hash y su caducidad (lo usa RegisterSchool)
  refreshSession.ts             # caso de uso de /refresh
infrastructure/
  joseTokenIssuer.ts, cryptoRefreshTokenGenerator.ts
  prisma/prismaRefreshTokenRepository.ts, prismaRegistrationRepository.ts (amplía el alta)
presentation/
  auth/authRouter.ts            # añade POST /refresh y fija la cookie en /register
  auth/sessionCookie.ts
  http/requireAllowedOrigin.ts
```

Las dependencias apuntan al dominio: la aplicación define los puertos y la infraestructura los implementa. `server.ts` los cablea y `createApp` recibe `registerSchool` y `refreshSession` ya construidos. Los tests de `app.test.ts` usan dobles (`test/support/appDoubles.ts`).

### D8. Contrato (`docs/api-spec.yml`)

- `201` de `POST /api/auth/register`: el cuerpo no cambia; la respuesta documenta las cabeceras `Set-Cookie` de `refresh_token` y `Cache-Control: no-store`. Cambio compatible.
- Nuevo `POST /api/auth/refresh` (público, `security: []`, requiere la cookie): `200` con `session`, el usuario y su colegio; `401 INVALID_SESSION`; `403 ORIGIN_NOT_ALLOWED`; `500` y `503` comunes.
- `INVALID_SESSION` y `ORIGIN_NOT_ALLOWED` se añaden a la vez a `ErrorCode` y a `ERROR_CODES` (`appError.test.ts` falla si no coinciden). Se regenera `frontend/src/api/generated/schema.ts`.

### D9. Frontend

- `session/SessionProvider` (contexto de React) guarda el access token y el usuario en memoria, nunca en `localStorage` ni `sessionStorage`. Al montar intenta una vez `POST /api/auth/refresh`, con un estado `loading | authenticated | anonymous`; protege la doble ejecución del efecto en `StrictMode` para no gastar dos veces la llamada. Un `401` deja la sesión en `anonymous` sin mostrar error.
- `services/sessionService.ts` envuelve `fetch` con `credentials: 'same-origin'` e interpreta la respuesta por `error.code`, como `registrationService`.
- `RegisterPage`: tras el `201` llama a `refresh` a través del contexto de sesión, lo que obtiene el access token y a la vez comprueba que el navegador aceptó la cookie. Si esa llamada devuelve `401 INVALID_SESSION`, muestra inline el aviso de que se necesitan cookies para mantener la sesión y no redirige (la cuenta ya está creada; el aviso lo explica). Si funciona, la sesión queda `authenticated` y navega a `/onboarding`. Se eligió esta sonda porque `navigator.cookieEnabled` no es fiable cuando el navegador bloquea cookies de terceros o aplica reglas por sitio.
- `/onboarding` es provisional: muestra un mensaje de bienvenida con el nombre del usuario y del colegio. Mientras la sesión carga muestra un indicador; si es anónima redirige a `/registro`, porque `/login` aún no existe (US02). US04 sustituirá el contenido.
- Todos los textos van en `es.json` y `en.json`.

## Risks / Trade-offs

- **[Cookie `Secure` en Safari local]** → documentarlo en el README; el E2E y el desarrollo habitual usan Chrome/Firefox/Electron, que aceptan `Secure` en `localhost`.
- **[Sin rotación del refresh token, un robo da acceso 24 h]** → la cookie es `HttpOnly` y el token es revocable; la rotación y la detección de reutilización se valoran con US02/US03.
- **[`APP_ORIGIN` mal configurado bloquea el refresh]** → `ConfigError` si falta o no es una URL válida, mensaje claro del `403` en los logs y valor de ejemplo en `.env.example`; los E2E lo cubren.
- **[La llamada a `refresh` tras el registro añade una petición]** → es ligera, detecta cookies rechazadas de forma fiable y es la única forma de obtener el access token, así que no hay ninguna petición redundante.
- **[Tabla de tokens que crece]** → `expiresAt` queda indexado para una limpieza programada futura, fuera de este cambio.
- **[`RegistrationRepository` más ancho]** → se acepta por la atomicidad (D4); se cubre con tests de integración de reversión.
- **[Tests existentes de `registerSchool` y de integración]** → todos deben actualizarse al nuevo resultado y a las nuevas dependencias.

## Migration Plan

1. Migración Prisma aditiva (`refresh_tokens`); no toca datos existentes. Se aplica con `npm run db:migrate`.
2. Añadir `JWT_SECRET` y `APP_ORIGIN` a `backend/.env.example`, al `.env` local y a `scripts/e2e.mjs` (el workflow de CI arranca el backend solo a través de ese script). Sin ellas el backend no arranca (`ConfigError`).
3. Reversión: revertir el commit y borrar la tabla con una migración nueva. No hay datos de usuario que migrar.
4. El registro sigue sin poder publicarse en producción hasta US01_d, US01_e y US01_f.

## Open Questions

- Ninguna bloqueante. `despliegue-aws` decidirá el origen del frontend en producción (y con él, si hace falta CORS con credenciales) y el almacén del `JWT_SECRET`.
