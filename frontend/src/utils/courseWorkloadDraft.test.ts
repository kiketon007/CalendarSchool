import { describe, expect, it } from 'vitest';
import preferredFixtures from '../../../test-fixtures/preferred-slots-warnings.json';
import fixtures from '../../../test-fixtures/subject-warnings.json';
import type { CourseWorkload, CourseWorkloadSubject } from '../services/courseWorkloadService';
import {
  changesOf,
  draftBalance,
  draftFrom,
  preferredSlotsWarnings,
  rowWithSessions,
  rulesLostOf,
  subjectWarnings,
} from './courseWorkloadDraft';

const subject = (
  id: string,
  sessionsPerWeek: number | null,
  rules: { maxPerDay?: number | null; blockSize?: number | null } = {},
  slots: {
    cells?: { dayOfWeek: number; sessionNumber: number }[];
    outside?: number;
    preferred?: number;
    contradiction?: number;
  } = {},
): CourseWorkloadSubject => ({
  id,
  name: id,
  code: null,
  color: 'blue',
  status: 'ACTIVE',
  sessionsPerWeek,
  maxPerDay: rules.maxPerDay ?? null,
  blockSize: rules.blockSize ?? null,
  constraintCount: Object.values(rules).filter((value) => value != null).length,
  forbiddenSlots: slots.cells ?? [],
  preferredSlotCount: slots.preferred ?? 0,
  warnings: [
    ...(slots.outside ? [{ code: 'SLOTS_OUTSIDE_CALENDAR' as const, count: slots.outside }] : []),
    ...(slots.contradiction
      ? [{ code: 'PREFERRED_SLOTS_FORBIDDEN' as const, count: slots.contradiction }]
      : []),
  ],
});

const workload = (
  subjects: CourseWorkloadSubject[],
  groups: number[] | null = [6],
): CourseWorkload => {
  const calendar =
    groups === null
      ? null
      : {
          id: 'calendar',
          name: 'Jornada',
          sessionsPerDay: groups.reduce((total, size) => total + size, 0),
          maxConsecutiveSessions: Math.max(...groups),
          sessionGroups: groups,
        };
  return {
    course: { id: 'course', name: '1º Primaria' },
    calendar,
    subjects,
    assignedSessions: subjects.reduce(
      (total, { sessionsPerWeek }) => total + (sessionsPerWeek ?? 0),
      0,
    ),
    availableSessions: calendar === null ? null : calendar.sessionsPerDay * 5,
    warnings: [],
  };
};

describe('draftFrom', () => {
  it('copies the sessions and the rules of each subject', () => {
    const loaded = workload([
      subject('english', 4, { maxPerDay: 2, blockSize: 2 }),
      subject('music', null),
    ]);

    expect(draftFrom(loaded)).toEqual({
      english: { sessionsPerWeek: 4, maxPerDay: 2, blockSize: 2 },
      music: { sessionsPerWeek: null, maxPerDay: null, blockSize: null },
    });
  });
});

