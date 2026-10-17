## Context

US02_b1 dejó los cimientos de los endpoints protegidos: `requireAuthentication` lee la identidad (`userId`, `schoolId`, `role`, `sessionId`) de la base de datos en cada petición, `requireRole('ADMIN')` responde `403`, `GET /api/users` lista los usuarios del colegio y `/usuarios` los muestra con `authorizedFetch`. `SchoolUserRepository` solo tiene `listBySchool(schoolId)`, y `PrismaSchoolUserRepository` lee con un `select` explícito de siete campos.

US02_b2 añade las primeras **escrituras** sobre datos de un colegio desde un endpoint protegido. Lo difícil no son las escrituras, sino una invariante entre filas: el colegio debe conservar al menos un `ADMIN` activo, también con peticiones simultáneas. Las decisiones de producto están en `docs/User_Stories_MVP.md` (decisiones «(US02_b2)» de US02_b e historia US02_b2): un endpoint por acción, bloqueo de la fila del colegio, `CANNOT_SUSPEND_SELF`, `USER_NOT_ACTIVE`, idempotencia y `404` sin distinguir casos.

## Goals / Non-Goals

**Goals:**

- Que la regla del último administrador sea imposible de romper, también con peticiones simultáneas, y que su lógica viva en el dominio como función pura.
- Que la baja deje sin acceso al usuario en una sola transacción (estado y sesiones).
- Que el orden de las comprobaciones sea uno solo, explícito y probado, compartido por las tres acciones.
- Que la página `/usuarios` permita las acciones sin recargar la lista y sin envíos duplicados.

**Non-Goals:**

- Una unidad de trabajo genérica para el resto de la aplicación: se introducirá cuando otra historia la necesite.
- Bloqueo optimista (versiones) de los usuarios.
- Eliminar usuarios, invitaciones o restablecer contraseñas.

## Decisions

### D1. Una función pura de dominio decide el cambio: `planUserChange`

`domain/user/userManagement.ts` exporta:

```ts
type UserAction = { type: 'changeRole'; role: UserRole } | { type: 'suspend' } | { type: 'reactivate' };
interface UserChangeSnapshot { actorId: string; target: { id; role; status: 'ACTIVE' | 'SUSPENDED' }; activeAdminCount: number }
type UserChange = { role: UserRole } | { status: 'SUSPENDED'; revokeSessions: true } | { status: 'ACTIVE' };
function planUserChange(action: UserAction, snapshot: UserChangeSnapshot): UserChange | null; // null = sin cambios
```

Aplica en orden: baja propia (`CannotSuspendSelf`), cambio de rol de un `SUSPENDED` (`UserNotActive`), idempotencia (`null`) y último administrador (`LastAdminRequired`: el objetivo es `ADMIN` activo, la acción le quita el rol o lo da de baja y `activeAdminCount <= 1`). El `404` no está aquí: lo resuelve la lectura del objetivo (D3), porque depende de la consulta y no de una regla.

Los errores (`UserNotFound`, `LastAdminRequired`, `CannotSuspendSelf`, `UserNotActive`) viven en `domain/user/userManagementErrors.ts`, y solo `errorHandler` los traduce a HTTP (`404` y `409`), igual que los de registro y login.

*Alternativas descartadas:* repartir la regla entre los casos de uso (duplicaría el orden en tres sitios) o comprobarla en el adaptador de Prisma (lógica de negocio en infraestructura, sin pruebas unitarias).

### D2. Un único caso de uso, `ManageSchoolUser`, para las tres acciones

`application/users/manageSchoolUser.ts` recibe `{ schoolId, actorId, userId, action }`, delega en el repositorio (D3) pasándole `planUserChange` y, **después de la transacción**, registra el evento: `USER_ROLE_CHANGED` (`previousRole`, `newRole`), `USER_SUSPENDED` (`revokedSessions`) o `USER_REACTIVATED`, con `schoolId`, `actorId` y `userId`, solo si hubo cambio. Si captura uno de los tres errores `409`, registra `USER_MANAGEMENT_REJECTED` (`reason` igual al código) y lo relanza. No registra emails ni nombres.

