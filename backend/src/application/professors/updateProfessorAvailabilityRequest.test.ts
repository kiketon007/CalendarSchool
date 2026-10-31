import { describe, expect, it } from 'vitest';
import {
  MAX_INTERVALS,
  MAX_INTERVALS_PER_DAY,
  parseUpdateProfessorAvailabilityRequest,
} from './updateProfessorAvailabilityRequest.js';

const interval = (dayOfWeek: unknown, startTime: unknown, endTime: unknown) => ({
  dayOfWeek,
  startTime,
  endTime,
});

const failures = (body: unknown) => {
  const result = parseUpdateProfessorAvailabilityRequest(body);
  return result.success ? undefined : result.details;
};

describe('parseUpdateProfessorAvailabilityRequest', () => {
  describe('a valid body', () => {
    it('turns the hours into minutes and keeps the order of the body', () => {
      const result = parseUpdateProfessorAvailabilityRequest({
        unavailable: [interval(3, '10:30', '11:15'), interval(1, '00:00', '23:59')],
      });

      expect(result).toEqual({
        success: true,
        data: {
          intervals: [
            { dayOfWeek: 3, startMinute: 630, endMinute: 675 },
            { dayOfWeek: 1, startMinute: 0, endMinute: 1439 },
          ],
        },
      });
    });

    it('accepts an empty list: the professor is available always', () => {
      expect(parseUpdateProfessorAvailabilityRequest({ unavailable: [] })).toEqual({
        success: true,
        data: { intervals: [] },
      });
    });

    it('does not reject overlapping intervals: they are joined later', () => {
      expect(
        parseUpdateProfessorAvailabilityRequest({
          unavailable: [interval(1, '09:00', '10:00'), interval(1, '09:30', '11:00')],
        }).success,
      ).toBe(true);
    });

    it('ignores a school sent in the body and any other extra property', () => {
      const result = parseUpdateProfessorAvailabilityRequest({
        unavailable: [{ ...interval(1, '09:00', '10:00'), note: 'x' }],
        schoolId: 'other-school',
      });

      expect(result).toEqual({
        success: true,
        data: { intervals: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }] },
      });
    });

    it(`accepts ${String(MAX_INTERVALS_PER_DAY)} intervals in a day and ${String(MAX_INTERVALS)} in total`, () => {
      const day = (dayOfWeek: number, count: number) =>
        Array.from({ length: count }, (_, index) =>
          interval(dayOfWeek, `${String(Math.floor(index / 2)).padStart(2, '0')}:00`, '23:59'),
        );
      const all = [1, 2, 3, 4, 5].flatMap((dayOfWeek) => day(dayOfWeek, MAX_INTERVALS_PER_DAY));

      expect(all).toHaveLength(MAX_INTERVALS);
      expect(parseUpdateProfessorAvailabilityRequest({ unavailable: all }).success).toBe(true);
    });
  });

  describe('the list', () => {
    it.each([
      ['a missing list', {}],
      ['a null list', { unavailable: null }],
      ['a text', { unavailable: 'x' }],
      ['an object', { unavailable: {} }],
      ['a body that is not an object', 'x'],
      ['a null body', null],
    ])('rejects %s as REQUIRED', (_name, body) => {
      expect(failures(body)).toEqual([{ field: 'unavailable', code: 'REQUIRED' }]);
    });

    it('rejects more intervals than the total with INVALID_LENGTH and reads no interval', () => {
      const unavailable = Array.from({ length: MAX_INTERVALS + 1 }, () => interval(99, 'x', 'y'));

      expect(failures({ unavailable })).toEqual([{ field: 'unavailable', code: 'INVALID_LENGTH' }]);
    });
  });

  describe('the fields of each interval', () => {
    it.each([
      ['a missing day', interval(undefined, '09:00', '10:00')],
      ['a null day', interval(null, '09:00', '10:00')],
    ])('rejects %s as REQUIRED', (_name, item) => {
      expect(failures({ unavailable: [item] })).toEqual([
        { field: 'unavailable[0].dayOfWeek', code: 'REQUIRED' },
      ]);
    });

    it.each([0, 6, -1, 2.5, '2', true, NaN])('rejects the day %j as OUT_OF_RANGE', (day) => {
      expect(failures({ unavailable: [interval(day, '09:00', '10:00')] })).toEqual([
        { field: 'unavailable[0].dayOfWeek', code: 'OUT_OF_RANGE' },
      ]);
    });

    it.each([1, 5])('accepts the day %i', (day) => {
      expect(
        parseUpdateProfessorAvailabilityRequest({
          unavailable: [interval(day, '09:00', '10:00')],
        }).success,
      ).toBe(true);
    });

    it('rejects a missing or null hour as REQUIRED', () => {
      expect(
        failures({
          unavailable: [interval(1, undefined, null)],
        }),
      ).toEqual([
        { field: 'unavailable[0].startTime', code: 'REQUIRED' },
        { field: 'unavailable[0].endTime', code: 'REQUIRED' },
      ]);
    });

    it.each(['25:00', '9:00', '09:60', '09:00:00', '', ' 09:00', 900, true])(
      'rejects the hour %j as INVALID_FORMAT',
      (hour) => {
        expect(failures({ unavailable: [interval(1, hour, '23:59')] })).toEqual([
          { field: 'unavailable[0].startTime', code: 'INVALID_FORMAT' },
        ]);
        expect(failures({ unavailable: [interval(1, '00:00', hour)] })).toEqual([
          { field: 'unavailable[0].endTime', code: 'INVALID_FORMAT' },
        ]);
      },
    );

    it.each([
      ['an end equal to the start', '10:00', '10:00'],
      ['an end before the start', '10:00', '09:00'],
    ])('rejects %s as INVALID_RANGE on the end', (_name, start, end) => {
      expect(failures({ unavailable: [interval(1, start, end)] })).toEqual([
        { field: 'unavailable[0].endTime', code: 'INVALID_RANGE' },
      ]);
    });

    it('does not check the range when an hour is already wrong', () => {
      expect(failures({ unavailable: [interval(1, '25:00', '09:00')] })).toEqual([
        { field: 'unavailable[0].startTime', code: 'INVALID_FORMAT' },
      ]);
    });

    it.each([null, 'x', 5, undefined])(
      'rejects an item that is %j with all its fields as REQUIRED',
      (item) => {
        expect(failures({ unavailable: [item] })).toEqual([
          { field: 'unavailable[0].dayOfWeek', code: 'REQUIRED' },
          { field: 'unavailable[0].startTime', code: 'REQUIRED' },
          { field: 'unavailable[0].endTime', code: 'REQUIRED' },
        ]);
      },
    );

    it('reports every interval, with its position, in the order of the body', () => {
      expect(
        failures({
          unavailable: [
            interval(6, '09:00', '10:00'),
            interval(1, '09:00', '10:00'),
            interval(2, '25:00', '10:00'),
            interval(3, '11:00', '10:00'),
          ],
        }),
      ).toEqual([
        { field: 'unavailable[0].dayOfWeek', code: 'OUT_OF_RANGE' },
        { field: 'unavailable[2].startTime', code: 'INVALID_FORMAT' },
        { field: 'unavailable[3].endTime', code: 'INVALID_RANGE' },
      ]);
    });
  });

  describe('the intervals of a day', () => {
    const lunes = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        interval(1, `${String(index % 24).padStart(2, '0')}:00`, '23:59'),
      );

    it('rejects each interval over the limit of a day with INVALID_LENGTH, counted in the order of the body', () => {
      const unavailable = [...lunes(MAX_INTERVALS_PER_DAY + 2), interval(2, '09:00', '10:00')];

      expect(failures({ unavailable })).toEqual([
        { field: `unavailable[${String(MAX_INTERVALS_PER_DAY)}]`, code: 'INVALID_LENGTH' },
        { field: `unavailable[${String(MAX_INTERVALS_PER_DAY + 1)}]`, code: 'INVALID_LENGTH' },
      ]);
    });

    it('counts the days apart', () => {
      const unavailable = [...lunes(MAX_INTERVALS_PER_DAY), interval(2, '09:00', '10:00')];

      expect(parseUpdateProfessorAvailabilityRequest({ unavailable }).success).toBe(true);
    });

    it('puts the length errors after the field errors', () => {
      const unavailable = [...lunes(MAX_INTERVALS_PER_DAY + 1), interval(9, '09:00', '10:00')];

      expect(failures({ unavailable })).toEqual([
        {
          field: `unavailable[${String(MAX_INTERVALS_PER_DAY + 1)}].dayOfWeek`,
          code: 'OUT_OF_RANGE',
        },
        { field: `unavailable[${String(MAX_INTERVALS_PER_DAY)}]`, code: 'INVALID_LENGTH' },
      ]);
    });
  });
});
