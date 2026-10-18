import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { invitationsService } from '../services/invitationsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { usersService, type SchoolUser } from '../services/usersService';
import { SessionProvider } from '../session/SessionProvider';
import { UsersPage } from './UsersPage';

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

const users: SchoolUser[] = [
  {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    firstName: 'José María',
    lastName: 'García-López',
    email: 'jose.garcia@example.com',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: '2026-10-07T09:30:00.000Z',
  },
];

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

describe('UsersPage invitations', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let listUsers: MockInstance<typeof usersService.list>;
  let listInvitations: MockInstance<typeof invitationsService.list>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    listUsers = vi.spyOn(usersService, 'list').mockResolvedValue({ status: 'loaded', users });
    listInvitations = vi
      .spyOn(invitationsService, 'list')
      .mockResolvedValue({ status: 'loaded', invitations: [] });
  });

  afterEach(() => {
    refresh.mockRestore();
    listUsers.mockRestore();
    listInvitations.mockRestore();
  });

  it('shows the invitations section below the users table', async () => {
    renderPage();

    const usersTable = await screen.findByRole('table', { name: es.users.title });
    const heading = await screen.findByRole('heading', { name: es.invitations.title });
    expect(
      usersTable.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: es.invitations.title })).getByRole('button', {
        name: es.invitations.generate,
      }),
    ).toBeInTheDocument();
  });

  it('keeps the users table when the list of invitations fails, and shows the notice only in the section', async () => {
    listInvitations.mockResolvedValue({ status: 'unavailable' });

    renderPage();

    expect(await screen.findByRole('table', { name: es.users.title })).toBeInTheDocument();
    const section = screen.getByRole('region', { name: es.invitations.title });
    expect(await within(section).findByRole('alert')).toHaveTextContent(es.invitations.loadError);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('keeps the invitations when the list of users fails', async () => {
    listUsers.mockResolvedValue({ status: 'unavailable' });

    renderPage();

    expect(await screen.findByText(es.users.loadError)).toBeInTheDocument();
    expect(await screen.findByText(es.invitations.empty)).toBeInTheDocument();
  });

  it('renews the session and goes to /onboarding, without a message, on a 403 from the invitations', async () => {
    listInvitations.mockResolvedValue({ status: 'forbidden' });

    renderPage();

    expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Una renovación en el arranque y otra por el 403, como con la lista de usuarios.
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
