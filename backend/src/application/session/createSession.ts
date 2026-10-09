import { REFRESH_TOKEN_TTL_SECONDS, type RefreshToken } from '../../domain/session/refreshToken.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import type { RequestContext } from '../requestContext.js';
import type { RefreshTokenGenerator } from './refreshTokenGenerator.js';

/** Longitud máxima del user agent en `refresh_tokens.user_agent`. */
const MAX_USER_AGENT_LENGTH = 512;

/** Sesión nueva: el token en claro (solo para la cookie) y el registro que se persiste. */
export interface NewSession {
  readonly token: string;
  readonly refreshToken: RefreshToken;
}

export interface CreateSessionDependencies {
  idGenerator: IdGenerator;
  refreshTokenGenerator: RefreshTokenGenerator;
  now: () => Date;
}

/**
 * Prepara la sesión de un usuario: genera el refresh token y el registro que lo persiste, con
 * su hash y una caducidad absoluta de 24 horas. No escribe en la base de datos: quien la usa
 * decide en qué transacción se guarda.
 */
export class CreateSession {
  constructor(private readonly dependencies: CreateSessionDependencies) {}

  create(userId: string, context: RequestContext): NewSession {
    const { token, hash } = this.dependencies.refreshTokenGenerator.generate();
    const createdAt = this.dependencies.now();

    return {
      token,
      refreshToken: {
        id: this.dependencies.idGenerator.generate(),
        userId,
        tokenHash: hash,
        expiresAt: new Date(createdAt.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        revokedAt: null,
        userAgent: context.userAgent?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
        ipAddress: context.ip ?? null,
      },
    };
  }
}
