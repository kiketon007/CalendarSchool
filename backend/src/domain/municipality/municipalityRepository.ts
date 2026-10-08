import type { Municipality } from './municipality.js';

/** Puerto de consulta de los municipios, única fuente de verdad del listado y de la validación. */
export interface MunicipalityRepository {
  /** Todos los municipios, ordenados por nombre. */
  findAll(): Promise<Municipality[]>;

  /** El municipio con ese código INE, o `null` si no existe. */
  findByCode(code: string): Promise<Municipality | null>;
}
