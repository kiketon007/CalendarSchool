import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { ListedConstraint } from '../../domain/constraints/constraintList.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';

const CONSTRAINTS: ListedConstraint[] = [
  {
    id: '0192f5a0-0000-7000-8000-0000000000f1',
    type: 'MAX_PER_DAY',
    course: { id: '0192f5a0-0000-7000-8000-0000000000d1', name: '1º Primaria' },
    subject: {
      id: '0192f5a0-0000-7000-8000-0000000000e1',
      name: 'Inglés',
      code: null,
      color: 'blue',
      status: 'ACTIVE',
    },
    maxPerDay: 2,
    blockSize: null,
    slotCount: null,
    warnings: [{ code: 'SUBJECT_DOES_NOT_FIT' }],
  },
];

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('constraints routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let listConstraints: Mock<AppDependencies['listConstraints']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    listConstraints = vi
      .fn<AppDependencies['listConstraints']['execute']>()
      .mockResolvedValue(CONSTRAINTS);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      listConstraints: { execute: listConstraints },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedGet = () =>
    request(app).get('/api/constraints').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('GET /api/constraints', () => {
    it.each<UserRole>(['ADMIN', 'MEMBER'])(
      'responds 200 with the constraints to a %s, never cached',
      async (role) => {
        authenticate.mockResolvedValue(identityWith(role));

        const response = await authorizedGet();

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ success: true, data: { constraints: CONSTRAINTS } });
        expect(response.headers['cache-control']).toBe('no-store');
      },
    );

    it('responds 200 with an empty list', async () => {
      listConstraints.mockResolvedValue([]);

      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { constraints: [] } });
    });

    it('takes the school from the identity and ignores one sent by the client', async () => {
      await request(app)
        .get('/api/constraints?schoolId=query-school')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(listConstraints).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 401 without a session and does not read anything', async () => {
      const response = await request(app).get('/api/constraints');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(listConstraints).not.toHaveBeenCalled();
    });

    it('responds 401 when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      const response = await authorizedGet();

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({ success: false, error: { code: 'INVALID_SESSION' } });
    });

    it('responds 503 when the database is unavailable', async () => {
      listConstraints.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });
});
