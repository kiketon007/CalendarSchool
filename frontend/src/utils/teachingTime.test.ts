import { describe, expect, it } from 'vitest';
import { formatTeachingRange, formatTeachingTime } from './teachingTime';

describe('formatTeachingTime', () => {
  it.each([
    [0, '0 min'],
    [1, '1 min'],
    [45, '45 min'],
    [59, '59 min'],
    [60, '1 h'],
    [75, '1 h 15 min'],
    [1200, '20 h'],
    [1305, '21 h 45 min'],
    [1380, '23 h'],
    [1440, '24 h'],
    [1500, '25 h'],
  ])('writes %i minutes as «%s»', (minutes, text) => {
    expect(formatTeachingTime(minutes)).toBe(text);
  });
});

describe('formatTeachingRange', () => {
  it('writes one value when the minimum and the maximum are the same', () => {
    expect(formatTeachingRange(1200, 1200)).toBe('20 h');
  });

  it('writes both values with a dash when they differ', () => {
    expect(formatTeachingRange(1290, 1305)).toBe('21 h 30 min – 21 h 45 min');
    expect(formatTeachingRange(1350, 1500)).toBe('22 h 30 min – 25 h');
  });

  it('writes zero as «0 min»', () => {
    expect(formatTeachingRange(0, 0)).toBe('0 min');
  });
});
