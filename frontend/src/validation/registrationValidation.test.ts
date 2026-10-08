import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import { fieldCases, type RegistrationFieldName } from '../testSupport/registrationFixtures';
import {
  REGISTRATION_FIELDS,
  validateField,
  validateRegistration,
  type RegistrationFormValues,
} from './registrationValidation';

const validValues: RegistrationFormValues = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  password: 'Secreta123!',
};

describe('validateField (shared table of examples with the backend)', () => {
  describe.each(REGISTRATION_FIELDS)('field %s', (field: RegistrationFieldName) => {
    const { valid, invalid } = fieldCases(field);

    it.each(valid.map((value) => [value]))('accepts %j', (value) => {
      expect(validateField(field, value ?? '')).toBeUndefined();
    });

    it.each(invalid.map(({ value, code }) => [value, code]))(
      'rejects %j with %s',
      (value, code) => {
        expect(validateField(field, value ?? '')).toBe(code);
      },
    );

    it('has a Spanish message for every code it can produce', () => {
      const messages = (
        es.registration.errors as unknown as Record<string, Record<string, string>>
      )[field];
      for (const { code } of invalid) {
        expect(messages?.[code], `${field}.${code}`).toEqual(expect.any(String));
      }
    });
  });
});

describe('validateRegistration', () => {
  it('returns no errors for valid values', () => {
    expect(validateRegistration(validValues)).toEqual({});
  });

  it('returns one error per invalid field, keyed by field', () => {
    expect(
      validateRegistration({
        ...validValues,
        municipalityCode: '',
        email: 'sin-arroba',
        password: 'corta',
      }),
    ).toEqual({
      municipalityCode: 'REQUIRED',
      email: 'INVALID_FORMAT',
      password: 'INVALID_LENGTH',
    });
  });

  it('reports every field as REQUIRED for an empty form', () => {
    expect(
      validateRegistration({
        schoolName: '',
        municipalityCode: '',
        firstName: '',
        lastName: '',
        email: '',
        password: '',
      }),
    ).toEqual({
      schoolName: 'REQUIRED',
      municipalityCode: 'REQUIRED',
      firstName: 'REQUIRED',
      lastName: 'REQUIRED',
      email: 'REQUIRED',
      password: 'REQUIRED',
    });
  });

  it('measures the password in UTF-8 bytes, like the backend (Bcrypt ignores the rest)', () => {
    const seventyTwoBytes = `Aa1!${'ñ'.repeat(34)}`;

    expect(validateField('password', seventyTwoBytes)).toBeUndefined();
    expect(validateField('password', `${seventyTwoBytes}a`)).toBe('INVALID_LENGTH');
  });

  it('does not trim the password, which is hashed as typed', () => {
    expect(validateField('password', '        ')).toBe('WEAK_PASSWORD');
  });
});
