## Context

El backend emite access tokens (JWT HS256 de 15 minutos con `sub`, `schoolId`, `role` y `sid`) desde `POST /api/auth/refresh`, y `TokenIssuer.verifyAccessToken` ya sabe verificarlos (solo HS256, forma validada con Zod), pero ningún endpoint los exige. La decisión B de US03 fija que el middleware de los endpoints protegidos leerá la sesión `sid` en cada petición, y la exploración de US02_b decidió además que el rol y el colegio salen de la base de datos, no del token (ver «Decisiones tomadas» de US02_b en `docs/User_Stories_MVP.md`).

En el frontend, `SessionProvider` guarda en memoria `SessionData` (access token, usuario y colegio) y expone `refresh()`, que ya descarta respuestas superadas; ningún servicio envía todavía el access token. Las rutas están al mismo nivel en `App.tsx`, `OnboardingPage` hace su propia guarda y `AppHeader` decide por sí misma si pintarse.

Restricciones: en producción la base de datos se alcanza por el *pooler* de Supabase en modo transacción (nada de estado de sesión de PostgreSQL); `createApp` no lee `process.env`; todo error de dominio se traduce en `errorHandler.ts`; el contrato se cambia primero en `docs/api-spec.yml`.

## Goals / Non-Goals

**Goals:**
- Un mecanismo de autenticación y autorización reutilizable por todos los endpoints protegidos que vengan después.
- Que la revocación de una sesión, la baja de un usuario y el cambio de rol surtan efecto en la siguiente petición.
- Que el aislamiento por colegio sea difícil de olvidar.
- Un cliente HTTP autenticado y una estructura de rutas protegidas que las siguientes pantallas solo tengan que usar.
- `GET /api/users` y la página `/usuarios` como primer consumidor.

**Non-Goals:**
- Acciones sobre usuarios, invitaciones y la regla del último administrador (US02_b2–b4).
- Quitar `role` y `schoolId` de los claims del token.
- Caché de sesiones en el backend, renovación proactiva del token en el frontend y la navegación definitiva (US04).

## Decisions

### D1. Autenticación como caso de uso en `application/authentication/`, con el puerto de refresh tokens existente

`AuthenticateRequest.execute(accessToken)` verifica el token con `TokenIssuer.verifyAccessToken` y lee la sesión con un método nuevo **`RefreshTokenRepository.findById(id)`**, que devuelve el mismo `RefreshTokenWithOwner` que `findByHash` (token, usuario y colegio). Después aplica, en este orden: sesión inexistente → `SESSION_NOT_FOUND`; `token.userId !== claims.userId` → `SESSION_USER_MISMATCH`; `refreshTokenStatus(token, now)` (la misma regla de dominio que usa `RefreshSession`) → `SESSION_REVOKED` o `SESSION_EXPIRED`; `user.status !== 'ACTIVE'` → `USER_INACTIVE`. Devuelve `AuthenticatedUser { userId, schoolId, role, sessionId }` tomado de `user` y `school`, nunca de los claims. Los rechazos lanzan el `InvalidSession` existente con su causa (`TOKEN_INVALID` cuando falla la verificación), que `errorHandler` ya traduce a `401 INVALID_SESSION`.

- *Alternativa descartada:* un puerto nuevo `SessionLookup` (como proponía la historia enriquecida). Leería la misma tabla con el mismo adaptador y duplicaría la carga del usuario y del colegio; añadir `findById` al puerto existente reutiliza `PrismaRefreshTokenRepository`, su `translateDatabaseErrors` y la regla `refreshTokenStatus`.
- *Alternativa descartada:* hacer la comprobación en el middleware de Express. La lógica de vigencia es de aplicación y debe probarse sin HTTP, como `RefreshSession`.
- `findById` es un `findUnique` por clave primaria con `include` del usuario y su colegio: una sola consulta. Un fallo de conexión es `DatabaseUnavailable` (`503`), nunca `401`.

### D2. Middleware `requireAuthentication` y accesor tipado

`presentation/http/requireAuthentication.ts` crea un middleware a partir de `authenticateRequest`: extrae el token con la expresión `^Bearer ([^\s]+)$` (sin cabecera o sin coincidencia → `InvalidSession('TOKEN_MISSING')` sin llamar al caso de uso), ejecuta `AuthenticateRequest` y guarda el resultado en `res.locals.auth`. `getAuthenticatedUser(res)` lo devuelve tipado y lanza un error de programación si un handler protegido se monta sin el middleware. Ningún handler lee `req.headers.authorization`.

