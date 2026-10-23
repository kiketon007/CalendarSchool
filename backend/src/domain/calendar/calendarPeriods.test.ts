import { describe, expect, it } from 'vitest';
import type { CalendarPeriod } from './calendar.js';
import {
  validatePeriods,
  MAX_BREAKS,
  MAX_PERIOD_MINUTES,
  MAX_SESSIONS,
} from './calendarPeriods.js';

const session = (startTime: string, endTime: string): CalendarPeriod => ({
  type: 'SESSION',
  startTime,
  endTime,
});
const recess = (startTime: string, endTime: string): CalendarPeriod => ({
  type: 'BREAK',
  startTime,
  endTime,
});

/** La jornada de Primaria de Horarios.docx. */
const primary: CalendarPeriod[] = [
  session('09:00', '09:45'),
  session('09:45', '10:30'),
  session('10:30', '11:15'),
  recess('11:15', '11:45'),
  session('11:45', '12:30'),
  session('12:30', '13:15'),
  session('13:15', '14:00'),
];

/** La de Infantil: el patio dura 45 minutos y la sesión 4 se reduce a 30. */
const infant: CalendarPeriod[] = [
  session('09:00', '09:45'),
  session('09:45', '10:30'),
  session('10:30', '11:15'),
  recess('11:15', '12:00'),
  session('12:00', '12:30'),
  session('12:30', '13:15'),
  session('13:15', '14:00'),
];

/** `count` sesiones contiguas de 30 minutos desde las 08:00. */
function sessions(count: number): CalendarPeriod[] {
  return Array.from({ length: count }, (_, index) => {
    const start = 480 + index * 30;
    const clock = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    return session(clock(start), clock(start + 30));
  });
}

describe('validatePeriods', () => {
  it('accepts the primary and the infant days', () => {
    expect(validatePeriods(primary)).toEqual([]);
    expect(validatePeriods(infant)).toEqual([]);
  });

  it('accepts a single session, a gap between periods and two breaks', () => {
    expect(validatePeriods([session('09:00', '10:30')])).toEqual([]);
    expect(validatePeriods([session('09:00', '09:45'), session('10:00', '10:45')])).toEqual([]);
    expect(
      validatePeriods([
        session('09:00', '09:45'),
        recess('09:45', '10:00'),
        session('10:00', '10:45'),
        recess('10:45', '11:00'),
        session('11:00', '11:45'),
      ]),
    ).toEqual([]);
  });

  it('accepts the limits: 8 sessions, 2 breaks and 90 minutes', () => {
    expect(MAX_SESSIONS).toBe(8);
    expect(MAX_BREAKS).toBe(2);
    expect(MAX_PERIOD_MINUTES).toBe(90);
    expect(validatePeriods(sessions(8))).toEqual([]);
    expect(validatePeriods([session('09:00', '10:30')])).toEqual([]);
  });

  describe('the whole list', () => {
    it('asks for at least one session', () => {
      expect(validatePeriods([])).toEqual([{ field: 'periods', code: 'REQUIRED' }]);
    });

    it('does not count a break as a session', () => {
      expect(validatePeriods([recess('09:00', '09:30')])).toEqual([
        { field: 'periods', code: 'REQUIRED' },
        { field: 'periods[0].type', code: 'NOT_ALLOWED' },
      ]);
    });

    it('rejects a ninth session', () => {
      expect(validatePeriods(sessions(9))).toEqual([{ field: 'periods', code: 'INVALID_LENGTH' }]);
    });

    it('rejects a third break', () => {
      const periods = [
        session('09:00', '09:30'),
        recess('09:30', '09:45'),
        session('09:45', '10:15'),
        recess('10:15', '10:30'),
        session('10:30', '11:00'),
        recess('11:00', '11:15'),
        session('11:15', '11:45'),
      ];

      expect(validatePeriods(periods)).toEqual([{ field: 'periods', code: 'INVALID_LENGTH' }]);
    });
  });

  describe('the place of a break', () => {
    it.each([
      ['first', [recess('09:00', '09:30'), session('09:30', '10:15')], 0],
      ['last', [session('09:00', '09:45'), recess('09:45', '10:15')], 1],
    ])('rejects a break that is the %s period', (_name, periods, index) => {
      expect(validatePeriods(periods)).toEqual([
        { field: `periods[${String(index)}].type`, code: 'NOT_ALLOWED' },
      ]);
    });

    it('rejects two breaks in a row, each one', () => {
      const periods = [
        session('09:00', '09:45'),
        recess('09:45', '10:00'),
        recess('10:00', '10:15'),
        session('10:15', '11:00'),
      ];

      expect(validatePeriods(periods)).toEqual([
        { field: 'periods[1].type', code: 'NOT_ALLOWED' },
        { field: 'periods[2].type', code: 'NOT_ALLOWED' },
      ]);
    });
  });

  describe('each period', () => {
    it.each([
      ['an end equal to the start', session('09:00', '09:00')],
      ['an end before the start', session('09:00', '08:00')],
    ])('rejects %s with INVALID_RANGE on the end', (_name, period) => {
      expect(validatePeriods([period])).toEqual([
        { field: 'periods[0].endTime', code: 'INVALID_RANGE' },
      ]);
    });

    it('rejects a session of more than 90 minutes with TOO_LONG on the end', () => {
      expect(validatePeriods([session('09:00', '10:31')])).toEqual([
        { field: 'periods[0].endTime', code: 'TOO_LONG' },
      ]);
    });

    it('rejects a break of more than 90 minutes with TOO_LONG too', () => {
      const periods = [
        session('09:00', '09:45'),
        recess('09:45', '11:16'),
        session('11:16', '12:00'),
      ];

      expect(validatePeriods(periods)).toEqual([{ field: 'periods[1].endTime', code: 'TOO_LONG' }]);
    });

    it.each([
      ['starts before the previous one ends', session('09:44', '10:30')],
      ['starts at the same time as the previous one', session('09:00', '10:00')],
      ['is before the previous one', session('08:00', '08:45')],
    ])('rejects a period that %s with OVERLAP on its start', (_name, second) => {
      expect(validatePeriods([session('09:00', '09:45'), second])).toEqual([
        { field: 'periods[1].startTime', code: 'OVERLAP' },
      ]);
    });

    it('reports a bad period once and does not compare the next one with it', () => {
      const periods = [session('09:00', '08:00'), session('08:30', '09:15')];

      expect(validatePeriods(periods)).toEqual([
        { field: 'periods[0].endTime', code: 'INVALID_RANGE' },
      ]);
    });
  });

  it('reports the errors in the order of the list', () => {
    const periods = [
      session('09:00', '09:45'),
      session('09:30', '10:30'),
      session('10:30', '12:30'),
    ];

    expect(validatePeriods(periods)).toEqual([
      { field: 'periods[1].startTime', code: 'OVERLAP' },
      { field: 'periods[2].endTime', code: 'TOO_LONG' },
    ]);
  });
});