describe('changesOf', () => {
  const loaded = workload([
    subject('english', 4, { maxPerDay: 2 }),
    subject('music', 2),
    subject('art', null),
  ]);

  it('has no changes when the draft is what the server returned', () => {
    expect(changesOf(loaded, draftFrom(loaded))).toEqual([]);
  });

  it('sends the whole row of a subject whose maximum changed, and only that row', () => {
    const draft = {
      ...draftFrom(loaded),
      english: { ...draftFrom(loaded).english!, maxPerDay: 3 },
    };

    expect(changesOf(loaded, draft)).toEqual([
      { subjectId: 'english', sessionsPerWeek: 4, maxPerDay: 3, blockSize: null },
    ]);
  });

  it('sends the row when only the block changed', () => {
    const draft = { ...draftFrom(loaded), music: { ...draftFrom(loaded).music!, blockSize: 2 } };

    expect(changesOf(loaded, draft)).toEqual([
      { subjectId: 'music', sessionsPerWeek: 2, maxPerDay: null, blockSize: 2 },
    ]);
  });

  it('sends a subject that stops being taught with its rules at null', () => {
    const draft = {
      ...draftFrom(loaded),
      english: rowWithSessions(draftFrom(loaded).english!, null),
    };

    expect(changesOf(loaded, draft)).toEqual([
      { subjectId: 'english', sessionsPerWeek: null, maxPerDay: null, blockSize: null },
    ]);
  });

  it('keeps the order of the server', () => {
    const draft = {
      art: { sessionsPerWeek: 1, maxPerDay: null, blockSize: null },
      music: { sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
      english: draftFrom(loaded).english!,
    };

    expect(changesOf(loaded, draft).map(({ subjectId }) => subjectId)).toEqual(['music', 'art']);
  });
});

describe('rowWithSessions', () => {
  it('keeps the rules while the subject is still taught', () => {
    expect(rowWithSessions({ sessionsPerWeek: 3, maxPerDay: 2, blockSize: 2 }, 4)).toEqual({
      sessionsPerWeek: 4,
      maxPerDay: 2,
      blockSize: 2,
    });
  });

  it('clears the rules when the subject stops being taught', () => {
    expect(rowWithSessions({ sessionsPerWeek: 3, maxPerDay: 2, blockSize: 2 }, null)).toEqual({
      sessionsPerWeek: null,
      maxPerDay: null,
      blockSize: null,
    });
  });
});

describe('rulesLostOf', () => {
  const loaded = workload([
    subject('english', 4, { maxPerDay: 2, blockSize: 2 }),
    subject('music', 2),
  ]);

  it('counts the rules of a subject that stops being taught', () => {
    const draft = {
      ...draftFrom(loaded),
      english: rowWithSessions(draftFrom(loaded).english!, null),
    };

    expect(rulesLostOf(loaded, draft, 'english')).toBe(2);
  });

  it('is zero for a subject that stays, even if its rules were cleared by hand', () => {
    const draft = {
      ...draftFrom(loaded),
      english: { sessionsPerWeek: 4, maxPerDay: null, blockSize: null },
    };

    expect(rulesLostOf(loaded, draft, 'english')).toBe(0);
  });

  it('is zero for a subject without rules and for one that was not taught', () => {
    const draft = { ...draftFrom(loaded), music: rowWithSessions(draftFrom(loaded).music!, null) };

    expect(rulesLostOf(loaded, draft, 'music')).toBe(0);
    expect(rulesLostOf(loaded, draft, 'unknown')).toBe(0);
  });
});

/** Un caso de `test-fixtures/subject-warnings.json`, la tabla que comparten el backend y el frontend. */
interface WarningCase {
  name: string;
  rules: { sessionsPerWeek: number | null; maxPerDay: number | null; blockSize: number | null };
  sessionGroups: number[] | null;
  forbiddenDays?: number[];
  forbiddenCells?: [number, number][];
  free?: [number, number][];
  outsideCount?: number;
  warnings: (string | { code: string; count: number })[];
}

/** Las celdas prohibidas de un caso, solo las que existen en su calendario. */
function cellsOf(testCase: WarningCase): { dayOfWeek: number; sessionNumber: number }[] {
  const sessions = (testCase.sessionGroups ?? []).reduce((total, size) => total + size, 0);
  const cells: { dayOfWeek: number; sessionNumber: number }[] = [];
  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek += 1) {
    for (let sessionNumber = 1; sessionNumber <= sessions; sessionNumber += 1) {
      const forbidden = testCase.free
        ? !testCase.free.some(([d, s]) => d === dayOfWeek && s === sessionNumber)
        : (testCase.forbiddenDays ?? []).includes(dayOfWeek) ||
          (testCase.forbiddenCells ?? []).some(([d, s]) => d === dayOfWeek && s === sessionNumber);
      if (forbidden) {
        cells.push({ dayOfWeek, sessionNumber });
      }
    }
  }
  return cells;
}

describe('subjectWarnings, the same rule as the backend', () => {
  it.each(fixtures.cases as WarningCase[])('$name', (testCase) => {
    const calendar =
      testCase.sessionGroups === null ? null : { sessionGroups: testCase.sessionGroups };

    expect(
      subjectWarnings(testCase.rules, calendar, {
        cells: cellsOf(testCase),
        outsideCount: testCase.outsideCount ?? 0,
      }),
    ).toEqual(
      testCase.warnings.map((warning) =>
        typeof warning === 'string' ? { code: warning } : warning,
      ),
    );
  });

  it('works without the slots argument', () => {
    expect(
      subjectWarnings(
        { sessionsPerWeek: 3, maxPerDay: null, blockSize: 3 },
        { sessionGroups: [2] },
      ),
    ).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
  });
});

