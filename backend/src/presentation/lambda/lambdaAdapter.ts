import type { Express } from 'express';
import serverless from 'serverless-http';

type Handler = ReturnType<typeof serverless>;

interface HttpApiResult {
  headers?: Record<string, string>;
  cookies?: string[];
}

/**
 * Envuelve la app de Express como handler de Lambda para la HTTP API con payload 2.0.
 *
 * `serverless-http` solo devuelve `Set-Cookie` en `cookies` cuando Express lo escribe como array;
 * con una cadena lo deja en `headers['set-cookie']`, y la HTTP API junta las cabeceras repetidas.
 * Aquí se mueve siempre a `cookies`, que es el campo que la HTTP API entrega como una cabecera
 * `Set-Cookie` por cookie (design.md D2).
 */
export function createLambdaHandler(app: Express): Handler {
  const handler = serverless(app);

  return async (event, context) => {
    const result = (await handler(event, context)) as HttpApiResult;
    const header = Object.entries(result.headers ?? {}).find(
      ([name]) => name.toLowerCase() === 'set-cookie',
    );

    if (header !== undefined && result.headers !== undefined) {
      delete result.headers[header[0]];
      result.cookies = [...(result.cookies ?? []), header[1]];
    }
    return result;
  };
}
