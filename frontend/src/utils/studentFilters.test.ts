import { describe, expect, it } from 'vitest';
import type { StudentSummary } from '../services/studentsService';
import {
  NO_CLASS,
  NO_COURSE,
  classOptions,
  courseOptions,
  filtersFromParams,
  hasActiveFilters,
  matchesStudentFilters,
  pageFromParams,
  paramsFromFilters,
  type StudentFilters,
} from './studentFilters';

const C1 = '0192f5a0-0000-7000-8000-0000000000d1';
const C2 = '0192f5a0-0000-7000-8000-0000000000d2';
const C10 = '0192f5a0-0000-7000-8000-0000000000d3';
const C1A = '0192f5a0-0000-7000-8000-0000000000e1';
const C1B = '0192f5a0-0000-7000-8000-0000000000e2';
const C2A = '0192f5a0-0000-7000-8000-0000000000e3';

function student(overrides: Partial<StudentSummary> & { id: string }): StudentSummary {
  return {
    firstName: 'Juan',
    lastName: 'García',
    course: { id: C1, name: '1º Primaria' },
    class: { id: C1A, name: 'A' },
    cafeteria: false,
    scholarship: null,
    ...overrides,
  };
}

const students: StudentSummary[] = [
  student({ id: 's1', cafeteria: true, scholarship: true }),
  student({ id: 's2', firstName: 'Ana', class: null, cafeteria: true, scholarship: false }),
  student({ id: 's3', firstName: 'Eva', class: { id: C1B, name: 'B' } }),
  student({
    id: 's4',
    firstName: 'Luis',
    course: { id: C2, name: '2º Primaria' },
    class: { id: C2A, name: 'A' },
  }),
  student({ id: 's5', firstName: 'Pau', course: null, class: null }),
  student({
    id: 's6',
    firstName: 'Mar',
    course: { id: C10, name: '10º Primaria' },
    class: null,
  }),
];

const NONE: StudentFilters = { course: '', classId: '', cafeteria: 'all', scholarship: 'all' };
const params = (query: string) => new URLSearchParams(query);

describe('filtersFromParams', () => {
  it('has no filters without parameters', () => {
    expect(filtersFromParams(params(''), students)).toEqual(NONE);
  });

  it('reads a course, a class of that course, the cafeteria and the scholarship', () => {
    const query = `curso=${C1}&clase=${C1A}&comedor=si&beca=si`;

    expect(filtersFromParams(params(query), students)).toEqual({
      course: C1,
      classId: C1A,
      cafeteria: 'yes',
      scholarship: 'yes',
    });
  });

  it('reads "sin-curso" and "sin-clase" only when some student is in that situation', () => {
    expect(filtersFromParams(params(`curso=${NO_COURSE}`), students).course).toBe(NO_COURSE);
    expect(filtersFromParams(params(`curso=${NO_COURSE}`), students.slice(0, 4)).course).toBe('');
    expect(filtersFromParams(params(`curso=${C1}&clase=${NO_CLASS}`), students).classId).toBe(
      NO_CLASS,
    );
    expect(filtersFromParams(params(`curso=${C2}&clase=${NO_CLASS}`), students).classId).toBe('');
  });

  it.each([
    ['a course that has no student', `curso=${'0192f5a0-0000-7000-8000-0000000000ff'}`],
    ['text that is not an id', 'curso=abc'],
    ['an empty value', 'curso='],
  ])('ignores %s', (_label, query) => {
    expect(filtersFromParams(params(query), students).course).toBe('');
  });

  it('ignores a class without a course, with "sin-curso" or from another course', () => {
    expect(filtersFromParams(params(`clase=${C1A}`), students).classId).toBe('');
    expect(filtersFromParams(params(`curso=${NO_COURSE}&clase=${C1A}`), students).classId).toBe('');
    expect(filtersFromParams(params(`curso=${C2}&clase=${C1A}`), students).classId).toBe('');
  });

  it('keeps the class out when the course in the URL is ignored', () => {
    const query = `curso=abc&clase=${C1A}`;

    expect(filtersFromParams(params(query), students)).toEqual(NONE);
  });

  it.each([
    ['comedor=si', 'yes'],
    ['comedor=no', 'no'],
    ['comedor=quizas', 'all'],
    ['comedor=SI', 'all'],
    ['comedor=', 'all'],
  ])('reads %s as %s', (query, expected) => {
    expect(filtersFromParams(params(query), students).cafeteria).toBe(expected);
  });

  it('reads the scholarship only with the cafeteria "si"', () => {
    expect(filtersFromParams(params('comedor=si&beca=no'), students).scholarship).toBe('no');
    expect(filtersFromParams(params('comedor=si&beca=quizas'), students).scholarship).toBe('all');
    expect(filtersFromParams(params('beca=si'), students).scholarship).toBe('all');
    expect(filtersFromParams(params('comedor=no&beca=si'), students).scholarship).toBe('all');
  });

  it('ignores unrelated parameters', () => {
    expect(filtersFromParams(params('q=juan&otra=1'), students)).toEqual(NONE);
  });
});

