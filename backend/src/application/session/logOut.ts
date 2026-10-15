import { refreshTokenStatus } from '../../domain/session/refreshToken.js';
import type { RefreshTokenRepository } from '../../domain/session/refreshTokenRepository.js';
import type { InvalidSessionReason } from '../../domain/session/sessionErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { RequestContext } from '../requestContext.js';
import type { RefreshTokenGenerator } from './refreshTokenGenerator.js';

/** Motivos por los que no había una sesión que revocar. */
type NoSessionReason = Extract<InvalidSessionReason, 'MISSING' | 'UNKNOWN' | 'REVOKED' | 'EXPIRED'>;

export interface LogOutDependencies {
  refreshTokenRepository: Pick<RefreshTokenRepository, 'findByHash' | 'revoke'>;
  refreshTokenGenerator: Pick<RefreshTokenGenerator, 'hash'>;
  now: () => Date;
  logger: ApplicationLogger;
}

/**
 * Caso de uso: cierra la sesión del refresh token de la cookie revocándolo. Es idempotente: sin
 * token, con uno desconocido, ya revocado o caducado no hay nada que revocar y termina sin error,
 * porque el resultado que el cliente quiere (no tener sesión) ya se da. Solo se revoca esa sesión,
 * y se permite también a un usuario no activo. Un fallo de la base de datos (`DatabaseUnavailable`)
 * se propaga: el cierre no se da por hecho.
 */
export class LogOut {
  constructor(private readonly dependencies: LogOutDependencies) {}

  async execute(refreshToken: string | undefined, context: RequestContext): Promise<void> {
    if (!refreshToken) {
      this.withoutSession('MISSING', context);
      return;
    }

    const found = await this.dependencies.refreshTokenRepository.findByHash(
      this.dependencies.refreshTokenGenerator.hash(refreshToken),
    );
    if (!found) {
      this.withoutSession('UNKNOWN', context);
      return;
    }

    const status = refreshTokenStatus(found.token, this.dependencies.now());
    if (status !== 'USABLE') {
      this.withoutSession(status, context);
      return;
    }

    await this.dependencies.refreshTokenRepository.revoke(found.token.id, this.dependencies.now());
    this.dependencies.logger.info(
      {
        event: 'USER_LOGOUT',
        user_id: found.user.id,
        ip: context.ip,
        user_agent: context.userAgent,
      },
      'Sesión cerrada',
    );
  }

  /** Registra que no había sesión que cerrar. Nunca incluye el token ni su hash. */
  private withoutSession(reason: NoSessionReason, context: RequestContext): void {
    this.dependencies.logger.info(
      {
        event: 'USER_LOGOUT_WITHOUT_SESSION',
        reason,
        ip: context.ip,
        user_agent: context.userAgent,
      },
      'Cierre de sesión sin una sesión válida que revocar',
    );
  }
}
