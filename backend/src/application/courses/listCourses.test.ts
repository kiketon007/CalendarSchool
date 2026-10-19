import { describe, expect, it, vi } from 'vitest';
import type { Course } from '../../domain/course/course.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ListCourses } from './listCourses.js';

function course(id: string, name: string, classNames: string[]): Course {
  return {
    id,
    name,
    classes: classNames.map((className) => ({
      id: `${id}-${className}`,
      name: className,
      tutor: null,
    })),
  };
}

function listCoursesWith(courses: Course[]) {
  const listBySchool = vi.fn<CourseRepository['listBySchool']>().mockResolvedValue(courses);
  return { listBySchool, useCase: new ListCourses({ courseRepository: { listBySchool } }) };
}

describe('ListCourses', () => {
  it('asks for the courses of the school of the identity', async () => {
    const { listBySchool, useCase } = listCoursesWith([]);

    await useCase.execute({ schoolId: 'school-1' });

    expect(listBySchool).toHaveBeenCalledExactlyOnceWith('school-1');
  });

  it('returns an empty list when the school has no courses', async () => {
    const { useCase } = listCoursesWith([]);

    await expect(useCase.execute({ schoolId: 'school-1' })).resolves.toEqual([]);
  });

  it('orders the courses by name with numbers in natural order: 2º before 10º', async () => {
    const { useCase } = listCoursesWith([
      course('c1', '10º Curso', ['A']),
      course('c2', '2º Primaria', ['A']),
      course('c3', '1º Primaria', ['A']),
    ]);

    const courses = await useCase.execute({ schoolId: 'school-1' });

    expect(courses.map(({ name }) => name)).toEqual(['1º Primaria', '2º Primaria', '10º Curso']);
  });

  it('orders the courses with the collation of Spanish, ignoring case and accents', async () => {
    const { useCase } = listCoursesWith([
      course('c1', 'Infantil 3 años', ['A']),
      course('c2', 'ESO', ['A']),
      course('c3', 'educación especial', ['A']),
      course('c4', 'Álgebra', ['A']),
    ]);

    const courses = await useCase.execute({ schoolId: 'school-1' });

    expect(courses.map(({ name }) => name)).toEqual([
      'Álgebra',
      'educación especial',
      'ESO',
      'Infantil 3 años',
    ]);
  });

  it('orders the classes of every course the same way', async () => {
    const { useCase } = listCoursesWith([course('c1', '1º Primaria', ['C', 'a', '10', '2', 'B'])]);

    const [first] = await useCase.execute({ schoolId: 'school-1' });

    expect(first?.classes.map(({ name }) => name)).toEqual(['2', '10', 'a', 'B', 'C']);
  });

  it('keeps the id and the empty tutor of every class', async () => {
    const { useCase } = listCoursesWith([course('c1', '1º Primaria', ['B', 'A'])]);

    const [first] = await useCase.execute({ schoolId: 'school-1' });

    expect(first?.classes).toEqual([
      { id: 'c1-A', name: 'A', tutor: null },
      { id: 'c1-B', name: 'B', tutor: null },
    ]);
  });

  it('does not change the list that the repository returned', async () => {
    const original = [course('c1', '2º Primaria', ['B', 'A']), course('c2', '1º Primaria', ['A'])];
    const { useCase } = listCoursesWith(original);

    await useCase.execute({ schoolId: 'school-1' });

    expect(original.map(({ name }) => name)).toEqual(['2º Primaria', '1º Primaria']);
    expect(original[0]?.classes.map(({ name }) => name)).toEqual(['B', 'A']);
  });

  it('propagates DatabaseUnavailable', async () => {
    const listBySchool = vi
      .fn<CourseRepository['listBySchool']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));
    const useCase = new ListCourses({ courseRepository: { listBySchool } });

    await expect(useCase.execute({ schoolId: 'school-1' })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
