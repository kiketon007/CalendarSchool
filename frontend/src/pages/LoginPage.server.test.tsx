import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CaptchaUnavailableError, type CaptchaClient } from '../captcha/captchaClient';
import { CaptchaClientContext } from '../captcha/captchaClientContext';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { loginService, type LoginOutcome } from '../services/loginService';
import { sessionService, type RefreshOutcome, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { LoginPage } from './LoginPage';

const text = es.login;
const EMAIL = 'jose.garcia@example.com';
const PASSWORD = 'Secreta123!';

const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: EMAIL,
    firstName: 'José María',
    lastName: 'García-López',
    role: 'ADMIN',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};
const authenticated: RefreshOutcome = { status: 'authenticated', data: sessionData };

/** Cliente de captcha que el test controla: tokens distintos y un reto que se resuelve a mano. */
function controllableCaptcha() {
  let tokens = 0;
  let deliverToken: (token: string | undefined) => void = () => undefined;
  const challenge = { reset: vi.fn(), remove: vi.fn() };
  const executeV3 = vi.fn<CaptchaClient['executeV3']>(() =>
    Promise.resolve(`v3-token-${String(++tokens)}`),
  );
  const renderV2 = vi.fn<CaptchaClient['renderV2']>((container, onToken) => {
    deliverToken = onToken;
    container.dataset.rendered = 'true';
    return Promise.resolve(challenge);
  });
  return {
    client: { executeV3, renderV2 } satisfies CaptchaClient,
    executeV3,
    renderV2,
    challenge,
    solveChallenge: (token = 'v2-token') => {
      act(() => {
        deliverToken(token);
      });
    },
  };
}

