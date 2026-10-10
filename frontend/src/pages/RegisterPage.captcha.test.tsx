import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CaptchaUnavailableError, type CaptchaClient } from '../captcha/captchaClient';
import { CaptchaClientContext } from '../captcha/captchaClientContext';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { registrationService, type RegisterOutcome } from '../services/registrationService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { RegisterPage } from './RegisterPage';

const created: RegisterOutcome = {
  status: 'created',
  data: {
    user: {
      id: 'u',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García',
    },
    school: {
      id: 's',
      name: 'CEIP Lluís Vives',
      municipality: { code: '46250', name: 'València', province: 'Valencia/València' },
    },
  },
};
const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: { ...created.data.user, role: 'ADMIN' },
  school: { id: 's', name: 'CEIP Lluís Vives' },
};

/** Cliente de captcha que el test controla: tokens distintos y un reto que se resuelve a mano. */
function controllableCaptcha() {
  let tokens = 0;
  let deliverToken: (token: string | undefined) => void = () => undefined;
  const challenge = { reset: vi.fn(), remove: vi.fn() };
  const executeV3 = vi.fn<CaptchaClient['executeV3']>(() =>
    Promise.resolve(`v3-token-${++tokens}`),
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

describe('RegisterPage captcha', () => {
  let register: MockInstance<typeof registrationService.register>;
  let captcha: ReturnType<typeof controllableCaptcha>;

  beforeEach(() => {
    register = vi.spyOn(registrationService, 'register').mockResolvedValue(created);
    vi.spyOn(registrationService, 'listMunicipalities').mockResolvedValue([
      { code: '46250', name: 'València', province: 'Valencia/València' },
    ]);
    vi.spyOn(sessionService, 'refresh')
      .mockResolvedValueOnce({ status: 'invalidSession' })
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    captcha = controllableCaptcha();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPage(client: CaptchaClient = captcha.client) {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/registro']}>
        <SessionProvider>
          <CaptchaClientContext.Provider value={client}>
            <Routes>
              <Route path="/registro" element={<RegisterPage />} />
              <Route path="/onboarding" element={<div data-testid="onboarding-page" />} />
            </Routes>
          </CaptchaClientContext.Provider>
        </SessionProvider>
      </MemoryRouter>,
    );
    await screen.findByRole('combobox', { name: es.registration.fields.municipalityCode.label });
    return user;
  }

  const password = () => screen.getByLabelText(es.registration.fields.password.label);
  const email = () => screen.getByLabelText(es.registration.fields.email.label);
  const submit = () => screen.getByRole('button', { name: es.registration.submit });
  type User = Awaited<ReturnType<typeof renderPage>>;

  async function fillValidForm(user: User) {
    await user.type(
      screen.getByLabelText(es.registration.fields.schoolName.label),
      'CEIP Lluís Vives',
    );
    await user.type(
      screen.getByRole('combobox', { name: es.registration.fields.municipalityCode.label }),
      'valen',
    );
    await user.click(screen.getByRole('option', { name: /València/ }));
    await user.type(screen.getByLabelText(es.registration.fields.firstName.label), 'José María');
    await user.type(screen.getByLabelText(es.registration.fields.lastName.label), 'García-López');
    await user.type(email(), 'jose.garcia@example.com');
    await user.type(password(), 'Secreta123!');
  }

  const sentCaptcha = (call = 0) => register.mock.calls[call]?.[0].captcha;

  describe('the v3 token', () => {
    it('asks for a new token with the register action on every submit', async () => {
      register.mockResolvedValue({ status: 'unexpected' });
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());
      await waitFor(() => {
        expect(password()).toHaveValue('');
      });

      await user.type(password(), 'Secreta123!');
      await user.click(submit());

      await waitFor(() => {
        expect(register).toHaveBeenCalledTimes(2);
      });
      expect(captcha.executeV3).toHaveBeenCalledTimes(2);
      expect(captcha.executeV3).toHaveBeenCalledWith('register');
      expect(sentCaptcha(0)).toEqual({ version: 'v3', token: 'v3-token-1' });
      expect(sentCaptcha(1)).toEqual({ version: 'v3', token: 'v3-token-2' });
    });

    it('does not send the old provisional token any more', async () => {
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      await screen.findByTestId('onboarding-page');
      expect(JSON.stringify(sentCaptcha())).not.toContain('provisional');
    });

    it('does not ask for a token when the form has errors, so no token is wasted', async () => {
      const user = await renderPage();

      await user.click(submit());

      expect(captcha.executeV3).not.toHaveBeenCalled();
      expect(register).not.toHaveBeenCalled();
    });
  });

  describe('when the server asks for the v2 challenge', () => {
    beforeEach(() => {
      register.mockResolvedValueOnce({ status: 'captchaChallengeRequired' });
    });

    it('shows the challenge with its explanation and keeps every datum, the password included', async () => {
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(await screen.findByText(es.registration.captcha.challenge)).toBeInTheDocument();
      await waitFor(() => {
        expect(captcha.renderV2).toHaveBeenCalledOnce();
      });
      expect(screen.getByTestId('captcha-challenge')).toHaveAttribute('data-rendered', 'true');
      expect(email()).toHaveValue('jose.garcia@example.com');
      expect(password()).toHaveValue('Secreta123!');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps the submit button disabled until the challenge is solved', async () => {
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());
      await screen.findByText(es.registration.captcha.challenge);

      expect(submit()).toBeDisabled();
      captcha.solveChallenge();

      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });
    });

    it('sends the next submit with the v2 token and goes to onboarding, without asking for a new v3 token', async () => {
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());
      await screen.findByText(es.registration.captcha.challenge);
      captcha.solveChallenge('token-del-reto');
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });

      await user.click(submit());

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(sentCaptcha(0)).toEqual({ version: 'v3', token: 'v3-token-1' });
      expect(sentCaptcha(1)).toEqual({ version: 'v2', token: 'token-del-reto' });
      expect(captcha.executeV3).toHaveBeenCalledOnce();
    });

    it('disables the button again when the solved challenge expires', async () => {
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());
      await screen.findByText(es.registration.captcha.challenge);
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

    it('removes the challenge when the page is left', async () => {
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());
      await screen.findByText(es.registration.captcha.challenge);
      captcha.solveChallenge();
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });

      await user.click(submit());
      await screen.findByTestId('onboarding-page');

      expect(captcha.challenge.remove).toHaveBeenCalled();
    });
  });

  describe('when the verification fails', () => {
    it('shows the failure, clears only the password and shows no challenge for a v3 token', async () => {
      register.mockResolvedValueOnce({ status: 'captchaFailed' });
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(es.registration.captcha.failed);
      expect(password()).toHaveValue('');
      expect(email()).toHaveValue('jose.garcia@example.com');
      expect(screen.queryByTestId('captcha-challenge')).not.toBeInTheDocument();
      expect(submit()).toBeEnabled();
    });

    it('resets the challenge and blocks the submit again when the v2 token is rejected', async () => {
      register.mockResolvedValueOnce({ status: 'captchaChallengeRequired' });
      register.mockResolvedValueOnce({ status: 'captchaFailed' });
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());
      await screen.findByText(es.registration.captcha.challenge);
      captcha.solveChallenge();
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });

      await user.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(es.registration.captcha.failed);
      expect(captcha.challenge.reset).toHaveBeenCalledOnce();
      expect(submit()).toBeDisabled();
      expect(password()).toHaveValue('');
    });
  });

  describe('when the verification is not available', () => {
    it('shows the unavailable message when the server answers 503 CAPTCHA_UNAVAILABLE', async () => {
      register.mockResolvedValueOnce({ status: 'captchaUnavailable' });
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(es.registration.captcha.unavailable);
      expect(alert.textContent).not.toMatch(/503|error|exception/i);
      expect(password()).toHaveValue('');
      expect(email()).toHaveValue('jose.garcia@example.com');
    });

    it('shows the unavailable message without calling the backend when the script does not load', async () => {
      captcha.executeV3.mockRejectedValueOnce(new CaptchaUnavailableError());
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.registration.captcha.unavailable,
      );
      expect(register).not.toHaveBeenCalled();
      expect(submit()).toBeEnabled();
      expect(password()).toHaveValue('');
    });

    it('shows the unavailable message when the challenge cannot be rendered', async () => {
      register.mockResolvedValueOnce({ status: 'captchaChallengeRequired' });
      captcha.renderV2.mockRejectedValueOnce(new CaptchaUnavailableError());
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.registration.captcha.unavailable,
      );
    });

    it('hides the old message when the user tries again', async () => {
      register.mockResolvedValueOnce({ status: 'captchaFailed' });
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());
      await screen.findByRole('alert');

      await user.type(password(), 'Secreta123!');
      await user.click(submit());

      await screen.findByTestId('onboarding-page');
      expect(screen.queryByText(es.registration.captcha.failed)).not.toBeInTheDocument();
    });
  });

  describe('the privacy notice of Google', () => {
    it('shows the notice with links to the privacy policy and the terms, in a new tab', async () => {
      await renderPage();

      const privacy = screen.getByRole('link', {
        name: es.registration.captcha.privacy.privacyLink,
      });
      const terms = screen.getByRole('link', { name: es.registration.captcha.privacy.termsLink });

      expect(privacy).toHaveAttribute('href', 'https://policies.google.com/privacy');
      expect(terms).toHaveAttribute('href', 'https://policies.google.com/terms');
      for (const link of [privacy, terms]) {
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      }
      expect(screen.getByText(/protegido por reCAPTCHA/)).toBeInTheDocument();
    });
  });
});
