import { describe, expect, it } from 'vitest';
import { calendarFieldCases } from '../testSupport/calendarFixtures';
import {
  groupCalendarErrors,
  hasCalendarChanges,
  validateCalendar,
  validateCalendarName,
  type DraftPeriod,
} from './calendarValidation';

const names = calendarFieldCases('calendarName');
const times = calendarFieldCases('time');
const lists = calendarFieldCases('periods');

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 50);

/** Solo los ejemplos de texto: el formulario nunca produce otro tipo de valor. */
const isTextCase = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const VALID_PERIODS: DraftPeriod[] = [
  { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
  { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
  { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
];

/** El formulario siempre da textos: una hora vacía es `''` y un periodo siempre tiene sus tres campos. */
function asDraft(raw: unknown): DraftPeriod {
  const period = raw as Record<string, unknown>;
  return {
    type: (period.type as DraftPeriod['type'] | undefined) ?? 'SESSION',
    startTime: typeof period.startTime === 'string' ? period.startTime : '',
    endTime: typeof period.endTime === 'string' ? period.endTime : '',
  };
}

describe('validateCalendarName (shared table of examples with the backend)', () => {
  it.each(names.valid.map((value) => [label(value), value]))('accepts %s', (_label, value) => {
    expect(validateCalendarName((value as string | undefined) ?? '')).toBeUndefined();
  });

  it.each(
    names.invalid
      .filter(({ value }) => isTextCase(value))
      .map(({ value, code }) => [label(value), value, code]),
  )('rejects %s with %s', (_label, value, code) => {
    expect(validateCalendarName((value as string | undefined) ?? '')).toBe(code);
  });
});

describe('validateCalendar', () => {
  it('accepts a valid calendar', () => {
    expect(validateCalendar({ name: 'Primaria', periods: VALID_PERIODS, courseIds: [] })).toEqual(
      [],
    );
  });

  describe.each(['startTime', 'endTime'] as const)('%s of a period (shared table)', (field) => {
    const draft = (value: string): DraftPeriod[] => [
      field === 'startTime'
        ? { type: 'SESSION', startTime: value, endTime: '23:59' }
        : { type: 'SESSION', startTime: '00:00', endTime: value },
    ];

    // La tabla trata `''` como un formato mal escrito; un campo de hora vacío del formulario es `''` y se
    // pide con `REQUIRED`, igual que si la hora falta.
    it.each(
      times.invalid
        .filter(({ value }) => typeof value === 'string' && value !== '')
        .map(({ value, code }) => [label(value), value as string, code]),
    )('rejects the badly written time %s with %s', (_label, value, code) => {
      expect(validateCalendar({ name: 'P', periods: draft(value), courseIds: [] })).toEqual([
        { field: `periods[0].${field}`, code },
      ]);
    });

    it('asks for an empty time with REQUIRED', () => {
      expect(validateCalendar({ name: 'P', periods: draft(''), courseIds: [] })).toEqual([
        { field: `periods[0].${field}`, code: 'REQUIRED' },
      ]);
    });
  });

  describe('periods (shared table)', () => {
    it.each(lists.valid.map((value) => [label(value), value]))(
      'accepts the valid list %s',
      (_label, value) => {
        const periods = (value as unknown[]).map(asDraft);

        expect(validateCalendar({ name: 'Primaria', periods, courseIds: [] })).toEqual([]);
      },
    );

    // Los casos que el formulario no puede producir (la lista ausente o que no es una lista, o un
    // elemento que no es un periodo) se quedan para el backend.
    it.each(
      lists.invalid
        .filter(
          ({ value }) =>
            Array.isArray(value) &&
            value.every((item) => typeof item === 'object' && item !== null),
        )
        .filter(({ issues }) => issues.every(({ code }) => code !== 'INVALID_FORMAT'))
        .map(({ value, issues }) => [label(value), value as unknown[], issues]),
    )('rejects the invalid list %s with its exact errors', (_label, value, issues) => {
      const periods = value.map(asDraft);

      expect(validateCalendar({ name: 'Primaria', periods, courseIds: [] })).toEqual(issues);
    });
  });

  it('reports every invalid field at once, in the order of the form: name first, then the periods', () => {
    const details = validateCalendar({
      name: '',
      periods: [{ type: 'SESSION', startTime: '09:00', endTime: '08:00' }],
      courseIds: [],
    });

    expect(details).toEqual([
      { field: 'name', code: 'REQUIRED' },
      { field: 'periods[0].endTime', code: 'INVALID_RANGE' },
    ]);
  });

  it('does not judge the rules of the day while a time is still empty', () => {
    const details = validateCalendar({
      name: 'Primaria',
      periods: [
        { type: 'SESSION', startTime: '09:00', endTime: '' },
        { type: 'SESSION', startTime: '08:00', endTime: '08:45' },
      ],
      courseIds: [],
    });

    expect(details).toEqual([{ field: 'periods[0].endTime', code: 'REQUIRED' }]);
  });

  it('flags a time past the end of the day, as the generator can produce', () => {
    const details = validateCalendar({
      name: 'Primaria',
      periods: [{ type: 'SESSION', startTime: '23:30', endTime: '24:15' }],
      courseIds: [],
    });

    expect(details).toEqual([{ field: 'periods[0].endTime', code: 'INVALID_FORMAT' }]);
  });
});

describe('groupCalendarErrors', () => {
  it('groups the errors by name, whole list, row and field, and courses by position', () => {
    const grouped = groupCalendarErrors([
      { field: 'name', code: 'REQUIRED' },
      { field: 'periods', code: 'INVALID_LENGTH' },
      { field: 'periods[0].type', code: 'NOT_ALLOWED' },
      { field: 'periods[2].startTime', code: 'OVERLAP' },
      { field: 'periods[2].endTime', code: 'TOO_LONG' },
      { field: 'courseIds[1]', code: 'NOT_FOUND' },
    ]);

    expect(grouped).toEqual({
      name: 'REQUIRED',
      periods: 'INVALID_LENGTH',
      rows: {
        0: { type: 'NOT_ALLOWED' },
        2: { startTime: 'OVERLAP', endTime: 'TOO_LONG' },
      },
      courses: { 1: 'NOT_FOUND' },
    });
  });

  it('keeps the first error of a field', () => {
    const grouped = groupCalendarErrors([
      { field: 'name', code: 'REQUIRED' },
      { field: 'name', code: 'INVALID_LENGTH' },
    ]);

    expect(grouped.name).toBe('REQUIRED');
  });

  it('is empty without errors and ignores a field it does not know', () => {
    expect(groupCalendarErrors([])).toEqual({ rows: {}, courses: {} });
    expect(groupCalendarErrors([{ field: 'otro', code: 'REQUIRED' }])).toEqual({
      rows: {},
      courses: {},
    });
  });

  it('puts the error of a whole period (periods[<i>]) in the row', () => {
    expect(groupCalendarErrors([{ field: 'periods[3]', code: 'INVALID_FORMAT' }]).rows).toEqual({
      3: { whole: 'INVALID_FORMAT' },
    });
  });
});

describe('hasCalendarChanges', () => {
  const initial = {
    name: 'Primaria',
    periods: VALID_PERIODS,
    courseIds: ['course-1', 'course-2'],
  };

  it('sees no change in the same calendar', () => {
    expect(hasCalendarChanges(initial, { ...initial })).toBe(false);
  });

  it('does not count outer or repeated spaces in the name, nor the composed or decomposed accent', () => {
    expect(hasCalendarChanges(initial, { ...initial, name: '  Primaria  ' })).toBe(false);
    expect(
      hasCalendarChanges(
        { ...initial, name: 'Primaria 1º   ciclo' },
        { ...initial, name: 'Primaria 1º ciclo' },
      ),
    ).toBe(false);
    expect(
      hasCalendarChanges(
        { ...initial, name: 'Educacio\u0301n' },
        { ...initial, name: 'Educaci\u00f3n' },
      ),
    ).toBe(false);
  });

  it('counts a different name, also when only the capital letters change', () => {
    expect(hasCalendarChanges(initial, { ...initial, name: 'Infantil' })).toBe(true);
    expect(hasCalendarChanges(initial, { ...initial, name: 'PRIMARIA' })).toBe(true);
  });

  it('counts a changed time, type or number of periods', () => {
    const [first, second, third] = VALID_PERIODS as [DraftPeriod, DraftPeriod, DraftPeriod];
    expect(
      hasCalendarChanges(initial, {
        ...initial,
        periods: [first, { ...second, endTime: '10:20' }, third],
      }),
    ).toBe(true);
    expect(
      hasCalendarChanges(initial, {
        ...initial,
        periods: [first, { ...second, type: 'SESSION' }, third],
      }),
    ).toBe(true);
    expect(hasCalendarChanges(initial, { ...initial, periods: [first, second] })).toBe(true);
  });

  it('compares the periods in the order of the day, so the same periods written in another order are no change', () => {
    const [first, second, third] = VALID_PERIODS as [DraftPeriod, DraftPeriod, DraftPeriod];

    expect(hasCalendarChanges(initial, { ...initial, periods: [third, first, second] })).toBe(
      false,
    );
  });

  it('counts a course added or removed, but not the same courses in another order', () => {
    expect(hasCalendarChanges(initial, { ...initial, courseIds: ['course-1'] })).toBe(true);
    expect(
      hasCalendarChanges(initial, { ...initial, courseIds: ['course-1', 'course-2', 'course-3'] }),
    ).toBe(true);
    expect(hasCalendarChanges(initial, { ...initial, courseIds: ['course-2', 'course-1'] })).toBe(
      false,
    );
  });

  it('sees no change after undoing a change', () => {
    const changed = { ...initial, name: 'Otro', courseIds: [] };

    expect(hasCalendarChanges(initial, changed)).toBe(true);
    expect(
      hasCalendarChanges(initial, { ...changed, name: 'Primaria', courseIds: initial.courseIds }),
    ).toBe(false);
  });
});
