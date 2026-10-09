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
    const { refreshToken } = createSession().create('user-1', {
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (test)',
    });

    expect(refreshToken).toEqual({
      id: 'token-id',
      userId: 'user-1',
      tokenHash: 'f'.repeat(64),
      expiresAt: new Date('2026-10-10T10:00:00.000Z'),
      revokedAt: null,
      userAgent: 'Mozilla/5.0 (test)',
      ipAddress: '203.0.113.7',
    });
  });

  it('returns the plain token apart, and only its hash in the record to persist', () => {
    const session = createSession().create('user-1', { ip: undefined, userAgent: undefined });

    expect(session.token).toBe('plain-token');
    expect(Object.values(session.refreshToken)).not.toContain('plain-token');
  });

  it('stores null audit data when the request does not provide it', () => {
    const { refreshToken } = createSession().create('user-1', {
      ip: undefined,
      userAgent: undefined,
    });

    expect(refreshToken.ipAddress).toBeNull();
    expect(refreshToken.userAgent).toBeNull();
  });

  it('truncates a user agent longer than its column', () => {
    const { refreshToken } = createSession().create('user-1', {
      ip: '203.0.113.7',
      userAgent: 'x'.repeat(600),
    });

    expect(refreshToken.userAgent).toHaveLength(512);
  });
});
