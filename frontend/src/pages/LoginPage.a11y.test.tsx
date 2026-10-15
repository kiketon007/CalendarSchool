import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { loginService, type LoginOutcome } from '../services/loginService';
import { sessionService, type RefreshOutcome } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { LoginPage } from './LoginPage';

/** La página de inicio de sesión dentro del router y de la sesión, como la monta `main.tsx`. */
function LoginPageInContext() {
  return (
    <MemoryRouter>
      <SessionProvider>
        <LoginPage />
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

describe('LoginPage accessibility (WCAG 2.1 AA)', () => {
  beforeEach(() => {
    vi.spyOn(sessionService, 'refresh').mockResolvedValue({ status: 'invalidSession' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPage() {
    const user = userEvent.setup();
    const { container } = render(<LoginPageInContext />);
    await screen.findByLabelText(es.login.fields.email.label);
    return { container, user };
  }

  async function fillAndSubmit(user: Awaited<ReturnType<typeof renderPage>>['user']) {
    await user.type(screen.getByLabelText(es.login.fields.email.label), 'ana@example.com');
    await user.type(screen.getByLabelText(es.login.fields.password.label), 'Secreta123!');
    await user.click(screen.getByRole('button', { name: es.login.submit }));
  }

  it('has no violations with the empty form', async () => {
    const { container } = await renderPage();

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations with the validation errors shown', async () => {
    const { container, user } = await renderPage();
    await user.click(screen.getByRole('button', { name: es.login.submit }));
    expect(screen.getAllByRole('alert')).toHaveLength(2);

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations while the session is loading', async () => {
    vi.spyOn(sessionService, 'refresh').mockReturnValue(
      new Promise<RefreshOutcome>(() => undefined),
    );
    const { container } = render(<LoginPageInContext />);

    expect(await screen.findByRole('status')).toHaveTextContent(es.login.loading);
    expect(await wcagViolations(container)).toEqual([]);
  });

  it.each<[string, LoginOutcome, string]>([
    ['invalidCredentials', { status: 'invalidCredentials' }, es.login.server.invalidCredentials],
    ['accountSuspended', { status: 'accountSuspended' }, es.login.server.accountSuspended],
    ['tooManyRequests', { status: 'tooManyRequests', retryAfterSeconds: 840 }, '14 minutos'],
    ['unavailable', { status: 'unavailable' }, es.login.server.unavailable],
    ['captchaFailed', { status: 'captchaFailed' }, es.captcha.failed],
  ])('has no violations on the %s message', async (_case, outcome, message) => {
    vi.spyOn(loginService, 'login').mockResolvedValue(outcome);
    const { container, user } = await renderPage();
    await fillAndSubmit(user);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no violations with the v2 challenge visible', async () => {
    vi.spyOn(loginService, 'login').mockResolvedValue({ status: 'captchaChallengeRequired' });
    const { container, user } = await renderPage();
    await fillAndSubmit(user);
    expect(await screen.findByText(es.captcha.challenge)).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: es.captcha.fakeChallengeButton }),
    ).toBeInTheDocument();

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has one main landmark and one level 1 heading', async () => {
    await renderPage();

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
