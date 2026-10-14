import { describe, expect, it } from 'vitest';
import { REGISTRATION_ATTEMPTS_WINDOW_MS } from '../registration/limitRegistrationAttempts.js';
import { ATTEMPT_RETENTION_HOURS } from './attemptRetention.js';

const HOUR_MS = 60 * 60 * 1000;

/** Ventana de cada política del limitador. Una política nueva se añade aquí. */
const POLICY_WINDOWS_MS = { register: REGISTRATION_ATTEMPTS_WINDOW_MS };

describe('ATTEMPT_RETENTION_HOURS', () => {
  it('is 24 hours, the value the purge SQL and the privacy policy declare', () => {
    expect(ATTEMPT_RETENTION_HOURS).toBe(24);
  });

  it.each(Object.entries(POLICY_WINDOWS_MS))(
    'is longer than the window of the %s policy, so the purge never deletes an attempt that still counts',
    (_policy, windowMs) => {
      expect(windowMs).toBeLessThan(ATTEMPT_RETENTION_HOURS * HOUR_MS);
    },
  );
});
