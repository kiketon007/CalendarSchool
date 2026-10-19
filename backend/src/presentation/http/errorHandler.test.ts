import { Writable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { CaptchaUnavailable } from '../../application/registration/captchaVerifier.js';
import { ValidationError } from '../../application/validationError.js';
import { TooManyAttempts } from '../../domain/attempts/tooManyAttempts.js';
import { AccountSuspended, InvalidCredentials } from '../../domain/login/loginErrors.js';
import {
  CannotSuspendSelf,
  LastAdminRequired,
  UserNotActive,
  UserNotFound,
} from '../../domain/user/userManagementErrors.js';
import { AccessLinkInvalid, InvitationNotFound } from '../../domain/accessLink/accessLinkErrors.js';
import { CourseAlreadyExists } from '../../domain/course/courseErrors.js';
import { createLogger } from '../../infrastructure/logger.js';
import { errorHandler } from './errorHandler.js';
import { defaultDependencies } from '../../../test/support/appDoubles.js';

function captureLogger() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { logger: createLogger('error', stream), output: () => chunks.join('') };
}

const app = createApp({
  databasePing: { ping: () => Promise.resolve(true) },
  logger: createLogger('silent'),
  ...defaultDependencies,
});

describe('unknown routes under /api', () => {
  it('respond 404 NOT_FOUND as JSON instead of the default HTML page', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});

describe('malformed JSON bodies', () => {
  it('respond 400 INVALID_JSON', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"a":');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'INVALID_JSON', message: expect.any(String) },
    });
  });
});

describe('bodies rejected by the JSON parser', () => {
  function appCapturingErrors() {
    const { logger, output } = captureLogger();
    const app = createApp({
      databasePing: { ping: () => Promise.resolve(true) },
      logger,
      ...defaultDependencies,
    });
    return { app, output };
  }

  it('respond 413 PAYLOAD_TOO_LARGE when the body exceeds 100 KB, without error logs', async () => {
    const { app, output } = appCapturingErrors();

    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(101 * 1024) }));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String) },
    });
    expect(output()).toBe('');
  });

  it('respond 415 UNSUPPORTED_MEDIA_TYPE for an unsupported charset, without error logs', async () => {
    const { app, output } = appCapturingErrors();

    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json; charset=latin-9')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: expect.any(String) },
    });
    expect(output()).toBe('');
  });

  it('respond 415 UNSUPPORTED_MEDIA_TYPE for an unsupported content encoding', async () => {
    const { app, output } = appCapturingErrors();

    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'compress-unknown')
      .send('{}');

    expect(response.status).toBe(415);
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(output()).toBe('');
  });
});

describe('unhandled errors', () => {
  function appThrowing(error: Error) {
    const { logger, output } = captureLogger();
    const failingApp = express();
    // Handler que rechaza de forma asíncrona: Express 5 lo envía al manejador de errores.
    failingApp.get('/api/boom', () => Promise.reject(error));
    failingApp.use(errorHandler(logger));
    return { failingApp, output };
  }

  it('respond 500 INTERNAL_ERROR without the original message or stack', async () => {
    const { failingApp } = appThrowing(new Error('secreto interno en la traza'));

    const response = await request(failingApp).get('/api/boom');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: expect.any(String) },
    });
    expect(JSON.stringify(response.body)).not.toContain('secreto interno');
  });

  it('log the stack trace of the error', async () => {
    const { failingApp, output } = appThrowing(new Error('secreto interno en la traza'));

    await request(failingApp).get('/api/boom');

    expect(output()).toContain('secreto interno en la traza');
    expect(output()).toContain('"stack"');
  });
});

describe('validation errors', () => {
  function appThrowingValidation(error: ValidationError) {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.get('/api/invalid', () => Promise.reject(error));
    failingApp.use(errorHandler(logger));
    return { failingApp, output };
  }

  it('respond 400 VALIDATION_ERROR with one { field, code } per invalid field', async () => {
    const { failingApp } = appThrowingValidation(
      new ValidationError([
        { field: 'email', code: 'INVALID_FORMAT' },
        { field: 'password', code: 'INVALID_LENGTH' },
      ]),
    );

    const response = await request(failingApp).get('/api/invalid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        details: [
          { field: 'email', code: 'INVALID_FORMAT' },
          { field: 'password', code: 'INVALID_LENGTH' },
        ],
      },
    });
  });

  it('are not logged as server errors', async () => {
    const { failingApp, output } = appThrowingValidation(
      new ValidationError([{ field: 'email', code: 'REQUIRED' }]),
    );

    await request(failingApp).get('/api/invalid');

    expect(output()).toBe('');
  });
});

