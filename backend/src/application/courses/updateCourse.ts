import type { Course } from '../../domain/course/course.js';
import {
  CourseAlreadyExists,
  CourseChanged,
  ProfessorAlreadyTutor,
  TutorNotFound,
} from '../../domain/course/courseErrors.js';
import { normalizeName } from '../../domain/course/courseNames.js';
import type { CourseRepository } from '../../domain/course/courseRepository.js';
import {
  isEmptyPlan,
  planCourseUpdate,
  type RequestedCourse,
} from '../../domain/course/courseUpdate.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import { ValidationError } from '../validationError.js';
import { withSortedClasses } from './courseOrdering.js';
import { parseUpdateCourseRequest } from './updateCourseRequest.js';

export interface UpdateCourseDependencies {
  courseRepository: Pick<CourseRepository, 'update'>;
  idGenerator: IdGenerator;
  logger: ApplicationLogger;
}

export interface UpdateCourseInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que edita el curso, de la identidad de la petición. */
  actorId: string;
  courseId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: deja un curso del colegio en el estado que pide el cuerpo (US07). Valida y limpia el cuerpo
 * (`ValidationError` con un `{ field, code }` por campo inválido), da un identificador a cada clase que
 * llega sin `id` (las que lo traen conservan el suyo) y delega en el repositorio, que lo escribe todo en una
 * transacción con el curso bloqueado y le pasa el curso guardado a la regla `planCourseUpdate`. Los errores
 * del repositorio (`CourseNotFound`, `CourseChanged`, `CourseAlreadyExists`, `ProfessorAlreadyTutor`) los traduce
 * `errorHandler`; todos salvo el primero se registran como `COURSE_UPDATE_REJECTED`, y `TutorNotFound` se
 * convierte en un `ValidationError` sobre `classes[<i>].tutorId` (US09_b). Si el estado pedido es el guardado no escribe ni
 * registra nada; si no, registra `COURSE_UPDATED` con los recuentos. Los nombres no van al log.
 */
export class UpdateCourse {
  constructor(private readonly dependencies: UpdateCourseDependencies) {}

  async execute({ schoolId, actorId, courseId, body }: UpdateCourseInput): Promise<Course> {
    const { courseRepository, idGenerator, logger } = this.dependencies;

    const parsed = parseUpdateCourseRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { name, classes } = parsed.data;

    const requested: RequestedCourse = {
      name,
      normalizedName: normalizeName(name),
      classes: classes.map((schoolClass) => ({
        id: schoolClass.id ?? idGenerator.generate(),
        existing: schoolClass.id !== undefined,
        name: schoolClass.name,
        normalizedName: normalizeName(schoolClass.name),
        ...(schoolClass.tutorId !== undefined && { tutorId: schoolClass.tutorId }),
      })),
    };

    let updated;
    try {
      updated = await courseRepository.update(schoolId, courseId, requested, (current, tutors) =>
        planCourseUpdate(current, requested, tutors),
      );
    } catch (error) {
      const reason = rejectionReason(error);
      if (reason !== undefined) {
        logger.warn(
          {
            event: 'COURSE_UPDATE_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            course_id: courseId,
            reason,
          },
          REJECTION_MESSAGES[reason],
        );
      }
      if (error instanceof TutorNotFound) {
        throw new ValidationError([
          { field: `classes[${String(error.classIndex)}].tutorId`, code: 'NOT_FOUND' },
        ]);
      }
      throw error;
    }

    const { course, plan } = updated;
    if (!isEmptyPlan(plan)) {
      logger.info(
        {
          event: 'COURSE_UPDATED',
          school_id: schoolId,
          actor_id: actorId,
          course_id: course.id,
          classes_added: plan.created.length,
          classes_removed: plan.removed.length,
          classes_renamed: plan.renamed.length,
          tutors_changed: plan.tutorsChanged.length,
        },
        'Curso editado',
      );
    }
    return withSortedClasses(course);
  }
}

type RejectionReason = 'duplicate' | 'changed' | 'professor_not_found' | 'professor_already_tutor';

const REJECTION_MESSAGES: Record<RejectionReason, string> = {
  duplicate: 'Edición rechazada: el nombre ya existe en el colegio',
  changed: 'Edición rechazada: el curso ha cambiado',
  professor_not_found: 'Edición rechazada: el profesor elegido como tutor no existe en el colegio',
  professor_already_tutor: 'Edición rechazada: el profesor ya es tutor de otra clase',
};

/** Motivo de un rechazo que se registra; el resto de errores no deja evento. */
function rejectionReason(error: unknown): RejectionReason | undefined {
  if (error instanceof CourseAlreadyExists) {
    return 'duplicate';
  }
  if (error instanceof CourseChanged) {
    return 'changed';
  }
  if (error instanceof TutorNotFound) {
    return 'professor_not_found';
  }
  return error instanceof ProfessorAlreadyTutor ? 'professor_already_tutor' : undefined;
}
