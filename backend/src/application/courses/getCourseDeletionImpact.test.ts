import { describe, expect, it, vi } from 'vitest';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseImpact } from '../../domain/course/courseImpact.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { GetCourseDeletionImpact } from './getCourseDeletionImpact.js';

const impact: CourseImpact = {
  classCount: 3,
  studentCount: 0,
  constraintCount: 0,
  assignmentCount: 0,
};

function useCaseWith(found: CourseImpact | null) {
  const impactOf = vi.fn<CourseRepository['impactOf']>().mockResolvedValue(found);
  return { impactOf, useCase: new GetCourseDeletionImpact({ courseRepository: { impactOf } }) };
}

describe('GetCourseDeletionImpact', () => {
  it('asks for the impact of the course in the school of the identity', async () => {
    const { impactOf, useCase } = useCaseWith(impact);

    await useCase.execute({ schoolId: 'school-1', courseId: 'course-1' });

    expect(impactOf).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1');
  });

  it('returns the impact the repository counted', async () => {
    const { useCase } = useCaseWith(impact);

    await expect(useCase.execute({ schoolId: 'school-1', courseId: 'course-1' })).resolves.toEqual(
      impact,
    );
  });

  it('throws CourseNotFound when the course is not in the school', async () => {
    const { useCase } = useCaseWith(null);

    await expect(
      useCase.execute({ schoolId: 'school-1', courseId: 'other' }),
    ).rejects.toBeInstanceOf(CourseNotFound);
  });

  it('lets a database failure through', async () => {
    const impactOf = vi
      .fn<CourseRepository['impactOf']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    const useCase = new GetCourseDeletionImpact({ courseRepository: { impactOf } });

    await expect(
      useCase.execute({ schoolId: 'school-1', courseId: 'course-1' }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
