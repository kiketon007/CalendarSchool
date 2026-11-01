import { describe, expect, it } from 'vitest';
import {
  hasActiveSummaryFilters,
  matchesSummaryFilters,
  summarySubjectOptions,
  type SummaryFilters,
} from './professorSummaryFilters';

const NO_FILTERS: SummaryFilters = {
  status: '',
  subjectId: '',
  query: '',
  onlyWithWarnings: false,
};

const subject = (subjectId: string, subjectName: string) => ({ subjectId, subjectName });

const professor = (
  firstName: string,
  lastName: string,
  status: 'NO_LOAD' | 'FITS' | 'MAY_EXCEED' | 'EXCEEDS',
  subjects: { subjectId: string; subjectName: string }[] = [],
  warnings: { code: 'MAY_EXCEED_MAX_HOURS' }[] = [],
) => ({ firstName, lastName, status, subjects, warnings });

const english = subject('s-eng', 'Inglés');
const music = subject('s-mus', 'Música');

const ana = professor('Ana', 'García', 'FITS', [english]);
const eva = professor(
  'Eva',
  'Pérez',
  'MAY_EXCEED',
  [english, music],
  [{ code: 'MAY_EXCEED_MAX_HOURS' }],
);
const luis = professor('Luis', 'Ruiz', 'NO_LOAD');

describe('matchesSummaryFilters', () => {
  it('lets everybody through without filters', () => {
    expect([ana, eva, luis].every((entry) => matchesSummaryFilters(entry, NO_FILTERS))).toBe(true);
  });

  it('filters by status', () => {
    const only = { ...NO_FILTERS, status: 'MAY_EXCEED' as const };

    expect([ana, eva, luis].filter((entry) => matchesSummaryFilters(entry, only))).toEqual([eva]);
  });

  it('filters by the subject the professor teaches', () => {
    const only = { ...NO_FILTERS, subjectId: 's-mus' };

    expect([ana, eva, luis].filter((entry) => matchesSummaryFilters(entry, only))).toEqual([eva]);
    expect(
      [ana, eva, luis].filter((entry) =>
        matchesSummaryFilters(entry, { ...NO_FILTERS, subjectId: 's-eng' }),
      ),
    ).toEqual([ana, eva]);
  });

  it('searches the name and the last name without capitals or accents, and every word has to appear', () => {
    const search = (query: string) =>
      [ana, eva, luis].filter((entry) => matchesSummaryFilters(entry, { ...NO_FILTERS, query }));

    expect(search('garcia')).toEqual([ana]);
    expect(search('PEREZ eva')).toEqual([eva]);
    expect(search('  ')).toEqual([ana, eva, luis]);
    expect(search('nadie')).toEqual([]);
  });

  it('does not search the subjects in the name: that is the filter of the subject', () => {
    expect(matchesSummaryFilters(ana, { ...NO_FILTERS, query: 'ingles' })).toBe(false);
  });

  it('keeps only the professors with warnings when asked', () => {
    const only = { ...NO_FILTERS, onlyWithWarnings: true };

    expect([ana, eva, luis].filter((entry) => matchesSummaryFilters(entry, only))).toEqual([eva]);
  });

  it('combines every filter', () => {
    const filters: SummaryFilters = {
      status: 'MAY_EXCEED',
      subjectId: 's-eng',
      query: 'eva',
      onlyWithWarnings: true,
    };

    expect([ana, eva, luis].filter((entry) => matchesSummaryFilters(entry, filters))).toEqual([
      eva,
    ]);
    expect(matchesSummaryFilters(eva, { ...filters, status: 'EXCEEDS' })).toBe(false);
    expect(matchesSummaryFilters(eva, { ...filters, subjectId: 'other' })).toBe(false);
    expect(matchesSummaryFilters(eva, { ...filters, query: 'ana' })).toBe(false);
  });
});

describe('summarySubjectOptions', () => {
  it('offers each subject once, taught by anybody, by name', () => {
    expect(summarySubjectOptions([eva, ana, luis])).toEqual([
      { id: 's-eng', name: 'Inglés' },
      { id: 's-mus', name: 'Música' },
    ]);
  });

  it('offers nothing when nobody teaches', () => {
    expect(summarySubjectOptions([luis])).toEqual([]);
  });

  it('puts the accented names where the Spanish order says', () => {
    const options = summarySubjectOptions([
      professor('A', 'B', 'FITS', [subject('s-3', 'Religión'), subject('s-1', 'Álgebra')]),
    ]);

    expect(options.map(({ name }) => name)).toEqual(['Álgebra', 'Religión']);
  });
});

describe('hasActiveSummaryFilters', () => {
  it('is false without filters and for a search of only spaces', () => {
    expect(hasActiveSummaryFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveSummaryFilters({ ...NO_FILTERS, query: '   ' })).toBe(false);
  });

  it.each([
    { status: 'FITS' as const },
    { subjectId: 's-eng' },
    { query: 'ana' },
    { onlyWithWarnings: true },
  ])('is true with %j', (change) => {
    expect(hasActiveSummaryFilters({ ...NO_FILTERS, ...change })).toBe(true);
  });
});
