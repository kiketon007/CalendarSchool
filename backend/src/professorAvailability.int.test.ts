import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { TEST_APP_ORIGIN } from '../test/support/appDoubles.js';
import { realApp } from '../test/support/realApp.js';
import { testPrisma } from '../test/support/testPrisma.js';

const PASSWORD = 'Secreta123!';

type App = ReturnType<typeof realApp>['app'];

function cookieOf(response: request.Response): string {
  const [setCookie] = response.headers['set-cookie'] as unknown as string[];
  return (setCookie ?? '').split(';')[0] ?? '';
}

/** Registra un colegio con su administrador y devuelve su access token y el colegio. */
async function adminOf(app: App, schoolName: string, email: string) {
  const registered = await request(app)
    .post('/api/auth/register')
    .send({
      schoolName,
      municipalityCode: '46250',
      firstName: 'José María',
      lastName: 'García-López',
      email,
      password: PASSWORD,
      privacyPolicyAccepted: true,
      captcha: { version: 'v3', token: 'token-provisional' },
    });
  expect(registered.status).toBe(201);
  const data = (registered.body as { data: { school: { id: string } } }).data;
  const refreshed = await request(app)
    .post('/api/auth/refresh')
    .set('Origin', TEST_APP_ORIGIN)
    .set('Cookie', cookieOf(registered));
  expect(refreshed.status).toBe(200);
  const accessToken = (refreshed.body as { data: { session: { accessToken: string } } }).data
    .session.accessToken;
  return { accessToken, schoolId: data.school.id };
}

/** Crea un usuario `MEMBER` del colegio y devuelve su access token. */
async function memberOf(realApps: ReturnType<typeof realApp>, schoolId: string) {
  const member = await testPrisma.user.create({
    data: {
      id: crypto.randomUUID(),
      schoolId,
      email: `miembro.${crypto.randomUUID()}@example.com`,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: 'Miembro',
      lastName: 'Colegio',
      role: 'MEMBER',
      status: 'ACTIVE',
    },
  });
  const refresh = await testPrisma.refreshToken.create({
    data: {
      id: crypto.randomUUID(),
      userId: member.id,
      tokenHash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return realApps.tokenIssuer.issueAccessToken({
    userId: member.id,
    schoolId,
    role: 'MEMBER',
    sessionId: refresh.id,
  });
}

const authorized = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

const createProfessor = async (
  app: App,
  accessToken: string,
  firstName: string,
  lastName: string,
) => {
  const response = await request(app)
    .post('/api/professors')
    .set(authorized(accessToken))
    .send({ firstName, lastName });
  expect(response.status).toBe(201);
  return (response.body as { data: { professor: { id: string } } }).data.professor.id;
};

const getAvailability = (app: App, accessToken: string, professorId: string) =>
  request(app).get(`/api/professors/${professorId}/availability`).set(authorized(accessToken));

const putAvailability = (app: App, accessToken: string, professorId: string, body: unknown) =>
  request(app)
    .put(`/api/professors/${professorId}/availability`)
    .set(authorized(accessToken))
    .send(body as object);

interface Interval {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}
const interval = (dayOfWeek: number, startTime: string, endTime: string): Interval => ({
  dayOfWeek,
  startTime,
  endTime,
});

const availabilityOf = (response: request.Response) =>
  (response.body as { data: { availability: { professorId: string; unavailable: Interval[] } } })
    .data.availability;
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details?: { field: string; code: string }[] } }).error;
const rowCount = () => testPrisma.professorUnavailability.count();

