import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CryptoRefreshTokenGenerator } from './cryptoRefreshTokenGenerator.js';

const generator = new CryptoRefreshTokenGenerator();

describe('CryptoRefreshTokenGenerator', () => {
  it('generates a base64url token of 32 random bytes', () => {
    const { token } = generator.generate();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  });

  it('generates a different token each time', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generator.generate().token));

    expect(tokens.size).toBe(100);
  });

  it('returns the SHA-256 of the token as 64 hexadecimal characters', () => {
    const { token, hash } = generator.generate();

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).not.toContain(token);
  });

  it('hashes a received token deterministically, matching the generated hash', () => {
    const { token, hash } = generator.generate();

    expect(generator.hash(token)).toBe(hash);
    expect(generator.hash(token)).toBe(generator.hash(token));
    expect(generator.hash('another-token')).not.toBe(hash);
  });
});
