// Punto de entrada del backend. No contiene lógica (está excluido de la cobertura):
// solo carga la configuración, compone la aplicación y arranca el servidor HTTP.
// Si la configuración es inválida o el puerto está ocupado, el proceso termina con error.
import { composeApp } from './composeApp.js';
import { ConfigError, loadConfigOrLog, type AppConfig } from './infrastructure/config.js';
import { createLogger } from './infrastructure/logger.js';

// El nivel de log sale de la configuración, que aún no se ha validado: el error de configuración
// se escribe con un logger de nivel `info` y, ya validada, se crea el logger definitivo.
let config: AppConfig;
try {
  config = loadConfigOrLog(process.env, createLogger('info'));
} catch (error) {
  if (error instanceof ConfigError) {
    // Ya registrado como una línea JSON `fatal`: se sale sin la traza de Node.
    process.exit(1);
  }
  throw error;
}

const logger = createLogger(config.logLevel);
const { app } = composeApp(config, { logger });

// En Express 5 el callback también recibe los errores de arranque (p. ej. puerto ocupado):
// se relanzan para que el proceso termine en vez de saltar a otro puerto o seguir sin escuchar.
app.listen(config.port, (error?: Error) => {
  if (error) {
    throw error;
  }
  logger.info({ port: config.port, nodeEnv: config.nodeEnv }, 'Backend escuchando');
});
