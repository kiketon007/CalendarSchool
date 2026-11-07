import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('takes the first letter of the first name and of the last name, in capitals', () => {
    expect(initialsOf('Ana', 'García')).toBe('AG');
    expect(initialsOf('luis', 'pérez')).toBe('LP');
  });

  it('keeps the accent of a capital and capitalises an accented letter', () => {
    expect(initialsOf('Álvaro', 'Núñez')).toBe('ÁN');
    expect(initialsOf('émile', 'ñandú')).toBe('ÉÑ');
  });

  it('ignores spaces around each part and uses only the first word of it', () => {
    expect(initialsOf('  José María ', ' García-López  ')).toBe('JG');
  });

  it('gives a single letter when one part is empty', () => {
    expect(initialsOf('Ana', '')).toBe('A');
    expect(initialsOf('   ', 'García')).toBe('G');
  });

  it('gives an empty text when both parts are empty', () => {
    expect(initialsOf('', '  ')).toBe('');
  });

  it('does not split a character outside the basic plane', () => {
    expect(initialsOf('𝒜na', '𝓑ravo')).toBe('𝒜𝓑');
  });
});
