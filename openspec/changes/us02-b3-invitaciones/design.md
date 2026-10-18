## Context

US02_b1 y US02_b2 dejaron los endpoints protegidos (`requireAuthentication`, `requireRole('ADMIN')`, identidad leída de la base de datos), el aislamiento por colegio (`schoolId` obligatorio en los puertos), el `404` uniforme para identificadores ajenos o mal formados, y la página `/usuarios` con `authorizedFetch` y acciones por fila. Las sesiones ya usan tokens opacos de 256 bits guardados como SHA-256 (`CryptoRefreshTokenGenerator`, puerto `RefreshTokenGenerator`).

`MODELO_DATOS.md` diseñó el 2026-10-08 la tabla `access_links`, que comparten las invitaciones (US02_b) y los restablecimientos de contraseña (US02_c). Las decisiones de producto de esta porción están en `docs/User_Stories_MVP.md` (decisiones «(US02_b3)» de US02_b e historia US02_b3): tabla completa, enlace construido por el backend, «pendiente» deducido de las fechas, revocación idempotente, las invitaciones de un administrador dado de baja siguen valiendo, y el hueco hasta US02_b4 se acepta.

## Goals / Non-Goals

**Goals:**

- Crear `access_links` con su forma definitiva, de modo que US02_b4 y US02_c solo añadan código.
- Que el token no se pueda recuperar ni filtrar: solo su hash en la base de datos, solo una respuesta con el enlace y nada en los logs.
- Que «pendiente» tenga una única definición, compartida por el listado, la revocación y, después, la aceptación.
- Reutilizar el generador de tokens de las sesiones sin duplicarlo.

**Non-Goals:**

- La página `/invitacion`, la consulta del enlace, la aceptación y su límite de intentos (US02_b4).
- El código de los restablecimientos (US02_c).
- Purgar enlaces viejos, limitar las pendientes o revocarlas al dar de baja a quien las generó.

## Decisions

### D1. La tabla `access_links` completa en una migración, con el `CHECK` y el índice parcial en SQL

El modelo Prisma `AccessLink` (`@@map("access_links")`, columnas en `snake_case` con `@map`) y el enum `AccessLinkPurpose`, con `role` como `UserRole?`. Tiene las relaciones a `School` y a `User` dos veces (`user` y `createdBy`, con nombres de relación explícitos), sin `onDelete: Cascade` (los usuarios no se borran físicamente) y `@@index([schoolId, purpose])`. Prisma no expresa ni el `CHECK` ni los índices parciales, así que la migración generada se completa a mano con:

```sql
ALTER TABLE "access_links" ADD CONSTRAINT "access_links_purpose_fields_check" CHECK (
  ("purpose" = 'INVITATION' AND "role" IS NOT NULL AND "user_id" IS NULL) OR
  ("purpose" = 'PASSWORD_RESET' AND "user_id" IS NOT NULL AND "role" IS NULL));
CREATE UNIQUE INDEX "access_links_pending_reset_user_key" ON "access_links" ("user_id")
  WHERE "purpose" = 'PASSWORD_RESET' AND "used_at" IS NULL AND "revoked_at" IS NULL;
```

Es el mismo patrón que el `CHECK` del consentimiento de `users`. Un test de integración prueba cada restricción, porque Prisma no las conoce y un `migrate dev` posterior no las borraría, pero tampoco las comprobaría.

*Alternativa descartada:* crear solo la parte de invitaciones. Obligaría a un `ALTER TYPE … ADD VALUE` y a una segunda migración de la misma tabla en US02_c.

### D2. Un único estado de un enlace: `accessLinkStatus`, y la misma regla en SQL

`domain/accessLink/accessLink.ts` define el tipo `AccessLink`, `ACCESS_LINK_TTL_HOURS = 72` y la función pura `accessLinkStatus(link, now)`. Devuelve `USED`, `REVOKED`, `EXPIRED` o `PENDING`, con esa prioridad. Caduca en el instante exacto de `expires_at`, como los refresh tokens. El listado filtra en SQL con la misma regla (`used_at IS NULL AND revoked_at IS NULL AND expires_at > now`), con `now` inyectado desde el caso de uso y no `now()` de la base de datos, para que los tests controlen el reloj. Un test de integración comprueba que el SQL y la función coinciden en el borde.

