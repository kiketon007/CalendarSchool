import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { sessionService } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { LoginPage } from './LoginPage';

/** Estado de la navegación con el que llega la persona que acaba de restablecer su contraseña. */
const PASSWORD_CHANGED = { passwordChanged: true };

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

describe('LoginPage after resetting the password', () => {
  beforeEach(() => {
    // Sin sesión: es lo que ve quien llega a `/login`.
    vi.spyOn(sessionService, 'refresh').mockResolvedValue({ status: 'invalidSession' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says that the password has been changed in a status region, not as an error', async () => {
    renderPage(PASSWORD_CHANGED);

    // Mientras la sesión carga, la página muestra otro `role="status"`: se espera al aviso por su texto.
    const notice = await screen.findByText(es.login.passwordChanged);
    expect(notice).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(es.login.accountCreated)).not.toBeInTheDocument();
    expect(screen.getByLabelText(es.login.fields.email.label)).toHaveValue('');
  });

  it('shows nothing special when /login is opened directly', async () => {
    renderPage();
    await screen.findByLabelText(es.login.fields.email.label);

    expect(screen.queryByText(es.login.passwordChanged)).not.toBeInTheDocument();
  });

  it.each([
    [{ passwordChanged: false }],
    [{ passwordChanged: 'true' }],
    [{ other: 1 }],
    ['texto'],
    [null],
  ])('ignores a navigation state that is not the password changed one (%j)', async (state) => {
    renderPage(state);
    await screen.findByLabelText(es.login.fields.email.label);

    expect(screen.queryByText(es.login.passwordChanged)).not.toBeInTheDocument();
  });

  it('keeps the account created notice working as before', async () => {
    renderPage({ accountCreated: true, email: 'ana.perez@example.com' });

    expect(await screen.findByText(es.login.accountCreated)).toHaveAttribute('role', 'status');
    expect(screen.queryByText(es.login.passwordChanged)).not.toBeInTheDocument();
    expect(screen.getByLabelText(es.login.fields.email.label)).toHaveValue('ana.perez@example.com');
  });
});
