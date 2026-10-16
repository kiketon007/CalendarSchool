import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';

const USERS: SchoolUser[] = [
  {
    id: 'user-1',
    firstName: 'José María',
    lastName: 'García-López',
    email: 'jose.garcia@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: new Date('2026-10-07T09:30:00Z'),
  },
];

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('GET /api/users', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let listUsers: Mock<AppDependencies['listSchoolUsers']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    listUsers = vi.fn<AppDependencies['listSchoolUsers']['execute']>().mockResolvedValue(USERS);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      listSchoolUsers: { execute: listUsers },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorized = () =>
    request(app).get('/api/users').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  it('responds 200 to an administrator with the seven fields of each user and ISO dates', async () => {
    const response = await authorized();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: [
        {
          id: 'user-1',
          firstName: 'José María',
          lastName: 'García-López',
          email: 'jose.garcia@example.com',
          role: 'ADMIN',
          status: 'ACTIVE',
          createdAt: '2026-10-07T09:30:00.000Z',
        },
      ],
    });
    expect(authenticate).toHaveBeenCalledExactlyOnceWith(ACCESS_TOKEN);
  });

  it('is never cached', async () => {
    const response = await authorized();

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('does not require the Origin header: it does not use cookies', async () => {
    const response = await authorized();

    expect(response.status).toBe(200);
  });

  it('takes the school from the identity and ignores one sent by the client', async () => {
    await request(app)
      .get('/api/users?schoolId=other-school')
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

    expect(listUsers).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
  });

  it('answers 403 FORBIDDEN to a member without listing anything', async () => {
    authenticate.mockResolvedValue(identityWith('MEMBER'));

    const response = await authorized();

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'FORBIDDEN', message: expect.any(String) as string },
    });
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('answers 401, not 403, without a token', async () => {
    const response = await request(app).get('/api/users');

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(response.body).toMatchObject({ error: { code: 'INVALID_SESSION' } });
    expect(authenticate).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('answers 401 INVALID_SESSION when the session is no longer valid', async () => {
    authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

    const response = await authorized();

    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer');
    expect(listUsers).not.toHaveBeenCalled();
  });

  it('answers 503 DATABASE_UNAVAILABLE when the list cannot be read', async () => {
    listUsers.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    const response = await authorized();

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
  });
});
