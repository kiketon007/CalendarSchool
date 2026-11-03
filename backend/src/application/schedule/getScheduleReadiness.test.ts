import { describe, expect, it, vi } from 'vitest';
import type { SchedulingProblem } from '../../domain/schedule/schedulingProblem.js';
import { GetScheduleReadiness } from './getScheduleReadiness.js';

const session = (startMinute: number, endMinute: number) => ({
  kind: 'SESSION' as const,
  startMinute,
  endMinute,
});

/** Un curso con calendario, una clase y Lengua con profesora, y otro sin calendario (que bloquea). */
const problem: SchedulingProblem = {
  courses: [
    {
      id: 'c-10',
      name: '10º Primaria',
      calendar: null,
      classes: [{ id: 'k-10', name: 'A' }],
      subjects: [
        {
          subjectId: 's-1',
          subjectName: 'Lengua',
          status: 'ACTIVE',
          sessionsPerWeek: 3,
          maxPerDay: null,
          blockSize: null,
          forbiddenCells: [],
          preferredCells: [],
          teachers: [{ classId: 'k-10', professorId: 'p-1' }],
        },
      ],
    },
    {
      id: 'c-2',
      name: '2º Primaria',
      calendar: {
        id: 'cal-1',
        name: 'Primaria',
        periods: [session(540, 600), session(600, 660), session(660, 720)],
      },
      classes: [{ id: 'k-2', name: 'A' }],
      subjects: [
        {
          subjectId: 's-1',
          subjectName: 'Lengua',
          status: 'ACTIVE',
          sessionsPerWeek: 5,
          maxPerDay: null,
          blockSize: null,
          forbiddenCells: [],
          preferredCells: [],
          teachers: [{ classId: 'k-2', professorId: 'p-1' }],
        },
      ],
    },
  ],
  professors: [{ id: 'p-1', firstName: 'Ana', lastName: 'García', unavailable: [] }],
};

describe('GetScheduleReadiness', () => {
  it('reads the problem of the school of the identity and checks it', async () => {
    const read = vi.fn().mockResolvedValue(problem);
    const useCase = new GetScheduleReadiness({ schedulingProblemRepository: { read } });

    const readiness = await useCase.execute({ schoolId: 'school-1' });

    expect(read).toHaveBeenCalledExactlyOnceWith('school-1');
    expect(readiness.ready).toBe(false);
    expect(readiness.blocking).toEqual([
      { code: 'COURSE_WITHOUT_CALENDAR', course: { id: 'c-10', name: '10º Primaria' } },
    ]);
    expect(readiness.warnings).toEqual([]);
  });

  it('orders the names in the Spanish way, with numbers in natural order', async () => {
    const read = vi.fn().mockResolvedValue({
      ...problem,
      courses: problem.courses.map((course) => ({ ...course, calendar: null })),
    });
    const useCase = new GetScheduleReadiness({ schedulingProblemRepository: { read } });

    const { blocking } = await useCase.execute({ schoolId: 'school-1' });

    expect(blocking.map(({ course }) => course?.name)).toEqual(['2º Primaria', '10º Primaria']);
  });

  it('is ready for a school with nothing to fix', async () => {
    const read = vi.fn().mockResolvedValue({
      courses: [problem.courses[1]],
      professors: problem.professors,
    });
    const useCase = new GetScheduleReadiness({ schedulingProblemRepository: { read } });

    await expect(useCase.execute({ schoolId: 'school-1' })).resolves.toEqual({
      ready: true,
      blocking: [],
      warnings: [],
    });
  });

  it('lets a database failure reach the caller', async () => {
    const failure = new Error('database down');
    const useCase = new GetScheduleReadiness({
      schedulingProblemRepository: { read: vi.fn().mockRejectedValue(failure) },
    });

    await expect(useCase.execute({ schoolId: 'school-1' })).rejects.toBe(failure);
  });
});
