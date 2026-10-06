import type { DatabasePing } from '../../application/health/databasePing.js';
import type { Logger } from '../logger.js';
import type { PrismaClient } from './createPrismaClient.js';

/** Adaptador Prisma del puerto DatabasePing: comprueba la conexión con `SELECT 1`. */
export class PrismaDatabasePing implements DatabasePing {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: Logger,
  ) {}

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      // La causa solo va al log: la respuesta HTTP nunca expone detalles de la base de datos.
      this.logger.error({ err: error }, 'Fallo al comprobar la conexión con la base de datos');
      return false;
    }
  }
}
