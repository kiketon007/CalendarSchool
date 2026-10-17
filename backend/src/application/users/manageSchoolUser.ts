import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type { SchoolUserRepository } from '../../domain/user/schoolUserRepository.js';
import { planUserChange, type UserAction } from '../../domain/user/userManagement.js';
import {
  CannotSuspendSelf,
  LastAdminRequired,
  UserNotActive,
  UserNotFound,
} from '../../domain/user/userManagementErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface ManageSchoolUserDependencies {
  schoolUserRepository: Pick<SchoolUserRepository, 'applyChange'>;
  now: () => Date;
  logger: ApplicationLogger;
}

export interface ManageSchoolUserInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Usuario que actúa, de la identidad de la petición. */
  actorId: string;
  /** Usuario sobre el que se actúa. */
  userId: string;
  action: UserAction;
}

/** Motivo (solo para el log) de cada rechazo `409` de la gestión de usuarios. */
function rejectionReason(error: unknown): string | undefined {
  if (error instanceof LastAdminRequired) {
    return 'LAST_ADMIN_REQUIRED';
  }
  if (error instanceof CannotSuspendSelf) {
    return 'CANNOT_SUSPEND_SELF';
  }
  if (error instanceof UserNotActive) {
    return 'USER_NOT_ACTIVE';
  }
  return undefined;
}

/**
 * Caso de uso: cambia el rol, da de baja o reactiva a un usuario del colegio. Las tres acciones
 * comparten el esqueleto (aplicar con el colegio bloqueado, registrar el resultado), y la regla vive
 * en `planUserChange`. Registra un evento solo si hubo cambio, y los rechazos `409` como
 * `USER_MANAGEMENT_REJECTED`; nunca emails ni nombres. Un fallo de la base de datos
 * (`DatabaseUnavailable`) se propaga sin registrarse como rechazo.
 *
 * @throws UserNotFound si el usuario no es de este colegio, no existe o está eliminado
 * @throws CannotSuspendSelf, UserNotActive o LastAdminRequired según la regla de dominio
 */
export class ManageSchoolUser {
  constructor(private readonly dependencies: ManageSchoolUserDependencies) {}

  async execute({ schoolId, actorId, userId, action }: ManageSchoolUserInput): Promise<SchoolUser> {
    const { schoolUserRepository, now, logger } = this.dependencies;

    let applied;
    try {
      applied = await schoolUserRepository.applyChange({
        schoolId,
        userId,
        now: now(),
        plan: (snapshot) => planUserChange(action, { actorId, ...snapshot }),
      });
    } catch (error) {
      const reason = rejectionReason(error);
      if (reason) {
        logger.info(
          {
            event: 'USER_MANAGEMENT_REJECTED',
            reason,
            school_id: schoolId,
            actor_id: actorId,
            user_id: userId,
          },
          'Operación de gestión de usuarios rechazada',
        );
      }
      throw error;
    }

    if (applied === null) {
      throw new UserNotFound();
    }
    if (applied.change === null) {
      return applied.user;
    }

    const context = { school_id: schoolId, actor_id: actorId, user_id: userId };
    if ('role' in applied.change) {
      logger.info(
        {
          event: 'USER_ROLE_CHANGED',
          ...context,
          previous_role: applied.previous.role,
          new_role: applied.user.role,
        },
        'Rol de un usuario cambiado',
      );
    } else if (applied.change.status === 'SUSPENDED') {
      logger.info(
        { event: 'USER_SUSPENDED', ...context, revoked_sessions: applied.revokedSessions },
        'Usuario dado de baja',
      );
    } else {
      logger.info({ event: 'USER_REACTIVATED', ...context }, 'Usuario reactivado');
    }
    return applied.user;
  }
}
