import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { RefreshTokenWithOwner } from '../../domain/session/refreshTokenRepository.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole, UserStatus } from '../../domain/user/user.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import {
  InvalidAccessToken,
  type AccessTokenClaims,
  type TokenIssuer,
} from '../session/tokenIssuer.js';
import { AuthenticateRequest } from './authenticateRequest.js';

const NOW = new Date('2026-10-16T10:00:00Z');
const ACCESS_TOKEN = 'signed.access.token';

/** Claims con un rol y un colegio que NO coinciden con los de la base de datos, para comprobar de dónde sale la identidad. */
const CLAIMS: AccessTokenClaims = {
  userId: 'user-1',
  schoolId: 'stale-school',
  role: 'MEMBER',
  sessionId: 'session-1',
};

function stored(
  overrides: {
    userId?: string;
    expiresAt?: Date;
    revokedAt?: Date | null;
    status?: UserStatus;
    role?: UserRole;
  } = {},
): RefreshTokenWithOwner {
  return {
    token: {
      id: 'session-1',
      userId: overrides.userId ?? 'user-1',
      tokenHash: 'f'.repeat(64),
      expiresAt: overrides.expiresAt ?? new Date('2026-10-17T08:00:00Z'),
      revokedAt: overrides.revokedAt ?? null,
    },
    user: {
      id: overrides.userId ?? 'user-1',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García-López',
      role: overrides.role ?? 'ADMIN',
      status: overrides.status ?? 'ACTIVE',
    },
    school: { id: 'school-1', name: 'CEIP Lluís Vives' },
  };
}

describe('AuthenticateRequest', () => {
  let verifyAccessToken: Mock<TokenIssuer['verifyAccessToken']>;
  let findById: Mock<(id: string) => Promise<RefreshTokenWithOwner | null>>;
  let authenticateRequest: AuthenticateRequest;

  beforeEach(() => {
    verifyAccessToken = vi.fn<TokenIssuer['verifyAccessToken']>().mockResolvedValue(CLAIMS);
    findById = vi.fn(() => Promise.resolve<RefreshTokenWithOwner | null>(stored()));
    authenticateRequest = new AuthenticateRequest({
      tokenIssuer: { verifyAccessToken },
      refreshTokenRepository: { findById },
      now: () => NOW,
    });
  });

  async function rejection(): Promise<InvalidSession> {
    const error: unknown = await authenticateRequest.execute(ACCESS_TOKEN).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidSession);
    return error as InvalidSession;
  }

  it('returns the identity read from the database, not the claims of the token', async () => {
    await expect(authenticateRequest.execute(ACCESS_TOKEN)).resolves.toEqual({
      userId: 'user-1',
      schoolId: 'school-1',
      role: 'ADMIN',
      sessionId: 'session-1',
    });
  });

  it('looks the session up by the sid claim', async () => {
    await authenticateRequest.execute(ACCESS_TOKEN);

    expect(verifyAccessToken).toHaveBeenCalledWith(ACCESS_TOKEN);
    expect(findById).toHaveBeenCalledExactlyOnceWith('session-1');
  });

  it('applies a role change from the next request', async () => {
    findById.mockResolvedValue(stored({ role: 'MEMBER' }));

    await expect(authenticateRequest.execute(ACCESS_TOKEN)).resolves.toMatchObject({
      role: 'MEMBER',
    });
  });

  it('rejects an invalid token with TOKEN_INVALID without querying the database', async () => {
    verifyAccessToken.mockRejectedValue(new InvalidAccessToken());

    expect((await rejection()).reason).toBe('TOKEN_INVALID');
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a session that does not exist with SESSION_NOT_FOUND', async () => {
    findById.mockResolvedValue(null);

    expect((await rejection()).reason).toBe('SESSION_NOT_FOUND');
  });

  it('rejects a session of another user with SESSION_USER_MISMATCH', async () => {
    findById.mockResolvedValue(stored({ userId: 'user-2' }));

    expect((await rejection()).reason).toBe('SESSION_USER_MISMATCH');
  });

  it('rejects a revoked session with SESSION_REVOKED', async () => {
    findById.mockResolvedValue(stored({ revokedAt: new Date('2026-10-16T09:00:00Z') }));

    expect((await rejection()).reason).toBe('SESSION_REVOKED');
  });

  it('rejects an expired session with SESSION_EXPIRED', async () => {
    findById.mockResolvedValue(stored({ expiresAt: new Date('2026-10-16T09:59:59Z') }));

    expect((await rejection()).reason).toBe('SESSION_EXPIRED');
  });

  it.each<UserStatus>(['SUSPENDED', 'DELETED'])(
    'rejects a %s user with USER_INACTIVE even if the session is usable',
    async (status) => {
      findById.mockResolvedValue(stored({ status }));

      expect((await rejection()).reason).toBe('USER_INACTIVE');
    },
  );

  it('propagates DatabaseUnavailable instead of turning it into a rejection', async () => {
    findById.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(authenticateRequest.execute(ACCESS_TOKEN)).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
