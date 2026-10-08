import { pino, type DestinationStream, type Logger } from 'pino';
import type { LogLevel } from './config.js';

export type { Logger };

/**
 * Campos que nunca se escriben en los logs (defensa en profundidad: el código no debería pasar
 * credenciales al logger). Cada comodín de pino cubre un nivel de anidamiento.
 */
const REDACTED_PATHS = [
  'password',
  '*.password',
  '*.*.password',
  'passwordHash',
  '*.passwordHash',
  '*.*.passwordHash',
];

/**
 * Crea el logger centralizado de la aplicación: líneas JSON estructuradas con pino.
 * El nivel se muestra como texto (`"level": "info"`) para facilitar la lectura de los logs.
 * `destination` permite capturar la salida en los tests; por defecto se escribe en stdout.
 */
export function createLogger(level: LogLevel, destination?: DestinationStream): Logger {
  const options = {
    level,
    redact: REDACTED_PATHS,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  };

  return destination ? pino(options, destination) : pino(options);
}
