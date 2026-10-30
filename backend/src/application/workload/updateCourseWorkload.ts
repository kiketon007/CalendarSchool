import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { CourseWorkload } from '../../domain/workload/courseWorkload.js';
import type { CourseWorkloadRepository } from '../../domain/workload/courseWorkloadRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import { buildCourseWorkload } from './buildCourseWorkload.js';
import { parseUpdateCourseWorkloadRequest } from './updateCourseWorkloadRequest.js';

export interface UpdateCourseWorkloadDependencies {
  courseWorkloadRepository: Pick<CourseWorkloadRepository, 'applyChanges'>;
  logger: ApplicationLogger;
}

export interface UpdateCourseWorkloadInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que cambia la carga, de la identidad de la petición. */
  actorId: string;
  courseId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: cambia la carga horaria de un curso aplicando **solo** los cambios recibidos (US19). Valida el
 * cuerpo (`ValidationError`, sin tocar el repositorio ni registrar nada) y delega en el repositorio, que lo
 * aplica todo en una transacción: un curso que no es del colegio lanza `CourseNotFound` (`404`) y una
 * asignatura que no lo es pasa a `400` con `NOT_FOUND` en `changes[<i>].subjectId`, las dos con
 * `COURSE_WORKLOAD_UPDATE_REJECTED`. Una carga que no cabe en el calendario se guarda igual: el aviso va en
 * la respuesta. Registra `COURSE_WORKLOAD_UPDATED` solo si algo cambió, con identificadores y recuentos: ni
 * los nombres ni los códigos de las asignaturas van al log. Devuelve la carga releída con su balance.
 */
export class UpdateCourseWorkload {
  constructor(private readonly dependencies: UpdateCourseWorkloadDependencies) {}

  async execute({
    schoolId,
    actorId,
    courseId,
    body,
  }: UpdateCourseWorkloadInput): Promise<CourseWorkload> {
    const { courseWorkloadRepository, logger } = this.dependencies;

    const parsed = parseUpdateCourseWorkloadRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }

    const rejected = (reason: 'not_found' | 'subject_not_found', message: string) => {
      logger.warn(
        {
          event: 'COURSE_WORKLOAD_UPDATE_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          course_id: courseId,
          reason,
        },
        message,
      );
    };

    const result = await courseWorkloadRepository.applyChanges(
      schoolId,
      courseId,
      parsed.data.changes,
    );
    if (result.kind === 'courseNotFound') {
      rejected('not_found', 'Cambio de carga rechazado: el curso no existe en el colegio');
      throw new CourseNotFound();
    }
    if (result.kind === 'subjectsNotFound') {
      rejected('subject_not_found', 'Cambio de carga rechazado: alguna asignatura no existe');
      throw new ValidationError(
        result.positions.map((position) => ({
          field: `changes[${String(position)}].subjectId`,
          code: 'NOT_FOUND' as const,
        })),
      );
    }

    if (result.added + result.removed + result.changed > 0) {
      logger.info(
        {
          event: 'COURSE_WORKLOAD_UPDATED',
          school_id: schoolId,
          actor_id: actorId,
          course_id: courseId,
          subjects_added: result.added,
          subjects_removed: result.removed,
          subjects_changed: result.changed,
        },
        'Carga horaria del curso cambiada',
      );
    }
    return buildCourseWorkload(result.workload);
  }
}
