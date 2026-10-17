import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { sessionService, type SessionData } from '../services/sessionService';
import { usersService, type SchoolUser, type UsersOutcome } from '../services/usersService';
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
  {
    id: '0192f5a0-0000-7000-8000-0000000000a2',
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana.perez@example.com',
    role: 'MEMBER',
    status: 'SUSPENDED',
    createdAt: '2026-10-08T09:30:00.000Z',
  },
];

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

/** Fecha de alta como la muestra la página, con el idioma activo. */
function formattedDate(iso: string): string {
  return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
}

describe('UsersPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof usersService.list>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    list = vi.spyOn(usersService, 'list');
  });

  afterEach(() => {
    refresh.mockRestore();
    list.mockRestore();
  });

  it('shows an accessible loading indicator while the list is requested', () => {
    list.mockReturnValue(new Promise<UsersOutcome>(() => undefined));

    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent(es.users.loading);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows the name, surname, email, translated role and status and the date of every user', async () => {
    list.mockResolvedValue({ status: 'loaded', users });

    renderPage();

    const table = await screen.findByRole('table', { name: es.users.title });
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual([
      es.users.columns.firstName,
      es.users.columns.lastName,
      es.users.columns.email,
      es.users.columns.role,
      es.users.columns.status,
      es.users.columns.createdAt,
      es.users.actions.header,
    ]);
    const [, admin, member] = within(table).getAllByRole('row');
    expect(within(admin as HTMLElement).getAllByRole('cell')).toHaveLength(7);
    expect(admin).toHaveTextContent('José María');
    expect(admin).toHaveTextContent('García-López');
    expect(admin).toHaveTextContent('jose.garcia@example.com');
    expect(admin).toHaveTextContent(es.users.role.ADMIN);
    expect(admin).toHaveTextContent(es.users.status.ACTIVE);
    expect(admin).toHaveTextContent(formattedDate('2026-10-07T09:30:00.000Z'));
    expect(member).toHaveTextContent(es.users.role.MEMBER);
    expect(member).toHaveTextContent(es.users.status.SUSPENDED);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the order in which the server returns the users', async () => {
    list.mockResolvedValue({ status: 'loaded', users: [...users].reverse() });

    renderPage();

    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('ana.perez@example.com');
    expect(rows[2]).toHaveTextContent('jose.garcia@example.com');
  });

  it('renders names with markup as plain text', async () => {
    list.mockResolvedValue({
      status: 'loaded',
      users: [{ ...users[0]!, firstName: '<b>Ana</b>', email: 'a&b@example.com' }],
    });

    renderPage();

    const table = await screen.findByRole('table');
    expect(table).toHaveTextContent('<b>Ana</b>');
    expect(table).toHaveTextContent('a&b@example.com');
    expect(table.querySelector('b')).toBeNull();
  });

  it('asks for the list once, also in React strict mode', async () => {
    list.mockResolvedValue({ status: 'loaded', users });

    renderPage(true);

    await screen.findByRole('table');
    expect(list).toHaveBeenCalledOnce();
  });

  it('shows an alert and a retry button when the list cannot be loaded, and loads it on retry', async () => {
    list.mockResolvedValueOnce({ status: 'unavailable' });
    list.mockResolvedValueOnce({ status: 'loaded', users });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(es.users.loadError);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: es.users.retry }));

    expect(await screen.findByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('shows the loading indicator again while retrying', async () => {
    list.mockResolvedValueOnce({ status: 'unavailable' });
    list.mockReturnValueOnce(new Promise<UsersOutcome>(() => undefined));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: es.users.retry }));

    expect(screen.getByRole('status')).toHaveTextContent(es.users.loading);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renews the session and goes to /onboarding, without a message, on a 403', async () => {
    list.mockResolvedValue({ status: 'forbidden' });
    renderPage();

    expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Una renovación en el arranque y otra por el 403, para que la interfaz conozca el rol actual.
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not show an error nor the table when the session is lost', async () => {
    list.mockResolvedValue({ status: 'unauthenticated' });
    renderPage();

    await waitFor(() => {
      expect(list).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('has no accessibility violations with the list and with the error', async () => {
    const rules = { rules: { 'color-contrast': { enabled: false } } };
    list.mockResolvedValueOnce({ status: 'loaded', users });
    const loaded = renderPage();
    await screen.findByRole('table');
    const withList = await axe.run(loaded.container, rules);
    loaded.unmount();

    list.mockResolvedValueOnce({ status: 'unavailable' });
    const failed = renderPage();
    await screen.findByRole('alert');
    const withError = await axe.run(failed.container, rules);

    expect(withList.violations.map(({ id }) => id)).toEqual([]);
    expect(withError.violations.map(({ id }) => id)).toEqual([]);
  });
});
