import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  scheduleDraftService,
  type ScheduleDraft,
  type ScheduleDraftEntry,
  type ScheduleDraftOutcome,
} from '../services/scheduleDraftService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { ScheduleDraftPage } from './ScheduleDraftPage';

const texts = es.schedule.draft;
const DESKTOP = 1280;
const PHONE = 360;

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

const SHORT = {
  id: 'calendar-short',
  name: 'Primaria',
  periods: [
    { type: 'SESSION' as const, startTime: '09:00', endTime: '09:45' },
    { type: 'SESSION' as const, startTime: '09:45', endTime: '10:30' },
    { type: 'BREAK' as const, startTime: '10:30', endTime: '11:00' },
    { type: 'SESSION' as const, startTime: '11:00', endTime: '11:45' },
  ],
};
const LONG = {
  id: 'calendar-long',
  name: 'Tercer ciclo',
  periods: [
    { type: 'SESSION' as const, startTime: '09:00', endTime: '10:00' },
    { type: 'SESSION' as const, startTime: '10:00', endTime: '11:00' },
  ],
};

function entry(overrides: Partial<ScheduleDraftEntry> = {}): ScheduleDraftEntry {
  return {
    courseId: 'course-1',
    classId: 'class-1a',
    subjectId: 'english',
    professorId: 'ana',
    dayOfWeek: 1,
    sessionNumber: 1,
    startTime: '09:00',
    endTime: '09:45',
    ...overrides,
  };
}

const draft: ScheduleDraft = {
  id: 'schedule-1',
  status: 'DRAFT',
  generatedAt: '2026-11-04T08:00:05.000Z',
  placedSessions: 6,
  courses: [
    {
      id: 'course-1',
      name: '1º Primaria',
      calendar: SHORT,
      classes: [
        { id: 'class-1a', name: 'A' },
        { id: 'class-1b', name: 'B' },
      ],
    },
    {
      id: 'course-5',
      name: '5º Primaria',
      calendar: LONG,
      classes: [{ id: 'class-5a', name: 'A' }],
    },
    {
      id: 'course-7',
      name: '7º Primaria',
      calendar: null,
      classes: [{ id: 'class-7a', name: 'A' }],
    },
  ],
  subjects: [
    { id: 'english', name: 'Inglés', code: 'ING', color: 'blue' },
    { id: 'maths', name: 'Matemáticas', code: null, color: 'red' },
  ],
  professors: [
    { id: 'ana', firstName: 'Ana', lastName: 'García' },
    { id: 'luis', firstName: 'Luis', lastName: 'Pérez' },
  ],
  entries: [
    entry(),
    entry({ dayOfWeek: 2, sessionNumber: 2, startTime: '09:45', endTime: '10:30' }),
    entry({
      classId: 'class-1b',
      subjectId: 'maths',
      professorId: 'luis',
      sessionNumber: 3,
      startTime: '11:00',
      endTime: '11:45',
    }),
    entry({
      courseId: 'course-5',
      classId: 'class-5a',
      sessionNumber: 2,
      startTime: '10:00',
      endTime: '11:00',
    }),
    entry({
      courseId: 'course-7',
      classId: 'class-7a',
      subjectId: 'maths',
      professorId: null,
      dayOfWeek: 3,
      startTime: '12:00',
      endTime: '12:45',
    }),
    entry({
      subjectId: 'maths',
      professorId: null,
      dayOfWeek: 5,
      sessionNumber: 9,
      startTime: '15:00',
      endTime: '15:45',
    }),
  ],
};

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

/** Muestra la dirección y el tipo de navegación para comprobar el estado de la URL. */
function LocationProbe() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <>
      <span data-testid="search">{location.search}</span>
      <span data-testid="navigation">{type}</span>
    </>
  );
}

