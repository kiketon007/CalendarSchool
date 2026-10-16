import type { UserRole } from '../../domain/user/user.js';

/**
 * El usuario autenticado no tiene el rol que exige la operación. `errorHandler` lo traduce a
 * `403 FORBIDDEN`; los roles solo se registran en el log.
 */
export class Forbidden extends Error {
  constructor(
    public readonly currentRole: UserRole,
    public readonly requiredRole: UserRole,
  ) {
    super('El usuario no tiene el rol que exige la operación');
    this.name = 'Forbidden';
  }
}