describe('the availability of a professor against the test database', () => {
  it('reads no intervals for a professor that is available always, never cached', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');

    const response = await getAvailability(app, accessToken, professor);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(availabilityOf(response)).toEqual({ professorId: professor, unavailable: [] });
  });

  it('lets a member save the availability, joining the intervals that touch, and reads it back', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');
    const memberToken = await memberOf(apps, schoolId);

    const saved = await putAvailability(app, memberToken, professor, {
      unavailable: [
        interval(3, '09:00', '14:00'),
        interval(1, '09:45', '10:30'),
        interval(1, '09:00', '09:45'),
      ],
    });

    expect(saved.status).toBe(200);
    expect(saved.headers['cache-control']).toBe('no-store');
    expect(availabilityOf(saved).unavailable).toEqual([
      interval(1, '09:00', '10:30'),
      interval(3, '09:00', '14:00'),
    ]);
    await expect(rowCount()).resolves.toBe(2);
    expect(availabilityOf(await getAvailability(app, accessToken, professor)).unavailable).toEqual([
      interval(1, '09:00', '10:30'),
      interval(3, '09:00', '14:00'),
    ]);
  });

  it('empties the availability with an empty list', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');
    await putAvailability(app, accessToken, professor, {
      unavailable: [interval(1, '09:00', '10:00')],
    });

    const emptied = await putAvailability(app, accessToken, professor, { unavailable: [] });

    expect(emptied.status).toBe(200);
    expect(availabilityOf(emptied).unavailable).toEqual([]);
    await expect(rowCount()).resolves.toBe(0);
  });

  it('writes nothing and logs no update when the normalized intervals are the stored ones', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');
    await putAvailability(app, accessToken, professor, {
      unavailable: [interval(1, '09:00', '10:30')],
    });
    const before = await testPrisma.professorUnavailability.findMany();

    const again = await putAvailability(app, accessToken, professor, {
      unavailable: [interval(1, '09:00', '09:45'), interval(1, '09:45', '10:30')],
    });

    expect(again.status).toBe(200);
    await expect(testPrisma.professorUnavailability.findMany()).resolves.toEqual(before);
    const updates = apps
      .logOutput()
      .split('\n')
      .filter((line) => line.includes('PROFESSOR_AVAILABILITY_UPDATED'));
    expect(updates).toHaveLength(1);
  });

  it('answers 400 with the code of each wrong field and changes nothing', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');
    await putAvailability(app, accessToken, professor, {
      unavailable: [interval(1, '09:00', '10:00')],
    });

    const response = await putAvailability(app, accessToken, professor, {
      unavailable: [
        interval(6, '09:00', '10:00'),
        interval(2, '25:00', '10:00'),
        interval(3, '11:00', '10:00'),
      ],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect(errorOf(response).details).toEqual([
      { field: 'unavailable[0].dayOfWeek', code: 'OUT_OF_RANGE' },
      { field: 'unavailable[1].startTime', code: 'INVALID_FORMAT' },
      { field: 'unavailable[2].endTime', code: 'INVALID_RANGE' },
    ]);
    await expect(rowCount()).resolves.toBe(1);
  });

  it('answers 400 INVALID_LENGTH on the first interval over 40 in a day', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');
    const monday = Array.from({ length: 41 }, (_, index) =>
      interval(1, `${String(Math.floor(index / 2)).padStart(2, '0')}:00`, '23:59'),
    );

    const response = await putAvailability(app, accessToken, professor, { unavailable: monday });

    expect(response.status).toBe(400);
    expect(errorOf(response).details).toEqual([
      { field: 'unavailable[40]', code: 'INVALID_LENGTH' },
    ]);
    await expect(rowCount()).resolves.toBe(0);
  });

  it('answers 404 for a professor of another school, one that does not exist and an id that is not a UUID', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const foreign = await createProfessor(app, two.accessToken, 'Eva', 'Gil');
    const body = { unavailable: [interval(1, '09:00', '10:00')] };

    for (const id of [foreign, crypto.randomUUID(), 'not-a-uuid']) {
      const read = await getAvailability(app, one.accessToken, id);
      const written = await putAvailability(app, one.accessToken, id, body);

      expect(read.status).toBe(404);
      expect(errorOf(read).code).toBe('NOT_FOUND');
      expect(written.status).toBe(404);
      expect(errorOf(written).code).toBe('NOT_FOUND');
    }
    await expect(rowCount()).resolves.toBe(0);
  });

  it('answers 401 without a session', async () => {
    const { app } = realApp();
    const id = crypto.randomUUID();

    const read = await request(app).get(`/api/professors/${id}/availability`);
    const written = await request(app)
      .put(`/api/professors/${id}/availability`)
      .send({ unavailable: [] });

    expect(read.status).toBe(401);
    expect(written.status).toBe(401);
    expect(written.headers['www-authenticate']).toBe('Bearer');
  });

  it('counts the intervals in the list, the read, the creation and the edition of the professors', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');
    const other = await createProfessor(app, accessToken, 'Luis', 'Pérez');
    await putAvailability(app, accessToken, professor, {
      unavailable: [interval(1, '09:00', '10:00'), interval(2, '09:00', '10:00')],
    });

    const list = await request(app).get('/api/professors').set(authorized(accessToken));
    const read = await request(app)
      .get(`/api/professors/${professor}`)
      .set(authorized(accessToken));
    const edited = await request(app)
      .put(`/api/professors/${professor}`)
      .set(authorized(accessToken))
      .send({ firstName: 'Ana María', lastName: 'García' });
    const created = await request(app)
      .post('/api/professors')
      .set(authorized(accessToken))
      .send({ firstName: 'Eva', lastName: 'Gil' });

    const counts = Object.fromEntries(
      (
        list.body as { data: { professors: { id: string; unavailableCount: number }[] } }
      ).data.professors.map(({ id, unavailableCount }) => [id, unavailableCount]),
    );
    expect(counts).toEqual({ [professor]: 2, [other]: 0 });
    expect(
      (read.body as { data: { professor: { unavailableCount: number } } }).data.professor
        .unavailableCount,
    ).toBe(2);
    expect(
      (edited.body as { data: { professor: { unavailableCount: number } } }).data.professor
        .unavailableCount,
    ).toBe(2);
    expect(
      (created.body as { data: { professor: { unavailableCount: number } } }).data.professor
        .unavailableCount,
    ).toBe(0);
  });

  it('deletes the intervals with the professor', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');
    await putAvailability(app, accessToken, professor, {
      unavailable: [interval(1, '09:00', '10:00')],
    });
    await expect(rowCount()).resolves.toBe(1);

    const deleted = await request(app)
      .delete(`/api/professors/${professor}`)
      .set(authorized(accessToken));

    expect(deleted.status).toBe(200);
    await expect(rowCount()).resolves.toBe(0);
  });

  it('logs the events with identifiers and the count, and never a name nor an hour', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Zuleima', 'Quiñonero');
    await putAvailability(app, accessToken, professor, {
      unavailable: [interval(1, '09:17', '10:41')],
    });
    await putAvailability(app, accessToken, crypto.randomUUID(), { unavailable: [] });

    const log = apps.logOutput();
    const updated = log.split('\n').find((line) => line.includes('PROFESSOR_AVAILABILITY_UPDATED'));
    const rejected = log
      .split('\n')
      .find((line) => line.includes('PROFESSOR_AVAILABILITY_UPDATE_REJECTED'));

    expect(JSON.parse(updated ?? '{}')).toMatchObject({
      event: 'PROFESSOR_AVAILABILITY_UPDATED',
      professor_id: professor,
      interval_count: 1,
    });
    expect(JSON.parse(rejected ?? '{}')).toMatchObject({
      event: 'PROFESSOR_AVAILABILITY_UPDATE_REJECTED',
      reason: 'not_found',
    });
    expect(log).not.toMatch(/Zuleima|Quiñonero|09:17|10:41/);
  });

  it('keeps the whole state of one of two simultaneous saves of the same professor', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const professor = await createProfessor(app, accessToken, 'Ana', 'García');
    const first = [interval(1, '09:00', '10:00'), interval(2, '09:00', '10:00')];
    const second = [interval(4, '11:00', '12:00')];

    for (let round = 0; round < 3; round += 1) {
      const responses = await Promise.all([
        putAvailability(app, accessToken, professor, { unavailable: first }),
        putAvailability(app, accessToken, professor, { unavailable: second }),
      ]);

      expect(responses.map(({ status }) => status)).toEqual([200, 200]);
      const stored = availabilityOf(await getAvailability(app, accessToken, professor)).unavailable;
      expect([first, second]).toContainEqual(stored);
    }
  });
});
