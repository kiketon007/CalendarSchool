import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { CaptchaClient } from '../captcha/captchaClient';
import { CaptchaClientContext } from '../captcha/captchaClientContext';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { loginService, type LoginOutcome } from '../services/loginService';
import { sessionService } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { LoginPage } from './LoginPage';

const text = es.login;
const EMAIL = 'jose.garcia@example.com';
const PASSWORD = 'Secreta123!';

const invalidCredentials: LoginOutcome = { status: 'invalidCredentials' };

/** Cliente de captcha que el test controla: un token distinto en cada petición. */
function controllableCaptcha() {
  let tokens = 0;
  const executeV3 = vi.fn<CaptchaClient['executeV3']>(() =>
    Promise.resolve(`v3-token-${String(++tokens)}`),
  );
  const renderV2 = vi.fn<CaptchaClient['renderV2']>();
  return { client: { executeV3, renderV2 } satisfies CaptchaClient, executeV3, renderV2 };
}

describe('LoginPage', () => {
  let login: MockInstance<typeof loginService.login>;
  let captcha: ReturnType<typeof controllableCaptcha>;

  beforeEach(() => {
    login = vi.spyOn(loginService, 'login').mockResolvedValue(invalidCredentials);
    // Sin sesión: es lo que ve quien llega a `/login`.
    vi.spyOn(sessionService, 'refresh').mockResolvedValue({ status: 'invalidSession' });
    captcha = controllableCaptcha();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPage() {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <SessionProvider>
          <CaptchaClientContext.Provider value={captcha.client}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/registro" element={<div data-testid="register-page" />} />
              <Route path="/onboarding" element={<div data-testid="onboarding-page" />} />
            </Routes>
          </CaptchaClientContext.Provider>
        </SessionProvider>
      </MemoryRouter>,
    );
    await screen.findByLabelText(text.fields.email.label);
    return user;
  }

  const email = () => screen.getByLabelText(text.fields.email.label);
  const password = () => screen.getByLabelText(text.fields.password.label);
  const submit = () => screen.getByRole('button', { name: text.submit });

  type User = Awaited<ReturnType<typeof renderPage>>;

  async function fillValidForm(user: User, values = { email: EMAIL, password: PASSWORD }) {
    await user.type(email(), values.email);
    await user.type(password(), values.password);
  }

  /** Id del elemento que describe al campo, y el texto de ese elemento. */
  function describedText(element: HTMLElement): string | undefined {
    const id = element.getAttribute('aria-describedby');
    return id ? document.getElementById(id)?.textContent : undefined;
  }

  describe('the form', () => {
    it('shows the title and the email and password fields', async () => {
      await renderPage();

      expect(screen.getByRole('heading', { level: 1, name: text.title })).toBeInTheDocument();
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
      expect(email()).toHaveAttribute('type', 'email');
      expect(password()).toHaveAttribute('type', 'password');
    });

    it('helps the browser and the password managers with the right autocomplete', async () => {
      await renderPage();

      expect(email()).toHaveAttribute('autocomplete', 'username');
      expect(password()).toHaveAttribute('autocomplete', 'current-password');
    });

    it('marks both fields as required for assistive technology', async () => {
      await renderPage();

      expect(email()).toHaveAttribute('aria-required', 'true');
      expect(password()).toHaveAttribute('aria-required', 'true');
    });

    it('shows no error before the user has done anything', async () => {
      await renderPage();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('links to the registration page', async () => {
      const user = await renderPage();

      const link = screen.getByRole('link', { name: text.register.link });
      expect(link).toHaveAttribute('href', '/registro');
      expect(screen.getByText(text.register.prompt, { exact: false })).toBeInTheDocument();
      await user.click(link);
      expect(await screen.findByTestId('register-page')).toBeInTheDocument();
    });

    it('shows the Google reCAPTCHA notice with links to its policy and terms', async () => {
      await renderPage();

      for (const href of [
        'https://policies.google.com/privacy',
        'https://policies.google.com/terms',
      ]) {
        const link = document.querySelector(`a[href="${href}"]`);
        expect(link).not.toBeNull();
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
    });
  });

  describe('the validation before sending', () => {
    it('shows both required errors, accessible, when the empty form is sent', async () => {
      const user = await renderPage();

      await user.click(submit());

      const alerts = screen.getAllByRole('alert');
      expect(alerts.map((alert) => alert.textContent)).toEqual([
        text.errors.email.REQUIRED,
        text.errors.password.REQUIRED,
      ]);
      expect(email()).toHaveAttribute('aria-invalid', 'true');
      expect(password()).toHaveAttribute('aria-invalid', 'true');
      expect(describedText(email())).toBe(text.errors.email.REQUIRED);
      expect(describedText(password())).toBe(text.errors.password.REQUIRED);
    });

    it('does not ask for a captcha token or call the server when the validation fails', async () => {
      const user = await renderPage();

      await user.click(submit());

      expect(captcha.executeV3).not.toHaveBeenCalled();
      expect(login).not.toHaveBeenCalled();
    });

    it('moves the focus to the first invalid field', async () => {
      const user = await renderPage();

      await user.click(submit());

      expect(email()).toHaveFocus();
    });

    it('shows the format error for an email without domain', async () => {
      const user = await renderPage();
      await fillValidForm(user, { email: 'juan@', password: PASSWORD });

      await user.click(submit());

      expect(screen.getByRole('alert')).toHaveTextContent(text.errors.email.INVALID_FORMAT);
      expect(login).not.toHaveBeenCalled();
    });

    it('shows the error of a field when the user leaves it empty', async () => {
      const user = await renderPage();

      await user.click(email());
      await user.tab();

      expect(screen.getByRole('alert')).toHaveTextContent(text.errors.email.REQUIRED);
    });

    it('removes the error as soon as the field is valid', async () => {
      const user = await renderPage();
      await user.click(submit());

      await user.type(email(), EMAIL);

      expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
        text.errors.password.REQUIRED,
      ]);
      expect(email()).toHaveAttribute('aria-invalid', 'false');
    });

    it('does not trim the password: spaces are part of it', async () => {
      const user = await renderPage();
      await user.type(email(), EMAIL);
      await user.type(password(), '   ');

      await user.click(submit());

      expect(login).toHaveBeenCalledOnce();
    });
  });

  describe('sending the form', () => {
    it('asks for a v3 token with the action login and sends it with the credentials', async () => {
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(captcha.executeV3).toHaveBeenCalledOnce();
      expect(captcha.executeV3).toHaveBeenCalledWith('login');
      expect(login).toHaveBeenCalledOnce();
      expect(login).toHaveBeenCalledWith({
        email: EMAIL,
        password: PASSWORD,
        captcha: { version: 'v3', token: 'v3-token-1' },
      });
    });

    it('asks for a new v3 token in each submit, because each token is valid only once', async () => {
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });
      await user.type(password(), PASSWORD);
      await user.click(submit());

      expect(captcha.executeV3).toHaveBeenCalledTimes(2);
      expect(login.mock.calls.map(([request]) => request.captcha.token)).toEqual([
        'v3-token-1',
        'v3-token-2',
      ]);
    });

    it('does not load or ask anything from Google until the form is sent', async () => {
      await renderPage();

      expect(captcha.executeV3).not.toHaveBeenCalled();
      expect(captcha.renderV2).not.toHaveBeenCalled();
    });

    it('sends only one request when the button is pressed twice in a row', async () => {
      let finish: (outcome: LoginOutcome) => void = () => undefined;
      login.mockImplementationOnce(
        () =>
          new Promise<LoginOutcome>((resolve) => {
            finish = resolve;
          }),
      );
      const user = await renderPage();
      await fillValidForm(user);

      await user.dblClick(submit());
      await act(async () => {
        finish(invalidCredentials);
        await Promise.resolve();
      });

      expect(login).toHaveBeenCalledOnce();
      expect(captcha.executeV3).toHaveBeenCalledOnce();
    });

    it('ignores a second submit made with Enter while the first one is in flight', async () => {
      let finish: (outcome: LoginOutcome) => void = () => undefined;
      login.mockImplementationOnce(
        () =>
          new Promise<LoginOutcome>((resolve) => {
            finish = resolve;
          }),
      );
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());
      await user.type(password(), '{Enter}{Enter}');
      await act(async () => {
        finish(invalidCredentials);
        await Promise.resolve();
      });

      expect(login).toHaveBeenCalledOnce();
    });

    it('disables the button and says it is signing in while the request is in flight', async () => {
      let finish: (outcome: LoginOutcome) => void = () => undefined;
      login.mockImplementationOnce(
        () =>
          new Promise<LoginOutcome>((resolve) => {
            finish = resolve;
          }),
      );
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(await screen.findByRole('button', { name: text.submitting })).toBeDisabled();
      await act(async () => {
        finish(invalidCredentials);
        await Promise.resolve();
      });
      expect(await screen.findByRole('button', { name: text.submit })).toBeEnabled();
    });
  });
});
