import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseImpact } from '../../domain/course/courseImpact.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface DeleteCourseDependencies {
  courseRepository: Pick<CourseRepository, 'delete'>;
  logger: ApplicationLogger;
}

export interface DeleteCourseInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que borra el curso, de la identidad de la petición. */
  actorId: string;
  courseId: string;
}

/**
 * Caso de uso: borra de verdad un curso del colegio con todas sus clases (US08). El repositorio lo hace
 * todo en una transacción con el curso bloqueado y devuelve lo que se borró de verdad, que es lo que se
 * registra y lo que ve la persona usuaria. Un curso de otro colegio, inexistente o ya borrado lanza
 * `CourseNotFound` (`404`) y no deja traza. Registra `COURSE_DELETED` solo con identificadores y
 * recuentos: los nombres no van al log.
 */
export class DeleteCourse {
  constructor(private readonly dependencies: DeleteCourseDependencies) {}

  async execute({ schoolId, actorId, courseId }: DeleteCourseInput): Promise<CourseImpact> {
    const { courseRepository, logger } = this.dependencies;

    const deleted = await courseRepository.delete(schoolId, courseId);
    if (deleted === null) {
      throw new CourseNotFound();
    }

    logger.info(
      {
        event: 'COURSE_DELETED',
        school_id: schoolId,
        actor_id: actorId,
        course_id: courseId,
        class_count: deleted.classCount,
        student_count: deleted.studentCount,
      },
      'Curso borrado',
    );
    return deleted;
  }
}
