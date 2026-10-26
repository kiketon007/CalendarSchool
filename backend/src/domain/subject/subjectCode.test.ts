import { describe, expect, it } from 'vitest';
import { cleanCode, normalizeCode } from './subjectCode.js';

describe('cleanCode', () => {
  it('trims the outer spaces and keeps the case the user wrote', () => {
    expect(cleanCode('  ING-2 ')).toBe('ING-2');
  });

  it('composes the accents (NFC) so the same code written two ways is the same', () => {
    const decomposed = 'Mús';

    expect(cleanCode(decomposed)).toBe('Mús');
    expect(cleanCode(decomposed)).toHaveLength(3);
  });
});

describe('normalizeCode', () => {
  it('lower-cases the code so two codes that differ only in case are the same', () => {
    expect(normalizeCode('ING')).toBe('ing');
    expect(normalizeCode('Ing')).toBe(normalizeCode('iNG'));
  });

  it('keeps the accents and the signs, which tell codes apart', () => {
    expect(normalizeCode('MÚS')).toBe('mús');
    expect(normalizeCode('1º/A-2')).toBe('1º/a-2');
    expect(normalizeCode('MUS')).not.toBe(normalizeCode('MÚS'));
  });

  it('cleans before comparing: outer spaces and composed accents do not count', () => {
    expect(normalizeCode('  Mús ')).toBe('mús');
  });
});
