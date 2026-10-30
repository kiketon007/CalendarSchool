import { describe, expect, it } from 'vitest';
import type { CourseWorkload, CourseWorkloadSubject } from '../services/courseWorkloadService';
import {
  changesOf,
  draftBalance,
  draftFrom,
  rowWithSessions,
  rulesLostOf,
  subjectWarnings,
} from './courseWorkloadDraft';

const subject = (
  id: string,
  sessionsPerWeek: number | null,
  rules: { maxPerDay?: number | null; blockSize?: number | null } = {},
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
  warnings: [],
});

const workload = (
  subjects: CourseWorkloadSubject[],
  calendar: { sessionsPerDay: number; maxConsecutiveSessions: number } | null = {
    sessionsPerDay: 6,
    maxConsecutiveSessions: 6,
  },
): CourseWorkload => ({
  course: { id: 'course', name: '1º Primaria' },
  calendar: calendar === null ? null : { id: 'calendar', name: 'Jornada', ...calendar },
  subjects,
  assignedSessions: subjects.reduce(
    (total, { sessionsPerWeek }) => total + (sessionsPerWeek ?? 0),
    0,
  ),
  availableSessions: calendar === null ? null : calendar.sessionsPerDay * 5,
  warnings: [],
});

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

describe('subjectWarnings, the same rule as the backend', () => {
  const day = (sessionsPerDay: number, maxConsecutiveSessions: number) => ({
    sessionsPerDay,
    maxConsecutiveSessions,
  });
  const rules = (
    sessionsPerWeek: number | null,
    maxPerDay: number | null,
    blockSize: number | null,
  ) => ({ sessionsPerWeek, maxPerDay, blockSize });

  it.each([
    [rules(1, null, 2), day(6, 6)],
    [rules(2, null, 3), day(6, 6)],
    [rules(1, null, 3), day(2, 2)],
  ])('warns that the block is larger than the load (%j)', (row, calendar) => {
    expect(subjectWarnings(row, calendar)).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
    expect(subjectWarnings(row, null)).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
  });

  it.each([
    [rules(3, null, 3), day(2, 2)],
    [rules(3, null, 3), day(3, 2)],
    [rules(6, null, null), day(6, 6)],
    [rules(6, 5, null), day(1, 1)],
  ])('warns that it does not fit (%j)', (row, calendar) => {
    expect(subjectWarnings(row, calendar)).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
  });

  it.each([
    [rules(4, null, 2), day(3, 2)],
    [rules(5, null, 2), day(2, 2)],
    [rules(6, 2, null), day(6, 6)],
    [rules(5, null, null), day(6, 6)],
    [rules(null, null, null), day(6, 6)],
  ])('has no warnings (%j)', (row, calendar) => {
    expect(subjectWarnings(row, calendar)).toEqual([]);
  });

  it('only checks the block against the load without a calendar', () => {
    expect(subjectWarnings(rules(3, null, 3), null)).toEqual([]);
  });
});

describe('draftBalance', () => {
  it('adds the sessions of the draft and recalculates the warnings of the course', () => {
    const loaded = workload([subject('english', 2), subject('music', 2)], {
      sessionsPerDay: 1,
      maxConsecutiveSessions: 1,
    });
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
    const loaded = workload([subject('english', 3), subject('music', 2)], {
      sessionsPerDay: 3,
      maxConsecutiveSessions: 2,
    });
    const draft = {
      ...draftFrom(loaded),
      english: { sessionsPerWeek: 3, maxPerDay: null, blockSize: 3 },
      music: { sessionsPerWeek: 2, maxPerDay: null, blockSize: 3 },
    };

    const { subjectWarnings: warnings } = draftBalance(loaded, draft);

    expect(warnings.english).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
    expect(warnings.music).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
  });

  it('has no warnings for a subject that is not taught', () => {
    const loaded = workload([subject('art', null)]);

    expect(draftBalance(loaded, draftFrom(loaded)).subjectWarnings.art).toEqual([]);
  });
});
