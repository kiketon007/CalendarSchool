import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { sessionService } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { LoginPage } from './LoginPage';

/** Estado de la navegación con el que llega la persona que acaba de aceptar una invitación. */
const ACCOUNT_CREATED = { accountCreated: true, email: 'ana.perez@example.com' };

function renderPage(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <SessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('LoginPage after accepting an invitation', () => {
  beforeEach(() => {
    // Sin sesión: es lo que ve quien llega a `/login`.
    vi.spyOn(sessionService, 'refresh').mockResolvedValue({ status: 'invalidSession' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says that the account has been created in a status region and fills in the email', async () => {
    renderPage(ACCOUNT_CREATED);

    // Mientras la sesión carga, la página muestra otro `role="status"`: se espera al aviso por su texto.
    const notice = await screen.findByText(es.login.accountCreated);
    expect(notice).toHaveAttribute('role', 'status');
    expect(screen.getByLabelText(es.login.fields.email.label)).toHaveValue('ana.perez@example.com');
    expect(screen.getByLabelText(es.login.fields.password.label)).toHaveValue('');
  });

  it('does not show the notice as an error', async () => {
    renderPage(ACCOUNT_CREATED);
    await screen.findByText(es.login.accountCreated);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows nothing special when /login is opened directly', async () => {
    renderPage();
    await screen.findByLabelText(es.login.fields.email.label);

    expect(screen.queryByText(es.login.accountCreated)).not.toBeInTheDocument();
    expect(screen.getByLabelText(es.login.fields.email.label)).toHaveValue('');
  });

  it.each([
    [{ accountCreated: false, email: 'ana@example.com' }],
    [{ accountCreated: 'true', email: 'ana@example.com' }],
    [{ other: 1 }],
    ['texto'],
    [null],
  ])('ignores a navigation state that is not the account created one (%j)', async (state) => {
    renderPage(state);
    await screen.findByLabelText(es.login.fields.email.label);

    expect(screen.queryByText(es.login.accountCreated)).not.toBeInTheDocument();
    expect(screen.getByLabelText(es.login.fields.email.label)).toHaveValue('');
  });

  it('shows the notice without an email when the state only carries the flag', async () => {
    renderPage({ accountCreated: true });

    expect(await screen.findByText(es.login.accountCreated)).toHaveAttribute('role', 'status');
    expect(screen.getByLabelText(es.login.fields.email.label)).toHaveValue('');
  });

  it('ignores an email that is not a string', async () => {
    renderPage({ accountCreated: true, email: { toString: 'x' } });
    await screen.findByText(es.login.accountCreated);

    expect(screen.getByLabelText(es.login.fields.email.label)).toHaveValue('');
  });
});
