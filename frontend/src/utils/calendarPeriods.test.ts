import { describe, expect, it } from 'vitest';
import {
  generatePeriods,
  sessionNumbers,
  sortPeriods,
  summaryOf,
  toClock,
  toMinutes,
} from './calendarPeriods';

const session = (startTime: string, endTime: string) => ({
  type: 'SESSION' as const,
  startTime,
  endTime,
});
const recess = (startTime: string, endTime: string) => ({
  type: 'BREAK' as const,
  startTime,
  endTime,
});

describe('toMinutes and toClock', () => {
  it.each([
    ['00:00', 0],
    ['09:00', 540],
    ['23:59', 1439],
  ])('reads "%s" as %i minutes and writes them back', (clock, minutes) => {
    expect(toMinutes(clock)).toBe(minutes);
    expect(toClock(minutes)).toBe(clock);
  });

  it.each(['', '9:00', '24:00', '12:60', '09:00:00', ' 09:00', 'aa:bb'])(
    'does not read "%s"',
    (clock) => {
      expect(toMinutes(clock)).toBeNull();
    },
  );

  it('writes a time past the end of the day out of range, so that a form can flag it', () => {
    expect(toClock(1500)).toBe('25:00');
    expect(toMinutes(toClock(1500))).toBeNull();
  });
});

describe('generatePeriods', () => {
  it('generates the primary day of Horarios.docx: 6 sessions of 45 minutes and a break of 30 after the 3rd', () => {
    expect(
      generatePeriods({
        start: '09:00',
        sessionCount: 6,
        duration: 45,
        breakAfter: 3,
        breakDuration: 30,
      }),
    ).toEqual([
      session('09:00', '09:45'),
      session('09:45', '10:30'),
      session('10:30', '11:15'),
      recess('11:15', '11:45'),
      session('11:45', '12:30'),
      session('12:30', '13:15'),
      session('13:15', '14:00'),
    ]);
  });

  it('generates contiguous sessions without a break when none is asked for', () => {
    expect(
      generatePeriods({
        start: '08:30',
        sessionCount: 3,
        duration: 50,
        breakAfter: null,
        breakDuration: 20,
      }),
    ).toEqual([session('08:30', '09:20'), session('09:20', '10:10'), session('10:10', '11:00')]);
  });

  it('generates a single session', () => {
    expect(
      generatePeriods({
        start: '09:00',
        sessionCount: 1,
        duration: 90,
        breakAfter: null,
        breakDuration: 30,
      }),
    ).toEqual([session('09:00', '10:30')]);
  });

  it.each([0, 6, 7, -1])(
    'puts no break after session %i of 6, because a break goes between two sessions',
    (breakAfter) => {
      const periods = generatePeriods({
        start: '09:00',
        sessionCount: 6,
        duration: 45,
        breakAfter,
        breakDuration: 30,
      });

      expect(periods.filter(({ type }) => type === 'BREAK')).toEqual([]);
      expect(periods).toHaveLength(6);
    },
  );

  it('puts the break after the first and after the second-to-last session', () => {
    const first = generatePeriods({
      start: '09:00',
      sessionCount: 3,
      duration: 30,
      breakAfter: 1,
      breakDuration: 15,
    });
    const last = generatePeriods({
      start: '09:00',
      sessionCount: 3,
      duration: 30,
      breakAfter: 2,
      breakDuration: 15,
    });

    expect(first.map(({ type }) => type)).toEqual(['SESSION', 'BREAK', 'SESSION', 'SESSION']);
    expect(last.map(({ type }) => type)).toEqual(['SESSION', 'SESSION', 'BREAK', 'SESSION']);
  });

  it('returns nothing for a start that is not a time', () => {
    expect(
      generatePeriods({
        start: '',
        sessionCount: 3,
        duration: 45,
        breakAfter: null,
        breakDuration: 30,
      }),
    ).toEqual([]);
  });

  it('lets the times go past the end of the day, which the validation then flags', () => {
    const periods = generatePeriods({
      start: '23:00',
      sessionCount: 2,
      duration: 60,
      breakAfter: null,
      breakDuration: 30,
    });

    expect(periods[1]?.endTime).toBe('25:00');
  });
});

