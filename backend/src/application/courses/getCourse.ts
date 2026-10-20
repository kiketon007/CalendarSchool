import type { Course } from '../../domain/course/course.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import { withSortedClasses } from './courseOrdering.js';

export interface GetCourseInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  courseId: string;
}

/**
 * Caso de uso: devuelve un curso del colegio con sus clases ordenadas por nombre. Un curso de otro colegio
 * o inexistente lanza `CourseNotFound`, sin distinguir el caso (`404`).
 */
export class GetCourse {
  constructor(
    private readonly dependencies: { courseRepository: Pick<CourseRepository, 'findById'> },
  ) {}

  async execute({ schoolId, courseId }: GetCourseInput): Promise<Course> {
    const course = await this.dependencies.courseRepository.findById(schoolId, courseId);
    if (course === null) {
      throw new CourseNotFound();
    }
    return withSortedClasses(course);
  }
}
