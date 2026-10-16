import type { SchoolUser } from './schoolUser.js';

/**
 * Puerto de lectura de los usuarios de un colegio. El colegio es siempre un parámetro obligatorio,
 * tomado de la identidad de la petición: ningún método lee datos de un colegio sin indicarlo.
 */
export interface SchoolUserRepository {
  /**
   * Usuarios `ACTIVE` y `SUSPENDED` del colegio (los `DELETED` no se devuelven), ordenados por
   * apellidos, nombre y email con la intercalación del castellano.
   *
   * @throws DatabaseUnavailable si la base de datos no responde
   */
  listBySchool(schoolId: string): Promise<SchoolUser[]>;
}