describe('paramsFromFilters', () => {
  it('writes nothing for the default filters on the first page', () => {
    expect(paramsFromFilters(NONE, 1).toString()).toBe('');
  });

  it('writes only what is not the default', () => {
    const filters: StudentFilters = {
      course: C1,
      classId: NO_CLASS,
      cafeteria: 'yes',
      scholarship: 'no',
    };

    expect(Object.fromEntries(paramsFromFilters(filters, 2))).toEqual({
      curso: C1,
      clase: NO_CLASS,
      comedor: 'si',
      beca: 'no',
      pagina: '2',
    });
  });

  it('writes the page only when it is greater than one', () => {
    expect(paramsFromFilters(NONE, 1).has('pagina')).toBe(false);
    expect(paramsFromFilters(NONE, 0).has('pagina')).toBe(false);
    expect(paramsFromFilters(NONE, 3).get('pagina')).toBe('3');
  });

  it('writes no class without a concrete course and no scholarship without cafeteria', () => {
    const filters: StudentFilters = {
      course: NO_COURSE,
      classId: C1A,
      cafeteria: 'no',
      scholarship: 'yes',
    };

    expect(Object.fromEntries(paramsFromFilters(filters, 1))).toEqual({
      curso: NO_COURSE,
      comedor: 'no',
    });
  });

  it('writes the cafeteria "no" with "no"', () => {
    expect(paramsFromFilters({ ...NONE, cafeteria: 'no' }, 1).get('comedor')).toBe('no');
  });

  it('is read back as the same filters', () => {
    const filters: StudentFilters = {
      course: C1,
      classId: C1A,
      cafeteria: 'yes',
      scholarship: 'yes',
    };

    expect(filtersFromParams(paramsFromFilters(filters, 4), students)).toEqual(filters);
  });
});

describe('pageFromParams', () => {
  it.each([
    ['', 1],
    ['pagina=2', 2],
    ['pagina=15', 15],
    ['pagina=1', 1],
    ['pagina=0', 1],
    ['pagina=-3', 1],
    ['pagina=2.5', 1],
    ['pagina=abc', 1],
    ['pagina=', 1],
    ['pagina=3abc', 1],
  ])('reads "%s" as page %i', (query, expected) => {
    expect(pageFromParams(params(query))).toBe(expected);
  });
});

describe('courseOptions', () => {
  it('lists the courses that have students, once, in natural order, and says there are students without course', () => {
    const result = courseOptions(students);

    expect(result.options).toEqual([
      { id: C1, name: '1º Primaria' },
      { id: C2, name: '2º Primaria' },
      { id: C10, name: '10º Primaria' },
    ]);
    expect(result.withoutCourse).toBe(true);
  });

  it('says there are none without course when every student has one', () => {
    expect(courseOptions(students.filter(({ course }) => course !== null)).withoutCourse).toBe(
      false,
    );
  });

  it('is empty without students', () => {
    expect(courseOptions([])).toEqual({ options: [], withoutCourse: false });
  });
});

describe('classOptions', () => {
  it('lists the classes of the course that have students, in natural order, and says there are students without class', () => {
    const result = classOptions(students, C1);

    expect(result.options).toEqual([
      { id: C1A, name: 'A' },
      { id: C1B, name: 'B' },
    ]);
    expect(result.withoutClass).toBe(true);
  });

  it('only looks at the students of that course', () => {
    const result = classOptions(students, C2);

    expect(result.options).toEqual([{ id: C2A, name: 'A' }]);
    expect(result.withoutClass).toBe(false);
  });

  it('has no options without a concrete course', () => {
    expect(classOptions(students, '')).toEqual({ options: [], withoutClass: false });
    expect(classOptions(students, NO_COURSE)).toEqual({ options: [], withoutClass: false });
  });
});

describe('matchesStudentFilters', () => {
  const idsFor = (filters: StudentFilters) =>
    students.filter((item) => matchesStudentFilters(item, filters)).map(({ id }) => id);

  it('shows everyone without filters', () => {
    expect(idsFor(NONE)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
  });

  it('filters by course, by "sin-curso" and by class', () => {
    expect(idsFor({ ...NONE, course: C1 })).toEqual(['s1', 's2', 's3']);
    expect(idsFor({ ...NONE, course: NO_COURSE })).toEqual(['s5']);
    expect(idsFor({ ...NONE, course: C1, classId: C1A })).toEqual(['s1']);
    expect(idsFor({ ...NONE, course: C1, classId: NO_CLASS })).toEqual(['s2']);
  });

  it('filters by cafeteria and by scholarship', () => {
    expect(idsFor({ ...NONE, cafeteria: 'yes' })).toEqual(['s1', 's2']);
    expect(idsFor({ ...NONE, cafeteria: 'no' })).toEqual(['s3', 's4', 's5', 's6']);
    expect(idsFor({ ...NONE, cafeteria: 'yes', scholarship: 'yes' })).toEqual(['s1']);
    expect(idsFor({ ...NONE, cafeteria: 'yes', scholarship: 'no' })).toEqual(['s2']);
  });

  it('combines every filter', () => {
    const filters: StudentFilters = {
      course: C1,
      classId: C1A,
      cafeteria: 'yes',
      scholarship: 'yes',
    };

    expect(idsFor(filters)).toEqual(['s1']);
    expect(idsFor({ ...filters, scholarship: 'no' })).toEqual([]);
  });

  it('does not apply a class without a concrete course', () => {
    expect(idsFor({ ...NONE, classId: C1A })).toEqual(['s1', 's2', 's3', 's4', 's5', 's6']);
  });
});

describe('hasActiveFilters', () => {
  it('is false without filters and true with any', () => {
    expect(hasActiveFilters(NONE)).toBe(false);
    expect(hasActiveFilters({ ...NONE, course: C1 })).toBe(true);
    expect(hasActiveFilters({ ...NONE, cafeteria: 'no' })).toBe(true);
    expect(hasActiveFilters({ ...NONE, course: C1, classId: NO_CLASS })).toBe(true);
    expect(hasActiveFilters({ ...NONE, cafeteria: 'yes', scholarship: 'yes' })).toBe(true);
  });
});
