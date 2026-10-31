import { describe, expect, it } from 'vitest';
import {
  courseOptions,
  hasActiveFilters,
  matchesConstraintFilters,
  type ConstraintFilters,
} from './constraintFilters';

const NO_FILTERS: ConstraintFilters = {
  type: '',
  courseId: '',
  query: '',
  onlyWithWarnings: false,
};

const rule = (
  type: 'MAX_PER_DAY' | 'BLOCK' | 'FORBIDDEN_SLOTS' | 'PREFERRED_SLOTS',
  course: { id: string; name: string },
  subject: { name: string; code: string | null },
  warnings: { code: 'SUBJECT_DOES_NOT_FIT' }[] = [],
) => ({ type, course, subject, warnings });

const first = { id: 'c1', name: '1º Primaria' };
const second = { id: 'c2', name: '2º Primaria' };
const tenth = { id: 'c10', name: '10º Primaria' };

const english = rule('MAX_PER_DAY', first, { name: 'Inglés', code: 'ING' });
const religion = rule('FORBIDDEN_SLOTS', first, { name: 'Religión', code: null }, [
  { code: 'SUBJECT_DOES_NOT_FIT' },
]);
const music = rule('BLOCK', second, { name: 'Música', code: 'MUS' });
const all = [english, religion, music];

const names = (filters: ConstraintFilters) =>
  all.filter((entry) => matchesConstraintFilters(entry, filters)).map((r) => r.subject.name);

describe('matchesConstraintFilters', () => {
  it('lets every rule through without filters', () => {
    expect(names(NO_FILTERS)).toEqual(['Inglés', 'Religión', 'Música']);
  });

  it('filters by type', () => {
    expect(names({ ...NO_FILTERS, type: 'FORBIDDEN_SLOTS' })).toEqual(['Religión']);
    expect(names({ ...NO_FILTERS, type: 'BLOCK' })).toEqual(['Música']);
    expect(names({ ...NO_FILTERS, type: 'PREFERRED_SLOTS' })).toEqual([]);
  });

  it('filters by course', () => {
    expect(names({ ...NO_FILTERS, courseId: 'c1' })).toEqual(['Inglés', 'Religión']);
    expect(names({ ...NO_FILTERS, courseId: 'c2' })).toEqual(['Música']);
    expect(names({ ...NO_FILTERS, courseId: 'other' })).toEqual([]);
  });

  it('searches by name or by code, part of a word, without capitals or accents', () => {
    expect(names({ ...NO_FILTERS, query: 'ingl' })).toEqual(['Inglés']);
    expect(names({ ...NO_FILTERS, query: 'RELIGION' })).toEqual(['Religión']);
    expect(names({ ...NO_FILTERS, query: 'mus' })).toEqual(['Música']);
    expect(names({ ...NO_FILTERS, query: 'ing' })).toEqual(['Inglés']);
    expect(names({ ...NO_FILTERS, query: 'zzz' })).toEqual([]);
  });

  it('does not search the name of the course', () => {
    expect(names({ ...NO_FILTERS, query: 'primaria' })).toEqual([]);
  });

  it('keeps only the rules with warnings', () => {
    expect(names({ ...NO_FILTERS, onlyWithWarnings: true })).toEqual(['Religión']);
  });

  it('combines every filter', () => {
    expect(
      names({ type: 'FORBIDDEN_SLOTS', courseId: 'c1', query: 'rel', onlyWithWarnings: true }),
    ).toEqual(['Religión']);
    expect(
      names({ type: 'FORBIDDEN_SLOTS', courseId: 'c2', query: '', onlyWithWarnings: false }),
    ).toEqual([]);
    expect(names({ type: '', courseId: 'c1', query: 'ingl', onlyWithWarnings: true })).toEqual([]);
  });
});

describe('courseOptions', () => {
  it('lists each course once, in natural order, only the ones that have rules', () => {
    const rules = [
      rule('BLOCK', tenth, { name: 'A', code: null }),
      rule('BLOCK', second, { name: 'B', code: null }),
      rule('MAX_PER_DAY', second, { name: 'C', code: null }),
      rule('BLOCK', first, { name: 'D', code: null }),
    ];

    expect(courseOptions(rules)).toEqual([first, second, tenth]);
  });

  it('is empty without rules', () => {
    expect(courseOptions([])).toEqual([]);
  });
});

describe('hasActiveFilters', () => {
  it('is false without filters', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
  });

  it('is false for a search of only spaces', () => {
    expect(hasActiveFilters({ ...NO_FILTERS, query: '   ' })).toBe(false);
  });

  it.each<[string, Partial<ConstraintFilters>]>([
    ['a type', { type: 'BLOCK' }],
    ['a course', { courseId: 'c1' }],
    ['a search', { query: 'a' }],
    ['only with warnings', { onlyWithWarnings: true }],
  ])('is true with %s', (_name, filters) => {
    expect(hasActiveFilters({ ...NO_FILTERS, ...filters })).toBe(true);
  });
});
