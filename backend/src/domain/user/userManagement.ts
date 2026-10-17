import type { UserRole } from './user.js';
import { CannotSuspendSelf, LastAdminRequired, UserNotActive } from './userManagementErrors.js';

/** Lo que un administrador puede pedir sobre otro usuario (o sobre sí mismo) de su colegio. */
export type UserAction =
  | { readonly type: 'changeRole'; readonly role: UserRole }
  | { readonly type: 'suspend' }
  | { readonly type: 'reactivate' };

/** Lo que la regla necesita saber, leído bajo el bloqueo del colegio. */
export interface UserChangeSnapshot {
  /** Usuario que actúa, tomado de la identidad de la petición. */
  readonly actorId: string;
  readonly target: {
    readonly id: string;
    readonly role: UserRole;
    readonly status: 'ACTIVE' | 'SUSPENDED';
  };
  /** Usuarios `ADMIN` en estado `ACTIVE` del colegio, antes de aplicar el cambio. */
  readonly activeAdminCount: number;
}

/** Cambio que el repositorio debe escribir. */
export type UserChange =
  | { readonly role: UserRole }
  | { readonly status: 'SUSPENDED'; readonly revokeSessions: true }
  | { readonly status: 'ACTIVE' };

/**
 * Decide qué cambio aplicar, o `null` si el usuario ya está como se pide (las acciones son
 * idempotentes). Las comprobaciones van en este orden y la primera que falla decide:
 *
 * 1. baja propia (`CannotSuspendSelf`), aunque haya otros administradores;
 * 2. cambio de rol de un usuario dado de baja (`UserNotActive`), aunque pida el rol que ya tiene;
 * 3. idempotencia (`null`);
 * 4. último administrador (`LastAdminRequired`).
 *
 * El `404` no está aquí: lo resuelve el repositorio al no encontrar al usuario en el colegio.
 *
 * @throws CannotSuspendSelf, UserNotActive o LastAdminRequired
 */
export function planUserChange(
  action: UserAction,
  { actorId, target, activeAdminCount }: UserChangeSnapshot,
): UserChange | null {
  if (action.type === 'suspend' && target.id === actorId) {
    throw new CannotSuspendSelf();
  }
  if (action.type === 'changeRole' && target.status === 'SUSPENDED') {
    throw new UserNotActive();
  }

  const change = changeFor(action, target);
  if (change === null) {
    return null;
  }

  const removesAnActiveAdmin =
    target.role === 'ADMIN' &&
    target.status === 'ACTIVE' &&
    (action.type === 'suspend' || (action.type === 'changeRole' && action.role === 'MEMBER'));
  if (removesAnActiveAdmin && activeAdminCount <= 1) {
    throw new LastAdminRequired();
  }
  return change;
}

/** Cambio que pide la acción, o `null` si el usuario ya está en ese rol o estado. */
function changeFor(action: UserAction, target: UserChangeSnapshot['target']): UserChange | null {
  switch (action.type) {
    case 'changeRole':
      return target.role === action.role ? null : { role: action.role };
    case 'suspend':
      return target.status === 'SUSPENDED' ? null : { status: 'SUSPENDED', revokeSessions: true };
    case 'reactivate':
      return target.status === 'ACTIVE' ? null : { status: 'ACTIVE' };
  }
}
