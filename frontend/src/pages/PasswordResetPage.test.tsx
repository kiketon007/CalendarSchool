import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import {
  passwordResetService,
  type ConfirmPasswordResetOutcome,
  type LookupPasswordResetOutcome,
} from '../services/passwordResetService';
import { PasswordResetPage } from './PasswordResetPage';

const TOKEN = 'token-del-enlace';
const PASSWORD = 'Nueva4567!x';

const found: LookupPasswordResetOutcome = {
  status: 'found',
  schoolName: 'CEIP Lluís Vives',
  email: 'a***@example.com',
};
const confirmed: ConfirmPasswordResetOutcome = { status: 'confirmed' };

/** Destino de la navegación tras cambiar la contraseña: enseña el estado que recibe para poder comprobarlo. */
function LoginProbe() {
  const location = useLocation();
  return <div data-testid="login-page">{JSON.stringify(location.state)}</div>;
}

function renderPage({ strict = false, hash = `#${TOKEN}` } = {}) {
  // El fragmento lo lee la página de `window.location`, no del router.
  window.history.replaceState(null, '', `/restablecer${hash}`);
  const tree = (
    <MemoryRouter initialEntries={['/restablecer']}>
      <Routes>
        <Route path="/restablecer" element={<PasswordResetPage />} />
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

const texts = es.passwordReset;
const passwordInput = () => screen.getByLabelText(es.registration.fields.password.label);
const confirmInput = () => screen.getByLabelText(texts.confirmLabel);
const submitButton = () => screen.getByRole('button', { name: texts.submit });

async function fillForm(password = PASSWORD, confirmation = password) {
  await userEvent.type(passwordInput(), password);
  await userEvent.type(confirmInput(), confirmation);
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

describe('PasswordResetPage', () => {
  let lookup: MockInstance<typeof passwordResetService.lookup>;
  let confirm: MockInstance<typeof passwordResetService.confirm>;

  beforeEach(() => {
    lookup = vi.spyOn(passwordResetService, 'lookup').mockResolvedValue(found);
    confirm = vi.spyOn(passwordResetService, 'confirm').mockResolvedValue(confirmed);
  });

  afterEach(() => {
    lookup.mockRestore();
    confirm.mockRestore();
    window.history.replaceState(null, '', '/');
  });

  describe('the token of the link', () => {
    it('is read from the fragment, removed from the address bar and kept out of the storage', async () => {
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      expect(lookup).toHaveBeenCalledExactlyOnceWith(TOKEN);
      expect(window.location.hash).toBe('');
      expect(window.location.pathname).toBe('/restablecer');
      expect(JSON.stringify({ ...window.localStorage })).not.toContain(TOKEN);
      expect(JSON.stringify({ ...window.sessionStorage })).not.toContain(TOKEN);
    });

    it('shows the invalid link view without calling the server when there is no fragment', async () => {
      renderPage({ hash: '' });

      expect(await screen.findByText(texts.invalid)).toBeInTheDocument();
      expect(lookup).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(texts.confirmLabel)).not.toBeInTheDocument();
    });

    it('is looked up once even when StrictMode runs the effect twice', async () => {
      renderPage({ strict: true });
      await screen.findByLabelText(texts.confirmLabel);

      expect(lookup).toHaveBeenCalledOnce();
    });
  });

  describe('the lookup', () => {
    it('shows an accessible loading indicator while the link is checked', () => {
      lookup.mockReturnValue(new Promise<LookupPasswordResetOutcome>(() => undefined));

      renderPage();

      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
      expect(screen.queryByLabelText(texts.confirmLabel)).not.toBeInTheDocument();
    });

    it('shows the school and the masked email above the form', async () => {
      renderPage();

      expect(
        await screen.findByText(
          'Elige una contraseña nueva para la cuenta a***@example.com de CEIP Lluís Vives.',
        ),
      ).toBeInTheDocument();
      expect(passwordInput()).toBeInTheDocument();
      expect(confirmInput()).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows the invalid link view and no form when the link is not valid', async () => {
      lookup.mockResolvedValue({ status: 'invalid' });

      renderPage();

      expect(await screen.findByText(texts.invalid)).toBeInTheDocument();
      expect(screen.queryByLabelText(texts.confirmLabel)).not.toBeInTheDocument();
    });

    it('tells how long to wait when there are too many attempts', async () => {
      lookup.mockResolvedValue({ status: 'tooManyAttempts', retryAfterMinutes: 3 });

      renderPage();

      expect(
        await screen.findByText('Demasiados intentos. Vuelve a intentarlo dentro de 3 minutos.'),
      ).toBeInTheDocument();
    });

    it('tells to try later when there are too many attempts and no wait time', async () => {
      lookup.mockResolvedValue({ status: 'tooManyAttempts', retryAfterMinutes: undefined });

      renderPage();

      expect(await screen.findByText(texts.tooManyAttemptsLater)).toBeInTheDocument();
    });

    it('shows an alert with a retry button when the server is unavailable, and retries', async () => {
      lookup.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.lookupError);
      await userEvent.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByLabelText(texts.confirmLabel)).toBeInTheDocument();
      expect(lookup).toHaveBeenCalledTimes(2);
      expect(lookup).toHaveBeenLastCalledWith(TOKEN);
    });
  });

  describe('the form', () => {
    it('validates inline with the rules of the registration and sends nothing when it is empty', async () => {
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      await userEvent.click(submitButton());

      expect(await screen.findByText(es.registration.errors.password.REQUIRED)).toBeInTheDocument();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('rejects a weak password', async () => {
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      await fillForm('sin-variedad');
      await userEvent.click(submitButton());

      expect(
        await screen.findByText(es.registration.errors.password.WEAK_PASSWORD),
      ).toBeInTheDocument();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('says that the passwords do not match and sends nothing', async () => {
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      await fillForm(PASSWORD, 'Otra98765!z');
      await userEvent.click(submitButton());

      expect(await screen.findByText(texts.mismatch)).toBeInTheDocument();
      expect(confirm).not.toHaveBeenCalled();
    });

    it('sends the token and the password and goes to /login saying that the password is changed', async () => {
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      await fillForm();
      await userEvent.click(submitButton());

      expect(confirm).toHaveBeenCalledExactlyOnceWith(TOKEN, PASSWORD);
      expect(await screen.findByTestId('login-page')).toHaveTextContent(
        JSON.stringify({ passwordChanged: true }),
      );
    });

    it('sends a single request on a double click', async () => {
      confirm.mockReturnValue(new Promise<ConfirmPasswordResetOutcome>(() => undefined));
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);
      await fillForm();

      await userEvent.dblClick(submitButton());

      expect(confirm).toHaveBeenCalledOnce();
    });

    it('shows the errors that the server reports for the password', async () => {
      confirm.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'password', code: 'WEAK_PASSWORD' }],
      });
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      await fillForm();
      await userEvent.click(submitButton());

      expect(
        await screen.findByText(es.registration.errors.password.WEAK_PASSWORD),
      ).toBeInTheDocument();
      expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');
    });

    it('shows the invalid link view when the link stops being valid while the form is filled', async () => {
      confirm.mockResolvedValue({ status: 'invalid' });
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      await fillForm();
      await userEvent.click(submitButton());

      expect(await screen.findByText(texts.invalid)).toBeInTheDocument();
      expect(screen.queryByLabelText(texts.confirmLabel)).not.toBeInTheDocument();
    });

    it('tells how long to wait when the confirmation is rate limited', async () => {
      confirm.mockResolvedValue({ status: 'tooManyAttempts', retryAfterMinutes: 2 });
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      await fillForm();
      await userEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Demasiados intentos. Vuelve a intentarlo dentro de 2 minutos.',
      );
      expect(passwordInput()).toBeInTheDocument();
    });

    it('shows a generic notice and keeps the form when the server is unavailable', async () => {
      confirm.mockResolvedValue({ status: 'unavailable' });
      renderPage();
      await screen.findByLabelText(texts.confirmLabel);

      await fillForm();
      await userEvent.click(submitButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.submitError);
      await waitFor(() => expect(submitButton()).toBeEnabled());
      expect(passwordInput()).toHaveValue(PASSWORD);
    });
  });

  it('has no accessibility violations with the form, its errors and the invalid link view', async () => {
    const { container } = renderPage();
    await screen.findByLabelText(texts.confirmLabel);
    await userEvent.click(submitButton());
    await screen.findByText(es.registration.errors.password.REQUIRED);

    expect(await wcagViolations(container)).toEqual([]);

    lookup.mockResolvedValue({ status: 'invalid' });
    const invalid = renderPage({ hash: '' });
    await screen.findAllByText(texts.invalid);
    expect(await wcagViolations(invalid.container)).toEqual([]);
  });
});
