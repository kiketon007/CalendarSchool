import { describe, expect, it } from 'vitest';
import { cleanName, normalizeName } from './courseNames.js';

describe('cleanName', () => {
  it.each([
    ['  1º   Primaria  ', '1º Primaria'],
    ['Infantil\t3\n años', 'Infantil 3 años'],
    ['A', 'A'],
    ['   ', ''],
  ])('turns "%s" into "%s"', (name, expected) => {
    expect(cleanName(name)).toBe(expected);
  });

  it('keeps the case, the accents and the ordinal signs', () => {
    expect(cleanName(' 6ª Primaria ÑOÑO ')).toBe('6ª Primaria ÑOÑO');
  });

  it('gives the same result for composed (NFC) and decomposed (NFD) accents', () => {
    const composed = 'Educación'.normalize('NFC');
    const decomposed = 'Educación'.normalize('NFD');

    expect(decomposed).not.toBe(composed);
    expect(cleanName(decomposed)).toBe(composed);
  });
});

describe('normalizeName', () => {
  it.each([
    ['1º Primaria', '1º primaria'],
    ['  1º   PRIMARIA ', '1º primaria'],
    ['Infantil 3 AÑOS', 'infantil 3 años'],
    ['2º ESO-A/B', '2º eso-a/b'],
  ])('turns "%s" into "%s"', (name, expected) => {
    expect(normalizeName(name)).toBe(expected);
  });

  it('treats names that differ only in case or in spaces as the same', () => {
    expect(normalizeName('1º primaria')).toBe(normalizeName('  1º   Primaria '));
  });

  it('keeps the accents: they distinguish names', () => {
    expect(normalizeName('Año')).not.toBe(normalizeName('Ano'));
  });

  it('keeps different ordinal signs apart', () => {
    expect(normalizeName('1º')).not.toBe(normalizeName('1ª'));
  });

  it('gives the same result for composed and decomposed accents', () => {
    expect(normalizeName('Educación'.normalize('NFD'))).toBe(
      normalizeName('Educación'.normalize('NFC')),
    );
  });
});
