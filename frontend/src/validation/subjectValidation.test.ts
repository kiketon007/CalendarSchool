import { describe, expect, it } from 'vitest';
import type { Subject } from '../services/subjectsService';
import { subjectFieldCases } from '../testSupport/subjectFixtures';
import {
  emptySubjectDraft,
  groupSubjectErrors,
  hasSubjectChanges,
  subjectDraftFrom,
  toCreateSubjectInput,
  validateSubject,
  validateSubjectCode,
  validateSubjectColor,
  validateSubjectCourses,
  validateSubjectDescription,
  validateSubjectName,
  validateSubjectSessions,
  validateSubjectStatus,
  validateSubjectType,
  type SubjectDraft,
} from './subjectValidation';

const names = subjectFieldCases('subjectName');
const codes = subjectFieldCases('code');
const descriptions = subjectFieldCases('description');
const types = subjectFieldCases('type');
const statuses = subjectFieldCases('status');
const colors = subjectFieldCases('color');
const sessions = subjectFieldCases('sessionsPerWeek');
const courseLists = subjectFieldCases('courses');

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 50);

/** Solo los ejemplos de texto: el campo del nombre nunca recibe otro tipo de valor. */
const isTextCase = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const COURSE_A = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_B = '0192f5a0-0000-7000-8000-0000000000d2';

const DRAFT: SubjectDraft = {
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: 'Lengua extranjera',
  color: 'blue',
  courses: [{ courseId: COURSE_A, sessionsPerWeek: 3 }],
};

describe('validateSubjectName (shared table of examples with the backend)', () => {
  it.each(names.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(validateSubjectName((value as string | undefined) ?? '')).toBeUndefined();
  });

  it.each(
    names.invalid
      .filter(({ value }) => isTextCase(value))
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects %s with %s', (_label, value, code) => {
    expect(validateSubjectName((value as string | undefined) ?? '')).toBe(code);
  });
});

describe.each([
  ['validateSubjectCode', validateSubjectCode, codes],
  ['validateSubjectDescription', validateSubjectDescription, descriptions],
  ['validateSubjectType', validateSubjectType, types],
  ['validateSubjectStatus', validateSubjectStatus, statuses],
  ['validateSubjectColor', validateSubjectColor, colors],
  ['validateSubjectSessions', validateSubjectSessions, sessions],
] as const)('%s (shared table of examples with the backend)', (_name, validate, cases) => {
  it.each(cases.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(validate(value)).toBeUndefined();
  });

  it.each(cases.invalid.map(({ value, code }) => [label(value), value, code]))(
    'rejects %s with %s',
    (_label, value, code) => {
      expect(validate(value)).toBe(code);
    },
  );
});

describe('the empty select of the form', () => {
  it.each([
    ['type', validateSubjectType],
    ['status', validateSubjectStatus],
    ['color', validateSubjectColor],
  ])('asks for a %s when nothing is chosen', (_field, validate) => {
    expect(validate('')).toBe('REQUIRED');
  });
});

