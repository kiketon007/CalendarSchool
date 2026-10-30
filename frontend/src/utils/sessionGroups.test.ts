import { describe, expect, it } from 'vitest';
import { sessionGroupsOf } from './sessionGroups';

const periods = (letters: string) =>
  [...letters].map((letter) => ({
    type: letter === 'B' ? ('BREAK' as const) : ('SESSION' as const),
  }));

describe('sessionGroupsOf', () => {
  it.each([
    ['', []],
    ['S', [1]],
    ['SSS', [3]],
    ['SBSS', [1, 2]],
    ['SSBSBS', [2, 1, 1]],
    ['BSS', [2]],
    ['SSB', [2]],
    ['SBBS', [1, 1]],
  ])('groups %j as %j', (letters, groups) => {
    expect(sessionGroupsOf(periods(letters))).toEqual(groups);
  });
});
