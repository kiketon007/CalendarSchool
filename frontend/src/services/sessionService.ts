import type { components } from '../api/generated/schema';

export type SessionData = components['schemas']['SessionResponse']['data'];

/** Resultado de renovar la sesión, ya interpretado: la interfaz decide qué hacer según el estado. */
export type RefreshOutcome =
  | { status: 'authenticated'; data: SessionData }
  | { status: 'invalidSession' }
  | { status: 'unexpected' };

const UNEXPECTED: RefreshOutcome = { status: 'unexpected' };

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

/** Interpreta la respuesta de `refresh` por su estado y por `error.code`, nunca por el mensaje. */
async function interpretRefresh(response: Response): Promise<RefreshOutcome> {
  const body = await readJson(response);
  if (!isRecord(body)) {
    return UNEXPECTED;
  }

  if (response.status === 200 && isRecord(body.data)) {
    return { status: 'authenticated', data: body.data as SessionData };
  }

  const error = isRecord(body.error) ? body.error : undefined;
  if (response.status === 401 && error?.code === 'INVALID_SESSION') {
    return { status: 'invalidSession' };
  }
  return UNEXPECTED;
}

/** Llamadas a la API de la sesión. Los tipos salen del contrato (`docs/api-spec.yml`). */
export const sessionService = {
  /**
   * Pide un access token nuevo con la cookie `refresh_token`. Nunca rechaza: un fallo de red o
   * una respuesta inesperada se devuelven como `unexpected`. El navegador añade solo la
   * cabecera `Origin` que exige el backend.
   */
  async refresh(): Promise<RefreshOutcome> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      return await interpretRefresh(response);
    } catch {
      // Sin conexión: la interfaz decide cómo seguir, nunca muestra el error técnico.
      return UNEXPECTED;
    }
  },
};
