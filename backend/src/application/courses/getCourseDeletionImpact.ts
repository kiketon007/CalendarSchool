import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseImpact } from '../../domain/course/courseImpact.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';

export interface GetCourseDeletionImpactInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  courseId: string;
}

/**
 * Caso de uso: dice qué se perdería al borrar un curso del colegio (sus clases y los alumnos asignados),
 * sin cambiar nada. Lo usa el diálogo de confirmación del borrado. Un curso de otro colegio o inexistente
 * lanza `CourseNotFound`, sin distinguir el caso (`404`).
 */
export class GetCourseDeletionImpact {
  constructor(
    private readonly dependencies: { courseRepository: Pick<CourseRepository, 'impactOf'> },
  ) {}

  async execute({ schoolId, courseId }: GetCourseDeletionImpactInput): Promise<CourseImpact> {
    const impact = await this.dependencies.courseRepository.impactOf(schoolId, courseId);
    if (impact === null) {
      throw new CourseNotFound();
    }
    return impact;
  }
}
