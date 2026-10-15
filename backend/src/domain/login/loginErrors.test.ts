import { describe, expect, it } from 'vitest';
import { AccountSuspended, InvalidCredentials } from './loginErrors.js';

describe('InvalidCredentials', () => {
  it('is an Error with a stable name and message', () => {
    const error = new InvalidCredentials('PASSWORD');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidCredentials');
    expect(error.message).toBe('Email o contraseña incorrectos');
  });

  it.each(['PASSWORD', 'NOT_FOUND'] as const)(
    'keeps the reason %s for the logs without exposing it in the message',
    (reason) => {
      const error = new InvalidCredentials(reason);

      expect(error.reason).toBe(reason);
      expect(error.message).not.toContain(reason);
    },
  );
});

describe('AccountSuspended', () => {
  it('is an Error with a stable name and message', () => {
    const error = new AccountSuspended();

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AccountSuspended');
    expect(error.message).toBe('La cuenta está desactivada');
  });

  it('is not an InvalidCredentials, so it is never answered with the generic 401', () => {
    expect(new AccountSuspended()).not.toBeInstanceOf(InvalidCredentials);
  });
});
