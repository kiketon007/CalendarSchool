import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import {
  invitationAcceptanceService,
  type AcceptOutcome,
  type LookupOutcome,
} from '../services/invitationAcceptanceService';
import { AcceptInvitationPage } from './AcceptInvitationPage';

const TOKEN = 'token-del-enlace';

const found: LookupOutcome = { status: 'found', schoolName: 'CEIP Lluís Vives', role: 'MEMBER' };
const accepted: AcceptOutcome = {
  status: 'accepted',
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    firstName: 'Ana',
    lastName: 'Pérez-Gil',
    email: 'ana.perez@example.com',
    role: 'MEMBER',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

/** Destino de la navegación tras crear la cuenta: enseña el estado que recibe para poder comprobarlo. */
function LoginProbe() {
  const location = useLocation();
  return <div data-testid="login-page">{JSON.stringify(location.state)}</div>;
}

function renderPage({ strict = false, hash = `#${TOKEN}` } = {}) {
  // El fragmento lo lee la página de `window.location`, no del router.
  window.history.replaceState(null, '', `/invitacion${hash}`);
  const tree = (
    <MemoryRouter initialEntries={['/invitacion']}>
      <Routes>
        <Route path="/invitacion" element={<AcceptInvitationPage />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const label = (field: 'firstName' | 'lastName' | 'email' | 'password') =>
  es.registration.fields[field].label;

async function fillForm(
  overrides: Partial<Record<'firstName' | 'lastName' | 'email' | 'password', string>> = {},
) {
  const values = {
    firstName: 'Ana',
    lastName: 'Pérez-Gil',
    email: 'ana.perez@example.com',
    password: 'Secreta123!',
    ...overrides,
  };
  for (const field of ['firstName', 'lastName', 'email', 'password'] as const) {
    await userEvent.type(screen.getByLabelText(label(field)), values[field]);
  }
}

const privacyCheckbox = () => screen.getByRole('checkbox', { name: /política de privacidad/i });
const submitButton = () => screen.getByRole('button', { name: es.acceptInvitation.submit });

describe('AcceptInvitationPage', () => {
  let lookup: MockInstance<typeof invitationAcceptanceService.lookup>;
  let accept: MockInstance<typeof invitationAcceptanceService.accept>;

  beforeEach(() => {
    lookup = vi.spyOn(invitationAcceptanceService, 'lookup').mockResolvedValue(found);
    accept = vi.spyOn(invitationAcceptanceService, 'accept').mockResolvedValue(accepted);
  });

  afterEach(() => {
    lookup.mockRestore();
    accept.mockRestore();
    window.history.replaceState(null, '', '/');
  });

  describe('the token of the link', () => {
    it('is read from the fragment, removed from the address bar and kept out of the storage', async () => {
      renderPage();
      await screen.findByLabelText(label('firstName'));

      expect(lookup).toHaveBeenCalledExactlyOnceWith(TOKEN);
      expect(window.location.hash).toBe('');
      expect(window.location.pathname).toBe('/invitacion');
      expect(JSON.stringify({ ...window.localStorage })).not.toContain(TOKEN);
      expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(TOKEN);
    });

    it('shows the invalid link view without calling the server when there is no fragment', async () => {
      renderPage({ hash: '' });

      expect(await screen.findByText(es.acceptInvitation.invalid)).toBeInTheDocument();
      expect(lookup).not.toHaveBeenCalled();
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(label('email'))).not.toBeInTheDocument();
    });

    it('is looked up once even when StrictMode runs the effect twice', async () => {
      renderPage({ strict: true });
      await screen.findByLabelText(label('firstName'));

      expect(lookup).toHaveBeenCalledOnce();
    });
  });

  describe('the lookup', () => {
    it('shows an accessible loading indicator while the link is checked', () => {
      lookup.mockReturnValue(new Promise<LookupOutcome>(() => undefined));

      renderPage();

      expect(screen.getByRole('status')).toHaveTextContent(es.acceptInvitation.loading);
      expect(screen.queryByLabelText(label('email'))).not.toBeInTheDocument();
    });

    it('shows the school, the translated role and the form with the privacy policy link', async () => {
      renderPage();

      expect(
        await screen.findByText('Te han invitado a CEIP Lluís Vives como Miembro.'),
      ).toBeInTheDocument();
      for (const field of ['firstName', 'lastName', 'email', 'password'] as const) {
        expect(screen.getByLabelText(label(field))).toBeInTheDocument();
      }
      expect(privacyCheckbox()).not.toBeChecked();
      expect(screen.getByRole('link', { name: /política de privacidad/i })).toHaveAttribute(
        'href',
        '/privacidad',
      );
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('translates the administrator role', async () => {
      lookup.mockResolvedValue({ ...found, role: 'ADMIN' });

      renderPage();

      expect(
        await screen.findByText('Te han invitado a CEIP Lluís Vives como Administrador.'),
      ).toBeInTheDocument();
    });

    it('shows the invalid link view and no form when the link is not valid', async () => {
      lookup.mockResolvedValue({ status: 'invalid' });

      renderPage();

      expect(await screen.findByText(es.acceptInvitation.invalid)).toBeInTheDocument();
      expect(screen.queryByLabelText(label('email'))).not.toBeInTheDocument();
    });

    it.each([
      [1, 'Demasiados intentos. Vuelve a intentarlo dentro de 1 minuto.'],
      [5, 'Demasiados intentos. Vuelve a intentarlo dentro de 5 minutos.'],
    ])('tells to wait %i minute(s) when there are too many attempts', async (minutes, text) => {
      lookup.mockResolvedValue({ status: 'tooManyAttempts', retryAfterMinutes: minutes });

      renderPage();

      expect(await screen.findByText(text)).toBeInTheDocument();
    });

    it('tells to try later when there are too many attempts and no wait time', async () => {
      lookup.mockResolvedValue({ status: 'tooManyAttempts', retryAfterMinutes: undefined });

      renderPage();

      expect(
        await screen.findByText('Demasiados intentos. Vuelve a intentarlo más tarde.'),
      ).toBeInTheDocument();
    });

    it('shows an alert with a retry button when the server is unavailable, and retries', async () => {
      lookup.mockResolvedValueOnce({ status: 'unavailable' });

      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(es.acceptInvitation.lookupError);
      await userEvent.click(screen.getByRole('button', { name: es.acceptInvitation.retry }));

      expect(await screen.findByLabelText(label('firstName'))).toBeInTheDocument();
      expect(lookup).toHaveBeenCalledTimes(2);
      // El reintento usa el mismo token, aunque el fragmento ya se haya borrado de la barra.
      expect(lookup).toHaveBeenLastCalledWith(TOKEN);
    });
  });

  describe('the form', () => {
    it('validates inline and sends nothing when it is empty', async () => {
      renderPage();
      await screen.findByLabelText(label('firstName'));

      await userEvent.click(submitButton());

      const alerts = (await screen.findAllByRole('alert')).map((alert) => alert.textContent);
      expect(alerts).toEqual([
        es.registration.errors.firstName.REQUIRED,
        es.registration.errors.lastName.REQUIRED,
        es.registration.errors.email.REQUIRED,
        es.registration.errors.password.REQUIRED,
        es.registration.errors.privacyPolicyAccepted.REQUIRED,
      ]);
      expect(accept).not.toHaveBeenCalled();
    });

    it('applies the rules of the registration to the password and the email', async () => {
      renderPage();
      await screen.findByLabelText(label('firstName'));

      await fillForm({ email: 'sin-arroba', password: 'sin-variedad' });
      await userEvent.click(privacyCheckbox());
      await userEvent.click(submitButton());

      expect(await screen.findByText(es.registration.errors.email.INVALID_FORMAT)).toBeVisible();
      expect(screen.getByText(es.registration.errors.password.WEAK_PASSWORD)).toBeVisible();
      expect(accept).not.toHaveBeenCalled();
    });

    it('sends the token and the fields and goes to /login saying that the account is created', async () => {
      renderPage();
      await screen.findByLabelText(label('firstName'));

      await fillForm({ email: '  ana.perez@example.com  ' });
      await userEvent.click(privacyCheckbox());
      await userEvent.click(submitButton());

      expect(accept).toHaveBeenCalledExactlyOnceWith(TOKEN, {
        firstName: 'Ana',
        lastName: 'Pérez-Gil',
        email: 'ana.perez@example.com',
        password: 'Secreta123!',
        privacyPolicyAccepted: true,
      });
      const login = await screen.findByTestId('login-page');
      expect(JSON.parse(login.textContent ?? '')).toEqual({
        accountCreated: true,
        email: 'ana.perez@example.com',
      });
    });

    it('sends a single request on a double click', async () => {
      accept.mockReturnValue(new Promise<AcceptOutcome>(() => undefined));
      renderPage();
      await screen.findByLabelText(label('firstName'));
      await fillForm();
      await userEvent.click(privacyCheckbox());

      await userEvent.dblClick(submitButton());

      expect(accept).toHaveBeenCalledOnce();
    });

    it('marks the email as already registered, keeping the other fields', async () => {
      accept.mockResolvedValue({ status: 'emailAlreadyRegistered' });
      renderPage();
      await screen.findByLabelText(label('firstName'));
      await fillForm();
      await userEvent.click(privacyCheckbox());

      await userEvent.click(submitButton());

      expect(await screen.findByText(es.registration.server.emailAlreadyRegistered)).toBeVisible();
      expect(screen.getByLabelText(label('email'))).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(label('firstName'))).toHaveValue('Ana');
      expect(screen.getByLabelText(label('lastName'))).toHaveValue('Pérez-Gil');
      expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    });

    it('shows the errors that the server reports for each field', async () => {
      accept.mockResolvedValue({
        status: 'validationError',
        details: [
          { field: 'password', code: 'WEAK_PASSWORD' },
          { field: 'privacyPolicyAccepted', code: 'REQUIRED' },
        ],
      });
      renderPage();
      await screen.findByLabelText(label('firstName'));
      await fillForm();
      await userEvent.click(privacyCheckbox());

      await userEvent.click(submitButton());

      expect(await screen.findByText(es.registration.errors.password.WEAK_PASSWORD)).toBeVisible();
      expect(screen.getByText(es.registration.errors.privacyPolicyAccepted.REQUIRED)).toBeVisible();
    });

    it('shows the invalid link view when the link stops being valid while the form is filled', async () => {
      accept.mockResolvedValue({ status: 'invalid' });
      renderPage();
      await screen.findByLabelText(label('firstName'));
      await fillForm();
      await userEvent.click(privacyCheckbox());

      await userEvent.click(submitButton());

      expect(await screen.findByText(es.acceptInvitation.invalid)).toBeInTheDocument();
      expect(screen.queryByLabelText(label('email'))).not.toBeInTheDocument();
    });

    it('tells how long to wait when the acceptance is rate limited', async () => {
      accept.mockResolvedValue({ status: 'tooManyAttempts', retryAfterMinutes: 3 });
      renderPage();
      await screen.findByLabelText(label('firstName'));
      await fillForm();
      await userEvent.click(privacyCheckbox());

      await userEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Demasiados intentos. Vuelve a intentarlo dentro de 3 minutos.',
      );
      expect(screen.getByLabelText(label('firstName'))).toHaveValue('Ana');
    });

    it('shows a generic notice and keeps the form when the server is unavailable', async () => {
      accept.mockResolvedValue({ status: 'unavailable' });
      renderPage();
      await screen.findByLabelText(label('firstName'));
      await fillForm();
      await userEvent.click(privacyCheckbox());

      await userEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(es.acceptInvitation.submitError);
      expect(screen.getByLabelText(label('firstName'))).toHaveValue('Ana');
      await waitFor(() => expect(submitButton()).toBeEnabled());
    });
  });

  it('has no accessibility violations with the form, its errors and the invalid link view', async () => {
    const rules = { rules: { 'color-contrast': { enabled: false } } };
    const withForm = renderPage();
    await screen.findByLabelText(label('firstName'));
    await userEvent.click(submitButton());
    await screen.findAllByRole('alert');
    const formResults = await axe.run(withForm.container, rules);
    withForm.unmount();

    lookup.mockResolvedValue({ status: 'invalid' });
    const invalid = renderPage();
    await screen.findByText(es.acceptInvitation.invalid);
    const invalidResults = await axe.run(invalid.container, rules);

    expect(formResults.violations.map(({ id }) => id)).toEqual([]);
    expect(invalidResults.violations.map(({ id }) => id)).toEqual([]);
  });
});
