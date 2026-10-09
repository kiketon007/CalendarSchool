import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import {
  registrationService,
  type Municipality,
  type RegisterOutcome,
} from '../services/registrationService';
import { sessionService, type RefreshOutcome, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { RegisterPage } from './RegisterPage';

const municipalities: Municipality[] = [
  { code: '03014', name: 'Alacant/Alicante', province: 'Alicante/Alacant' },
  { code: '46250', name: 'València', province: 'Valencia/València' },
];

const created: RegisterOutcome = {
  status: 'created',
  data: {
    user: {
      id: '0192f5a0-0000-7000-8000-0000000000a1',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García-López',
    },
    school: {
      id: '0192f5a0-0000-7000-8000-000000000001',
      name: 'CEIP Lluís Vives',
      municipality: municipalities[1] as Municipality,
    },
  },
};

const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: { ...created.data.user, role: 'ADMIN' },
  school: { id: created.data.school.id, name: created.data.school.name },
};
const authenticated: RefreshOutcome = { status: 'authenticated', data: sessionData };

const errors = es.registration.errors;

describe('RegisterPage', () => {
  let register: MockInstance<typeof registrationService.register>;
  let listMunicipalities: MockInstance<typeof registrationService.listMunicipalities>;
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    register = vi.spyOn(registrationService, 'register').mockResolvedValue(created);
    // La primera renovación es la del arranque (sin sesión); las siguientes, la posterior al alta.
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValueOnce({ status: 'invalidSession' })
      .mockResolvedValue(authenticated);
    listMunicipalities = vi
      .spyOn(registrationService, 'listMunicipalities')
      .mockResolvedValue(municipalities);
  });

  afterEach(() => {
    register.mockRestore();
    listMunicipalities.mockRestore();
    refresh.mockRestore();
  });

  /** La página dentro del router y de la sesión, sin esperar a que cargue la lista de municipios. */
  function renderRegisterPage() {
    render(
      <MemoryRouter initialEntries={['/registro']}>
        <SessionProvider>
          <Routes>
            <Route path="/registro" element={<RegisterPage />} />
            <Route path="/onboarding" element={<div data-testid="onboarding-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  async function renderPage() {
    const user = userEvent.setup();
    renderRegisterPage();
    await screen.findByRole('combobox', { name: es.registration.fields.municipalityCode.label });
    return user;
  }

  const field = (label: string) => screen.getByLabelText(label);
  const schoolName = () => field(es.registration.fields.schoolName.label);
  const municipality = () =>
    screen.getByRole('combobox', { name: es.registration.fields.municipalityCode.label });
  const firstName = () => field(es.registration.fields.firstName.label);
  const lastName = () => field(es.registration.fields.lastName.label);
  const email = () => field(es.registration.fields.email.label);
  const password = () => field(es.registration.fields.password.label);
  const submit = () => screen.getByRole('button', { name: es.registration.submit });

  type User = Awaited<ReturnType<typeof renderPage>>;

  async function fillValidForm(user: User, overrides: { password?: string; email?: string } = {}) {
    await user.type(schoolName(), 'CEIP Lluís Vives');
    await user.type(municipality(), 'valen');
    await user.click(screen.getByRole('option', { name: /València/ }));
    await user.type(firstName(), 'José María');
    await user.type(lastName(), 'García-López');
    await user.type(email(), overrides.email ?? 'jose.garcia@example.com');
    await user.type(password(), overrides.password ?? 'Secreta123!');
  }

  /** Mensaje de error de un campo, el que su `aria-describedby` apunta. */
  function errorOf(control: HTMLElement): HTMLElement | null {
    const ids = (control.getAttribute('aria-describedby') ?? '').split(' ');
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element?.getAttribute('role') === 'alert') {
        return element;
      }
    }
    return null;
  }

  it('renders the registration form with its stable test id', async () => {
    await renderPage();

    expect(screen.getByTestId('register-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(es.registration.title);
    for (const control of [schoolName(), municipality(), firstName(), lastName(), email()]) {
      expect(control).toBeInTheDocument();
    }
    expect(password()).toHaveAttribute('type', 'password');
    expect(submit()).toBeEnabled();
  });

  describe('client validation', () => {
    it('does not send the form and shows an inline error under every empty field', async () => {
      const user = await renderPage();

      await user.click(submit());

      expect(register).not.toHaveBeenCalled();
      expect(errorOf(schoolName())).toHaveTextContent(errors.schoolName.REQUIRED);
      expect(errorOf(municipality())).toHaveTextContent(errors.municipalityCode.REQUIRED);
      expect(errorOf(firstName())).toHaveTextContent(errors.firstName.REQUIRED);
      expect(errorOf(lastName())).toHaveTextContent(errors.lastName.REQUIRED);
      expect(errorOf(email())).toHaveTextContent(errors.email.REQUIRED);
      expect(errorOf(password())).toHaveTextContent(errors.password.REQUIRED);
    });

    it('marks the invalid fields for assistive technology and focuses the first one', async () => {
      const user = await renderPage();

      await user.click(submit());

      for (const control of [schoolName(), municipality(), firstName(), email(), password()]) {
        expect(control).toHaveAttribute('aria-invalid', 'true');
        expect(errorOf(control)).toHaveAttribute('role', 'alert');
      }
      expect(schoolName()).toHaveFocus();
    });

    it('shows the password length error for a short password', async () => {
      const user = await renderPage();
      await fillValidForm(user, { password: 'Aa1!' });

      await user.click(submit());

      expect(errorOf(password())).toHaveTextContent(errors.password.INVALID_LENGTH);
      expect(register).not.toHaveBeenCalled();
    });

    it('measures the password in bytes: 73 bytes are too long', async () => {
      const user = await renderPage();
      await fillValidForm(user);
      fireEvent.change(password(), { target: { value: `Aa1!a${'ñ'.repeat(34)}` } });

      await user.click(submit());

      expect(errorOf(password())).toHaveTextContent(errors.password.INVALID_LENGTH);
    });

    it('shows the weak password error when a character class is missing', async () => {
      const user = await renderPage();
      await fillValidForm(user, { password: 'secreta1234' });

      await user.click(submit());

      expect(errorOf(password())).toHaveTextContent(errors.password.WEAK_PASSWORD);
    });

    it('shows the invalid email error', async () => {
      const user = await renderPage();
      await fillValidForm(user, { email: 'usuario@localhost' });

      await user.click(submit());

      expect(errorOf(email())).toHaveTextContent(errors.email.INVALID_FORMAT);
      expect(register).not.toHaveBeenCalled();
    });

    it('shows the school name error for characters that are not allowed', async () => {
      const user = await renderPage();
      await fillValidForm(user);
      fireEvent.change(schoolName(), { target: { value: '<script>' } });

      await user.click(submit());

      expect(errorOf(schoolName())).toHaveTextContent(errors.schoolName.INVALID_CHARACTERS);
    });

    it('requires a municipality chosen from the list, not free text', async () => {
      const user = await renderPage();
      await fillValidForm(user);
      await user.clear(municipality());
      await user.type(municipality(), 'ciudad inventada');

      await user.click(submit());

      expect(errorOf(municipality())).toHaveTextContent(errors.municipalityCode.REQUIRED);
      expect(register).not.toHaveBeenCalled();
    });

    it('validates a field when it loses focus and clears the error once it is fixed', async () => {
      const user = await renderPage();

      await user.type(email(), 'sin-arroba');
      await user.tab();
      expect(errorOf(email())).toHaveTextContent(errors.email.INVALID_FORMAT);

      await user.type(email(), '@example.com');
      expect(errorOf(email())).toBeNull();
      expect(email()).toHaveAttribute('aria-invalid', 'false');
    });

    it('does not show errors for fields the user has not touched yet', async () => {
      const user = await renderPage();

      await user.type(schoolName(), 'a');

      expect(screen.queryAllByRole('alert')).toHaveLength(0);
    });
  });

  describe('submission', () => {
    it('sends the values with the provisional captcha token', async () => {
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(register).toHaveBeenCalledWith({
        schoolName: 'CEIP Lluís Vives',
        municipalityCode: '46250',
        firstName: 'José María',
        lastName: 'García-López',
        email: 'jose.garcia@example.com',
        password: 'Secreta123!',
        captcha: { version: 'v3', token: expect.any(String) as string },
      });
      await screen.findByTestId('onboarding-page');
    });

    it('gets the session with refresh after the sign-up and goes to the onboarding page', async () => {
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      // La del arranque y la posterior al alta, que obtiene el access token.
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps the button disabled until the session is obtained', async () => {
      let finishRefresh: (outcome: RefreshOutcome) => void = () => undefined;
      const user = await renderPage();
      await fillValidForm(user);
      refresh.mockReturnValueOnce(
        new Promise<RefreshOutcome>((resolve) => {
          finishRefresh = resolve;
        }),
      );

      await user.click(submit());

      expect(
        await screen.findByRole('button', { name: es.registration.submitting }),
      ).toBeDisabled();
      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
      finishRefresh(authenticated);
      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    });

    describe('when the session cannot be started after the account is created', () => {
      it('warns that cookies are needed, without redirecting or offering the form again', async () => {
        const user = await renderPage();
        await fillValidForm(user);
        refresh.mockResolvedValueOnce({ status: 'invalidSession' });

        await user.click(submit());

        expect(await screen.findByRole('alert')).toHaveTextContent(
          es.registration.session.cookiesDisabled,
        );
        expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: es.registration.submit })).toBeNull();
        expect(screen.queryByLabelText(es.registration.fields.password.label)).toBeNull();
        expect(register).toHaveBeenCalledTimes(1);
      });

      it('shows a clear message without technical details when the session cannot be checked', async () => {
        const user = await renderPage();
        await fillValidForm(user);
        refresh.mockResolvedValueOnce({ status: 'unexpected' });

        await user.click(submit());

        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(es.registration.session.unavailable);
        expect(alert).not.toHaveTextContent(es.registration.session.cookiesDisabled);
        expect(alert.textContent).not.toMatch(/500|exception|undefined/i);
        expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: es.registration.submit })).toBeNull();
      });
    });

    it('disables the button while the request is pending and sends it only once', async () => {
      let finish: (outcome: RegisterOutcome) => void = () => undefined;
      register.mockReturnValue(
        new Promise<RegisterOutcome>((resolve) => {
          finish = resolve;
        }),
      );
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());
      const pending = screen.getByRole('button', { name: es.registration.submitting });
      await user.click(pending);

      expect(pending).toBeDisabled();
      expect(register).toHaveBeenCalledTimes(1);
      finish(created);
      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    });

    it('ignores a second submit event while the request is pending', async () => {
      register.mockReturnValue(new Promise<RegisterOutcome>(() => undefined));
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());

      // Un envío por teclado o por script no pasa por el botón deshabilitado.
      fireEvent.submit(
        screen.getByTestId('register-page').querySelector('form') as HTMLFormElement,
      );

      expect(register).toHaveBeenCalledTimes(1);
    });

    it('shows the email already registered message with a link to the login', async () => {
      register.mockResolvedValue({ status: 'emailAlreadyRegistered' });
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      const message = await waitFor(() => {
        const element = errorOf(email());
        expect(element).not.toBeNull();
        return element as HTMLElement;
      });
      expect(message).toHaveTextContent(es.registration.server.emailAlreadyRegistered);
      expect(
        within(message).getByRole('link', { name: es.registration.server.goToLogin }),
      ).toHaveAttribute('href', '/login');
      expect(email()).toHaveAttribute('aria-invalid', 'true');
    });

    it('shows the school already registered message and asks for an invitation', async () => {
      register.mockResolvedValue({ status: 'schoolAlreadyRegistered' });
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      await waitFor(() => {
        expect(errorOf(schoolName())).toHaveTextContent(
          es.registration.server.schoolAlreadyRegistered,
        );
      });
    });

    it('shows the backend field errors under each field, translated by field and code', async () => {
      register.mockResolvedValue({
        status: 'validation',
        details: [
          { field: 'email', code: 'INVALID_FORMAT' },
          { field: 'municipalityCode', code: 'INVALID_FORMAT' },
          { field: 'desconocido', code: 'REQUIRED' },
        ],
      });
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      await waitFor(() => {
        expect(errorOf(email())).toHaveTextContent(errors.email.INVALID_FORMAT);
      });
      expect(errorOf(municipality())).toHaveTextContent(errors.municipalityCode.INVALID_FORMAT);
      expect(screen.getAllByRole('alert')).toHaveLength(2);
    });

    it('uses a generic message for a field error without translation', async () => {
      register.mockResolvedValue({
        status: 'validation',
        details: [{ field: 'firstName', code: 'WEAK_PASSWORD' }],
      });
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      await waitFor(() => {
        expect(errorOf(firstName())).toHaveTextContent(errors.invalidField);
      });
    });

    it('removes a server error as soon as the user edits that field', async () => {
      register.mockResolvedValue({ status: 'emailAlreadyRegistered' });
      const user = await renderPage();
      await fillValidForm(user);
      await user.click(submit());
      await waitFor(() => {
        expect(errorOf(email())).not.toBeNull();
      });

      await user.type(email(), 'x');

      expect(errorOf(email())).toBeNull();
    });

    describe('when the server answers 429 because of too many attempts', () => {
      const tooMany = (retryAfterSeconds: number | undefined): RegisterOutcome => ({
        status: 'tooManyRequests',
        retryAfterSeconds,
      });
      const server = es.registration.server;
      const withMinutes = (template: string, count: number) =>
        template.replace('{{count}}', String(count));

      it.each([
        ['840 seconds', 840, withMinutes(server.tooManyRequests_other, 14)],
        ['841 seconds, rounded up', 841, withMinutes(server.tooManyRequests_other, 15)],
        ['900 seconds', 900, withMinutes(server.tooManyRequests_other, 15)],
        ['61 seconds', 61, withMinutes(server.tooManyRequests_other, 2)],
        ['60 seconds', 60, withMinutes(server.tooManyRequests_one, 1)],
        ['20 seconds', 20, withMinutes(server.tooManyRequests_one, 1)],
        ['0 seconds', 0, withMinutes(server.tooManyRequests_one, 1)],
      ])('tells how many minutes to wait for %s', async (_case, seconds, expected) => {
        register.mockResolvedValue(tooMany(seconds));
        const user = await renderPage();
        await fillValidForm(user);

        await user.click(submit());

        expect(await screen.findByRole('alert')).toHaveTextContent(expected);
      });

      it('tells to try again later when the wait is unknown', async () => {
        register.mockResolvedValue(tooMany(undefined));
        const user = await renderPage();
        await fillValidForm(user);

        await user.click(submit());

        expect(await screen.findByRole('alert')).toHaveTextContent(server.tooManyRequestsLater);
      });

      it('shows it instead of the generic error and keeps the data except the password', async () => {
        register.mockResolvedValue(tooMany(840));
        const user = await renderPage();
        await fillValidForm(user);

        await user.click(submit());

        const alert = await screen.findByRole('alert');
        expect(alert).not.toHaveTextContent(server.unexpected);
        expect(alert.textContent).not.toMatch(/429|TOO_MANY|error|exception/i);
        expect(schoolName()).toHaveValue('CEIP Lluís Vives');
        expect(municipality()).toHaveValue('València');
        expect(email()).toHaveValue('jose.garcia@example.com');
        expect(password()).toHaveValue('');
        expect(submit()).toBeEnabled();
        expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
      });

      it('does not start a session or ask for one', async () => {
        register.mockResolvedValue(tooMany(840));
        const user = await renderPage();
        await fillValidForm(user);

        await user.click(submit());
        await screen.findByRole('alert');

        // Solo la renovación del arranque: no hay cuenta creada, así que no hay sesión que obtener.
        expect(refresh).toHaveBeenCalledTimes(1);
      });

      it('hides the warning when the user submits again and the attempt is accepted', async () => {
        register.mockResolvedValueOnce(tooMany(840));
        const user = await renderPage();
        await fillValidForm(user);
        await user.click(submit());
        await screen.findByRole('alert');

        await user.type(password(), 'Secreta123!');
        await user.click(submit());

        expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      });
    });

    it('shows a generic message for an unexpected error and keeps the data except the password', async () => {
      register.mockResolvedValue({ status: 'unexpected' });
      const user = await renderPage();
      await fillValidForm(user);

      await user.click(submit());

      expect(await screen.findByRole('alert')).toHaveTextContent(es.registration.server.unexpected);
      expect(screen.getByRole('alert').textContent).not.toMatch(/500|error|exception/i);
      expect(schoolName()).toHaveValue('CEIP Lluís Vives');
      expect(municipality()).toHaveValue('València');
      expect(firstName()).toHaveValue('José María');
      expect(email()).toHaveValue('jose.garcia@example.com');
      expect(password()).toHaveValue('');
      expect(submit()).toBeEnabled();
    });
  });

  describe('municipality list', () => {
    it('shows a loading message until the list arrives', async () => {
      let resolve: (list: Municipality[]) => void = () => undefined;
      listMunicipalities.mockReturnValue(
        new Promise<Municipality[]>((done) => {
          resolve = done;
        }),
      );
      renderRegisterPage();

      expect(screen.getByText(es.registration.municipalities.loading)).toBeInTheDocument();
      expect(submit()).toBeDisabled();
      resolve(municipalities);
      expect(await screen.findByRole('combobox', { name: /Municipio/ })).toBeInTheDocument();
    });

    it('offers a retry when the list cannot be loaded and does not allow submitting', async () => {
      listMunicipalities.mockRejectedValueOnce(new Error('sin conexión'));
      const user = userEvent.setup();
      renderRegisterPage();

      expect(await screen.findByText(es.registration.municipalities.loadError)).toBeInTheDocument();
      expect(submit()).toBeDisabled();

      await user.click(screen.getByRole('button', { name: es.registration.municipalities.retry }));

      expect(await screen.findByRole('combobox', { name: /Municipio/ })).toBeInTheDocument();
      expect(screen.queryByText(es.registration.municipalities.loadError)).not.toBeInTheDocument();
      expect(submit()).toBeEnabled();
    });
  });
});
