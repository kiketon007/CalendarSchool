import type { Professor, ProfessorName } from '../../domain/professor/professor.js';
import { ClassNotFound, ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorRepository } from '../../domain/professor/professorRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import { withSortedSubjects } from './sortProfessorSubjects.js';
import { parseUpdateProfessorRequest } from './updateProfessorRequest.js';

export interface UpdateProfessorDependencies {
  professorRepository: Pick<ProfessorRepository, 'update'>;
  logger: ApplicationLogger;
}

export interface UpdateProfessorInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que edita, de la identidad de la petición. */
  actorId: string;
  professorId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

export interface UpdateProfessorResult {
  professor: Professor;
  /** El profesor que perdió la tutoría de la clase elegida, o `null`. */
  replacedTutor: ProfessorName | null;
}

type ChangedField = 'firstName' | 'lastName' | 'position' | 'class';

function changedFields(before: Professor, after: Professor): ChangedField[] {
  const changed: ChangedField[] = [];
  if (before.firstName !== after.firstName) {
    changed.push('firstName');
  }
  if (before.lastName !== after.lastName) {
    changed.push('lastName');
  }
  if (before.position !== after.position) {
    changed.push('position');
  }
  if ((before.tutoredClass?.id ?? null) !== (after.tutoredClass?.id ?? null)) {
    changed.push('class');
  }
  return changed;
}

/**
 * Caso de uso: guarda el estado final de un profesor del colegio (US12). Valida y limpia el cuerpo
 * (`ValidationError` con un `{ field, code }` por campo inválido) y delega en el repositorio, que lo hace
 * todo en una transacción y, si cambia la tutoría, la mueve (el profesor que la tenía la pierde y se
 * devuelve como `replacedTutor`). Un profesor que no está en el colegio lanza `ProfessorNotFound` (`404`) y
 * una clase que no existe en él se devuelve como error del campo `classId` (`NOT_FOUND`, `400`); los dos
 * dejan `PROFESSOR_UPDATE_REJECTED`. Registra `PROFESSOR_UPDATED` solo si algo cambió y solo con
 * identificadores y los campos tocados: ningún nombre va al log.
 */
export class UpdateProfessor {
  constructor(private readonly dependencies: UpdateProfessorDependencies) {}

  async execute({
    schoolId,
    actorId,
    professorId,
    body,
  }: UpdateProfessorInput): Promise<UpdateProfessorResult> {
    const { professorRepository, logger } = this.dependencies;

    const parsed = parseUpdateProfessorRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }

    let result;
    try {
      result = await professorRepository.update(schoolId, professorId, parsed.data);
    } catch (error) {
      if (error instanceof ClassNotFound) {
        logger.warn(
          {
            event: 'PROFESSOR_UPDATE_REJECTED',
            school_id: schoolId,
            actor_id: actorId,
            reason: 'class_not_found',
          },
          'Edición rechazada: la clase no existe en el colegio',
        );
        throw new ValidationError([{ field: 'classId', code: 'NOT_FOUND' }]);
      }
      throw error;
    }
    if (result === null) {
      logger.warn(
        {
          event: 'PROFESSOR_UPDATE_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          reason: 'not_found',
        },
        'Edición rechazada: el profesor no existe en el colegio',
      );
      throw new ProfessorNotFound();
    }

    const { before, after, replacedTutor } = result;
    const changed = changedFields(before, after);
    if (changed.length > 0) {
      logger.info(
        {
          event: 'PROFESSOR_UPDATED',
          school_id: schoolId,
          actor_id: actorId,
          professor_id: after.id,
          changed_fields: changed,
          tutor_changed: changed.includes('class'),
          replaced_tutor: replacedTutor !== null,
        },
        'Profesor actualizado',
      );
    }
    return { professor: withSortedSubjects(after), replacedTutor };
  }
}
