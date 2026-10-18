import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  invitationsService,
  type CreateInvitationOutcome,
  type Invitation,
  type ListInvitationsOutcome,
  type RevokeInvitationOutcome,
} from '../services/invitationsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { InvitationsSection } from './InvitationsSection';

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

const URL = 'http://localhost:5173/invitacion#secret-token';

const memberInvitation: Invitation = {
  id: '0199a1b2-0000-7000-8000-000000000001',
  role: 'MEMBER',
  createdBy: { id: sessionData.user.id, firstName: 'José María', lastName: 'García-López' },
  createdAt: '2026-10-17T10:00:00.000Z',
  expiresAt: '2026-10-20T10:00:00.000Z',
};
const adminInvitation: Invitation = {
  id: '0199a1b2-0000-7000-8000-000000000002',
  role: 'ADMIN',
  createdBy: { id: '0192f5a0-0000-7000-8000-0000000000a2', firstName: 'Ana', lastName: 'Pérez' },
  createdAt: '2026-10-16T09:00:00.000Z',
  expiresAt: '2026-10-19T09:00:00.000Z',
};
const newInvitation: Invitation = {
  id: '0199a1b2-0000-7000-8000-000000000003',
  role: 'ADMIN',
  createdBy: memberInvitation.createdBy,
  createdAt: '2026-10-18T08:00:00.000Z',
  expiresAt: '2026-10-21T08:00:00.000Z',
};

function renderSection({ strict = false, onForbidden = vi.fn() } = {}) {
  const tree = (
    <MemoryRouter>
      <SessionProvider>
        <InvitationsSection onForbidden={onForbidden} />
      </SessionProvider>
    </MemoryRouter>
  );
  return { onForbidden, ...render(strict ? <StrictMode>{tree}</StrictMode> : tree) };
}

