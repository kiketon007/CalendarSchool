/** Utilidades para interpretar las respuestas de la API que comparten los servicios. */

/** Cuerpo JSON de la respuesta, o `undefined` si no es JSON. */
export async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Código de `error.code` del cuerpo de un error de la API, o `undefined` si no lo trae. */
export function errorCodeOf(body: unknown): unknown {
  return isRecord(body) && isRecord(body.error) ? body.error.code : undefined;
}

/**
 * Segundos de espera de la cabecera `Retry-After`, o `undefined` si falta o no es un número entero
 * de segundos (la cabecera también admite una fecha HTTP, que el backend no envía).
 */
export function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}
