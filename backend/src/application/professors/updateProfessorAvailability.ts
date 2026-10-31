import { normalizeUnavailability } from '../../domain/professor/availability.js';
import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorAvailabilityRepository } from '../../domain/professor/professorAvailabilityRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { ValidationError } from '../validationError.js';
import { toAvailabilityView, type ProfessorAvailabilityView } from './availabilityResponse.js';
import { parseUpdateProfessorAvailabilityRequest } from './updateProfessorAvailabilityRequest.js';

export interface UpdateProfessorAvailabilityDependencies {
  availabilityRepository: Pick<ProfessorAvailabilityRepository, 'replace'>;
  logger: ApplicationLogger;
}

export interface UpdateProfessorAvailabilityInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  /** Persona que guarda, de la identidad de la petición. */
  actorId: string;
  professorId: string;
  /** Cuerpo de la petición tal como llegó: este caso de uso lo valida. */
  body: unknown;
}

/**
 * Caso de uso: guarda el estado final de la disponibilidad de un profesor del colegio (US-PROF-AVAIL). Valida el
 * cuerpo (`ValidationError` con un `{ field, code }` por campo inválido), normaliza los tramos (ordena y une los
 * que se solapan o se tocan) y delega en el repositorio, que reemplaza todo en una transacción bajo el bloqueo del
 * profesor. Un profesor que no está en el colegio lanza `ProfessorNotFound` (`404`) y deja
 * `PROFESSOR_AVAILABILITY_UPDATE_REJECTED`. Registra `PROFESSOR_AVAILABILITY_UPDATED` solo si algo cambió, y solo
 * con identificadores y el número de tramos: ni nombres ni horas van al log.
 */
export class UpdateProfessorAvailability {
  constructor(private readonly dependencies: UpdateProfessorAvailabilityDependencies) {}

  async execute({
    schoolId,
    actorId,
    professorId,
    body,
  }: UpdateProfessorAvailabilityInput): Promise<ProfessorAvailabilityView> {
    const { availabilityRepository, logger } = this.dependencies;

    const parsed = parseUpdateProfessorAvailabilityRequest(body);
    if (!parsed.success) {
      throw new ValidationError(parsed.details);
    }

    const result = await availabilityRepository.replace(
      schoolId,
      professorId,
      normalizeUnavailability(parsed.data.intervals),
    );
    if (result.kind === 'notFound') {
      logger.warn(
        {
          event: 'PROFESSOR_AVAILABILITY_UPDATE_REJECTED',
          school_id: schoolId,
          actor_id: actorId,
          professor_id: professorId,
          reason: 'not_found',
        },
        'Disponibilidad rechazada: el profesor no existe en el colegio',
      );
      throw new ProfessorNotFound();
    }
    if (result.kind === 'replaced') {
      logger.info(
        {
          event: 'PROFESSOR_AVAILABILITY_UPDATED',
          school_id: schoolId,
          actor_id: actorId,
          professor_id: professorId,
          interval_count: result.availability.intervals.length,
        },
        'Disponibilidad del profesor actualizada',
      );
    }
    return toAvailabilityView(result.availability);
  }
}
