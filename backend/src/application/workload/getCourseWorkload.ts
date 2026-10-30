import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseWorkload } from '../../domain/workload/courseWorkload.js';
import type { CourseWorkloadRepository } from '../../domain/workload/courseWorkloadRepository.js';
import { buildCourseWorkload } from './buildCourseWorkload.js';

export interface GetCourseWorkloadInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  courseId: string;
}

/**
 * Caso de uso: devuelve la carga horaria de un curso del colegio con su balance frente al calendario (US19).
 * Un curso de otro colegio o inexistente lanza `CourseNotFound`, sin distinguir el caso (`404`). No registra
 * nada: leer no deja evento.
 */
export class GetCourseWorkload {
  constructor(
    private readonly dependencies: {
      courseWorkloadRepository: Pick<CourseWorkloadRepository, 'findByCourse'>;
    },
  ) {}

  async execute({ schoolId, courseId }: GetCourseWorkloadInput): Promise<CourseWorkload> {
    const snapshot = await this.dependencies.courseWorkloadRepository.findByCourse(
      schoolId,
      courseId,
    );
    if (snapshot === null) {
      throw new CourseNotFound();
    }
    return buildCourseWorkload(snapshot);
  }
}
