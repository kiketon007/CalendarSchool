import type { SlotRuleType } from '../../domain/slots/subjectSlots.js';
import type { SubjectSlotsRepository } from '../../domain/slots/subjectSlotsRepository.js';
import { CourseHasNoCalendar, SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import { buildSubjectSlotRule, type SubjectSlotRule } from './buildSubjectSlotRule.js';
import { parseUpdateSubjectSlotsRequest } from './updateSubjectSlotsRequest.js';

export interface UpdateSubjectSlotsDependencies {
  subjectSlotsRepository: Pick<SubjectSlotsRepository, 'replace'>;
  logger: ApplicationLogger;
}

export interface UpdateSubjectSlotsInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que guarda las franjas, de la identidad de la petición. */
  actorId: string;
  courseId: string;
  subjectId: string;
  /** La regla que se guarda: las franjas prohibidas o las preferidas. */
  type: SlotRuleType;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: deja las franjas (prohibidas o preferidas, según `type`) de una asignatura en un curso exactamente
 * como el cuerpo (US19_c y US19_d).
 * Valida el cuerpo (`ValidationError`, sin tocar el repositorio ni registrar nada) y delega en el repositorio,
 * que lo aplica todo en una transacción: una pareja que no existe lanza `SubjectCourseNotFound` (`404`), un curso
 * sin calendario `CourseHasNoCalendar` (`409`), las dos con `SUBJECT_SLOTS_UPDATE_REJECTED`, y una sesión que no
 * existe en el calendario actual pasa a `400` con `OUT_OF_RANGE` en `slots[<i>].sessionNumber`. Registra
 * `SUBJECT_SLOTS_UPDATED` solo si algo cambió, con identificadores, el tipo y el número de celdas: ni los nombres ni los
 * códigos van al log. Devuelve las franjas releídas con sus avisos.
 */
export class UpdateSubjectSlots {
  constructor(private readonly dependencies: UpdateSubjectSlotsDependencies) {}

  async execute({
    schoolId,
    actorId,
    courseId,
    subjectId,
    type,
    body,
  }: UpdateSubjectSlotsInput): Promise<SubjectSlotRule> {
    const { subjectSlotsRepository, logger } = this.dependencies;

    const parsed = parseUpdateSubjectSlotsRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }

    const context = {
      school_id: schoolId,
      actor_id: actorId,
      course_id: courseId,
      subject_id: subjectId,
      type,
    };
    const rejected = (reason: 'not_found' | 'no_calendar', message: string) => {
      logger.warn({ event: 'SUBJECT_SLOTS_UPDATE_REJECTED', ...context, reason }, message);
    };

    const result = await subjectSlotsRepository.replace(
      schoolId,
      courseId,
      subjectId,
      type,
      parsed.data.slots,
    );
    if (result.kind === 'notFound') {
      rejected('not_found', 'Franjas rechazadas: la asignatura no se imparte en el curso');
      throw new SubjectCourseNotFound();
    }
    if (result.kind === 'noCalendar') {
      rejected('no_calendar', 'Franjas rechazadas: el curso no tiene calendario');
      throw new CourseHasNoCalendar();
    }
    if (result.kind === 'outOfCalendar') {
      throw new ValidationError(
        result.positions.map((position) => ({
          field: `slots[${String(position)}].sessionNumber`,
          code: 'OUT_OF_RANGE' as const,
        })),
      );
    }

    if (result.changed) {
      logger.info(
        {
          event: 'SUBJECT_SLOTS_UPDATED',
          ...context,
          type,
          slot_count: result.slotCount,
        },
        type === 'FORBIDDEN_SLOTS'
          ? 'Franjas prohibidas cambiadas'
          : 'Franjas preferidas cambiadas',
      );
    }
    return buildSubjectSlotRule(result.snapshot, type);
  }
}
