import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import type { Calendar } from '../../domain/calendar/calendar.js';
import { CalendarAlreadyExists } from '../../domain/calendar/calendarErrors.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';

const CALENDAR: Calendar = {
  id: 'calendar-1',
  name: 'Primaria',
  createdAt: new Date('2026-10-23T09:30:00Z'),
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
    { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
  ],
  courses: [{ id: 'course-1', name: '1º Primaria' }],
};

/** El calendario tal como lo serializa la API: la fecha en ISO 8601. */
const CALENDAR_JSON = { ...CALENDAR, createdAt: '2026-10-23T09:30:00.000Z' };

const BODY = {
  name: 'Primaria',
  periods: CALENDAR.periods,
  courseIds: ['0192f5a0-0000-7000-8000-0000000000d1'],
};

function identityWith(role: UserRole): AuthenticatedUser {
  return { userId: 'user-1', schoolId: SCHOOL_ID, role, sessionId: 'session-1' };
}

describe('calendars routes', () => {
  let authenticate: Mock<AppDependencies['authenticateRequest']['execute']>;
  let createCalendar: Mock<AppDependencies['createCalendar']['execute']>;
  let listCalendars: Mock<AppDependencies['listCalendars']['execute']>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    authenticate = vi
      .fn<AppDependencies['authenticateRequest']['execute']>()
      .mockResolvedValue(identityWith('ADMIN'));
    createCalendar = vi
      .fn<AppDependencies['createCalendar']['execute']>()
      .mockResolvedValue(CALENDAR);
    listCalendars = vi
      .fn<AppDependencies['listCalendars']['execute']>()
      .mockResolvedValue([CALENDAR]);
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createCalendar: { execute: createCalendar },
      listCalendars: { execute: listCalendars },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (body: string | object = BODY) =>
    request(app).post('/api/calendars').set('Authorization', `Bearer ${ACCESS_TOKEN}`).send(body);
  const authorizedGet = () =>
    request(app).get('/api/calendars').set('Authorization', `Bearer ${ACCESS_TOKEN}`);

  describe('POST /api/calendars', () => {
    it('responds 201 with the calendar, never cached', async () => {
      const response = await authorizedPost();

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ success: true, data: { calendar: CALENDAR_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the body, the school and the author of the identity to the use case', async () => {
      await authorizedPost();

      expect(createCalendar).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        body: BODY,
      });
    });

    it('takes the school from the identity, not from the body or the query', async () => {
      await request(app)
        .post('/api/calendars?schoolId=query-school')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'body-school' });

      expect(createCalendar).toHaveBeenCalledWith(expect.objectContaining({ schoolId: SCHOOL_ID }));
    });

    it('does not require the Origin header', async () => {
      expect((await authorizedPost()).status).toBe(201);
    });

    it('responds 403 FORBIDDEN to a MEMBER, without reaching the use case, even with a body that is not valid', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await authorizedPost({ name: '' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      expect(createCalendar).not.toHaveBeenCalled();
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      createCalendar.mockRejectedValue(
        new ValidationError([
          { field: 'name', code: 'REQUIRED' },
          { field: 'periods[0].endTime', code: 'TOO_LONG' },
          { field: 'courseIds[1]', code: 'NOT_FOUND' },
        ]),
      );

      const response = await authorizedPost({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'name', code: 'REQUIRED' },
            { field: 'periods[0].endTime', code: 'TOO_LONG' },
            { field: 'courseIds[1]', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it('responds 409 CALENDAR_ALREADY_EXISTS when the name is taken', async () => {
      createCalendar.mockRejectedValue(new CalendarAlreadyExists());

      const response = await authorizedPost();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        success: false,
        error: { code: 'CALENDAR_ALREADY_EXISTS' },
      });
    });

    it('responds 400 INVALID_JSON for a body that is not JSON, without reaching the use case', async () => {
      const response = await request(app)
        .post('/api/calendars')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .set('Content-Type', 'application/json')
        .send('{"name":');

      expect(response.status).toBe(400);
      expect(createCalendar).not.toHaveBeenCalled();
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      createCalendar.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPost();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 with WWW-Authenticate: Bearer and does nothing without a token', async () => {
      const response = await request(app).post('/api/calendars').send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(createCalendar).not.toHaveBeenCalled();
    });

    it('responds 401, not 403, when the session is not valid', async () => {
      authenticate.mockRejectedValue(new InvalidSession('SESSION_REVOKED'));

      expect((await authorizedPost()).status).toBe(401);
      expect(createCalendar).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/calendars', () => {
    it('responds 200 with the calendars of the school, never cached', async () => {
      const response = await authorizedGet();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { calendars: [CALENDAR_JSON] } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('responds 200 with an empty list when the school has no calendars', async () => {
      listCalendars.mockResolvedValue([]);

      const response = await authorizedGet();

      expect(response.body).toEqual({ success: true, data: { calendars: [] } });
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      expect((await authorizedGet()).status).toBe(200);
    });

    it('takes the school from the identity and ignores one sent in the query', async () => {
      await request(app)
        .get('/api/calendars?schoolId=other-school&page=2')
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(listCalendars).toHaveBeenCalledExactlyOnceWith({ schoolId: SCHOOL_ID });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      listCalendars.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGet();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 without a token and does not read the calendars', async () => {
      const response = await request(app).get('/api/calendars');

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(listCalendars).not.toHaveBeenCalled();
    });
  });
});
