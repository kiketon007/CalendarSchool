import { REFRESH_TOKEN_TTL_SECONDS, type RefreshToken } from '../../domain/session/refreshToken.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import type { RefreshTokenGenerator } from './refreshTokenGenerator.js';

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

  create(userId: string): NewSession {
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
      },
    };
  }
}
