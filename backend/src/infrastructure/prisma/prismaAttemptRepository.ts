import type { AttemptRepository, AttemptResult } from '../../domain/attempts/attemptRepository.js';
import type { IdGenerator } from '../../application/registration/idGenerator.js';
import type { PrismaClient } from './createPrismaClient.js';
import { translateDatabaseErrors } from './translateDatabaseErrors.js';

/**
 * Implementación con Prisma del almacén de intentos. Una transacción por intento serializa por
 * clave con un bloqueo consultivo de PostgreSQL, de modo que peticiones simultáneas (también de
 * instancias distintas del backend) no aceptan en conjunto más intentos que el máximo, y un
 * intento rechazado no se guarda.
 */
export class PrismaAttemptRepository implements AttemptRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly idGenerator: IdGenerator,
  ) {}

  async register(
    key: string,
    now: Date,
    windowMs: number,
    maxAttempts: number,
  ): Promise<AttemptResult> {
    const windowStart = new Date(now.getTime() - windowMs);

    return translateDatabaseErrors(() =>
      this.prisma.$transaction(async (transaction): Promise<AttemptResult> => {
        // Las peticiones de la misma clave esperan su turno; las de otras claves no se bloquean.
        // El bloqueo se libera al terminar la transacción.
        // `$executeRaw` y no `$queryRaw`: la función devuelve `void`, que el adaptador no deserializa.
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;

        // Un intento sale de la ventana cuando cumple `windowMs`: en ese mismo instante ya no cuenta.
        await transaction.rateLimitAttempt.deleteMany({
          where: { key, attemptedAt: { lte: windowStart } },
        });

        const inWindow = await transaction.rateLimitAttempt.count({ where: { key } });
        if (inWindow >= maxAttempts) {
          const oldest = await transaction.rateLimitAttempt.findFirstOrThrow({
            where: { key },
            orderBy: { attemptedAt: 'asc' },
          });
          return { accepted: false, retryAt: new Date(oldest.attemptedAt.getTime() + windowMs) };
        }

        await transaction.rateLimitAttempt.create({
          data: { id: this.idGenerator.generate(), key, attemptedAt: now },
        });
        return { accepted: true };
      }),
    );
  }
}
