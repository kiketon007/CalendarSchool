// Punto de entrada de la Lambda del worker que ejecuta las generaciones de horarios (US-ALGO-RUN). No contiene lógica
// (está excluido de la cobertura): igual que `lambda.ts`, lee los secretos de SSM, carga la configuración, compone la
// aplicación y exporta el handler, que solo pasa el id de la generación a `RunGeneration`. Todo ello ocurre una vez
// por instancia, durante la inicialización (top-level await): si algo falla, se escribe una línea JSON `fatal` y la
// inicialización falla.
import { readFileSync } from 'node:fs';
import { SSMClient } from '@aws-sdk/client-ssm';
import { composeApp } from './composeApp.js';
import { loadSsmEnvironmentOrLog } from './infrastructure/aws/ssmEnvironment.js';
import { loadConfigOrLog } from './infrastructure/config.js';
import { createLogger } from './infrastructure/logger.js';

/** Conexiones por instancia: una para el progreso y la cancelación, y otra para el guardado del borrador. */
const POOL_MAX = 2;

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

const { runGeneration } = composeApp(
  // El worker ejecuta la generación él mismo: nunca lanza otra Lambda.
  { ...config, scheduleWorkerFunctionName: undefined },
  { logger: createLogger(config.logLevel), poolMax: POOL_MAX, ssl: { ca: supabaseCa } },
);

/** El evento de la invocación asíncrona: solo el id de la generación. */
export interface ScheduleWorkerEvent {
  generationId: string;
}

export const handler = (event: ScheduleWorkerEvent): Promise<void> =>
  runGeneration.execute(event.generationId);
