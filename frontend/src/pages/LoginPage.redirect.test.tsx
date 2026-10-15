import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { sessionService, type RefreshOutcome, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { LoginPage } from './LoginPage';

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

describe('LoginPage and the session', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderAtLogin() {
    return render(
      <MemoryRouter initialEntries={['/login']}>
        <SessionProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/onboarding" element={<div data-testid="onboarding-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  it('goes to onboarding when there is already a session, without showing the form', async () => {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

    renderAtLogin();

    expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  it('shows an accessible loading indicator, and neither the form nor a redirect, while the session resolves', () => {
    refresh.mockReturnValue(new Promise<RefreshOutcome>(() => undefined));

    renderAtLogin();

    expect(screen.getByRole('status')).toHaveTextContent(es.login.loading);
    expect(screen.queryByLabelText(es.login.fields.email.label)).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
  });

  it.each<[string, RefreshOutcome]>([
    ['there is no valid session', { status: 'invalidSession' }],
    ['the session cannot be checked', { status: 'unexpected' }],
  ])('shows the form when %s', async (_case, outcome) => {
    refresh.mockResolvedValue(outcome);

    renderAtLogin();

    expect(await screen.findByLabelText(es.login.fields.email.label)).toBeInTheDocument();
    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
  });

  it('does not show the loading indicator once the form is on screen', async () => {
    refresh.mockResolvedValue({ status: 'invalidSession' });

    renderAtLogin();

    await screen.findByLabelText(es.login.fields.email.label);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
