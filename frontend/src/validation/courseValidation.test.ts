import { describe, expect, it } from 'vitest';
import { courseFieldCases } from '../testSupport/courseFixtures';
import {
  MAX_CLASSES,
  courseErrorsFromServer,
  validateClassName,
  validateCourse,
  validateCourseName,
} from './courseValidation';

const names = courseFieldCases('courseName');
const classNames = courseFieldCases('className');
const lists = courseFieldCases('classes');

/** Solo los ejemplos de texto: el formulario nunca produce otro tipo de valor. */
const isTextCase = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 40);

describe('validateCourseName (shared table of examples with the backend)', () => {
  it.each(names.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(validateCourseName((value as string | undefined) ?? '')).toBeUndefined();
  });

  it.each(
    names.invalid
      .filter(({ value }) => isTextCase(value))
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects %s with %s', (_label, value, code) => {
    expect(validateCourseName((value as string | undefined) ?? '')).toBe(code);
  });
});

describe('validateClassName (shared table of examples with the backend)', () => {
  it.each(classNames.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(validateClassName((value as string | undefined) ?? '')).toBeUndefined();
  });

  it.each(
    classNames.invalid
      .filter(({ value }) => isTextCase(value))
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects %s with %s', (_label, value, code) => {
    expect(validateClassName((value as string | undefined) ?? '')).toBe(code);
  });
});

describe('validateCourse', () => {
  it('returns null for a valid course', () => {
    expect(validateCourse({ name: '1º Primaria', classNames: ['A', 'B'] })).toBeNull();
  });

  it.each(lists.valid.map((value) => [label(value), value]))(
    'accepts the list of classes %s',
    (_label, value) => {
      expect(validateCourse({ name: '1º Primaria', classNames: value as string[] })).toBeNull();
    },
  );

  it.each(
    lists.invalid
      .filter(({ value }) => Array.isArray(value))
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects the list of classes %s with %s', (_label, value, code) => {
    expect(validateCourse({ name: '1º Primaria', classNames: value as string[] })).toEqual({
      classes: code,
      classNames: [],
    });
  });

  it('allows up to the maximum number of classes and no more', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) => `C${String(index)}`);

    expect(MAX_CLASSES).toBe(12);
    expect(validateCourse({ name: '1º', classNames: many(12) })).toBeNull();
    expect(validateCourse({ name: '1º', classNames: many(13) })?.classes).toBe('INVALID_LENGTH');
  });

  it('reports the error of the name and the error of every invalid class, by position', () => {
    expect(validateCourse({ name: '', classNames: ['A', 'B/', ''] })).toEqual({
      name: 'REQUIRED',
      classNames: [undefined, 'INVALID_CHARACTERS', 'REQUIRED'],
    });
  });

  it('marks the second and later occurrences of a class name as DUPLICATE, ignoring case and spaces', () => {
    expect(validateCourse({ name: '1º', classNames: ['A', ' a ', 'B', 'A'] })).toEqual({
      classNames: [undefined, 'DUPLICATE', undefined, 'DUPLICATE'],
    });
  });

  it('does not call two empty classes a duplicate: each one is REQUIRED', () => {
    expect(validateCourse({ name: '1º', classNames: ['', ''] })).toEqual({
      classNames: ['REQUIRED', 'REQUIRED'],
    });
  });

  it('keeps names that differ in an accent or an ordinal sign apart', () => {
    expect(validateCourse({ name: '1º', classNames: ['1º', '1ª', 'Ñ', 'N'] })).toBeNull();
  });
});

describe('courseErrorsFromServer', () => {
  it('maps the fields of the server error to the name, the list and the rows', () => {
    expect(
      courseErrorsFromServer(
        [
          { field: 'name', code: 'INVALID_LENGTH' },
          { field: 'classes', code: 'REQUIRED' },
          { field: 'classes[1].name', code: 'DUPLICATE' },
          { field: 'classes[3].name', code: 'INVALID_CHARACTERS' },
        ],
        4,
      ),
    ).toEqual({
      name: 'INVALID_LENGTH',
      classes: 'REQUIRED',
      classNames: [undefined, 'DUPLICATE', undefined, 'INVALID_CHARACTERS'],
    });
  });

  it('ignores a field that is not part of the form', () => {
    expect(courseErrorsFromServer([{ field: 'tutorId', code: 'INVALID_FORMAT' }], 2)).toEqual({
      classNames: [undefined, undefined],
    });
  });

  it('ignores a row that does not exist in the form', () => {
    expect(courseErrorsFromServer([{ field: 'classes[5].name', code: 'REQUIRED' }], 2)).toEqual({
      classNames: [undefined, undefined],
    });
  });
});