/** Fecha como la muestra la sección, con el idioma activo. */
function formattedDate(iso: string): string {
  return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

const pending = <T,>() => new Promise<T>(() => undefined);

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

describe('InvitationsSection', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof invitationsService.list>;
  let create: MockInstance<typeof invitationsService.create>;
  let revoke: MockInstance<typeof invitationsService.revoke>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    list = vi
      .spyOn(invitationsService, 'list')
      .mockResolvedValue({ status: 'loaded', invitations: [memberInvitation, adminInvitation] });
    create = vi.spyOn(invitationsService, 'create');
    revoke = vi.spyOn(invitationsService, 'revoke');
  });

  afterEach(() => {
    refresh.mockRestore();
    list.mockRestore();
    create.mockRestore();
    revoke.mockRestore();
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  describe('list', () => {
    it('shows an accessible loading indicator and asks for the list once even in StrictMode', () => {
      list.mockReturnValue(pending<ListInvitationsOutcome>());

      renderSection({ strict: true });

      expect(screen.getByRole('status')).toHaveTextContent(es.invitations.loading);
      expect(list).toHaveBeenCalledOnce();
    });

    it('shows the role, who generated each invitation and its dates in the active language', async () => {
      renderSection();

      const table = await screen.findByRole('table', { name: es.invitations.title });
      const [, member, admin] = within(table).getAllByRole('row');
      expect(member).toHaveTextContent(es.users.role.MEMBER);
      expect(member).toHaveTextContent('José María García-López');
      expect(member).toHaveTextContent(formattedDate(memberInvitation.createdAt));
      expect(member).toHaveTextContent(formattedDate(memberInvitation.expiresAt));
      expect(admin).toHaveTextContent(es.users.role.ADMIN);
      expect(admin).toHaveTextContent('Ana Pérez');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('says there are no pending invitations with an empty list', async () => {
      list.mockResolvedValue({ status: 'loaded', invitations: [] });

      renderSection();

      expect(await screen.findByText(es.invitations.empty)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows a notice with a retry button when the list fails, and retries', async () => {
      list.mockResolvedValueOnce({ status: 'unavailable' });

      renderSection();

      expect(await screen.findByRole('alert')).toHaveTextContent(es.invitations.loadError);
      await userEvent.click(screen.getByRole('button', { name: es.invitations.retry }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('calls the exit function when the list answers forbidden', async () => {
      list.mockResolvedValue({ status: 'forbidden' });

      const { onForbidden } = renderSection();

      await waitFor(() => expect(onForbidden).toHaveBeenCalledOnce());
    });
  });

  describe('generating an invitation', () => {
    const created: CreateInvitationOutcome = {
      status: 'created',
      invitation: newInvitation,
      url: URL,
    };

    it('generates it with the chosen role (member by default), shows the panel and adds it to the list without asking again', async () => {
      create.mockResolvedValue(created);
      renderSection();
      await screen.findByRole('table');

      const select = screen.getByLabelText(es.invitations.roleLabel);
      expect(select).toHaveValue('MEMBER');
      await userEvent.selectOptions(select, 'ADMIN');
      await userEvent.click(screen.getByRole('button', { name: es.invitations.generate }));

      expect(create).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 'ADMIN');
      expect(await screen.findByLabelText(es.invitations.link.label)).toHaveValue(URL);
      expect(screen.getByText(es.invitations.link.warning)).toBeInTheDocument();
      expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(4);
      expect(list).toHaveBeenCalledOnce();
    });

    it('sends a single request on a double click', async () => {
      create.mockReturnValue(pending<CreateInvitationOutcome>());
      renderSection();
      await screen.findByRole('table');

      const button = screen.getByRole('button', { name: es.invitations.generate });
      await userEvent.dblClick(button);

      expect(create).toHaveBeenCalledOnce();
    });

    it('closes the panel and forgets the link with «Hecho»', async () => {
      create.mockResolvedValue(created);
      renderSection();
      await screen.findByRole('table');
      await userEvent.click(screen.getByRole('button', { name: es.invitations.generate }));
      await screen.findByLabelText(es.invitations.link.label);

      await userEvent.click(screen.getByRole('button', { name: es.invitations.link.done }));

      expect(screen.queryByLabelText(es.invitations.link.label)).not.toBeInTheDocument();
      expect(screen.queryByDisplayValue(URL)).not.toBeInTheDocument();
      expect(document.body).not.toHaveTextContent('secret-token');
    });

    it('shows a notice when the invitation cannot be generated', async () => {
      create.mockResolvedValue({ status: 'unavailable' });
      renderSection();
      await screen.findByRole('table');

      await userEvent.click(screen.getByRole('button', { name: es.invitations.generate }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.invitations.errors.createUnavailable,
      );
      expect(screen.queryByLabelText(es.invitations.link.label)).not.toBeInTheDocument();
    });

    it('calls the exit function when generating answers forbidden', async () => {
      create.mockResolvedValue({ status: 'forbidden' });
      const { onForbidden } = renderSection();
      await screen.findByRole('table');

      await userEvent.click(screen.getByRole('button', { name: es.invitations.generate }));

      await waitFor(() => expect(onForbidden).toHaveBeenCalledOnce());
    });
  });

  describe('copying the link', () => {
    async function openPanel() {
      create.mockResolvedValue({ status: 'created', invitation: newInvitation, url: URL });
      renderSection();
      await screen.findByRole('table');
      await userEvent.click(screen.getByRole('button', { name: es.invitations.generate }));
      return screen.findByLabelText(es.invitations.link.label);
    }

    it('writes the link to the clipboard and announces «Enlace copiado»', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      setClipboard(writeText);
      await openPanel();

      await userEvent.click(screen.getByRole('button', { name: es.invitations.link.copy }));

      expect(writeText).toHaveBeenCalledExactlyOnceWith(URL);
      expect(await screen.findByRole('status')).toHaveTextContent(es.invitations.link.copied);
    });

    it('selects the text and explains how to copy it by hand when the clipboard fails', async () => {
      setClipboard(vi.fn(() => Promise.reject(new Error('denied'))));
      const input = (await openPanel()) as HTMLInputElement;

      await userEvent.click(screen.getByRole('button', { name: es.invitations.link.copy }));

      expect(await screen.findByRole('status')).toHaveTextContent(es.invitations.link.copyManual);
      expect(input).toHaveFocus();
      expect([input.selectionStart, input.selectionEnd]).toEqual([0, URL.length]);
    });

    it('does the same when the browser has no clipboard', async () => {
      setClipboard(undefined);
      const input = (await openPanel()) as HTMLInputElement;

      await userEvent.click(screen.getByRole('button', { name: es.invitations.link.copy }));

      expect(await screen.findByRole('status')).toHaveTextContent(es.invitations.link.copyManual);
      expect(input).toHaveFocus();
    });
  });

  describe('revoking an invitation', () => {
    const revokeButtons = () => screen.getAllByRole('button', { name: es.invitations.revoke });

    it('removes the row when the invitation is revoked', async () => {
      revoke.mockResolvedValue({ status: 'revoked' });
      renderSection();
      await screen.findByRole('table');

      await userEvent.click(revokeButtons()[0] as HTMLElement);

      expect(revoke).toHaveBeenCalledExactlyOnceWith(expect.any(Function), memberInvitation.id);
      await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2));
      expect(screen.queryByText('José María García-López')).not.toBeInTheDocument();
      expect(list).toHaveBeenCalledOnce();
    });

    it('guards each row: a second click on the same row sends nothing, another row does', async () => {
      revoke.mockReturnValue(pending<RevokeInvitationOutcome>());
      renderSection();
      await screen.findByRole('table');

      await userEvent.dblClick(revokeButtons()[0] as HTMLElement);
      expect(revoke).toHaveBeenCalledOnce();
      expect(revokeButtons()[0]).toBeDisabled();

      await userEvent.click(revokeButtons()[1] as HTMLElement);
      expect(revoke).toHaveBeenCalledTimes(2);
    });

    it('keeps the row and shows a notice when revoking fails', async () => {
      revoke.mockResolvedValue({ status: 'unavailable' });
      renderSection();
      await screen.findByRole('table');

      await userEvent.click(revokeButtons()[0] as HTMLElement);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.invitations.errors.revokeUnavailable,
      );
      expect(screen.getAllByRole('row')).toHaveLength(3);
      expect(revokeButtons()[0]).toBeEnabled();
    });

    it('warns and asks for the list again when the invitation no longer exists', async () => {
      revoke.mockResolvedValue({ status: 'notFound' });
      renderSection();
      await screen.findByRole('table');

      await userEvent.click(revokeButtons()[0] as HTMLElement);

      expect(await screen.findByRole('alert')).toHaveTextContent(es.invitations.errors.notFound);
      await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    });

    it('calls the exit function when revoking answers forbidden', async () => {
      revoke.mockResolvedValue({ status: 'forbidden' });
      const { onForbidden } = renderSection();
      await screen.findByRole('table');

      await userEvent.click(revokeButtons()[0] as HTMLElement);

      await waitFor(() => expect(onForbidden).toHaveBeenCalledOnce());
    });
  });

  it('has no accessibility violations with the list, the link panel and a notice', async () => {
    const rules = { rules: { 'color-contrast': { enabled: false } } };
    create.mockResolvedValue({ status: 'created', invitation: newInvitation, url: URL });
    revoke.mockResolvedValue({ status: 'unavailable' });
    const { container } = renderSection();
    await screen.findByRole('table');
    const withList = await axe.run(container, rules);

    await userEvent.click(screen.getByRole('button', { name: es.invitations.generate }));
    await screen.findByLabelText(es.invitations.link.label);
    const withPanel = await axe.run(container, rules);

    await userEvent.click(
      screen.getAllByRole('button', { name: es.invitations.revoke })[0] as HTMLElement,
    );
    await screen.findByRole('alert');
    const withNotice = await axe.run(container, rules);

    expect(withList.violations.map(({ id }) => id)).toEqual([]);
    expect(withPanel.violations.map(({ id }) => id)).toEqual([]);
    expect(withNotice.violations.map(({ id }) => id)).toEqual([]);
  });
});
