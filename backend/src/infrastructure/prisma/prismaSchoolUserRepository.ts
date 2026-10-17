import type { SchoolUser } from '../../domain/user/schoolUser.js';
import type {
  AppliedUserChange,
  SchoolUserRepository,
} from '../../domain/user/schoolUserRepository.js';
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

/** Tipa como usuario de la lista una fila ya filtrada por estado (`ACTIVE` o `SUSPENDED`). */
function toSchoolUser<T extends { status: string }>(row: T): T & Pick<SchoolUser, 'status'> {
  return { ...row, status: row.status as SchoolUser['status'] };
}

/** Consulta y gestiona los usuarios de un colegio con Prisma. */
export class PrismaSchoolUserRepository implements SchoolUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async applyChange({
    schoolId,
    userId,
    now,
    plan,
  }: Parameters<SchoolUserRepository['applyChange']>[0]): Promise<AppliedUserChange | null> {
    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<AppliedUserChange | null> => {
        // Las operaciones del mismo colegio esperan su turno (la fila se libera al terminar la
        // transacción); las de otros colegios no se bloquean. Así dos administradores que se quitan
        // el rol a la vez ven el recuento uno después del otro. `$executeRaw` y no `$queryRaw`: no
        // se usa el resultado. El bloqueo es de fila, compatible con el pooler en modo transacción.
        await transaction.$executeRaw`SELECT 1 FROM schools WHERE id = ${schoolId}::uuid FOR UPDATE`;

        const row = await transaction.user.findFirst({
          where: { id: userId, schoolId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
          select: FIELDS,
        });
        if (row === null) {
          return null;
        }
        const previous: SchoolUser = toSchoolUser(row);

        const activeAdminCount = await transaction.user.count({
          where: { schoolId, role: 'ADMIN', status: 'ACTIVE' },
        });
        // Si la regla lanza, la excepción deshace la transacción sin haber escrito nada.
        const change = plan({
          target: { id: previous.id, role: previous.role, status: previous.status },
          activeAdminCount,
        });
        if (change === null) {
          return { previous, user: previous, change: null, revokedSessions: 0 };
        }

        const updated = await transaction.user.update({
          where: { id: userId },
          data: 'role' in change ? { role: change.role } : { status: change.status },
          select: FIELDS,
        });
        // Solo la baja revoca, en la misma transacción: no queda un usuario dado de baja con
        // sesiones vivas aunque falle la base de datos entre medias.
        const revoked =
          'revokeSessions' in change
            ? await transaction.refreshToken.updateMany({
                where: { userId, revokedAt: null },
                data: { revokedAt: now },
              })
            : { count: 0 };

        return {
          previous,
          user: toSchoolUser(updated),
          change,
          revokedSessions: revoked.count,
        };
      }),
    );
  }

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
