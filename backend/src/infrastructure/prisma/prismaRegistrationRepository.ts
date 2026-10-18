import {
  EmailAlreadyRegistered,
  SchoolAlreadyRegistered,
} from '../../domain/registration/registrationErrors.js';
import type { RegistrationRepository } from '../../domain/registration/registrationRepository.js';
import type { School } from '../../domain/school/school.js';
import type { RefreshToken } from '../../domain/session/refreshToken.js';
import type { User } from '../../domain/user/user.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';
import { EMAIL_UNIQUE_INDEX, violatedUniqueIndex } from './uniqueViolation.js';

/** Índice único del colegio, según lo nombra PostgreSQL. */
const SCHOOL_UNIQUE_INDEX = 'schools_normalized_name_municipality_code_key';

/** Implementación del registro con Prisma: el alta (colegio, usuario y sesión) es una única transacción. */
export class PrismaRegistrationRepository implements RegistrationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async existsUserByEmail(email: string): Promise<boolean> {
    return (await translateDatabaseErrors(() => this.prisma.user.count({ where: { email } }))) > 0;
  }

  async existsSchool(normalizedName: string, municipalityCode: string): Promise<boolean> {
    const count = await translateDatabaseErrors(() =>
      this.prisma.school.count({ where: { normalizedName, municipalityCode } }),
    );
    return count > 0;
  }

  async createSchoolWithAdmin(
    school: School,
    admin: User,
    refreshToken: RefreshToken,
  ): Promise<void> {
    // La aceptación del dominio son dos columnas: la fecha y la versión (las dos o ninguna).
    const { privacyPolicyAcceptance, ...userFields } = admin;
    try {
      await translateDatabaseErrors(() =>
        this.prisma.$transaction([
          this.prisma.school.create({ data: school }),
          this.prisma.user.create({
            data: {
              ...userFields,
              privacyPolicyAcceptedAt: privacyPolicyAcceptance?.acceptedAt ?? null,
              privacyPolicyVersion: privacyPolicyAcceptance?.version ?? null,
            },
          }),
          this.prisma.refreshToken.create({ data: refreshToken }),
        ]),
      );
    } catch (error) {
      // La comprobación previa no ve las altas simultáneas: la base de datos es la garantía.
      const index = violatedUniqueIndex(error);
      if (index === EMAIL_UNIQUE_INDEX) {
        throw new EmailAlreadyRegistered();
      }
      if (index === SCHOOL_UNIQUE_INDEX) {
        throw new SchoolAlreadyRegistered();
      }
      throw error;
    }
  }
}