*Alternativa descartada:* una columna `status` que pase a `EXPIRED`. Exigiría un proceso que la actualice y duplicaría la información de `expires_at`.

### D3. Un puerto genérico para los tokens opacos

El puerto pasa a `application/tokens/secretTokenGenerator.ts` (`SecretTokenGenerator`, con `generate()` → `{ token, hash }` y `hash(token)`). `RefreshTokenGenerator` queda como alias de tipo de él, así que `CreateSession`, `RefreshSession` y `LogOut` no cambian. El adaptador se renombra a `CryptoSecretTokenGenerator` (`infrastructure/cryptoSecretTokenGenerator.ts`, con su test). `composeApp` crea una sola instancia y la pasa a las sesiones y a las invitaciones. Es un refactor mecánico, en su propia tarea y con la suite en verde antes de seguir.

*Alternativas descartadas:* que `CreateInvitation` dependa de `RefreshTokenGenerator` (nombre engañoso), o un segundo adaptador idéntico (duplicación).

### D4. Casos de uso en `application/invitations/` y el enlace construido con `appOrigin`

- `CreateInvitation({ schoolId, actorId, role })` genera el token y guarda el enlace con `id` (UUIDv7), el hash, `expires_at` (`now` + 72 h) y `created_by_id`. Devuelve `{ invitation, url }`, con `url = appOrigin + '/invitacion#' + token`, y registra `INVITATION_CREATED`. `appOrigin` se inyecta desde `config.appOrigin`, la misma variable de `requireAllowedOrigin`. La validación del cuerpo es `parseCreateInvitationRequest`, con el mismo patrón y los mismos códigos que `parseChangeRoleRequest` (que se reutiliza si encaja sin forzarlo).
- `ListPendingInvitations({ schoolId })` devuelve las pendientes con `now`.
- `RevokeInvitation({ schoolId, actorId, invitationId })`: con `null` del repositorio lanza `InvitationNotFound`; con `revoked` registra `INVITATION_REVOKED`; con `notPending` termina sin evento.

Los logs llevan `school_id`, `actor_id`, `invitation_id` y, al crear, `role`. Nunca el token, el hash ni el `url`. Un test lo comprueba serializando las llamadas al logger.

*Alternativa descartada:* que el frontend construya el enlace con `window.location.origin` y el token. El token viajaría suelto y US02_c tendría que repetir la regla en el cliente.

### D5. Repositorio `PrismaAccessLinkRepository`

- `createInvitation(link)`: `create`, con `translateDatabaseErrors`. Una colisión de `token_hash` (prácticamente imposible con 256 bits) se deja como `500`, sin reintento.
- `listPendingInvitations(schoolId, now)`: `findMany` con `purpose: 'INVITATION'` y la regla de pendiente, `orderBy: { createdAt: 'desc' }` y un `select` explícito con `createdBy: { select: { id, firstName, lastName } }`. Nunca lee `token_hash`.
- `revokeInvitation(schoolId, id, now)`:
  1. Un `findFirst` por `id`, `schoolId` y `purpose: 'INVITATION'`. Si no hay fila, devuelve `null`.
  2. Un `updateMany` con `where` que repite la regla de pendiente y `data: { revokedAt: now }`. Si `count` es 1, devuelve `revoked`; si es 0, `notPending`.

  El `updateMany` condicionado hace la revocación atómica: dos revocaciones simultáneas no pisan el primer `revoked_at`. Una aceptación de US02_b4 a la vez tampoco se pisa, porque también condicionará su `UPDATE`.

Todos los métodos reciben `schoolId` obligatorio, salvo la creación, que lo lleva en el propio enlace.

### D6. Router `presentation/invitations/invitationsRouter.ts`

Se monta en `/api/invitations`, con `router.use(requireAuthentication(...), requireRole('ADMIN', logger))`, así que `401` y `403` van antes de validar nada. Las rutas:

