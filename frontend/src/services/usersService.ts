import type { components } from '../api/generated/schema';
import type { AuthorizedFetch } from '../session/authorizedFetch';
import { errorCodeOf, isRecord, readJson } from './httpResponse';

export type SchoolUser = components['schemas']['SchoolUser'];

/** Resultado de pedir la lista de usuarios, ya interpretado: la interfaz decide qué hacer según el estado. */
export type UsersOutcome =
  | { status: 'loaded'; users: SchoolUser[] }
  /** El rol de la sesión en memoria ya no es el de administrador. */
  | { status: 'forbidden' }
  /** La sesión ya no es válida (tras haber intentado renovarla). */
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

const UNAVAILABLE: UsersOutcome = { status: 'unavailable' };

const TEXT_FIELDS = ['id', 'firstName', 'lastName', 'email', 'createdAt'] as const;

function isSchoolUser(value: unknown): value is SchoolUser {
  return (
    isRecord(value) &&
    TEXT_FIELDS.every((field) => typeof value[field] === 'string') &&
    (value.role === 'ADMIN' || value.role === 'MEMBER') &&
    (value.status === 'ACTIVE' || value.status === 'SUSPENDED')
  );
}

/** Interpreta la respuesta por su estado y por `error.code`, nunca por el mensaje. */
async function interpret(response: Response): Promise<UsersOutcome> {
  const body = await readJson(response);

  if (response.status === 200) {
    return isRecord(body) && Array.isArray(body.data) && body.data.every(isSchoolUser)
      ? { status: 'loaded', users: body.data }
      : UNAVAILABLE;
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 403 && errorCodeOf(body) === 'FORBIDDEN') {
    return { status: 'forbidden' };
  }
  return UNAVAILABLE;
}

/**
 * Resultado de una acción sobre un usuario (cambiar el rol, darlo de baja o reactivarlo), ya
 * interpretado por `error.code`: la interfaz decide qué mensaje mostrar según el estado.
 */
export type UserActionOutcome =
  /** La acción terminó (también si no había nada que cambiar): el usuario tal como queda. */
  | { status: 'updated'; user: SchoolUser }
  /** Dejaría el colegio sin ningún administrador activo. */
  | { status: 'lastAdminRequired' }
  | { status: 'cannotSuspendSelf' }
  /** La acción exige un usuario activo y está dado de baja. */
  | { status: 'userNotActive' }
  /** El usuario ya no existe en el colegio (la lista estaba desfasada). */
  | { status: 'notFound' }
  | { status: 'forbidden' }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

const CONFLICTS: Record<string, UserActionOutcome> = {
  LAST_ADMIN_REQUIRED: { status: 'lastAdminRequired' },
  CANNOT_SUSPEND_SELF: { status: 'cannotSuspendSelf' },
  USER_NOT_ACTIVE: { status: 'userNotActive' },
};

async function interpretAction(response: Response): Promise<UserActionOutcome> {
  const body = await readJson(response);
  const code = errorCodeOf(body);

  if (response.status === 200) {
    return isRecord(body) && isSchoolUser(body.data)
      ? { status: 'updated', user: body.data }
      : { status: 'unavailable' };
  }
  if (response.status === 401) {
    return { status: 'unauthenticated' };
  }
  if (response.status === 403 && code === 'FORBIDDEN') {
    return { status: 'forbidden' };
  }
  if (response.status === 404 && code === 'NOT_FOUND') {
    return { status: 'notFound' };
  }
  if (response.status === 409 && typeof code === 'string' && Object.hasOwn(CONFLICTS, code)) {
    return CONFLICTS[code] ?? { status: 'unavailable' };
  }
  return { status: 'unavailable' };
}

/** Envía la petición y la interpreta; nunca rechaza (un fallo de red es `unavailable`). */
async function sendAction(
  authorizedFetch: AuthorizedFetch,
  path: string,
  init: RequestInit,
): Promise<UserActionOutcome> {
  try {
    return await interpretAction(await authorizedFetch(path, init));
  } catch {
    // Sin conexión: la interfaz decide cómo seguir, nunca muestra el error técnico.
    return { status: 'unavailable' };
  }
}

/** Llamadas a la API de usuarios del colegio. Los tipos salen del contrato (`docs/api-spec.yml`). */
export const usersService = {
  /** Cambia el rol de un usuario con `PUT /api/users/{id}/role` (solo administradores). */
  changeRole(
    authorizedFetch: AuthorizedFetch,
    userId: string,
    role: SchoolUser['role'],
  ): Promise<UserActionOutcome> {
    return sendAction(authorizedFetch, `/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
  },

  /** Da de baja a un usuario con `POST /api/users/{id}/suspend`; el servidor revoca sus sesiones. */
  suspend(authorizedFetch: AuthorizedFetch, userId: string): Promise<UserActionOutcome> {
    return sendAction(authorizedFetch, `/api/users/${userId}/suspend`, { method: 'POST' });
  },

  /** Reactiva a un usuario dado de baja con `POST /api/users/{id}/reactivate`. */
  reactivate(authorizedFetch: AuthorizedFetch, userId: string): Promise<UserActionOutcome> {
    return sendAction(authorizedFetch, `/api/users/${userId}/reactivate`, { method: 'POST' });
  },

  /**
   * Pide los usuarios del colegio con `GET /api/users` (solo administradores). Nunca rechaza: un
   * fallo de red o una respuesta inesperada se devuelven como `unavailable`.
   */
  async list(authorizedFetch: AuthorizedFetch): Promise<UsersOutcome> {
    try {
      return await interpret(await authorizedFetch('/api/users'));
    } catch {
      // Sin conexión: la interfaz decide cómo seguir, nunca muestra el error técnico.
      return UNAVAILABLE;
    }
  },
};
