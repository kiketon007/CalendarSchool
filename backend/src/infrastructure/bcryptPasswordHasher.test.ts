import { verify } from '@node-rs/bcrypt';
import { describe, expect, it } from 'vitest';
import { BCRYPT_COST, BcryptPasswordHasher, DUMMY_PASSWORD_HASH } from './bcryptPasswordHasher.js';

describe('BcryptPasswordHasher', () => {
  const hasher = new BcryptPasswordHasher();

  it('produces a Bcrypt hash with cost 12 that fits the 60 characters of the column', async () => {
    const hash = await hasher.hash('Secreta123!');

    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(hash).toHaveLength(60);
  });

  it('does not contain the password and verifies against it', async () => {
    const hash = await hasher.hash('Secreta123!');

    expect(hash).not.toContain('Secreta123!');
    await expect(verify('Secreta123!', hash)).resolves.toBe(true);
    await expect(verify('Secreta123?', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password thanks to the random salt', async () => {
    const [first, second] = await Promise.all([
      hasher.hash('Secreta123!'),
      hasher.hash('Secreta123!'),
    ]);

    expect(first).not.toBe(second);
  });

  it('does not block the event loop while hashing', async () => {
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 5);

    await hasher.hash('Secreta123!');
    clearInterval(timer);

    // Con cost 12 el cálculo dura cientos de milisegundos: un hash síncrono dejaría 0 ticks.
    expect(ticks).toBeGreaterThan(3);
  });

  it('hashes a password of exactly 72 bytes', async () => {
    const password = 'Aa1!' + 'ñ'.repeat(34);

    expect(new TextEncoder().encode(password)).toHaveLength(72);
    await expect(hasher.hash(password)).resolves.toMatch(/^\$2[aby]\$12\$/);
  });

  it('rejects a password longer than 72 bytes instead of silently truncating it', async () => {
    await expect(hasher.hash('Aa1!' + 'a'.repeat(69))).rejects.toThrow();
  });

  describe('verify', () => {
    it('accepts the password a hash was made from', async () => {
      const hash = await hasher.hash('Secreta123!');

      await expect(hasher.verify('Secreta123!', hash)).resolves.toBe(true);
    });

    it('rejects any other password', async () => {
      const hash = await hasher.hash('Secreta123!');

      await expect(hasher.verify('Secreta123?', hash)).resolves.toBe(false);
      await expect(hasher.verify('', hash)).resolves.toBe(false);
    });

    it('compares against the dummy hash when there is no stored hash, and never accepts', async () => {
      await expect(hasher.verify('Secreta123!', null)).resolves.toBe(false);
    });

    it('does as much work without a stored hash as with one, so the email cannot be told apart', async () => {
      const hash = await hasher.hash('Secreta123!');

      const started = performance.now();
      await hasher.verify('Secreta123?', null);
      const withoutHash = performance.now() - started;
      const startedWith = performance.now();
      await hasher.verify('Secreta123?', hash);
      const withHash = performance.now() - startedWith;

      // Con cost 12 cada comparación dura cientos de milisegundos: un atajo sin comparar tardaría ~0.
      expect(withoutHash).toBeGreaterThan(50);
      expect(withoutHash).toBeGreaterThan(withHash / 4);
    });

    it('does not block the event loop while comparing', async () => {
      let ticks = 0;
      const timer = setInterval(() => (ticks += 1), 5);

      await hasher.verify('Secreta123!', null);
      clearInterval(timer);

      expect(ticks).toBeGreaterThan(3);
    });
  });

  describe('DUMMY_PASSWORD_HASH', () => {
    it('is a well-formed Bcrypt hash with the same cost as the real ones', () => {
      expect(DUMMY_PASSWORD_HASH).toMatch(new RegExp(String.raw`^\$2[aby]\$${BCRYPT_COST}\$`));
      expect(DUMMY_PASSWORD_HASH).toHaveLength(60);
    });

    it('does not belong to any password a user could type', async () => {
      await expect(verify('', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
      await expect(verify('Secreta123!', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
    });
  });
});