El router expone tres rutas, pero todas llaman al mismo caso de uso con su `action`.

*Alternativa descartada:* tres casos de uso (`ChangeUserRole`, `SuspendUser`, `ReactivateUser`), como sugería la historia enriquecida. Serían tres copias del mismo esqueleto (repositorio, log, relanzar) que solo difieren en la acción y el nombre del evento; el patrón repetido es justo lo que la regla de detección de patrones pide evitar.

### D3. El repositorio aplica el cambio con el colegio bloqueado: `applyChange`

`SchoolUserRepository` añade:

```ts
applyChange(input: {
  schoolId: string; userId: string; now: Date;
  plan: (snapshot: Omit<UserChangeSnapshot, 'actorId'>) => UserChange | null;
}): Promise<AppliedUserChange | null>; // null = el usuario no es del colegio (404)
interface AppliedUserChange { previous: SchoolUser; user: SchoolUser; change: UserChange | null; revokedSessions: number }
```

`PrismaSchoolUserRepository.applyChange`, dentro de un `$transaction` interactivo y de `translateDatabaseErrors`:

1. `$executeRaw\`SELECT 1 FROM schools WHERE id = ${schoolId}::uuid FOR UPDATE\``: bloquea la fila del colegio hasta el final de la transacción. Mismo patrón que el bloqueo de `PrismaAttemptRepository` (`$executeRaw`, porque no se usa el resultado).
2. `user.findFirst({ where: { id: userId, schoolId, status: { in: ['ACTIVE', 'SUSPENDED'] } }, select: FIELDS })`: si no hay fila, devuelve `null` (otro colegio, inexistente o `DELETED`).
3. `user.count({ where: { schoolId, role: 'ADMIN', status: 'ACTIVE' } })`.
4. `plan(...)`: si lanza, la transacción se deshace sin haber escrito nada; si devuelve `null`, termina sin escribir.
5. `user.update` con `role` o `status` y, si `revokeSessions`, `refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })`, cuyo `count` es `revokedSessions`.

La regla vive en el dominio y la atomicidad en el adaptador, sin que la aplicación conozca la transacción. `schoolId` sigue siendo obligatorio en la firma, como en US02_b1. El `actorId` lo añade el caso de uso a la instantánea dentro del `plan`.

*Alternativas descartadas:*

- **Una unidad de trabajo** (`TransactionRunner` con repositorios transaccionales): más general, pero hoy solo hay una operación que la necesite, y obliga a abstraer el cliente de Prisma.
- **Leer y escribir en llamadas separadas del repositorio:** no es atómico.
- **`SERIALIZABLE`:** exige reintentos y es difícil de probar de forma determinista.
- **Un `UPDATE` condicional con subconsulta:** con `READ COMMITTED` dos recuentos ven la misma instantánea.
- **`pg_advisory_xact_lock` por colegio:** funcionaría igual, pero bloquear la fila real es más explícito y no depende de una convención de claves.

### D4. El router valida y traduce; un id que no es un UUID es `404`

`usersRouter` añade `PUT /:id/role`, `POST /:id/suspend` y `POST /:id/reactivate` detrás de las guardas que ya tiene (`requireAuthentication` y `requireRole('ADMIN')` con `router.use`), así que `401` y `403` van antes de cualquier validación. El `id` se valida con `z.uuid()`: si no lo es, lanza `UserNotFound` (`404`), sin llegar a la base de datos, donde el `::uuid` fallaría. El cuerpo de `role` se valida con zod (`{ role: 'ADMIN' | 'MEMBER' }`, estricto) y responde `400 VALIDATION_ERROR` con el formato por campo que ya existe. Las respuestas se serializan con el mismo mapeo que `GET /api/users` (`createdAt` en ISO 8601), extraído a una función compartida del router.

En el contrato, el parámetro `id` se declara `format: uuid` y la descripción del `404` indica que también cubre un identificador mal formado.

### D5. Errores en `errorHandler`

