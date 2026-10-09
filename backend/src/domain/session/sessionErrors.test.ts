import { describe, expect, it } from 'vitest';
import { InvalidSession } from './sessionErrors.js';

describe('InvalidSession', () => {
  it('is an Error with a stable name and message', () => {
    const error = new InvalidSession('EXPIRED');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('InvalidSession');
    expect(error.message).toBe('La sesión no es válida');
  });

  it.each(['MISSING', 'UNKNOWN', 'REVOKED', 'EXPIRED', 'USER_INACTIVE'] as const)(
    'keeps the reason %s for the logs without exposing it in the message',
    (reason) => {
      const error = new InvalidSession(reason);

      expect(error.reason).toBe(reason);
      expect(error.message).not.toContain(reason);
    },
  );
});
