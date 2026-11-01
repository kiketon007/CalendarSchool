import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseImpact } from '../../domain/course/courseImpact.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { DeleteCourse } from './deleteCourse.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1', courseId: 'course-1' } as const;
const deleted: CourseImpact = {
  classCount: 3,
  studentCount: 0,
  constraintCount: 4,
  assignmentCount: 6,
};

describe('DeleteCourse', () => {
  let remove: Mock<CourseRepository['delete']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: DeleteCourse;

  beforeEach(() => {
    remove = vi.fn<CourseRepository['delete']>().mockResolvedValue(deleted);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new DeleteCourse({ courseRepository: { delete: remove }, logger: { info, warn } });
  });

  it('deletes the course in the school of the identity', async () => {
    await useCase.execute(identity);

    expect(remove).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1');
  });

  it('returns what the repository really deleted', async () => {
    remove.mockResolvedValue({
      classCount: 2,
      studentCount: 5,
      constraintCount: 1,
      assignmentCount: 2,
    });

    await expect(useCase.execute(identity)).resolves.toEqual({
      classCount: 2,
      studentCount: 5,
      constraintCount: 1,
      assignmentCount: 2,
    });
  });

  it('logs COURSE_DELETED with the identifiers and the counts, never the names', async () => {
    await useCase.execute(identity);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'COURSE_DELETED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        course_id: 'course-1',
        class_count: 3,
        student_count: 0,
        constraint_count: 4,
        assignment_count: 6,
      },
      expect.any(String),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws CourseNotFound without logging when the course is not in the school', async () => {
    remove.mockResolvedValue(null);

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(CourseNotFound);

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('lets a database failure through without logging', async () => {
    remove.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(DatabaseUnavailable);

    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
