// Punto de entrada del backend en AWS Lambda. No contiene lógica (está excluido de la cobertura):
// lee los secretos de SSM, carga la configuración, compone la aplicación y exporta el handler.
// Todo ello ocurre una vez por instancia, durante la inicialización (top-level await): si algo
// falla, se escribe una línea JSON `fatal` y la inicialización falla, así que la función no
// atiende ninguna petición con una configuración a medias.
import { readFileSync } from 'node:fs';
import { SSMClient } from '@aws-sdk/client-ssm';
import { composeApp } from './composeApp.js';
import { loadSsmEnvironmentOrLog } from './infrastructure/aws/ssmEnvironment.js';
import { loadConfigOrLog } from './infrastructure/config.js';
import { createLogger } from './infrastructure/logger.js';
import { createLambdaHandler } from './presentation/lambda/lambdaAdapter.js';

/** Conexiones por instancia: Lambda atiende una petición a la vez y el pooler de Supabase es escaso. */
const POOL_MAX = 2;

// El nivel de log sale de la configuración, que aún no se ha validado: los fallos de arranque se
// escriben con un logger de nivel `info` y, ya validada, se crea el definitivo.
const bootstrapLogger = createLogger('info');

const parameterPath = process.env.SSM_PARAMETER_PATH;
const secrets =
  parameterPath === undefined
    ? {}
    : await loadSsmEnvironmentOrLog(new SSMClient({}), parameterPath, bootstrapLogger);

// Un parámetro de SSM prevalece sobre una variable de entorno del mismo nombre.
const config = loadConfigOrLog({ ...process.env, ...secrets }, bootstrapLogger);

// La CA raíz de Supabase se copia junto al bundle al empaquetar (design.md D10).
const supabaseCa = readFileSync(new URL('./supabase-ca.crt', import.meta.url), 'utf8');

const { app } = composeApp(config, {
  logger: createLogger(config.logLevel),
  poolMax: POOL_MAX,
  ssl: { ca: supabaseCa },
});

export const handler = createLambdaHandler(app);
