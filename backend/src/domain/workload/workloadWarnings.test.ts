import { describe, expect, it } from 'vitest';
import { subjectWarnings, workloadWarnings } from './workloadWarnings.js';

describe('workloadWarnings', () => {
  it('only warns that there is no calendar when the course has none, even with sessions assigned', () => {
    expect(workloadWarnings({ assignedSessions: 12, availableSessions: null })).toEqual([
      { code: 'COURSE_WITHOUT_CALENDAR' },
    ]);
  });

  it('warns that there is no calendar when nothing is assigned either', () => {
    expect(workloadWarnings({ assignedSessions: 0, availableSessions: null })).toEqual([
      { code: 'COURSE_WITHOUT_CALENDAR' },
    ]);
  });

  it('has no warnings when the load is exactly the available sessions', () => {
    expect(workloadWarnings({ assignedSessions: 30, availableSessions: 30 })).toEqual([]);
  });

  it('has no warnings when the load is below the available sessions', () => {
    expect(workloadWarnings({ assignedSessions: 8, availableSessions: 30 })).toEqual([]);
  });

  it('has no warnings when nothing is assigned to a course with a calendar', () => {
    expect(workloadWarnings({ assignedSessions: 0, availableSessions: 25 })).toEqual([]);
  });

  it('warns with both numbers when the load exceeds the available sessions by one', () => {
    expect(workloadWarnings({ assignedSessions: 31, availableSessions: 30 })).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 31, available: 30 },
    ]);
  });

  it('warns when the calendar is shorter than the load', () => {
    expect(workloadWarnings({ assignedSessions: 28, availableSessions: 25 })).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 28, available: 25 },
    ]);
  });
});

describe('subjectWarnings', () => {
  const noRules = { maxPerDay: null, blockSize: null };
  /** Jornada de `sessionsPerDay` sesiones con su tramo más largo sin recreo. */
  const day = (sessionsPerDay: number, maxConsecutiveSessions: number) => ({
    sessionsPerDay,
    maxConsecutiveSessions,
  });

  describe('BLOCK_LARGER_THAN_LOAD', () => {
    it.each([
      [1, 2],
      [2, 3],
    ])('warns with %i sessions in blocks of %i', (sessionsPerWeek, blockSize) => {
      const rules = { sessionsPerWeek, maxPerDay: null, blockSize };

      expect(subjectWarnings(rules, day(6, 6))).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
      expect(subjectWarnings(rules, null)).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
    });

    it('does not add SUBJECT_DOES_NOT_FIT even when the stretch is also shorter than the block', () => {
      expect(
        subjectWarnings({ sessionsPerWeek: 1, maxPerDay: null, blockSize: 3 }, day(2, 2)),
      ).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
    });

    it('does not warn when the load is exactly one block', () => {
      expect(
        subjectWarnings({ sessionsPerWeek: 2, maxPerDay: null, blockSize: 2 }, day(6, 6)),
      ).toEqual([]);
    });
  });

  describe('SUBJECT_DOES_NOT_FIT by a stretch that is too short', () => {
    it('warns for 3 sessions in blocks of 3 when only 2 are consecutive', () => {
      expect(
        subjectWarnings({ sessionsPerWeek: 3, maxPerDay: null, blockSize: 3 }, day(2, 2)),
      ).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
    });

    it('warns for 3 sessions in blocks of 3 when the break comes after the first session', () => {
      expect(
        subjectWarnings({ sessionsPerWeek: 3, maxPerDay: null, blockSize: 3 }, day(3, 2)),
      ).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
    });

    it('does not warn for 4 sessions in blocks of 2 when the break comes after the first session', () => {
      expect(
        subjectWarnings({ sessionsPerWeek: 4, maxPerDay: null, blockSize: 2 }, day(3, 2)),
      ).toEqual([]);
    });

    it('does not warn for 5 sessions in blocks of 2 with 2 consecutive sessions', () => {
      expect(
        subjectWarnings({ sessionsPerWeek: 5, maxPerDay: null, blockSize: 2 }, day(2, 2)),
      ).toEqual([]);
    });

    it('warns about the block, not the stretch, for 2 sessions in blocks of 3', () => {
      expect(
        subjectWarnings({ sessionsPerWeek: 2, maxPerDay: null, blockSize: 3 }, day(2, 2)),
      ).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
    });

    it('does not warn when the whole load is loose, whatever the stretch', () => {
      expect(subjectWarnings({ sessionsPerWeek: 5, ...noRules }, day(1, 1))).toEqual([]);
    });
  });

  describe('SUBJECT_DOES_NOT_FIT by the days', () => {
    it('warns for 6 loose sessions with a maximum of 1 a day', () => {
      expect(subjectWarnings({ sessionsPerWeek: 6, ...noRules }, day(6, 6))).toEqual([
        { code: 'SUBJECT_DOES_NOT_FIT' },
      ]);
    });

    it('does not warn for 6 loose sessions with a maximum of 2 a day', () => {
      expect(
        subjectWarnings({ sessionsPerWeek: 6, maxPerDay: 2, blockSize: null }, day(6, 6)),
      ).toEqual([]);
    });

    it('limits the maximum by the sessions of the day', () => {
      // 6 sueltas con máximo 5 pero solo 1 sesión al día: 6 días.
      expect(
        subjectWarnings({ sessionsPerWeek: 6, maxPerDay: 5, blockSize: null }, day(1, 1)),
      ).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
    });

    it('lets the block rule over the maximum: a block fills a day by itself', () => {
      // 4 sesiones en bloques de 2 son 2 días aunque el máximo sin regla sea 1.
      expect(
        subjectWarnings({ sessionsPerWeek: 4, maxPerDay: null, blockSize: 2 }, day(6, 6)),
      ).toEqual([]);
    });
  });

  it('has no warnings without rules for a load that fits', () => {
    expect(subjectWarnings({ sessionsPerWeek: 5, ...noRules }, day(6, 6))).toEqual([]);
  });

  it('only checks the block against the load without a calendar', () => {
    const plastica = { sessionsPerWeek: 1, maxPerDay: null, blockSize: 2 };
    const lengua = { sessionsPerWeek: 3, maxPerDay: null, blockSize: 3 };

    expect(subjectWarnings(plastica, null)).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
    expect(subjectWarnings(lengua, null)).toEqual([]);
  });

  it('has no warnings for a subject that is not taught in the course', () => {
    expect(subjectWarnings({ sessionsPerWeek: null, ...noRules }, day(6, 6))).toEqual([]);
    expect(subjectWarnings({ sessionsPerWeek: null, ...noRules }, null)).toEqual([]);
  });
});
