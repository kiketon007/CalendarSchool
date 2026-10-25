import request from 'supertest';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { AuthenticatedUser } from '../../application/authentication/authenticateRequest.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { ValidationError } from '../../application/validationError.js';
import type { Calendar } from '../../domain/calendar/calendar.js';
import { CalendarAlreadyExists, CalendarNotFound } from '../../domain/calendar/calendarErrors.js';
import { InvalidSession } from '../../domain/session/sessionErrors.js';
import type { UserRole } from '../../domain/user/user.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

const ACCESS_TOKEN = 'header.payload.signature';
const SCHOOL_ID = 'school-1';
const CALENDAR_ID = '0192f5a0-0000-7000-8000-0000000000c1';

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
  let getCalendar: Mock<AppDependencies['getCalendar']['execute']>;
  let updateCalendar: Mock<AppDependencies['updateCalendar']['execute']>;
  let deleteCalendar: Mock<AppDependencies['deleteCalendar']['execute']>;
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
    getCalendar = vi.fn<AppDependencies['getCalendar']['execute']>().mockResolvedValue(CALENDAR);
    updateCalendar = vi
      .fn<AppDependencies['updateCalendar']['execute']>()
      .mockResolvedValue(CALENDAR);
    deleteCalendar = vi
      .fn<AppDependencies['deleteCalendar']['execute']>()
      .mockResolvedValue({ id: CALENDAR_ID, courseCount: 2 });
    app = createApp({
      ...defaultDependencies,
      authenticateRequest: { execute: authenticate },
      createCalendar: { execute: createCalendar },
      listCalendars: { execute: listCalendars },
      getCalendar: { execute: getCalendar },
      updateCalendar: { execute: updateCalendar },
      deleteCalendar: { execute: deleteCalendar },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  const authorizedPost = (body: string | object = BODY) =>
    request(app).post('/api/calendars').set('Authorization', `Bearer ${ACCESS_TOKEN}`).send(body);
  const authorizedGet = () =>
    request(app).get('/api/calendars').set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedGetOne = (id: string = CALENDAR_ID) =>
    request(app).get(`/api/calendars/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);
  const authorizedPut = (id: string = CALENDAR_ID, body: string | object = BODY) =>
    request(app)
      .put(`/api/calendars/${id}`)
      .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
      .send(body);

  const authorizedDelete = (id: string = CALENDAR_ID) =>
    request(app).delete(`/api/calendars/${id}`).set('Authorization', `Bearer ${ACCESS_TOKEN}`);

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

  describe('GET /api/calendars/:id', () => {
    it('responds 200 with the calendar, never cached', async () => {
      const response = await authorizedGetOne();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { calendar: CALENDAR_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('asks for the calendar of the id under the school of the identity', async () => {
      await request(app)
        .get(`/api/calendars/${CALENDAR_ID}?schoolId=other-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`);

      expect(getCalendar).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        calendarId: CALENDAR_ID,
      });
    });

    it.each<UserRole>(['ADMIN', 'MEMBER'])('accepts a %s', async (role) => {
      authenticate.mockResolvedValue(identityWith(role));

      expect((await authorizedGetOne()).status).toBe(200);
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorizedGetOne('no-es-un-uuid');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
      expect(getCalendar).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND when the calendar is not in the school', async () => {
      getCalendar.mockRejectedValue(new CalendarNotFound());

      const response = await authorizedGetOne();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      getCalendar.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedGetOne();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 without a token and does not read the calendar', async () => {
      const response = await request(app).get(`/api/calendars/${CALENDAR_ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(getCalendar).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/calendars/:id', () => {
    it('responds 200 with the calendar, never cached', async () => {
      const response = await authorizedPut();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: { calendar: CALENDAR_JSON } });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the body, the id, the school and the author of the identity to the use case', async () => {
      await request(app)
        .put(`/api/calendars/${CALENDAR_ID}?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ ...BODY, schoolId: 'body-school' });

      expect(updateCalendar).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        calendarId: CALENDAR_ID,
        body: { ...BODY, schoolId: 'body-school' },
      });
    });

    it('does not require the Origin header', async () => {
      expect((await authorizedPut()).status).toBe(200);
    });

    it('responds 403 FORBIDDEN to a MEMBER before reading the id or the body, even if neither is valid', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const response = await authorizedPut('no-es-un-uuid', { name: '' });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      expect(updateCalendar).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID before validating the body', async () => {
      const response = await authorizedPut('no-es-un-uuid', { name: '' });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(updateCalendar).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND when the calendar is not in the school', async () => {
      updateCalendar.mockRejectedValue(new CalendarNotFound());

      const response = await authorizedPut();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 400 VALIDATION_ERROR with the invalid fields', async () => {
      updateCalendar.mockRejectedValue(
        new ValidationError([
          { field: 'name', code: 'REQUIRED' },
          { field: 'courseIds[0]', code: 'NOT_FOUND' },
        ]),
      );

      const response = await authorizedPut(CALENDAR_ID, {});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          code: 'VALIDATION_ERROR',
          details: [
            { field: 'name', code: 'REQUIRED' },
            { field: 'courseIds[0]', code: 'NOT_FOUND' },
          ],
        },
      });
    });

    it('responds 409 CALENDAR_ALREADY_EXISTS when another calendar has the name', async () => {
      updateCalendar.mockRejectedValue(new CalendarAlreadyExists());

      const response = await authorizedPut();

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({ error: { code: 'CALENDAR_ALREADY_EXISTS' } });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      updateCalendar.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedPut();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 without a token and does nothing', async () => {
      const response = await request(app).put(`/api/calendars/${CALENDAR_ID}`).send(BODY);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(updateCalendar).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/calendars/:id', () => {
    it('responds 200 with the deleted id and the freed courses, never cached', async () => {
      const response = await authorizedDelete();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: { deleted: { id: CALENDAR_ID, courseCount: 2 } },
      });
      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('passes the id, the school and the author of the identity to the use case', async () => {
      await request(app)
        .delete(`/api/calendars/${CALENDAR_ID}?schoolId=query-school`)
        .set('Authorization', `Bearer ${ACCESS_TOKEN}`)
        .send({ schoolId: 'body-school' });

      expect(deleteCalendar).toHaveBeenCalledExactlyOnceWith({
        schoolId: SCHOOL_ID,
        actorId: 'user-1',
        calendarId: CALENDAR_ID,
      });
    });

    it('does not require the Origin header', async () => {
      expect((await authorizedDelete()).status).toBe(200);
    });

    it('responds 403 FORBIDDEN to a MEMBER without reading the id, even if it is not a UUID, nor reaching the use case', async () => {
      authenticate.mockResolvedValue(identityWith('MEMBER'));

      const forValidId = await authorizedDelete();
      const forInvalidId = await authorizedDelete('no-es-un-uuid');

      for (const response of [forValidId, forInvalidId]) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ success: false, error: { code: 'FORBIDDEN' } });
      }
      expect(deleteCalendar).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND to an id that is not a UUID, without reaching the use case', async () => {
      const response = await authorizedDelete('no-es-un-uuid');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      expect(deleteCalendar).not.toHaveBeenCalled();
    });

    it('responds 404 NOT_FOUND when the calendar is not in the school', async () => {
      deleteCalendar.mockRejectedValue(new CalendarNotFound());

      const response = await authorizedDelete();

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    });

    it('responds 503 DATABASE_UNAVAILABLE when the database does not respond', async () => {
      deleteCalendar.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

      const response = await authorizedDelete();

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({ error: { code: 'DATABASE_UNAVAILABLE' } });
    });

    it('responds 401 without a token and does nothing', async () => {
      const response = await request(app).delete(`/api/calendars/${CALENDAR_ID}`);

      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(deleteCalendar).not.toHaveBeenCalled();
    });
  });
});
