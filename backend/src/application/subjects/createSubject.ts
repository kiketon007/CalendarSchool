import { normalizeName } from '../../domain/course/courseNames.js';
import type { Subject } from '../../domain/subject/subject.js';
import { normalizeCode } from '../../domain/subject/subjectCode.js';
import {
  SubjectAlreadyExists,
  SubjectCodeAlreadyExists,
  SubjectCoursesNotFound,
} from '../../domain/subject/subjectErrors.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { byName } from '../courses/courseOrdering.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import { ValidationError } from '../validationError.js';
import { parseCreateSubjectRequest } from './createSubjectRequest.js';

export interface CreateSubjectDependencies {
  subjectRepository: Pick<SubjectRepository, 'create'>;
  idGenerator: IdGenerator;
  logger: ApplicationLogger;
}

export interface CreateSubjectInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que crea la asignatura, de la identidad de la petición. */
  actorId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: crea una asignatura con los cursos en los que se imparte y sus sesiones semanales en el
 * colegio de la identidad (US-SUBJECT). Valida y limpia el cuerpo (`ValidationError` con un `{ field, code }`
 * por campo inválido), genera el identificador y delega en el repositorio, que lo guarda todo en una
 * transacción: lanza `SubjectAlreadyExists` si el nombre ya está en uso en el colegio,
 * `SubjectCodeAlreadyExists` si lo está el código y `SubjectCoursesNotFound` si algún curso no es del colegio
 * (que aquí pasa a `400` con `NOT_FOUND` en `courses[<i>].courseId`). El colegio no se lee nunca del cuerpo.
 * Devuelve la asignatura con sus cursos en orden natural, como el listado. Registra `SUBJECT_CREATED` o `SUBJECT_CREATION_REJECTED` solo con identificadores y recuentos: ni el
 * nombre, ni el código, ni la descripción van al log.
 */
export class CreateSubject {
  constructor(private readonly dependencies: CreateSubjectDependencies) {}

  async execute({ schoolId, actorId, body }: CreateSubjectInput): Promise<Subject> {
    const { subjectRepository, idGenerator, logger } = this.dependencies;

    const parsed = parseCreateSubjectRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { name, code, type, status, description, color, courses } = parsed.data;

    let subject: Subject;
    try {
      subject = await subjectRepository.create(schoolId, {
        id: idGenerator.generate(),
        name,
        normalizedName: normalizeName(name),
        code,
        normalizedCode: code === null ? null : normalizeCode(code),
        type,
        status,
        description,
        color,
        courses,
      });
    } catch (error) {
      if (error instanceof SubjectAlreadyExists) {
        logger.warn(
          {
            event: 'SUBJECT_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'duplicate_name',
          },
          'Asignatura rechazada: el nombre ya existe en el colegio',
        );
      }
      if (error instanceof SubjectCodeAlreadyExists) {
        logger.warn(
          {
            event: 'SUBJECT_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'duplicate_code',
          },
          'Asignatura rechazada: el código ya existe en el colegio',
        );
      }
      if (error instanceof SubjectCoursesNotFound) {
        logger.warn(
          {
            event: 'SUBJECT_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'course_not_found',
          },
          'Asignatura rechazada: algún curso no existe en el colegio',
        );
        throw new ValidationError(
          error.positions.map((position) => ({
            field: `courses[${String(position)}].courseId`,
            code: 'NOT_FOUND' as const,
          })),
        );
      }
      throw error;
    }

    logger.info(
      {
        event: 'SUBJECT_CREATED',
        school_id: schoolId,
        actor_id: actorId,
        subject_id: subject.id,
        course_count: subject.courses.length,
      },
      'Asignatura creada',
    );
    // El repositorio no ordena: la respuesta lleva los cursos en orden natural («2º» antes que «10º»), como el listado.
    return { ...subject, courses: [...subject.courses].sort(byName) };
  }
}
