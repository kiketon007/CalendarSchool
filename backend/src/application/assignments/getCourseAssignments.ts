import type { CourseAssignmentsSnapshot } from '../../domain/assignment/courseAssignments.js';
import type { CourseAssignmentsRepository } from '../../domain/assignment/courseAssignmentsRepository.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import { arrangeAssignments } from './arrangeAssignments.js';

export interface GetCourseAssignmentsInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  courseId: string;
}

/**
 * Caso de uso: devuelve la matriz de profesores de un curso del colegio (US-PROF-ASSIGN): las asignaturas que se
 * imparten en él, sus clases con su tutor y lo asignado, ordenado. Un curso de otro colegio o inexistente lanza
 * `CourseNotFound`, sin distinguir el caso (`404`). Es una lectura: no registra eventos.
 */
export class GetCourseAssignments {
  constructor(
    private readonly dependencies: {
      assignmentsRepository: Pick<CourseAssignmentsRepository, 'find'>;
    },
  ) {}

  async execute({
    schoolId,
    courseId,
  }: GetCourseAssignmentsInput): Promise<CourseAssignmentsSnapshot> {
    const snapshot = await this.dependencies.assignmentsRepository.find(schoolId, courseId);
    if (snapshot === null) {
      throw new CourseNotFound();
    }
    return arrangeAssignments(snapshot);
  }
}
