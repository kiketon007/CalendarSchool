import { describe, expect, it } from 'vitest';
import { calendarFieldCases } from '../../../test/support/calendarFixtures.js';
import { parseCreateCalendarRequest } from './createCalendarRequest.js';
import { parseUpdateCalendarRequest } from './updateCalendarRequest.js';

const PERIOD = { type: 'SESSION', startTime: '09:00', endTime: '09:45' };
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const BASE = { name: 'Primaria', periods: [PERIOD] };

const names = calendarFieldCases('calendarName');
const lists = calendarFieldCases('periods');
const courseLists = calendarFieldCases('courseIds');

const label = (value: unknown) => (JSON.stringify(value) ?? 'undefined').slice(0, 50);

describe('parseUpdateCalendarRequest', () => {
  it('reads the final state: the cleaned name, the periods and the courses', () => {
    expect(
      parseUpdateCalendarRequest({
        name: '  Primaria  1º ',
        periods: [PERIOD],
        courseIds: [COURSE_ID],
      }),
    ).toEqual({
      success: true,
      data: { name: 'Primaria 1º', periods: [PERIOD], courseIds: [COURSE_ID] },
    });
  });

  it('takes a missing courseIds as an empty list: the calendar is left without courses', () => {
    expect(parseUpdateCalendarRequest(BASE)).toEqual({
      success: true,
      data: { name: 'Primaria', periods: [PERIOD], courseIds: [] },
    });
  });

  it('ignores unknown properties such as the school and the id', () => {
    expect(parseUpdateCalendarRequest({ ...BASE, schoolId: 'otro', id: 'x' })).toEqual({
      success: true,
      data: { name: 'Primaria', periods: [PERIOD], courseIds: [] },
    });
  });

  it.each(names.invalid.map(({ value }) => [label(value), value]))(
    'gives the same name error as the creation for %s',
    (_label, value) => {
      const body = { ...BASE, name: value };
      expect(parseUpdateCalendarRequest(body)).toEqual(parseCreateCalendarRequest(body));
    },
  );

  it.each(lists.invalid.map(({ value }) => [label(value), value]))(
    'gives the same list errors, in the same order, as the creation for %s',
    (_label, value) => {
      const body = { ...BASE, periods: value };
      expect(parseUpdateCalendarRequest(body)).toEqual(parseCreateCalendarRequest(body));
    },
  );

  it.each(courseLists.invalid.map(({ value }) => [label(value), value]))(
    'gives the same course errors as the creation for %s',
    (_label, value) => {
      const body = { ...BASE, courseIds: value };
      expect(parseUpdateCalendarRequest(body)).toEqual(parseCreateCalendarRequest(body));
    },
  );

  it.each([null, undefined, 'texto', 5, []])(
    'reports the required fields of a body that is %j',
    (body) => {
      expect(parseUpdateCalendarRequest(body)).toEqual({
        success: false,
        details: [
          { field: 'name', code: 'REQUIRED' },
          { field: 'periods', code: 'REQUIRED' },
        ],
      });
    },
  );
});
