import { describe, expect, it } from 'vitest';
import fixtures from '../../../test-fixtures/professor-unavailability-normalization.json';
import {
  addRange,
  cellStates,
  countAvailable,
  defaultCalendar,
  fromApi,
  normalizeUnavailability,
  outsideView,
  sessionsOf,
  subtractRange,
  toApi,
  toggleCell,
  toggleLine,
  type Interval,
  type Session,
} from './professorAvailability';

const range = (dayOfWeek: number, startMinute: number, endMinute: number): Interval => ({
  dayOfWeek,
  startMinute,
  endMinute,
});

interface Case {
  name: string;
  input: [number, number, number][];
  expected: [number, number, number][];
}
const toIntervals = (rows: [number, number, number][]) =>
  rows.map(([day, start, end]) => range(day, start, end));

/** Una jornada de seis sesiones de 45 minutos desde las 09:00 con un recreo de media hora tras la 3ª. */
const PERIODS = [
  { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
  { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
  { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
  { type: 'BREAK', startTime: '11:15', endTime: '11:45' },
  { type: 'SESSION', startTime: '11:45', endTime: '12:30' },
  { type: 'SESSION', startTime: '12:30', endTime: '13:15' },
  { type: 'SESSION', startTime: '13:15', endTime: '14:00' },
] as const;

const SESSIONS: Session[] = sessionsOf(PERIODS);
const cell = (dayOfWeek: number, sessionNumber: number) => ({ dayOfWeek, sessionNumber });
const stateOf = (intervals: Interval[], dayOfWeek: number, sessionNumber: number) =>
  cellStates(intervals, SESSIONS).get(`${String(dayOfWeek)}-${String(sessionNumber)}`);

describe('normalizeUnavailability', () => {
  it.each((fixtures as unknown as { cases: Case[] }).cases.map((c) => [c.name, c] as const))(
    'shared table: %s',
    (_name, { input, expected }) => {
      expect(normalizeUnavailability(toIntervals(input))).toEqual(toIntervals(expected));
    },
  );

  it('does not modify its input', () => {
    const input = [range(2, 600, 660), range(1, 540, 600)];
    const before = structuredClone(input);

    normalizeUnavailability(input);

    expect(input).toEqual(before);
  });
});

describe('fromApi and toApi', () => {
  it('turns the hours of the API into minutes and back', () => {
    expect(fromApi([{ dayOfWeek: 3, startTime: '10:30', endTime: '11:15' }])).toEqual([
      range(3, 630, 675),
    ]);
    expect(toApi([range(3, 630, 675), range(1, 0, 1439)])).toEqual([
      { dayOfWeek: 3, startTime: '10:30', endTime: '11:15' },
      { dayOfWeek: 1, startTime: '00:00', endTime: '23:59' },
    ]);
  });
});

describe('sessionsOf', () => {
  it('numbers the sessions in order and leaves the breaks out', () => {
    expect(SESSIONS).toEqual([
      { number: 1, startMinute: 540, endMinute: 585 },
      { number: 2, startMinute: 585, endMinute: 630 },
      { number: 3, startMinute: 630, endMinute: 675 },
      { number: 4, startMinute: 705, endMinute: 750 },
      { number: 5, startMinute: 750, endMinute: 795 },
      { number: 6, startMinute: 795, endMinute: 840 },
    ]);
  });

  it('skips a period whose hours are not valid', () => {
    expect(sessionsOf([{ type: 'SESSION', startTime: '', endTime: '10:00' }])).toEqual([]);
  });
});

describe('addRange', () => {
  it('adds an interval and joins what touches it', () => {
    expect(addRange([range(1, 540, 585)], 1, 585, 630)).toEqual([range(1, 540, 630)]);
  });

  it('adds an interval of another day apart', () => {
    expect(addRange([range(1, 540, 585)], 2, 540, 585)).toEqual([
      range(1, 540, 585),
      range(2, 540, 585),
    ]);
  });

  it('swallows the intervals it covers', () => {
    expect(addRange([range(1, 560, 570), range(1, 600, 610)], 1, 540, 700)).toEqual([
      range(1, 540, 700),
    ]);
  });
});

describe('subtractRange', () => {
  it('removes an interval that is covered entirely', () => {
    expect(subtractRange([range(1, 585, 630)], 1, 585, 630)).toEqual([]);
  });

  it('splits an interval in two when the range is in the middle', () => {
    expect(subtractRange([range(1, 540, 675)], 1, 585, 630)).toEqual([
      range(1, 540, 585),
      range(1, 630, 675),
    ]);
  });

  it('trims the start or the end of an interval', () => {
    expect(subtractRange([range(1, 540, 675)], 1, 500, 600)).toEqual([range(1, 600, 675)]);
    expect(subtractRange([range(1, 540, 675)], 1, 600, 700)).toEqual([range(1, 540, 600)]);
  });

  it('does not touch an interval that only touches the range', () => {
    expect(subtractRange([range(1, 540, 585)], 1, 585, 630)).toEqual([range(1, 540, 585)]);
  });

  it('does not touch the other days', () => {
    expect(subtractRange([range(2, 540, 630)], 1, 540, 630)).toEqual([range(2, 540, 630)]);
  });

  it('only subtracts the part that is there', () => {
    expect(subtractRange([range(1, 600, 620)], 1, 540, 700)).toEqual([]);
  });
});

describe('cellStates', () => {
  it('has every cell available without intervals', () => {
    const states = cellStates([], SESSIONS);

    expect(states.size).toBe(30);
    expect([...states.values()].every(({ state }) => state === 'available')).toBe(true);
  });

  it('marks as unavailable a session that an interval covers entirely', () => {
    expect(stateOf([range(1, 540, 630)], 1, 1)?.state).toBe('unavailable');
    expect(stateOf([range(1, 540, 630)], 1, 2)?.state).toBe('unavailable');
    expect(stateOf([range(1, 540, 630)], 1, 3)?.state).toBe('available');
  });

  it('keeps the other days available', () => {
    expect(stateOf([range(1, 540, 630)], 2, 1)?.state).toBe('available');
  });

  it('marks as partial a session that an interval overlaps without covering it, with the interval in the label', () => {
    const found = stateOf([range(2, 660, 720)], 2, 3);

    expect(found?.state).toBe('partial');
    expect(found?.intervals).toEqual([range(2, 660, 720)]);
  });

  it('treats an interval that only touches a session as no overlap', () => {
    expect(stateOf([range(1, 585, 630)], 1, 1)?.state).toBe('available');
    expect(stateOf([range(1, 585, 630)], 1, 3)?.state).toBe('available');
  });

  it('marks as unavailable a session covered by a long interval that starts earlier and ends later', () => {
    expect(stateOf([range(4, 0, 1439)], 4, 5)?.state).toBe('unavailable');
  });

  it('marks as partial a session overlapped by two intervals and lists both', () => {
    const found = stateOf([range(1, 550, 560), range(1, 570, 580)], 1, 1);

    expect(found?.state).toBe('partial');
    expect(found?.intervals).toHaveLength(2);
  });

  it('is unavailable when the intervals cover the session between them (touching ones are joined first)', () => {
    expect(stateOf([range(1, 540, 560), range(1, 560, 585)], 1, 1)?.state).toBe('unavailable');
  });
});

describe('countAvailable', () => {
  it('counts only the fully available cells: a partial one does not count', () => {
    const states = cellStates([range(1, 540, 630), range(2, 660, 720)], SESSIONS);

    // El lunes de 09:00 a 10:30 cubre dos sesiones; el martes de 11:00 a 12:00 solapa dos (la 3ª y la 4ª, cada una
    // en parte, por el recreo entre ellas).
    expect(countAvailable(states)).toBe(30 - 2 - 2);
  });
});

describe('toggleCell', () => {
  it('marks an available cell as the whole session', () => {
    expect(toggleCell([], cell(1, 2), SESSIONS)).toEqual([range(1, 585, 630)]);
  });

  it('marks a partial cell as the whole session, joining what was there', () => {
    expect(toggleCell([range(2, 660, 720)], cell(2, 3), SESSIONS)).toEqual([range(2, 630, 720)]);
  });

  it('removes only the part of a session from a marked cell', () => {
    expect(toggleCell([range(1, 540, 675)], cell(1, 2), SESSIONS)).toEqual([
      range(1, 540, 585),
      range(1, 630, 675),
    ]);
  });

  it('is its own inverse on an available cell', () => {
    const marked = toggleCell([], cell(3, 4), SESSIONS);

    expect(toggleCell(marked, cell(3, 4), SESSIONS)).toEqual([]);
  });

  it('ignores a cell whose session is not in the view', () => {
    expect(toggleCell([range(1, 540, 585)], cell(1, 9), SESSIONS)).toEqual([range(1, 540, 585)]);
  });

  it('keeps what the view does not show', () => {
    const outside = range(5, 900, 960);

    expect(toggleCell([outside], cell(1, 1), SESSIONS)).toEqual([range(1, 540, 585), outside]);
  });
});

describe('toggleLine', () => {
  const monday = [1, 2, 3, 4, 5, 6].map((number) => cell(1, number));

  it('marks the whole line when some cell is missing', () => {
    // Las tres primeras sesiones se tocan y se unen; el recreo deja un hueco antes de las tres últimas.
    expect(toggleLine([range(1, 540, 585)], monday, SESSIONS)).toEqual([
      range(1, 540, 675),
      range(1, 705, 840),
    ]);
  });

  it('marks the cells of a line that has a partial cell as the whole line', () => {
    const result = toggleLine([range(1, 660, 700)], monday, SESSIONS);

    expect(countAvailable(cellStates(result, SESSIONS))).toBe(24);
  });

  it('clears the whole line when every cell was marked, leaving the other days', () => {
    const marked = toggleLine([range(2, 540, 585)], monday, SESSIONS);

    expect(toggleLine(marked, monday, SESSIONS)).toEqual([range(2, 540, 585)]);
  });

  it('works on a line of a session across the days', () => {
    const session3 = [1, 2, 3, 4, 5].map((day) => cell(day, 3));

    const marked = toggleLine([], session3, SESSIONS);

    expect(marked).toEqual([1, 2, 3, 4, 5].map((day) => range(day, 630, 675)));
    expect(toggleLine(marked, session3, SESSIONS)).toEqual([]);
  });

  it('does nothing with an empty line', () => {
    expect(toggleLine([range(1, 540, 585)], [], SESSIONS)).toEqual([range(1, 540, 585)]);
  });
});

describe('outsideView', () => {
  it('lists the intervals that overlap no session of the view', () => {
    const intervals = [range(1, 540, 585), range(2, 690, 700), range(5, 900, 960)];

    expect(outsideView(intervals, SESSIONS)).toEqual([range(2, 690, 700), range(5, 900, 960)]);
  });

  it('does not list an interval that overlaps only one session partially', () => {
    expect(outsideView([range(1, 570, 600)], SESSIONS)).toEqual([]);
  });

  it('lists everything when the view has no sessions', () => {
    expect(outsideView([range(1, 540, 585)], [])).toEqual([range(1, 540, 585)]);
  });

  it('is empty without intervals', () => {
    expect(outsideView([], SESSIONS)).toEqual([]);
  });
});

describe('defaultCalendar', () => {
  const calendar = (id: string, name: string, courses: number) => ({
    id,
    name,
    courses: Array.from({ length: courses }, (_, index) => ({ id: `${id}-${String(index)}` })),
  });

  it('picks the calendar that more courses follow', () => {
    expect(defaultCalendar([calendar('a', 'Infantil', 1), calendar('b', 'Primaria', 3)])?.id).toBe(
      'b',
    );
  });

  it('breaks a tie with the first by name, in the Spanish comparison', () => {
    expect(defaultCalendar([calendar('b', 'Primaria', 2), calendar('a', 'Ángeles', 2)])?.id).toBe(
      'a',
    );
  });

  it('picks the first by name when no course follows any', () => {
    expect(defaultCalendar([calendar('b', 'Zeta', 0), calendar('a', 'Alfa', 0)])?.id).toBe('a');
  });

  it('is undefined without calendars', () => {
    expect(defaultCalendar([])).toBeUndefined();
  });
});
