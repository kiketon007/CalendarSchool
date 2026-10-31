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

interface Setup {
  course: string;
  classA: string;
  classB: string;
  english: string;
  language: string;
  ana: string;
  luis: string;
}

/**
 * Un colegio con 1º Primaria (clases A, con tutora Ana, y B), Inglés (3) y Lengua (5) en ese curso y dos
 * profesores. Los datos se crean por la API.
 */
async function setUp(app: App, accessToken: string): Promise<Setup> {
  const professor = async (firstName: string, lastName: string) => {
    const response = await request(app)
      .post('/api/professors')
      .set(authorized(accessToken))
      .send({ firstName, lastName });
    expect(response.status).toBe(201);
    return (response.body as { data: { professor: { id: string } } }).data.professor.id;
  };
  const ana = await professor('Ana', 'García');
  const luis = await professor('Luis', 'Pérez');
  const created = await request(app)
    .post('/api/courses')
    .set(authorized(accessToken))
    .send({ name: '1º Primaria', classes: [{ name: 'A' }, { name: 'B' }] });
  expect(created.status).toBe(201);
  const course = (
    created.body as { data: { course: { id: string; classes: { id: string; name: string }[] } } }
  ).data.course;
  const classOf = (name: string) => course.classes.find((entry) => entry.name === name)?.id ?? '';
  const edited = await request(app)
    .put(`/api/courses/${course.id}`)
    .set(authorized(accessToken))
    .send({
      name: '1º Primaria',
      classes: course.classes.map(({ id, name }) => ({
        id,
        name,
        ...(name === 'A' ? { tutorId: ana } : {}),
      })),
    });
  expect(edited.status).toBe(200);
  const subject = async (name: string, sessionsPerWeek: number) => {
    const response = await request(app)
      .post('/api/subjects')
      .set(authorized(accessToken))
      .send({
        name,
        type: 'CORE',
        status: 'ACTIVE',
        color: 'blue',
        courses: [{ courseId: course.id, sessionsPerWeek }],
      });
    expect(response.status).toBe(201);
    return (response.body as { data: { subject: { id: string } } }).data.subject.id;
  };
  return {
    course: course.id,
    classA: classOf('A'),
    classB: classOf('B'),
    english: await subject('Inglés', 3),
    language: await subject('Lengua', 5),
    ana,
    luis,
  };
}

const getAssignments = (app: App, accessToken: string, courseId: string) =>
  request(app).get(`/api/courses/${courseId}/assignments`).set(authorized(accessToken));
const putAssignments = (app: App, accessToken: string, courseId: string, body: unknown) =>
  request(app)
    .put(`/api/courses/${courseId}/assignments`)
    .set(authorized(accessToken))
    .send(body as object);

interface Cell {
  subjectId: string;
  classId: string;
  professorId: string;
}
const cell = (subjectId: string, classId: string, professorId: string): Cell => ({
  subjectId,
  classId,
  professorId,
});
interface MatrixBody {
  course: { id: string; name: string };
  subjects: { id: string; name: string; sessionsPerWeek: number; status: string }[];
  classes: { id: string; name: string; tutor: { id: string; firstName: string } | null }[];
  assignments: Cell[];
}
const matrixOf = (response: request.Response) =>
  (response.body as { data: { assignments: MatrixBody } }).data.assignments;
const errorOf = (response: request.Response) =>
  (response.body as { error: { code: string; details?: { field: string; code: string }[] } }).error;
const assignmentCount = () => testPrisma.professorAssignment.count();

