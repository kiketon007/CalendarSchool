import { describe, expect, it } from 'vitest';
import type { CourseWorkloadSnapshot } from '../../domain/workload/courseWorkload.js';
import { buildCourseWorkload } from './buildCourseWorkload.js';

const subject = (
  id: string,
  name: string,
  sessionsPerWeek: number | null,
  rules: { maxPerDay?: number | null; blockSize?: number | null } = {},
  slots: { cells?: { dayOfWeek: number; sessionNumber: number }[]; outside?: number } = {},
) => ({
  id,
  name,
  code: null,
  color: 'blue' as const,
  status: 'ACTIVE' as const,
  sessionsPerWeek,
  maxPerDay: rules.maxPerDay ?? null,
  blockSize: rules.blockSize ?? null,
  constraintCount: Object.values(rules).filter((value) => value != null).length,
  forbiddenSlots: slots.cells ?? [],
  outsideSlotCount: slots.outside ?? 0,
});

const snapshot = (overrides: Partial<CourseWorkloadSnapshot> = {}): CourseWorkloadSnapshot => ({
  course: { id: 'course-1', name: '1º Primaria' },
  calendar: {
    id: 'calendar-1',
    name: 'Jornada continua',
    sessionsPerDay: 6,
    maxConsecutiveSessions: 6,
    sessionGroups: [6],
  },
  subjects: [],
  ...overrides,
});

