import { verify } from '@node-rs/bcrypt';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { realApp } from '../test/support/realApp.js';
import { testDatabaseUrl, testPrisma } from '../test/support/testPrisma.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';

const PASSWORD = 'Secreta123!';
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const validBody = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  password: PASSWORD,
  captcha: { version: 'v3', token: 'token-provisional' },
};

async function counts(): Promise<{ schools: number; users: number }> {
  return { schools: await testPrisma.school.count(), users: await testPrisma.user.count() };
}

describe('POST /api/auth/register against the test database', () => {
  it('creates the school and its ADMIN user and answers 201 without credentials', async () => {
    const { app } = realApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, email: '  Jose.Garcia@Example.COM  ' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      success: true,
      data: {
        user: {
          id: expect.stringMatching(UUID_V7) as string,
          email: 'jose.garcia@example.com',
          firstName: 'José María',
          lastName: 'García-López',
        },
        school: {
          id: expect.stringMatching(UUID_V7) as string,
          name: 'CEIP Lluís Vives',
          municipality: { code: '46250', name: 'València', province: 'Valencia/València' },
        },
      },
    });
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/i);

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { email: 'jose.garcia@example.com' },
      include: { school: true },
    });
    expect(user).toMatchObject({ role: 'ADMIN', status: 'ACTIVE', schoolId: user.school.id });
    expect(user.school).toMatchObject({
      name: 'CEIP Lluís Vives',
      normalizedName: 'ceiplluisvives',
      municipalityCode: '46250',
    });
    expect(user.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);
    await expect(verify(PASSWORD, user.passwordHash)).resolves.toBe(true);
  });

  it('stores the refresh token of the first session in the same registration', async () => {
    const { app } = realApp();

    const response = await request(app).post('/api/auth/register').send(validBody);

    const userId = (response.body as { data: { user: { id: string } } }).data.user.id;
    const tokens = await testPrisma.refreshToken.findMany({ where: { userId } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.id).toMatch(UUID_V7);
    expect(tokens[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokens[0]?.revokedAt).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain(tokens[0]?.tokenHash);
  });

  it('logs USER_REGISTER_SUCCESS with the masked email and never the password or its hash', async () => {
    const { app, logOutput } = realApp();

    await request(app)
      .post('/api/auth/register')
      .set('User-Agent', 'agente-de-prueba')
      .send(validBody);

    const stored = await testPrisma.user.findUniqueOrThrow({
      where: { email: validBody.email },
    });
    const output = logOutput();
    expect(output).toContain('USER_REGISTER_SUCCESS');
    expect(output).toContain('j***@example.com');
    expect(output).toContain('agente-de-prueba');
    expect(output).not.toContain(PASSWORD);
    expect(output).not.toContain(stored.passwordHash);
    expect(output).not.toContain('jose.garcia@example.com');
  });

  it('answers 409 EMAIL_ALREADY_REGISTERED for a repeated email without creating anything', async () => {
    const { app, logOutput } = realApp();
    await request(app).post('/api/auth/register').send(validBody);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, schoolName: 'Otro colegio', email: 'JOSE.GARCIA@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(await counts()).toEqual({ schools: 1, users: 1 });
    expect(logOutput()).toContain('USER_REGISTER_DUPLICATE');
  });

  it('answers 409 SCHOOL_ALREADY_REGISTERED for the same school written differently', async () => {
    const { app } = realApp();
    await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, schoolName: 'C.E.I.P. Nº 3' });

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, schoolName: 'ceip n 3', email: 'otro@example.com' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SCHOOL_ALREADY_REGISTERED');
    expect(await counts()).toEqual({ schools: 1, users: 1 });
  });

  it('answers EMAIL_ALREADY_REGISTERED, not SCHOOL, when both already exist', async () => {
    const { app } = realApp();
    await request(app).post('/api/auth/register').send(validBody);

    const response = await request(app).post('/api/auth/register').send(validBody);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('accepts the same school name in another municipality', async () => {
    const { app } = realApp();
    await request(app).post('/api/auth/register').send(validBody);

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, municipalityCode: '03014', email: 'otro@example.com' });

    expect(response.status).toBe(201);
    expect(await counts()).toEqual({ schools: 2, users: 2 });
  });

  it('answers 400 VALIDATION_ERROR with a detail per invalid field and stores nothing', async () => {
    const { app, logOutput } = realApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, email: 'sin-arroba', password: 'corta' });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
      details: [
        { field: 'email', code: 'INVALID_FORMAT' },
        { field: 'password', code: 'INVALID_LENGTH' },
      ],
    });
    expect(await counts()).toEqual({ schools: 0, users: 0 });
    expect(logOutput()).toContain('USER_REGISTER_FAILED');
  });

  it.each([
    ['missing', undefined, 'REQUIRED'],
    ['nonexistent', '99999', 'INVALID_FORMAT'],
    ['malformed', 'valencia', 'INVALID_FORMAT'],
  ])('answers 400 for a %s municipality', async (_case, municipalityCode, code) => {
    const { app } = realApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, municipalityCode });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ field: 'municipalityCode', code }]);
    expect(await counts()).toEqual({ schools: 0, users: 0 });
  });

  it('answers 400 reporting every missing field when only the captcha is sent', async () => {
    const { app } = realApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ captcha: { version: 'v3', token: 'token-provisional' } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toHaveLength(6);
  });

  it.each([
    ["'; DROP TABLE users; --", 'schoolName'],
    ['<img src=x onerror=alert(1)>', 'schoolName'],
    ['<script>alert(1)</script>', 'firstName'],
  ])('rejects the injection "%s" in %s and leaves the tables intact', async (payload, field) => {
    const { app } = realApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, [field]: payload });

    expect(response.status).toBe(400);
    expect(response.body.error.details).toEqual([{ field, code: 'INVALID_CHARACTERS' }]);
    expect(await counts()).toEqual({ schools: 0, users: 0 });
  });

  it('stores an email with SQL characters as inert text', async () => {
    const { app } = realApp();

    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...validBody, email: "o'brien+x@example.com" });

    expect(response.status).toBe(201);
    await expect(
      testPrisma.user.findUniqueOrThrow({ where: { email: "o'brien+x@example.com" } }),
    ).resolves.toBeTruthy();
  });

  it('creates only one of two simultaneous registrations with the same email', async () => {
    const { app } = realApp();

    const responses = await Promise.all([
      request(app)
        .post('/api/auth/register')
        .send({ ...validBody, schoolName: 'Colegio A' }),
      request(app)
        .post('/api/auth/register')
        .send({ ...validBody, schoolName: 'Colegio B' }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const rejected = responses.find(({ status }) => status === 409);
    expect(rejected?.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(await counts()).toEqual({ schools: 1, users: 1 });
  });

  it('creates only one of two simultaneous registrations of the same school', async () => {
    const { app } = realApp();

    const responses = await Promise.all([
      request(app)
        .post('/api/auth/register')
        .send({ ...validBody, email: 'a@example.com' }),
      request(app)
        .post('/api/auth/register')
        .send({ ...validBody, email: 'b@example.com' }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    const rejected = responses.find(({ status }) => status === 409);
    expect(rejected?.body.error.code).toBe('SCHOOL_ALREADY_REGISTERED');
    expect(await counts()).toEqual({ schools: 1, users: 1 });
  });

  it('answers 503 DATABASE_UNAVAILABLE when the database is unreachable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const unreachable = createPrismaClient({ connectionString: wrongCredentials.toString() });
    const { app, logOutput } = realApp({ prisma: unreachable });

    const response = await request(app).post('/api/auth/register').send(validBody);
    await unreachable.$disconnect();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: expect.any(String) },
    });
    expect(JSON.stringify(response.body)).not.toContain('wrong-password');
    expect(logOutput()).not.toContain('wrong-password');
    expect(await counts()).toEqual({ schools: 0, users: 0 });
  });
});

describe('GET /api/municipalities against the test database', () => {
  it('lists the 542 municipalities with a cacheable response', async () => {
    const { app } = realApp();

    const response = await request(app).get('/api/municipalities');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=86400');
    expect(response.body.data).toHaveLength(542);
    expect(response.body.data).toContainEqual({
      code: '46250',
      name: 'València',
      province: 'Valencia/València',
    });
  });

  it('answers 503 DATABASE_UNAVAILABLE when the database is unreachable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const unreachable = createPrismaClient({ connectionString: wrongCredentials.toString() });
    const { app } = realApp({ prisma: unreachable });

    const response = await request(app).get('/api/municipalities');
    await unreachable.$disconnect();

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(response.headers['cache-control']).toBeUndefined();
  });
});