describe('draftBalance', () => {
  it('adds the sessions of the draft and recalculates the warnings of the course', () => {
    const loaded = workload([subject('english', 2), subject('music', 2)], [1]);
    const draft = {
      ...draftFrom(loaded),
      english: { sessionsPerWeek: 5, maxPerDay: null, blockSize: null },
      music: { sessionsPerWeek: 1, maxPerDay: null, blockSize: null },
    };

    const balance = draftBalance(loaded, draft);

    expect(balance.assignedSessions).toBe(6);
    expect(balance.availableSessions).toBe(5);
    expect(balance.warnings).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 6, available: 5 },
    ]);
  });

  it('warns only about the missing calendar without one', () => {
    const loaded = workload([subject('english', 2)], null);

    expect(draftBalance(loaded, draftFrom(loaded)).warnings).toEqual([
      { code: 'COURSE_WITHOUT_CALENDAR' },
    ]);
  });

  it('recalculates the warnings of each subject from the draft while editing', () => {
    const loaded = workload([subject('english', 3), subject('music', 2)], [2, 1]);
    const draft = {
      ...draftFrom(loaded),
      english: { sessionsPerWeek: 3, maxPerDay: null, blockSize: 3 },
      music: { sessionsPerWeek: 2, maxPerDay: null, blockSize: 3 },
    };

    const { subjectWarnings: warnings } = draftBalance(loaded, draft);

    expect(warnings.english).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
    expect(warnings.music).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
  });

  it('recalculates the warnings with the forbidden slots of each subject, in the draft', () => {
    const wholeDays = [1, 2, 3].flatMap((dayOfWeek) =>
      [1, 2, 3, 4, 5, 6].map((sessionNumber) => ({ dayOfWeek, sessionNumber })),
    );
    const loaded = workload([
      subject('english', 3, {}, { cells: wholeDays }),
      subject('music', 2, {}, { cells: wholeDays }),
    ]);

    const { subjectWarnings: warnings } = draftBalance(loaded, draftFrom(loaded));

    expect(warnings.english).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
    expect(warnings.music).toEqual([]);
    const more = {
      ...draftFrom(loaded),
      music: { sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
    };
    expect(draftBalance(loaded, more).subjectWarnings.music).toEqual([
      { code: 'SUBJECT_DOES_NOT_FIT' },
    ]);
    const withMaximum = {
      ...draftFrom(loaded),
      music: { sessionsPerWeek: 4, maxPerDay: 2, blockSize: null },
    };
    expect(draftBalance(loaded, withMaximum).subjectWarnings.music).toEqual([]);
  });

  it('keeps the warning of cells outside the calendar that the server sent', () => {
    const loaded = workload([subject('religion', 2, {}, { outside: 5 })]);

    expect(draftBalance(loaded, draftFrom(loaded)).subjectWarnings.religion).toEqual([
      { code: 'SLOTS_OUTSIDE_CALENDAR', count: 5 },
    ]);
  });

  it('keeps the warning of preferred slots that are forbidden that the server sent', () => {
    const loaded = workload([subject('religion', 2, {}, { preferred: 3, contradiction: 2 })]);

    expect(draftBalance(loaded, draftFrom(loaded)).subjectWarnings.religion).toEqual([
      { code: 'PREFERRED_SLOTS_FORBIDDEN', count: 2 },
    ]);
  });

  it('puts the warning of preferred slots after the ones recalculated from the draft', () => {
    const loaded = workload([subject('religion', 2, {}, { outside: 1, contradiction: 2 })]);

    expect(draftBalance(loaded, draftFrom(loaded)).subjectWarnings.religion).toEqual([
      { code: 'SLOTS_OUTSIDE_CALENDAR', count: 1 },
      { code: 'PREFERRED_SLOTS_FORBIDDEN', count: 2 },
    ]);
  });

  it('drops the warning of preferred slots when the draft stops teaching the subject', () => {
    const loaded = workload([subject('religion', 2, {}, { preferred: 3, contradiction: 2 })]);
    const draft = {
      ...draftFrom(loaded),
      religion: { sessionsPerWeek: null, maxPerDay: null, blockSize: null },
    };

    expect(draftBalance(loaded, draft).subjectWarnings.religion).toEqual([]);
  });

  it('has no warnings for a subject that is not taught', () => {
    const loaded = workload([subject('art', null)]);

    expect(draftBalance(loaded, draftFrom(loaded)).subjectWarnings.art).toEqual([]);
  });
});

/** Un caso de `test-fixtures/preferred-slots-warnings.json`, la tabla que comparten el backend y el frontend. */
interface PreferredCase {
  name: string;
  preferred: [number, number][];
  forbidden: [number, number][];
  warnings: { code: string; count: number }[];
}

const toCells = (pairs: [number, number][]) =>
  pairs.map(([dayOfWeek, sessionNumber]) => ({ dayOfWeek, sessionNumber }));

describe('preferredSlotsWarnings, the same rule as the backend', () => {
  it.each(preferredFixtures.cases as PreferredCase[])('$name', (testCase) => {
    expect(
      preferredSlotsWarnings(toCells(testCase.preferred), toCells(testCase.forbidden)),
    ).toEqual(testCase.warnings);
  });
});
