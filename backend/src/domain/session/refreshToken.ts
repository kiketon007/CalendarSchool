/** Duración absoluta de una sesión: la cookie y el refresh token caducan a las 24 horas. */
export const REFRESH_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** Refresh token persistido. Solo guarda el hash del token, nunca el token en claro. */
export interface RefreshToken {
  /** UUIDv7. */
  readonly id: string;
  readonly userId: string;
  /** SHA-256 del token en hexadecimal. */
  readonly tokenHash: string;
  readonly expiresAt: Date;
  /** Instante de la revocación; nulo mientras el token es válido. */
  readonly revokedAt: Date | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
}

export type RefreshTokenStatus = 'USABLE' | 'REVOKED' | 'EXPIRED';

/**
 * Estado de un refresh token en el instante `now`. La revocación prevalece sobre la caducidad,
 * y el token deja de ser utilizable en el mismo instante de `expiresAt`.
 */
export function refreshTokenStatus(
  token: Pick<RefreshToken, 'expiresAt' | 'revokedAt'>,
  now: Date,
): RefreshTokenStatus {
  if (token.revokedAt !== null) {
    return 'REVOKED';
  }
  return token.expiresAt.getTime() > now.getTime() ? 'USABLE' : 'EXPIRED';
}
