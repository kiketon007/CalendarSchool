import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { App } from './App';
import es from './i18n/es.json';
import './i18n/i18n';
import { registrationService } from './services/registrationService';
import { sessionService, type SessionData } from './services/sessionService';
import { usersService } from './services/usersService';
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
    it('renders the onboarding home page at /onboarding with an authenticated session', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp('/onboarding');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    });

    it('redirects to the login page at /onboarding without a session', async () => {
      renderApp('/onboarding');

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
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

  describe('login route', () => {
    it('renders the login page at /login without a session and without redirecting', async () => {
      renderApp('/login');

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
      expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    });
  });

  describe('logging out', () => {
    /** Simula volver a `/onboarding` (el botón «Atrás» o un enlace guardado) tras cerrar sesión. */
    function GoToOnboarding() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => void navigate('/onboarding')}>
          volver a onboarding
        </button>
      );
    }

    function renderAppWithBackButton(path: string) {
      return render(
        <MemoryRouter initialEntries={[path]}>
          <SessionProvider>
            <App />
            <GoToOnboarding />
          </SessionProvider>
        </MemoryRouter>,
      );
    }

    beforeEach(() => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      vi.spyOn(sessionService, 'logout').mockResolvedValue({ status: 'loggedOut' });
    });

    it('goes from /onboarding to the login page and removes the header', async () => {
      renderApp('/onboarding');

      await userEvent.click(await screen.findByRole('button', { name: es.header.logout }));

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    });

    it('sends the user back to the login page when they return to /onboarding afterwards', async () => {
      renderAppWithBackButton('/onboarding');
      await userEvent.click(await screen.findByRole('button', { name: es.header.logout }));
      await screen.findByTestId('login-page');

      await userEvent.click(screen.getByRole('button', { name: 'volver a onboarding' }));

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
    });

    it('does not show the header on a public page, even while there is a session', async () => {
      renderApp('/privacidad');

      expect(await screen.findByTestId('privacy-policy-page')).toBeInTheDocument();
      await waitFor(() => {
        expect(refresh).toHaveBeenCalled();
      });
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    });
  });

  describe('users route', () => {
    beforeEach(() => {
      vi.spyOn(usersService, 'list').mockResolvedValue({ status: 'loaded', users: [] });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it('renders the users page at /usuarios for an administrator, inside the layout', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp('/usuarios');

      expect(await screen.findByTestId('users-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('sends a member who opens /usuarios to /onboarding without any message', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });

      renderApp('/usuarios');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(screen.queryByTestId('users-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('sends a visitor without a session who opens /usuarios to the login page', async () => {
      renderApp('/usuarios');

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('users-page')).not.toBeInTheDocument();
    });

    it('links to /usuarios from the navigation of an administrator and not of a member', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      const admin = renderApp('/onboarding');
      await userEvent.click(await screen.findByRole('link', { name: es.header.users }));
      expect(await screen.findByTestId('users-page')).toBeInTheDocument();
      admin.unmount();

      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      renderApp('/onboarding');
      await screen.findByTestId('onboarding-page');
      expect(screen.queryByRole('link', { name: es.header.users })).not.toBeInTheDocument();
    });
  });

  describe('privacy policy route', () => {
    it('renders the privacy policy at /privacidad without a session and without redirecting', async () => {
      renderApp('/privacidad');

      expect(await screen.findByTestId('privacy-policy-page')).toBeInTheDocument();
      await waitFor(() => {
        expect(refresh).toHaveBeenCalled();
      });
      expect(screen.getByTestId('privacy-policy-page')).toBeInTheDocument();
      expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
    });
  });
});
