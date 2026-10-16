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

/** Llamadas a la API de usuarios del colegio. Los tipos salen del contrato (`docs/api-spec.yml`). */
export const usersService = {
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
