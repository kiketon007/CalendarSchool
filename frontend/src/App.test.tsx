import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { App } from './App';
import './i18n/i18n';
import { registrationService } from './services/registrationService';
import { sessionService, type SessionData } from './services/sessionService';
import { SessionProvider } from './session/SessionProvider';

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

/** `App` dentro del router y del proveedor de sesión, como lo monta `main.tsx`. */
function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('App', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh').mockResolvedValue({ status: 'invalidSession' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the home page at the root path without redirecting', async () => {
    renderApp('/');

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  describe('onboarding route', () => {
    it('renders the provisional onboarding page at /onboarding with an authenticated session', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp('/onboarding');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    });

    it('redirects to the registration page at /onboarding without a session', async () => {
      vi.spyOn(registrationService, 'listMunicipalities').mockResolvedValue([]);

      renderApp('/onboarding');

      expect(await screen.findByTestId('register-page')).toBeInTheDocument();
    });
  });

  describe('registration route', () => {
    beforeEach(() => {
      vi.spyOn(registrationService, 'listMunicipalities').mockResolvedValue([]);
    });

    it('renders the registration page at /registro', async () => {
      renderApp('/registro');

      expect(await screen.findByTestId('register-page')).toBeInTheDocument();
      expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    });
  });
});