describe('sessionNumbers', () => {
  it('numbers the sessions in order and leaves the breaks without number', () => {
    expect(
      sessionNumbers([
        session('09:00', '09:45'),
        recess('09:45', '10:00'),
        session('10:00', '10:45'),
        session('10:45', '11:30'),
      ]),
    ).toEqual([1, null, 2, 3]);
  });

  it('renumbers by itself when a session is removed', () => {
    const periods = [
      session('09:00', '09:45'),
      session('09:45', '10:30'),
      session('10:30', '11:15'),
    ];

    expect(sessionNumbers(periods.filter((_, index) => index !== 0))).toEqual([1, 2]);
  });

  it('returns an empty list for no periods', () => {
    expect(sessionNumbers([])).toEqual([]);
  });
});

describe('summaryOf', () => {
  it('counts the sessions a day and a week and the lective minutes a day, without the breaks', () => {
    expect(
      summaryOf(
        generatePeriods({
          start: '09:00',
          sessionCount: 6,
          duration: 45,
          breakAfter: 3,
          breakDuration: 30,
        }),
      ),
    ).toEqual({ sessionsPerDay: 6, sessionsPerWeek: 30, lectiveMinutes: 270 });
  });

  it('adds the minutes of sessions of different duration (the infant day)', () => {
    expect(
      summaryOf([
        session('09:00', '09:45'),
        session('09:45', '10:30'),
        session('10:30', '11:15'),
        recess('11:15', '12:00'),
        session('12:00', '12:30'),
        session('12:30', '13:15'),
        session('13:15', '14:00'),
      ]),
    ).toEqual({ sessionsPerDay: 6, sessionsPerWeek: 30, lectiveMinutes: 255 });
  });

  it('ignores the periods whose times are not valid', () => {
    expect(summaryOf([session('', '09:45'), session('09:45', '10:30')])).toEqual({
      sessionsPerDay: 2,
      sessionsPerWeek: 10,
      lectiveMinutes: 45,
    });
  });

  it('is zero for no periods', () => {
    expect(summaryOf([])).toEqual({ sessionsPerDay: 0, sessionsPerWeek: 0, lectiveMinutes: 0 });
  });
});

describe('sortPeriods', () => {
  const row = (startTime: string, endTime: string, id: string) => ({ id, startTime, endTime });

  it('orders by start time', () => {
    const sorted = sortPeriods([
      row('11:45', '12:30', 'c'),
      row('09:00', '09:45', 'a'),
      row('09:45', '10:30', 'b'),
    ]);

    expect(sorted.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks a tie in the start time with the end time and then keeps the original order', () => {
    const sorted = sortPeriods([
      row('11:15', '12:00', 'long'),
      row('11:15', '11:45', 'short'),
      row('11:15', '11:45', 'same-as-short'),
    ]);

    expect(sorted.map(({ id }) => id)).toEqual(['short', 'same-as-short', 'long']);
  });

  it('keeps the extra fields of every item and does not change the input', () => {
    const input = [row('10:00', '10:45', 'b'), row('09:00', '09:45', 'a')];

    const sorted = sortPeriods(input);

    expect(sorted).toEqual([input[1], input[0]]);
    expect(input.map(({ id }) => id)).toEqual(['b', 'a']);
  });

  it('returns the same order when a time is empty or badly written, because it cannot be sorted', () => {
    const input = [row('11:45', '12:30', 'b'), row('', '09:45', 'a'), row('09:45', '10:30', 'c')];
    expect(sortPeriods(input).map(({ id }) => id)).toEqual(['b', 'a', 'c']);

    const badEnd = [row('11:45', '12:30', 'b'), row('09:00', '9h', 'a')];
    expect(sortPeriods(badEnd).map(({ id }) => id)).toEqual(['b', 'a']);
  });

  it('returns an empty list for an empty list', () => {
    expect(sortPeriods([])).toEqual([]);
  });
});