describe('the professors of a course against the test database', () => {
  it('reads the matrix with the subjects, the classes with their tutor and no assignments, never cached', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const setup = await setUp(app, accessToken);

    const response = await getAssignments(app, accessToken, setup.course);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const matrix = matrixOf(response);
    expect(matrix.course).toEqual({ id: setup.course, name: '1º Primaria' });
    expect(matrix.subjects.map(({ name, sessionsPerWeek }) => [name, sessionsPerWeek])).toEqual([
      ['Inglés', 3],
      ['Lengua', 5],
    ]);
    expect(matrix.classes.map(({ name, tutor }) => [name, tutor?.firstName ?? null])).toEqual([
      ['A', 'Ana'],
      ['B', null],
    ]);
    expect(matrix.assignments).toEqual([]);
  });

  it('lets a member assign the professors and reads them back, sorted', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken, schoolId } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const setup = await setUp(app, accessToken);
    const memberToken = await memberOf(apps, schoolId);

    const saved = await putAssignments(app, memberToken, setup.course, {
      assignments: [
        cell(setup.language, setup.classB, setup.luis),
        cell(setup.english, setup.classA, setup.ana),
        cell(setup.language, setup.classA, setup.ana),
      ],
    });

    expect(saved.status).toBe(200);
    expect(saved.headers['cache-control']).toBe('no-store');
    expect(matrixOf(saved).assignments).toEqual([
      cell(setup.english, setup.classA, setup.ana),
      cell(setup.language, setup.classA, setup.ana),
      cell(setup.language, setup.classB, setup.luis),
    ]);
    expect(matrixOf(await getAssignments(app, accessToken, setup.course)).assignments).toEqual(
      matrixOf(saved).assignments,
    );
  });

  it('applies the final state: what is not in the body is left unassigned and a professor can change', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const setup = await setUp(app, accessToken);
    await putAssignments(app, accessToken, setup.course, {
      assignments: [
        cell(setup.english, setup.classA, setup.ana),
        cell(setup.language, setup.classA, setup.ana),
      ],
    });

    const saved = await putAssignments(app, accessToken, setup.course, {
      assignments: [
        cell(setup.english, setup.classA, setup.luis),
        cell(setup.english, setup.classB, setup.luis),
      ],
    });

    expect(matrixOf(saved).assignments).toEqual([
      cell(setup.english, setup.classA, setup.luis),
      cell(setup.english, setup.classB, setup.luis),
    ]);
    await expect(assignmentCount()).resolves.toBe(2);
  });

  it('saves nothing and logs no update when the state is the stored one', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const setup = await setUp(app, accessToken);
    const body = { assignments: [cell(setup.english, setup.classA, setup.ana)] };
    await putAssignments(app, accessToken, setup.course, body);
    const before = await testPrisma.professorAssignment.findMany();

    const again = await putAssignments(app, accessToken, setup.course, body);

    expect(again.status).toBe(200);
    await expect(testPrisma.professorAssignment.findMany()).resolves.toEqual(before);
    const updates = apps
      .logOutput()
      .split('\n')
      .filter((line) => line.includes('COURSE_ASSIGNMENTS_UPDATED'));
    expect(updates).toHaveLength(1);
  });

  it('answers 400 with each wrong reference by position and changes nothing', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const setup = await setUp(app, one.accessToken);
    const foreign = await setUp(app, two.accessToken);
    await putAssignments(app, one.accessToken, setup.course, {
      assignments: [cell(setup.english, setup.classA, setup.ana)],
    });
    const otherSubject = await request(app)
      .post('/api/subjects')
      .set(authorized(one.accessToken))
      .send({ name: 'Plástica', type: 'CORE', status: 'ACTIVE', color: 'red', courses: [] });
    expect(otherSubject.status).toBe(400);

    const response = await putAssignments(app, one.accessToken, setup.course, {
      assignments: [
        cell(foreign.english, setup.classA, setup.ana),
        cell(setup.english, foreign.classA, setup.ana),
        cell(setup.language, setup.classA, foreign.ana),
        cell(setup.english, setup.classB, setup.luis),
        cell(setup.english, setup.classB, setup.ana),
      ],
    });

    expect(response.status).toBe(400);
    expect(errorOf(response).code).toBe('VALIDATION_ERROR');
    expect(errorOf(response).details).toEqual([{ field: 'assignments[4]', code: 'DUPLICATE' }]);
    const references = await putAssignments(app, one.accessToken, setup.course, {
      assignments: [
        cell(foreign.english, setup.classA, setup.ana),
        cell(setup.english, foreign.classA, setup.ana),
        cell(setup.language, setup.classA, foreign.ana),
      ],
    });
    expect(references.status).toBe(400);
    expect(errorOf(references).details).toEqual([
      { field: 'assignments[0].subjectId', code: 'NOT_FOUND' },
      { field: 'assignments[1].classId', code: 'NOT_FOUND' },
      { field: 'assignments[2].professorId', code: 'NOT_FOUND' },
    ]);
    await expect(assignmentCount()).resolves.toBe(1);
  });

  it('answers 404 for a course of another school, one that does not exist and an id that is not a UUID', async () => {
    const { app } = realApp();
    const one = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const two = await adminOf(app, 'CEIP Dos', 'dos@example.com');
    const foreign = await setUp(app, two.accessToken);

    // Un id que no es UUID es un 404 antes de mirar el cuerpo; con un UUID el cuerpo se valida primero.
    for (const id of [foreign.course, crypto.randomUUID(), 'not-a-uuid']) {
      const read = await getAssignments(app, one.accessToken, id);
      const written = await putAssignments(app, one.accessToken, id, {
        assignments: id === 'not-a-uuid' ? 'mal' : [],
      });

      expect(read.status).toBe(404);
      expect(errorOf(read).code).toBe('NOT_FOUND');
      expect(written.status).toBe(404);
      expect(errorOf(written).code).toBe('NOT_FOUND');
    }
    await expect(assignmentCount()).resolves.toBe(0);
  });

  it('answers 401 without a session', async () => {
    const { app } = realApp();
    const id = crypto.randomUUID();

    const read = await request(app).get(`/api/courses/${id}/assignments`);
    const written = await request(app)
      .put(`/api/courses/${id}/assignments`)
      .send({ assignments: [] });

    expect(read.status).toBe(401);
    expect(written.status).toBe(401);
    expect(written.headers['www-authenticate']).toBe('Bearer');
  });

  describe('the cascades', () => {
    async function assigned() {
      const apps = realApp();
      const { app } = apps;
      const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
      const setup = await setUp(app, accessToken);
      const saved = await putAssignments(app, accessToken, setup.course, {
        assignments: [
          cell(setup.english, setup.classA, setup.ana),
          cell(setup.english, setup.classB, setup.luis),
          cell(setup.language, setup.classA, setup.ana),
        ],
      });
      expect(saved.status).toBe(200);
      return { app, accessToken, setup };
    }

    it('drops the assignments of a subject marked «not taught» in the workload of the course', async () => {
      const { app, accessToken, setup } = await assigned();

      const response = await request(app)
        .patch(`/api/courses/${setup.course}/workload`)
        .set(authorized(accessToken))
        .send({
          changes: [
            { subjectId: setup.english, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
          ],
        });

      expect(response.status).toBe(200);
      expect(matrixOf(await getAssignments(app, accessToken, setup.course)).assignments).toEqual([
        cell(setup.language, setup.classA, setup.ana),
      ]);
    });

    it('drops the assignments of a class that is removed when the course is edited', async () => {
      const { app, accessToken, setup } = await assigned();

      const response = await request(app)
        .put(`/api/courses/${setup.course}`)
        .set(authorized(accessToken))
        .send({ name: '1º Primaria', classes: [{ id: setup.classA, name: 'A' }] });

      expect(response.status).toBe(200);
      expect(matrixOf(await getAssignments(app, accessToken, setup.course)).assignments).toEqual([
        cell(setup.english, setup.classA, setup.ana),
        cell(setup.language, setup.classA, setup.ana),
      ]);
    });

    it('drops the assignments of a deleted subject', async () => {
      const { app, accessToken, setup } = await assigned();

      const response = await request(app)
        .delete(`/api/subjects/${setup.english}`)
        .set(authorized(accessToken));

      expect(response.status).toBe(200);
      await expect(assignmentCount()).resolves.toBe(1);
    });

    it('drops the assignments of a deleted professor and keeps the rest', async () => {
      const { app, accessToken, setup } = await assigned();

      const response = await request(app)
        .delete(`/api/professors/${setup.luis}`)
        .set(authorized(accessToken));

      expect(response.status).toBe(200);
      expect(matrixOf(await getAssignments(app, accessToken, setup.course)).assignments).toEqual([
        cell(setup.english, setup.classA, setup.ana),
        cell(setup.language, setup.classA, setup.ana),
      ]);
    });

    it('drops every assignment of a deleted course', async () => {
      const { app, accessToken, setup } = await assigned();

      const response = await request(app)
        .delete(`/api/courses/${setup.course}`)
        .set(authorized(accessToken));

      expect(response.status).toBe(200);
      await expect(assignmentCount()).resolves.toBe(0);
    });
  });

  it('gives each professor the subjects they teach, in the list, the read, the edition and the creation', async () => {
    const { app } = realApp();
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const setup = await setUp(app, accessToken);
    await putAssignments(app, accessToken, setup.course, {
      assignments: [
        cell(setup.language, setup.classB, setup.ana),
        cell(setup.english, setup.classB, setup.ana),
        cell(setup.english, setup.classA, setup.ana),
      ],
    });
    const labels = (professor: {
      subjects: {
        subjectName: string;
        className: string;
        courseName: string;
        sessionsPerWeek: number;
      }[];
    }) =>
      professor.subjects.map(
        ({ subjectName, courseName, className, sessionsPerWeek }) =>
          `${subjectName} ${courseName} ${className} ${String(sessionsPerWeek)}`,
      );
    const expected = ['Inglés 1º Primaria A 3', 'Inglés 1º Primaria B 3', 'Lengua 1º Primaria B 5'];

    const list = await request(app).get('/api/professors').set(authorized(accessToken));
    const read = await request(app)
      .get(`/api/professors/${setup.ana}`)
      .set(authorized(accessToken));
    const edited = await request(app)
      .put(`/api/professors/${setup.ana}`)
      .set(authorized(accessToken))
      .send({ firstName: 'Ana María', lastName: 'García' });
    const created = await request(app)
      .post('/api/professors')
      .set(authorized(accessToken))
      .send({ firstName: 'Eva', lastName: 'Gil' });

    type P = Parameters<typeof labels>[0];
    const professors = (list.body as { data: { professors: ({ id: string } & P)[] } }).data
      .professors;
    expect(labels(professors.find(({ id }) => id === setup.ana) as P)).toEqual(expected);
    expect(professors.find(({ id }) => id === setup.luis)?.subjects).toEqual([]);
    expect(labels((read.body as { data: { professor: P } }).data.professor)).toEqual(expected);
    expect(labels((edited.body as { data: { professor: P } }).data.professor)).toEqual(expected);
    expect((created.body as { data: { professor: P } }).data.professor.subjects).toEqual([]);
  });

  it('logs the events with identifiers and counts, and never a name', async () => {
    const apps = realApp();
    const { app } = apps;
    const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
    const setup = await setUp(app, accessToken);
    await putAssignments(app, accessToken, setup.course, {
      assignments: [cell(setup.english, setup.classA, setup.ana)],
    });
    await putAssignments(app, accessToken, crypto.randomUUID(), { assignments: [] });
    await putAssignments(app, accessToken, setup.course, {
      assignments: [cell(setup.english, setup.classA, crypto.randomUUID())],
    });

    const lines = apps.logOutput().split('\n');
    const updated = lines.find((line) => line.includes('COURSE_ASSIGNMENTS_UPDATED'));
    const rejected = lines.filter((line) => line.includes('COURSE_ASSIGNMENTS_UPDATE_REJECTED'));

    expect(JSON.parse(updated ?? '{}')).toMatchObject({
      event: 'COURSE_ASSIGNMENTS_UPDATED',
      course_id: setup.course,
      added: 1,
      removed: 0,
      changed: 0,
    });
    expect(rejected.map((line) => (JSON.parse(line) as { reason: string }).reason)).toEqual([
      'not_found',
      'invalid_reference',
    ]);
    expect(apps.logOutput()).not.toMatch(/Ana|García|Inglés|Lengua|Primaria/);
  });

  describe('races', () => {
    const ROUNDS = 3;

    it('keeps the whole state of one of two simultaneous saves of the same course', async () => {
      const { app } = realApp();
      const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
      const setup = await setUp(app, accessToken);
      const first = [
        cell(setup.english, setup.classA, setup.ana),
        cell(setup.english, setup.classB, setup.ana),
      ];
      const second = [cell(setup.language, setup.classA, setup.luis)];

      for (let round = 0; round < ROUNDS; round += 1) {
        const responses = await Promise.all([
          putAssignments(app, accessToken, setup.course, { assignments: first }),
          putAssignments(app, accessToken, setup.course, { assignments: second }),
        ]);

        expect(responses.map(({ status }) => status)).toEqual([200, 200]);
        const stored = matrixOf(await getAssignments(app, accessToken, setup.course)).assignments;
        expect([first, second].map((state) => JSON.stringify(state))).toContain(
          JSON.stringify(stored),
        );
      }
    });

    it('survives a save against the workload that stops teaching the subject, with no orphans', async () => {
      const { app } = realApp();
      const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
      const setup = await setUp(app, accessToken);

      for (let round = 0; round < ROUNDS; round += 1) {
        await request(app)
          .patch(`/api/courses/${setup.course}/workload`)
          .set(authorized(accessToken))
          .send({
            changes: [
              { subjectId: setup.english, sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
            ],
          });
        const responses = await Promise.all([
          putAssignments(app, accessToken, setup.course, {
            assignments: [cell(setup.english, setup.classA, setup.ana)],
          }),
          request(app)
            .patch(`/api/courses/${setup.course}/workload`)
            .set(authorized(accessToken))
            .send({
              changes: [
                {
                  subjectId: setup.english,
                  sessionsPerWeek: null,
                  maxPerDay: null,
                  blockSize: null,
                },
              ],
            }),
        ]);

        expect([200, 400]).toContain(responses[0].status);
        expect(responses[1].status).toBe(200);
        await expect(
          testPrisma.professorAssignment.count({ where: { subjectId: setup.english } }),
        ).resolves.toBe(0);
      }
    });

    it('survives a save against the edition that removes the class, with no orphans', async () => {
      const { app } = realApp();
      const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
      const setup = await setUp(app, accessToken);

      for (let round = 0; round < ROUNDS; round += 1) {
        const extra = await request(app)
          .put(`/api/courses/${setup.course}`)
          .set(authorized(accessToken))
          .send({
            name: '1º Primaria',
            classes: [
              { id: setup.classA, name: 'A', tutorId: setup.ana },
              { id: setup.classB, name: 'B' },
              { name: `T${String(round)}` },
            ],
          });
        expect(extra.status).toBe(200);
        const extraId = (
          extra.body as { data: { course: { classes: { id: string; name: string }[] } } }
        ).data.course.classes.find(({ name }) => name === `T${String(round)}`)?.id as string;

        const responses = await Promise.all([
          putAssignments(app, accessToken, setup.course, {
            assignments: [cell(setup.english, extraId, setup.luis)],
          }),
          request(app)
            .put(`/api/courses/${setup.course}`)
            .set(authorized(accessToken))
            .send({
              name: '1º Primaria',
              classes: [
                { id: setup.classA, name: 'A', tutorId: setup.ana },
                { id: setup.classB, name: 'B' },
              ],
            }),
        ]);

        expect([200, 400]).toContain(responses[0].status);
        expect(responses[1].status).toBe(200);
        await expect(
          testPrisma.professorAssignment.count({ where: { classId: extraId } }),
        ).resolves.toBe(0);
        await putAssignments(app, accessToken, setup.course, { assignments: [] });
      }
    });

    it('survives a save against the deletion of the professor, with no orphans', async () => {
      const { app } = realApp();
      const { accessToken } = await adminOf(app, 'CEIP Uno', 'uno@example.com');
      const setup = await setUp(app, accessToken);

      for (let round = 0; round < ROUNDS; round += 1) {
        const created = await request(app)
          .post('/api/professors')
          .set(authorized(accessToken))
          .send({ firstName: 'Tmp', lastName: `Prof${String(round)}` });
        const professor = (created.body as { data: { professor: { id: string } } }).data.professor
          .id;

        const responses = await Promise.all([
          putAssignments(app, accessToken, setup.course, {
            assignments: [cell(setup.english, setup.classA, professor)],
          }),
          request(app).delete(`/api/professors/${professor}`).set(authorized(accessToken)),
        ]);

        expect([200, 400]).toContain(responses[0].status);
        expect(responses[1].status).toBe(200);
        await expect(
          testPrisma.professorAssignment.count({ where: { professorId: professor } }),
        ).resolves.toBe(0);
        await putAssignments(app, accessToken, setup.course, { assignments: [] });
      }
    });
  });
});
