import { describe, expect, it } from 'vitest';
import { longDate } from './longDate';

describe('longDate', () => {
  it('writes the full date in Spanish with a capital initial', () => {
    expect(longDate(new Date(2026, 10, 8, 12, 0), 'es')).toEqual({
      label: 'Domingo, 8 de noviembre de 2026',
      iso: '2026-11-08',
    });
  });

  it('writes the full date in English', () => {
    expect(longDate(new Date(2026, 10, 8, 12, 0), 'en')).toEqual({
      label: 'Sunday, November 8, 2026',
      iso: '2026-11-08',
    });
  });

  it('takes the ISO day from the local date, not from UTC', () => {
    // 0:30 locales: en cualquier zona al este de UTC, el instante UTC cae en el día anterior.
    const justAfterMidnight = new Date(2026, 0, 1, 0, 30);

    expect(longDate(justAfterMidnight, 'es').iso).toBe('2026-01-01');
  });

  it('pads the month and the day to two digits', () => {
    expect(longDate(new Date(2026, 2, 5, 9, 0), 'en').iso).toBe('2026-03-05');
  });
});
