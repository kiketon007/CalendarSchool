import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CaptchaChallengeRequired,
  CaptchaFailed,
} from '../../application/registration/captchaVerifier.js';
import type {
  Registration,
  RegisterSchoolResult,
} from '../../application/registration/registerSchool.js';
import { ValidationError } from '../../application/validationError.js';
import {
  EmailAlreadyRegistered,
  SchoolAlreadyRegistered,
} from '../../domain/registration/registrationErrors.js';
import { createApp, type AppDependencies } from '../../app.js';
import { createLogger } from '../../infrastructure/logger.js';
import { unusedUseCases } from '../../../test/support/appDoubles.js';

const body = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  password: 'Secreta123!',
  captcha: { version: 'v3', token: 'token' },
};

const created: Registration = {
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
  },
  school: {
    id: '0192f5a0-0000-7000-8000-000000000001',
    name: 'CEIP Lluís Vives',
    municipality: { code: '46250', name: 'València', province: 'Valencia/València' },
  },
};

const PLAIN_REFRESH_TOKEN = 'plain-refresh-token';
const result: RegisterSchoolResult = { registration: created, refreshToken: PLAIN_REFRESH_TOKEN };

describe('POST /api/auth/register', () => {
  let execute: ReturnType<typeof vi.fn<AppDependencies['registerSchool']['execute']>>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    execute = vi.fn<AppDependencies['registerSchool']['execute']>().mockResolvedValue(result);
    app = createApp({
      ...unusedUseCases,
      registerSchool: { execute },
      databasePing: { ping: () => Promise.resolve(true) },
      logger: createLogger('silent'),
    });
  });

  it('responds 201 with the user and the school, without credentials', async () => {
    const response = await request(app).post('/api/auth/register').send(body);

    expect(response.status).toBe(201);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ success: true, data: created });
    expect(JSON.stringify(response.body)).not.toContain(PLAIN_REFRESH_TOKEN);
    const text = JSON.stringify(response.body).toLowerCase();
    expect(text).not.toContain('password');
    expect(text).not.toContain('hash');
  });

  it('passes the body, the client ip and the user agent to the use case', async () => {
    await request(app)
      .post('/api/auth/register')
      .set('User-Agent', 'Mozilla/5.0 (test)')
      .send(body);

    expect(execute).toHaveBeenCalledWith(body, {
      ip: expect.stringMatching(/127\.0\.0\.1|::1|::ffff:127\.0\.0\.1/) as string,
      userAgent: 'Mozilla/5.0 (test)',
    });
  });

  it('responds 400 VALIDATION_ERROR with one detail per invalid field', async () => {
    execute.mockRejectedValueOnce(
      new ValidationError([
        { field: 'email', code: 'INVALID_FORMAT' },
        { field: 'password', code: 'WEAK_PASSWORD' },
      ]),
    );

    const response = await request(app).post('/api/auth/register').send(body);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        details: [
          { field: 'email', code: 'INVALID_FORMAT' },
          { field: 'password', code: 'WEAK_PASSWORD' },
        ],
      },
    });
  });

  it.each([
    ['EMAIL_ALREADY_REGISTERED', new EmailAlreadyRegistered()],
    ['SCHOOL_ALREADY_REGISTERED', new SchoolAlreadyRegistered()],
  ])('responds 409 %s', async (code, error) => {
    execute.mockRejectedValueOnce(error);

    const response = await request(app).post('/api/auth/register').send(body);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      error: { code, message: expect.any(String) },
    });
  });

  it.each([
    ['CAPTCHA_FAILED', new CaptchaFailed()],
    ['CAPTCHA_CHALLENGE_REQUIRED', new CaptchaChallengeRequired()],
  ])('responds 422 %s', async (code, error) => {
    execute.mockRejectedValueOnce(error);

    const response = await request(app).post('/api/auth/register').send(body);

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      success: false,
      error: { code, message: expect.any(String) },
    });
  });

  it('responds 400 INVALID_JSON for a malformed body without calling the use case', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"schoolName":');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(execute).not.toHaveBeenCalled();
  });

  it('responds 413 PAYLOAD_TOO_LARGE for a body over 100 KB', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ ...body, schoolName: 'x'.repeat(101 * 1024) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(execute).not.toHaveBeenCalled();
  });

  it('responds 415 UNSUPPORTED_MEDIA_TYPE for an unsupported charset', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set('Content-Type', 'application/json; charset=latin-9')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('hands a request without body to the use case, which reports the missing fields', async () => {
    await request(app).post('/api/auth/register');

    expect(execute).toHaveBeenCalledWith(undefined, expect.any(Object));
  });

  it('responds 500 INTERNAL_ERROR without details for an unexpected failure', async () => {
    execute.mockRejectedValueOnce(new Error('secreto interno'));

    const response = await request(app).post('/api/auth/register').send(body);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('secreto interno');
  });
});
