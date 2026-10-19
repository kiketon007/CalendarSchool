import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { invitationsService } from '../services/invitationsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { usersService, type SchoolUser, type UserActionOutcome } from '../services/usersService';
import { SessionProvider } from '../session/SessionProvider';
import { UsersPage } from './UsersPage';

const ACTOR_ID = '0192f5a0-0000-7000-8000-0000000000a1';

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

const actor: SchoolUser = {
  id: ACTOR_ID,
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  passwordResetPending: false,
  createdAt: '2026-10-07T09:30:00.000Z',
};
const member: SchoolUser = {
  id: '0192f5a0-0000-7000-8000-0000000000a2',
  firstName: 'Luis',
  lastName: 'López',
  email: 'luis.lopez@example.com',
  role: 'MEMBER',
  status: 'ACTIVE',
  passwordResetPending: false,
  createdAt: '2026-10-08T09:30:00.000Z',
};
const otherAdmin: SchoolUser = {
  id: '0192f5a0-0000-7000-8000-0000000000a3',
  firstName: 'Eva',
  lastName: 'Ruiz',
  email: 'eva.ruiz@example.com',
  role: 'ADMIN',
  status: 'ACTIVE',
  passwordResetPending: false,
  createdAt: '2026-10-09T09:30:00.000Z',
};
const suspended: SchoolUser = {
  id: '0192f5a0-0000-7000-8000-0000000000a4',
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana.perez@example.com',
  role: 'MEMBER',
  status: 'SUSPENDED',
  passwordResetPending: false,
  createdAt: '2026-10-10T09:30:00.000Z',
};
const users = [actor, member, otherAdmin, suspended];

const texts = es.users;