- *Alternativa descartada:* ampliar el tipo `Request` de Express con *declaration merging* (`req.user`). Cambia el tipo global de todas las rutas, incluidas las públicas, donde el valor no existe; el accesor sobre `res.locals` falla de forma explícita.
- El propio middleware añade `WWW-Authenticate: Bearer` a la respuesta antes de pasar el `InvalidSession` a `errorHandler`, que lo traduce a `401 INVALID_SESSION` como siempre. Así los `401` de `/api/auth/refresh` (que se autentica con cookie) no cambian y `errorHandler` no necesita marcar el error.
- El log de `AUTHENTICATION_REJECTED` (`info`, con `reason`) lo emite el middleware al capturar el `InvalidSession`, porque es el único que conoce la ruta; nunca incluye la cabecera.

### D3. Autorización con `requireRole(role)` y error de dominio `Forbidden`

`presentation/http/requireRole.ts` recibe el rol exigido, lee la identidad con `getAuthenticatedUser(res)` y, si no coincide, registra `AUTHORIZATION_DENIED` (`warn`, con `userId`, `schoolId`, rol actual y exigido) y lanza `Forbidden` (`application/authentication/forbidden.ts`), que `errorHandler` traduce a `403 FORBIDDEN`. Se monta siempre después de `requireAuthentication`, lo que garantiza `401` antes que `403`.

- *Alternativa descartada:* que cada caso de uso compruebe el rol. Repetiría la misma comprobación en cada operación de administrador; la guarda declarativa en el router se ve al leer la ruta. Las reglas de negocio que dependen del rol de otro usuario (el último administrador de US02_b2) sí irán en el caso de uso.

### D4. Aislamiento: `schoolId` en la firma del puerto

`SchoolUserRepository.listBySchool(schoolId: string)` (en `domain/user/`) recibe el colegio como parámetro obligatorio, y el router lo pasa desde `getAuthenticatedUser(res).schoolId`. `ListSchoolUsers.execute({ schoolId })` no recibe nada que venga del cliente. La misma convención (el colegio es el primer parámetro de todo método de lectura o escritura de datos del colegio) se aplicará a los repositorios siguientes.

- *Alternativa descartada:* un filtro global en el cliente Prisma (extensión con `$extends` que añada `schoolId` a cada consulta). Es invisible al leer el código, difícil de probar y no encaja con el patrón de puertos.

### D5. `GET /api/users`

`PrismaSchoolUserRepository.listBySchool` hace un `findMany` con `where: { schoolId, status: { in: ['ACTIVE', 'SUSPENDED'] } }` y `select` explícito de los siete campos, y ordena el resultado en la aplicación por apellidos, nombre y email con `localeCompare(…, 'es')`, como `PrismaMunicipalityRepository`. El `select` explícito impide que el hash de la contraseña o el consentimiento salgan aunque se añadan columnas. El router (`presentation/users/usersRouter.ts`) monta `requireAuthentication`, `requireRole('ADMIN')` y el handler, y serializa `createdAt` con `toISOString()`. Usa el índice `users_school_id_idx` existente.

- *Orden:* se hace en la aplicación porque la intercalación de PostgreSQL depende de cómo se creó la base de datos (en Supabase y en Docker no ordena las vocales acentuadas como el castellano) y el proyecto ya lo resuelve así para los municipios. *Alternativa descartada:* `orderBy` de Prisma, que delegaría el orden en la colación de la base de datos.

### D6. Cliente autenticado en el frontend

`session/authorizedFetch.ts` exporta `createAuthorizedFetch({ getAccessToken, refresh })`, una función con la misma firma que `fetch` que añade la cabecera `Authorization` y aplica la renovación: ante un `401` con `INVALID_SESSION`, llama a una renovación compartida (una promesa en curso reutilizada por todas las peticiones que la piden mientras no termina) y, si el resultado es `authenticated`, repite la petición una vez con el token nuevo. `SessionProvider` la crea y la expone en el contexto como `authorizedFetch`; los servicios la reciben por parámetro (`usersService.list(authorizedFetch)`), igual que ya reciben `fetch` implícito, para poder probarlos con un doble.

- *Alternativa descartada:* un interceptor global sobre `window.fetch`. Afectaría a las peticiones públicas y a las de reCAPTCHA.
- *Alternativa descartada:* renovar de forma proactiva antes de los 15 minutos con un temporizador. Añade estado y casos de pestañas en segundo plano; la renovación reactiva cubre CA8 con una petición extra cada 15 minutos.
- La renovación compartida vive dentro de `SessionProvider` (envuelve `refresh()`), de modo que también la usan las renovaciones que no vengan del cliente; `refresh()` sigue ignorando respuestas superadas y el contador de `logout()` sigue invalidándolas.

### D7. Rutas: `AuthenticatedLayout` y `RequireRole` en `frontend/src/routes/`

