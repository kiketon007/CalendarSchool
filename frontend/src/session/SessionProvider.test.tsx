import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  sessionService,
  type LogoutOutcome,
  type RefreshOutcome,
  type SessionData,
} from '../services/sessionService';
import { SessionProvider, useSession } from './SessionProvider';

const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
    role: 'ADMIN',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};
const authenticated: RefreshOutcome = { status: 'authenticated', data: sessionData };

function wrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

function strictWrapper({ children }: { children: ReactNode }) {
  return (
    <StrictMode>
      <SessionProvider>{children}</SessionProvider>
    </StrictMode>
  );
}

/**
 * `BroadcastChannel` falso: entrega lo que publica una instancia a las demás con el mismo nombre,
 * como el real (que no entrega el mensaje a quien lo envía), y deja ver cuáles siguen abiertas.
 */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor(readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(data: unknown): void {
    for (const other of FakeBroadcastChannel.instances) {
      if (other !== this && !other.closed && other.name === this.name) {
        other.onmessage?.(new MessageEvent('message', { data }));
      }
    }
  }

  close(): void {
    this.closed = true;
  }
}

describe('SessionProvider', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
  });

  afterEach(() => {
    refresh.mockRestore();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('starts loading and becomes authenticated when refresh succeeds', async () => {
    refresh.mockResolvedValue(authenticated);

    const { result } = renderHook(() => useSession(), { wrapper });

    expect(result.current.state).toEqual({ status: 'loading' });
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'authenticated', data: sessionData });
    });
  });

  it.each<[string, RefreshOutcome]>([
    ['an invalid session', { status: 'invalidSession' }],
    ['an unexpected failure', { status: 'unexpected' }],
  ])('becomes anonymous after %s, without showing any error', async (_case, outcome) => {
    refresh.mockResolvedValue(outcome);

    const { result } = renderHook(() => useSession(), { wrapper });

    await waitFor(() => {
      expect(result.current.state).toEqual({ status: 'anonymous' });
    });
    render(<SessionProvider>contenido</SessionProvider>);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refreshes only once at startup, also in React strict mode', async () => {
    refresh.mockResolvedValue(authenticated);

    const { result } = renderHook(() => useSession(), { wrapper: strictWrapper });

    await waitFor(() => {
      expect(result.current.state.status).toBe('authenticated');
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('keeps the access token in memory only', async () => {
    refresh.mockResolvedValue(authenticated);

    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => {
      expect(result.current.state.status).toBe('authenticated');
    });

    expect(window.localStorage).toHaveLength(0);
    expect(window.sessionStorage).toHaveLength(0);
    expect(document.cookie).not.toContain('signed.access.token');
  });

  describe('refresh()', () => {
    it('renews the session on demand and returns the outcome', async () => {
      refresh.mockResolvedValueOnce({ status: 'invalidSession' });
      const { result } = renderHook(() => useSession(), { wrapper });
      await waitFor(() => {
        expect(result.current.state.status).toBe('anonymous');
      });

      refresh.mockResolvedValueOnce(authenticated);
      let outcome: RefreshOutcome | undefined;
      await act(async () => {
        outcome = await result.current.refresh();
      });

      expect(outcome).toEqual(authenticated);
      expect(result.current.state).toEqual({ status: 'authenticated', data: sessionData });
    });

    it('becomes anonymous when the renewal fails', async () => {
      refresh.mockResolvedValueOnce(authenticated);
      const { result } = renderHook(() => useSession(), { wrapper });
      await waitFor(() => {
        expect(result.current.state.status).toBe('authenticated');
      });

      refresh.mockResolvedValueOnce({ status: 'invalidSession' });
      await act(async () => {
        await result.current.refresh();
      });

      expect(result.current.state).toEqual({ status: 'anonymous' });
    });

    it('ignores the result of the startup refresh when a newer one finished first', async () => {
      let resolveStartup: (outcome: RefreshOutcome) => void = () => undefined;
      refresh.mockReturnValueOnce(
        new Promise<RefreshOutcome>((resolve) => {
          resolveStartup = resolve;
        }),
      );
      const { result } = renderHook(() => useSession(), { wrapper });

      refresh.mockResolvedValueOnce(authenticated);
      await act(async () => {
        await result.current.refresh();
      });
      await act(async () => {
        resolveStartup({ status: 'invalidSession' });
        await Promise.resolve();
      });

      expect(result.current.state).toEqual({ status: 'authenticated', data: sessionData });
    });
  });

  describe('logout()', () => {
    let logout: MockInstance<typeof sessionService.logout>;

    beforeEach(() => {
      FakeBroadcastChannel.instances = [];
      vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
      logout = vi.spyOn(sessionService, 'logout');
    });

    afterEach(() => {
      logout.mockRestore();
      vi.unstubAllGlobals();
    });

    /** Proveedor con la sesión iniciada. */
    async function authenticatedSession() {
      refresh.mockResolvedValue(authenticated);
      const hook = renderHook(() => useSession(), { wrapper });
      await waitFor(() => {
        expect(hook.result.current.state.status).toBe('authenticated');
      });
      return hook;
    }

    /** Canal de otra pestaña del mismo navegador. */
    function otherTab() {
      return new FakeBroadcastChannel('calendarschool:session');
    }

    it('becomes anonymous when the backend confirms the logout, and returns the outcome', async () => {
      logout.mockResolvedValue({ status: 'loggedOut' });
      const { result } = await authenticatedSession();

      let outcome: LogoutOutcome | undefined;
      await act(async () => {
        outcome = await result.current.logout();
      });

      expect(outcome).toEqual({ status: 'loggedOut' });
      expect(result.current.state).toEqual({ status: 'anonymous' });
    });

    it('keeps the session open when the logout is not confirmed', async () => {
      logout.mockResolvedValue({ status: 'unavailable' });
      const { result } = await authenticatedSession();

      let outcome: LogoutOutcome | undefined;
      await act(async () => {
        outcome = await result.current.logout();
      });

      expect(outcome).toEqual({ status: 'unavailable' });
      expect(result.current.state).toEqual({ status: 'authenticated', data: sessionData });
    });

    it('does not warn the other tabs when the logout is not confirmed', async () => {
      logout.mockResolvedValue({ status: 'unavailable' });
      const { result } = await authenticatedSession();
      const message = vi.fn();
      otherTab().onmessage = message;

      await act(async () => {
        await result.current.logout();
      });

      expect(message).not.toHaveBeenCalled();
    });

    it('warns the other tabs on calendarschool:session once the logout is confirmed', async () => {
      logout.mockResolvedValue({ status: 'loggedOut' });
      const { result } = await authenticatedSession();
      const message = vi.fn();
      otherTab().onmessage = message;

      await act(async () => {
        await result.current.logout();
      });

      expect(message).toHaveBeenCalledOnce();
      expect((message.mock.calls[0]?.[0] as MessageEvent).data).toEqual({ type: 'logout' });
    });

    it('ignores a renewal in flight that answers after the logout', async () => {
      const { result } = await authenticatedSession();
      let resolveRenewal: (outcome: RefreshOutcome) => void = () => undefined;
      refresh.mockReturnValueOnce(
        new Promise<RefreshOutcome>((resolve) => {
          resolveRenewal = resolve;
        }),
      );
      logout.mockResolvedValue({ status: 'loggedOut' });

      let renewal: Promise<RefreshOutcome> = Promise.resolve({ status: 'unexpected' });
      act(() => {
        renewal = result.current.refresh();
      });
      await act(async () => {
        await result.current.logout();
      });
      await act(async () => {
        resolveRenewal(authenticated);
        await renewal;
      });

      expect(result.current.state).toEqual({ status: 'anonymous' });
    });

    it('becomes anonymous without calling the backend when another tab warns of a logout', async () => {
      const { result } = await authenticatedSession();

      act(() => {
        otherTab().postMessage({ type: 'logout' });
      });

      expect(result.current.state).toEqual({ status: 'anonymous' });
      expect(logout).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledOnce();
    });

    it('ignores a message of another shape', async () => {
      const { result } = await authenticatedSession();
      const tab = otherTab();

      act(() => {
        tab.postMessage({ type: 'something-else' });
        tab.postMessage('logout');
        tab.postMessage(null);
      });

      expect(result.current.state.status).toBe('authenticated');
    });

    it('ignores a renewal in flight that answers after a logout warned by another tab', async () => {
      let resolveStartup: (outcome: RefreshOutcome) => void = () => undefined;
      refresh.mockReturnValueOnce(
        new Promise<RefreshOutcome>((resolve) => {
          resolveStartup = resolve;
        }),
      );
      const { result } = renderHook(() => useSession(), { wrapper });

      act(() => {
        otherTab().postMessage({ type: 'logout' });
      });
      await act(async () => {
        resolveStartup(authenticated);
        await Promise.resolve();
      });

      expect(result.current.state).toEqual({ status: 'anonymous' });
    });

    it('closes its channel when it unmounts', () => {
      refresh.mockResolvedValue(authenticated);
      const { unmount } = renderHook(() => useSession(), { wrapper });
      const ownChannels = [...FakeBroadcastChannel.instances];
      expect(ownChannels).not.toHaveLength(0);

      unmount();

      expect(ownChannels.every((channel) => channel.closed)).toBe(true);
    });

    it('logs out without errors when the browser has no BroadcastChannel', async () => {
      vi.stubGlobal('BroadcastChannel', undefined);
      logout.mockResolvedValue({ status: 'loggedOut' });
      const { result } = await authenticatedSession();

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.state).toEqual({ status: 'anonymous' });
    });
  });

  describe('authorizedFetch', () => {
    const renewedData: SessionData = {
      ...sessionData,
      session: { accessToken: 'renewed.access.token', expiresIn: 900 },
    };
    let fetchMock: MockInstance<typeof fetch>;

    const invalidSession = () =>
      new Response(
        JSON.stringify({ success: false, error: { code: 'INVALID_SESSION', message: 'x' } }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    const ok = () => new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });

    function authorizationOf(call: number): string | null {
      return new Headers(fetchMock.mock.calls[call]?.[1]?.headers).get('Authorization');
    }

    beforeEach(() => {
      fetchMock = vi.spyOn(globalThis, 'fetch');
    });

    afterEach(() => {
      fetchMock.mockRestore();
    });

    async function authenticatedSession() {
      refresh.mockResolvedValueOnce(authenticated);
      const hook = renderHook(() => useSession(), { wrapper });
      await waitFor(() => {
        expect(hook.result.current.state.status).toBe('authenticated');
      });
      return hook;
    }

    it('sends the access token that the session keeps in memory', async () => {
      fetchMock.mockResolvedValue(ok());
      const { result } = await authenticatedSession();

      await act(async () => {
        await result.current.authorizedFetch('/api/users');
      });

      expect(authorizationOf(0)).toBe('Bearer signed.access.token');
    });

    it('renews the session through refresh() on 401 and repeats the request with the new token', async () => {
      fetchMock.mockResolvedValueOnce(invalidSession()).mockResolvedValueOnce(ok());
      const { result } = await authenticatedSession();
      refresh.mockResolvedValueOnce({ status: 'authenticated', data: renewedData });

      let status = 0;
      await act(async () => {
        status = (await result.current.authorizedFetch('/api/users')).status;
      });

      expect(status).toBe(200);
      expect(authorizationOf(1)).toBe('Bearer renewed.access.token');
      expect(result.current.state).toEqual({ status: 'authenticated', data: renewedData });
    });

    it('shares one renewal between requests that fail at the same time', async () => {
      fetchMock.mockImplementation((_input, init) =>
        Promise.resolve(
          new Headers(init?.headers).get('Authorization') === 'Bearer signed.access.token'
            ? invalidSession()
            : ok(),
        ),
      );
      const { result } = await authenticatedSession();
      refresh.mockResolvedValueOnce({ status: 'authenticated', data: renewedData });

      await act(async () => {
        await Promise.all([
          result.current.authorizedFetch('/api/users'),
          result.current.authorizedFetch('/api/users'),
        ]);
      });

      // Una renovación en el arranque y una sola para las dos peticiones.
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('becomes anonymous and returns the 401 when the renewal finds no session', async () => {
      fetchMock.mockResolvedValue(invalidSession());
      const { result } = await authenticatedSession();
      refresh.mockResolvedValueOnce({ status: 'invalidSession' });

      let status = 0;
      await act(async () => {
        status = (await result.current.authorizedFetch('/api/users')).status;
      });

      expect(status).toBe(401);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(result.current.state).toEqual({ status: 'anonymous' });
    });

    it('stops sending the token once the session is closed', async () => {
      FakeBroadcastChannel.instances = [];
      vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
      const logout = vi.spyOn(sessionService, 'logout').mockResolvedValue({ status: 'loggedOut' });
      fetchMock.mockResolvedValue(ok());
      const { result } = await authenticatedSession();

      await act(async () => {
        await result.current.logout();
      });
      await act(async () => {
        await result.current.authorizedFetch('/api/users');
      });

      expect(authorizationOf(0)).toBeNull();
      logout.mockRestore();
      vi.unstubAllGlobals();
    });
  });

  it('fails clearly when useSession is used outside the provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);

    error.mockRestore();
  });
});
