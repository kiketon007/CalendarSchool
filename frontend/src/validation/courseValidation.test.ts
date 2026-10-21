import { describe, expect, it } from 'vitest';
import { courseFieldCases } from '../testSupport/courseFixtures';
import {
  MAX_CLASSES,
  courseErrorsFromServer,
  hasCourseChanges,
  type CourseDraft,
  validateClassName,
  validateCourse,
  validateCourseName,
  validateTutorId,
} from './courseValidation';

const names = courseFieldCases('courseName');
const classNames = courseFieldCases('className');
const lists = courseFieldCases('classes');
const tutors = courseFieldCases('tutorId');

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

describe('hasCourseChanges', () => {
  const saved: CourseDraft = {
    name: '1º Primaria',
    classes: [
      { id: 'k1', name: 'A' },
      { id: 'k2', name: 'B' },
    ],
  };

  it('is false for the same values', () => {
    expect(hasCourseChanges(saved, structuredClone(saved))).toBe(false);
  });

  it('ignores extra spaces at the ends and between words, like the server does', () => {
    const current: CourseDraft = {
      name: '  1º   Primaria ',
      classes: [
        { id: 'k1', name: ' A ' },
        { id: 'k2', name: 'B' },
      ],
    };

    expect(hasCourseChanges(saved, current)).toBe(false);
  });

  it('is false after changing a value and putting it back', () => {
    const typed: CourseDraft = { ...saved, name: '1º Primaria Tarde' };
    const undone: CourseDraft = { ...typed, name: '1º Primaria' };

    expect(hasCourseChanges(saved, typed)).toBe(true);
    expect(hasCourseChanges(saved, undone)).toBe(false);
  });

  it('is true when the name of the course changes, also only in its capitals', () => {
    expect(hasCourseChanges(saved, { ...saved, name: '1º Primaria Tarde' })).toBe(true);
    expect(hasCourseChanges(saved, { ...saved, name: '1º primaria' })).toBe(true);
  });

  it('is true when a class is renamed, also only in its capitals', () => {
    const renamed = (name: string): CourseDraft => ({
      ...saved,
      classes: [
        { id: 'k1', name },
        { id: 'k2', name: 'B' },
      ],
    });

    expect(hasCourseChanges(saved, renamed('Grupo A'))).toBe(true);
    expect(hasCourseChanges(saved, renamed('a'))).toBe(true);
  });

  it('is true when a class is removed or added', () => {
    expect(hasCourseChanges(saved, { ...saved, classes: [{ id: 'k1', name: 'A' }] })).toBe(true);
    expect(hasCourseChanges(saved, { ...saved, classes: [...saved.classes, { name: 'C' }] })).toBe(
      true,
    );
  });

  it('is true when the classes change places', () => {
    const [first, second] = saved.classes;

    expect(
      hasCourseChanges(saved, {
        ...saved,
        classes: [second ?? { name: '' }, first ?? { name: '' }],
      }),
    ).toBe(true);
  });

  it('is true when a class is replaced by a new one with the same name, which loses its id', () => {
    expect(
      hasCourseChanges(saved, {
        ...saved,
        classes: [{ id: 'k1', name: 'A' }, { name: 'B' }],
      }),
    ).toBe(true);
  });
});

describe('validateTutorId (shared table of examples with the backend)', () => {
  it.each(tutors.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(validateTutorId(value)).toBeUndefined();
  });

  it.each(tutors.invalid.map(({ value, code }) => [label(value), value, code]))(
    'rejects %s with %s',
    (_label, value, code) => {
      expect(validateTutorId(value)).toBe(code);
    },
  );
});

describe('the tutors in validateCourse', () => {
  const ANA = '0192f5a0-0000-7000-8000-0000000000f1';
  const LUIS = '0192f5a0-0000-7000-8000-0000000000f2';

  it('is valid with distinct professors, without tutor and with tutorIds left out', () => {
    expect(
      validateCourse({ name: '1º', classNames: ['A', 'B', 'C'], tutorIds: [ANA, LUIS, null] }),
    ).toBeNull();
    expect(validateCourse({ name: '1º', classNames: ['A', 'B'], tutorIds: [] })).toBeNull();
    expect(validateCourse({ name: '1º', classNames: ['A', 'B'] })).toBeNull();
  });

  it('marks DUPLICATE from the second row with the same professor, ignoring case, and not the first', () => {
    expect(
      validateCourse({
        name: '1º',
        classNames: ['A', 'B', 'C'],
        tutorIds: [ANA, LUIS, ANA.toUpperCase()],
      }),
    ).toEqual({
      classNames: [undefined, undefined, undefined],
      tutorIds: [undefined, undefined, 'DUPLICATE'],
    });
  });

  it('does not call several rows without tutor a duplicate', () => {
    expect(
      validateCourse({ name: '1º', classNames: ['A', 'B'], tutorIds: [null, null] }),
    ).toBeNull();
  });

  it('marks INVALID_FORMAT for a value that is not a UUID', () => {
    expect(
      validateCourse({ name: '1º', classNames: ['A', 'B'], tutorIds: ['abc', ANA] })?.tutorIds,
    ).toEqual(['INVALID_FORMAT', undefined]);
  });
});

describe('the tutors in courseErrorsFromServer', () => {
  it('maps classes[<i>].tutorId to the row and ignores a row that does not exist', () => {
    expect(
      courseErrorsFromServer(
        [
          { field: 'classes[1].tutorId', code: 'NOT_FOUND' },
          { field: 'classes[7].tutorId', code: 'NOT_FOUND' },
        ],
        2,
      ),
    ).toEqual({ classNames: [undefined, undefined], tutorIds: [undefined, 'NOT_FOUND'] });
  });
});

describe('the tutors in hasCourseChanges', () => {
  const ANA = '0192f5a0-0000-7000-8000-0000000000f1';
  const LUIS = '0192f5a0-0000-7000-8000-0000000000f2';
  const draft = (...tutorIds: (string | null | undefined)[]): CourseDraft => ({
    name: '1º',
    classes: tutorIds.map((tutorId, index) => ({
      id: `k${String(index)}`,
      name: `C${String(index)}`,
      ...(tutorId !== undefined && { tutorId }),
    })),
  });

  it('counts a different tutor, also none, and not the same one', () => {
    expect(hasCourseChanges(draft(ANA, null), draft(LUIS, null))).toBe(true);
    expect(hasCourseChanges(draft(ANA, null), draft(null, null))).toBe(true);
    expect(hasCourseChanges(draft(null, null), draft(ANA, null))).toBe(true);
    expect(hasCourseChanges(draft(ANA, null), draft(ANA, null))).toBe(false);
    expect(hasCourseChanges(draft(ANA), draft(ANA.toUpperCase()))).toBe(false);
  });

  it('does not compare the tutor when one of the two has none to compare', () => {
    expect(hasCourseChanges(draft(undefined, undefined), draft(ANA, null))).toBe(false);
    expect(hasCourseChanges(draft(ANA, null), draft(undefined, undefined))).toBe(false);
  });
});
