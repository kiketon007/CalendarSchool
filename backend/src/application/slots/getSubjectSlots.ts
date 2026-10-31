import type { SlotRuleType } from '../../domain/slots/subjectSlots.js';
import type { SubjectSlotsRepository } from '../../domain/slots/subjectSlotsRepository.js';
import { SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import { buildSubjectSlotRule, type SubjectSlotRule } from './buildSubjectSlotRule.js';

export interface GetSubjectSlotsInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  courseId: string;
  subjectId: string;
  /** La regla que se lee: las franjas prohibidas o las preferidas. */
  type: SlotRuleType;
}

/**
 * Caso de uso: devuelve las franjas (prohibidas o preferidas, según `type`) de una asignatura en un curso con su
 * calendario y sus avisos (US19_c y US19_d). Un curso o una asignatura de otro colegio, inexistentes o que no se imparten en el curso lanzan
 * `SubjectCourseNotFound`, sin distinguir el caso (`404`). No registra nada: leer no deja evento.
 */
export class GetSubjectSlots {
  constructor(
    private readonly dependencies: {
      subjectSlotsRepository: Pick<SubjectSlotsRepository, 'find'>;
    },
  ) {}

  async execute({
    schoolId,
    courseId,
    subjectId,
    type,
  }: GetSubjectSlotsInput): Promise<SubjectSlotRule> {
    const snapshot = await this.dependencies.subjectSlotsRepository.find(
      schoolId,
      courseId,
      subjectId,
      type,
    );
    if (snapshot === null) {
      throw new SubjectCourseNotFound();
    }
    return buildSubjectSlotRule(snapshot, type);
  }
}
