import { SubjectNotFound } from '../../domain/subject/subjectErrors.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface DeleteSubjectDependencies {
  subjectRepository: Pick<SubjectRepository, 'delete'>;
  logger: ApplicationLogger;
}

export interface DeleteSubjectInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que borra la asignatura, de la identidad de la petición. */
  actorId: string;
  subjectId: string;
}

/**
 * Caso de uso: borra de verdad una asignatura del colegio (US-SUBJECT_c). El repositorio lo hace en una
 * transacción con la fila de la asignatura bloqueada (sus filas de `subject_courses` caen en cascada) y dice
 * si la borró; una asignatura de otro colegio, inexistente o ya borrada lanza `SubjectNotFound` (`404`) y no
 * deja traza. No lee ni recibe los datos de la asignatura, así que no puede registrarlos: `SUBJECT_DELETED`
 * lleva solo identificadores (nunca el nombre, el código, la descripción ni los cursos).
 */
export class DeleteSubject {
  constructor(private readonly dependencies: DeleteSubjectDependencies) {}

  async execute({ schoolId, actorId, subjectId }: DeleteSubjectInput): Promise<{ id: string }> {
    const { subjectRepository, logger } = this.dependencies;

    const deleted = await subjectRepository.delete(schoolId, subjectId);
    if (deleted === null) {
      throw new SubjectNotFound();
    }

    logger.info(
      {
        event: 'SUBJECT_DELETED',
        school_id: schoolId,
        actor_id: actorId,
        subject_id: subjectId,
        assignment_count: deleted.assignmentCount,
      },
      'Asignatura borrada',
    );
    return { id: subjectId };
  }
}
