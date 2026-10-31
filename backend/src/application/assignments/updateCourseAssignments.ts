import type { CourseAssignmentsSnapshot } from '../../domain/assignment/courseAssignments.js';
import type { CourseAssignmentsRepository } from '../../domain/assignment/courseAssignmentsRepository.js';
import { CourseNotFound } from '../../domain/course/courseErrors.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import { arrangeAssignments } from './arrangeAssignments.js';
import { parseUpdateCourseAssignmentsRequest } from './updateCourseAssignmentsRequest.js';

export interface UpdateCourseAssignmentsDependencies {
  assignmentsRepository: Pick<CourseAssignmentsRepository, 'replace'>;
  logger: ApplicationLogger;
}

export interface UpdateCourseAssignmentsInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que guarda, de la identidad de la petición. */
  actorId: string;
  courseId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: guarda el estado final de la matriz de profesores de un curso del colegio (US-PROF-ASSIGN). Valida
 * el cuerpo (`ValidationError` con un `{ field, code }` por campo inválido) y delega en el repositorio, que lo
 * hace todo en una transacción bajo el bloqueo del curso y aplica solo las diferencias. Un curso que no está en el
 * colegio lanza `CourseNotFound` (`404`) y una referencia que no vale (asignatura no impartida en el curso, clase
 * de otro curso o profesor de otro colegio) se devuelve como `NOT_FOUND` del campo (`400`); los dos dejan
 * `COURSE_ASSIGNMENTS_UPDATE_REJECTED`. Registra `COURSE_ASSIGNMENTS_UPDATED` solo si algo cambió y solo con
 * identificadores y recuentos: ningún nombre va al log.
 */
export class UpdateCourseAssignments {
  constructor(private readonly dependencies: UpdateCourseAssignmentsDependencies) {}

  async execute({
    schoolId,
    actorId,
    courseId,
    body,
  }: UpdateCourseAssignmentsInput): Promise<CourseAssignmentsSnapshot> {
    const { assignmentsRepository, logger } = this.dependencies;

    const parsed = parseUpdateCourseAssignmentsRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }

    const result = await assignmentsRepository.replace(schoolId, courseId, parsed.data.assignments);
    if (result.kind === 'notFound') {
      logger.warn(
        {
          event: 'COURSE_ASSIGNMENTS_UPDATE_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          course_id: courseId,
          reason: 'not_found',
        },
        'Asignaciones rechazadas: el curso no existe en el colegio',
      );
      throw new CourseNotFound();
    }
    if (result.kind === 'invalidReferences') {
      logger.warn(
        {
          event: 'COURSE_ASSIGNMENTS_UPDATE_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          course_id: courseId,
          reason: 'invalid_reference',
        },
        'Asignaciones rechazadas: alguna referencia no existe en el curso o en el colegio',
      );
      throw new ValidationError(
        result.references.map(({ position, field }) => ({
          field: `assignments[${String(position)}].${field}`,
          code: 'NOT_FOUND' as const,
        })),
      );
    }
    if (result.kind === 'replaced') {
      logger.info(
        {
          event: 'COURSE_ASSIGNMENTS_UPDATED',
          school_id: schoolId,
          actor_id: actorId,
          course_id: courseId,
          added: result.added,
          removed: result.removed,
          changed: result.changed,
        },
        'Profesores del curso actualizados',
      );
    }
    return arrangeAssignments(result.assignments);
  }
}
