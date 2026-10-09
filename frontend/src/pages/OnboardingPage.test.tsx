import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { sessionService, type RefreshOutcome, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { OnboardingPage } from './OnboardingPage';

const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
    role: 'ADMIN',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

describe('OnboardingPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
  });

  afterEach(() => {
    refresh.mockRestore();
  });

  function renderAtOnboarding() {
    return render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <SessionProvider>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/registro" element={<div data-testid="register-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  it('welcomes the user by name and shows the name of the school', async () => {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

    renderAtOnboarding();

    expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Te damos la bienvenida, José María',
    );
    expect(screen.getByTestId('onboarding-page')).toHaveTextContent('CEIP Lluís Vives');
  });

  it('shows an accessible loading indicator and does not redirect while the session resolves', () => {
    refresh.mockReturnValue(new Promise<RefreshOutcome>(() => undefined));

    renderAtOnboarding();

    expect(screen.getByRole('status')).toHaveTextContent(es.onboarding.loading);
    expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
  });

  it.each<[string, RefreshOutcome]>([
    ['there is no valid session', { status: 'invalidSession' }],
    ['the session cannot be checked', { status: 'unexpected' }],
  ])('redirects to the registration page when %s', async (_case, outcome) => {
    refresh.mockResolvedValue(outcome);

    renderAtOnboarding();

    expect(await screen.findByTestId('register-page')).toBeInTheDocument();
    expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
  });

  it('renders names with markup or apostrophes as plain text', async () => {
    refresh.mockResolvedValue({
      status: 'authenticated',
      data: {
        ...sessionData,
        user: { ...sessionData.user, firstName: "<b>D'Arcy</b>" },
        school: { ...sessionData.school, name: "CEIP L'Horta <i>Nord</i>" },
      },
    });

    renderAtOnboarding();

    const page = await screen.findByTestId('onboarding-page');
    expect(page).toHaveTextContent("<b>D'Arcy</b>");
    expect(page).toHaveTextContent("CEIP L'Horta <i>Nord</i>");
    expect(page.querySelector('b, i')).toBeNull();
  });

  it('shows no email, token or technical detail of the session', async () => {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

    renderAtOnboarding();

    const page = await screen.findByTestId('onboarding-page');
    expect(page).not.toHaveTextContent('signed.access.token');
    expect(page).not.toHaveTextContent('jose.garcia@example.com');
  });
});
