import { describe, expect, it } from 'vitest';
import { refreshTokenStatus } from './refreshToken.js';

const now = new Date('2026-10-09T10:00:00Z');

function token(overrides: { expiresAt?: Date; revokedAt?: Date | null } = {}) {
  return {
    expiresAt: overrides.expiresAt ?? new Date('2026-10-10T09:00:00Z'),
    revokedAt: overrides.revokedAt ?? null,
  };
}

describe('refreshTokenStatus', () => {
  it('is USABLE when it is not revoked and expires later', () => {
    expect(refreshTokenStatus(token(), now)).toBe('USABLE');
  });

  it('is REVOKED when it has a revocation date', () => {
    expect(refreshTokenStatus(token({ revokedAt: new Date('2026-10-09T09:00:00Z') }), now)).toBe(
      'REVOKED',
    );
  });

  it('is EXPIRED exactly at its expiration instant', () => {
    expect(refreshTokenStatus(token({ expiresAt: now }), now)).toBe('EXPIRED');
  });

  it('is EXPIRED after its expiration instant', () => {
    expect(refreshTokenStatus(token({ expiresAt: new Date('2026-10-09T09:59:59Z') }), now)).toBe(
      'EXPIRED',
    );
  });

  it('reports REVOKED before EXPIRED when both apply', () => {
    const revokedAndExpired = token({
      expiresAt: new Date('2026-10-09T09:00:00Z'),
      revokedAt: new Date('2026-10-09T08:00:00Z'),
    });

    expect(refreshTokenStatus(revokedAndExpired, now)).toBe('REVOKED');
  });
});
