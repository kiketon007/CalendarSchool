// Punto de entrada del backend. No contiene lógica (está excluido de la cobertura):
// solo carga la configuración, compone las dependencias y arranca el servidor HTTP.
// Si la configuración es inválida o el puerto está ocupado, el proceso termina con error.
import { createApp } from './app.js';
import { loadConfig } from './infrastructure/config.js';
import { createLogger } from './infrastructure/logger.js';
import { createPrismaClient } from './infrastructure/prisma/createPrismaClient.js';
import { PrismaDatabasePing } from './infrastructure/prisma/prismaDatabasePing.js';

const config = loadConfig(process.env);
const logger = createLogger(config.logLevel);
const prisma = createPrismaClient({ connectionString: config.databaseUrl });

const app = createApp({ databasePing: new PrismaDatabasePing(prisma, logger), logger });

// En Express 5 el callback también recibe los errores de arranque (p. ej. puerto ocupado):
// se relanzan para que el proceso termine en vez de saltar a otro puerto o seguir sin escuchar.
app.listen(config.port, (error?: Error) => {
  if (error) {
    throw error;
  }
  logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'Backend escuchando');
});
