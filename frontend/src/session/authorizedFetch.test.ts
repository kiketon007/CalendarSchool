import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';
import { createAuthorizedFetch } from './authorizedFetch';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const invalidSession = () =>
  jsonResponse(401, {
    success: false,
    error: { code: 'INVALID_SESSION', message: 'La sesión no es válida' },
  });
const ok = () => jsonResponse(200, { success: true, data: [] });

/** Cabecera `Authorization` de la n-ésima llamada a `fetch` (empezando en 0). */
function authorizationOf(fetchMock: MockInstance<typeof fetch>, call: number): string | null {
  const init = fetchMock.mock.calls[call]?.[1];
  return new Headers(init?.headers).get('Authorization');
}

describe('createAuthorizedFetch', () => {
  let fetchMock: MockInstance<typeof fetch>;
  let currentToken: string | undefined;
  let renew: Mock<() => Promise<string | undefined>>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch');
    currentToken = 'old-token';
    // Renovar deja el token nuevo disponible, como hace el proveedor de la sesión.
    renew = vi.fn(() => {
      currentToken = 'new-token';
      return Promise.resolve<string | undefined>('new-token');
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  function authorizedFetch() {
    return createAuthorizedFetch({ getAccessToken: () => currentToken, renew });
  }

  it('sends the access token of the session as a bearer token', async () => {
    fetchMock.mockResolvedValue(ok());

    const response = await authorizedFetch()('/api/users');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/users', expect.anything());
    expect(authorizationOf(fetchMock, 0)).toBe('Bearer old-token');
    expect(renew).not.toHaveBeenCalled();
  });

  it('keeps the headers and options of the caller', async () => {
    fetchMock.mockResolvedValue(ok());

    await authorizedFetch()('/api/users', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
    expect(init?.method).toBe('GET');
  });

  it('renews the session once on 401 INVALID_SESSION and repeats the request with the new token', async () => {
    fetchMock.mockResolvedValueOnce(invalidSession()).mockResolvedValueOnce(ok());

    const response = await authorizedFetch()('/api/users');

    expect(response.status).toBe(200);
    expect(renew).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authorizationOf(fetchMock, 0)).toBe('Bearer old-token');
    expect(authorizationOf(fetchMock, 1)).toBe('Bearer new-token');
  });

  it('returns the 401 without repeating when the renewal gives no session', async () => {
    renew.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue(invalidSession());

    const response = await authorizedFetch()('/api/users');

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_SESSION' } });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('repeats only once: a second 401 is returned without renewing again', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(invalidSession()));

    const response = await authorizedFetch()('/api/users');

    expect(response.status).toBe(401);
    expect(renew).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one renewal between requests that receive 401 at the same time', async () => {
    let finishRenewal: (token: string) => void = () => {};
    renew.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finishRenewal = (token) => {
            currentToken = token;
            resolve(token);
          };
        }),
    );
    fetchMock.mockImplementation((_input, init) =>
      Promise.resolve(
        new Headers(init?.headers).get('Authorization') === 'Bearer old-token'
          ? invalidSession()
          : ok(),
      ),
    );
    const call = authorizedFetch();

    const first = call('/api/users');
    const second = call('/api/users');
    await vi.waitFor(() => {
      expect(renew).toHaveBeenCalledOnce();
    });
    finishRenewal('new-token');

    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
    expect(renew).toHaveBeenCalledOnce();
  });

  it('repeats without renewing when another request has already renewed the token', async () => {
    // La petición salió con `old-token`, pero cuando llega su 401 ya hay un token nuevo.
    fetchMock
      .mockImplementationOnce(() => {
        currentToken = 'new-token';
        return Promise.resolve(invalidSession());
      })
      .mockResolvedValueOnce(ok());

    const response = await authorizedFetch()('/api/users');

    expect(response.status).toBe(200);
    expect(renew).not.toHaveBeenCalled();
    expect(authorizationOf(fetchMock, 1)).toBe('Bearer new-token');
  });

  it.each([
    ['403', jsonResponse(403, { success: false, error: { code: 'FORBIDDEN', message: 'x' } })],
    [
      '503',
      jsonResponse(503, { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'x' } }),
    ],
    [
      '401 with another code',
      jsonResponse(401, { success: false, error: { code: 'INVALID_CREDENTIALS', message: 'x' } }),
    ],
    ['401 without a JSON body', new Response('no autorizado', { status: 401 })],
  ])('returns a %s as it is, without renewing', async (_case, response) => {
    fetchMock.mockResolvedValue(response);

    const result = await authorizedFetch()('/api/users');

    expect(result).toBe(response);
    expect(renew).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('lets a network error reach the caller', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(authorizedFetch()('/api/users')).rejects.toThrow('Failed to fetch');
    expect(renew).not.toHaveBeenCalled();
  });

  it('sends no Authorization header when there is no access token', async () => {
    currentToken = undefined;
    fetchMock.mockResolvedValue(ok());

    await authorizedFetch()('/api/users');

    expect(authorizationOf(fetchMock, 0)).toBeNull();
  });

  it('can renew again in a later request once the previous renewal has finished', async () => {
    fetchMock
      .mockResolvedValueOnce(invalidSession())
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(invalidSession())
      .mockResolvedValueOnce(ok());
    const call = authorizedFetch();
    await call('/api/users');
    currentToken = 'expired-again';

    const response = await call('/api/users');

    expect(response.status).toBe(200);
    expect(renew).toHaveBeenCalledTimes(2);
  });
});
