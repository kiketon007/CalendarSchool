import type { RefreshToken } from '../../domain/session/refreshToken.js';
import type {
  RefreshTokenRepository,
  RefreshTokenWithOwner,
} from '../../domain/session/refreshTokenRepository.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/** Implementación con Prisma de los refresh tokens persistidos. */
export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByHash(tokenHash: string): Promise<RefreshTokenWithOwner | null> {
    return this.findOne({ tokenHash });
  }

  findById(id: string): Promise<RefreshTokenWithOwner | null> {
    return this.findOne({ id });
  }

  private async findOne(
    where: { id: string } | { tokenHash: string },
  ): Promise<RefreshTokenWithOwner | null> {
    const found = await translateDatabaseErrors(() =>
      this.prisma.refreshToken.findUnique({
        where,
        // Solo lo que necesita la sesión: nunca se lee el hash de la contraseña.
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              status: true,
              school: { select: { id: true, name: true } },
            },
          },
        },
      }),
    );
    if (!found) {
      return null;
    }

    const { user, createdAt: _createdAt, ...token } = found;
    const { school, ...owner } = user;
    return { token, user: owner, school };
  }

  async save(token: RefreshToken): Promise<void> {
    await translateDatabaseErrors(() => this.prisma.refreshToken.create({ data: token }));
  }

  async revoke(id: string, revokedAt: Date): Promise<void> {
    // El filtro por `revokedAt: null` hace la operación atómica: dos cierres simultáneos no se pisan.
    await translateDatabaseErrors(() =>
      this.prisma.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt } }),
    );
  }
}