describe('buildCourseWorkload', () => {
  it('adds the assigned sessions, ignoring the subjects that are not taught in the course', () => {
    const workload = buildCourseWorkload(
      snapshot({
        subjects: [
          subject('s1', 'Inglés', 3),
          subject('s2', 'Lengua', 5),
          subject('s3', 'Música', null),
        ],
      }),
    );

    expect(workload.assignedSessions).toBe(8);
  });

  it('has the sessions of the calendar times five days as available sessions', () => {
    const workload = buildCourseWorkload(snapshot());

    expect(workload.availableSessions).toBe(30);
    expect(workload.warnings).toEqual([]);
  });

  it('has no available sessions without a calendar and warns about it', () => {
    const workload = buildCourseWorkload(snapshot({ calendar: null }));

    expect(workload.availableSessions).toBeNull();
    expect(workload.warnings).toEqual([{ code: 'COURSE_WITHOUT_CALENDAR' }]);
  });

  it('warns when the assigned sessions exceed the available ones', () => {
    const workload = buildCourseWorkload(
      snapshot({
        calendar: {
          id: 'calendar-1',
          name: 'Corta',
          sessionsPerDay: 1,
          maxConsecutiveSessions: 1,
          sessionGroups: [1],
        },
        subjects: [subject('s1', 'Inglés', 5), subject('s2', 'Lengua', 1)],
      }),
    );

    expect(workload.warnings).toEqual([
      { code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 6, available: 5 },
    ]);
  });

  it('sorts the subjects by name with the natural comparison of Spanish', () => {
    const workload = buildCourseWorkload(
      snapshot({
        subjects: [
          subject('s1', 'Música', null),
          subject('s2', 'Álgebra 10', null),
          subject('s3', 'álgebra 2', null),
          subject('s4', 'Inglés', null),
        ],
      }),
    );

    expect(workload.subjects.map((s) => s.name)).toEqual([
      'álgebra 2',
      'Álgebra 10',
      'Inglés',
      'Música',
    ]);
  });

  it('keeps the course and the calendar as they came and does not modify the snapshot', () => {
    const input = snapshot({ subjects: [subject('s2', 'Z', 1), subject('s1', 'A', 2)] });

    const workload = buildCourseWorkload(input);

    expect(workload.course).toEqual({ id: 'course-1', name: '1º Primaria' });
    expect(workload.calendar).toEqual({
      id: 'calendar-1',
      name: 'Jornada continua',
      sessionsPerDay: 6,
      maxConsecutiveSessions: 6,
      sessionGroups: [6],
    });
    expect(input.subjects.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  describe('the warnings of each subject', () => {
    const short = {
      id: 'calendar-1',
      name: 'Corta',
      sessionsPerDay: 3,
      maxConsecutiveSessions: 2,
      sessionGroups: [2, 1],
    };

    const wholeDays = (days: number[], sessions: number) =>
      days.flatMap((dayOfWeek) =>
        Array.from({ length: sessions }, (_, index) => ({ dayOfWeek, sessionNumber: index + 1 })),
      );

    it('warns that a subject does not fit when whole days are forbidden', () => {
      const workload = buildCourseWorkload(
        snapshot({
          subjects: [
            subject('s1', 'Inglés', 3, {}, { cells: wholeDays([1, 2, 3], 6) }),
            subject('s2', 'Lengua', 3, {}, { cells: wholeDays([1, 2], 6) }),
          ],
        }),
      );

      const byId = Object.fromEntries(workload.subjects.map((s) => [s.id, s.warnings]));
      expect(byId['s1']).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
      expect(byId['s2']).toEqual([]);
    });

    it('warns about the cells that are outside the calendar, with and without calendar', () => {
      const religion = subject('s1', 'Religión', 2, {}, { outside: 5 });

      expect(buildCourseWorkload(snapshot({ subjects: [religion] })).subjects[0]!.warnings).toEqual(
        [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 5 }],
      );
      expect(
        buildCourseWorkload(snapshot({ calendar: null, subjects: [religion] })).subjects[0]!
          .warnings,
      ).toEqual([{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 5 }]);
    });

    it('shows the forbidden slots of each subject and not the count of cells outside', () => {
      const cells = [{ dayOfWeek: 1, sessionNumber: 2 }];
      const workload = buildCourseWorkload(
        snapshot({ subjects: [subject('s1', 'Religión', 2, {}, { cells, outside: 1 })] }),
      );

      expect(workload.subjects[0]!.forbiddenSlots).toEqual(cells);
      expect(workload.subjects[0]).not.toHaveProperty('outsideSlotCount');
    });

    it('leaves them empty for subjects without problems and for those not taught', () => {
      const workload = buildCourseWorkload(
        snapshot({ subjects: [subject('s1', 'Inglés', 3), subject('s2', 'Música', null)] }),
      );

      expect(workload.subjects.map((s) => s.warnings)).toEqual([[], []]);
    });

    it('warns about a block larger than the load, with and without calendar', () => {
      const plastica = subject('s1', 'Plástica', 1, { blockSize: 2 });

      expect(buildCourseWorkload(snapshot({ subjects: [plastica] })).subjects[0]!.warnings).toEqual(
        [{ code: 'BLOCK_LARGER_THAN_LOAD' }],
      );
      expect(
        buildCourseWorkload(snapshot({ calendar: null, subjects: [plastica] })).subjects[0]!
          .warnings,
      ).toEqual([{ code: 'BLOCK_LARGER_THAN_LOAD' }]);
    });

    it('warns that a subject does not fit when no stretch without a break reaches the block', () => {
      const workload = buildCourseWorkload(
        snapshot({
          calendar: short,
          subjects: [
            subject('s1', 'Educación Física', 3, { blockSize: 3 }),
            subject('s2', 'Lengua', 4, { blockSize: 2 }),
          ],
        }),
      );

      const byId = Object.fromEntries(workload.subjects.map((s) => [s.id, s.warnings]));
      expect(byId['s1']).toEqual([{ code: 'SUBJECT_DOES_NOT_FIT' }]);
      expect(byId['s2']).toEqual([]);
    });

    it('does not mix them with the warnings of the course', () => {
      const workload = buildCourseWorkload(
        snapshot({ calendar: null, subjects: [subject('s1', 'Plástica', 1, { blockSize: 2 })] }),
      );

      expect(workload.warnings).toEqual([{ code: 'COURSE_WITHOUT_CALENDAR' }]);
    });
  });
});
