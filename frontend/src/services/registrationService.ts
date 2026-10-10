import type { components } from '../api/generated/schema';

type Schemas = components['schemas'];
export type RegisterRequest = Schemas['RegisterRequest'];
export type RegisterData = Schemas['RegisterResponse']['data'];
export type FieldError = Schemas['FieldError'];
export type Municipality = Schemas['Municipality'];

/** Resultado del registro, ya interpretado: la interfaz decide qué mostrar según el estado. */
export type RegisterOutcome =
  | { status: 'created'; data: RegisterData }
  | { status: 'validation'; details: FieldError[] }
  | { status: 'emailAlreadyRegistered' }
  | { status: 'schoolAlreadyRegistered' }
  | { status: 'tooManyRequests'; retryAfterSeconds: number | undefined }
  | { status: 'captchaChallengeRequired' }
  | { status: 'captchaFailed' }
  | { status: 'captchaUnavailable' }
  | { status: 'unexpected' };

const UNEXPECTED: RegisterOutcome = { status: 'unexpected' };

/** Cuerpo JSON de la respuesta, o `undefined` si no es JSON. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Segundos de espera de la cabecera `Retry-After`, o `undefined` si falta o no es un número entero
 * de segundos (la cabecera también admite una fecha HTTP, que el backend no envía).
 */
function parseRetryAfter(response: Response): number | undefined {
  const value = response.headers.get('Retry-After');
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

/** Interpreta la respuesta del registro por su estado y por `error.code`, nunca por el mensaje. */
async function interpretRegister(response: Response): Promise<RegisterOutcome> {
  const body = await readJson(response);
  if (!isRecord(body)) {
    return UNEXPECTED;
  }

  if (response.status === 201 && isRecord(body.data)) {
    return { status: 'created', data: body.data as RegisterData };
  }

  const error = isRecord(body.error) ? body.error : undefined;
  if (
    response.status === 400 &&
    error?.code === 'VALIDATION_ERROR' &&
    Array.isArray(error.details)
  ) {
    return { status: 'validation', details: error.details as FieldError[] };
  }
  if (response.status === 409 && error?.code === 'EMAIL_ALREADY_REGISTERED') {
    return { status: 'emailAlreadyRegistered' };
  }
  if (response.status === 409 && error?.code === 'SCHOOL_ALREADY_REGISTERED') {
    return { status: 'schoolAlreadyRegistered' };
  }
  if (response.status === 422 && error?.code === 'CAPTCHA_CHALLENGE_REQUIRED') {
    return { status: 'captchaChallengeRequired' };
  }
  if (response.status === 422 && error?.code === 'CAPTCHA_FAILED') {
    return { status: 'captchaFailed' };
  }
  if (response.status === 503 && error?.code === 'CAPTCHA_UNAVAILABLE') {
    return { status: 'captchaUnavailable' };
  }
  if (response.status === 429 && error?.code === 'TOO_MANY_REQUESTS') {
    return { status: 'tooManyRequests', retryAfterSeconds: parseRetryAfter(response) };
  }
  return UNEXPECTED;
}

/** Llamadas a la API del registro. Los tipos salen del contrato (`docs/api-spec.yml`). */
export const registrationService = {
  async register(request: RegisterRequest): Promise<RegisterOutcome> {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      return await interpretRegister(response);
    } catch {
      // Sin conexión: la interfaz muestra un mensaje genérico, nunca el error técnico.
      return UNEXPECTED;
    }
  },

  /** Lista de municipios; rechaza si la petición falla para que la interfaz ofrezca reintentar. */
  async listMunicipalities(): Promise<Municipality[]> {
    const response = await fetch('/api/municipalities');
    const body = await readJson(response);
    if (!response.ok || !isRecord(body) || !Array.isArray(body.data)) {
      throw new Error('No se pudo cargar la lista de municipios');
    }
    return body.data as Municipality[];
  },
};