- `POST /`: `201`, con `invitation` y `url`.
- `GET /`: `200`.
- `POST /:id/revoke`: `204`. El `id` se valida con `z.uuid()` y, si no es un UUID, se lanza `InvitationNotFound` antes de llegar a la base de datos, como en US02_b2.

`errorHandler` traduce `InvitationNotFound` a `404 NOT_FOUND`. El mapeo de la invitación a JSON (fechas en ISO 8601) es una función del router. El cableado va en `composeApp`, `AppDependencies`, `defaultDependencies` y `appDoubles`.

### D7. Frontend: `InvitationsSection` con su propio estado, dentro de `UsersPage`

- **`services/invitationsService.ts`:** `create(fetch, role)`, `list(fetch)` y `revoke(fetch, id)`. Devuelven `{ status: 'created', invitation, url }`, `loaded`, `revoked`, `notFound`, `forbidden`, `unauthenticated` o `unavailable`. Interpretan por `error.code`, nunca lanzan y lo desconocido es `unavailable`, como `usersService`.
- **`components/InvitationsSection.tsx`:** la sección completa. Pide su propia lista con el patrón de carga única de `UsersPage` (`ref` del intento pedido y `ref` de montado) y tiene sus propios avisos, así que un fallo de las invitaciones no vacía la tabla de usuarios. Recibe de la página la función que lleva a `/onboarding` ante un `403`, para no duplicarla.
- **Guardas:** al generar, `isGeneratingRef`; al revocar, un `Set` de ids en una `ref` con su estado espejo, el patrón de US02_b2.
- **`GeneratedInvitationPanel`:** el enlace en un `<input readOnly>` con su etiqueta, el aviso, «Copiar» y «Hecho». «Copiar» llama a `navigator.clipboard.writeText` dentro de un `try`; si falla o no existe, selecciona el texto del campo (`input.select()`) y muestra el texto de copiar a mano. El enlace solo vive en el estado del componente: no va a `sessionStorage` ni a la URL.
- **Revocar sin confirmación:** la regla de US02_b2 es confirmar solo lo que no se arregla con un clic, y aquí basta con generar otra invitación.

*Alternativa descartada:* ampliar el estado de `UsersPage` con las invitaciones. Mezclaría dos cargas y dos conjuntos de errores en un componente que ya es grande.

## Risks / Trade-offs

- **[Riesgo] La migración tiene SQL escrito a mano que Prisma no conoce.** → Mitigación: tests de integración del `CHECK`, del índice parcial y de la unicidad. Una nota en `MODELO_DATOS.md` y en `backend/CLAUDE.md` advierte de que un cambio posterior del modelo no debe regenerar la tabla sin conservarlos.
- **[Riesgo] Los enlaces generados aún no llevan a ninguna página (hueco hasta US02_b4).** → Mitigación: aceptado (no hay usuarios reales en producción), anotado en el informe de producción.
- **[Riesgo] Copiar al portapapeles depende del navegador.** → Mitigación: la selección del texto como alternativa. Producción es HTTPS (contexto seguro) y en el E2E el portapapeles se simula.
- **[Riesgo] El refactor del generador de tokens toca las sesiones.** → Mitigación: alias de tipo, sin cambios en los casos de uso de sesión, y la suite completa en verde antes de seguir.
- **[Contrapartida] Sin tope de invitaciones ni purga:** las filas crecen sin límite. Son pocas por colegio y solo guardan hashes e ids. Queda como posible endurecimiento y entra en la decisión general de conservación de datos.

## Migration Plan

La migración se aplica con el paso que ya existe en el despliegue (`prisma migrate deploy` contra Supabase en modo sesión) antes de desplegar el backend. Es aditiva (una tabla y un enum nuevos), así que el backend anterior sigue funcionando con ella. Para volver atrás basta con desplegar el SHA anterior; la tabla vacía puede quedarse.

## Open Questions

Ninguna. Las decisiones de producto se cerraron en la exploración del 2026-10-17.
