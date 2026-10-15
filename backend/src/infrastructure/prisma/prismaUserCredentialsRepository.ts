import type {
  UserCredentials,
  UserCredentialsRepository,
} from '../../domain/user/userCredentialsRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Implementación con Prisma de la lectura de credenciales para el inicio de sesión. */
export class PrismaUserCredentialsRepository implements UserCredentialsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<UserCredentials | null> {
    return translateDatabaseErrors(() =>
      this.prisma.user.findUnique({
        where: { email },
        // Solo lo que necesita el login: ni el colegio ni los datos personales.
        select: { id: true, passwordHash: true, status: true },
      }),
    );
  }
}
