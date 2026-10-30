import type { SubjectSlotsRepository } from '../../domain/slots/subjectSlotsRepository.js';
import { CourseHasNoCalendar, SubjectCourseNotFound } from '../../domain/slots/slotsErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import { buildSubjectSlotRule, type SubjectSlotRule } from './buildSubjectSlotRule.js';
import { parseUpdateSubjectSlotsRequest } from './updateSubjectSlotsRequest.js';

export interface UpdateForbiddenSlotsDependencies {
  subjectSlotsRepository: Pick<SubjectSlotsRepository, 'replace'>;
  logger: ApplicationLogger;
}

export interface UpdateForbiddenSlotsInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que guarda las franjas, de la identidad de la petición. */
  actorId: string;
  courseId: string;
  subjectId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: deja las franjas prohibidas de una asignatura en un curso exactamente como el cuerpo (US19_c).
 * Valida el cuerpo (`ValidationError`, sin tocar el repositorio ni registrar nada) y delega en el repositorio,
 * que lo aplica todo en una transacción: una pareja que no existe lanza `SubjectCourseNotFound` (`404`), un curso
 * sin calendario `CourseHasNoCalendar` (`409`), las dos con `SUBJECT_SLOTS_UPDATE_REJECTED`, y una sesión que no
 * existe en el calendario actual pasa a `400` con `OUT_OF_RANGE` en `slots[<i>].sessionNumber`. Registra
 * `SUBJECT_SLOTS_UPDATED` solo si algo cambió, con identificadores y el número de celdas: ni los nombres ni los
 * códigos van al log. Devuelve las franjas releídas con sus avisos.
 */
export class UpdateForbiddenSlots {
  constructor(private readonly dependencies: UpdateForbiddenSlotsDependencies) {}

  async execute({
    schoolId,
    actorId,
    courseId,
    subjectId,
    body,
  }: UpdateForbiddenSlotsInput): Promise<SubjectSlotRule> {
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
    };
    const rejected = (reason: 'not_found' | 'no_calendar', message: string) => {
      logger.warn({ event: 'SUBJECT_SLOTS_UPDATE_REJECTED', ...context, reason }, message);
    };

    const result = await subjectSlotsRepository.replace(
      schoolId,
      courseId,
      subjectId,
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
          type: 'FORBIDDEN_SLOTS',
          slot_count: result.slotCount,
        },
        'Franjas prohibidas cambiadas',
      );
    }
    return buildSubjectSlotRule(result.snapshot);
  }
}
