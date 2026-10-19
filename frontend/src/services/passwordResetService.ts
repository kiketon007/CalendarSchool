import type { components } from '../api/generated/schema';
import { retryAfterMinutes } from '../utils/retryAfterMinutes';
import { errorCodeOf, isRecord, parseRetryAfter, readJson } from './httpResponse';

type Schemas = components['schemas'];
export type FieldError = Schemas['FieldError'];

/** Resultado de consultar el enlace, ya interpretado: la interfaz decide qué mostrar según el estado. */
export type LookupPasswordResetOutcome =
  /** `email` llega con el local enmascarado (`a***@example.com`). */
  | { status: 'found'; schoolName: string; email: string }
  /** Caducado, usado, revocado, inexistente, de un usuario dado de baja o sin token: no se distingue el caso. */
  | { status: 'invalid' }
  | { status: 'tooManyAttempts'; retryAfterMinutes: number | undefined }
  | { status: 'unavailable' };

/** Resultado de confirmar el restablecimiento, ya interpretado. */
export type ConfirmPasswordResetOutcome =
  | { status: 'confirmed' }
  | { status: 'invalid' }
  | { status: 'validationError'; details: FieldError[] }
  | { status: 'tooManyAttempts'; retryAfterMinutes: number | undefined }
  | { status: 'unavailable' };

const UNAVAILABLE = { status: 'unavailable' } as const;

/** Estados de error comunes a la consulta y a la confirmación, o `undefined` si no es uno de ellos. */
function commonFailure(
  response: Response,
  body: unknown,
):
  | { status: 'invalid' }
  | { status: 'tooManyAttempts'; retryAfterMinutes: number | undefined }
  | undefined {
  const code = errorCodeOf(body);
  if (response.status === 410 && code === 'ACCESS_LINK_INVALID') {
    return { status: 'invalid' };
  }
  if (response.status === 429 && code === 'TOO_MANY_REQUESTS') {
    const seconds = parseRetryAfter(response);
    return {
      status: 'tooManyAttempts',
      retryAfterMinutes: seconds === undefined ? undefined : retryAfterMinutes(seconds),
    };
  }
  return undefined;
}

async function interpretLookup(response: Response): Promise<LookupPasswordResetOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const data = isRecord(body) ? body.data : undefined;
    return isRecord(data) &&
      isRecord(data.school) &&
      typeof data.school.name === 'string' &&
      typeof data.email === 'string'
      ? { status: 'found', schoolName: data.school.name, email: data.email }
      : UNAVAILABLE;
  }
  return commonFailure(response, body) ?? UNAVAILABLE;
}

async function interpretConfirm(response: Response): Promise<ConfirmPasswordResetOutcome> {
  if (response.status === 204) {
    return { status: 'confirmed' };
  }
  const body = await readJson(response);

  if (response.status === 400 && errorCodeOf(body) === 'VALIDATION_ERROR') {
    const details = isRecord(body) && isRecord(body.error) ? body.error.details : undefined;
    return Array.isArray(details)
      ? { status: 'validationError', details: details as FieldError[] }
      : UNAVAILABLE;
  }
  return commonFailure(response, body) ?? UNAVAILABLE;
}

/** `POST` público con cuerpo JSON: quien restablece no tiene sesión, así que no hay `Authorization`. */
function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Llamadas a la API pública del restablecimiento de contraseña (US02_c). El token viaja siempre en
 * el cuerpo, nunca en la ruta, para que no quede en los logs de acceso. Nunca rechazan: un fallo de
 * red o una respuesta inesperada se devuelven como `unavailable`.
 */
export const passwordResetService = {
  /** Consulta el colegio y el email enmascarado con `POST /api/password-resets/lookup`; no consume el enlace. */
  async lookup(token: string): Promise<LookupPasswordResetOutcome> {
    try {
      return await interpretLookup(await postJson('/api/password-resets/lookup', { token }));
    } catch {
      // Sin conexión: la interfaz decide cómo seguir, nunca muestra el error técnico.
      return UNAVAILABLE;
    }
  },

  /** Fija la contraseña nueva con `POST /api/password-resets/confirm`; no inicia sesión. */
  async confirm(token: string, password: string): Promise<ConfirmPasswordResetOutcome> {
    try {
      return await interpretConfirm(
        await postJson('/api/password-resets/confirm', { token, password }),
      );
    } catch {
      return UNAVAILABLE;
    }
  },
};
