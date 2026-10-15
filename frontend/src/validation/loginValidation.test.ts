import { describe, expect, it } from 'vitest';
import { fieldCases } from '../testSupport/registrationFixtures';
import {
  LOGIN_FIELDS,
  validateLogin,
  validateLoginField,
  type LoginFormValues,
} from './loginValidation';

const validValues: LoginFormValues = { email: 'jose.garcia@example.com', password: 'Secreta123!' };

describe('validateLoginField', () => {
  describe('email (shared table of examples with the registration and the backend)', () => {
    const { valid, invalid } = fieldCases('email');

    it.each(valid.map((value) => [value]))('accepts %j', (value) => {
      expect(validateLoginField('email', (value as string | undefined) ?? '')).toBeUndefined();
    });

    it.each(invalid.map(({ value, code }) => [value, code]))(
      'rejects %j with %s',
      (value, code) => {
        expect(validateLoginField('email', (value as string | undefined) ?? '')).toBe(code);
      },
    );
  });

  describe('password', () => {
    it.each([
      ['a password the registration would call weak', 'secreta'],
      ['a password shorter than the registration minimum', 'abc'],
      ['a password made of spaces', '   '],
      ['a password of exactly 72 bytes', 'a'.repeat(72)],
      ['a password of exactly 72 bytes with multi-byte characters', 'Aa1!' + 'ñ'.repeat(34)],
    ])('accepts %s', (_case, password) => {
      expect(validateLoginField('password', password)).toBeUndefined();
    });

    it('rejects an empty password with REQUIRED', () => {
      expect(validateLoginField('password', '')).toBe('REQUIRED');
    });

    it.each([
      ['73 bytes', 'a'.repeat(73)],
      ['40 characters that exceed 72 bytes', 'ñ'.repeat(40)],
    ])('rejects %s with INVALID_LENGTH', (_case, password) => {
      expect(validateLoginField('password', password)).toBe('INVALID_LENGTH');
    });
  });
});

describe('validateLogin', () => {
  it('lists the fields of the form in the order they are shown', () => {
    expect(LOGIN_FIELDS).toEqual(['email', 'password']);
  });

  it('returns no errors for valid values', () => {
    expect(validateLogin(validValues)).toEqual({});
  });

  it('returns one error per invalid field, keyed by field', () => {
    expect(validateLogin({ email: 'sin-arroba', password: '' })).toEqual({
      email: 'INVALID_FORMAT',
      password: 'REQUIRED',
    });
  });

  it('returns only the error of the field that is invalid', () => {
    expect(validateLogin({ ...validValues, email: '' })).toEqual({ email: 'REQUIRED' });
    expect(validateLogin({ ...validValues, password: '' })).toEqual({ password: 'REQUIRED' });
  });

  it('does not trim the password: it is compared exactly as it was typed', () => {
    expect(validateLogin({ ...validValues, password: '   ' })).toEqual({});
  });
});
