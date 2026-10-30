import { describe, expect, it } from 'vitest';
import { sessionGroupsOf } from './sessionGroups.js';

describe('sessionGroupsOf', () => {
  it.each([
    [[], []],
    [['SESSION'], [1]],
    [['SESSION', 'SESSION', 'SESSION'], [3]],
    [
      ['SESSION', 'BREAK', 'SESSION', 'SESSION'],
      [1, 2],
    ],
    [
      ['SESSION', 'SESSION', 'BREAK', 'SESSION', 'BREAK', 'SESSION'],
      [2, 1, 1],
    ],
    [['BREAK', 'SESSION', 'SESSION'], [2]],
    [['SESSION', 'SESSION', 'BREAK'], [2]],
    [
      ['SESSION', 'BREAK', 'BREAK', 'SESSION'],
      [1, 1],
    ],
  ] as const)('groups %j as %j', (kinds, groups) => {
    expect(sessionGroupsOf(kinds)).toEqual(groups);
  });
});
