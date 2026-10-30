import type { SubjectSlotsRepository } from '../../domain/slots/subjectSlotsRepository.js';
import { SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import { buildSubjectSlotRule, type SubjectSlotRule } from './buildSubjectSlotRule.js';

export interface GetForbiddenSlotsInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  courseId: string;
  subjectId: string;
}

/**
 * Caso de uso: devuelve las franjas prohibidas de una asignatura en un curso con su calendario y sus avisos
 * (US19_c). Un curso o una asignatura de otro colegio, inexistentes o que no se imparten en el curso lanzan
 * `SubjectCourseNotFound`, sin distinguir el caso (`404`). No registra nada: leer no deja evento.
 */
export class GetForbiddenSlots {
  constructor(
    private readonly dependencies: {
      subjectSlotsRepository: Pick<SubjectSlotsRepository, 'find'>;
    },
  ) {}

  async execute({
    schoolId,
    courseId,
    subjectId,
  }: GetForbiddenSlotsInput): Promise<SubjectSlotRule> {
    const snapshot = await this.dependencies.subjectSlotsRepository.find(
      schoolId,
      courseId,
      subjectId,
    );
    if (snapshot === null) {
      throw new SubjectCourseNotFound();
    }
    return buildSubjectSlotRule(snapshot);
  }
}
