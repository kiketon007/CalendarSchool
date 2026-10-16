import { errorCodeOf, readJson } from '../services/httpResponse';

/** `fetch` de las peticiones a los endpoints protegidos: añade el access token y renueva la sesión si caducó. */
export type AuthorizedFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AuthorizedFetchOptions {
  /** Access token de la sesión en memoria en este momento, o `undefined` si no hay sesión. */
  getAccessToken: () => string | undefined;
  /**
   * Renueva la sesión y devuelve el access token nuevo, o `undefined` si ya no hay sesión. Debe
   * dejar disponible ese token en `getAccessToken` antes de resolver.
   */
  renew: () => Promise<string | undefined>;
}

/** `401 INVALID_SESSION`: el access token ya no vale (caducó o su sesión se cerró). */
async function isInvalidSession(response: Response): Promise<boolean> {
  if (response.status !== 401) {
    return false;
  }
  // Se lee una copia: la respuesta original llega intacta a quien la pidió.
  return errorCodeOf(await readJson(response.clone())) === 'INVALID_SESSION';
}

function send(input: string, init: RequestInit | undefined, accessToken: string | undefined) {
  const headers = new Headers(init?.headers);
  if (accessToken !== undefined) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return fetch(input, { ...init, headers });
}

/**
 * Crea el cliente de las peticiones autenticadas. Ante un `401 INVALID_SESSION` renueva la sesión una
 * sola vez y repite la petición una única vez con el token nuevo; las peticiones que fallan a la vez
 * comparten una única renovación. Si no hay sesión tras renovar, devuelve el `401` original. Cualquier
 * otra respuesta (`403`, `503`...) se devuelve tal cual, y un error de red llega a quien llama.
 */
export function createAuthorizedFetch({
  getAccessToken,
  renew,
}: AuthorizedFetchOptions): AuthorizedFetch {
  let renewal: Promise<string | undefined> | undefined;

  const renewOnce = () => {
    renewal ??= renew().finally(() => {
      renewal = undefined;
    });
    return renewal;
  };

  return async (input, init) => {
    const tokenSent = getAccessToken();
    const response = await send(input, init, tokenSent);
    if (!(await isInvalidSession(response))) {
      return response;
    }

    // Si otra petición ya renovó mientras esta esperaba, basta repetir con el token actual.
    const current = getAccessToken();
    const token = current !== undefined && current !== tokenSent ? current : await renewOnce();
    return token === undefined ? response : send(input, init, token);
  };
}
