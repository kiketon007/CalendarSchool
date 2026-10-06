import type { DatabasePing } from './databasePing.js';

/**
 * Tiempo máximo de la comprobación de base de datos. Es menor que el timeout de 10 s
 * de la petición para que una base colgada produzca un 503 rápido y no un timeout genérico.
 */
export const DATABASE_PING_TIMEOUT_MS = 2000;

export type HealthReport =
  { status: 'ok'; database: 'up' } | { status: 'unavailable'; database: 'down' };

/** Caso de uso: informa del estado del servicio y de su base de datos. */
export class CheckHealth {
  constructor(
    private readonly databasePing: DatabasePing,
    private readonly timeoutMs: number = DATABASE_PING_TIMEOUT_MS,
  ) {}

  async execute(): Promise<HealthReport> {
    const isDatabaseUp = await this.pingWithTimeout();
    return isDatabaseUp
      ? { status: 'ok', database: 'up' }
      : { status: 'unavailable', database: 'down' };
  }

  private async pingWithTimeout(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.timeoutMs);
    });

    try {
      return await Promise.race([this.databasePing.ping(), timeout]);
    } catch {
      // El adaptador registra la causa; aquí solo importa que la base no está disponible.
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
