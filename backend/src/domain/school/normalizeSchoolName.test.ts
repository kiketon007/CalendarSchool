import { describe, expect, it } from 'vitest';
import { normalizeSchoolName } from './normalizeSchoolName.js';

describe('normalizeSchoolName', () => {
  it.each([
    ['CEIP Lluís Vives', 'ceiplluisvives'],
    ['C.E.I.P. Nº 3', 'ceipn3'],
    ['ceip n 3', 'ceipn3'],
    ['Escola Mare de Déu', 'escolamarededeu'],
    ['Col·legi Ñandú-Çanyelles', 'colleginanducanyelles'],
    ["L'Horta d'Or", 'lhortador'],
    ['Santa Teresa 2ª', 'santateresa2'],
  ])('turns "%s" into "%s"', (name, expected) => {
    expect(normalizeSchoolName(name)).toBe(expected);
  });

  it('gives the same result for composed (NFC) and decomposed (NFD) accents', () => {
    const composed = 'Lluís'.normalize('NFC');
    const decomposed = 'Lluís'.normalize('NFD');

    expect(decomposed).not.toBe(composed);
    expect(normalizeSchoolName(decomposed)).toBe(normalizeSchoolName(composed));
  });

  it('ignores case, spaces and punctuation', () => {
    expect(normalizeSchoolName('  CEIP   LLUÍS-VIVES. ')).toBe('ceiplluisvives');
  });

  it('returns an empty string when there are no letters or digits', () => {
    expect(normalizeSchoolName(" .-' ")).toBe('');
  });
});
