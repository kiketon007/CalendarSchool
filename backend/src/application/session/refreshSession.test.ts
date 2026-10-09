import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { RefreshTokenWithOwner } from '../../domain/session/refreshTokenRepository.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserStatus } from '../../domain/user/user.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { RefreshSession } from './refreshSession.js';
import type { TokenIssuer } from './tokenIssuer.js';

const NOW = new Date('2026-10-09T10:00:00Z');
const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };
const PLAIN_TOKEN = 'plain-refresh-token';
const TOKEN_HASH = 'f'.repeat(64);
const ACCESS_TOKEN = 'signed.access.token';

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
      userAgent: CONTEXT.userAgent,
      ipAddress: CONTEXT.ip,
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

describe('RefreshSession', () => {
  let findByHash: Mock<(tokenHash: string) => Promise<RefreshTokenWithOwner | null>>;
  let issueAccessToken: Mock<TokenIssuer['issueAccessToken']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let refreshSession: RefreshSession;

  beforeEach(() => {
    findByHash = vi.fn(() => Promise.resolve<RefreshTokenWithOwner | null>(stored()));
    issueAccessToken = vi.fn<TokenIssuer['issueAccessToken']>().mockResolvedValue(ACCESS_TOKEN);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    refreshSession = new RefreshSession({
      refreshTokenRepository: { findByHash },
      refreshTokenGenerator: {
        hash: (token) => (token === PLAIN_TOKEN ? TOKEN_HASH : 'other-hash'),
      },
      tokenIssuer: { issueAccessToken },
      now: () => NOW,
      logger: { info, warn },
    });
  });

  it('issues an access token with the user and the school of a usable token', async () => {
    const result = await refreshSession.execute(PLAIN_TOKEN, CONTEXT);

    expect(findByHash).toHaveBeenCalledWith(TOKEN_HASH);
    expect(issueAccessToken).toHaveBeenCalledWith({
      userId: 'user-1',
      schoolId: 'school-1',
      role: 'ADMIN',
    });
    expect(result).toEqual({
      session: { accessToken: ACCESS_TOKEN, expiresIn: 900 },
      user: {
        id: 'user-1',
        email: 'jose.garcia@example.com',
        firstName: 'José María',
        lastName: 'García-López',
        role: 'ADMIN',
      },
      school: { id: 'school-1', name: 'CEIP Lluís Vives' },
    });
  });

  it('logs SESSION_REFRESHED with the user, ip and user agent', async () => {
    await refreshSession.execute(PLAIN_TOKEN, CONTEXT);

    expect(info).toHaveBeenCalledWith(
      {
        event: 'SESSION_REFRESHED',
        user_id: 'user-1',
        ip: '203.0.113.7',
        user_agent: 'Mozilla/5.0 (test)',
      },
      expect.any(String),
    );
  });

  describe('invalid session', () => {
    it.each([
      ['MISSING', undefined],
      ['MISSING', ''],
    ])(
      'rejects with %s when there is no token (%j) without querying the database',
      async (reason, token) => {
        const error: unknown = await refreshSession
          .execute(token, CONTEXT)
          .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(InvalidSession);
        expect((error as InvalidSession).reason).toBe(reason);
        expect(findByHash).not.toHaveBeenCalled();
      },
    );

    it('rejects with UNKNOWN when no refresh token has that hash', async () => {
      findByHash.mockResolvedValueOnce(null);

      await expect(refreshSession.execute('forged-token', CONTEXT)).rejects.toMatchObject({
        reason: 'UNKNOWN',
      });
    });

    it.each([
      ['REVOKED', stored({ revokedAt: new Date('2026-10-09T09:00:00Z') })],
      ['EXPIRED', stored({ expiresAt: new Date('2026-10-09T09:59:59Z') })],
      ['USER_INACTIVE', stored({ status: 'SUSPENDED' })],
      ['USER_INACTIVE', stored({ status: 'DELETED' })],
    ])('rejects with %s', async (reason, found) => {
      findByHash.mockResolvedValueOnce(found);

      const error: unknown = await refreshSession
        .execute(PLAIN_TOKEN, CONTEXT)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InvalidSession);
      expect((error as InvalidSession).reason).toBe(reason);
      expect(issueAccessToken).not.toHaveBeenCalled();
    });

    it('logs SESSION_REFRESH_FAILED with the reason, ip and user agent', async () => {
      findByHash.mockResolvedValueOnce(stored({ revokedAt: new Date('2026-10-09T09:00:00Z') }));

      await refreshSession.execute(PLAIN_TOKEN, CONTEXT).catch(() => undefined);

      expect(warn).toHaveBeenCalledWith(
        {
          event: 'SESSION_REFRESH_FAILED',
          reason: 'REVOKED',
          ip: '203.0.113.7',
          user_agent: 'Mozilla/5.0 (test)',
        },
        expect.any(String),
      );
      expect(info).not.toHaveBeenCalled();
    });
  });

  it('propagates DatabaseUnavailable without logging a session event', async () => {
    findByHash.mockRejectedValueOnce(new DatabaseUnavailable(new Error('conexión perdida')));

    await expect(refreshSession.execute(PLAIN_TOKEN, CONTEXT)).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('never logs the refresh token, its hash or the access token', async () => {
    await refreshSession.execute(PLAIN_TOKEN, CONTEXT);
    findByHash.mockResolvedValueOnce(null);
    await refreshSession.execute(PLAIN_TOKEN, CONTEXT).catch(() => undefined);

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain(PLAIN_TOKEN);
    expect(logged).not.toContain(TOKEN_HASH);
    expect(logged).not.toContain(ACCESS_TOKEN);
  });
});
