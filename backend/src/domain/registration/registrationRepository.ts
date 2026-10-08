import type { School } from '../school/school.js';
import type { User } from '../user/user.js';

/** Puerto de persistencia del registro de un colegio y su administrador. */
export interface RegistrationRepository {
  /** Indica si ya existe un usuario con ese email (ya normalizado). */
  existsUserByEmail(email: string): Promise<boolean>;

  /** Indica si ya existe un colegio con ese nombre normalizado en ese municipio. */
  existsSchool(normalizedName: string, municipalityCode: string): Promise<boolean>;

  /**
   * Crea el colegio y su administrador en una única transacción: o se crean ambos o ninguno.
   * Aunque el llamante comprueba antes la existencia, la base de datos es la garantía real
   * frente a altas simultáneas.
   *
   * @throws EmailAlreadyRegistered si el email ya existe
   * @throws SchoolAlreadyRegistered si el colegio ya existe en ese municipio
   */
  createSchoolWithAdmin(school: School, admin: User): Promise<void>;
}
