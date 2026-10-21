import type { DeletedProfessor } from '../../domain/professor/professor.js';
import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';

export interface DeleteProfessorDependencies {
  professorRepository: Pick<ProfessorRepository, 'delete'>;
  logger: ApplicationLogger;
}

export interface DeleteProfessorInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que borra al profesor, de la identidad de la petición. */
  actorId: string;
  professorId: string;
}

/**
 * Caso de uso: borra de verdad a un profesor del colegio (US13). El repositorio lo hace todo en una
 * transacción con el profesor bloqueado y devuelve la clase que tutorizaba, que queda sin tutor: es lo
 * que se registra y lo que ve la persona usuaria. Un profesor de otro colegio, inexistente o ya borrado
 * lanza `ProfessorNotFound` (`404`) y no deja traza. Registra `PROFESSOR_DELETED` solo con
 * identificadores y si liberó una clase: los nombres no van al log.
 */
export class DeleteProfessor {
  constructor(private readonly dependencies: DeleteProfessorDependencies) {}

  async execute({
    schoolId,
    actorId,
    professorId,
  }: DeleteProfessorInput): Promise<DeletedProfessor> {
    const { professorRepository, logger } = this.dependencies;

    const deleted = await professorRepository.delete(schoolId, professorId);
    if (deleted === null) {
      throw new ProfessorNotFound();
    }

    logger.info(
      {
        event: 'PROFESSOR_DELETED',
        school_id: schoolId,
        actor_id: actorId,
        professor_id: professorId,
        freed_class: deleted.freedClass !== null,
      },
      'Profesor borrado',
    );
    return deleted;
  }
}
