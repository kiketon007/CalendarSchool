import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Municipality } from '../../domain/municipality/municipality.js';
import type { MunicipalityRepository } from '../../domain/municipality/municipalityRepository.js';
import {
  EmailAlreadyRegistered,
  SchoolAlreadyRegistered,
} from '../../domain/registration/registrationErrors.js';
import type { RegistrationRepository } from '../../domain/registration/registrationRepository.js';
import type { RefreshToken } from '../../domain/session/refreshToken.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { CreateSession, NewSession } from '../session/createSession.js';
import { ValidationError } from '../validationError.js';
import { CaptchaFailed, type CaptchaVerifier } from './captchaVerifier.js';
import type { IdGenerator } from './idGenerator.js';
import type { PasswordHasher } from './passwordHasher.js';
import { RegisterSchool } from './registerSchool.js';

const VALENCIA: Municipality = { code: '46250', name: 'València', province: 'Valencia/València' };
const PASSWORD = 'Secreta123!';
const PASSWORD_HASH = '$2b$12$hash-simulado';
const CONTEXT = { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (test)' };
const PLAIN_REFRESH_TOKEN = 'plain-refresh-token';
const REFRESH_TOKEN: RefreshToken = {
  id: 'refresh-token-id',
  userId: 'id-2',
  tokenHash: 'f'.repeat(64),
  expiresAt: new Date('2026-10-10T10:00:00Z'),
  revokedAt: null,
  userAgent: CONTEXT.userAgent,
  ipAddress: CONTEXT.ip,
};
const NEW_SESSION: NewSession = { token: PLAIN_REFRESH_TOKEN, refreshToken: REFRESH_TOKEN };

const validBody = {
  schoolName: '  C.E.I.P. Nº 3  ',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: '  Jose.Garcia@Example.COM ',
  password: PASSWORD,
  captcha: { version: 'v3', token: 'token' },
};

describe('RegisterSchool', () => {
  let calls: string[];
  let existsUserByEmail: Mock<RegistrationRepository['existsUserByEmail']>;
  let existsSchool: Mock<RegistrationRepository['existsSchool']>;
  let createSchoolWithAdmin: Mock<RegistrationRepository['createSchoolWithAdmin']>;
  let findByCode: Mock<MunicipalityRepository['findByCode']>;
  let hash: Mock<PasswordHasher['hash']>;
  let verify: Mock<CaptchaVerifier['verify']>;
  let createSession: Mock<CreateSession['create']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let registerSchool: RegisterSchool;

  beforeEach(() => {
    calls = [];
    /** Mock que anota su nombre en `calls` al ejecutarse y devuelve `value`. */
    const track = <T>(name: string, value: T) =>
      vi.fn(() => {
        calls.push(name);
        return Promise.resolve(value);
      });
    existsUserByEmail = track('existsUserByEmail', false);
    existsSchool = track('existsSchool', false);
    createSchoolWithAdmin = track('createSchoolWithAdmin', undefined);
    findByCode = track('findByCode', VALENCIA as Municipality | null);
    hash = track('hash', PASSWORD_HASH);
    verify = track('verify', undefined);
    createSession = vi.fn(() => {
      calls.push('createSession');
      return NEW_SESSION;
    });
    let nextId = 0;
    const ids: IdGenerator = { generate: () => `id-${++nextId}` };
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();

    registerSchool = new RegisterSchool({
      registrationRepository: { existsUserByEmail, existsSchool, createSchoolWithAdmin },
      municipalityRepository: { findAll: vi.fn(), findByCode },
      passwordHasher: { hash },
      idGenerator: ids,
      captchaVerifier: { verify },
      createSession: { create: createSession },
      logger: { info, warn },
    });
  });

  it('runs captcha, validation, email, school, session and creation in that order', async () => {
    await registerSchool.execute(validBody, CONTEXT);

    expect(calls).toEqual([
      'verify',
      'findByCode',
      'existsUserByEmail',
      'existsSchool',
      'hash',
      'createSession',
      'createSchoolWithAdmin',
    ]);
  });

  it('creates an ACTIVE administrator and a school with normalized values', async () => {
    const result = await registerSchool.execute(validBody, CONTEXT);

    expect(createSchoolWithAdmin).toHaveBeenCalledWith(
      {
        id: 'id-1',
        name: 'C.E.I.P. Nº 3',
        normalizedName: 'ceipn3',
        municipalityCode: '46250',
      },
      {
        id: 'id-2',
        schoolId: 'id-1',
        email: 'jose.garcia@example.com',
        passwordHash: PASSWORD_HASH,
        firstName: 'José María',
        lastName: 'García-López',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
      REFRESH_TOKEN,
    );
    expect(hash).toHaveBeenCalledWith(PASSWORD);
    expect(result.registration).toEqual({
      user: {
        id: 'id-2',
        email: 'jose.garcia@example.com',
        firstName: 'José María',
        lastName: 'García-López',
      },
      school: { id: 'id-1', name: 'C.E.I.P. Nº 3', municipality: VALENCIA },
    });
  });

  it('creates the session of the new administrator in the same registration', async () => {
    const result = await registerSchool.execute(validBody, CONTEXT);

    expect(createSession).toHaveBeenCalledWith('id-2', CONTEXT);
    expect(result.refreshToken).toBe(PLAIN_REFRESH_TOKEN);
  });

  it('keeps the plain refresh token out of the registration data and issues no access token', async () => {
    const { registration } = await registerSchool.execute(validBody, CONTEXT);

    const serialized = JSON.stringify(registration);
    expect(serialized).not.toContain(PLAIN_REFRESH_TOKEN);
    expect(serialized).not.toContain(REFRESH_TOKEN.tokenHash);
    expect(registration).not.toHaveProperty('session');
  });

  it('logs USER_REGISTER_SUCCESS with the masked email, ip and user agent', async () => {
    await registerSchool.execute(validBody, CONTEXT);

    expect(info).toHaveBeenCalledWith(
      {
        event: 'USER_REGISTER_SUCCESS',
        email: 'j***@example.com',
        ip: '203.0.113.7',
        user_agent: 'Mozilla/5.0 (test)',
      },
      expect.any(String),
    );
  });

  it('stops at a rejected captcha without validating or querying anything', async () => {
    verify.mockRejectedValueOnce(new CaptchaFailed());
    calls.length = 0;

    await expect(registerSchool.execute(validBody, CONTEXT)).rejects.toBeInstanceOf(CaptchaFailed);

    expect(calls).toEqual([]);
    expect(createSession).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('passes the captcha field of the request, unvalidated, to the verifier', async () => {
    await registerSchool.execute(validBody, CONTEXT);
    await registerSchool.execute('no es un objeto', CONTEXT).catch(() => undefined);

    expect(verify).toHaveBeenNthCalledWith(1, validBody.captcha);
    expect(verify).toHaveBeenNthCalledWith(2, undefined);
  });

  describe('invalid payload', () => {
    it('throws ValidationError with the details without querying the database', async () => {
      const body = { ...validBody, email: 'sin-arroba' };
      calls.length = 0;

      const error: unknown = await registerSchool.execute(body, CONTEXT).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual([
        { field: 'email', code: 'INVALID_FORMAT' },
      ]);
      expect(calls).toEqual(['verify']);
      expect(createSession).not.toHaveBeenCalled();
    });

    it('logs USER_REGISTER_FAILED with the masked email', async () => {
      await registerSchool
        .execute({ ...validBody, email: 'jose@example.com', password: 'corta' }, CONTEXT)
        .catch(() => undefined);

      expect(warn).toHaveBeenCalledWith(
        {
          event: 'USER_REGISTER_FAILED',
          email: 'j***@example.com',
          ip: '203.0.113.7',
          user_agent: 'Mozilla/5.0 (test)',
        },
        expect.any(String),
      );
    });

    it('logs USER_REGISTER_FAILED without email when the body has none', async () => {
      await registerSchool.execute({}, CONTEXT).catch(() => undefined);

      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'USER_REGISTER_FAILED', email: undefined }),
        expect.any(String),
      );
    });

    it('rejects a municipality that does not exist with INVALID_FORMAT', async () => {
      findByCode.mockResolvedValueOnce(null);

      const error: unknown = await registerSchool
        .execute({ ...validBody, municipalityCode: '99999' }, CONTEXT)
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).details).toEqual([
        { field: 'municipalityCode', code: 'INVALID_FORMAT' },
      ]);
      expect(existsUserByEmail).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'USER_REGISTER_FAILED' }),
        expect.any(String),
      );
    });
  });

  describe('duplicates', () => {
    it('throws EmailAlreadyRegistered before checking the school and logs reason EMAIL', async () => {
      existsUserByEmail.mockResolvedValueOnce(true);
      existsSchool.mockResolvedValueOnce(true);

      await expect(registerSchool.execute(validBody, CONTEXT)).rejects.toBeInstanceOf(
        EmailAlreadyRegistered,
      );

      expect(existsSchool).not.toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
      expect(createSchoolWithAdmin).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        {
          event: 'USER_REGISTER_DUPLICATE',
          reason: 'EMAIL',
          email: 'j***@example.com',
          ip: '203.0.113.7',
          user_agent: 'Mozilla/5.0 (test)',
        },
        expect.any(String),
      );
    });

    it('throws SchoolAlreadyRegistered with the normalized name and logs reason SCHOOL', async () => {
      existsSchool.mockResolvedValueOnce(true);

      await expect(registerSchool.execute(validBody, CONTEXT)).rejects.toBeInstanceOf(
        SchoolAlreadyRegistered,
      );

      expect(existsSchool).toHaveBeenCalledWith('ceipn3', '46250');
      expect(hash).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
      expect(createSchoolWithAdmin).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'USER_REGISTER_DUPLICATE', reason: 'SCHOOL' }),
        expect.any(String),
      );
    });

    it.each([
      ['EMAIL', new EmailAlreadyRegistered(), EmailAlreadyRegistered],
      ['SCHOOL', new SchoolAlreadyRegistered(), SchoolAlreadyRegistered],
    ])(
      'treats a concurrent duplicate detected by the database as reason %s',
      async (reason, error, errorClass) => {
        createSchoolWithAdmin.mockRejectedValueOnce(error);

        await expect(registerSchool.execute(validBody, CONTEXT)).rejects.toBeInstanceOf(errorClass);

        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'USER_REGISTER_DUPLICATE', reason }),
          expect.any(String),
        );
        expect(info).not.toHaveBeenCalled();
      },
    );

    it('propagates any other persistence error without logging a registration event', async () => {
      const failure = new Error('conexión perdida');
      createSchoolWithAdmin.mockRejectedValueOnce(failure);

      await expect(registerSchool.execute(validBody, CONTEXT)).rejects.toBe(failure);

      expect(info).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('never logs the password, its hash or the refresh token', async () => {
    await registerSchool.execute(validBody, CONTEXT);
    await registerSchool.execute({ ...validBody, email: 'x' }, CONTEXT).catch(() => undefined);
    existsSchool.mockResolvedValueOnce(true);
    await registerSchool.execute(validBody, CONTEXT).catch(() => undefined);

    const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(info).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(logged).not.toContain(PASSWORD);
    expect(logged).not.toContain(PASSWORD_HASH);
    expect(logged).not.toContain(PLAIN_REFRESH_TOKEN);
    expect(logged).not.toContain(REFRESH_TOKEN.tokenHash);
  });
});
