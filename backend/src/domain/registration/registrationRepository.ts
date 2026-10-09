import type { School } from '../school/school.js';
import type { RefreshToken } from '../session/refreshToken.js';
import type { User } from '../user/user.js';

/** Puerto de persistencia del registro de un colegio y su administrador. */
export interface RegistrationRepository {
  /** Indica si ya existe un usuario con ese email (ya normalizado). */
  existsUserByEmail(email: string): Promise<boolean>;

  /** Indica si ya existe un colegio con ese nombre normalizado en ese municipio. */
  existsSchool(normalizedName: string, municipalityCode: string): Promise<boolean>;

  /**
   * Crea el colegio, su administrador y el refresh token de su primera sesión en una única
   * transacción: o se crean los tres o ninguno, para que no quede una cuenta nueva sin sesión.
   * Aunque el llamante comprueba antes la existencia, la base de datos es la garantía real
   * frente a altas simultáneas.
   *
   * @throws EmailAlreadyRegistered si el email ya existe
   * @throws SchoolAlreadyRegistered si el colegio ya existe en ese municipio
   */
  createSchoolWithAdmin(school: School, admin: User, refreshToken: RefreshToken): Promise<void>;
}
