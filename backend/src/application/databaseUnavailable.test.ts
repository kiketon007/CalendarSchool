import { describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from './databaseUnavailable.js';

describe('DatabaseUnavailable', () => {
  it('is an Error with a stable name that keeps the original cause', () => {
    const cause = new Error('connect ECONNREFUSED');

    const error = new DatabaseUnavailable(cause);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DatabaseUnavailable');
    expect(error.message).toBe('La base de datos no está disponible');
    expect(error.cause).toBe(cause);
  });
});
