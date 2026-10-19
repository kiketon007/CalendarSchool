import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import {
  sessionService,
  type LogoutOutcome,
  type RefreshOutcome,
  type SessionData,
} from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { AppHeader } from './AppHeader';

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

/** Muestra la ruta actual para comprobar adónde navega la cabecera. */
function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderHeaderAt(path = '/onboarding') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <AppHeader />
        <CurrentPath />
        <Routes>
          <Route path="*" element={<main>contenido</main>} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('AppHeader', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let logout: MockInstance<typeof sessionService.logout>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    logout = vi.spyOn(sessionService, 'logout');
  });

  afterEach(() => {
    refresh.mockRestore();
    logout.mockRestore();
  });

  describe('navigation', () => {
    const memberSession: RefreshOutcome = {
      status: 'authenticated',
      data: { ...sessionData, user: { ...sessionData.user, role: 'MEMBER' } },
    };

    it('shows the Courses link to an administrator and to a member, before the Users link', async () => {
      refresh.mockResolvedValue(authenticated);
      const admin = renderHeaderAt();
      const adminNavigation = await screen.findByRole('navigation', {
        name: es.header.navigation,
      });
      expect(
        within(adminNavigation)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual([es.header.courses, es.header.users]);
      expect(
        within(adminNavigation).getByRole('link', { name: es.header.courses }),
      ).toHaveAttribute('href', '/cursos');
      admin.unmount();

      refresh.mockResolvedValue(memberSession);
      renderHeaderAt();
      const memberNavigation = await screen.findByRole('navigation', {
        name: es.header.navigation,
      });
      expect(
        within(memberNavigation)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual([es.header.courses]);
    });

    it.each(['/cursos', '/cursos/nuevo'])(
      'marks the Courses link as the current page on %s',
      async (path) => {
        refresh.mockResolvedValue(authenticated);

        renderHeaderAt(path);

        expect(await screen.findByRole('link', { name: es.header.courses })).toHaveAttribute(
          'aria-current',
          'page',
        );
        expect(screen.getByRole('link', { name: es.header.users })).not.toHaveAttribute(
          'aria-current',
        );
      },
    );

    it('does not mark the Courses link as the current page on /onboarding', async () => {
      refresh.mockResolvedValue(authenticated);

      renderHeaderAt('/onboarding');

      expect(await screen.findByRole('link', { name: es.header.courses })).not.toHaveAttribute(
        'aria-current',
      );
    });

    it('shows the Users link to an administrator, inside a labelled navigation', async () => {
      refresh.mockResolvedValue(authenticated);

      renderHeaderAt();

      const navigation = await screen.findByRole('navigation', { name: es.header.navigation });
      const link = within(navigation).getByRole('link', { name: es.header.users });
      expect(link).toHaveAttribute('href', '/usuarios');
    });

    it('does not show the Users link to a member', async () => {
      refresh.mockResolvedValue(memberSession);

      renderHeaderAt();

      await screen.findByRole('banner');
      expect(screen.queryByRole('link', { name: es.header.users })).not.toBeInTheDocument();
    });

    it('marks the Users link as the current page when it is open', async () => {
      refresh.mockResolvedValue(authenticated);

      renderHeaderAt('/usuarios');

      expect(await screen.findByRole('link', { name: es.header.users })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });
  });

  describe('application name', () => {
    it('is a link to the home page, also for a member', async () => {
      refresh.mockResolvedValue({
        status: 'authenticated',
        data: { ...sessionData, user: { ...sessionData.user, role: 'MEMBER' } },
      });

      renderHeaderAt('/usuarios');

      expect(await screen.findByRole('link', { name: es.app.name })).toHaveAttribute(
        'href',
        '/onboarding',
      );
    });

    it('is marked as the current page on /onboarding', async () => {
      refresh.mockResolvedValue(authenticated);

      renderHeaderAt('/onboarding');

      expect(await screen.findByRole('link', { name: es.app.name })).toHaveAttribute(
        'aria-current',
        'page',
      );
    });

    it('is not marked as the current page on another route', async () => {
      refresh.mockResolvedValue(authenticated);

      renderHeaderAt('/usuarios');

      expect(await screen.findByRole('link', { name: es.app.name })).not.toHaveAttribute(
        'aria-current',
      );
    });

    it('takes the user back to /onboarding', async () => {
      refresh.mockResolvedValue(authenticated);
      renderHeaderAt('/usuarios');

      await userEvent.click(await screen.findByRole('link', { name: es.app.name }));

      expect(screen.getByTestId('path')).toHaveTextContent('/onboarding');
    });
  });

  describe('visibility', () => {
    it('is not shown while the session is loading', () => {
      refresh.mockReturnValue(new Promise<RefreshOutcome>(() => undefined));

      renderHeaderAt();

      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    });

    it('is not shown without a session', async () => {
      refresh.mockResolvedValue({ status: 'invalidSession' });

      renderHeaderAt('/login');

      await waitFor(() => {
        expect(refresh).toHaveBeenCalled();
      });
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: es.header.logout })).not.toBeInTheDocument();
    });

    it('shows the application, the user, the school and the logout button with a session', async () => {
      refresh.mockResolvedValue(authenticated);

      renderHeaderAt();

      const header = await screen.findByRole('banner');
      expect(header).toHaveTextContent(es.app.name);
      expect(header).toHaveTextContent('José María García-López');
      expect(header).toHaveTextContent('CEIP Lluís Vives');
      expect(screen.getByRole('button', { name: es.header.logout })).toBeEnabled();
    });
  });

  describe('logging out', () => {
    it('closes the session without asking for confirmation and goes to /login replacing the history', async () => {
      refresh.mockResolvedValue(authenticated);
      logout.mockResolvedValue({ status: 'loggedOut' });
      renderHeaderAt();

      await userEvent.click(await screen.findByRole('button', { name: es.header.logout }));

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent('/login');
      });
      expect(logout).toHaveBeenCalledOnce();
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('sends a single request when the button is pressed twice in a row and disables it meanwhile', async () => {
      refresh.mockResolvedValue(authenticated);
      let finish: (outcome: LogoutOutcome) => void = () => undefined;
      logout.mockReturnValue(
        new Promise<LogoutOutcome>((resolve) => {
          finish = resolve;
        }),
      );
      renderHeaderAt();
      const button = await screen.findByRole('button', { name: es.header.logout });

      await userEvent.dblClick(button);

      expect(logout).toHaveBeenCalledOnce();
      expect(button).toBeDisabled();
      finish({ status: 'loggedOut' });
      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent('/login');
      });
    });

    it('keeps the session and the page, and shows an alert, when the logout is not confirmed', async () => {
      refresh.mockResolvedValue(authenticated);
      logout.mockResolvedValue({ status: 'unavailable' });
      renderHeaderAt();

      await userEvent.click(await screen.findByRole('button', { name: es.header.logout }));

      expect(await screen.findByRole('alert')).toHaveTextContent(es.header.logoutError);
      expect(screen.getByTestId('path')).toHaveTextContent('/onboarding');
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: es.header.logout })).toBeEnabled();
    });

    it('lets the user try again after a failure and clears the alert', async () => {
      refresh.mockResolvedValue(authenticated);
      logout
        .mockResolvedValueOnce({ status: 'unavailable' })
        .mockResolvedValueOnce({ status: 'loggedOut' });
      renderHeaderAt();
      await userEvent.click(await screen.findByRole('button', { name: es.header.logout }));
      await screen.findByRole('alert');

      await userEvent.click(screen.getByRole('button', { name: es.header.logout }));

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent('/login');
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(logout).toHaveBeenCalledTimes(2);
    });
  });

  it('has no WCAG 2.1 AA violations, with the alert shown or not', async () => {
    refresh.mockResolvedValue(authenticated);
    logout.mockResolvedValue({ status: 'unavailable' });
    const { container } = renderHeaderAt();
    await screen.findByRole('banner');
    const rules = {
      runOnly: { type: 'tag' as const, values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules: { 'color-contrast': { enabled: false } },
    };

    const before = await axe.run(container, rules);
    await userEvent.click(screen.getByRole('button', { name: es.header.logout }));
    await screen.findByRole('alert');
    const after = await axe.run(container, rules);

    expect(before.violations.map(({ id }) => id)).toEqual([]);
    expect(after.violations.map(({ id }) => id)).toEqual([]);
  });

  it('is operable with the keyboard', async () => {
    refresh.mockResolvedValue(authenticated);
    logout.mockResolvedValue({ status: 'loggedOut' });
    renderHeaderAt();
    const button = await screen.findByRole('button', { name: es.header.logout });

    await userEvent.tab();
    expect(screen.getByRole('link', { name: es.app.name })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: es.header.courses })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('link', { name: es.header.users })).toHaveFocus();
    await userEvent.tab();
    expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('/login');
    });
  });
});
