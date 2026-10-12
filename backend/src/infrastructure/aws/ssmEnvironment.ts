import { GetParametersByPathCommand, type SSMClient } from '@aws-sdk/client-ssm';
import type { Logger } from '../logger.js';

/** Lo único que se usa del cliente de SSM: así los tests inyectan un doble sin AWS. */
export type SsmClient = Pick<SSMClient, 'send'>;

/**
 * Lee los parámetros `SecureString` bajo `path` (descifrados, sin recorrer rutas anidadas) y los
 * devuelve como variables de entorno: el nombre es el último segmento del parámetro
 * (`/calendarschool/prod/JWT_SECRET` → `JWT_SECRET`). Sigue `NextToken` hasta leer todas las páginas.
 *
 * Los errores de SSM se propagan tal cual; los valores no se incluyen nunca en ellos.
 */
export async function loadSsmEnvironment(
  client: SsmClient,
  path: string,
): Promise<Record<string, string>> {
  const environment: Record<string, string> = {};
  let nextToken: string | undefined;

  do {
    const page = await client.send(
      new GetParametersByPathCommand({
        Path: path,
        WithDecryption: true,
        Recursive: false,
        NextToken: nextToken,
      }),
    );
    for (const { Name: name, Value: value } of page.Parameters ?? []) {
      const variable = name?.split('/').pop();
      if (variable && value !== undefined) {
        environment[variable] = value;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken !== undefined);

  return environment;
}

/**
 * Igual que `loadSsmEnvironment`, pero ante un fallo escribe una única línea JSON `fatal` y
 * relanza: la función no debe atender peticiones sin sus secretos. El log lleva solo la ruta y el
 * nombre del error, nunca su mensaje ni ningún valor.
 */
export async function loadSsmEnvironmentOrLog(
  client: SsmClient,
  path: string,
  logger: Logger,
): Promise<Record<string, string>> {
  try {
    return await loadSsmEnvironment(client, path);
  } catch (error) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    logger.fatal({ path, errorName }, 'No se pudieron leer los parámetros de SSM');
    throw error;
  }
}
