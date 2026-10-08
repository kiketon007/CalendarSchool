import type { Municipality } from '../../domain/municipality/municipality.js';
import type { MunicipalityRepository } from '../../domain/municipality/municipalityRepository.js';

/** Caso de uso: lista los municipios de la Comunitat Valenciana, ordenados por nombre. */
export class ListMunicipalities {
  constructor(private readonly municipalityRepository: MunicipalityRepository) {}

  execute(): Promise<Municipality[]> {
    return this.municipalityRepository.findAll();
  }
}
