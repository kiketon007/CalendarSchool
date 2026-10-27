import { normalizeName } from '../../domain/course/courseNames.js';
import type { Subject } from '../../domain/subject/subject.js';
import { subjectChanges } from '../../domain/subject/subjectChanges.js';
import { normalizeCode } from '../../domain/subject/subjectCode.js';
import {
  SubjectAlreadyExists,
  SubjectCodeAlreadyExists,
  SubjectCoursesNotFound,
  SubjectNotFound,
} from '../../domain/subject/subjectErrors.js';
import type { SubjectRepository } from '../../domain/subject/subjectRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { byName } from '../courses/courseOrdering.js';
import { ValidationError } from '../validationError.js';
import { parseUpdateSubjectRequest } from './updateSubjectRequest.js';

export interface UpdateSubjectDependencies {
  subjectRepository: Pick<SubjectRepository, 'update'>;
  logger: ApplicationLogger;
}

export interface UpdateSubjectInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que edita, de la identidad de la petición. */
  actorId: string;
  subjectId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

type RejectionReason = 'not_found' | 'duplicate_name' | 'duplicate_code' | 'course_not_found';

/**
 * Caso de uso: edita una asignatura del colegio guardando su estado final (US-SUBJECT_b). Valida y limpia el
 * cuerpo con las mismas reglas que el alta (`ValidationError`, sin tocar el repositorio ni registrar nada) y
 * delega en el repositorio, que lo guarda todo en una transacción: lanza `SubjectAlreadyExists` o
 * `SubjectCodeAlreadyExists` si otra asignatura del colegio usa el nombre o el código y `SubjectCoursesNotFound`
 * si algún curso no es del colegio (que aquí pasa a `400` con `NOT_FOUND` en `courses[<i>].courseId`); si la
 * asignatura no es del colegio devuelve `null` y se lanza `SubjectNotFound`. Gana el último guardado. Registra
 * `SUBJECT_UPDATED` (también sin cambios, con `changed_fields` vacío) o `SUBJECT_UPDATE_REJECTED` solo con
 * identificadores, nombres de campo y recuentos: ni el nombre, ni el código, ni la descripción van al log.
 */
export class UpdateSubject {
  constructor(private readonly dependencies: UpdateSubjectDependencies) {}

  async execute({ schoolId, actorId, subjectId, body }: UpdateSubjectInput): Promise<Subject> {
    const { subjectRepository, logger } = this.dependencies;

    const parsed = parseUpdateSubjectRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { name, code, type, status, description, color, courses } = parsed.data;

    const rejected = (reason: RejectionReason, message: string) => {
      logger.warn(
        {
          event: 'SUBJECT_UPDATE_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          subject_id: subjectId,
          reason,
        },
        message,
      );
    };

    let result;
    try {
      result = await subjectRepository.update(schoolId, subjectId, {
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
        rejected('duplicate_name', 'Edición rechazada: el nombre ya existe en el colegio');
      }
      if (error instanceof SubjectCodeAlreadyExists) {
        rejected('duplicate_code', 'Edición rechazada: el código ya existe en el colegio');
      }
      if (error instanceof SubjectCoursesNotFound) {
        rejected('course_not_found', 'Edición rechazada: algún curso no existe en el colegio');
        throw new ValidationError(
          error.positions.map((position) => ({
            field: `courses[${String(position)}].courseId`,
            code: 'NOT_FOUND' as const,
          })),
        );
      }
      throw error;
    }

    if (result === null) {
      rejected('not_found', 'Edición rechazada: la asignatura no existe en el colegio');
      throw new SubjectNotFound();
    }

    const { before, after } = result;
    const { changedFields, coursesAdded, coursesRemoved, coursesChanged } = subjectChanges(
      before,
      after,
    );
    logger.info(
      {
        event: 'SUBJECT_UPDATED',
        school_id: schoolId,
        actor_id: actorId,
        subject_id: after.id,
        changed_fields: changedFields,
        courses_added: coursesAdded,
        courses_removed: coursesRemoved,
        courses_changed: coursesChanged,
      },
      'Asignatura editada',
    );
    // El repositorio no ordena: la respuesta lleva los cursos en orden natural, como el listado.
    return { ...after, courses: [...after.courses].sort(byName) };
  }
}
