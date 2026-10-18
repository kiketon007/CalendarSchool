import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

export type Invitation = components['schemas']['Invitation'];
export type InvitationRole = Invitation['role'];

/**
 * Resultado de generar una invitación, ya interpretado: la interfaz decide qué mostrar según el
 * estado. `url` es el enlace completo, que solo existe en esta respuesta.
 */
export type CreateInvitationOutcome =
  | { status: 'created'; invitation: Invitation; url: string }
  /** El rol de la sesión en memoria ya no es el de administrador. */
  | { status: 'forbidden' }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export type ListInvitationsOutcome =
  | { status: 'loaded'; invitations: Invitation[] }
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export type RevokeInvitationOutcome =
  /** La invitación ya no está pendiente (también si ya estaba revocada). */
  | { status: 'revoked' }
  /** La invitación no existe en el colegio (la lista estaba desfasada). */
  | { status: 'notFound' }
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

const UNAVAILABLE = { status: 'unavailable' } as const;

function isInvitation(value: unknown): value is Invitation {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.role === 'ADMIN' || value.role === 'MEMBER') &&
    isRecord(value.createdBy) &&
    typeof value.createdBy.id === 'string' &&
    typeof value.createdBy.firstName === 'string' &&
    typeof value.createdBy.lastName === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.expiresAt === 'string'
  );
}

/** Estados de error comunes a las tres operaciones, o `undefined` si la respuesta no es uno de ellos. */
function commonFailure(
  response: Response,
  body: unknown,
): { status: 'forbidden' | 'unauthenticated' } | undefined {
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 403 && errorCodeOf(body) === 'FORBIDDEN') {
    return { status: 'forbidden' };
  }
  return undefined;
}

async function interpretCreate(response: Response): Promise<CreateInvitationOutcome> {
  const body = await readJson(response);

  if (response.status === 201) {
    const data = isRecord(body) ? body.data : undefined;
    return isRecord(data) && isInvitation(data.invitation) && typeof data.url === 'string'
      ? { status: 'created', invitation: data.invitation, url: data.url }
      : UNAVAILABLE;
  }
  return commonFailure(response, body) ?? UNAVAILABLE;
}

async function interpretList(response: Response): Promise<ListInvitationsOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    return isRecord(body) && Array.isArray(body.data) && body.data.every(isInvitation)
      ? { status: 'loaded', invitations: body.data }
      : UNAVAILABLE;
  }
  return commonFailure(response, body) ?? UNAVAILABLE;
}

async function interpretRevoke(response: Response): Promise<RevokeInvitationOutcome> {
  if (response.status === 204) {
    return { status: 'revoked' };
  }
  const body = await readJson(response);

  if (response.status === 404 && errorCodeOf(body) === 'NOT_FOUND') {
    return { status: 'notFound' };
  }
  return commonFailure(response, body) ?? UNAVAILABLE;
}

/** Llamadas a la API de invitaciones del colegio. Los tipos salen del contrato (`docs/api-spec.yml`). */
export const invitationsService = {
  /**
   * Genera una invitación con `POST /api/invitations` (solo administradores). Nunca rechaza: un
   * fallo de red o una respuesta inesperada se devuelven como `unavailable`.
   */
  async create(
    authorizedFetch: AuthorizedFetch,
    role: InvitationRole,
  ): Promise<CreateInvitationOutcome> {
    try {
      return await interpretCreate(
        await authorizedFetch('/api/invitations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }),
      );
    } catch {
      // Sin conexión: la interfaz decide cómo seguir, nunca muestra el error técnico.
      return UNAVAILABLE;
    }
  },

  /** Pide las invitaciones pendientes con `GET /api/invitations`, sin enlace. Nunca rechaza. */
  async list(authorizedFetch: AuthorizedFetch): Promise<ListInvitationsOutcome> {
    try {
      return await interpretList(await authorizedFetch('/api/invitations'));
    } catch {
      return UNAVAILABLE;
    }
  },

  /** Revoca una invitación con `POST /api/invitations/{id}/revoke`; es idempotente. Nunca rechaza. */
  async revoke(
    authorizedFetch: AuthorizedFetch,
    invitationId: string,
  ): Promise<RevokeInvitationOutcome> {
    try {
      return await interpretRevoke(
        await authorizedFetch(`/api/invitations/${invitationId}/revoke`, { method: 'POST' }),
      );
    } catch {
      return UNAVAILABLE;
    }
  },
};
