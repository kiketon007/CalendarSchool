import { refreshTokenStatus } from '../../domain/session/refreshToken.js';
import type { RefreshTokenRepository } from '../../domain/session/refreshTokenRepository.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { InvalidAccessToken, type TokenIssuer } from '../session/tokenIssuer.js';

/**
 * Identidad de una petición autenticada. Sale siempre de la base de datos, nunca de los claims del
 * access token: así un cambio de rol, una baja o un cierre de sesión se aplican en la siguiente
 * petición.
 */
export interface AuthenticatedUser {
  readonly userId: string;
  readonly schoolId: string;
  readonly role: UserRole;
  readonly sessionId: string;
}

export interface AuthenticateRequestDependencies {
  tokenIssuer: Pick<TokenIssuer, 'verifyAccessToken'>;
  refreshTokenRepository: Pick<RefreshTokenRepository, 'findById'>;
  now: () => Date;
}

/**
 * Caso de uso: autentica una petición a un endpoint protegido a partir de su access token. Verifica
 * el token y lee, en una sola consulta por clave primaria, la sesión que indica (`sid`) con su
 * usuario. Cualquier sesión no válida lanza `InvalidSession` con su causa, que solo va al log; un
 * fallo de la base de datos (`DatabaseUnavailable`) se propaga y nunca se convierte en un rechazo.
 */
export class AuthenticateRequest {
  constructor(private readonly dependencies: AuthenticateRequestDependencies) {}

  async execute(accessToken: string): Promise<AuthenticatedUser> {
    let claims;
    try {
      claims = await this.dependencies.tokenIssuer.verifyAccessToken(accessToken);
    } catch (error) {
      if (error instanceof InvalidAccessToken) {
        throw new InvalidSession('TOKEN_INVALID');
      }
      throw error;
    }

    const found = await this.dependencies.refreshTokenRepository.findById(claims.sessionId);
    if (!found) {
      throw new InvalidSession('SESSION_NOT_FOUND');
    }
    if (found.token.userId !== claims.userId) {
      throw new InvalidSession('SESSION_USER_MISMATCH');
    }

    const status = refreshTokenStatus(found.token, this.dependencies.now());
    if (status === 'REVOKED') {
      throw new InvalidSession('SESSION_REVOKED');
    }
    if (status === 'EXPIRED') {
      throw new InvalidSession('SESSION_EXPIRED');
    }
    if (found.user.status !== 'ACTIVE') {
      throw new InvalidSession('USER_INACTIVE');
    }

    return {
      userId: found.user.id,
      schoolId: found.school.id,
      role: found.user.role,
      sessionId: found.token.id,
    };
  }
}