`App.tsx` declara las rutas públicas al primer nivel y una ruta sin `path` con `element={<AuthenticatedLayout/>}` cuyas hijas son `/onboarding` y una segunda ruta sin `path` con `element={<RequireRole role="ADMIN"/>}`, hija de la cual cuelga `/usuarios`. `AuthenticatedLayout` aplica la guarda (indicador `role="status"`, `<Navigate to="/login" replace/>` o cabecera, navegación y `<Outlet/>`); `AppHeader` se monta dentro del layout y pierde su comprobación de sesión (recibe los datos por el contexto como ahora). `RequireRole` lee el rol de la sesión y devuelve `<Navigate to="/onboarding" replace/>` o `<Outlet/>`. `OnboardingPage` conserva solo el contenido.

- Consecuencia aceptada: con sesión, las páginas públicas (`/`, `/privacidad`) ya no muestran la cabecera (delta de `user-logout`). Mostrarla exigiría un segundo layout o mantener la cabecera fuera de las rutas, con su guarda propia.
- La navegación es una lista de enlaces dentro de la cabecera con un único elemento, «Usuarios», visible solo con rol `ADMIN`. US04 la sustituirá.

### D8. `UsersPage` y `usersService`

`usersService.list(authorizedFetch)` devuelve un `UsersOutcome`: `{ status: 'loaded', users }` con `200`, `forbidden` con `403 FORBIDDEN`, `unauthenticated` cuando la sesión se ha perdido y `unavailable` con todo lo demás (incluidos `503`, red y cuerpos inesperados). Nunca lanza. `UsersPage` pide la lista al montar y al pulsar «Reintentar»; con `forbidden` llama a `refresh()` y navega a `/onboarding` con `replace`; con `unauthenticated` no hace nada, porque el layout ya redirige al pasar la sesión a `anonymous`. La fecha se formatea con `Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })`, y el rol y el estado con las claves `users.role.*` y `users.status.*`.

### D9. Contrato

`docs/api-spec.yml`: `components.securitySchemes.bearerAuth` (`type: http`, `scheme: bearer`, `bearerFormat: JWT`); `GET /api/users` con `security: [{ bearerAuth: [] }]` y respuestas `200` (`SchoolUserListResponse`, con `SchoolUser` y sus enums `UserRole` y `UserStatus`), `401` (`$ref Unauthorized`), `403` (`$ref Forbidden`), `500` y `503`; `FORBIDDEN` en `ErrorCode`. Los tipos se regeneran con `npm run api:types -w frontend` y `api/schema.test.ts` fija la forma de `SchoolUser`.

### D10. Datos de E2E

`scripts/e2eData.mjs` añade la tarea `createUser({ schoolEmail, email, password, role })`, que inserta un usuario `ACTIVE` en el colegio del administrador indicado, con el hash de Bcrypt calculado con el `BCRYPT_COST` de test. Como `setUserStatus`, se niega a ejecutarse fuera de una base `*_test`. Es provisional hasta que las invitaciones (US02_b4) permitan crear miembros por la interfaz.

## Risks / Trade-offs

- **[Latencia por petición]** cada petición protegida añade una consulta por clave primaria (con dos `JOIN`) a través del *pooler*. → Es el coste asumido con la decisión B; se mide con los logs de duración de la Lambda tras el despliegue y no se introducen cachés, que retrasarían las revocaciones.
- **[Un handler protegido sin middleware]** si alguien monta una ruta sin `requireAuthentication`, quedaría abierta. → `getAuthenticatedUser(res)` lanza si falta la identidad (el handler responde `500`, no datos), y los tests de cada router cubren el `401` sin token.
- **[Olvidar el filtro de colegio]** → `schoolId` obligatorio en la firma de los puertos (D4) y test de integración con dos colegios.
- **[Renovaciones en bucle]** un backend que respondiera siempre `401` podría provocar renovaciones encadenadas. → Un solo reintento por petición (D6) y escenario que lo fija.
- **[Interfaz desactualizada tras un cambio de rol]** la sesión en memoria puede decir `ADMIN` cuando el backend ya responde `403`. → `UsersPage` renueva y redirige ante `forbidden` (D8).

## Migration Plan

No hay migración de datos ni cambio de infraestructura. El despliegue es el habitual (CI → CDK); CloudFront ya reenvía `/api/*` al backend, de modo que `/api/users` no necesita cambios en la distribución. La vuelta atrás es desplegar la versión anterior: ningún dato nuevo depende de este cambio. Tras el despliegue, el smoke test y una comprobación manual de `GET /api/users` con y sin token en producción.

## Open Questions

Ninguna bloqueante. Queda para US04 decidir el contenido definitivo de la navegación y si las páginas públicas muestran la cabecera con sesión.
