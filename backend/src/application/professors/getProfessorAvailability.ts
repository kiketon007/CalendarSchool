import { ProfessorNotFound } from '../../domain/professor/professorErrors.js';
import type { ProfessorAvailabilityRepository } from '../../domain/professor/professorAvailabilityRepository.js';
import { toAvailabilityView, type ProfessorAvailabilityView } from './availabilityResponse.js';

export interface GetProfessorAvailabilityInput {
  /** Colegio de la identidad de la petición, nunca del cliente. */
  schoolId: string;
  professorId: string;
}

/**
 * Caso de uso: devuelve los tramos no disponibles de un profesor del colegio (US-PROF-AVAIL), ordenados y con las
 * horas en «HH:MM». Un profesor de otro colegio o inexistente lanza `ProfessorNotFound`, sin distinguir el caso
 * (`404`). Es una lectura: no registra eventos.
 */
export class GetProfessorAvailability {
  constructor(
    private readonly dependencies: {
      availabilityRepository: Pick<ProfessorAvailabilityRepository, 'find'>;
    },
  ) {}

  async execute({
    schoolId,
    professorId,
  }: GetProfessorAvailabilityInput): Promise<ProfessorAvailabilityView> {
    const availability = await this.dependencies.availabilityRepository.find(schoolId, professorId);
    if (availability === null) {
      throw new ProfessorNotFound();
    }
    return toAvailabilityView(availability);
  }
}
