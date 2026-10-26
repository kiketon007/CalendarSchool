import { describe, expect, it } from 'vitest';
import { matchesSubjectFilters, type SubjectFilters } from './subjectFilters';

const NO_FILTERS: SubjectFilters = { type: '', status: '', query: '' };

const english = { name: 'Inglés', code: 'ING', type: 'CORE', status: 'ACTIVE' } as const;
const programming = {
  name: 'Programación',
  code: null,
  type: 'CUSTOM',
  status: 'ACTIVE',
} as const;
const french = { name: 'Francés', code: 'FR-2', type: 'ELECTIVE', status: 'INACTIVE' } as const;

const names = (filters: SubjectFilters) =>
  [english, programming, french]
    .filter((subject) => matchesSubjectFilters(subject, filters))
    .map(({ name }) => name);

describe('matchesSubjectFilters', () => {
  it('lets every subject through without filters', () => {
    expect(names(NO_FILTERS)).toEqual(['Inglés', 'Programación', 'Francés']);
  });

  it('filters by type', () => {
    expect(names({ ...NO_FILTERS, type: 'CORE' })).toEqual(['Inglés']);
    expect(names({ ...NO_FILTERS, type: 'ELECTIVE' })).toEqual(['Francés']);
    expect(names({ ...NO_FILTERS, type: 'CUSTOM' })).toEqual(['Programación']);
  });

  it('filters by status', () => {
    expect(names({ ...NO_FILTERS, status: 'INACTIVE' })).toEqual(['Francés']);
    expect(names({ ...NO_FILTERS, status: 'ACTIVE' })).toEqual(['Inglés', 'Programación']);
  });

  it('searches in the name, part of a word, without capitals or accents', () => {
    expect(names({ ...NO_FILTERS, query: 'prog' })).toEqual(['Programación']);
    expect(names({ ...NO_FILTERS, query: 'INGLES' })).toEqual(['Inglés']);
    expect(names({ ...NO_FILTERS, query: 'frances' })).toEqual(['Francés']);
    expect(names({ ...NO_FILTERS, query: 'ación' })).toEqual(['Programación']);
  });

  it('searches in the code too, and a subject without code only matches by its name', () => {
    expect(names({ ...NO_FILTERS, query: 'ing' })).toEqual(['Inglés']);
    expect(names({ ...NO_FILTERS, query: 'fr-2' })).toEqual(['Francés']);
    expect(names({ ...NO_FILTERS, query: 'null' })).toEqual([]);
  });

  it('ignores outer spaces and treats an empty search as no search', () => {
    expect(names({ ...NO_FILTERS, query: '  prog  ' })).toEqual(['Programación']);
    expect(names({ ...NO_FILTERS, query: '   ' })).toEqual(['Inglés', 'Programación', 'Francés']);
  });

  it('treats special characters as plain text', () => {
    expect(names({ ...NO_FILTERS, query: '.*' })).toEqual([]);
    expect(names({ ...NO_FILTERS, query: '-2' })).toEqual(['Francés']);
  });

  it('combines the three filters: a subject must pass all of them', () => {
    expect(names({ type: 'CORE', status: 'ACTIVE', query: 'ing' })).toEqual(['Inglés']);
    expect(names({ type: 'CORE', status: 'INACTIVE', query: '' })).toEqual([]);
    expect(names({ type: '', status: 'ACTIVE', query: 'fr' })).toEqual([]);
  });
});
