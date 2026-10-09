import { createHash, randomBytes } from 'node:crypto';
import type {
  GeneratedRefreshToken,
  RefreshTokenGenerator,
} from '../application/session/refreshTokenGenerator.js';

/** 32 bytes: 256 bits de entropía. */
const TOKEN_BYTES = 32;

/**
 * Adaptador de `RefreshTokenGenerator` con `node:crypto`. Con 256 bits de entropía basta un hash
 * rápido (SHA-256): permite buscar el token por igualdad en el índice único de `token_hash`.
 */
export class CryptoRefreshTokenGenerator implements RefreshTokenGenerator {
  generate(): GeneratedRefreshToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
