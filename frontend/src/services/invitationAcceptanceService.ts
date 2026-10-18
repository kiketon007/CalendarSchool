import type { components } from '../api/generated/schema';
import { retryAfterMinutes } from '../utils/retryAfterMinutes';
import { errorCodeOf, isRecord, parseRetryAfter, readJson } from './httpResponse';

type Schemas = components['schemas'];
export type InvitationRole = Schemas['InvitationLookupResponse']['data']['role'];
export type AcceptedUser = Schemas['InvitationAcceptedResponse']['data']['user'];
export type AcceptedSchool = Schemas['InvitationAcceptedResponse']['data']['school'];
export type FieldError = Schemas['FieldError'];

/** Campos que rellena la persona invitada; el token del enlace se pasa aparte. */
export type AcceptInvitationFields = Omit<Schemas['AcceptInvitationRequest'], 'token'>;

/** Resultado de consultar el enlace, ya interpretado: la interfaz decide qué mostrar según el estado. */
export type LookupOutcome =
  | { status: 'found'; schoolName: string; role: InvitationRole }
  /** Caducado, usado, revocado, inexistente o sin token: no se distingue el caso. */
  | { status: 'invalid' }
  | { status: 'tooManyAttempts'; retryAfterMinutes: number | undefined }
  | { status: 'unavailable' };

/** Resultado de aceptar la invitación, ya interpretado. */
export type AcceptOutcome =
  | { status: 'accepted'; user: AcceptedUser; school: AcceptedSchool }
  | { status: 'invalid' }
  | { status: 'emailAlreadyRegistered' }
  | { status: 'validationError'; details: FieldError[] }
  | { status: 'tooManyAttempts'; retryAfterMinutes: number | undefined }
  | { status: 'unavailable' };

const UNAVAILABLE = { status: 'unavailable' } as const;

function isRole(value: unknown): value is InvitationRole {
  return value === 'ADMIN' || value === 'MEMBER';
}

/** Estados de error comunes a la consulta y a la aceptación, o `undefined` si no es uno de ellos. */
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

async function interpretLookup(response: Response): Promise<LookupOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    const data = isRecord(body) ? body.data : undefined;
    return isRecord(data) &&
      isRecord(data.school) &&
      typeof data.school.name === 'string' &&
      isRole(data.role)
      ? { status: 'found', schoolName: data.school.name, role: data.role }
      : UNAVAILABLE;
  }
  return commonFailure(response, body) ?? UNAVAILABLE;
}

function isAcceptedUser(value: unknown): value is AcceptedUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.firstName === 'string' &&
    typeof value.lastName === 'string' &&
    typeof value.email === 'string' &&
    isRole(value.role)
  );
}

function isAcceptedSchool(value: unknown): value is AcceptedSchool {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string';
}

async function interpretAccept(response: Response): Promise<AcceptOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 201) {
    const data = isRecord(body) ? body.data : undefined;
    return isRecord(data) && isAcceptedUser(data.user) && isAcceptedSchool(data.school)
      ? { status: 'accepted', user: data.user, school: data.school }
      : UNAVAILABLE;
  }
  if (response.status === 409 && code === 'EMAIL_ALREADY_REGISTERED') {
    return { status: 'emailAlreadyRegistered' };
  }
  if (response.status === 400 && code === 'VALIDATION_ERROR') {
    const details = isRecord(body) && isRecord(body.error) ? body.error.details : undefined;
    return Array.isArray(details)
      ? { status: 'validationError', details: details as FieldError[] }
      : UNAVAILABLE;
  }
  return commonFailure(response, body) ?? UNAVAILABLE;
}

/** `POST` público con cuerpo JSON: la persona invitada todavía no tiene cuenta, así que no hay `Authorization`. */
function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Llamadas a la API pública de las invitaciones (US02_b4). El token viaja siempre en el cuerpo, nunca
 * en la ruta, para que no quede en los logs de acceso. Nunca rechazan: un fallo de red o una respuesta
 * inesperada se devuelven como `unavailable`.
 */
export const invitationAcceptanceService = {
  /** Consulta el colegio y el rol con `POST /api/invitations/lookup`; no consume la invitación. */
  async lookup(token: string): Promise<LookupOutcome> {
    try {
      return await interpretLookup(await postJson('/api/invitations/lookup', { token }));
    } catch {
      // Sin conexión: la interfaz decide cómo seguir, nunca muestra el error técnico.
      return UNAVAILABLE;
    }
  },

  /** Crea la cuenta con `POST /api/invitations/accept`; no inicia sesión. */
  async accept(token: string, fields: AcceptInvitationFields): Promise<AcceptOutcome> {
    try {
      return await interpretAccept(await postJson('/api/invitations/accept', { token, ...fields }));
    } catch {
      return UNAVAILABLE;
    }
  },
};
