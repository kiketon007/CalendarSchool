import { describe, expect, it } from 'vitest';
import type { CourseWorkloadSnapshot } from '../../domain/workload/courseWorkload.js';
import { buildCourseWorkload } from './buildCourseWorkload.js';

const subject = (id: string, name: string, sessionsPerWeek: number | null) => ({
  id,
  name,
  code: null,
  color: 'blue' as const,
  status: 'ACTIVE' as const,
  sessionsPerWeek,
});

const snapshot = (overrides: Partial<CourseWorkloadSnapshot> = {}): CourseWorkloadSnapshot => ({
  course: { id: 'course-1', name: '1º Primaria' },
  calendar: { id: 'calendar-1', name: 'Jornada continua', sessionsPerDay: 6 },
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
        calendar: { id: 'calendar-1', name: 'Corta', sessionsPerDay: 1 },
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
    });
    expect(input.subjects.map((s) => s.id)).toEqual(['s2', 's1']);
  });
});
