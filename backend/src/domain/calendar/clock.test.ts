import { describe, expect, it } from 'vitest';
import { formatClock, parseClock } from './clock.js';

describe('parseClock', () => {
  it.each([
    ['00:00', 0],
    ['09:00', 540],
    ['09:45', 585],
    ['12:30', 750],
    ['23:59', 1439],
  ])('reads "%s" as %i minutes since midnight', (text, minutes) => {
    expect(parseClock(text)).toBe(minutes);
  });

  it.each([
    '',
    '9:00',
    '09:0',
    '09-00',
    '24:00',
    '12:60',
    '0900',
    '09:00:00',
    ' 09:00',
    '09:00 ',
    'aa:bb',
    '-1:00',
  ])('does not read "%s"', (text) => {
    expect(parseClock(text)).toBeNull();
  });
});

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [540, '09:00'],
    [585, '09:45'],
    [1439, '23:59'],
  ])('writes %i minutes as "%s"', (minutes, text) => {
    expect(formatClock(minutes)).toBe(text);
  });

  it('is the inverse of parseClock for every minute of the day', () => {
    for (let minutes = 0; minutes < 1440; minutes += 1) {
      expect(parseClock(formatClock(minutes))).toBe(minutes);
    }
  });
});
