import { describe, expect, it } from 'vitest';
import { calendarFieldCases } from '../../../test/support/calendarFixtures.js';
import { parseCreateCalendarRequest } from './createCalendarRequest.js';

const PERIOD = { type: 'SESSION', startTime: '09:00', endTime: '09:45' };
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';

/** Cuerpo válido sobre el que cada test cambia solo lo que prueba. */
const BASE = { name: 'Primaria', periods: [PERIOD] };

const names = calendarFieldCases('calendarName');
const times = calendarFieldCases('time');
const types = calendarFieldCases('periodType');
const lists = calendarFieldCases('periods');
const courseLists = calendarFieldCases('courseIds');

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 50);

describe('parseCreateCalendarRequest', () => {
  describe('name (shared table)', () => {
    it.each(names.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        expect(parseCreateCalendarRequest({ ...BASE, name: value }).success).toBe(true);
      },
    );

    it.each(names.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        expect(parseCreateCalendarRequest({ ...BASE, name: value })).toEqual({
          success: false,
          details: [{ field: 'name', code }],
        });
      },
    );

    it('cleans the name: composed accents, no outer spaces and single inner spaces', () => {
      const result = parseCreateCalendarRequest({ ...BASE, name: '  Primaria   y   Secundaria ' });

      expect(result).toMatchObject({ success: true, data: { name: 'Primaria y Secundaria' } });
    });
  });

  describe.each(['startTime', 'endTime'])('%s of a period (shared table)', (field) => {
    // El otro extremo se pone de modo que el periodo sea válido por sí mismo.
    const withTime = (value: unknown) =>
      field === 'startTime'
        ? { type: 'SESSION', startTime: value, endTime: '23:59' }
        : { type: 'SESSION', startTime: '00:00', endTime: value };

    it.each(times.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        const result = parseCreateCalendarRequest({ ...BASE, periods: [withTime(value)] });

        // Algunos ejemplos válidos de hora no forman un periodo válido (p. ej. fin 00:00): solo
        // interesa que no se rechace el formato.
        if (!result.success) {
          expect(result.details.map(({ code }) => code)).not.toContain('INVALID_FORMAT');
          expect(result.details.map(({ code }) => code)).not.toContain('REQUIRED');
        }
      },
    );

    it.each(times.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        expect(parseCreateCalendarRequest({ ...BASE, periods: [withTime(value)] })).toEqual({
          success: false,
          details: [{ field: `periods[0].${field}`, code }],
        });
      },
    );
  });

  describe('type of a period (shared table)', () => {
    it.each(types.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        const periods = [
          PERIOD,
          { type: value, startTime: '09:45', endTime: '10:00' },
          { type: 'SESSION', startTime: '10:00', endTime: '10:45' },
        ];

        const result = parseCreateCalendarRequest({ ...BASE, periods });

        // Un `SESSION` en medio también es válido; un `BREAK` entre dos sesiones, también.
        expect(result.success).toBe(true);
      },
    );

    it.each(types.invalid.map(({ value, code }) => [label(value), value, code]))(
      'rejects the invalid example %s with %s',
      (_label, value, code) => {
        const periods = [{ type: value, startTime: '09:00', endTime: '09:45' }];

        expect(parseCreateCalendarRequest({ ...BASE, periods })).toEqual({
          success: false,
          details: [{ field: 'periods[0].type', code }],
        });
      },
    );
  });

  describe('periods (shared table)', () => {
    it.each(lists.valid.map((value) => [label(value), value]))(
      'accepts the valid list %s',
      (_label, value) => {
        const result = parseCreateCalendarRequest({ ...BASE, periods: value });

        expect(result.success).toBe(true);
      },
    );

    it.each(lists.invalid.map(({ value, issues }) => [label(value), value, issues]))(
      'rejects the invalid list %s with its exact errors',
      (_label, value, issues) => {
        expect(parseCreateCalendarRequest({ ...BASE, periods: value })).toEqual({
          success: false,
          details: issues,
        });
      },
    );

    it('rejects more than 10 periods with INVALID_LENGTH, without judging each one', () => {
      const periods = Array.from({ length: 11 }, () => PERIOD);

      expect(parseCreateCalendarRequest({ ...BASE, periods })).toEqual({
        success: false,
        details: [{ field: 'periods', code: 'INVALID_LENGTH' }],
      });
    });

    it('keeps the periods in the order received', () => {
      const result = parseCreateCalendarRequest({
        ...BASE,
        periods: [
          { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
          { type: 'BREAK', startTime: '09:45', endTime: '10:00' },
          { type: 'SESSION', startTime: '10:00', endTime: '10:45' },
        ],
      });

      expect(result).toMatchObject({
        success: true,
        data: {
          periods: [
            { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
            { type: 'BREAK', startTime: '09:45', endTime: '10:00' },
            { type: 'SESSION', startTime: '10:00', endTime: '10:45' },
          ],
        },
      });
    });
  });

  describe('courseIds (shared table)', () => {
    it.each(courseLists.valid.map((value) => [label(value), value]))(
      'accepts the valid example %s',
      (_label, value) => {
        const result = parseCreateCalendarRequest({ ...BASE, courseIds: value });

        expect(result.success).toBe(true);
      },
    );

    it.each(courseLists.invalid.map(({ value, issues }) => [label(value), value, issues]))(
      'rejects the invalid example %s with its exact errors',
      (_label, value, issues) => {
        expect(parseCreateCalendarRequest({ ...BASE, courseIds: value })).toEqual({
          success: false,
          details: issues,
        });
      },
    );

    it('rejects more than 100 courses with INVALID_LENGTH', () => {
      const courseIds = Array.from(
        { length: 101 },
        (_, index) => `0192f5a0-0000-7000-8000-${String(index).padStart(12, '0')}`,
      );

      expect(parseCreateCalendarRequest({ ...BASE, courseIds })).toEqual({
        success: false,
        details: [{ field: 'courseIds', code: 'INVALID_LENGTH' }],
      });
    });

    it('returns no courses when courseIds is absent or null, and lower-cases the ids', () => {
      expect(parseCreateCalendarRequest(BASE)).toMatchObject({ data: { courseIds: [] } });
      expect(parseCreateCalendarRequest({ ...BASE, courseIds: null })).toMatchObject({
        data: { courseIds: [] },
      });
      expect(
        parseCreateCalendarRequest({ ...BASE, courseIds: [COURSE_ID.toUpperCase()] }),
      ).toMatchObject({ data: { courseIds: [COURSE_ID] } });
    });
  });

  it('reports every invalid field at once, in the order of the body', () => {
    const result = parseCreateCalendarRequest({
      name: '',
      periods: [{ type: 'SESSION', startTime: '09:00', endTime: '08:00' }],
      courseIds: ['abc'],
    });

    expect(result).toEqual({
      success: false,
      details: [
        { field: 'name', code: 'REQUIRED' },
        { field: 'periods[0].endTime', code: 'INVALID_RANGE' },
        { field: 'courseIds[0]', code: 'INVALID_FORMAT' },
      ],
    });
  });

  it('ignores unknown properties: the school, the courses of the answer and an id', () => {
    const result = parseCreateCalendarRequest({
      ...BASE,
      schoolId: 'otro',
      id: 'x',
      courses: ['y'],
    });

    expect(result).toEqual({
      success: true,
      data: { name: 'Primaria', periods: [PERIOD], courseIds: [] },
    });
  });

  it.each([null, undefined, 'texto', 5, []])(
    'reports the required fields of a body that is %j',
    (body) => {
      expect(parseCreateCalendarRequest(body)).toEqual({
        success: false,
        details: [
          { field: 'name', code: 'REQUIRED' },
          { field: 'periods', code: 'REQUIRED' },
        ],
      });
    },
  );
});