describe('too many attempts', () => {
  function appThrowingTooManyAttempts(retryAfterSeconds: number) {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.post('/api/limited', () => Promise.reject(new TooManyAttempts(retryAfterSeconds)));
    failingApp.use(errorHandler(logger));
    return { failingApp, output };
  }

  it('respond 429 TOO_MANY_REQUESTS with the Retry-After header in whole seconds', async () => {
    const { failingApp } = appThrowingTooManyAttempts(300);

    const response = await request(failingApp).post('/api/limited');

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('300');
    expect(response.body).toEqual({
      success: false,
      error: { code: 'TOO_MANY_REQUESTS', message: expect.any(String) },
    });
  });

  it('does not reveal the key or the number of attempts', async () => {
    const { failingApp } = appThrowingTooManyAttempts(300);

    const response = await request(failingApp).post('/api/limited');

    expect(JSON.stringify(response.body)).not.toMatch(/register|203\.0\.113|\d+ intentos/i);
  });

  it('is not logged as a server error', async () => {
    const { failingApp, output } = appThrowingTooManyAttempts(60);

    await request(failingApp).post('/api/limited');

    expect(output()).toBe('');
  });
});

describe('database unavailable', () => {
  function appThrowingUnavailable() {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.get('/api/down', () =>
      Promise.reject(new DatabaseUnavailable(new Error('connect ECONNREFUSED 10.0.0.5:5432'))),
    );
    failingApp.use(errorHandler(logger));
    return { failingApp, output };
  }

  it('respond 503 DATABASE_UNAVAILABLE without exposing the cause', async () => {
    const { failingApp } = appThrowingUnavailable();

    const response = await request(failingApp).get('/api/down');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: expect.any(String) },
    });
    expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
  });

  it('log the cause so the failure leaves a trace', async () => {
    const { failingApp, output } = appThrowingUnavailable();

    await request(failingApp).get('/api/down');

    expect(output()).toContain('ECONNREFUSED');
  });
});

describe('captcha unavailable', () => {
  function appThrowingCaptchaUnavailable() {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.post('/api/captcha', () =>
      Promise.reject(new CaptchaUnavailable(new Error('connect ETIMEDOUT 142.250.0.1:443'))),
    );
    failingApp.use(errorHandler(logger));
    return { failingApp, output };
  }

  it('respond 503 CAPTCHA_UNAVAILABLE without exposing the cause', async () => {
    const { failingApp } = appThrowingCaptchaUnavailable();

    const response = await request(failingApp).post('/api/captcha');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'CAPTCHA_UNAVAILABLE', message: expect.any(String) },
    });
    expect(JSON.stringify(response.body)).not.toContain('142.250');
  });

  it('log the cause as an error so a misconfiguration or an outage leaves a trace', async () => {
    const { failingApp, output } = appThrowingCaptchaUnavailable();

    await request(failingApp).post('/api/captcha');

    expect(output()).toContain('ETIMEDOUT');
    expect(output()).toContain('"level":"error"');
  });
});

describe('invalid credentials', () => {
  function appThrowing(error: Error) {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.post('/api/login', () => Promise.reject(error));
    failingApp.use(errorHandler(logger));
    return { failingApp, output };
  }

  it('respond 401 INVALID_CREDENTIALS with the generic message', async () => {
    const { failingApp } = appThrowing(new InvalidCredentials('PASSWORD'));

    const response = await request(failingApp).post('/api/login');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos' },
    });
  });

  it('answers the same for a wrong password and for an email that is not registered', async () => {
    const wrongPassword = await request(
      appThrowing(new InvalidCredentials('PASSWORD')).failingApp,
    ).post('/api/login');
    const unknownEmail = await request(
      appThrowing(new InvalidCredentials('NOT_FOUND')).failingApp,
    ).post('/api/login');

    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(JSON.stringify(unknownEmail.body)).not.toMatch(/PASSWORD|NOT_FOUND/);
  });

  it('does not set any cookie', async () => {
    const { failingApp } = appThrowing(new InvalidCredentials('PASSWORD'));

    const response = await request(failingApp).post('/api/login');

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('is not logged as a server error', async () => {
    const { failingApp, output } = appThrowing(new InvalidCredentials('PASSWORD'));

    await request(failingApp).post('/api/login');

    expect(output()).toBe('');
  });
});

