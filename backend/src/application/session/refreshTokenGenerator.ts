import type { GeneratedSecretToken, SecretTokenGenerator } from '../tokens/secretTokenGenerator.js';

/** Refresh token recién generado: el valor en claro va a la cookie y el hash, a la base de datos. */
export type GeneratedRefreshToken = GeneratedSecretToken;

/** El generador de refresh tokens es el generador genérico de tokens opacos. */
export type RefreshTokenGenerator = SecretTokenGenerator;
