import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  InvalidAccessToken,
  type AccessTokenClaims,
  type TokenIssuer,
} from '../application/session/tokenIssuer.js';

const ALGORITHM = 'HS256';

/** Carga que se exige a un access token ya verificado; cualquier otra forma se rechaza. */
const accessTokenPayloadSchema = z.object({
  sub: z.string().min(1),
  schoolId: z.string().min(1),
  role: z.enum(['ADMIN', 'MEMBER']),
});

/**
 * Adaptador de `TokenIssuer` con `jose` (JavaScript puro, compatible con AWS Lambda). Firma con
 * HS256 y, al verificar, solo admite ese algoritmo: rechaza `none` y cualquier otro.
 */
export class JoseTokenIssuer implements TokenIssuer {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  issueAccessToken(claims: AccessTokenClaims): Promise<string> {
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    return new SignJWT({ schoolId: claims.schoolId, role: claims.role })
      .setProtectedHeader({ alg: ALGORITHM })
      .setSubject(claims.userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TOKEN_TTL_SECONDS)
      .sign(this.key);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        currentDate: this.now(),
        requiredClaims: ['sub', 'iat', 'exp'],
      });
      const { sub, schoolId, role } = accessTokenPayloadSchema.parse(payload);
      return { userId: sub, schoolId, role };
    } catch {
      // Firma, algoritmo, caducidad o forma inválidos: al llamante le basta con saber que no vale.
      throw new InvalidAccessToken();
    }
  }
}
