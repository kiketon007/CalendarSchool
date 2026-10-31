import type { Professor } from '../../domain/professor/professor.js';
import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import { withSortedSubjects } from './sortProfessorSubjects.js';

export interface GetProfessorInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  professorId: string;
}

/**
 * Caso de uso: devuelve un profesor del colegio con su clase (US12). Uno de otro colegio o inexistente
 * lanza `ProfessorNotFound`, sin distinguir el caso (`404`).
 */
export class GetProfessor {
  constructor(
    private readonly dependencies: { professorRepository: Pick<ProfessorRepository, 'findById'> },
  ) {}

  async execute({ schoolId, professorId }: GetProfessorInput): Promise<Professor> {
    const professor = await this.dependencies.professorRepository.findById(schoolId, professorId);
    if (professor === null) {
      throw new ProfessorNotFound();
    }
    return withSortedSubjects(professor);
  }
}
