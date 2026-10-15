import { describe, expect, it } from 'vitest';
import { retryAfterMinutes } from './retryAfterMinutes';

describe('retryAfterMinutes', () => {
  it.each([
    [1, 1],
    [59, 1],
    [60, 1],
    [61, 2],
    [120, 2],
    [840, 14],
    [899, 15],
    [900, 15],
  ])('rounds %i seconds up to %i whole minutes', (seconds, minutes) => {
    expect(retryAfterMinutes(seconds)).toBe(minutes);
  });

  it.each([0, 0.2, -30])('never reports less than 1 minute (%s seconds)', (seconds) => {
    expect(retryAfterMinutes(seconds)).toBe(1);
  });
});
