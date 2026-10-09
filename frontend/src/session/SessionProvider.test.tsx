import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { sessionService, type RefreshOutcome, type SessionData } from '../services/sessionService';
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

  it('fails clearly when useSession is used outside the provider', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);

    error.mockRestore();
  });
});