describe('LoginPage: the answers of the server', () => {
  let login: MockInstance<typeof loginService.login>;
  let refresh: MockInstance<typeof sessionService.refresh>;
  let captcha: ReturnType<typeof controllableCaptcha>;

  beforeEach(() => {
    login = vi.spyOn(loginService, 'login').mockResolvedValue({ status: 'loggedIn' });
    // La primera renovación es la del arranque (sin sesión); las siguientes, la posterior al login.
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValueOnce({ status: 'invalidSession' })
      .mockResolvedValue(authenticated);
    captcha = controllableCaptcha();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPage(client: CaptchaClient = captcha.client) {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login']}>
        <SessionProvider>
          <CaptchaClientContext.Provider value={client}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/onboarding" element={<div data-testid="onboarding-page" />} />
            </Routes>
          </CaptchaClientContext.Provider>
        </SessionProvider>
      </MemoryRouter>,
    );
    await screen.findByLabelText(text.fields.email.label);
    return user;
  }

  const email = () => screen.getByLabelText<HTMLInputElement>(text.fields.email.label);
  const password = () => screen.getByLabelText<HTMLInputElement>(text.fields.password.label);
  const submit = () => screen.getByRole('button', { name: text.submit });

  type User = Awaited<ReturnType<typeof renderPage>>;

  async function fillAndSubmit(user: User) {
    await user.type(email(), EMAIL);
    await user.type(password(), PASSWORD);
    await user.click(submit());
  }

  /** Envía el formulario y espera a que el servidor responda `outcome`, con el aviso en pantalla. */
  async function submitWith(user: User, outcome: LoginOutcome) {
    login.mockResolvedValueOnce(outcome);
    await fillAndSubmit(user);
  }

  describe('a correct login', () => {
    it('gets the session with a renewal and goes to onboarding', async () => {
      const user = await renderPage();

      await fillAndSubmit(user);

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('does not show any error when it succeeds', async () => {
      const user = await renderPage();

      await fillAndSubmit(user);

      await screen.findByTestId('onboarding-page');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('warns that cookies are needed when the browser did not accept the session cookie', async () => {
      refresh.mockReset().mockResolvedValue({ status: 'invalidSession' });
      const user = await renderPage();

      await fillAndSubmit(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(text.session.cookiesDisabled);
      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
    });

    it('warns of a temporary error when the session cannot be checked for another reason', async () => {
      refresh
        .mockReset()
        .mockResolvedValueOnce({ status: 'invalidSession' })
        .mockResolvedValue({ status: 'unexpected' });
      const user = await renderPage();

      await fillAndSubmit(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(text.session.unavailable);
      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
    });

    it('lets the user try again after a session warning, with the form still on screen', async () => {
      refresh.mockReset().mockResolvedValue({ status: 'invalidSession' });
      const user = await renderPage();
      await fillAndSubmit(user);
      await screen.findByRole('alert');

      expect(email()).toHaveValue(EMAIL);
      expect(submit()).toBeEnabled();
    });
  });

  describe('credentials that are not valid', () => {
    it('shows the generic message, without saying which of the two is wrong', async () => {
      const user = await renderPage();

      await submitWith(user, { status: 'invalidCredentials' });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(text.server.invalidCredentials);
      expect(alert.textContent).not.toMatch(/contraseña es incorrecta|email no existe/i);
    });

    it('keeps the email and empties the password', async () => {
      const user = await renderPage();

      await submitWith(user, { status: 'invalidCredentials' });

      await screen.findByRole('alert');
      expect(email()).toHaveValue(EMAIL);
      expect(password()).toHaveValue('');
    });

    it('does not complain about the empty password until the user sends the form again', async () => {
      const user = await renderPage();

      await submitWith(user, { status: 'invalidCredentials' });

      await screen.findByRole('alert');
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(password()).toHaveAttribute('aria-invalid', 'false');
    });

    it('clears the message when the form is sent again', async () => {
      const user = await renderPage();
      await submitWith(user, { status: 'invalidCredentials' });
      await screen.findByRole('alert');

      await user.type(password(), PASSWORD);
      await user.click(submit());

      await screen.findByTestId('onboarding-page');
      expect(screen.queryByText(text.server.invalidCredentials)).not.toBeInTheDocument();
    });
  });

  it('tells a suspended user to contact the administrator, and does not go on', async () => {
    const user = await renderPage();

    await submitWith(user, { status: 'accountSuspended' });

    expect(await screen.findByRole('alert')).toHaveTextContent(text.server.accountSuspended);
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
    expect(password()).toHaveValue('');
  });

  describe('too many attempts', () => {
    it.each([
      [1, 1],
      [61, 2],
      [840, 14],
    ])(
      'Retry-After of %i seconds is shown as %i minute(s), rounded up',
      async (seconds, minutes) => {
        const user = await renderPage();

        await submitWith(user, { status: 'tooManyRequests', retryAfterSeconds: seconds });

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(new RegExp(`\\b${String(minutes)} minutos?\\b`));
      },
    );

    it('says to try later when the server gives no wait', async () => {
      const user = await renderPage();

      await submitWith(user, { status: 'tooManyRequests', retryAfterSeconds: undefined });

      expect(await screen.findByRole('alert')).toHaveTextContent(text.server.tooManyRequestsLater);
    });

    it('empties the password, because the attempt was not made', async () => {
      const user = await renderPage();

      await submitWith(user, { status: 'tooManyRequests', retryAfterSeconds: 60 });

      await screen.findByRole('alert');
      expect(password()).toHaveValue('');
      expect(email()).toHaveValue(EMAIL);
    });
  });

  it('shows a temporary error, never a technical one, when the service is not available', async () => {
    const user = await renderPage();

    await submitWith(user, { status: 'unavailable' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text.server.unavailable);
    expect(alert.textContent).not.toMatch(/503|500|CAPTCHA|DATABASE|undefined|error:/i);
    expect(password()).toHaveValue('');
  });

  describe('the v2 challenge', () => {
    async function withChallenge(user: User) {
      await submitWith(user, { status: 'captchaChallengeRequired' });
      await screen.findByText(es.captcha.challenge);
    }

    it('appears when the server asks for it, and keeps the email and the password', async () => {
      const user = await renderPage();

      await withChallenge(user);

      expect(await screen.findByTestId('captcha-challenge')).toHaveAttribute(
        'data-rendered',
        'true',
      );
      expect(captcha.renderV2).toHaveBeenCalledOnce();
      expect(email()).toHaveValue(EMAIL);
      expect(password()).toHaveValue(PASSWORD);
    });

    it('is not an error: no alert is shown when it is asked for', async () => {
      const user = await renderPage();

      await withChallenge(user);

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('blocks the button until the challenge is solved', async () => {
      const user = await renderPage();
      await withChallenge(user);

      expect(submit()).toBeDisabled();
      captcha.solveChallenge();

      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });
    });

    it('blocks the button again when the solved challenge expires', async () => {
      const user = await renderPage();
      await withChallenge(user);
      captcha.solveChallenge();
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });

      act(() => {
        captcha.renderV2.mock.calls[0]?.[1](undefined);
      });

      await waitFor(() => {
        expect(submit()).toBeDisabled();
      });
    });

    it('sends the v2 token with the same credentials, without asking for a new v3 token', async () => {
      const user = await renderPage();
      await withChallenge(user);
      captcha.solveChallenge('v2-token');
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });

      await user.click(submit());

      expect(captcha.executeV3).toHaveBeenCalledOnce();
      expect(login).toHaveBeenLastCalledWith({
        email: EMAIL,
        password: PASSWORD,
        captcha: { version: 'v2', token: 'v2-token' },
      });
      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    });

    it('resets the challenge and shows the failure when the server rejects the token', async () => {
      const user = await renderPage();
      await withChallenge(user);
      captcha.solveChallenge('v2-token');
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });
      login.mockResolvedValueOnce({ status: 'captchaFailed' });

      await user.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(es.captcha.failed);
      expect(captcha.challenge.reset).toHaveBeenCalledOnce();
      expect(submit()).toBeDisabled();
    });

    it('goes away when the page is left', async () => {
      const user = await renderPage();
      await withChallenge(user);
      login.mockResolvedValueOnce({ status: 'loggedIn' });
      captcha.solveChallenge();
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });

      await user.click(submit());

      await screen.findByTestId('onboarding-page');
      expect(captcha.challenge.remove).toHaveBeenCalled();
    });
  });

  describe('the captcha', () => {
    it('shows that the verification failed when the server rejects the token', async () => {
      const user = await renderPage();

      await submitWith(user, { status: 'captchaFailed' });

      expect(await screen.findByRole('alert')).toHaveTextContent(es.captcha.failed);
      expect(password()).toHaveValue('');
    });

    it('does not call the server when the Google script does not load', async () => {
      captcha.executeV3.mockRejectedValueOnce(new CaptchaUnavailableError());
      const user = await renderPage();

      await fillAndSubmit(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(es.captcha.unavailable);
      expect(login).not.toHaveBeenCalled();
      expect(password()).toHaveValue('');
      expect(submit()).toBeEnabled();
    });

    it('hides the challenge and warns when it cannot be drawn', async () => {
      const user = await renderPage();
      captcha.renderV2.mockRejectedValueOnce(new CaptchaUnavailableError());

      await submitWith(user, { status: 'captchaChallengeRequired' });

      expect(await screen.findByRole('alert')).toHaveTextContent(es.captcha.unavailable);
      expect(screen.queryByTestId('captcha-challenge')).not.toBeInTheDocument();
      expect(submit()).toBeEnabled();
    });

    it('shows the temporary error, and leaves the form usable, for any other failure of the captcha client', async () => {
      captcha.executeV3.mockRejectedValueOnce(new Error('fallo inesperado'));
      const user = await renderPage();

      await fillAndSubmit(user);

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(text.server.unavailable);
      expect(alert.textContent).not.toContain('fallo inesperado');
      expect(login).not.toHaveBeenCalled();
      expect(submit()).toBeEnabled();
    });
  });
});
