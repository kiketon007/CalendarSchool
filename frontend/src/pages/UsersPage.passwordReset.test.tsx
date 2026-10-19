import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { invitationsService } from '../services/invitationsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { usersService, type SchoolUser } from '../services/usersService';
import { SessionProvider } from '../session/SessionProvider';
import { UsersPage } from './UsersPage';

const ACTOR_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const URL = 'http://localhost:5173/restablecer#secret-token';

const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: {
    id: ACTOR_ID,
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
    role: 'ADMIN',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

function userWith(overrides: Partial<SchoolUser> & Pick<SchoolUser, 'id' | 'email'>): SchoolUser {
  return {
    firstName: 'Nombre',
    lastName: 'Apellido',
    role: 'MEMBER',
    status: 'ACTIVE',
    passwordResetPending: false,
    createdAt: '2026-10-08T09:30:00.000Z',
    ...overrides,
  };
}

const actor = userWith({
  id: ACTOR_ID,
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  role: 'ADMIN',
});
const member = userWith({
  id: '0192f5a0-0000-7000-8000-0000000000a2',
  firstName: 'Luis',
  lastName: 'López',
  email: 'luis.lopez@example.com',
});
const pendingMember = userWith({
  id: '0192f5a0-0000-7000-8000-0000000000a3',
  firstName: 'Eva',
  lastName: 'Ruiz',
  email: 'eva.ruiz@example.com',
  passwordResetPending: true,
});
const suspended = userWith({
  id: '0192f5a0-0000-7000-8000-0000000000a4',
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana.perez@example.com',
  status: 'SUSPENDED',
});
const users = [actor, member, pendingMember, suspended];

const texts = es.users;
const resetTexts = es.users.passwordReset;

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/usuarios']}>
      <SessionProvider>
        <Routes>
          <Route path="/usuarios" element={<UsersPage />} />
          <Route path="/onboarding" element={<div data-testid="onboarding-page" />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

/** La fila de la tabla del usuario con ese email. */
async function rowOf(user: SchoolUser): Promise<HTMLElement> {
  const cell = await screen.findByText(user.email);
  return cell.closest('tr')!;
}

const created = (user: SchoolUser) =>
  ({
    status: 'created',
    passwordReset: {
      userId: user.id,
      createdAt: '2026-10-17T10:00:00.000Z',
      expiresAt: '2026-10-20T10:00:00.000Z',
    },
    url: URL,
  }) as const;

/** Una promesa que se resuelve a mano, para observar el estado de la fila mientras la petición está en curso. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
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

describe('UsersPage password reset', () => {
  let list: MockInstance<typeof usersService.list>;
  let generate: MockInstance<typeof usersService.generatePasswordReset>;
  let revoke: MockInstance<typeof usersService.revokePasswordReset>;

  beforeEach(() => {
    vi.spyOn(sessionService, 'refresh').mockResolvedValue({
      status: 'authenticated',
      data: sessionData,
    });
    list = vi.spyOn(usersService, 'list').mockResolvedValue({ status: 'loaded', users });
    vi.spyOn(invitationsService, 'list').mockResolvedValue({ status: 'loaded', invitations: [] });
    generate = vi.spyOn(usersService, 'generatePasswordReset');
    revoke = vi.spyOn(usersService, 'revokePasswordReset');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('which rows offer it', () => {
    it('offers to reset the password of an active user, also the own one', async () => {
      renderPage();

      for (const user of [member, actor]) {
        const row = within(await rowOf(user));
        expect(row.getByRole('button', { name: resetTexts.action })).toBeEnabled();
      }
    });

    it('does not offer it for a suspended user', async () => {
      renderPage();

      const row = within(await rowOf(suspended));

      expect(row.queryByRole('button', { name: resetTexts.action })).not.toBeInTheDocument();
      expect(row.queryByRole('button', { name: resetTexts.revoke })).not.toBeInTheDocument();
    });

    it('marks the row with a pending reset and offers to revoke it or to generate a new one', async () => {
      renderPage();

      const row = within(await rowOf(pendingMember));

      expect(row.getByText(resetTexts.pending)).toBeInTheDocument();
      expect(row.getByRole('button', { name: resetTexts.revoke })).toBeEnabled();
      expect(row.queryByRole('button', { name: resetTexts.action })).toBeInTheDocument();
      expect(within(await rowOf(member)).queryByText(resetTexts.pending)).not.toBeInTheDocument();
    });
  });

  describe('generating the link', () => {
    it('shows the link once in a panel with the warning, marks the row and does not reload the list', async () => {
      generate.mockResolvedValue(created(member));
      renderPage();

      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
      );

      expect(await screen.findByLabelText(resetTexts.link.label)).toHaveValue(URL);
      expect(screen.getByText(resetTexts.link.warning)).toBeInTheDocument();
      expect(
        screen.getByRole('group', {
          name: resetTexts.link.title.replace('{{name}}', 'Luis López'),
        }),
      ).toBeInTheDocument();
      expect(generate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), member.id);
      expect(within(await rowOf(member)).getByText(resetTexts.pending)).toBeInTheDocument();
      expect(list).toHaveBeenCalledOnce();
    });

    it('discards the link with Done and never keeps it in the storage', async () => {
      generate.mockResolvedValue(created(member));
      renderPage();
      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
      );
      await screen.findByLabelText(resetTexts.link.label);

      await userEvent.click(screen.getByRole('button', { name: es.invitations.link.done }));

      expect(screen.queryByLabelText(resetTexts.link.label)).not.toBeInTheDocument();
      expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('secret-token');
    });

    it('replaces the panel when another link is generated', async () => {
      generate.mockResolvedValueOnce(created(member)).mockResolvedValueOnce({
        ...created(actor),
        url: 'http://localhost:5173/restablecer#otro-token',
      });
      renderPage();
      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
      );
      await screen.findByLabelText(resetTexts.link.label);

      await userEvent.click(
        within(await rowOf(actor)).getByRole('button', { name: resetTexts.action }),
      );

      expect(await screen.findByDisplayValue(/otro-token/)).toBeInTheDocument();
      expect(screen.getAllByLabelText(resetTexts.link.label)).toHaveLength(1);
    });

    it('sends a single request when the button is clicked twice and disables only its own row', async () => {
      const response = deferred<Awaited<ReturnType<typeof usersService.generatePasswordReset>>>();
      generate.mockReturnValue(response.promise);
      renderPage();
      const button = within(await rowOf(member)).getByRole('button', { name: resetTexts.action });

      await userEvent.dblClick(button);

      expect(generate).toHaveBeenCalledOnce();
      expect(button).toBeDisabled();
      expect(
        within(await rowOf(actor)).getByRole('button', { name: resetTexts.action }),
      ).toBeEnabled();
      response.resolve(created(member));
      await screen.findByLabelText(resetTexts.link.label);
    });

    it('shows the not active notice for a 409', async () => {
      generate.mockResolvedValue({ status: 'userNotActive' });
      renderPage();

      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        texts.errors.passwordResetUserNotActive,
      );
      expect(screen.queryByLabelText(resetTexts.link.label)).not.toBeInTheDocument();
    });

    it('warns and reloads the list for a 404, without emptying it', async () => {
      generate.mockResolvedValue({ status: 'notFound' });
      renderPage();

      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.notFound);
      expect(list).toHaveBeenCalledTimes(2);
      expect(await rowOf(member)).toBeInTheDocument();
    });

    it('leaves for onboarding on a 403', async () => {
      generate.mockResolvedValue({ status: 'forbidden' });
      renderPage();

      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
      );

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    });

    it('shows a generic notice when the link cannot be generated', async () => {
      generate.mockResolvedValue({ status: 'unavailable' });
      renderPage();

      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        texts.errors.passwordResetUnavailable,
      );
    });
  });

  describe('revoking the link', () => {
    it('unmarks the row and offers to generate again', async () => {
      revoke.mockResolvedValue({ status: 'revoked' });
      renderPage();

      await userEvent.click(
        within(await rowOf(pendingMember)).getByRole('button', { name: resetTexts.revoke }),
      );

      const row = within(await rowOf(pendingMember));
      expect(revoke).toHaveBeenCalledExactlyOnceWith(expect.any(Function), pendingMember.id);
      await vi.waitFor(() => expect(row.queryByText(resetTexts.pending)).not.toBeInTheDocument());
      expect(row.queryByRole('button', { name: resetTexts.revoke })).not.toBeInTheDocument();
      expect(list).toHaveBeenCalledOnce();
    });

    it('discards the panel of the user whose link has just been revoked', async () => {
      generate.mockResolvedValue(created(member));
      revoke.mockResolvedValue({ status: 'revoked' });
      renderPage();
      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
      );
      await screen.findByLabelText(resetTexts.link.label);

      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: resetTexts.revoke }),
      );

      await vi.waitFor(() =>
        expect(screen.queryByLabelText(resetTexts.link.label)).not.toBeInTheDocument(),
      );
    });

    it('warns and reloads the list for a 404', async () => {
      revoke.mockResolvedValue({ status: 'notFound' });
      renderPage();

      await userEvent.click(
        within(await rowOf(pendingMember)).getByRole('button', { name: resetTexts.revoke }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.notFound);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('leaves for onboarding on a 403', async () => {
      revoke.mockResolvedValue({ status: 'forbidden' });
      renderPage();

      await userEvent.click(
        within(await rowOf(pendingMember)).getByRole('button', { name: resetTexts.revoke }),
      );

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    });

    it('shows a generic notice and keeps the mark when it cannot be revoked', async () => {
      revoke.mockResolvedValue({ status: 'unavailable' });
      renderPage();

      await userEvent.click(
        within(await rowOf(pendingMember)).getByRole('button', { name: resetTexts.revoke }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        texts.errors.passwordResetRevokeUnavailable,
      );
      expect(within(await rowOf(pendingMember)).getByText(resetTexts.pending)).toBeInTheDocument();
    });
  });

  it('has no WCAG A or AA violations with a pending row and the link panel', async () => {
    generate.mockResolvedValue(created(member));
    const { container } = renderPage();
    await userEvent.click(
      within(await rowOf(member)).getByRole('button', { name: resetTexts.action }),
    );
    await screen.findByLabelText(resetTexts.link.label);

    expect(await wcagViolations(container)).toEqual([]);
  });
});
