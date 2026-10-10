import { describe, expectTypeOf, it } from 'vitest';
import type { components } from './generated/schema';

// Comprobaciones de tipos: fallan en `npm run typecheck` si los tipos generados desde
// docs/api-spec.yml dejan de reflejar el contrato del registro.
type Schemas = components['schemas'];

describe('generated API types', () => {
  it('describe the registration request', () => {
    expectTypeOf<Schemas['RegisterRequest']>().toEqualTypeOf<{
      schoolName: string;
      municipalityCode: string;
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      captcha: Schemas['CaptchaToken'];
    }>();
    expectTypeOf<Schemas['CaptchaToken']['version']>().toEqualTypeOf<'v3' | 'v2'>();
  });

  it('describe the registration response without credentials', () => {
    expectTypeOf<Schemas['RegisterResponse']['data']['user']>().toEqualTypeOf<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    }>();
    expectTypeOf<Schemas['RegisterResponse']['data']['school']>().toEqualTypeOf<{
      id: string;
      name: string;
      municipality: Schemas['Municipality'];
    }>();
  });

  it('include the registration error codes', () => {
    expectTypeOf<
      | 'VALIDATION_ERROR'
      | 'EMAIL_ALREADY_REGISTERED'
      | 'SCHOOL_ALREADY_REGISTERED'
      | 'CAPTCHA_CHALLENGE_REQUIRED'
      | 'CAPTCHA_FAILED'
      | 'TOO_MANY_REQUESTS'
    >().toExtend<Schemas['ErrorCode']>();
  });

  it('require the Retry-After header on 429 responses', () => {
    // Una cabecera opcional se tiparía como `number | undefined`.
    expectTypeOf<
      components['responses']['TooManyRequests']['headers']['Retry-After']
    >().toEqualTypeOf<number>();
  });

  it('describe field errors as { field, code }', () => {
    expectTypeOf<Schemas['FieldError']>().toEqualTypeOf<{
      field: string;
      code: Schemas['FieldErrorCode'];
    }>();
    expectTypeOf<Schemas['FieldErrorCode']>().toEqualTypeOf<
      'REQUIRED' | 'INVALID_LENGTH' | 'INVALID_FORMAT' | 'INVALID_CHARACTERS' | 'WEAK_PASSWORD'
    >();
  });

  it('keep the registration response body without tokens', () => {
    expectTypeOf<keyof Schemas['RegisterResponse']['data']>().toEqualTypeOf<'user' | 'school'>();
  });

  it('describe the refresh response with session, user and school', () => {
    expectTypeOf<Schemas['SessionResponse']['data']>().toEqualTypeOf<{
      session: Schemas['Session'];
      user: Schemas['SessionUser'];
      school: Schemas['SessionSchool'];
    }>();
    expectTypeOf<Schemas['Session']>().toEqualTypeOf<{ accessToken: string; expiresIn: 900 }>();
    expectTypeOf<Schemas['SessionUser']>().toEqualTypeOf<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role: 'ADMIN' | 'MEMBER';
    }>();
    expectTypeOf<Schemas['SessionSchool']>().toEqualTypeOf<{ id: string; name: string }>();
  });

  it('include the captcha unavailable code', () => {
    expectTypeOf<'CAPTCHA_UNAVAILABLE'>().toExtend<Schemas['ErrorCode']>();
  });

  it('include the session error codes', () => {
    expectTypeOf<'INVALID_SESSION' | 'ORIGIN_NOT_ALLOWED'>().toExtend<Schemas['ErrorCode']>();
  });

  it('describe the municipality catalog', () => {
    expectTypeOf<Schemas['Municipality']>().toEqualTypeOf<{
      code: string;
      name: string;
      province: string;
    }>();
    expectTypeOf<Schemas['MunicipalityListResponse']['data']>().toEqualTypeOf<
      Schemas['Municipality'][]
    >();
  });
});
