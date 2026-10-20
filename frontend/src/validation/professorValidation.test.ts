import { describe, expect, it } from 'vitest';
import { professorFieldCases } from '../testSupport/professorFixtures';
import {
  professorErrorsFromServer,
  validateProfessor,
  validateProfessorClass,
  validateProfessorPosition,
} from './professorValidation';
import { validateField } from './registrationValidation';

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

/** Solo los ejemplos de texto: el formulario nunca produce otro tipo de valor. */
const isTextCase = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

/**
 * En el formulario, «sin cargo» y «sin clase» son la opción vacía (`''`): es válida, aunque la tabla
 * compartida marque el `''` como inválido para el cuerpo de la API.
 */
const isNotEmpty = ({ value }: { value: unknown }) => value !== '';

describe.each([['firstName' as const], ['lastName' as const]])(
  'validateProfessor %s (shared table of examples with the backend)',
  (field) => {
    const cases = professorFieldCases(field);
    const others = { firstName: 'Ana', lastName: 'García', position: '', classId: '' };
    const errorOf = (value: unknown) =>
      validateProfessor({ ...others, [field]: (value as string | undefined) ?? '' })?.[field];

    it.each(cases.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
      expect(errorOf(value)).toBeUndefined();
    });

    it.each(
      cases.invalid
        .filter(({ value }) => isTextCase(value))
        .map(({ value, code }) => [label(value), value, code]),
    )('rejects %s with %s', (_label, value, code) => {
      expect(errorOf(value)).toBe(code);
    });

    it('uses the same rule as the registration', () => {
      for (const { value } of cases.invalid.filter(({ value }) => isTextCase(value))) {
        expect(errorOf(value)).toBe(validateField(field, (value as string | undefined) ?? ''));
      }
    });
  },
);

describe('validateProfessorPosition (shared table of examples with the backend)', () => {
  const cases = professorFieldCases('position');

  it.each(cases.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(validateProfessorPosition((value as string | undefined) ?? '')).toBeUndefined();
  });

  it('accepts the empty option, which means no position', () => {
    expect(validateProfessorPosition('')).toBeUndefined();
  });

  it.each(
    cases.invalid
      .filter(isNotEmpty)
      .filter(({ value }) => isTextCase(value))
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects %s with %s', (_label, value, code) => {
    expect(validateProfessorPosition(value as string)).toBe(code);
  });
});

describe('validateProfessorClass (shared table of examples with the backend)', () => {
  const cases = professorFieldCases('classId');

  it.each(cases.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(validateProfessorClass((value as string | undefined) ?? '')).toBeUndefined();
  });

  it('accepts the empty option, which means no class', () => {
    expect(validateProfessorClass('')).toBeUndefined();
  });

  it.each(
    cases.invalid
      .filter(isNotEmpty)
      .filter(({ value }) => isTextCase(value))
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects %s with %s', (_label, value, code) => {
    expect(validateProfessorClass(value as string)).toBe(code);
  });
});

describe('validateProfessor', () => {
  const valid = { firstName: 'Ana', lastName: 'García', position: 'DIRECTOR', classId: '' };

  it('returns null when everything is valid', () => {
    expect(validateProfessor(valid)).toBeNull();
  });

  it('returns null with no position and no class', () => {
    expect(validateProfessor({ ...valid, position: '' })).toBeNull();
  });

  it('returns one error per invalid field', () => {
    expect(
      validateProfessor({ firstName: '', lastName: '<b>', position: 'PORTERO', classId: 'abc' }),
    ).toEqual({
      firstName: 'REQUIRED',
      lastName: 'INVALID_CHARACTERS',
      position: 'INVALID_FORMAT',
      classId: 'INVALID_FORMAT',
    });
  });
});

describe('professorErrorsFromServer', () => {
  it('translates the errors of the four fields', () => {
    expect(
      professorErrorsFromServer([
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'lastName', code: 'INVALID_LENGTH' },
        { field: 'position', code: 'INVALID_FORMAT' },
        { field: 'classId', code: 'NOT_FOUND' },
      ]),
    ).toEqual({
      firstName: 'REQUIRED',
      lastName: 'INVALID_LENGTH',
      position: 'INVALID_FORMAT',
      classId: 'NOT_FOUND',
    });
  });

  it('ignores fields that are not in the form', () => {
    expect(professorErrorsFromServer([{ field: 'schoolId', code: 'REQUIRED' }])).toEqual({});
  });

  it('returns an empty object without errors', () => {
    expect(professorErrorsFromServer([])).toEqual({});
  });
});
