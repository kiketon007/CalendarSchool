## Context

La sesión de CalendarSchool (US01_c, US02) tiene dos piezas:

- **Refresh token** opaco en la cookie `refresh_token` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/api/auth`, 24 horas). En `refresh_tokens` solo se guarda su SHA-256. La columna `revoked_at` existe desde US01_c («cierre de sesión, US03») y `refreshTokenStatus()` ya da `REVOKED` cuando está informada, así que `/refresh` rechaza un token revocado sin cambios.
- **Access token** JWT HS256 de 15 minutos (`JoseTokenIssuer`, puerto `TokenIssuer`), emitido solo por `POST /api/auth/refresh` y guardado en la memoria del `SessionProvider`. Hoy **ningún endpoint lo comprueba**: no hay rutas protegidas.

`authRouter` ya sabe borrar la cookie (`clearedRefreshTokenCookie()`). En `/refresh`, la borra ante `InvalidSession` y la conserva ante otros fallos, como la base de datos caída. `Cache-Control: no-store` se fija ruta a ruta en `/register`, `/login` y `/refresh`, y `municipalityRouter` fija `public, max-age=86400`.

En el frontend no hay ninguna interfaz común a las páginas con sesión: `/onboarding` es provisional (US04) y `App.tsx` solo declara rutas.

## Goals / Non-Goals

**Goals:**

- Cerrar la sesión del navegador actual revocándola en el servidor, de forma idempotente y sin dar por cerrada una sesión que sigue válida.
- Fijar el mecanismo con el que se invalidarán los access tokens (decisión B) y dejar listo el dato que necesita (`sid`).
- Una cabecera mínima con el botón, sincronización entre pestañas y respuestas de la API sin caché.

**Non-Goals:**

- El middleware de autenticación de endpoints protegidos y la renovación transparente tras un `401` (primera historia con endpoints protegidos: US02_b o US04).
- Cerrar todas las sesiones de un usuario, el cierre forzado por un administrador (la baja de US02_b lo resolverá revocando los refresh tokens del usuario) y la purga de refresh tokens caducados o revocados.

## Decisions

### D1. Caso de uso `LogOut` en `application/session/`

`LogOut.execute(refreshToken | undefined, context)` reutiliza los puertos que ya usa `RefreshSession`: `refreshTokenGenerator.hash`, `refreshTokenRepository.findByHash` y `refreshTokenStatus()`. Si no hay token, no existe o no es `USABLE`, registra `USER_LOGOUT_WITHOUT_SESSION` con la causa (`MISSING`, `UNKNOWN`, `REVOKED`, `EXPIRED`) y termina sin error. Si es utilizable, llama a `refreshTokenRepository.revoke(id, now)` y registra `USER_LOGOUT`. No devuelve nada: borrar la cookie es cosa del router, porque las capas interiores no saben que existen las cookies (US01_c).

- **Por qué no se comprueba el estado del usuario:** un usuario `SUSPENDED` también debe poder cerrar su sesión. Revocarla es inocuo.
- **Alternativa descartada:** reutilizar `InvalidSession` para los casos sin sesión y capturarla en el router. Lo descarté porque el cierre de sesión no los trata como errores (`204`, nivel `info`), y lanzar para seguir el camino feliz confunde el flujo.

### D2. `revoke` atómico e idempotente en el repositorio

`RefreshTokenRepository.revoke(id: string, revokedAt: Date): Promise<void>` hace `updateMany({ where: { id, revokedAt: null }, data: { revokedAt } })`. Si otra petición la revocó entre la lectura y la escritura, no cambia nada y conserva el primer instante. Los fallos de conexión se traducen con `translateDatabaseErrors` a `DatabaseUnavailable` (`503`).

- **Alternativa descartada:** borrar la fila. Perdería la traza para depurar (un token revocado se distingue de uno inventado: `REVOKED` frente a `UNKNOWN`) y no ahorra nada mientras no exista una purga.

### D3. Ruta `POST /api/auth/logout` en `authRouter`

Va con `requireAllowedOrigin(appOrigin)`, como `/login` y `/refresh`. Llama a `logOut.execute(readRefreshToken(req.get('cookie')), requestContext(req))` y, solo si no lanza, fija `clearedRefreshTokenCookie()` y responde `204`. Si `LogOut` lanza `DatabaseUnavailable`, el `errorHandler` responde `503` y la cookie no se toca. Es el mismo criterio que `/refresh`: se conserva la cookie cuando la sesión puede seguir viva.

- **Sin límite de intentos ni captcha:** no hay nada que adivinar. Un token desconocido da el mismo `204`, y el coste por petición es una consulta por clave única.
- **El body se ignora.** No hace falta `express.json()` específico: el parser global ya acepta un cuerpo vacío.

### D4. Decisión B: el access token lleva `sid` y la sesión se comprobará en cada petición

`AccessTokenClaims` añade `sessionId`, que `JoseTokenIssuer` firma como `sid` y `verifyAccessToken` exige. Un token sin `sid` es `InvalidAccessToken`. `RefreshSession` lo rellena con `found.token.id`. No hay tokens antiguos que migrar que importen: viven 15 minutos, solo en memoria, y nadie los verifica todavía.

El middleware futuro (US02_b o US04) hará `verifyAccessToken` y, con el `sid`, una lectura por clave primaria de `refresh_tokens`. Con eso rechazará la petición si la sesión está revocada o caducada, o si el usuario no está `ACTIVE`.

- **Alternativa descartada A (JWT sin estado):** un token revocado seguiría valiendo hasta 15 minutos. Para el cierre de sesión normal bastaría, pero no para la baja de un usuario (US02_b, CA9) ni para el restablecimiento de contraseña (US02_c, CA4), donde quien tiene la sesión puede ser otra persona.
- **Alternativa descartada (lista de exclusión de `jti`):** el mismo coste por petición que B, más una tabla y una purga.
- **Rendimiento:** una consulta por clave primaria por petición protegida, combinable con la carga del usuario que el middleware necesitará igualmente para el rol actualizado (US02_b, CA8).

### D5. `Cache-Control: no-store` como middleware de `createApp`

Se monta con `app.use('/api', noStore)` en `createApp`, antes de `express.json()`, y fija `Cache-Control: no-store`. Montarlo antes del parser es necesario para cubrir también sus errores (`400 INVALID_JSON`, `413`), además de `notFoundHandler`, el `errorHandler` y el `403` del origen. `municipalityRouter` lo sobrescribe con su `res.set` en la respuesta de éxito. Se quitan los `setHeader('Cache-Control', 'no-store')` de `authRouter`, que pasan a ser redundantes. Sus tests de ruta siguen comprobando la cabecera.

- **Alternativa descartada:** ponerlo ruta a ruta. Es fácil olvidarlo en la próxima ruta, y precisamente las protegidas (US04 en adelante) son las que llevan datos sensibles.
- La respuesta del `requireOriginVerification` (`403` de CloudFront) se monta antes que el router. Es un error sin datos y no necesita la cabecera.

### D6. Frontend: `logout()` en `SessionProvider` y `AppHeader`

- `sessionService.logout(): Promise<LogoutOutcome>` (`'loggedOut' | 'unavailable'`): `fetch` `POST /api/auth/logout` con `credentials: 'same-origin'`. Solo `204` es `loggedOut`; todo lo demás, incluida una excepción de red, es `unavailable`. Nunca lanza, como `sessionService.refresh`.
- `SessionProvider.logout()`: llama al servicio y, con `loggedOut`, invalida cualquier `refresh()` en curso (el contador de peticiones que ya usa para ignorar respuestas superadas), deja el estado en `anonymous` y publica `{ type: 'logout' }` en el canal. Devuelve el resultado para que la interfaz decida.
- `AppHeader` (`components/`), montado en `App.tsx` por encima de `<Routes>`: no se pinta salvo con `authenticated`. Muestra el nombre de la aplicación, el usuario y el colegio, y el botón. El botón usa una `ref` síncrona contra pulsaciones repetidas (patrón de `isSubmittingRef`) y, con `loggedOut`, hace `navigate('/login', { replace: true })`. Con `unavailable` muestra el aviso con `role="alert"`.
- **Por qué navega la cabecera y no el proveedor:** `SessionProvider` no depende del router, y las páginas ya redirigen solas al ver `anonymous` (`OnboardingPage` → `/login`). La navegación explícita evita que una página pública muestre contenido residual y fija el destino (`/login`).

### D7. Sincronización entre pestañas con `BroadcastChannel`

`SessionProvider` abre `new BroadcastChannel('calendarschool:session')` al montarse, solo si `typeof BroadcastChannel !== 'undefined'`, y lo cierra al desmontarse. Al recibir `{ type: 'logout' }` invalida cualquier `refresh()` en curso y pasa a `anonymous` sin llamar al backend. La página de esa pestaña redirige por su propia regla. Un mensaje con otra forma se ignora. El canal no envía nada en la propia pestaña (comportamiento estándar de `BroadcastChannel`).

- **Alternativa descartada:** el evento `storage` de `localStorage`. Obliga a escribir en un almacenamiento que la sesión nunca usa (US01_c) y es más frágil.
- **Sin canal:** la otra pestaña lo descubre en su siguiente renovación, que responde `401`.

### D8. Contrato

`docs/api-spec.yml` añade `POST /api/auth/logout` en el tag de autenticación: sin `requestBody`, con la cookie como parámetro opcional, `204` con la cabecera `Set-Cookie`, y `403` y `503` con `components.responses`. No hay códigos de error nuevos. `Cache-Control` se documenta como cabecera de respuesta común. Los tipos se regeneran con `npm run api:types -w frontend`.

### D9. Conexión cortada por el servidor también es «base de datos no disponible»

`translateDatabaseErrors` (D12 de `us01-b-alta-colegio-usuario`) solo reconocía códigos (`ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND` y `P1000`, `P1001`, `P1002`, `P1008`, `P1017`). La prueba manual con la base de datos parada mostró que, si el servidor acepta la conexión y la corta después (el proxy de puertos de Docker con el contenedor parado; en producción, un reinicio o un corte del *pooler*), `pg` lanza un `Error` **sin código** con el mensaje `Connection terminated unexpectedly`, y la API respondía `500` en lugar de `503` en todos los endpoints (también en `/refresh`). Se reproduce en un test con un servidor TCP que cierra tras recibir el mensaje de arranque.

Se reconoce por el mensaje, porque no hay código, y solo los dos mensajes fijos de `pg`: `Connection terminated unexpectedly` y `Connection terminated due to connection timeout`. Cualquier otro error sin código sigue propagándose como `500`, para no ocultar fallos reales de la aplicación.

*Alternativa descartada:* tratar todo error sin código como indisponibilidad de la base de datos. Convertiría errores de programación en un `503` que nadie investigaría.

## Risks / Trade-offs

- **[Access token aún sin comprobar]** Hasta que exista el middleware, un access token copiado antes del cierre seguiría siendo un JWT válido durante 15 minutos. → Hoy no protege nada (no hay endpoints protegidos) y el middleware nacerá ya con la comprobación del `sid` (D4).
- **[Cierre fallido]** Con `503` el usuario no puede cerrar la sesión hasta que vuelva la base de datos. → Se le dice claramente (CA7) en lugar de fingir el cierre, y la sesión caduca de todas formas a las 24 horas.
- **[Coste de la decisión B]** Una consulta más por petición protegida. → Clave primaria e índice ya existentes. Se puede combinar con la carga del usuario y medir cuando llegue el middleware.
- **[`refresh_tokens` crece]** Las sesiones revocadas o caducadas no se borran. → No contienen datos personales del cliente desde US02. La purga queda anotada como mejora fuera de alcance.
- **[`BroadcastChannel` no disponible]** → Degradación descrita en D7, sin errores.

## Migration Plan

Sin migración de base de datos ni cambios de infraestructura. El despliegue es el habitual por CI al fusionar en `main`. Tras desplegar, se comprueba en producción login → «Cerrar sesión» → `/login` → recargar sin sesión. Para volver atrás basta con desplegar el SHA anterior: los tokens con `sid` no rompen nada, porque el código anterior ignora ese claim.

## Open Questions

Ninguna. Las decisiones de producto (opción B, sin confirmación, cabecera, pestañas y `no-store`) están confirmadas en la historia US03.
