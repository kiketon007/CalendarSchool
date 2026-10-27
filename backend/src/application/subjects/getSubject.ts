import type { Subject } from '../../domain/subject/subject.js';
import { SubjectNotFound } from '../../domain/subject/subjectErrors.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import { byName } from '../courses/courseOrdering.js';

export interface GetSubjectInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  subjectId: string;
}

/**
 * Caso de uso: devuelve una asignatura del colegio con los cursos en los que se imparte en orden natural
 * (US-SUBJECT_b). Una de otro colegio o inexistente lanza `SubjectNotFound`, sin distinguir el caso (`404`).
 * No registra nada: leer no deja evento.
 */
export class GetSubject {
  constructor(
    private readonly dependencies: { subjectRepository: Pick<SubjectRepository, 'findById'> },
  ) {}

  async execute({ schoolId, subjectId }: GetSubjectInput): Promise<Subject> {
    const subject = await this.dependencies.subjectRepository.findById(schoolId, subjectId);
    if (subject === null) {
      throw new SubjectNotFound();
    }
    return { ...subject, courses: [...subject.courses].sort(byName) };
  }
}
