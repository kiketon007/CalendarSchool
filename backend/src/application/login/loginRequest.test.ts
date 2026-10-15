import { describe, expect, it } from 'vitest';
import { fieldCases } from '../../../test/support/registrationFixtures.js';
import { parseLoginRequest } from './loginRequest.js';

const validBody = { email: 'jose.garcia@example.com', password: 'Secreta123!' };

const bytes = (count: number) => 'a'.repeat(count);

describe('parseLoginRequest', () => {
  describe('field email (shared table of examples with the registration)', () => {
    const { valid, invalid } = fieldCases('email');

    it.each(valid.map((value) => [value]))('accepts %j', (value) => {
      expect(parseLoginRequest({ ...validBody, email: value })).toMatchObject({ success: true });
    });

    it.each(invalid.map(({ value, code }) => [value, code]))(
      'rejects %j with %s',
      (value, code) => {
        const body: Record<string, unknown> = { ...validBody, email: value };
        if (value === undefined) {
          delete body.email;
        }

        expect(parseLoginRequest(body)).toEqual({
          success: false,
          details: [{ field: 'email', code }],
        });
      },
    );
  });

  describe('field password', () => {
    it.each([
      ['a password the registration would call weak', 'secreta'],
      ['a password shorter than the registration minimum', 'abc'],
      ['a password made of spaces', '   '],
      ['a password of exactly 72 bytes', bytes(72)],
      ['a password of 72 bytes with multi-byte characters', 'Aa1!' + 'ñ'.repeat(34)],
    ])('accepts %s', (_case, password) => {
      expect(parseLoginRequest({ ...validBody, password })).toMatchObject({ success: true });
    });

    it.each([
      ['an absent password', undefined, 'REQUIRED'],
      ['a null password, which is not text like in the registration', null, 'INVALID_FORMAT'],
      ['an empty password', '', 'REQUIRED'],
      ['a password of 73 bytes', bytes(73), 'INVALID_LENGTH'],
      ['a password of 72 characters that exceed 72 bytes', 'ñ'.repeat(40), 'INVALID_LENGTH'],
      ['a number', 12345678, 'INVALID_FORMAT'],
      ['an object', { value: 'Secreta123!' }, 'INVALID_FORMAT'],
    ])('rejects %s with %s', (_case, password, code) => {
      const body: Record<string, unknown> = { ...validBody, password };
      if (password === undefined) {
        delete body.password;
      }

      expect(parseLoginRequest(body)).toEqual({
        success: false,
        details: [{ field: 'password', code }],
      });
    });

    it('keeps the password untouched: it is compared exactly as it was typed', () => {
      const result = parseLoginRequest({ ...validBody, password: ' Secreta123! ' });

      expect(result).toEqual({
        success: true,
        data: { email: validBody.email, password: ' Secreta123! ' },
      });
    });
  });

  it('returns the normalized email: trimmed and lowercase', () => {
    const result = parseLoginRequest({ ...validBody, email: '  JUAN@COLEGIO.ES  ' });

    expect(result).toEqual({
      success: true,
      data: { email: 'juan@colegio.es', password: validBody.password },
    });
  });

  it('reports every invalid field, not only the first', () => {
    expect(parseLoginRequest({ email: 'sin-arroba', password: '' })).toEqual({
      success: false,
      details: [
        { field: 'email', code: 'INVALID_FORMAT' },
        { field: 'password', code: 'REQUIRED' },
      ],
    });
  });

  it('ignores the unknown properties, such as the captcha that another step verifies', () => {
    const result = parseLoginRequest({
      ...validBody,
      captcha: { version: 'v3', token: 'x' },
      role: 'ADMIN',
    });

    expect(result).toEqual({ success: true, data: validBody });
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'texto'],
    ['an array', []],
  ])('treats %s as a body without fields', (_case, body) => {
    expect(parseLoginRequest(body)).toEqual({
      success: false,
      details: [
        { field: 'email', code: 'REQUIRED' },
        { field: 'password', code: 'REQUIRED' },
      ],
    });
  });
});
