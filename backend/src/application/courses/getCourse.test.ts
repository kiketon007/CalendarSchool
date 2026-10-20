import { describe, expect, it, vi } from 'vitest';
import type { Course } from '../../domain/course/course.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { GetCourse } from './getCourse.js';

const course: Course = {
  id: 'course-1',
  name: '1º Primaria',
  createdAt: new Date('2026-10-19T09:30:00Z'),
  classes: [
    { id: 'k10', name: 'B10', tutor: null },
    { id: 'k2', name: 'B2', tutor: null },
    { id: 'k1', name: 'A', tutor: null },
  ],
};

function getCourseWith(found: Course | null) {
  const findById = vi.fn<CourseRepository['findById']>().mockResolvedValue(found);
  return { findById, useCase: new GetCourse({ courseRepository: { findById } }) };
}

describe('GetCourse', () => {
  it('asks for the course in the school of the identity', async () => {
    const { findById, useCase } = getCourseWith(course);

    await useCase.execute({ schoolId: 'school-1', courseId: 'course-1' });

    expect(findById).toHaveBeenCalledExactlyOnceWith('school-1', 'course-1');
  });

  it('returns the course with its classes in natural order, without touching the original', async () => {
    const { useCase } = getCourseWith(course);

    const found = await useCase.execute({ schoolId: 'school-1', courseId: 'course-1' });

    expect(found.classes.map(({ name }) => name)).toEqual(['A', 'B2', 'B10']);
    expect(found).toMatchObject({
      id: 'course-1',
      name: '1º Primaria',
      createdAt: course.createdAt,
    });
    expect(course.classes.map(({ name }) => name)).toEqual(['B10', 'B2', 'A']);
  });

  it('throws CourseNotFound when the course is not in the school', async () => {
    const { useCase } = getCourseWith(null);

    await expect(
      useCase.execute({ schoolId: 'school-1', courseId: 'other' }),
    ).rejects.toBeInstanceOf(CourseNotFound);
  });

  it('lets a database failure through', async () => {
    const findById = vi
      .fn<CourseRepository['findById']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    const useCase = new GetCourse({ courseRepository: { findById } });

    await expect(
      useCase.execute({ schoolId: 'school-1', courseId: 'course-1' }),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);
  });
});
