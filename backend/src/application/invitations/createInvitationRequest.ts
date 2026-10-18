import type { UserRole } from '../../domain/user/user.js';
import { parseChangeRoleRequest } from '../users/changeRoleRequest.js';

/**
 * Valida el cuerpo de `POST /api/invitations` y devuelve el rol de la invitación. Tiene las mismas
 * reglas de campo que el cambio de rol de un usuario (`role` obligatorio, `ADMIN` o `MEMBER`, y las
 * propiedades desconocidas se ignoran: el colegio y quien invita nunca salen del cuerpo), así que
 * reutiliza ese parser en lugar de repetirlo.
 *
 * @throws ValidationError con `REQUIRED` si falta `role` e `INVALID_FORMAT` si no es `ADMIN` ni `MEMBER`
 */
export function parseCreateInvitationRequest(body: unknown): UserRole {
  return parseChangeRoleRequest(body);
}