function renderPage(strict = false) {
  const tree = (
    <MemoryRouter initialEntries={['/usuarios']}>
      <SessionProvider>
        <Routes>
          <Route path="/usuarios" element={<UsersPage />} />
          <Route path="/onboarding" element={<div data-testid="onboarding-page" />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** La fila de la tabla del usuario con ese email. */
async function rowOf(user: SchoolUser): Promise<HTMLElement> {
  const cell = await screen.findByText(user.email);
  return cell.closest('tr')!;
}

const updated = (user: SchoolUser): UserActionOutcome => ({ status: 'updated', user });

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

describe('UsersPage actions', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof usersService.list>;
  let changeRole: MockInstance<typeof usersService.changeRole>;
  let suspend: MockInstance<typeof usersService.suspend>;
  let reactivate: MockInstance<typeof usersService.reactivate>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    list = vi.spyOn(usersService, 'list').mockResolvedValue({ status: 'loaded', users });
    // La sección de invitaciones se prueba aparte (`InvitationsSection.test.tsx`): aquí no pide nada real.
    vi.spyOn(invitationsService, 'list').mockResolvedValue({ status: 'loaded', invitations: [] });
    changeRole = vi.spyOn(usersService, 'changeRole');
    suspend = vi.spyOn(usersService, 'suspend');
    reactivate = vi.spyOn(usersService, 'reactivate');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('which actions each row offers', () => {
    it('offers make administrator and suspend for an active member', async () => {
      renderPage();

      const row = within(await rowOf(member));

      expect(row.getByRole('button', { name: texts.actions.makeAdmin })).toBeEnabled();
      expect(row.getByRole('button', { name: texts.actions.suspend })).toBeEnabled();
      expect(row.queryByRole('button', { name: texts.actions.makeMember })).not.toBeInTheDocument();
      expect(row.queryByRole('button', { name: texts.actions.reactivate })).not.toBeInTheDocument();
    });

    it('offers make member and suspend for another active administrator', async () => {
      renderPage();

      const row = within(await rowOf(otherAdmin));

      expect(row.getByRole('button', { name: texts.actions.makeMember })).toBeEnabled();
      expect(row.getByRole('button', { name: texts.actions.suspend })).toBeEnabled();
    });

    it('offers only reactivate for a suspended user', async () => {
      renderPage();

      const row = within(await rowOf(suspended));

      expect(row.getByRole('button', { name: texts.actions.reactivate })).toBeEnabled();
      expect(row.getAllByRole('button')).toHaveLength(1);
    });

    it('marks the own row with (you) and does not offer to suspend oneself', async () => {
      renderPage();

      const own = await rowOf(actor);

      expect(own).toHaveTextContent(texts.you);
      const row = within(own);
      expect(row.getByRole('button', { name: texts.actions.makeMember })).toBeEnabled();
      expect(row.queryByRole('button', { name: texts.actions.suspend })).not.toBeInTheDocument();
      expect(await rowOf(member)).not.toHaveTextContent(texts.you);
    });
  });

  describe('changing the role and reactivating', () => {
    it('sends the new role and replaces the row without asking for the list again', async () => {
      changeRole.mockResolvedValue(updated({ ...member, role: 'ADMIN' }));
      renderPage();
      const row = await rowOf(member);

      await userEvent.click(within(row).getByRole('button', { name: texts.actions.makeAdmin }));

      expect(changeRole).toHaveBeenCalledExactlyOnceWith(expect.any(Function), member.id, 'ADMIN');
      await waitFor(() => expect(row).toHaveTextContent(texts.role.ADMIN));
      expect(
        within(row).getByRole('button', { name: texts.actions.makeMember }),
      ).toBeInTheDocument();
      expect(list).toHaveBeenCalledOnce();
    });

    it('reactivates a suspended user and shows it as active', async () => {
      reactivate.mockResolvedValue(updated({ ...suspended, status: 'ACTIVE' }));
      renderPage();
      const row = await rowOf(suspended);

      await userEvent.click(within(row).getByRole('button', { name: texts.actions.reactivate }));

      expect(reactivate).toHaveBeenCalledExactlyOnceWith(expect.any(Function), suspended.id);
      await waitFor(() => expect(row).toHaveTextContent(texts.status.ACTIVE));
      expect(within(row).getByRole('button', { name: texts.actions.suspend })).toBeInTheDocument();
    });

    it('sends a single request on a double click and disables the buttons of the row meanwhile', async () => {
      const pending = deferred<UserActionOutcome>();
      changeRole.mockReturnValue(pending.promise);
      renderPage(true);
      const row = await rowOf(member);
      const makeAdmin = within(row).getByRole('button', { name: texts.actions.makeAdmin });

      await userEvent.dblClick(makeAdmin);

      expect(changeRole).toHaveBeenCalledOnce();
      for (const button of within(row).getAllByRole('button')) {
        expect(button).toBeDisabled();
      }
      pending.resolve(updated({ ...member, role: 'ADMIN' }));
      await waitFor(() => expect(row).toHaveTextContent(texts.role.ADMIN));
      for (const button of within(row).getAllByRole('button')) {
        expect(button).toBeEnabled();
      }
    });

    it('keeps the other rows available while one request is in progress', async () => {
      changeRole.mockReturnValue(new Promise<UserActionOutcome>(() => undefined));
      renderPage();
      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: texts.actions.makeAdmin }),
      );

      const other = within(await rowOf(otherAdmin));

      expect(other.getByRole('button', { name: texts.actions.makeMember })).toBeEnabled();
    });

    it('renews the session when the administrator makes themselves a member', async () => {
      changeRole.mockResolvedValue(updated({ ...actor, role: 'MEMBER' }));
      renderPage();
      await rowOf(actor);
      refresh.mockClear();

      await userEvent.click(
        within(await rowOf(actor)).getByRole('button', { name: texts.actions.makeMember }),
      );

      await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    });

    it('does not renew the session when the role change is about someone else', async () => {
      changeRole.mockResolvedValue(updated({ ...otherAdmin, role: 'MEMBER' }));
      renderPage();
      await rowOf(actor);
      refresh.mockClear();

      await userEvent.click(
        within(await rowOf(otherAdmin)).getByRole('button', { name: texts.actions.makeMember }),
      );

      await waitFor(() => expect(changeRole).toHaveBeenCalledOnce());
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('suspending', () => {
    it('asks for confirmation naming the user before sending anything', async () => {
      renderPage();

      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: texts.actions.suspend }),
      );

      const dialog = await screen.findByRole('dialog', { name: texts.confirmSuspend.title });
      expect(dialog).toHaveTextContent('Luis López');
      expect(suspend).not.toHaveBeenCalled();
    });

    it('sends nothing and leaves the row as it was when the dialog is cancelled', async () => {
      renderPage();
      const row = await rowOf(member);
      await userEvent.click(within(row).getByRole('button', { name: texts.actions.suspend }));

      await userEvent.click(
        await screen.findByRole('button', { name: texts.confirmSuspend.cancel }),
      );

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(suspend).not.toHaveBeenCalled();
      expect(row).toHaveTextContent(texts.status.ACTIVE);
    });

    it('suspends the user and shows it as suspended once the dialog is confirmed', async () => {
      suspend.mockResolvedValue(updated({ ...member, status: 'SUSPENDED' }));
      renderPage();
      const row = await rowOf(member);
      await userEvent.click(within(row).getByRole('button', { name: texts.actions.suspend }));

      // El botón del diálogo comparte nombre con los de las filas: se busca dentro del diálogo.
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        within(dialog).getByRole('button', { name: texts.confirmSuspend.confirm }),
      );

      expect(suspend).toHaveBeenCalledExactlyOnceWith(expect.any(Function), member.id);
      await waitFor(() => expect(row).toHaveTextContent(texts.status.SUSPENDED));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(
        within(row).getByRole('button', { name: texts.actions.reactivate }),
      ).toBeInTheDocument();
    });
  });

  describe('when the server rejects the action', () => {
    it.each([
      ['lastAdminRequired', texts.errors.lastAdminRequired],
      ['cannotSuspendSelf', texts.errors.cannotSuspendSelf],
      ['userNotActive', texts.errors.userNotActive],
      ['unavailable', texts.errors.unavailable],
    ] as const)(
      'shows the %s message in an alert and leaves the row as it was',
      async (status, message) => {
        changeRole.mockResolvedValue({ status });
        renderPage();
        const row = await rowOf(member);

        await userEvent.click(within(row).getByRole('button', { name: texts.actions.makeAdmin }));

        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(row).toHaveTextContent(texts.role.MEMBER);
        expect(within(row).getByRole('button', { name: texts.actions.makeAdmin })).toBeEnabled();
        expect(list).toHaveBeenCalledOnce();
      },
    );

    it('says the user is no longer available and loads the list again on a 404', async () => {
      changeRole.mockResolvedValue({ status: 'notFound' });
      renderPage();
      const row = await rowOf(member);
      list.mockResolvedValue({ status: 'loaded', users: [actor, otherAdmin] });

      await userEvent.click(within(row).getByRole('button', { name: texts.actions.makeAdmin }));

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.notFound);
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.queryByText(member.email)).not.toBeInTheDocument());
    });

    it('clears the previous alert when another action starts', async () => {
      changeRole.mockResolvedValueOnce({ status: 'lastAdminRequired' });
      renderPage();
      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: texts.actions.makeAdmin }),
      );
      await screen.findByRole('alert');
      changeRole.mockReturnValue(new Promise<UserActionOutcome>(() => undefined));

      await userEvent.click(
        within(await rowOf(otherAdmin)).getByRole('button', { name: texts.actions.makeMember }),
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renews the session and goes to onboarding on a 403', async () => {
      changeRole.mockResolvedValue({ status: 'forbidden' });
      renderPage();

      await userEvent.click(
        within(await rowOf(member)).getByRole('button', { name: texts.actions.makeAdmin }),
      );

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('does nothing visible when the session is lost: the layout redirects', async () => {
      changeRole.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();
      const row = await rowOf(member);

      await userEvent.click(within(row).getByRole('button', { name: texts.actions.makeAdmin }));

      await waitFor(() => expect(changeRole).toHaveBeenCalledOnce());
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(within(row).getByRole('button', { name: texts.actions.makeAdmin })).toBeEnabled();
    });
  });

  it('has no WCAG 2.1 AA violations with the actions and an alert', async () => {
    changeRole.mockResolvedValue({ status: 'lastAdminRequired' });
    const { container } = renderPage();
    await userEvent.click(
      within(await rowOf(member)).getByRole('button', { name: texts.actions.makeAdmin }),
    );
    await screen.findByRole('alert');

    expect(await wcagViolations(container)).toEqual([]);
  });
});
