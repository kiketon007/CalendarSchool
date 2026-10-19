import { describe, expect, it } from 'vitest';
import { matchesCourseSearch, normalizeForSearch } from './courseSearch';

describe('normalizeForSearch', () => {
  it.each([
    ['Educación Infantil', 'educacion infantil'],
    ['ÑANDÚ', 'nandu'],
    ['  1º   Primaria  ', '1º primaria'],
    ['Infantil 3 AÑOS', 'infantil 3 anos'],
    ['6ª Primaria', '6ª primaria'],
    ['ESO-A/B', 'eso-a/b'],
    ['', ''],
    ['   ', ''],
  ])('turns "%s" into "%s"', (text, expected) => {
    expect(normalizeForSearch(text)).toBe(expected);
  });

  it('gives the same result for composed (NFC) and decomposed (NFD) accents', () => {
    const composed = 'Educación'.normalize('NFC');
    const decomposed = 'Educación'.normalize('NFD');

    expect(decomposed).not.toBe(composed);
    expect(normalizeForSearch(decomposed)).toBe(normalizeForSearch(composed));
  });

  it('keeps the ordinal signs º and ª, which tell names apart', () => {
    expect(normalizeForSearch('1º')).not.toBe(normalizeForSearch('1ª'));
  });
});

describe('matchesCourseSearch', () => {
  it.each(['', '   ', '\t'])('matches every name when the search is empty ("%s")', (query) => {
    expect(matchesCourseSearch('1º Primaria', query)).toBe(true);
    expect(matchesCourseSearch('', query)).toBe(true);
  });

  it.each([
    ['1º Primaria', 'primaria'],
    ['1º Primaria', 'PRIMARIA'],
    ['1º Primaria', 'prim'],
    ['1º Primaria', '1º'],
    ['1º Primaria', 'º p'],
    ['Educación Infantil', 'educacion'],
    ['Educación Infantil', 'EDUCACIÓN'],
    ['Educación Infantil', 'cion inf'],
    ['Infantil 3 años', 'anos'],
    ['Infantil 3 años', 'años'],
    ['Infantil 3 años', 'AÑOS'],
    ['2º ESO-A/B', 'eso-a'],
    ['1º Primaria', '  primaria  '],
    ['1º Primaria', '1º   primaria'],
  ])('finds a part of "%s" with "%s"', (name, query) => {
    expect(matchesCourseSearch(name, query)).toBe(true);
  });

  it.each([
    ['1º Primaria', 'secundaria'],
    ['1º Primaria', 'XYZ'],
    ['1º Primaria', '2º'],
    ['1ª Primaria', '1º'],
    ['1º Primaria', '1ª'],
    ['1º Primaria', 'primariaa'],
  ])('does not find a part of "%s" with "%s"', (name, query) => {
    expect(matchesCourseSearch(name, query)).toBe(false);
  });

  it('treats the characters of a regular expression as plain text', () => {
    expect(matchesCourseSearch('1º Primaria', '.*')).toBe(false);
    expect(matchesCourseSearch('Curso (A)', '(a)')).toBe(true);
    expect(matchesCourseSearch('2º ESO/B', 'eso/b')).toBe(true);
  });
});
