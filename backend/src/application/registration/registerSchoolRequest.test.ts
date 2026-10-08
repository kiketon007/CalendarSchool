import { describe, expect, it } from 'vitest';
import {
  fieldCases,
  type RegistrationFieldName,
} from '../../../test/support/registrationFixtures.js';
import { parseRegisterSchoolRequest } from './registerSchoolRequest.js';

const FIELDS: RegistrationFieldName[] = [
  'schoolName',
  'municipalityCode',
  'firstName',
  'lastName',
  'email',
  'password',
];

const validBody = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  password: 'Secreta123!',
};

/** Cuerpo válido con un campo sustituido (o eliminado si `value` es `undefined`). */
function bodyWith(field: RegistrationFieldName, value: string | undefined) {
  const body: Record<string, unknown> = { ...validBody, [field]: value };
  if (value === undefined) {
    delete body[field];
  }
  return body;
}

describe('parseRegisterSchoolRequest', () => {
  describe.each(FIELDS)('field %s (shared table of examples)', (field) => {
    const { valid, invalid } = fieldCases(field);

    it.each(valid.map((value) => [value]))('accepts %j', (value) => {
      expect(parseRegisterSchoolRequest(bodyWith(field, value))).toMatchObject({ success: true });
    });

    it.each(invalid.map(({ value, code }) => [value, code]))(
      'rejects %j with %s',
      (value, code) => {
        expect(parseRegisterSchoolRequest(bodyWith(field, value))).toEqual({
          success: false,
          details: [{ field, code }],
        });
      },
    );
  });

  it('returns the normalized values: trimmed, NFC and lowercase email', () => {
    const result = parseRegisterSchoolRequest({
      ...validBody,
      schoolName: '  CEIP Lluís Vives  ',
      firstName: ' José ',
      email: '  Jose.Garcia@Example.COM  ',
    });

    expect(result).toEqual({
      success: true,
      data: {
        ...validBody,
        schoolName: 'CEIP Lluís Vives'.normalize('NFC'),
        firstName: 'José',
        email: 'jose.garcia@example.com',
      },
    });
  });

  it('keeps the password untouched', () => {
    const result = parseRegisterSchoolRequest({ ...validBody, password: ' Secreta123! ' });

    expect(result).toMatchObject({ success: true, data: { password: ' Secreta123! ' } });
  });

  it('reports one error per invalid field without stopping at the first one', () => {
    const result = parseRegisterSchoolRequest({
      ...validBody,
      email: 'sin-arroba',
      password: 'corta',
      municipalityCode: '1',
    });

    expect(result).toEqual({
      success: false,
      details: [
        { field: 'municipalityCode', code: 'INVALID_FORMAT' },
        { field: 'email', code: 'INVALID_FORMAT' },
        { field: 'password', code: 'INVALID_LENGTH' },
      ],
    });
  });

  it('reports one error per field even when a field breaks several rules', () => {
    const result = parseRegisterSchoolRequest({ ...validBody, schoolName: '<' });

    expect(result).toEqual({
      success: false,
      details: [{ field: 'schoolName', code: 'INVALID_LENGTH' }],
    });
  });

  it('reports every field as REQUIRED when the body is not an object', () => {
    for (const body of [undefined, null, [], 'texto']) {
      expect(parseRegisterSchoolRequest(body)).toEqual({
        success: false,
        details: FIELDS.map((field) => ({ field, code: 'REQUIRED' })),
      });
    }
  });

  it('reports INVALID_FORMAT when a field is not a string', () => {
    expect(parseRegisterSchoolRequest({ ...validBody, firstName: 42 })).toEqual({
      success: false,
      details: [{ field: 'firstName', code: 'INVALID_FORMAT' }],
    });
  });

  it('ignores unknown properties, such as the captcha, which another step verifies', () => {
    const result = parseRegisterSchoolRequest({
      ...validBody,
      captcha: { version: 'v3', token: 'x' },
      extra: 1,
    });

    expect(result).toEqual({ success: true, data: validBody });
  });
});
