import { refreshTokenStatus } from '../../domain/session/refreshToken.js';
import type { RefreshTokenRepository } from '../../domain/session/refreshTokenRepository.js';
import { InvalidSession, type InvalidSessionReason } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { RequestContext } from '../requestContext.js';
import type { RefreshTokenGenerator } from './refreshTokenGenerator.js';
import { ACCESS_TOKEN_TTL_SECONDS, type TokenIssuer } from './tokenIssuer.js';

/** Sesión renovada: nunca incluye el refresh token ni su hash. */
export interface RefreshSessionResult {
  session: { accessToken: string; expiresIn: number };
  user: { id: string; email: string; firstName: string; lastName: string; role: UserRole };
  school: { id: string; name: string };
}

export interface RefreshSessionDependencies {
  refreshTokenRepository: RefreshTokenRepository;
  refreshTokenGenerator: Pick<RefreshTokenGenerator, 'hash'>;
  tokenIssuer: Pick<TokenIssuer, 'issueAccessToken'>;
  now: () => Date;
  logger: ApplicationLogger;
}

/**
 * Caso de uso: emite un access token nuevo a partir del refresh token de la cookie. No rota el
 * refresh token ni amplía su caducidad. Cualquier sesión no válida lanza `InvalidSession`, cuya
 * causa solo se registra en el log.
 */
export class RefreshSession {
  constructor(private readonly dependencies: RefreshSessionDependencies) {}

  async execute(
    refreshToken: string | undefined,
    context: RequestContext,
  ): Promise<RefreshSessionResult> {
    if (!refreshToken) {
      throw this.invalid('MISSING', context);
    }

    const found = await this.dependencies.refreshTokenRepository.findByHash(
      this.dependencies.refreshTokenGenerator.hash(refreshToken),
    );
    if (!found) {
      throw this.invalid('UNKNOWN', context);
    }

    const status = refreshTokenStatus(found.token, this.dependencies.now());
    if (status !== 'USABLE') {
      throw this.invalid(status, context);
    }
    if (found.user.status !== 'ACTIVE') {
      throw this.invalid('USER_INACTIVE', context);
    }

    const { user, school } = found;
    const accessToken = await this.dependencies.tokenIssuer.issueAccessToken({
      userId: user.id,
      schoolId: school.id,
      role: user.role,
    });

    this.dependencies.logger.info(
      {
        event: 'SESSION_REFRESHED',
        user_id: user.id,
        ip: context.ip,
        user_agent: context.userAgent,
      },
      'Access token renovado',
    );
    return {
      session: { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      school: { id: school.id, name: school.name },
    };
  }

  /** Registra el fallo, con su causa, y devuelve el error que se lanza al llamante. */
  private invalid(reason: InvalidSessionReason, context: RequestContext): InvalidSession {
    this.dependencies.logger.warn(
      {
        event: 'SESSION_REFRESH_FAILED',
        reason,
        ip: context.ip,
        user_agent: context.userAgent,
      },
      'Renovación de sesión rechazada: la sesión no es válida',
    );
    return new InvalidSession(reason);
  }
}
