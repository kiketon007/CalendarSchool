import { describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

function errorWithCode(code: string): Error {
  return Object.assign(new Error('fallo de Prisma'), { code });
}

describe('translateDatabaseErrors', () => {
  it('returns the result of the operation', async () => {
    await expect(translateDatabaseErrors(() => Promise.resolve(42))).resolves.toBe(42);
  });

  it.each(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'P1000', 'P1001', 'P1002', 'P1008', 'P1017'])(
    'translates the connection error %s into DatabaseUnavailable keeping the cause',
    async (code) => {
      const cause = errorWithCode(code);

      const error: unknown = await translateDatabaseErrors(() => Promise.reject(cause)).catch(
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(DatabaseUnavailable);
      expect((error as DatabaseUnavailable).cause).toBe(cause);
    },
  );

  it.each([
    ['a constraint violation', errorWithCode('P2002')],
    ['a plain error', new Error('otro fallo')],
    ['an error with a non-string code', Object.assign(new Error('x'), { code: 1001 })],
  ])('rethrows %s unchanged', async (_name, cause) => {
    await expect(translateDatabaseErrors(() => Promise.reject(cause))).rejects.toBe(cause);
  });

  it('rethrows values that are not errors unchanged', async () => {
    // Se rechaza con valores que no son Error, como puede hacer cualquier código. Con un mock se
    // evita la regla que exige rechazar solo con Error, sin desactivarla (el hook de pre-commit
    // elimina las directivas de ESLint que no usa su configuración sin tipos).
    const rejectWith = (value: unknown) => vi.fn<() => Promise<never>>().mockRejectedValue(value);

    await expect(translateDatabaseErrors(rejectWith('texto'))).rejects.toBe('texto');
    await expect(translateDatabaseErrors(rejectWith(null))).rejects.toBeNull();
  });
});
