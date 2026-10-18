import { createHash, randomBytes } from 'node:crypto';
import type {
  GeneratedSecretToken,
  SecretTokenGenerator,
} from '../application/tokens/secretTokenGenerator.js';

/** 32 bytes: 256 bits de entropía. */
const TOKEN_BYTES = 32;

/**
 * Adaptador de `SecretTokenGenerator` con `node:crypto`, para los refresh tokens y los enlaces de
 * acceso. Con 256 bits de entropía basta un hash rápido (SHA-256): permite buscar el token por
 * igualdad en el índice único de `token_hash`.
 */
export class CryptoSecretTokenGenerator implements SecretTokenGenerator {
  generate(): GeneratedSecretToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
