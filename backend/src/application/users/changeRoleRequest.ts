import type { UserRole } from '../../domain/user/user.js';
import { ValidationError } from '../validationError.js';

const ROLES: readonly UserRole[] = ['ADMIN', 'MEMBER'];

/**
 * Valida el cuerpo de `PUT /api/users/{id}/role` y devuelve el rol pedido. Como el login, ignora las
 * propiedades desconocidas: el colegio y el usuario que actúa no se leen nunca del cuerpo.
 *
 * @throws ValidationError con `REQUIRED` si falta `role` e `INVALID_FORMAT` si no es `ADMIN` ni `MEMBER`
 */
export function parseChangeRoleRequest(body: unknown): UserRole {
  const role =
    typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).role
      : undefined;

  if (role === undefined || role === null || role === '') {
    throw new ValidationError([{ field: 'role', code: 'REQUIRED' }]);
  }
  if (typeof role !== 'string' || !ROLES.includes(role as UserRole)) {
    throw new ValidationError([{ field: 'role', code: 'INVALID_FORMAT' }]);
  }
  return role as UserRole;
}
