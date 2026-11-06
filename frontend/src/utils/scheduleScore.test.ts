import { describe, expect, it } from 'vitest';
import { isScheduleScore } from './scheduleScore';

const valid = {
  total: 134,
  preferredMisses: 8,
  preferredTotal: 50,
  professorGaps: 18,
  consecutiveDays: 6,
  initialTotal: 220,
};

describe('isScheduleScore', () => {
  it('accepts the six non-negative integers', () => {
    expect(isScheduleScore(valid)).toBe(true);
    expect(isScheduleScore({ ...valid, total: 0, initialTotal: 0 })).toBe(true);
  });

  it.each([
    ['a missing field', { ...valid, total: undefined }],
    ['a negative number', { ...valid, professorGaps: -1 }],
    ['a decimal', { ...valid, consecutiveDays: 1.5 }],
    ['a text', { ...valid, preferredTotal: '50' }],
    ['a not finite number', { ...valid, initialTotal: Infinity }],
    ['an extra field', { ...valid, extra: 1 }],
    ['null', null],
    ['an array', [valid]],
    ['a text instead of an object', 'score'],
    ['a number', 3],
    ['undefined', undefined],
  ])('rejects %s', (_name, value) => {
    expect(isScheduleScore(value)).toBe(false);
  });
});