describe('validateSubjectCourses (shared table of examples with the backend)', () => {
  it.each(courseLists.valid.map((value) => [label(value), value]))(
    'accepts %s',
    (_label, value) => {
      expect(validateSubjectCourses(value)).toEqual([]);
    },
  );

  it.each(courseLists.invalid.map(({ value, issues }) => [label(value), value, issues]))(
    'rejects %s with exactly its issues',
    (_label, value, issues) => {
      expect(validateSubjectCourses(value)).toEqual(issues);
    },
  );

  const hundredAndOne = Array.from({ length: 101 }, (_value, index) => ({
    courseId: `0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
    sessionsPerWeek: 2,
  }));

  it('rejects more than 100 courses with INVALID_LENGTH and accepts exactly 100', () => {
    expect(validateSubjectCourses(hundredAndOne)).toEqual([
      { field: 'courses', code: 'INVALID_LENGTH' },
    ]);
    expect(validateSubjectCourses(hundredAndOne.slice(1))).toEqual([]);
  });
});

describe('validateSubject', () => {
  it('accepts a complete subject', () => {
    expect(validateSubject(DRAFT)).toEqual([]);
  });

  it('accepts a subject without code and without description', () => {
    expect(validateSubject({ ...DRAFT, code: '  ', description: '' })).toEqual([]);
  });

  it('reports one error per invalid field, in the order of the form', () => {
    expect(
      validateSubject({
        name: '',
        code: 'IN G',
        type: '',
        status: '',
        description: 'a'.repeat(501),
        color: '',
        courses: [{ courseId: COURSE_A, sessionsPerWeek: 9 }],
      }),
    ).toEqual([
      { field: 'name', code: 'REQUIRED' },
      { field: 'code', code: 'INVALID_CHARACTERS' },
      { field: 'type', code: 'REQUIRED' },
      { field: 'status', code: 'REQUIRED' },
      { field: 'description', code: 'INVALID_LENGTH' },
      { field: 'color', code: 'REQUIRED' },
      { field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' },
    ]);
  });

  it('asks for at least one course', () => {
    expect(validateSubject({ ...DRAFT, courses: [] })).toEqual([
      { field: 'courses', code: 'REQUIRED' },
    ]);
  });

  it('marks the sessions of each course that is out of range', () => {
    expect(
      validateSubject({
        ...DRAFT,
        courses: [
          { courseId: COURSE_A, sessionsPerWeek: 0 },
          { courseId: COURSE_B, sessionsPerWeek: 5 },
        ],
      }),
    ).toEqual([{ field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' }]);
  });
});

describe('groupSubjectErrors', () => {
  it('spreads the errors by field and by course, keeping the first error of each', () => {
    expect(
      groupSubjectErrors([
        { field: 'name', code: 'REQUIRED' },
        { field: 'name', code: 'INVALID_LENGTH' },
        { field: 'code', code: 'INVALID_CHARACTERS' },
        { field: 'type', code: 'INVALID_FORMAT' },
        { field: 'status', code: 'REQUIRED' },
        { field: 'description', code: 'INVALID_LENGTH' },
        { field: 'color', code: 'INVALID_FORMAT' },
        { field: 'courses', code: 'REQUIRED' },
        { field: 'courses[1].courseId', code: 'NOT_FOUND' },
        { field: 'courses[1].sessionsPerWeek', code: 'OUT_OF_RANGE' },
        { field: 'courses[0]', code: 'INVALID_FORMAT' },
      ]),
    ).toEqual({
      name: 'REQUIRED',
      code: 'INVALID_CHARACTERS',
      type: 'INVALID_FORMAT',
      status: 'REQUIRED',
      description: 'INVALID_LENGTH',
      color: 'INVALID_FORMAT',
      courses: 'REQUIRED',
      rows: {
        0: { whole: 'INVALID_FORMAT' },
        1: { courseId: 'NOT_FOUND', sessionsPerWeek: 'OUT_OF_RANGE' },
      },
    });
  });

  it('ignores a field it does not know', () => {
    expect(groupSubjectErrors([{ field: 'schoolId', code: 'NOT_ALLOWED' }])).toEqual({ rows: {} });
  });
});

describe('toCreateSubjectInput', () => {
  it('cleans the name and the code, and keeps the courses as they are', () => {
    expect(
      toCreateSubjectInput({
        ...DRAFT,
        name: '  Ciencias   de la  Naturaleza ',
        code: ' ING ',
        description: '  Lengua extranjera ',
      }),
    ).toEqual({
      name: 'Ciencias de la Naturaleza',
      code: 'ING',
      type: 'CORE',
      status: 'ACTIVE',
      description: 'Lengua extranjera',
      color: 'blue',
      courses: [{ courseId: COURSE_A, sessionsPerWeek: 3 }],
    });
  });

  it('sends an empty code and an empty description as null, never as an empty text', () => {
    expect(toCreateSubjectInput({ ...DRAFT, code: '   ', description: '' })).toMatchObject({
      code: null,
      description: null,
    });
  });
});

describe('emptySubjectDraft', () => {
  it('starts active, with the given color, and with nothing else chosen', () => {
    expect(emptySubjectDraft('teal')).toEqual({
      name: '',
      code: '',
      type: '',
      status: 'ACTIVE',
      description: '',
      color: 'teal',
      courses: [],
    });
  });
});

describe('subjectDraftFrom', () => {
  const subject: Subject = {
    id: 'subject-1',
    name: 'Inglés',
    code: 'ING',
    type: 'ELECTIVE',
    status: 'INACTIVE',
    description: 'Lengua extranjera',
    color: 'green',
    createdAt: '2026-10-26T09:30:00.000Z',
    courses: [
      { id: COURSE_A, name: '1º Primaria', sessionsPerWeek: 3 },
      { id: COURSE_B, name: '2º Primaria', sessionsPerWeek: 5 },
    ],
  };

  it('puts every field of the loaded subject in the form, with its courses and sessions', () => {
    expect(subjectDraftFrom(subject)).toEqual({
      name: 'Inglés',
      code: 'ING',
      type: 'ELECTIVE',
      status: 'INACTIVE',
      description: 'Lengua extranjera',
      color: 'green',
      courses: [
        { courseId: COURSE_A, sessionsPerWeek: 3 },
        { courseId: COURSE_B, sessionsPerWeek: 5 },
      ],
    });
  });

  it('turns a missing code and description into empty texts, as the form shows them', () => {
    expect(
      subjectDraftFrom({ ...subject, code: null, description: null, courses: [] }),
    ).toMatchObject({ code: '', description: '', courses: [] });
  });
});

describe('hasSubjectChanges', () => {
  const two: SubjectDraft = {
    ...DRAFT,
    courses: [
      { courseId: COURSE_A, sessionsPerWeek: 3 },
      { courseId: COURSE_B, sessionsPerWeek: 2 },
    ],
  };

  it('sees no change in an identical form', () => {
    expect(hasSubjectChanges(two, { ...two })).toBe(false);
  });

  it.each([
    ['the name', { name: 'Inglés avanzado' }],
    ['the capitalization of the name', { name: 'INGLÉS' }],
    ['the code', { code: 'ING2' }],
    ['the capitalization of the code', { code: 'ing' }],
    ['the type', { type: 'ELECTIVE' }],
    ['the status', { status: 'INACTIVE' }],
    ['the description', { description: 'Otra' }],
    ['the color', { color: 'green' }],
    ['the sessions of a course', { courses: [{ courseId: COURSE_A, sessionsPerWeek: 4 }] }],
    [
      'a course that is added',
      { courses: [...two.courses, { courseId: 'c3', sessionsPerWeek: 2 }] },
    ],
    ['a course that is removed', { courses: [{ courseId: COURSE_A, sessionsPerWeek: 3 }] }],
    [
      'a course that is replaced by another with the same sessions',
      {
        courses: [
          { courseId: COURSE_A, sessionsPerWeek: 3 },
          { courseId: 'c3', sessionsPerWeek: 2 },
        ],
      },
    ],
  ] as [string, Partial<SubjectDraft>][])('sees a change in %s', (_name, change) => {
    expect(hasSubjectChanges(two, { ...two, ...change })).toBe(true);
  });

  it.each([
    ['spaces around and inside the name', { name: '  Inglés  ' }],
    ['spaces around the code', { code: ' ING ' }],
    ['spaces around the description', { description: ' Lengua extranjera  ' }],
  ] as [string, Partial<SubjectDraft>][])('does not count %s', (_name, change) => {
    expect(
      hasSubjectChanges({ ...two, description: 'Lengua extranjera' }, { ...two, ...change }),
    ).toBe(false);
  });

  it('takes an empty code and a code of only spaces as the same absence', () => {
    expect(hasSubjectChanges({ ...two, code: '' }, { ...two, code: '   ' })).toBe(false);
    expect(hasSubjectChanges({ ...two, description: '' }, { ...two, description: ' ' })).toBe(
      false,
    );
  });

  it('sees a code that is typed where there was none, and one that is removed', () => {
    expect(hasSubjectChanges({ ...two, code: '' }, { ...two, code: 'ING' })).toBe(true);
    expect(hasSubjectChanges({ ...two, code: 'ING' }, { ...two, code: '' })).toBe(true);
  });

  it('does not depend on the order of the courses', () => {
    expect(hasSubjectChanges(two, { ...two, courses: [...two.courses].reverse() })).toBe(false);
  });

  it('goes back to no change when a change is undone', () => {
    const changed = { ...two, courses: [{ courseId: COURSE_A, sessionsPerWeek: 5 }] };
    expect(hasSubjectChanges(two, changed)).toBe(true);
    expect(hasSubjectChanges(two, { ...two })).toBe(false);
  });
});
