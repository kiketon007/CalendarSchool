import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
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
const member: SessionData = { ...sessionData, user: { ...sessionData.user, role: 'MEMBER' } };

const features = es.onboarding.features;
/** Las siete secciones de trabajo, en el orden de la portada. */
const SECTIONS = [
  ['schedules', '/horarios'],
  ['courses', '/cursos'],
  ['professors', '/profesores'],
  ['students', '/alumnos'],
  ['calendars', '/calendarios'],
  ['subjects', '/asignaturas'],
  ['constraints', '/reglas'],
] as const;

describe('OnboardingPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    // Solo `Date`: congelar los temporizadores bloquearía los `findBy` de Testing Library.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 8, 12, 0));
  });

  afterEach(async () => {
    vi.useRealTimers();
    refresh.mockRestore();
    await i18n.changeLanguage('es');
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

  describe('banner', () => {
    it('is a region named by the greeting, with the date, the school and no technical detail', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      const { container } = renderAtOnboarding();

      const banner = await screen.findByRole('region', { name: 'Hola, José María' });
      expect(within(banner).getByRole('heading', { level: 1 })).toHaveTextContent(
        'Hola, José María',
      );
      expect(banner).toHaveTextContent('Aquí tienes todo lo de CEIP Lluís Vives.');
      expect(within(banner).getByText('CEIP Lluís Vives').tagName).toBe('STRONG');
      expect(screen.getByTestId('onboarding-page')).toBeInTheDocument();
      expect(container).not.toHaveTextContent('signed.access.token');
      expect(container).not.toHaveTextContent('jose.garcia@example.com');
    });

    it("shows today's date in the active language, in a time element with the local ISO day", async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderAtOnboarding();

      const date = (await screen.findByText('Domingo, 8 de noviembre de 2026')).closest('time');
      expect(date).toHaveAttribute('datetime', '2026-11-08');
    });

    it('translates the greeting and the date to English', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      await i18n.changeLanguage('en');

      renderAtOnboarding();

      const banner = await screen.findByRole('region', { name: 'Hello, José María' });
      expect(within(banner).getByText('Sunday, November 8, 2026').closest('time')).toHaveAttribute(
        'datetime',
        '2026-11-08',
      );
      expect(banner).toHaveTextContent('Here is everything for CEIP Lluís Vives.');
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
      expect(page).toHaveTextContent("Hola, <b>D'Arcy</b>");
      expect(page).toHaveTextContent("CEIP L'Horta <i>Nord</i>");
      expect(page.querySelector('b, i')).toBeNull();
    });
  });

  describe('sections', () => {
    it('shows the eyebrow and the heading of the sections', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: member });

      renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      expect(screen.getByText(features.eyebrow)).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: features.title })).toBeInTheDocument();
    });

    it('links seven sections, in order, each with its description', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: member });

      renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(7);
      SECTIONS.forEach(([key, to], index) => {
        const text = features[key];
        expect(links[index]).toHaveAttribute('href', to);
        expect(links[index]).toHaveTextContent(text.name);
        expect(links[index]).toHaveTextContent(text.description);
      });
    });

    it('does not show the canteen or any coming soon badge', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderAtOnboarding();

      const page = await screen.findByTestId('onboarding-page');
      expect(page).not.toHaveTextContent(/comedor/i);
      expect(page).not.toHaveTextContent(/próximamente/i);
      expect(screen.queryByRole('article')).toBeNull();
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
      expect(screen.getAllByRole('link')).toHaveLength(8);
    });

    it('hides the administration section from a MEMBER', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: member });

      renderAtOnboarding();

      await screen.findByTestId('onboarding-page');
      expect(screen.queryByText(es.onboarding.admin.title)).toBeNull();
      expect(screen.queryByRole('link', { name: /usuarios/i })).toBeNull();
    });
  });

  it.each([
    ['an ADMIN', sessionData, ['H1', 'H2', ...Array<string>(7).fill('H3'), 'H2', 'H3']],
    ['a MEMBER', member, ['H1', 'H2', ...Array<string>(7).fill('H3')]],
  ])('orders the headings h1, h2 and h3 for %s', async (_who, data, expected) => {
    refresh.mockResolvedValue({ status: 'authenticated', data });

    renderAtOnboarding();

    await screen.findByTestId('onboarding-page');
    expect(screen.getAllByRole('heading').map((heading) => heading.tagName)).toEqual(expected);
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
