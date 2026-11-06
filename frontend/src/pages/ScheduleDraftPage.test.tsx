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
  type ScheduleDetail,
  type ScheduleDraftEntry,
  type ScheduleDraftOutcome,
} from '../services/scheduleDraftService';
import { scheduleService, type ScheduleOverviewOutcome } from '../services/scheduleService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { downloadFile } from '../utils/download';
import { ScheduleDraftPage } from './ScheduleDraftPage';

vi.mock('../utils/download', () => ({ downloadFile: vi.fn() }));

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

const draft: ScheduleDetail = {
  id: 'schedule-1',
  status: 'DRAFT',
  generatedAt: '2026-11-04T08:00:05.000Z',
  placedSessions: 6,
  confirmedAt: null,
  confirmedBy: null,
  replacedAt: null,
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
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="notice">
        {(location.state as { notice?: string } | null)?.notice ?? ''}
      </span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="navigation">{type}</span>
    </>
  );
}

const PREVIOUS_ID = '0192f5a0-0000-7000-8000-0000000000b1';

describe('ScheduleDraftPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof scheduleDraftService.getDraft>;
  let getOfficial: MockInstance<typeof scheduleDraftService.getOfficial>;
  let getById: MockInstance<typeof scheduleDraftService.getById>;
  let overview: MockInstance<typeof scheduleService.overview>;
  let media: MatchMediaControl;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('ADMIN') });
    get = vi.spyOn(scheduleDraftService, 'getDraft');
    getOfficial = vi.spyOn(scheduleDraftService, 'getOfficial');
    getById = vi.spyOn(scheduleDraftService, 'getById');
    overview = vi.spyOn(scheduleService, 'overview').mockResolvedValue({
      status: 'loaded',
      overview: { draft: null, official: null, previousCount: 0 },
    });
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    get.mockRestore();
    getOfficial.mockRestore();
    getById.mockRestore();
    overview.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(
    options: {
      url?: string;
      width?: number;
      strict?: boolean;
      official?: boolean;
      previous?: boolean;
      state?: { notice: string };
    } = {},
  ) {
    media.setWidth(options.width ?? DESKTOP);
    const path =
      options.previous === true
        ? `/horarios/anteriores/${PREVIOUS_ID}`
        : options.official === true
          ? '/horarios/oficial'
          : '/horarios/borrador';
    const tree = (
      <MemoryRouter
        initialEntries={[{ pathname: path, search: options.url ?? '', state: options.state }]}
      >
        <SessionProvider>
          <Routes>
            <Route
              path="/horarios/borrador"
              element={
                <>
                  <ScheduleDraftPage key="draft" which="draft" />
                  <LocationProbe />
                </>
              }
            />
            <Route
              path="/horarios/oficial"
              element={
                <>
                  <ScheduleDraftPage key="official" which="official" />
                  <LocationProbe />
                </>
              }
            />
            <Route
              path="/horarios/anteriores/:id"
              element={
                <>
                  <ScheduleDraftPage key="previous" which="previous" scheduleId={PREVIOUS_ID} />
                  <LocationProbe />
                </>
              }
            />
            <Route path="/horarios/anteriores" element={<div data-testid="previous-list-page" />} />
            <Route
              path="/horarios"
              element={
                <>
                  <div data-testid="readiness-page" />
                  <LocationProbe />
                </>
              }
            />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(options.strict === true ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function respond(outcome: ScheduleDraftOutcome) {
    get.mockResolvedValue(outcome);
  }
  const loaded = (schedule: ScheduleDetail | null = draft) => {
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

  describe('exporting', () => {
    const exportTexts = es.schedule.export;
    const exportButton = () => screen.getByRole('button', { name: exportTexts.button });
    const dialog = () => screen.findByRole('dialog', { name: exportTexts.title });
    const kind = (name: string) =>
      within(screen.getByRole('group', { name: exportTexts.kind.label })).getByRole('radio', {
        name,
      });
    const target = () =>
      screen.getByRole<HTMLSelectElement>('combobox', { name: exportTexts.target.label });

    beforeEach(() => {
      vi.mocked(downloadFile).mockReset();
    });

    it.each(['ADMIN', 'MEMBER'] as const)(
      'offers Export to a %s when there is a draft',
      async (role) => {
        refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
        loaded();
        renderPage();

        expect(await screen.findByRole('button', { name: exportTexts.button })).toBeEnabled();
      },
    );

    it('does not offer it with no draft, while it loads or when it fails', async () => {
      loaded(null);
      const empty = renderPage();
      await screen.findByText(texts.empty);
      expect(screen.queryByRole('button', { name: exportTexts.button })).not.toBeInTheDocument();
      empty.unmount();

      respond({ status: 'unavailable' });
      const failed = renderPage();
      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: exportTexts.button })).not.toBeInTheDocument();
      failed.unmount();

      get.mockReturnValue(new Promise(() => undefined));
      renderPage();
      expect(screen.queryByRole('button', { name: exportTexts.button })).not.toBeInTheDocument();
    });

    it('starts on the class that is being seen', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage({ url: '?clase=class-1b' });
      await screen.findByRole('table');

      await user.click(exportButton());
      await dialog();

      expect(kind(exportTexts.kind.class)).toBeChecked();
      expect(target()).toHaveValue('class-1b');
    });

    it('starts on the professor that is being seen', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage({ url: '?vista=profesor&profesor=luis' });
      await screen.findByRole('combobox', { name: texts.select.professor });

      await user.click(exportButton());
      await dialog();

      expect(kind(exportTexts.kind.professor)).toBeChecked();
      expect(target()).toHaveValue('luis');
    });

    it('starts on all the classes when the whole school is being seen', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage({ url: '?vista=colegio' });
      await screen.findByRole('combobox', { name: texts.select.day });

      await user.click(exportButton());
      await dialog();

      expect(kind(exportTexts.kind.class)).toBeChecked();
      expect(target()).toHaveValue('all');
    });

    it('goes to the class and the professor chosen on the page when the kind changes', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage({ url: '?vista=profesor&profesor=luis&clase=class-1b' });
      await screen.findByRole('combobox', { name: texts.select.professor });

      await user.click(exportButton());
      await dialog();
      await user.click(kind(exportTexts.kind.class));

      expect(target()).toHaveValue('class-1b');
    });

    it('downloads the document without asking for anything and without touching the address', async () => {
      const user = userEvent.setup();
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      loaded();
      renderPage({ url: '?clase=class-1b' });
      await screen.findByRole('table');
      const search = screen.getByTestId('search').textContent;

      await user.click(exportButton());
      await dialog();
      await user.click(screen.getByRole('button', { name: exportTexts.download }));

      expect(downloadFile).toHaveBeenCalledTimes(1);
      expect(vi.mocked(downloadFile).mock.calls[0]?.[0].fileName).toBe('horario-1o-primaria-b.md');
      expect(get).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('search').textContent).toBe(search);
      fetchSpy.mockRestore();
    });

    it.each([
      ['Cancel', exportTexts.cancel],
      ['Download', exportTexts.download],
    ])('gives the focus back to Export after %s', async (_name, label) => {
      const user = userEvent.setup();
      loaded();
      renderPage();
      await screen.findByRole('table');

      await user.click(exportButton());
      await dialog();
      await user.click(screen.getByRole('button', { name: label }));

      await waitFor(() => {
        expect(exportButton()).toHaveFocus();
      });
    });

    it('closes with Escape and the dialog fits a phone with no WCAG violations', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage({ width: PHONE });
      await screen.findByRole('table');

      await user.click(exportButton());
      const open = await dialog();
      expect(await wcagViolations(open)).toEqual([]);
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('confirming and discarding the draft (US-ALGO-CONFIRM)', () => {
    const confirmTexts = es.schedule.confirm;
    const discardTexts = es.schedule.discard;
    const confirmButton = () => screen.getByRole('button', { name: confirmTexts.button });
    const discardButton = () => screen.getByRole('button', { name: discardTexts.button });
    const CONFIRMED: ScheduleOverviewOutcome = {
      status: 'loaded',
      overview: {
        draft: null,
        official: {
          id: 'official-1',
          status: 'OFFICIAL',
          generatedAt: '2026-11-03T08:00:00.000Z',
          placedSessions: 6,
          confirmedAt: '2026-11-03T10:00:00.000Z',
          confirmedBy: { firstName: 'Ana', lastName: 'García' },
          replacedAt: null,
        },
        previousCount: 0,
      },
    };

    it('offers both actions to an administrator, and neither to a member', async () => {
      loaded();
      const admin = renderPage();
      expect(await screen.findByRole('button', { name: confirmTexts.button })).toBeEnabled();
      expect(discardButton()).toBeEnabled();
      admin.unmount();

      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      renderPage();
      await screen.findByRole('table');
      expect(screen.queryByRole('button', { name: confirmTexts.button })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: discardTexts.button })).not.toBeInTheDocument();
    });

    it('offers neither with no draft, while it loads or when it fails', async () => {
      loaded(null);
      const empty = renderPage();
      await screen.findByText(texts.empty);
      expect(screen.queryByRole('button', { name: confirmTexts.button })).not.toBeInTheDocument();
      empty.unmount();

      respond({ status: 'unavailable' });
      const failed = renderPage();
      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: discardTexts.button })).not.toBeInTheDocument();
      failed.unmount();

      get.mockReturnValue(new Promise(() => undefined));
      renderPage();
      expect(screen.queryByRole('button', { name: confirmTexts.button })).not.toBeInTheDocument();
    });

    it('asks for the overview once, only for an administrator looking at the draft', async () => {
      loaded();
      const admin = renderPage({ strict: true });
      await screen.findByRole('table');
      expect(overview).toHaveBeenCalledTimes(1);
      admin.unmount();

      overview.mockClear();
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      renderPage();
      await screen.findByRole('table');
      expect(overview).not.toHaveBeenCalled();
    });

    it('opens the confirmation with what changed since it was generated', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage();
      await screen.findByRole('table');

      await user.click(confirmButton());

      const dialog = await screen.findByRole('dialog', { name: confirmTexts.title });
      expect(within(dialog).getByText('2 sesiones sin profesor')).toBeVisible();
      expect(within(dialog).queryByText(/Sustituirá/u)).not.toBeInTheDocument();
    });

    it('says which official the confirmation would replace', async () => {
      const user = userEvent.setup();
      overview.mockResolvedValue(CONFIRMED);
      loaded();
      renderPage();
      await screen.findByRole('table');
      await waitFor(() => {
        expect(overview).toHaveBeenCalled();
      });

      await user.click(confirmButton());

      expect(await screen.findByText(/Sustituirá al horario oficial confirmado el/u)).toBeVisible();
    });

    it('goes to the official with a notice once it is confirmed', async () => {
      const user = userEvent.setup();
      loaded();
      vi.spyOn(scheduleService, 'confirm').mockResolvedValue({
        status: 'confirmed',
        schedule: {
          ...(CONFIRMED.status === 'loaded' ? CONFIRMED.overview.official : null)!,
          id: draft.id,
        },
      });
      renderPage();
      await screen.findByRole('table');

      await user.click(confirmButton());
      await user.click(await screen.findByRole('button', { name: confirmTexts.confirm }));

      await waitFor(() => {
        expect(screen.getByTestId('pathname')).toHaveTextContent('/horarios/oficial');
      });
      expect(screen.getByTestId('notice')).toHaveTextContent('confirmed');
    });

    it('opens the discard dialog, and goes to /horarios with a notice once it is discarded', async () => {
      const user = userEvent.setup();
      loaded();
      const discard = vi
        .spyOn(scheduleService, 'discard')
        .mockResolvedValue({ status: 'discarded' });
      renderPage();
      await screen.findByRole('table');

      await user.click(discardButton());
      const dialog = await screen.findByRole('dialog', { name: discardTexts.title });
      await user.click(within(dialog).getByRole('button', { name: discardTexts.confirm }));

      await waitFor(() => {
        expect(screen.getByTestId('pathname')).toHaveTextContent('/horarios');
      });
      expect(screen.getByTestId('notice')).toHaveTextContent('discarded');
      expect(screen.getByTestId('readiness-page')).toBeInTheDocument();
      expect(discard.mock.calls[0]?.[1]).toBe(draft.id);
    });

    it.each([
      ['confirm', confirmTexts.title, confirmTexts.button],
      ['discard', discardTexts.title, discardTexts.button],
    ])('opens the %s dialog on a phone with no WCAG violations', async (_name, title, button) => {
      const user = userEvent.setup();
      loaded();
      renderPage({ width: PHONE });
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: button }));
      const dialog = await screen.findByRole('dialog', { name: title });

      expect(await wcagViolations(dialog)).toEqual([]);
    });

    it('gives the focus back to the button that opened the dialog when it is cancelled', async () => {
      const user = userEvent.setup();
      loaded();
      renderPage();
      await screen.findByRole('table');

      await user.click(discardButton());
      await user.click(await screen.findByRole('button', { name: es.schedule.discard.cancel }));

      await waitFor(() => {
        expect(discardButton()).toHaveFocus();
      });
    });
  });

  describe('the official schedule (US-ALGO-CONFIRM)', () => {
    const officialTexts = es.schedule.official;
    const official: ScheduleDetail = {
      ...draft,
      status: 'OFFICIAL',
      confirmedAt: '2026-11-05T09:10:00.000Z',
      confirmedBy: { firstName: 'Ana', lastName: 'García' },
    };
    const confirmedOn = new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date('2026-11-05T09:10:00.000Z'));

    beforeEach(() => {
      getOfficial.mockResolvedValue({ status: 'loaded', schedule: official });
    });

    it('asks for the official, not for the draft, once', async () => {
      renderPage({ official: true, strict: true });

      await screen.findByRole('table');

      expect(getOfficial).toHaveBeenCalledTimes(1);
      expect(get).not.toHaveBeenCalled();
    });

    it('shows the official title, the Official badge and who and when confirmed it', async () => {
      renderPage({ official: true });

      expect(
        await screen.findByRole('heading', { level: 1, name: officialTexts.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(officialTexts.badge)).toBeInTheDocument();
      expect(screen.getByText(`Confirmado el ${confirmedOn} por Ana García`)).toBeInTheDocument();
      expect(screen.queryByText(texts.badge)).not.toBeInTheDocument();
      expect(screen.queryByText(texts.badgeNote)).not.toBeInTheDocument();
    });

    it('has the three views and Export, and no actions, even for an administrator', async () => {
      renderPage({ official: true });

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: texts.views.professor })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: es.schedule.export.button })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: es.schedule.confirm.button }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: es.schedule.discard.button }),
      ).not.toBeInTheDocument();
      expect(overview).not.toHaveBeenCalled();
    });

    it('keeps the state of the views in the address', async () => {
      const user = userEvent.setup();
      renderPage({ official: true });
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: texts.views.professor }));

      expect(screen.getByTestId('search')).toHaveTextContent('?vista=profesor');
      expect(getOfficial).toHaveBeenCalledTimes(1);
    });

    it('says there is no official yet, with the way back', async () => {
      getOfficial.mockResolvedValue({ status: 'loaded', schedule: null });
      renderPage({ official: true });

      expect(await screen.findByText(officialTexts.empty)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: officialTexts.emptyLink })).toHaveAttribute(
        'href',
        '/horarios',
      );
      expect(
        screen.queryByRole('button', { name: es.schedule.export.button }),
      ).not.toBeInTheDocument();
    });

    it('shows an alert with Try again when it cannot be loaded, and asks again', async () => {
      const user = userEvent.setup();
      getOfficial.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage({ official: true });

      expect(await screen.findByRole('alert')).toHaveTextContent(officialTexts.loadError);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(getOfficial).toHaveBeenCalledTimes(2);
    });

    it('announces that it was just confirmed, and not when it is simply opened', async () => {
      const confirmed = renderPage({ official: true, state: { notice: 'confirmed' } });

      expect(await screen.findByRole('status')).toHaveTextContent(es.schedule.confirm.done);
      confirmed.unmount();

      renderPage({ official: true });
      await screen.findByRole('table');
      expect(screen.queryByText(es.schedule.confirm.done)).not.toBeInTheDocument();
    });

    it('lets a member see it', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      renderPage({ official: true });

      expect(await screen.findByText(officialTexts.badge)).toBeInTheDocument();
    });

    it('has no WCAG violations', async () => {
      const { container } = renderPage({ official: true });
      await screen.findByRole('table');

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations on a phone, and the official is told apart with text, not only color', async () => {
      const { container } = renderPage({ official: true, width: PHONE });
      await screen.findByRole('table');

      expect(await wcagViolations(container)).toEqual([]);
      expect(screen.getByText(officialTexts.badge)).toBeVisible();
    });
  });

  describe('a previous schedule (US-ALGO-CONFIRM_b)', () => {
    const previousTexts = es.schedule.previous.page;
    const dateOf = (iso: string) =>
      new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(iso),
      );
    const replaced: ScheduleDetail = {
      ...draft,
      id: PREVIOUS_ID,
      status: 'OFFICIAL',
      confirmedAt: '2026-11-05T09:10:00.000Z',
      confirmedBy: { firstName: 'Ana', lastName: 'García' },
      replacedAt: '2026-11-07T18:30:00.000Z',
    };

    beforeEach(() => {
      getById.mockResolvedValue({ status: 'loaded', schedule: replaced });
    });

    it('asks for the schedule of the route by its id, once, and for nothing else', async () => {
      renderPage({ previous: true, strict: true });

      await screen.findByRole('table');

      expect(getById).toHaveBeenCalledTimes(1);
      expect(getById.mock.calls[0]?.[1]).toBe(PREVIOUS_ID);
      expect(get).not.toHaveBeenCalled();
      expect(getOfficial).not.toHaveBeenCalled();
    });

    it('shows the title, the Replaced badge and who confirmed it and when it was replaced', async () => {
      renderPage({ previous: true });

      expect(
        await screen.findByRole('heading', { level: 1, name: previousTexts.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(previousTexts.badge)).toBeInTheDocument();
      expect(
        screen.getByText(`Confirmado el ${dateOf(replaced.confirmedAt ?? '')} por Ana García`),
      ).toBeInTheDocument();
      expect(
        screen.getByText(`Sustituido el ${dateOf(replaced.replacedAt ?? '')}`),
      ).toBeInTheDocument();
      expect(screen.queryByText(es.schedule.official.badge)).not.toBeInTheDocument();
      expect(screen.queryByText(texts.badge)).not.toBeInTheDocument();
    });

    it('warns that it is shown with the data of today', async () => {
      renderPage({ previous: true });

      expect(await screen.findByText(previousTexts.notice)).toBeInTheDocument();
    });

    it('has the three views and Export, and no actions, even for an administrator', async () => {
      renderPage({ previous: true });

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: texts.views.professor })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: es.schedule.export.button })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: es.schedule.confirm.button }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: es.schedule.discard.button }),
      ).not.toBeInTheDocument();
      expect(overview).not.toHaveBeenCalled();
    });

    it('keeps the state of the views in the address without asking again', async () => {
      const user = userEvent.setup();
      renderPage({ previous: true });
      await screen.findByRole('table');

      await user.click(screen.getByRole('button', { name: texts.views.professor }));

      expect(screen.getByTestId('search')).toHaveTextContent('?vista=profesor');
      expect(getById).toHaveBeenCalledTimes(1);
    });

    it('links to the list of previous schedules', async () => {
      renderPage({ previous: true });

      expect(await screen.findByRole('link', { name: previousTexts.list })).toHaveAttribute(
        'href',
        '/horarios/anteriores',
      );
    });

    it('shows the current official opened by its id as Official, without a replacement date', async () => {
      getById.mockResolvedValue({
        status: 'loaded',
        schedule: { ...replaced, replacedAt: null },
      });
      renderPage({ previous: true });

      expect(await screen.findByText(es.schedule.official.badge)).toBeInTheDocument();
      expect(screen.queryByText(previousTexts.badge)).not.toBeInTheDocument();
      expect(screen.queryByText(/Sustituido el/u)).not.toBeInTheDocument();
    });

    it('says the schedule does not exist, with a link to the list, on a 404', async () => {
      getById.mockResolvedValue({ status: 'notFound' });
      renderPage({ previous: true });

      expect(await screen.findByText(previousTexts.notFound)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: previousTexts.notFoundLink })).toHaveAttribute(
        'href',
        '/horarios/anteriores',
      );
      expect(
        screen.queryByRole('button', { name: es.schedule.export.button }),
      ).not.toBeInTheDocument();
    });

    it('shows an alert with Try again when it cannot be loaded, and asks again', async () => {
      const user = userEvent.setup();
      getById.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage({ previous: true });

      expect(await screen.findByRole('alert')).toHaveTextContent(es.schedule.official.loadError);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(getById).toHaveBeenCalledTimes(2);
    });

    it('lets a member see it', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      renderPage({ previous: true });

      expect(await screen.findByText(previousTexts.badge)).toBeInTheDocument();
    });

    it('does not announce a confirmation, even if the navigation carries one', async () => {
      renderPage({ previous: true, state: { notice: 'confirmed' } });
      await screen.findByRole('table');

      expect(screen.queryByText(es.schedule.confirm.done)).not.toBeInTheDocument();
    });

    it('has no WCAG violations for a member on a phone', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      const { container } = renderPage({ previous: true, width: PHONE });
      await screen.findByRole('table');

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations, also on a phone, and it is told apart with text', async () => {
      const { container } = renderPage({ previous: true, width: PHONE });
      await screen.findByRole('table');

      expect(await wcagViolations(container)).toEqual([]);
      expect(screen.getByText(previousTexts.badge)).toBeVisible();
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