describe('ScheduleDraftPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof scheduleDraftService.get>;
  let media: MatchMediaControl;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('ADMIN') });
    get = vi.spyOn(scheduleDraftService, 'get');
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    get.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(options: { url?: string; width?: number; strict?: boolean } = {}) {
    media.setWidth(options.width ?? DESKTOP);
    const tree = (
      <MemoryRouter initialEntries={[`/horarios/borrador${options.url ?? ''}`]}>
        <SessionProvider>
          <Routes>
            <Route
              path="/horarios/borrador"
              element={
                <>
                  <ScheduleDraftPage />
                  <LocationProbe />
                </>
              }
            />
            <Route path="/horarios" element={<div data-testid="readiness-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(options.strict === true ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function respond(outcome: ScheduleDraftOutcome) {
    get.mockResolvedValue(outcome);
  }
  const loaded = (schedule: ScheduleDraft | null = draft) => {
    respond({ status: 'loaded', schedule });
  };

  describe('loading the draft', () => {
    it('shows the title and a status while it loads', () => {
      get.mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(screen.getByRole('heading', { level: 1, name: texts.title })).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
    });

    it('asks for the draft once, also in strict mode', async () => {
      loaded();
      renderPage({ strict: true });

      await screen.findByRole('table');

      expect(get).toHaveBeenCalledTimes(1);
    });

    it('shows an alert with a button to retry when it fails, and asks again when it is pressed', async () => {
      const user = userEvent.setup();
      respond({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);
      loaded();
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('says there is no timetable yet and links to the generation', async () => {
      loaded(null);
      renderPage();

      expect(await screen.findByText(texts.empty)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: texts.emptyLink })).toHaveAttribute(
        'href',
        '/horarios',
      );
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows the draft badge, the generation date and a link back', async () => {
      loaded();
      renderPage();

      const badge = await screen.findByText(texts.badge);
      expect(badge).toBeInTheDocument();
      expect(screen.getByText(texts.badgeNote)).toBeInTheDocument();
      expect(screen.getByText(/Generado el/u)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: texts.back })).toHaveAttribute('href', '/horarios');
    });

    it('shows a member the same page as an administrator', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      loaded();
      renderPage();

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: texts.views.professor })).toBeInTheDocument();
    });
  });

  describe('the class view', () => {
    it('starts with the first class and its table', async () => {
      loaded();
      renderPage();

      expect(await screen.findByRole('combobox', { name: texts.select.class })).toHaveValue(
        'class-1a',
      );
      const table = screen.getByRole('table', { name: 'Horario de 1º Primaria A' });
      expect(within(table).getAllByText('Inglés')).toHaveLength(2);
      expect(within(table).getAllByText('García, Ana')).toHaveLength(2);
      expect(screen.getByText('3 sesiones a la semana')).toBeInTheDocument();
    });

    it('groups the classes by course', async () => {
      loaded();
      renderPage();

      const select = await screen.findByRole('combobox', { name: texts.select.class });

      expect(
        within(select)
          .getAllByRole('group')
          .map((group) => group.getAttribute('label')),
      ).toEqual(['1º Primaria', '5º Primaria', '7º Primaria']);
    });

    it('changes the class without asking again, and writes it in the address without filling the history', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage();
      await screen.findByRole('table');

      await user.selectOptions(
        screen.getByRole('combobox', { name: texts.select.class }),
        'class-1b',
      );

      expect(screen.getByRole('table', { name: 'Horario de 1º Primaria B' })).toBeInTheDocument();
      expect(screen.getByTestId('search')).toHaveTextContent('?clase=class-1b');
      expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE');
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('lists the sessions outside the current calendar', async () => {
      loaded();
      renderPage();

      const section = await screen.findByRole('region', { name: texts.outside.title });

      expect(section).toHaveTextContent('Viernes 15:00–15:45');
    });

    it('says that a course lost its calendar and lists its sessions by day', async () => {
      loaded();
      renderPage({ url: '?clase=class-7a' });

      expect(await screen.findByText(texts.withoutCalendar.title)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText(/Miércoles 12:00–12:45/u)).toBeInTheDocument();
    });
  });

  describe('the professor view', () => {
    it('shows one table per calendar of the professor, each with the name of its calendar', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage();
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: texts.views.professor }));

      expect(screen.getByRole('combobox', { name: texts.select.professor })).toHaveValue('ana');
      expect(
        screen.getByRole('table', { name: 'Horario de Ana García · calendario «Primaria»' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('table', { name: 'Horario de Ana García · calendario «Tercer ciclo»' }),
      ).toBeInTheDocument();
      expect(screen.getByText('3 sesiones a la semana')).toBeInTheDocument();
      expect(screen.getByTestId('search')).toHaveTextContent('?vista=profesor');
    });

    it('shows the class of every session instead of the professor', async () => {
      loaded();
      renderPage({ url: '?vista=profesor&profesor=luis' });

      const table = await screen.findByRole('table', {
        name: 'Horario de Luis Pérez · calendario «Primaria»',
      });

      expect(within(table).getByText('1º Primaria · B')).toBeInTheDocument();
      expect(screen.getAllByRole('table')).toHaveLength(1);
    });

    it('changes the professor without asking again', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage({ url: '?vista=profesor' });
      await screen.findAllByRole('table', { name: /Ana García/u });

      await user.selectOptions(
        screen.getByRole('combobox', { name: texts.select.professor }),
        'luis',
      );

      expect(screen.getByRole('table', { name: /Luis Pérez/u })).toBeInTheDocument();
      expect(screen.getByTestId('search')).toHaveTextContent('?vista=profesor&profesor=luis');
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('says so when no professor has sessions', async () => {
      loaded({
        ...draft,
        professors: [],
        entries: draft.entries.map((e) => ({ ...e, professorId: null })),
      });
      renderPage({ url: '?vista=profesor' });

      expect(await screen.findByText(texts.noProfessors)).toBeInTheDocument();
      expect(
        screen.queryByRole('combobox', { name: texts.select.professor }),
      ).not.toBeInTheDocument();
    });
  });

  describe('the whole school view', () => {
    it('shows the day chosen with one table per calendar and the classes in the columns', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage();
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: texts.views.school }));

      expect(screen.getByRole('combobox', { name: texts.select.day })).toHaveValue('1');
      const primaria = screen.getByRole('table', { name: 'Lunes · calendario «Primaria»' });
      expect(
        within(primaria).getByRole('columnheader', { name: '1º Primaria A' }),
      ).toBeInTheDocument();
      expect(
        within(primaria).getByRole('columnheader', { name: '1º Primaria B' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('table', { name: 'Lunes · calendario «Tercer ciclo»' }),
      ).toBeInTheDocument();
    });

    it('changes the day without asking again', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage({ url: '?vista=colegio' });
      await screen.findAllByRole('table', { name: /Lunes/u });

      await user.selectOptions(screen.getByRole('combobox', { name: texts.select.day }), '2');

      const table = screen.getByRole('table', { name: 'Martes · calendario «Primaria»' });
      expect(within(table).getByText('Inglés')).toBeInTheDocument();
      expect(screen.getByTestId('search')).toHaveTextContent('?vista=colegio&dia=2');
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('names the courses that no longer have a calendar', async () => {
      loaded();
      renderPage({ url: '?vista=colegio' });

      expect(await screen.findByText('Cursos sin calendario: 7º Primaria')).toBeInTheDocument();
    });
  });

  describe('the address', () => {
    it('opens straight on the view and the professor of the address', async () => {
      loaded();
      renderPage({ url: '?vista=profesor&profesor=luis' });

      expect(await screen.findByRole('combobox', { name: texts.select.professor })).toHaveValue(
        'luis',
      );
    });

    it('ignores a professor, a class, a day and a view that do not exist, with no error', async () => {
      loaded();
      renderPage({ url: '?vista=profesor&profesor=nobody&clase=nope&dia=9' });

      expect(await screen.findByRole('combobox', { name: texts.select.professor })).toHaveValue(
        'ana',
      );
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await userEvent.setup().click(screen.getByRole('button', { name: texts.views.class }));
      expect(screen.getByRole('combobox', { name: texts.select.class })).toHaveValue('class-1a');
    });

    it('keeps only ids and numbers in the address', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage();
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: texts.views.professor }));
      await user.selectOptions(
        screen.getByRole('combobox', { name: texts.select.professor }),
        'luis',
      );

      expect(screen.getByTestId('search').textContent).not.toMatch(/Luis|Pérez|García|Primaria/u);
    });

    it('marks the view that is open with aria-pressed', async () => {
      loaded();
      renderPage({ url: '?vista=colegio' });

      expect(await screen.findByRole('button', { name: texts.views.school })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: texts.views.class })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });
  });

  describe('a small screen', () => {
    it('shows the class view with the days abbreviated and the same behavior', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage({ width: PHONE });

      const table = await screen.findByRole('table', { name: 'Horario de 1º Primaria A' });
      expect(within(table).getByRole('columnheader', { name: 'Lunes' })).toHaveTextContent('L');

      await user.selectOptions(
        screen.getByRole('combobox', { name: texts.select.class }),
        'class-1b',
      );
      expect(screen.getByRole('table', { name: 'Horario de 1º Primaria B' })).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it.each([
      ['by class', ''],
      ['by professor', '?vista=profesor'],
      ['of the whole school', '?vista=colegio&dia=2'],
      ['of a course without calendar', '?clase=class-7a'],
    ])('has no WCAG violations %s', async (_name, url) => {
      loaded();
      const { container } = renderPage({ url });
      await screen.findByRole('combobox');

      expect(await wcagViolations(container)).toEqual([]);
    });

    it.each([DESKTOP, PHONE])('has no WCAG violations at %i px', async (width) => {
      loaded();
      const { container } = renderPage({ width });
      await screen.findByRole('table');

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations while loading, when it fails, with no draft and in English', async () => {
      get.mockReturnValue(new Promise(() => undefined));
      const loading = renderPage();
      expect(await wcagViolations(loading.container)).toEqual([]);
      loading.unmount();

      respond({ status: 'unavailable' });
      const failed = renderPage();
      await screen.findByRole('alert');
      expect(await wcagViolations(failed.container)).toEqual([]);
      failed.unmount();

      loaded(null);
      const empty = renderPage();
      await screen.findByText(texts.empty);
      expect(await wcagViolations(empty.container)).toEqual([]);
      empty.unmount();

      await i18n.changeLanguage('en');
      loaded();
      const english = renderPage();
      await screen.findByRole('table');
      expect(await wcagViolations(english.container)).toEqual([]);
    });

    it('has one h1 and names every table', async () => {
      loaded();
      renderPage({ url: '?vista=profesor' });
      await screen.findAllByRole('table', { name: /Ana García/u });

      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      await waitFor(() => {
        for (const table of screen.getAllByRole('table')) {
          expect(table).toHaveAccessibleName();
        }
      });
    });
  });
});
