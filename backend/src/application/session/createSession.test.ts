import { describe, expect, it } from 'vitest';
import { CreateSession } from './createSession.js';

const NOW = new Date('2026-10-09T10:00:00.000Z');

function createSession() {
  return new CreateSession({
    idGenerator: { generate: () => 'token-id' },
    refreshTokenGenerator: {
      generate: () => ({ token: 'plain-token', hash: 'f'.repeat(64) }),
      hash: () => 'unused',
    },
    now: () => NOW,
  });
}

describe('CreateSession', () => {
  it('builds the refresh token record of the user with an absolute 24 hour expiration', () => {
    const { refreshToken } = createSession().create('user-1');

    expect(refreshToken).toEqual({
      id: 'token-id',
      userId: 'user-1',
      tokenHash: 'f'.repeat(64),
      expiresAt: new Date('2026-10-10T10:00:00.000Z'),
      revokedAt: null,
    });
  });

  it('returns the plain token apart, and only its hash in the record to persist', () => {
    const session = createSession().create('user-1');

    expect(session.token).toBe('plain-token');
    expect(Object.values(session.refreshToken)).not.toContain('plain-token');
  });

  it('keeps no data of the client in the record: no IP and no user agent', () => {
    const { refreshToken } = createSession().create('user-1');

    expect(Object.keys(refreshToken).sort()).toEqual([
      'expiresAt',
      'id',
      'revokedAt',
      'tokenHash',
      'userId',
    ]);
  });
});
