import { describe, expect, it } from 'vitest';
import type { UnavailableInterval } from '../professor/availability.js';
import type { ProblemPeriod } from './schedulingProblem.js';
import { unavailableCellsOf } from './unavailableCells.js';

const session = (startMinute: number, endMinute: number): ProblemPeriod => ({
  kind: 'SESSION',
  startMinute,
  endMinute,
});

/** Tres sesiones: 09:00–10:00, 10:00–11:00 y, tras un recreo de media hora, 11:30–12:15. */
const PERIODS: ProblemPeriod[] = [
  session(540, 600),
  session(600, 660),
  { kind: 'BREAK', startMinute: 660, endMinute: 690 },
  session(690, 735),
];

const interval = (
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
): UnavailableInterval => ({
  dayOfWeek,
  startMinute,
  endMinute,
});

describe('unavailableCellsOf', () => {
  it('has no cells without intervals', () => {
    expect(unavailableCellsOf(PERIODS, [])).toEqual([]);
  });

  it('marks the session that an interval covers', () => {
    expect(unavailableCellsOf(PERIODS, [interval(1, 540, 600)])).toEqual([
      { dayOfWeek: 1, sessionNumber: 1 },
    ]);
  });

  it('does not mark a session that the interval only touches', () => {
    expect(unavailableCellsOf(PERIODS, [interval(1, 600, 660)])).toEqual([
      { dayOfWeek: 1, sessionNumber: 2 },
    ]);
    expect(unavailableCellsOf(PERIODS, [interval(1, 660, 690)])).toEqual([]);
  });

  it('marks every session that an interval overlaps, even partly', () => {
    expect(unavailableCellsOf(PERIODS, [interval(1, 570, 630)])).toEqual([
      { dayOfWeek: 1, sessionNumber: 1 },
      { dayOfWeek: 1, sessionNumber: 2 },
    ]);
  });

  it('numbers the sessions without counting the breaks', () => {
    expect(unavailableCellsOf(PERIODS, [interval(2, 650, 700)])).toEqual([
      { dayOfWeek: 2, sessionNumber: 2 },
      { dayOfWeek: 2, sessionNumber: 3 },
    ]);
  });

  it('does not mark a break', () => {
    expect(unavailableCellsOf(PERIODS, [interval(3, 665, 685)])).toEqual([]);
  });

  it('keeps the days apart and orders the cells by day and then by session', () => {
    const cells = unavailableCellsOf(PERIODS, [
      interval(5, 540, 600),
      interval(2, 690, 735),
      interval(2, 540, 600),
    ]);

    expect(cells).toEqual([
      { dayOfWeek: 2, sessionNumber: 1 },
      { dayOfWeek: 2, sessionNumber: 3 },
      { dayOfWeek: 5, sessionNumber: 1 },
    ]);
  });

  it('ignores the intervals of days outside the school week', () => {
    expect(unavailableCellsOf(PERIODS, [interval(6, 540, 735), interval(0, 540, 735)])).toEqual([]);
  });

  it('has no cells for a calendar without sessions', () => {
    expect(
      unavailableCellsOf(
        [{ kind: 'BREAK', startMinute: 540, endMinute: 570 }],
        [interval(1, 500, 600)],
      ),
    ).toEqual([]);
  });

  it('does not change what it receives', () => {
    const intervals = [interval(2, 540, 600)];
    const before = structuredClone({ PERIODS, intervals });

    unavailableCellsOf(PERIODS, intervals);

    expect({ PERIODS, intervals }).toEqual(before);
  });
});
