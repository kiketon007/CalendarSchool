import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { sessionService, type SessionData } from '../services/sessionService';
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

  describe('features', () => {
    const features = es.onboarding.features;
    const member: SessionData = { ...sessionData, user: { ...sessionData.user, role: 'MEMBER' } };

    it('lists schedules and canteen as coming soon, with no links or buttons in them', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      expect(screen.getByRole('heading', { level: 2, name: features.title })).toBeInTheDocument();
      for (const feature of [features.schedules, features.canteen]) {
        const card = screen.getByRole('article', { name: feature.name });
        expect(card).toHaveTextContent(feature.description);
        expect(card).toHaveTextContent(es.onboarding.comingSoon);
        expect(within(card).queryByRole('link')).toBeNull();
        expect(within(card).queryByRole('button')).toBeNull();
      }
    });

    it('shows the administration shortcut to Users only to an ADMIN', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      expect(
        screen.getByRole('heading', { level: 2, name: es.onboarding.admin.title }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: new RegExp(es.onboarding.admin.users.name) }),
      ).toHaveAttribute('href', '/usuarios');
    });

    it('hides the administration section from a MEMBER', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: member });

      renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      expect(screen.queryByText(es.onboarding.admin.title)).toBeNull();
      expect(screen.queryByRole('link')).toBeNull();
    });

    it('orders the headings h1, h2 and h3', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      const levels = screen.getAllByRole('heading').map((heading) => heading.tagName);
      expect(levels).toEqual(['H1', 'H2', 'H3', 'H3', 'H2', 'H3']);
    });

    it('stores nothing in the browser', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      localStorage.clear();
      sessionStorage.clear();

      renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      expect(localStorage).toHaveLength(0);
      expect(sessionStorage).toHaveLength(0);
    });

    it.each([
      ['an ADMIN', sessionData],
      ['a MEMBER', member],
    ])('has no accessibility violations for %s', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });

      const { container } = renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      const results = await axe.run(container, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    });
  });
});
