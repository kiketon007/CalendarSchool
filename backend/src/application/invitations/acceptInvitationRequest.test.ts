import { describe, expect, it } from 'vitest';
import {
  fieldCases,
  type RegistrationFieldName,
} from '../../../test/support/registrationFixtures.js';
import { parseAcceptInvitationRequest, readInvitationToken } from './acceptInvitationRequest.js';

// Los campos de la persona: los del registro menos los del colegio.
const FIELDS: RegistrationFieldName[] = [
  'firstName',
  'lastName',
  'email',
  'password',
  'privacyPolicyAccepted',
];

const validBody = {
  token: 'un-token-cualquiera',
  firstName: 'Ana',
  lastName: 'Pérez-Gil',
  email: 'ana.perez@example.com',
  password: 'Secreta123!',
  privacyPolicyAccepted: true,
};

/** Cuerpo válido con un campo sustituido (o eliminado si `value` es `undefined`). */
function bodyWith(field: RegistrationFieldName, value: unknown) {
  const body: Record<string, unknown> = { ...validBody, [field]: value };
  if (value === undefined) {
    delete body[field];
  }
  return body;
}

describe('parseAcceptInvitationRequest', () => {
  describe.each(FIELDS)('field %s (shared table of examples)', (field) => {
    const { valid, invalid } = fieldCases(field);

    it.each(valid.map((value) => [value]))('accepts %j', (value) => {
      expect(parseAcceptInvitationRequest(bodyWith(field, value))).toMatchObject({
        success: true,
      });
    });

    it.each(invalid.map(({ value, code }) => [value, code]))(
      'rejects %j with %s',
      (value, code) => {
        expect(parseAcceptInvitationRequest(bodyWith(field, value))).toEqual({
          success: false,
          details: [{ field, code }],
        });
      },
    );
  });

  it('returns the normalized values: trimmed, NFC and lowercase email', () => {
    const result = parseAcceptInvitationRequest({
      ...validBody,
      firstName: ' Ana ',
      email: '  Ana.Perez@Example.COM  ',
    });

    expect(result).toEqual({
      success: true,
      data: {
        firstName: 'Ana',
        lastName: 'Pérez-Gil',
        email: 'ana.perez@example.com',
        password: 'Secreta123!',
        privacyPolicyAccepted: true,
      },
    });
  });

  it('keeps the password untouched', () => {
    const result = parseAcceptInvitationRequest({ ...validBody, password: ' Secreta123! ' });

    expect(result).toMatchObject({ success: true, data: { password: ' Secreta123! ' } });
  });

  it('ignores the token, the role, the school and any unknown property', () => {
    const result = parseAcceptInvitationRequest({
      ...validBody,
      role: 'ADMIN',
      schoolId: '0192f5a0-0000-7000-8000-000000000001',
      captcha: { version: 'v3', token: 'x' },
    });

    expect(result).toMatchObject({ success: true });
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual([
        'email',
        'firstName',
        'lastName',
        'password',
        'privacyPolicyAccepted',
      ]);
    }
  });

  it('reports every invalid field, not only the first', () => {
    const result = parseAcceptInvitationRequest({
      ...validBody,
      firstName: '',
      password: 'sin-variedad',
      privacyPolicyAccepted: false,
    });

    expect(result).toEqual({
      success: false,
      details: [
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'password', code: 'WEAK_PASSWORD' },
        { field: 'privacyPolicyAccepted', code: 'REQUIRED' },
      ],
    });
  });

  it.each([[null], [undefined], ['texto'], [42], [[]]])(
    'treats a body that is %j as an empty one',
    (body) => {
      expect(parseAcceptInvitationRequest(body)).toEqual({
        success: false,
        details: FIELDS.map((field) => ({ field, code: 'REQUIRED' })),
      });
    },
  );
});

describe('readInvitationToken', () => {
  it('returns the token when it is a non-empty string', () => {
    expect(readInvitationToken({ token: 'abc' })).toBe('abc');
  });

  it.each([
    [{}],
    [{ token: '' }],
    [{ token: null }],
    [{ token: 42 }],
    [{ token: ['abc'] }],
    [null],
    [undefined],
    ['texto'],
    [[]],
  ])('returns undefined for %j', (body) => {
    expect(readInvitationToken(body)).toBeUndefined();
  });
});