describe('account suspended', () => {
  function appThrowingAccountSuspended() {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.post('/api/login', () => Promise.reject(new AccountSuspended()));
    failingApp.use(errorHandler(logger));
    return { failingApp, output };
  }

  it('respond 403 ACCOUNT_SUSPENDED', async () => {
    const { failingApp } = appThrowingAccountSuspended();

    const response = await request(failingApp).post('/api/login');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'ACCOUNT_SUSPENDED', message: 'La cuenta está desactivada' },
    });
  });

  it('does not set any cookie', async () => {
    const { failingApp } = appThrowingAccountSuspended();

    const response = await request(failingApp).post('/api/login');

    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('is not logged as a server error', async () => {
    const { failingApp, output } = appThrowingAccountSuspended();

    await request(failingApp).post('/api/login');

    expect(output()).toBe('');
  });
});

describe('user management errors', () => {
  it.each([
    [new UserNotFound(), 404, 'NOT_FOUND', 'El usuario no existe'],
    [
      new LastAdminRequired(),
      409,
      'LAST_ADMIN_REQUIRED',
      'El colegio debe tener al menos un administrador activo',
    ],
    [
      new CannotSuspendSelf(),
      409,
      'CANNOT_SUSPEND_SELF',
      'Un usuario no puede darse de baja a sí mismo',
    ],
    [new UserNotActive(), 409, 'USER_NOT_ACTIVE', 'El usuario no está activo'],
  ])('respond %s with its status and code', async (error, status, code, message) => {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.post('/api/users/x', () => Promise.reject(error));
    failingApp.use(errorHandler(logger));

    const response = await request(failingApp).post('/api/users/x');

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ success: false, error: { code, message } });
    // Son errores del cliente: no se registran como fallos del servidor.
    expect(output()).toBe('');
  });
});

describe('course errors', () => {
  it('responds CourseAlreadyExists with 409 COURSE_ALREADY_EXISTS and does not log it as a server error', async () => {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.post('/api/courses', () => Promise.reject(new CourseAlreadyExists()));
    failingApp.use(errorHandler(logger));

    const response = await request(failingApp).post('/api/courses');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'COURSE_ALREADY_EXISTS',
        message: 'Ya existe un curso con ese nombre en el colegio',
      },
    });
    // Es un error del cliente: no se registra como fallo del servidor.
    expect(output()).toBe('');
  });
});

describe('invitation errors', () => {
  it('responds InvitationNotFound with 404 NOT_FOUND and does not log it as a server error', async () => {
    const { logger, output } = captureLogger();
    const failingApp = express();
    failingApp.post('/api/invitations/x/revoke', () => Promise.reject(new InvitationNotFound()));
    failingApp.use(errorHandler(logger));

    const response = await request(failingApp).post('/api/invitations/x/revoke');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'La invitación no existe' },
    });
    expect(output()).toBe('');
  });

  it.each(['TOKEN_MISSING', 'NOT_PENDING'] as const)(
    'responds AccessLinkInvalid (%s) with 410 ACCESS_LINK_INVALID and the same message, without logging a server error',
    async (reason) => {
      const { logger, output } = captureLogger();
      const failingApp = express();
      failingApp.post('/api/invitations/accept', () =>
        Promise.reject(new AccessLinkInvalid(reason)),
      );
      failingApp.use(errorHandler(logger));

      const response = await request(failingApp).post('/api/invitations/accept');

      expect(response.status).toBe(410);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'ACCESS_LINK_INVALID', message: 'El enlace no es válido o ha caducado' },
      });
      expect(output()).toBe('');
    },
  );
});
