import { act, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { sessionService, type RefreshOutcome, type SessionData } from '../services/sessionService';
import { SessionProvider, useSession } from '../session/SessionProvider';
import { AuthenticatedLayout } from './AuthenticatedLayout';

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

/** Fuerza una renovación desde fuera, como la que dejaría la sesión sin validez con la página abierta. */
function RenewButton() {
  const { refresh } = useSession();
  return (
    <button type="button" onClick={() => void refresh()}>
      renovar
    </button>
  );
}

function renderLayoutAt(path = '/protected') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <RenewButton />
        <Routes>
          <Route element={<AuthenticatedLayout />}>
            <Route
              path="/protected"
              element={<main data-testid="protected-page">contenido</main>}
            />
          </Route>
          <Route path="/login" element={<div data-testid="login-page" />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('AuthenticatedLayout', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
  });

  afterEach(() => {
    refresh.mockRestore();
  });

  it('shows an accessible loading indicator, and neither the page nor a redirect, while the session resolves', () => {
    refresh.mockReturnValue(new Promise<RefreshOutcome>(() => undefined));

    renderLayoutAt();

    expect(screen.getByRole('status')).toHaveTextContent(es.session.loading);
    expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it.each<[string, RefreshOutcome]>([
    ['there is no valid session', { status: 'invalidSession' }],
    ['the session cannot be checked', { status: 'unexpected' }],
  ])('redirects to the login page when %s', async (_case, outcome) => {
    refresh.mockResolvedValue(outcome);

    renderLayoutAt();

    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
  });

  it('shows the header and the page with a session', async () => {
    refresh.mockResolvedValue(authenticated);

    renderLayoutAt();

    expect(await screen.findByTestId('protected-page')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('CEIP Lluís Vives');
    expect(screen.getByRole('button', { name: es.header.logout })).toBeInTheDocument();
  });

  it('goes to the login page when the session is lost while the page is open', async () => {
    refresh.mockResolvedValueOnce(authenticated);
    renderLayoutAt();
    await screen.findByTestId('protected-page');

    refresh.mockResolvedValueOnce({ status: 'invalidSession' });
    await act(async () => {
      screen.getByRole('button', { name: 'renovar' }).click();
      await Promise.resolve();
    });

    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('has no accessibility violations while loading and with a session', async () => {
    const rules = { rules: { 'color-contrast': { enabled: false } } };
    refresh.mockReturnValue(new Promise<RefreshOutcome>(() => undefined));
    const loading = renderLayoutAt();
    const whileLoading = await axe.run(loading.container, rules);
    loading.unmount();

    refresh.mockResolvedValue(authenticated);
    const { container } = renderLayoutAt();
    await screen.findByTestId('protected-page');
    const withSession = await axe.run(container, rules);

    expect(whileLoading.violations.map(({ id }) => id)).toEqual([]);
    expect(withSession.violations.map(({ id }) => id)).toEqual([]);
  });
});
