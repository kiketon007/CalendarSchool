import type { Professor } from '../../domain/professor/professor.js';
import { ClassAlreadyHasTutor, ClassNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import type { IdGenerator } from '../registration/idGenerator.js';
import { ValidationError } from '../validationError.js';
import { parseCreateProfessorRequest } from './createProfessorRequest.js';

export interface CreateProfessorDependencies {
  professorRepository: Pick<ProfessorRepository, 'create'>;
  idGenerator: IdGenerator;
  logger: ApplicationLogger;
}

export interface CreateProfessorInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que crea el profesor, de la identidad de la petición. */
  actorId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: crea un profesor en el colegio de la identidad y, si se indica, le asigna la clase que
 * tutoriza (US09). Valida y limpia el cuerpo (`ValidationError` con un `{ field, code }` por campo
 * inválido), genera el identificador y delega en el repositorio, que lo hace todo en una transacción.
 * Una clase que no existe en el colegio se devuelve como error del campo `classId` (`NOT_FOUND`, `400`);
 * una clase que ya tiene tutor lanza `ClassAlreadyHasTutor` (`409`), y las dos dejan
 * `PROFESSOR_CREATION_REJECTED`. El colegio y las asignaturas no se leen nunca del cuerpo. Registra
 * `PROFESSOR_CREATED` solo con identificadores, el cargo y si tiene clase: el nombre no va al log.
 */
export class CreateProfessor {
  constructor(private readonly dependencies: CreateProfessorDependencies) {}

  async execute({ schoolId, actorId, body }: CreateProfessorInput): Promise<Professor> {
    const { professorRepository, idGenerator, logger } = this.dependencies;

    const parsed = parseCreateProfessorRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }
    const { firstName, lastName, position, classId } = parsed.data;

    let professor: Professor;
    try {
      professor = await professorRepository.create(
        schoolId,
        { id: idGenerator.generate(), firstName, lastName, position },
        classId,
      );
    } catch (error) {
      if (error instanceof ClassNotFound) {
        logger.warn(
          {
            event: 'PROFESSOR_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'class_not_found',
          },
          'Profesor rechazado: la clase no existe en el colegio',
        );
        throw new ValidationError([{ field: 'classId', code: 'NOT_FOUND' }]);
      }
      if (error instanceof ClassAlreadyHasTutor) {
        logger.warn(
          {
            event: 'PROFESSOR_CREATION_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'class_has_tutor',
          },
          'Profesor rechazado: la clase ya tiene tutor',
        );
      }
      throw error;
    }

    logger.info(
      {
        event: 'PROFESSOR_CREATED',
        school_id: schoolId,
        actor_id: actorId,
        professor_id: professor.id,
        has_class: professor.tutoredClass !== null,
        position: professor.position,
      },
      'Profesor creado',
    );
    return professor;
  }
}
