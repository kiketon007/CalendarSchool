import type { components } from '../api/generated/schema';

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

type FieldError = components['schemas']['FieldError'];

/** Los motivos de campo del contrato (`FieldErrorCode`). Deben coincidir con `docs/api-spec.yml`. */
const FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID_LENGTH',
  'INVALID_FORMAT',
  'INVALID_CHARACTERS',
  'WEAK_PASSWORD',
  'DUPLICATE',
  'NOT_FOUND',
  'NOT_ALLOWED',
  'INVALID_RANGE',
  'TOO_LONG',
  'OVERLAP',
  'OUT_OF_RANGE',
] as const;

function isFieldError(value: unknown): value is FieldError {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    typeof value.code === 'string' &&
    (FIELD_ERROR_CODES as readonly string[]).includes(value.code)
  );
}

/**
 * Los campos de un `400 VALIDATION_ERROR`, o `undefined` si no vienen como el contrato dice. Los
 * servicios anteriores a US19 llevan cada uno su copia; los nuevos usan esta.
 */
export function fieldErrorsOf(body: unknown): FieldError[] | undefined {
  const details = isRecord(body) && isRecord(body.error) ? body.error.details : undefined;
  return Array.isArray(details) && details.every(isFieldError) ? details : undefined;
}
