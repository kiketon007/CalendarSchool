import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CaptchaClientContext } from '../captcha/captchaClientContext';
import { createFakeCaptchaClient } from '../captcha/fakeCaptchaClient';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { REGISTRATION_DRAFT_KEY } from '../services/registrationDraft';
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
      lastName: 'García-López',
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
const validDraft = {
  schoolName: 'CEIP Lluís Vives',
  municipalityCode: '46250',
  firstName: 'José María',
  lastName: 'García-López',
  email: 'jose.garcia@example.com',
};

const savedDraft = (): unknown => {
  const raw = window.sessionStorage.getItem(REGISTRATION_DRAFT_KEY);
  return raw === null ? undefined : (JSON.parse(raw) as unknown);
};
const storeDraft = (draft: unknown) => {
  window.sessionStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(draft));
};

describe('RegisterPage draft', () => {
  let register: MockInstance<typeof registrationService.register>;
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    register = vi.spyOn(registrationService, 'register').mockResolvedValue(created);
    vi.spyOn(registrationService, 'listMunicipalities').mockResolvedValue([
      { code: '46250', name: 'València', province: 'Valencia/València' },
    ]);
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValueOnce({ status: 'invalidSession' })
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPage() {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/registro']}>
        <SessionProvider>
          <CaptchaClientContext.Provider value={createFakeCaptchaClient()}>
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

  const schoolName = () => screen.getByLabelText(es.registration.fields.schoolName.label);
  const municipality = () =>
    screen.getByRole('combobox', { name: es.registration.fields.municipalityCode.label });
  const firstName = () => screen.getByLabelText(es.registration.fields.firstName.label);
  const lastName = () => screen.getByLabelText(es.registration.fields.lastName.label);
  const email = () => screen.getByLabelText(es.registration.fields.email.label);
  const password = () => screen.getByLabelText(es.registration.fields.password.label);
  const submit = () => screen.getByRole('button', { name: es.registration.submit });
  type User = Awaited<ReturnType<typeof renderPage>>;

  async function fillValidForm(user: User) {
    await user.type(schoolName(), 'CEIP Lluís Vives');
    await user.type(municipality(), 'valen');
    await user.click(screen.getByRole('option', { name: /València/ }));
    await user.type(firstName(), 'José María');
    await user.type(lastName(), 'García-López');
    await user.type(email(), 'jose.garcia@example.com');
    await user.type(password(), 'Secreta123!');
  }

  describe('restoring the form', () => {
    it('restores the saved values on mount, with an empty password and no errors', async () => {
      storeDraft(validDraft);

      await renderPage();

      expect(schoolName()).toHaveValue('CEIP Lluís Vives');
      expect(municipality()).toHaveValue('València');
      expect(firstName()).toHaveValue('José María');
      expect(lastName()).toHaveValue('García-López');
      expect(email()).toHaveValue('jose.garcia@example.com');
      expect(password()).toHaveValue('');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(document.querySelector('.is-invalid')).toBeNull();
    });

    it('starts empty when there is no draft', async () => {
      await renderPage();

      expect(schoolName()).toHaveValue('');
      expect(email()).toHaveValue('');
    });

    it('restores only the valid fields of a manipulated draft', async () => {
      storeDraft({ email: 'a@b.es', schoolName: 5, password: 'x', extra: 'y' });

      await renderPage();

      expect(email()).toHaveValue('a@b.es');
      expect(schoolName()).toHaveValue('');
      expect(password()).toHaveValue('');
    });

    it('starts empty when the draft is not JSON', async () => {
      window.sessionStorage.setItem(REGISTRATION_DRAFT_KEY, '{no es json');

      await renderPage();

      expect(email()).toHaveValue('');
    });

    it('shows the errors of restored values only after leaving the field', async () => {
      storeDraft({ ...validDraft, email: 'sin-arroba' });

      const user = await renderPage();
      expect(email()).toHaveAttribute('aria-invalid', 'false');

      await user.click(email());
      await user.tab();

      expect(email()).toHaveAttribute('aria-invalid', 'true');
    });

    it('leaves the municipality unselected when it is not in the list', async () => {
      storeDraft({ ...validDraft, municipalityCode: '99999' });

      await renderPage();

      await waitFor(() => {
        expect(municipality()).toHaveValue('');
      });
      expect(email()).toHaveValue('jose.garcia@example.com');
      await waitFor(() => {
        expect(savedDraft()).toMatchObject({ municipalityCode: '' });
      });
    });
  });

  describe('saving the form', () => {
    it('saves every change except the password', async () => {
      const user = await renderPage();

      await fillValidForm(user);

      expect(savedDraft()).toEqual(validDraft);
      expect(window.sessionStorage.getItem(REGISTRATION_DRAFT_KEY)).not.toContain('Secreta123!');
    });

    it('works without storage', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('bloqueado', 'SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('cuota', 'QuotaExceededError');
      });
      const user = await renderPage();

      await fillValidForm(user);
      await user.click(submit());

      await waitFor(() => {
        expect(screen.getByTestId('onboarding-page')).toBeInTheDocument();
      });
      expect(register).toHaveBeenCalledTimes(1);
    });
  });

  describe('after the server answers', () => {
    it('removes the draft after a 201 and does not write it again', async () => {
      const user = await renderPage();
      await fillValidForm(user);
      refresh.mockReset().mockResolvedValue({ status: 'authenticated', data: sessionData });

      await user.click(submit());

      await waitFor(() => {
        expect(screen.getByTestId('onboarding-page')).toBeInTheDocument();
      });
      expect(savedDraft()).toBeUndefined();
    });

    it.each([
      ['cookies disabled', { status: 'invalidSession' } as const],
      ['an unavailable session', { status: 'unexpected' } as const],
    ])(
      'removes the draft after a 201 with %s and does not write it again',
      async (_name, session) => {
        const user = await renderPage();
        await fillValidForm(user);
        refresh.mockReset().mockResolvedValue(session);

        await user.click(submit());

        await screen.findByRole('alert');
        expect(savedDraft()).toBeUndefined();
        expect(screen.queryByLabelText(es.registration.fields.email.label)).not.toBeInTheDocument();
      },
    );

    it.each<[string, RegisterOutcome]>([
      ['400', { status: 'validation', details: [] }],
      ['409 email', { status: 'emailAlreadyRegistered' }],
      ['409 school', { status: 'schoolAlreadyRegistered' }],
      ['422 failed captcha', { status: 'captchaFailed' }],
      ['422 challenge required', { status: 'captchaChallengeRequired' }],
      ['429', { status: 'tooManyRequests', retryAfterSeconds: 60 }],
      ['503', { status: 'captchaUnavailable' }],
      ['an unexpected error', { status: 'unexpected' }],
    ])('keeps the draft after %s', async (_name, outcome) => {
      register.mockResolvedValue(outcome);
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      await waitFor(() => {
        expect(register).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: es.registration.submitting }),
        ).not.toBeInTheDocument();
      });
      expect(savedDraft()).toEqual(validDraft);
    });
  });

  describe('repeated submits', () => {
    it('sends a single request when the form is submitted twice in a row', async () => {
      let resolveRegister: (outcome: RegisterOutcome) => void = () => undefined;
      register.mockReturnValue(
        new Promise<RegisterOutcome>((resolve) => {
          resolveRegister = resolve;
        }),
      );
      const user = await renderPage();
      await fillValidForm(user);
      const form = submit().closest('form');

      await act(async () => {
        form?.requestSubmit();
        form?.requestSubmit();
        await Promise.resolve();
      });

      expect(register).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: es.registration.submitting })).toBeDisabled();

      await act(async () => {
        resolveRegister({ status: 'unexpected' });
        await Promise.resolve();
      });
    });

    it('sends a new request after an answer with an error that can be corrected', async () => {
      register.mockResolvedValueOnce({ status: 'unexpected' }).mockResolvedValue(created);
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());
      await waitFor(() => {
        expect(register).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(submit()).toBeEnabled();
      });
      await user.type(password(), 'Secreta123!');
      await user.click(submit());

      await waitFor(() => {
        expect(register).toHaveBeenCalledTimes(2);
      });
    });
  });
});
