import type { Course } from '../../domain/course/course.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import { byName, withSortedClasses } from './courseOrdering.js';

/**
 * Caso de uso: lista los cursos de un colegio con sus clases, ordenados por nombre. El colegio lo
 * toma el router de la identidad de la petición y nunca de lo que envía el cliente.
 */
export class ListCourses {
  constructor(
    private readonly dependencies: { courseRepository: Pick<CourseRepository, 'listBySchool'> },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<Course[]> {
    const courses = await this.dependencies.courseRepository.listBySchool(schoolId);
    return courses.map(withSortedClasses).sort(byName);
  }
}
