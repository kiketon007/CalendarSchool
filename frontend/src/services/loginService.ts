import type { components } from '../api/generated/schema';
import { errorCodeOf, parseRetryAfter, readJson } from './httpResponse';

export type LoginRequest = components['schemas']['LoginRequest'];

/** Resultado del login, ya interpretado: la interfaz decide qué mostrar según el estado. */
export type LoginOutcome =
  | { status: 'loggedIn' }
  | { status: 'invalidCredentials' }
  | { status: 'accountSuspended' }
  | { status: 'captchaChallengeRequired' }
  | { status: 'captchaFailed' }
  | { status: 'tooManyRequests'; retryAfterSeconds: number | undefined }
  | { status: 'unavailable' };

const UNAVAILABLE: LoginOutcome = { status: 'unavailable' };

/**
 * Interpreta la respuesta del login por su estado y por `error.code`, nunca por el mensaje. Todo lo
 * que no es un resultado conocido (`503`, `500`, un `400` que el formulario ya evita, una respuesta
 * que no es JSON) es «no disponible»: la interfaz solo ofrece reintentar más tarde.
 */
async function interpretLogin(response: Response): Promise<LoginOutcome> {
  // El login correcto no tiene cuerpo: la sesión viaja en la cookie.
  if (response.status === 204) {
    return { status: 'loggedIn' };
  }

  const code = errorCodeOf(await readJson(response));
  if (response.status === 401 && code === 'INVALID_CREDENTIALS') {
    return { status: 'invalidCredentials' };
  }
  if (response.status === 403 && code === 'ACCOUNT_SUSPENDED') {
    return { status: 'accountSuspended' };
  }
  if (response.status === 422 && code === 'CAPTCHA_CHALLENGE_REQUIRED') {
    return { status: 'captchaChallengeRequired' };
  }
  if (response.status === 422 && code === 'CAPTCHA_FAILED') {
    return { status: 'captchaFailed' };
  }
  if (response.status === 429 && code === 'TOO_MANY_REQUESTS') {
    return { status: 'tooManyRequests', retryAfterSeconds: parseRetryAfter(response) };
  }
  return UNAVAILABLE;
}

/** Llamadas a la API del inicio de sesión. Los tipos salen del contrato (`docs/api-spec.yml`). */
export const loginService = {
  /** Nunca lanza: sin conexión devuelve `unavailable`, y la interfaz no muestra el error técnico. */
  async login(request: LoginRequest): Promise<LoginOutcome> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      return await interpretLogin(response);
    } catch {
      return UNAVAILABLE;
    }
  },
};
