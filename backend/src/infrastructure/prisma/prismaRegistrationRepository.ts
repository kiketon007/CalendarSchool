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

/** Índices únicos de la migración, según los nombra PostgreSQL. */
const EMAIL_UNIQUE_INDEX = 'users_email_key';
const SCHOOL_UNIQUE_INDEX = 'schools_normalized_name_municipality_code_key';

/**
 * Nombre del índice único violado, si el error es una violación de unicidad de Prisma (P2002).
 * Con el adaptador de PostgreSQL el índice llega en `meta.driverAdapterError.cause.constraint`,
 * no en `meta.target`.
 */
function violatedUniqueIndex(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'P2002') {
    return undefined;
  }
  const meta = 'meta' in error ? (error.meta as Record<string, unknown> | undefined) : undefined;
  const adapterError = meta?.driverAdapterError as { cause?: { constraint?: { index?: unknown } } };
  const index = adapterError?.cause?.constraint?.index;
  return typeof index === 'string' ? index : undefined;
}

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
    try {
      await translateDatabaseErrors(() =>
        this.prisma.$transaction([
          this.prisma.school.create({ data: school }),
          this.prisma.user.create({ data: admin }),
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
