import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type { SchoolUserRepository } from '../../domain/user/schoolUserRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Solo lo que muestra la lista: nunca se lee el hash de la contraseña ni el consentimiento. */
const FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

/** Compara con la intercalación del castellano: ignora mayúsculas y ordena las vocales con tilde con su letra. */
function compare(a: string, b: string): number {
  return a.localeCompare(b, 'es');
}

/** Consulta los usuarios de un colegio con Prisma. */
export class PrismaSchoolUserRepository implements SchoolUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listBySchool(schoolId: string): Promise<SchoolUser[]> {
    const users = await translateDatabaseErrors(() =>
      this.prisma.user.findMany({
        where: { schoolId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
        select: FIELDS,
      }),
    );
    // La ordenación es del lado de la aplicación: la intercalación de PostgreSQL depende de cómo
    // se creó la base de datos, y los apellidos llevan acentos (como los nombres de los municipios).
    return users
      .map((user) => ({ ...user, status: user.status as SchoolUser['status'] }))
      .sort(
        (a, b) =>
          compare(a.lastName, b.lastName) ||
          compare(a.firstName, b.firstName) ||
          compare(a.email, b.email),
      );
  }
}
