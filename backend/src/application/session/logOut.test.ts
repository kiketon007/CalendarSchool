import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { RefreshTokenWithOwner } from '../../domain/session/refreshTokenRepository.js';
import type { UserStatus } from '../../domain/user/user.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { LogOut } from './logOut.js';

const NOW = new Date('2026-10-09T10:00:00Z');
const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };
const PLAIN_TOKEN = 'plain-refresh-token';
const TOKEN_HASH = 'f'.repeat(64);

function stored(
  overrides: { expiresAt?: Date; revokedAt?: Date | null; status?: UserStatus } = {},
): RefreshTokenWithOwner {
  return {
    token: {
      id: 'refresh-token-id',
      userId: 'user-1',
      tokenHash: TOKEN_HASH,
      expiresAt: overrides.expiresAt ?? new Date('2026-10-10T08:00:00Z'),
      revokedAt: overrides.revokedAt ?? null,
    },
    user: {
      id: 'user-1',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García-López',
      role: 'ADMIN',
      status: overrides.status ?? 'ACTIVE',
    },
    school: { id: 'school-1', name: 'CEIP Lluís Vives' },
  };
}

describe('LogOut', () => {
  let findByHash: Mock<(tokenHash: string) => Promise<RefreshTokenWithOwner | null>>;
  let revoke: Mock<(id: string, revokedAt: Date) => Promise<void>>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let logOut: LogOut;

  beforeEach(() => {
    findByHash = vi.fn(() => Promise.resolve<RefreshTokenWithOwner | null>(stored()));
    revoke = vi.fn(() => Promise.resolve());
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    logOut = new LogOut({
      refreshTokenRepository: { findByHash, revoke },
      refreshTokenGenerator: {
        hash: (token) => (token === PLAIN_TOKEN ? TOKEN_HASH : 'other-hash'),
      },
      now: () => NOW,
      logger: { info, warn },
    });
  });

  it('revokes a usable session with the current instant and logs USER_LOGOUT', async () => {
    await logOut.execute(PLAIN_TOKEN, CONTEXT);

    expect(findByHash).toHaveBeenCalledWith(TOKEN_HASH);
    expect(revoke).toHaveBeenCalledWith('refresh-token-id', NOW);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      {
        event: 'USER_LOGOUT',
        user_id: 'user-1',
        ip: CONTEXT.ip,
        user_agent: CONTEXT.userAgent,
      },
      expect.any(String),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('lets a suspended user close their session', async () => {
    findByHash.mockResolvedValue(stored({ status: 'SUSPENDED' }));

    await logOut.execute(PLAIN_TOKEN, CONTEXT);

    expect(revoke).toHaveBeenCalledWith('refresh-token-id', NOW);
  });

  describe('when there is no session to revoke', () => {
    it('does nothing without a token, without even querying the database', async () => {
      await logOut.execute(undefined, CONTEXT);

      expect(findByHash).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith(
        {
          event: 'USER_LOGOUT_WITHOUT_SESSION',
          reason: 'MISSING',
          ip: CONTEXT.ip,
          user_agent: CONTEXT.userAgent,
        },
        expect.any(String),
      );
    });

    it.each([
      ['an unknown token', () => null, 'UNKNOWN'],
      [
        'an already revoked session',
        () => stored({ revokedAt: new Date('2026-10-09T09:00:00Z') }),
        'REVOKED',
      ],
      [
        'an expired session',
        () => stored({ expiresAt: new Date('2026-10-09T09:59:59Z') }),
        'EXPIRED',
      ],
    ])('does not revoke %s and logs its reason', async (_case, found, reason) => {
      findByHash.mockResolvedValue(found());

      await expect(logOut.execute(PLAIN_TOKEN, CONTEXT)).resolves.toBeUndefined();

      expect(revoke).not.toHaveBeenCalled();
      expect(info).toHaveBeenCalledWith(
        {
          event: 'USER_LOGOUT_WITHOUT_SESSION',
          reason,
          ip: CONTEXT.ip,
          user_agent: CONTEXT.userAgent,
        },
        expect.any(String),
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('when the database does not respond', () => {
    it('propagates DatabaseUnavailable when looking up the session', async () => {
      findByHash.mockRejectedValue(new DatabaseUnavailable(new Error('conexión perdida')));

      await expect(logOut.execute(PLAIN_TOKEN, CONTEXT)).rejects.toBeInstanceOf(
        DatabaseUnavailable,
      );

      expect(revoke).not.toHaveBeenCalled();
    });

    it('propagates DatabaseUnavailable when revoking and does not log USER_LOGOUT', async () => {
      revoke.mockRejectedValue(new DatabaseUnavailable(new Error('conexión perdida')));

      await expect(logOut.execute(PLAIN_TOKEN, CONTEXT)).rejects.toBeInstanceOf(
        DatabaseUnavailable,
      );

      expect(info).not.toHaveBeenCalled();
    });
  });

  it('never logs the token or its hash', async () => {
    await logOut.execute(PLAIN_TOKEN, CONTEXT);
    findByHash.mockResolvedValue(null);
    await logOut.execute(PLAIN_TOKEN, CONTEXT);

    const logged = JSON.stringify([info.mock.calls, warn.mock.calls]);
    expect(logged).not.toContain(PLAIN_TOKEN);
    expect(logged).not.toContain(TOKEN_HASH);
  });
});
