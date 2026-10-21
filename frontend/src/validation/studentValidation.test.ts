import { describe, expect, it } from 'vitest';
import { studentFieldCases } from '../testSupport/studentFixtures';
import {
  studentErrorsFromServer,
  validateStudent,
  type StudentFormValues,
} from './studentValidation';
import { validateField } from './registrationValidation';

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';

const VALID: StudentFormValues = {
  firstName: 'Juan',
  lastName: 'García',
  courseId: COURSE_ID,
  classId: '',
  cafeteria: 'no',
  scholarship: false,
  foodType: '',
  observations: '',
};

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

/** Solo los ejemplos de texto: el formulario nunca produce otro tipo de valor. */
const isTextCase = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

/**
 * En el formulario, «sin clase» es la opción vacía (`''`), válida aunque la tabla compartida marque el
 * `''` como inválido para el cuerpo de la API, y el curso vacío es `REQUIRED` (no `INVALID_FORMAT`).
 */
const isNotEmpty = ({ value }: { value: unknown }) => value !== '';

/** El comedor del formulario es `''` (sin elegir), `'yes'` o `'no'`; la tabla lo expresa con booleanos. */
function cafeteriaOf(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

describe.each([['firstName' as const], ['lastName' as const]])(
  'validateStudent %s (shared table of examples with the backend)',
  (field) => {
    const cases = studentFieldCases(field);
    const errorOf = (value: unknown) =>
      validateStudent({ ...VALID, [field]: (value as string | undefined) ?? '' })?.[field];

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

describe('validateStudent courseId (shared table of examples with the backend)', () => {
  const cases = studentFieldCases('courseId');
  const errorOf = (value: unknown) =>
    validateStudent({ ...VALID, courseId: (value as string | undefined) ?? '' })?.courseId;

  it.each(cases.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(errorOf(value)).toBeUndefined();
  });

  it.each(
    cases.invalid
      .filter(({ value }) => isTextCase(value) && value !== '')
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects %s with %s', (_label, value, code) => {
    expect(errorOf(value)).toBe(code);
  });

  it('asks for the course when none is chosen, which the form shows as an empty option', () => {
    expect(errorOf('')).toBe('REQUIRED');
  });
});

describe('validateStudent classId (shared table of examples with the backend)', () => {
  const cases = studentFieldCases('classId');
  const errorOf = (value: unknown) =>
    validateStudent({ ...VALID, classId: (value as string | undefined) ?? '' })?.classId;

  it.each(cases.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(errorOf(value)).toBeUndefined();
  });

  it.each(
    cases.invalid
      .filter((testCase) => isTextCase(testCase.value) && isNotEmpty(testCase))
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects %s with %s', (_label, value, code) => {
    expect(errorOf(value)).toBe(code);
  });

  it('accepts the empty option, which means no class', () => {
    expect(errorOf('')).toBeUndefined();
  });
});

describe('validateStudent cafeteria (shared table of examples with the backend)', () => {
  const cases = studentFieldCases('cafeteria');
  const errorOf = (value: unknown) =>
    validateStudent({
      ...VALID,
      cafeteria: cafeteriaOf(value) as StudentFormValues['cafeteria'],
    })?.cafeteria;

  it.each(cases.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(errorOf(value)).toBeUndefined();
  });

  it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
    'rejects %s with %s',
    (_label, value, code) => {
      expect(errorOf(value)).toBe(code);
    },
  );

  it('asks for an answer while none is chosen', () => {
    expect(validateStudent({ ...VALID, cafeteria: '' })).toEqual({ cafeteria: 'REQUIRED' });
  });
});

describe.each([['foodType' as const], ['observations' as const]])(
  'validateStudent %s (shared table of examples with the backend)',
  (field) => {
    const cases = studentFieldCases(field);
    // El tipo de comida solo se valida con comedor: se prueba con «Sí».
    const base: StudentFormValues = { ...VALID, cafeteria: 'yes' };
    const errorOf = (value: unknown) =>
      validateStudent({ ...base, [field]: (value as string | undefined) ?? '' })?.[field];

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
  },
);

describe('validateStudent', () => {
  it('returns null for a valid student', () => {
    expect(validateStudent(VALID)).toBeNull();
  });

  it('does not judge the food type when the student does not eat at school: it is discarded', () => {
    expect(validateStudent({ ...VALID, cafeteria: 'no', foodType: 'a'.repeat(300) })).toBeNull();
  });

  it('measures the limits in characters, like the backend', () => {
    expect(validateStudent({ ...VALID, cafeteria: 'yes', foodType: '😀'.repeat(255) })).toBeNull();
    expect(validateStudent({ ...VALID, observations: '😀'.repeat(5000) })).toBeNull();
    expect(validateStudent({ ...VALID, observations: '😀'.repeat(5001) })).toEqual({
      observations: 'INVALID_LENGTH',
    });
  });

  it('ignores the spaces at the ends and keeps the line breaks inside the observations', () => {
    expect(
      validateStudent({ ...VALID, observations: `  ${'a'.repeat(4990)}\n${'b'.repeat(9)}  ` }),
    ).toBeNull();
  });

  it('reports every invalid field at once', () => {
    expect(
      validateStudent({
        firstName: '',
        lastName: '<b>',
        courseId: '',
        classId: 'abc',
        cafeteria: '',
        scholarship: false,
        foodType: '',
        observations: 'a'.repeat(5001),
      }),
    ).toEqual({
      firstName: 'REQUIRED',
      lastName: 'INVALID_CHARACTERS',
      courseId: 'REQUIRED',
      classId: 'INVALID_FORMAT',
      cafeteria: 'REQUIRED',
      observations: 'INVALID_LENGTH',
    });
  });
});

describe('studentErrorsFromServer', () => {
  it('translates the fields of a 400 into the form fields, including NOT_FOUND and NOT_ALLOWED', () => {
    expect(
      studentErrorsFromServer([
        { field: 'firstName', code: 'REQUIRED' },
        { field: 'courseId', code: 'NOT_FOUND' },
        { field: 'classId', code: 'NOT_FOUND' },
        { field: 'scholarship', code: 'NOT_ALLOWED' },
        { field: 'foodType', code: 'INVALID_LENGTH' },
      ]),
    ).toEqual({
      firstName: 'REQUIRED',
      courseId: 'NOT_FOUND',
      classId: 'NOT_FOUND',
      scholarship: 'NOT_ALLOWED',
      foodType: 'INVALID_LENGTH',
    });
  });

  it('ignores the fields that the form does not have', () => {
    expect(studentErrorsFromServer([{ field: 'schoolId', code: 'REQUIRED' }])).toEqual({});
  });
});
