import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  calendarsService,
  type Calendar,
  type CalendarsOutcome,
} from '../services/calendarsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { CalendarsPage } from './CalendarsPage';

const texts = es.calendars;

function sessionOf(role: 'ADMIN' | 'MEMBER'): SessionData {
  return {
    session: { accessToken: 'signed.access.token', expiresIn: 900 },
    user: {
      id: '0192f5a0-0000-7000-8000-0000000000a1',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García-López',
      role,
    },
    school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
  };
}

const CREATED_AT = '2026-10-23T09:30:00.000Z';

const primary: Calendar = {
  id: 'cal-1',
  name: 'Primaria',
  createdAt: CREATED_AT,
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
    { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
    { type: 'BREAK', startTime: '11:15', endTime: '11:45' },
    { type: 'SESSION', startTime: '11:45', endTime: '12:30' },
    { type: 'SESSION', startTime: '12:30', endTime: '13:15' },
    { type: 'SESSION', startTime: '13:15', endTime: '14:00' },
  ],
  courses: [
    { id: 'c1', name: '1º Primaria' },
    { id: 'c2', name: '2º Primaria' },
  ],
};

const infant: Calendar = {
  id: 'cal-2',
  name: 'Infantil',
  createdAt: CREATED_AT,
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'BREAK', startTime: '09:45', endTime: '10:30' },
    { type: 'SESSION', startTime: '10:30', endTime: '11:00' },
  ],
  courses: [],
};

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('CalendarsPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let list: MockInstance<typeof calendarsService.list>;

  function signInAs(role: 'ADMIN' | 'MEMBER') {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
  }

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    signInAs('MEMBER');
    list = vi.spyOn(calendarsService, 'list');
  });

  afterEach(async () => {
    refresh.mockRestore();
    list.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderPage(entry: InitialEntry = '/calendarios', strict = false) {
    const tree = (
      <MemoryRouter initialEntries={[entry]}>
        <SessionProvider>
          <Routes>
            <Route path="/calendarios" element={<CalendarsPage />} />
            <Route path="/calendarios/nuevo" element={<div data-testid="create-calendar-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function resolvedList(outcome: CalendarsOutcome) {
    list.mockResolvedValue(outcome);
  }

  const card = (name: string) => screen.getByRole('article', { name });

  it('shows a status while loading', async () => {
    list.mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(await screen.findByRole('status')).toHaveTextContent(texts.loading);
  });

  it('asks for the list once, also in strict mode', async () => {
    resolvedList({ status: 'loaded', calendars: [primary] });
    renderPage('/calendarios', true);

    await screen.findByRole('heading', { level: 2, name: 'Primaria' });

    expect(list).toHaveBeenCalledOnce();
  });

  describe('a calendar', () => {
    beforeEach(() => {
      resolvedList({ status: 'loaded', calendars: [primary, infant] });
    });

    it('is a card per calendar with its name as a heading, in the order of the service', async () => {
      renderPage();

      const headings = await screen.findAllByRole('heading', { level: 2 });

      expect(headings.map((heading) => heading.textContent)).toEqual(['Primaria', 'Infantil']);
    });

    it('lists the periods in order, with the session numbers and the break', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Primaria' });

      const periods = within(
        screen.getByRole('list', { name: 'Periodos del calendario Primaria' }),
      );

      expect(periods.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        'Sesión 1 · 09:00–09:45',
        'Sesión 2 · 09:45–10:30',
        'Sesión 3 · 10:30–11:15',
        'Recreo · 11:15–11:45',
        'Sesión 4 · 11:45–12:30',
        'Sesión 5 · 12:30–13:15',
        'Sesión 6 · 13:15–14:00',
      ]);
    });

    it('shows the summary of the day, without counting the breaks', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Primaria' });

      expect(
        within(card('Primaria')).getByText(
          '6 sesiones al día · 30 a la semana · 270 minutos lectivos al día',
        ),
      ).toBeVisible();
      expect(
        within(card('Infantil')).getByText(
          '2 sesiones al día · 10 a la semana · 75 minutos lectivos al día',
        ),
      ).toBeVisible();
    });

    it('shows the courses that follow it, or that it has none', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 2, name: 'Primaria' });

      expect(within(card('Primaria')).getByText('Cursos: 1º Primaria, 2º Primaria')).toBeVisible();
      expect(within(card('Infantil')).getByText(texts.noCourses)).toBeVisible();
    });

    it('writes the names as plain text', async () => {
      resolvedList({
        status: 'loaded',
        calendars: [
          { ...primary, name: '<b>Primaria</b>', courses: [{ id: 'x', name: '<i>1º</i>' }] },
        ],
      });
      renderPage();

      expect(
        await screen.findByRole('heading', { level: 2, name: '<b>Primaria</b>' }),
      ).toBeVisible();
      expect(screen.getByText('Cursos: <i>1º</i>')).toBeVisible();
    });
  });

  describe('according to the role', () => {
    it('offers "Create calendar" to an administrator, which goes to the form', async () => {
      signInAs('ADMIN');
      resolvedList({ status: 'loaded', calendars: [primary] });
      renderPage();

      const link = await screen.findByRole('link', { name: texts.create });

      expect(link).toHaveAttribute('href', '/calendarios/nuevo');
      expect(screen.queryByText(texts.readOnly)).not.toBeInTheDocument();
    });

    it('does not paint "Create calendar" for a member, who is told why', async () => {
      resolvedList({ status: 'loaded', calendars: [primary] });
      renderPage();

      expect(await screen.findByText(texts.readOnly)).toBeVisible();
      expect(screen.queryByRole('link', { name: texts.create })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: texts.create })).not.toBeInTheDocument();
    });

    it('offers "Edit" on every card to an administrator, with the name of the calendar, going to its edit page', async () => {
      signInAs('ADMIN');
      resolvedList({ status: 'loaded', calendars: [primary, infant] });
      renderPage();

      const link = await screen.findByRole('link', { name: 'Editar Primaria' });

      expect(link).toHaveAttribute('href', '/calendarios/cal-1/editar');
      expect(within(card('Primaria')).getByRole('link', { name: 'Editar Primaria' })).toBe(link);
      expect(screen.getByRole('link', { name: 'Editar Infantil' })).toHaveAttribute(
        'href',
        '/calendarios/cal-2/editar',
      );
      expect(link).toHaveTextContent(texts.edit);
    });

    it('does not paint "Edit" for a member', async () => {
      resolvedList({ status: 'loaded', calendars: [primary, infant] });
      renderPage();

      await screen.findByText(texts.readOnly);

      expect(screen.queryByRole('link', { name: /^Editar/ })).not.toBeInTheDocument();
    });

    it('shows the same calendars to both roles', async () => {
      resolvedList({ status: 'loaded', calendars: [primary, infant] });
      renderPage();

      expect(await screen.findAllByRole('article')).toHaveLength(2);
    });
  });

  describe('without calendars', () => {
    it('says so, with "Create calendar", to an administrator', async () => {
      signInAs('ADMIN');
      resolvedList({ status: 'loaded', calendars: [] });
      renderPage();

      expect(await screen.findByText(texts.empty)).toBeVisible();
      expect(screen.getByText(texts.emptyHint)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.create })).toBeVisible();
    });

    it('says so, without the button but with the reason, to a member', async () => {
      resolvedList({ status: 'loaded', calendars: [] });
      renderPage();

      expect(await screen.findByText(texts.empty)).toBeVisible();
      expect(screen.getByText(texts.readOnly)).toBeVisible();
      expect(screen.queryByRole('link', { name: texts.create })).not.toBeInTheDocument();
    });
  });

  it('shows an error with "Retry" when the list cannot be loaded, and asks again', async () => {
    list.mockResolvedValueOnce({ status: 'unavailable' });
    list.mockResolvedValueOnce({ status: 'loaded', calendars: [primary] });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);
    await userEvent.click(screen.getByRole('button', { name: texts.retry }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Primaria' })).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('does nothing more when the session is lost: the layout redirects', async () => {
    resolvedList({ status: 'unauthenticated' });
    renderPage();

    await waitFor(() => {
      expect(list).toHaveBeenCalledOnce();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  describe('the notice that comes with the navigation', () => {
    it('shows it as plain text and as a status', async () => {
      resolvedList({ status: 'loaded', calendars: [primary] });
      renderPage({ pathname: '/calendarios', state: { calendarCreated: '<b>Primaria</b>' } });

      expect(await screen.findByText('Calendario «<b>Primaria</b>» creado')).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent('Calendario «<b>Primaria</b>» creado');
    });

    it('shows the notice of an edit as plain text and as a status', async () => {
      resolvedList({ status: 'loaded', calendars: [primary] });
      renderPage({ pathname: '/calendarios', state: { calendarUpdated: '<b>Primaria</b>' } });

      expect(await screen.findByText('Calendario «<b>Primaria</b>» actualizado')).toBeVisible();
      expect(screen.getByRole('status')).toHaveTextContent(
        'Calendario «<b>Primaria</b>» actualizado',
      );
    });

    it.each([
      ['an edit name that is not text', { calendarUpdated: 5 }],
      ['an empty edit name', { calendarUpdated: '' }],
    ])('ignores %s', async (_label, state) => {
      resolvedList({ status: 'loaded', calendars: [primary] });
      renderPage({ pathname: '/calendarios', state });

      await screen.findByRole('heading', { level: 2, name: 'Primaria' });

      expect(screen.queryByText(/actualizado/)).not.toBeInTheDocument();
    });

    it.each([
      ['a name that is not text', { calendarCreated: 5 }],
      ['an empty name', { calendarCreated: '' }],
      ['an unrelated state', { courseCreated: 'x' }],
    ])('ignores %s', async (_label, state) => {
      resolvedList({ status: 'loaded', calendars: [primary] });
      renderPage({ pathname: '/calendarios', state });

      await screen.findByRole('heading', { level: 2, name: 'Primaria' });

      expect(screen.queryByText(/creado/)).not.toBeInTheDocument();
    });
  });

  it('has no accessibility violations empty, loaded and with an error', async () => {
    signInAs('ADMIN');
    resolvedList({ status: 'loaded', calendars: [] });
    const empty = renderPage();
    await screen.findByText(texts.empty);
    expect(await wcagViolations(empty.container)).toEqual([]);
    empty.unmount();

    resolvedList({ status: 'loaded', calendars: [primary, infant] });
    const loaded = renderPage({ pathname: '/calendarios', state: { calendarUpdated: 'Primaria' } });
    await screen.findByRole('heading', { level: 2, name: 'Primaria' });
    expect(await wcagViolations(loaded.container)).toEqual([]);
    loaded.unmount();

    resolvedList({ status: 'unavailable' });
    const failed = renderPage();
    await screen.findByRole('alert');
    expect(await wcagViolations(failed.container)).toEqual([]);
  });

  it('shows the page in English', async () => {
    await i18n.changeLanguage('en');
    resolvedList({ status: 'loaded', calendars: [] });
    renderPage();

    expect(await screen.findByText('There are no calendars yet')).toBeVisible();
  });
});
