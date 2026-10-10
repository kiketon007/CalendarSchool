import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { registrationService } from '../services/registrationService';
import { sessionService } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { RegisterPage } from './RegisterPage';

/** La página de registro dentro del router y de la sesión, como la monta `main.tsx`. */
function RegisterPageInContext() {
  return (
    <MemoryRouter>
      <SessionProvider>
        <RegisterPage />
      </SessionProvider>
    </MemoryRouter>
  );
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

/** Rellena el formulario con datos válidos y lo envía. */
async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(es.registration.fields.schoolName.label), 'CEIP Prueba');
  await user.type(screen.getByRole('combobox'), 'val');
  await user.click(screen.getByRole('option'));
  await user.type(screen.getByLabelText(es.registration.fields.firstName.label), 'Ana');
  await user.type(screen.getByLabelText(es.registration.fields.lastName.label), 'Pérez');
  await user.type(screen.getByLabelText(es.registration.fields.email.label), 'ana@example.com');
  await user.type(screen.getByLabelText(es.registration.fields.password.label), 'Secreta123!');
  await user.click(screen.getByRole('button', { name: es.registration.submit }));
}

describe('RegisterPage accessibility (WCAG 2.1 AA)', () => {
  beforeEach(() => {
    vi.spyOn(registrationService, 'listMunicipalities').mockResolvedValue([
      { code: '46250', name: 'València', province: 'Valencia/València' },
    ]);
    vi.spyOn(sessionService, 'refresh').mockResolvedValue({ status: 'invalidSession' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPage() {
    const view = render(<RegisterPageInContext />);
    await screen.findByRole('combobox');
    return { ...view, user: userEvent.setup() };
  }

  it('has no violations in its initial state', async () => {
    const { container } = await renderPage();

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations while showing validation errors', async () => {
    const { container, user } = await renderPage();

    await user.click(screen.getByRole('button', { name: es.registration.submit }));

    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations with the municipality list open', async () => {
    const { container, user } = await renderPage();

    await user.type(screen.getByRole('combobox'), 'val');

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations when the municipality list cannot be loaded', async () => {
    vi.spyOn(registrationService, 'listMunicipalities').mockRejectedValue(new Error('sin red'));
    const { container } = render(<RegisterPageInContext />);
    await screen.findByText(es.registration.municipalities.loadError);

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations on the cookies warning shown after the account is created', async () => {
    vi.spyOn(registrationService, 'register').mockResolvedValue({
      status: 'created',
      data: {
        user: { id: 'u', email: 'a@b.es', firstName: 'A', lastName: 'B' },
        school: {
          id: 's',
          name: 'CEIP',
          municipality: { code: '46250', name: 'València', province: 'Valencia/València' },
        },
      },
    });
    const { container, user } = await renderPage();
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      es.registration.session.cookiesDisabled,
    );

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations with the v2 challenge visible', async () => {
    vi.spyOn(registrationService, 'register').mockResolvedValue({
      status: 'captchaChallengeRequired',
    });
    const { container, user } = await renderPage();
    await fillAndSubmit(user);
    expect(await screen.findByText(es.registration.captcha.challenge)).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: es.captcha.fakeChallengeButton }),
    ).toBeInTheDocument();

    expect(await wcagViolations(container)).toEqual([]);
  });

  it.each([
    ['captchaFailed', es.registration.captcha.failed],
    ['captchaUnavailable', es.registration.captcha.unavailable],
  ] as const)('has no violations on the %s message', async (status, message) => {
    vi.spyOn(registrationService, 'register').mockResolvedValue({ status });
    const { container, user } = await renderPage();
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations on the too many attempts warning', async () => {
    vi.spyOn(registrationService, 'register').mockResolvedValue({
      status: 'tooManyRequests',
      retryAfterSeconds: 840,
    });
    const { container, user } = await renderPage();
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('14 minutos');

    expect(await wcagViolations(container)).toEqual([]);
  });
});
