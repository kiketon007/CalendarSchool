import { describe, expect, it, vi } from 'vitest';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseWorkloadSnapshot } from '../../domain/workload/courseWorkload.js';
import type { CourseWorkloadRepository } from '../../domain/workload/courseWorkloadRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { GetCourseWorkload } from './getCourseWorkload.js';

const snapshot: CourseWorkloadSnapshot = {
  course: { id: 'course-1', name: '1º Primaria' },
  calendar: {
    id: 'calendar-1',
    name: 'Jornada continua',
    sessionsPerDay: 6,
    maxConsecutiveSessions: 6,
    sessionGroups: [6],
  },
  subjects: [
    {
      id: 's2',
      name: 'Música',
      code: null,
      color: 'pink',
      status: 'ACTIVE',
      sessionsPerWeek: null,
      maxPerDay: null,
      blockSize: null,
      constraintCount: 0,
      forbiddenSlots: [],
      outsideSlotCount: 0,
    },
    {
      id: 's1',
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
      sessionsPerWeek: 3,
      maxPerDay: null,
      blockSize: null,
      constraintCount: 0,
      forbiddenSlots: [],
      outsideSlotCount: 0,
    },
  ],
};

describe('GetCourseWorkload', () => {
  it('asks for the course of the school of the identity and builds the balance', async () => {
    const findByCourse = vi
      .fn<CourseWorkloadRepository['findByCourse']>()
      .mockResolvedValue(snapshot);
    const useCase = new GetCourseWorkload({ courseWorkloadRepository: { findByCourse } });

    const workload = await useCase.execute({ schoolId: 'school-1', courseId: 'course-1' });

    expect(findByCourse).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1');
    expect(workload.subjects.map((subject) => subject.name)).toEqual(['Inglés', 'Música']);
    expect(workload.assignedSessions).toBe(3);
    expect(workload.availableSessions).toBe(30);
    expect(workload.warnings).toEqual([]);
  });

  it('carries the warning of a course without a calendar', async () => {
    const useCase = new GetCourseWorkload({
      courseWorkloadRepository: {
        findByCourse: vi
          .fn<CourseWorkloadRepository['findByCourse']>()
          .mockResolvedValue({ ...snapshot, calendar: null }),
      },
    });

    const workload = await useCase.execute({ schoolId: 'school-1', courseId: 'course-1' });

    expect(workload.availableSessions).toBeNull();
    expect(workload.warnings).toEqual([{ code: 'COURSE_WITHOUT_CALENDAR' }]);
  });

  it('throws CourseNotFound when the course is not in the school', async () => {
    const useCase = new GetCourseWorkload({
      courseWorkloadRepository: {
        findByCourse: vi.fn<CourseWorkloadRepository['findByCourse']>().mockResolvedValue(null),
      },
    });

    await expect(
      useCase.execute({ schoolId: 'school-1', courseId: 'other' }),
    ).rejects.toBeInstanceOf(CourseNotFound);
  });

  it('lets a database failure through', async () => {
    const useCase = new GetCourseWorkload({
      courseWorkloadRepository: {
        findByCourse: vi
          .fn<CourseWorkloadRepository['findByCourse']>()
          .mockRejectedValue(new DatabaseUnavailable(new Error('connection refused'))),
      },
    });

    await expect(
      useCase.execute({ schoolId: 'school-1', courseId: 'course-1' }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
