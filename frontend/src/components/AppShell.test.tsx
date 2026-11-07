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
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { AppShell } from './AppShell';

const DESKTOP = 1280;
const MOBILE = 360;

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
const memberSession: RefreshOutcome = {
  status: 'authenticated',
  data: { ...sessionData, user: { ...sessionData.user, role: 'MEMBER' } },
};

const brandName = `${es.shell.brandStart}${es.shell.brandEnd}`;
const userMenuName = 'Menú de José María García-López';

/** Muestra la ruta actual para comprobar adónde navega el marco. */
function CurrentPath() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

/** Reglas automáticas de WCAG 2.1 nivel AA. El contraste lo mide el navegador, no jsdom. */
async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
}

describe('AppShell', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let logout: MockInstance<typeof sessionService.logout>;
  let media: MatchMediaControl;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    logout = vi.spyOn(sessionService, 'logout');
    media = installMatchMedia(DESKTOP);
  });

  afterEach(() => {
    refresh.mockRestore();
    logout.mockRestore();
    media.restore();
  });

  function renderShellAt(path = '/onboarding', width = DESKTOP) {
    media.setWidth(width);
    return render(
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <AppShell>
            <Routes>
              <Route path="*" element={<main>contenido</main>} />
            </Routes>
          </AppShell>
          <CurrentPath />
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  const navigation = () => screen.findByRole('navigation', { name: es.header.navigation });
  const openMenuButton = () => screen.getByRole('button', { name: es.shell.openMenu });
  const userMenuToggle = () => screen.getByRole('button', { name: userMenuName });
  const currentLinks = (container: HTMLElement) =>
    [...container.querySelectorAll('[aria-current="page"]')].map((link) => link.textContent);

  async function logOutFromMenu() {
    await userEvent.click(userMenuToggle());
    await userEvent.click(screen.getByRole('button', { name: es.header.logout }));
  }

  describe.each([DESKTOP, MOBILE])('navigation at %i px', (width) => {
    it('lists the eight workspace links in order, in a labelled navigation', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/onboarding', width);

      const links = within(await navigation()).getByRole('list', { name: es.shell.workspace });

      expect(
        within(links)
          .getAllByRole('link')
          .map((link) => [link.textContent, link.getAttribute('href')]),
      ).toEqual([
        [es.shell.home, '/onboarding'],
        [es.header.courses, '/cursos'],
        [es.header.professors, '/profesores'],
        [es.header.students, '/alumnos'],
        [es.header.calendars, '/calendarios'],
        [es.header.subjects, '/asignaturas'],
        [es.header.constraints, '/reglas'],
        [es.header.schedule, '/horarios'],
      ]);
    });

    it('shows the Administration group with Users to an administrator', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/onboarding', width);

      const group = within(await navigation()).getByRole('list', {
        name: es.shell.administration,
      });

      expect(within(group).getByRole('link', { name: es.header.users })).toHaveAttribute(
        'href',
        '/usuarios',
      );
    });

    it('does not show the Administration group nor Users to a member', async () => {
      refresh.mockResolvedValue(memberSession);
      renderShellAt('/onboarding', width);

      await navigation();

      expect(screen.queryByText(es.shell.administration)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: es.header.users })).not.toBeInTheDocument();
    });

    it.each([
      ['/onboarding', es.shell.home],
      ['/cursos', es.header.courses],
      ['/cursos/0192f5a0-0000-7000-8000-0000000000c1/carga', es.header.courses],
      ['/profesores/nuevo', es.header.professors],
      ['/alumnos/0192f5a0-0000-7000-8000-0000000000d1/editar', es.header.students],
      ['/calendarios', es.header.calendars],
      ['/asignaturas/nueva', es.header.subjects],
      ['/reglas', es.header.constraints],
      ['/horarios/borrador', es.header.schedule],
      ['/usuarios', es.header.users],
    ])('marks only one link as the current page on %s', async (path, label) => {
      refresh.mockResolvedValue(authenticated);
      const { container } = renderShellAt(path, width);
      await navigation();

      expect(currentLinks(container)).toEqual([label]);
    });

    it('marks no link as the current page on a route the navigation does not know', async () => {
      refresh.mockResolvedValue(authenticated);
      const { container } = renderShellAt('/privacidad', width);
      await navigation();

      expect(currentLinks(container)).toEqual([]);
    });
  });

  describe('brand', () => {
    it('is a link to the home page, also for a member', async () => {
      refresh.mockResolvedValue(memberSession);
      renderShellAt('/usuarios');

      expect(await screen.findByRole('link', { name: brandName })).toHaveAttribute(
        'href',
        '/onboarding',
      );
    });

    it('takes the user back to /onboarding', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/reglas');

      await userEvent.click(await screen.findByRole('link', { name: brandName }));

      expect(screen.getByTestId('path')).toHaveTextContent('/onboarding');
    });

    it('is never marked as the current page', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/onboarding');

      expect(await screen.findByRole('link', { name: brandName })).not.toHaveAttribute(
        'aria-current',
      );
    });
  });

  describe('panel below lg', () => {
    it('opens with the focus inside, named Menu', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/cursos', MOBILE);
      await navigation();

      await userEvent.click(openMenuButton());

      const dialog = await screen.findByRole('dialog', { name: es.shell.menu });
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
      expect(within(dialog).getByRole('link', { name: es.header.professors })).toBeVisible();
    });

    it('closes with Escape and gives the focus back to the open button', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/cursos', MOBILE);
      await navigation();
      await userEvent.click(openMenuButton());
      await screen.findByRole('dialog');

      await userEvent.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(openMenuButton()).toHaveFocus();
    });

    it('closes with the close button and gives the focus back to the open button', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/cursos', MOBILE);
      await navigation();
      await userEvent.click(openMenuButton());
      const dialog = await screen.findByRole('dialog');

      await userEvent.click(within(dialog).getByRole('button', { name: es.shell.closeMenu }));

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      expect(openMenuButton()).toHaveFocus();
    });

    it('closes when the user clicks outside of it', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/cursos', MOBILE);
      await navigation();
      await userEvent.click(openMenuButton());
      await screen.findByRole('dialog');

      const backdrop = document.querySelector('.offcanvas-backdrop');
      expect(backdrop).not.toBeNull();
      await userEvent.click(backdrop as Element);

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('navigates and closes when a link is chosen', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/cursos', MOBILE);
      await navigation();
      await userEvent.click(openMenuButton());
      const dialog = await screen.findByRole('dialog');

      await userEvent.click(within(dialog).getByRole('link', { name: es.header.professors }));

      expect(screen.getByTestId('path')).toHaveTextContent('/profesores');
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('has the open button hidden from lg up by its class, and the close button only in the panel', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/cursos', DESKTOP);
      await navigation();

      expect(openMenuButton()).toHaveClass('d-lg-none');
      expect(screen.getByRole('button', { name: es.shell.closeMenu })).toHaveClass('d-lg-none');
    });
  });

  describe('skip link', () => {
    it('is the first focusable element and moves the focus to the content without changing the address', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/cursos');
      await navigation();

      await userEvent.tab();
      const skip = screen.getByRole('link', { name: es.shell.skipToContent });
      expect(skip).toHaveFocus();

      await userEvent.keyboard('{Enter}');

      const content = document.getElementById('contenido');
      expect(content).toHaveFocus();
      expect(content).toHaveAttribute('tabindex', '-1');
      expect(screen.getByTestId('path')).toHaveTextContent('/cursos');
      expect(window.location.hash).toBe('');
    });
  });

  describe('content', () => {
    it('puts the page inside the content container, with a single main', async () => {
      refresh.mockResolvedValue(authenticated);
      renderShellAt('/cursos');
      await navigation();

      const content = document.getElementById('contenido');
      expect(content).toContainElement(screen.getByRole('main'));
      expect(screen.getAllByRole('main')).toHaveLength(1);
    });
  });

  describe('visibility', () => {
    it('shows no frame while the session is loading', () => {
      refresh.mockReturnValue(new Promise<RefreshOutcome>(() => undefined));

      renderShellAt();

      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: es.shell.skipToContent })).not.toBeInTheDocument();
    });

    it('shows no frame without a session', async () => {
      refresh.mockResolvedValue({ status: 'invalidSession' });

      renderShellAt('/login');

      await waitFor(() => {
        expect(refresh).toHaveBeenCalled();
      });
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: userMenuName })).not.toBeInTheDocument();
    });

    it('shows the frame, the user and the school with a session', async () => {
      refresh.mockResolvedValue(authenticated);

      renderShellAt();

      const header = await screen.findByRole('banner');
      expect(header).toHaveTextContent('José María García-López');
      expect(header).toHaveTextContent(es.shell.role.ADMIN);
      await userEvent.click(userMenuToggle());
      expect(header).toHaveTextContent('CEIP Lluís Vives');
    });
  });

  describe('logging out', () => {
    it('closes the session without asking for confirmation and goes to /login replacing the history', async () => {
      refresh.mockResolvedValue(authenticated);
      logout.mockResolvedValue({ status: 'loggedOut' });
      renderShellAt();
      await screen.findByRole('banner');

      await logOutFromMenu();

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent('/login');
      });
      expect(logout).toHaveBeenCalledOnce();
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('sends a single request when the option is pressed twice in a row and disables it meanwhile', async () => {
      refresh.mockResolvedValue(authenticated);
      let finish: (outcome: LogoutOutcome) => void = () => undefined;
      logout.mockReturnValue(
        new Promise<LogoutOutcome>((resolve) => {
          finish = resolve;
        }),
      );
      renderShellAt();
      await screen.findByRole('banner');
      await userEvent.click(userMenuToggle());
      const option = screen.getByRole('button', { name: es.header.logout });

      await userEvent.dblClick(option);

      expect(logout).toHaveBeenCalledOnce();
      await userEvent.click(userMenuToggle());
      expect(screen.getByRole('button', { name: es.header.logout })).toHaveAttribute(
        'aria-disabled',
        'true',
      );
      finish({ status: 'loggedOut' });
      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent('/login');
      });
    });

    it('keeps the session and the page, and shows an alert under the header, when the logout is not confirmed', async () => {
      refresh.mockResolvedValue(authenticated);
      logout.mockResolvedValue({ status: 'unavailable' });
      renderShellAt();
      await screen.findByRole('banner');

      await logOutFromMenu();

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(es.header.logoutError);
      expect(screen.getByRole('banner')).not.toContainElement(alert);
      expect(screen.getByTestId('path')).toHaveTextContent('/onboarding');
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('lets the user try again after a failure and clears the alert', async () => {
      refresh.mockResolvedValue(authenticated);
      logout
        .mockResolvedValueOnce({ status: 'unavailable' })
        .mockResolvedValueOnce({ status: 'loggedOut' });
      renderShellAt();
      await screen.findByRole('banner');
      await logOutFromMenu();
      await screen.findByRole('alert');

      await logOutFromMenu();

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent('/login');
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(logout).toHaveBeenCalledTimes(2);
    });
  });

  describe.each([DESKTOP, MOBILE])('accessibility at %i px', (width) => {
    it('has no WCAG 2.1 AA violations with the frame closed', async () => {
      refresh.mockResolvedValue(authenticated);
      const { container } = renderShellAt('/cursos', width);
      await navigation();

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG 2.1 AA violations with the user menu open and the logout alert shown', async () => {
      refresh.mockResolvedValue(authenticated);
      logout.mockResolvedValue({ status: 'unavailable' });
      const { container } = renderShellAt('/cursos', width);
      await navigation();

      await userEvent.click(userMenuToggle());
      expect(await wcagViolations(container)).toEqual([]);
      await userEvent.click(screen.getByRole('button', { name: es.header.logout }));
      await screen.findByRole('alert');
      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  it('has no WCAG 2.1 AA violations with the panel open', async () => {
    refresh.mockResolvedValue(authenticated);
    renderShellAt('/cursos', MOBILE);
    await navigation();
    await userEvent.click(openMenuButton());
    await screen.findByRole('dialog');

    expect(await wcagViolations(document.body)).toEqual([]);
  });
});