`domainError` añade `UserNotFound` → `404 NOT_FOUND` y `LastAdminRequired`, `CannotSuspendSelf` y `UserNotActive` → `409` con su código. Los tres códigos se añaden a la vez al enum `ErrorCode` del contrato y a `ERROR_CODES` (`appError.test.ts` lo comprueba).

### D6. Frontend: un `UserActionOutcome` y el estado de las acciones en `UsersPage`

- **`services/usersService.ts`** añade `changeRole(fetch, id, role)`, `suspend(fetch, id)` y `reactivate(fetch, id)`, con un intérprete común de la respuesta que devuelve `UserActionOutcome`: `{ kind: 'updated', user }`, `lastAdminRequired`, `cannotSuspendSelf`, `userNotActive`, `notFound`, `forbidden`, `unauthenticated` o `unavailable`. Nunca lanza, y lo desconocido es `unavailable`, como `list`.
- **`UsersPage`** guarda los usuarios en estado (ya lo hace) y añade:
  - `pendingIdsRef: Set<string>`, la guarda síncrona contra el doble clic, más un estado espejo para deshabilitar los botones de la fila.
  - Un único aviso de acciones (`actionError`) encima de la tabla, con `role="alert"`, que se limpia al iniciar otra acción. Es más sencillo y accesible que un aviso por fila, y la fila no cambia, así que no hace falta señalarla.
  - Con `updated`, sustituye la fila por id. Si el id es el de la sesión y el rol nuevo es `MEMBER`, llama a `refresh()`, y `RequireRole` hace la navegación.
  - Con `notFound`, muestra el aviso y vuelve a cargar con la función de carga que ya existe. Con `forbidden`, sigue el camino de la carga (`refresh()` y `/onboarding`).
- **`components/ConfirmSuspendModal.tsx`:** `Modal` de react-bootstrap, con el nombre del usuario en el título, el aviso de cierre de sesiones, «Cancelar» con `autoFocus` y «Dar de baja». El `Modal` devuelve el foco al elemento que lo abrió al cerrarse (`restoreFocus`, activo por defecto).
- **i18n:** `users.actions.*`, `users.confirmSuspend.*`, `users.you` y `users.errors.*` en `es.json` y `en.json`.

*Alternativa descartada:* recargar toda la lista tras cada acción (una petición más y un parpadeo de la tabla, cuando la API ya devuelve la fila actualizada).

## Risks / Trade-offs

- **[Riesgo] Un `$transaction` interactivo retiene una conexión del *pooler* mientras dura.** → Mitigación: la transacción solo hace un bloqueo, dos lecturas por índice y como mucho dos escrituras; no se llama a nada externo dentro de ella (el log va después). Se mantiene el `timeout` por defecto de Prisma.
- **[Riesgo] El bloqueo serializa todas las operaciones de gestión de un colegio.** → Mitigación: son acciones humanas y poco frecuentes; las de otros colegios no esperan.
- **[Riesgo] Un administrador degradado con una petición ya autenticada en vuelo puede terminar esa petición.** → Mitigación: no rompe la invariante, porque el recuento se hace bajo el bloqueo; se acepta que termine.
- **[Riesgo] El test de CA5 (concurrencia) podría ser intermitente.** → Mitigación: el test lanza las dos peticiones con `Promise.all` y comprueba el resultado final (un `200`, un `409` y un `ADMIN` activo), no el orden; el bloqueo lo hace determinista.
- **[Contrapartida] `applyChange` recibe la regla como función:** el repositorio es menos «tonto» que un CRUD, pero evita introducir una unidad de trabajo para una sola operación. Si aparece otra operación con invariantes entre filas, se revisará.
- **[Contrapartida] Sin bloqueo optimista**, una lista desfasada puede mostrar un estado antiguo hasta la siguiente acción. Se acepta: la regla crítica la garantiza el servidor y un `404` recarga la lista.

## Migration Plan

Sin migración de base de datos. Despliegue normal (CI → Lambda y S3/CloudFront); las rutas cuelgan de `/api`, que CloudFront ya reenvía. Para volver atrás basta con revertir el despliegue: no hay datos nuevos ni cambios de esquema.

## Open Questions

Ninguna. Las decisiones de producto se cerraron en la exploración del 2026-10-16.
