import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { calendarsService, type Calendar } from '../services/calendarsService';
import {
  professorAvailabilityService,
  type AvailabilityOutcome,
} from '../services/professorAvailabilityService';
import {
  professorsSummaryService,
  type ProfessorLoad,
  type ProfessorsSummary,
  type ProfessorsSummaryOutcome,
} from '../services/professorsSummaryService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { ProfessorsSummaryPage } from './ProfessorsSummaryPage';

const texts = es.professors.summary;
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

const COURSE_IDS: Record<string, string> = {
  '1º Primaria': 'course-1',
  '3º Primaria': 'course-3',
  '4º Primaria': 'course-4',
  '6º Primaria': 'course-6',
};

const subject = (
  subjectName: string,
  courseName: string,
  className: string,
  sessionsPerWeek = 3,
): ProfessorLoad['subjects'][number] => ({
  subjectId: `s-${subjectName}`,
  subjectName,
  courseId: COURSE_IDS[courseName] ?? courseName,
  courseName,
  classId: `k-${courseName}-${className}`,
  className,
  sessionsPerWeek,
});

/** Ana: 20 sesiones de 60 minutos, cabe. */
const ana: ProfessorLoad = {
  id: 'p-ana',
  firstName: 'Ana',
  lastName: 'García',
  subjects: [subject('Inglés', '1º Primaria', 'A', 5), subject('Música', '1º Primaria', 'B', 2)],
  courses: [{ id: 'course-1', name: '1º Primaria' }],
  calendars: [
    {
      calendar: { id: 'cal-1', name: 'Primaria' },
      sessions: 20,
      available: 25,
      minMinutes: 1200,
      maxMinutes: 1200,
    },
  ],
  sessionsPerWeek: 20,
  minMinutes: 1200,
  maxMinutes: 1200,
  status: 'FITS',
  warnings: [],
};

/** Eva: el rango cruza las 23 h, no le alcanza la disponibilidad y da clase en un curso sin calendario. */
const eva: ProfessorLoad = {
  id: 'p-eva',
  firstName: 'Eva',
  lastName: 'Pérez',
  subjects: [subject('Inglés', '3º Primaria', 'A', 5), subject('Lengua', '6º Primaria', 'A', 3)],
  courses: [
    { id: 'course-3', name: '3º Primaria' },
    { id: 'course-6', name: '6º Primaria' },
  ],
  calendars: [
    {
      calendar: { id: 'cal-2', name: 'Mixto' },
      sessions: 4,
      available: 25,
      minMinutes: 250,
      maxMinutes: 300,
    },
    {
      calendar: { id: 'cal-1', name: 'Primaria' },
      sessions: 22,
      available: 20,
      minMinutes: 1100,
      maxMinutes: 1200,
    },
  ],
  sessionsPerWeek: 28,
  minMinutes: 1350,
  maxMinutes: 1500,
  status: 'MAY_EXCEED',
  warnings: [
    { code: 'MAY_EXCEED_MAX_HOURS' },
    {
      code: 'AVAILABILITY_INSUFFICIENT',
      calendar: { id: 'cal-1', name: 'Primaria' },
      sessions: 22,
      available: 20,
    },
    {
      code: 'COURSE_WITHOUT_CALENDAR',
      course: { id: 'course-6', name: '6º Primaria' },
      assignmentCount: 3,
    },
    { code: 'SEVERAL_CALENDARS', calendarCount: 2 },
  ],
};

/** Luis: no pasa de las 23 h solo con el mínimo. */
const luis: ProfessorLoad = {
  id: 'p-luis',
  firstName: 'Luis',
  lastName: 'Ruiz',
  subjects: [subject('Mates', '4º Primaria', 'A', 5)],
  courses: [{ id: 'course-4', name: '4º Primaria' }],
  calendars: [
    {
      calendar: { id: 'cal-3', name: 'Largo' },
      sessions: 30,
      available: 30,
      minMinutes: 1400,
      maxMinutes: 1500,
    },
  ],
  sessionsPerWeek: 30,
  minMinutes: 1400,
  maxMinutes: 1500,
  status: 'EXCEEDS',
  warnings: [{ code: 'EXCEEDS_MAX_HOURS' }],
};

/** Sofía: sin asignaciones. */
const sofia: ProfessorLoad = {
  id: 'p-sofia',
  firstName: 'Sofía',
  lastName: 'Vega',
  subjects: [],
  courses: [],
  calendars: [],
  sessionsPerWeek: 0,
  minMinutes: 0,
  maxMinutes: 0,
  status: 'NO_LOAD',
  warnings: [],
};

const all = [ana, eva, luis, sofia];

const summaryOf = (
  professors: ProfessorLoad[],
  unassigned: ProfessorsSummary['unassigned'] = [],
): ProfessorsSummary => ({ maxTeachingMinutes: 1380, professors, unassigned });

/** Cinco sesiones de 60 minutos al día desde las 09:00, el calendario de los cursos de Ana. */
const primary = {
  id: 'cal-1',
  name: 'Primaria',
  periods: ['09:00', '10:00', '11:00', '12:00', '13:00'].map((startTime, index) => ({
    type: 'SESSION' as const,
    startTime,
    endTime: `${String(9 + index + 1).padStart(2, '0')}:00`,
  })),
  courses: [{ id: 'course-1', name: '1º Primaria' }],
  createdAt: '2026-11-01T10:00:00.000Z',
} as Calendar;

const availabilityOf = (
  professorId: string,
  unavailable: { dayOfWeek: number; startTime: string; endTime: string }[] = [],
): AvailabilityOutcome => ({ status: 'loaded', availability: { professorId, unavailable } });

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('ProfessorsSummaryPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof professorsSummaryService.get>;
  let media: MatchMediaControl;
  let calendars: MockInstance<typeof calendarsService.list>;
  let availability: MockInstance<typeof professorAvailabilityService.get>;

  function signInAs(role: 'ADMIN' | 'MEMBER') {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
  }

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    signInAs('MEMBER');
    get = vi.spyOn(professorsSummaryService, 'get');
    calendars = vi.spyOn(calendarsService, 'list').mockResolvedValue({
      status: 'loaded',
      calendars: [primary],
    });
    availability = vi
      .spyOn(professorAvailabilityService, 'get')
      .mockImplementation((_fetch, professorId) => Promise.resolve(availabilityOf(professorId)));
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    get.mockRestore();
    calendars.mockRestore();
    availability.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(width = DESKTOP, strict = false) {
    media.setWidth(width);
    const tree = (
      <MemoryRouter initialEntries={['/profesores/resumen']}>
        <SessionProvider>
          <Routes>
            <Route path="/profesores/resumen" element={<ProfessorsSummaryPage />} />
            <Route path="/profesores/nuevo" element={<div data-testid="create-page" />} />
            <Route
              path="/profesores/:id/disponibilidad"
              element={<div data-testid="availability-page" />}
            />
            <Route path="/cursos/:id/profesores" element={<div data-testid="matrix-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function respond(outcome: ProfessorsSummaryOutcome) {
    get.mockResolvedValue(outcome);
  }

  function loaded(professors: ProfessorLoad[], unassigned: ProfessorsSummary['unassigned'] = []) {
    respond({ status: 'loaded', summary: summaryOf(professors, unassigned) });
  }

  describe('loading the summary', () => {
    it('shows the title and the explanation of the range', async () => {
      loaded([ana]);
      renderPage();

      expect(screen.getByRole('heading', { level: 1, name: texts.title })).toBeInTheDocument();
      expect(screen.getByText(texts.intro)).toBeInTheDocument();
      await screen.findByRole('table');
    });

    it('asks for the summary once, also in strict mode, and shows that it is loading', async () => {
      loaded([ana]);
      renderPage(DESKTOP, true);

      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
      await screen.findByRole('table');

      expect(get).toHaveBeenCalledTimes(1);
    });

    it('shows an alert with a button to retry when it fails, and asks again when it is pressed', async () => {
      const user = userEvent.setup();
      respond({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);

      loaded([ana]);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('shows nothing of its own when the session is no longer valid: the layout redirects', async () => {
      respond({ status: 'unauthenticated' });
      renderPage();

      await waitFor(() => {
        expect(get).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('invites to create a professor when the school has none, without the filters', async () => {
      loaded([]);
      renderPage();

      expect(await screen.findByText(texts.empty)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: texts.create })).toHaveAttribute(
        'href',
        '/profesores/nuevo',
      );
      expect(screen.queryByRole('search')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a phone', PHONE],
  ])('on %s', (_name, width) => {
    const isWide = width === DESKTOP;

    /** Los profesores pintados, cada uno en su fila o su tarjeta. */
    function items(): HTMLElement[] {
      return isWide
        ? within(screen.getByRole('table')).getAllByRole('row').slice(1)
        : within(screen.getByRole('list', { name: texts.list })).getAllByRole('listitem');
    }

    it('shows each professor with the subjects, the sessions, the hours and the status, in order', async () => {
      loaded(all);
      renderPage(width);

      await screen.findByText('García, Ana');

      const rows = items();
      expect(rows).toHaveLength(4);
      expect(rows[0]).toHaveTextContent('García, Ana');
      expect(rows[0]).toHaveTextContent('Inglés: 1º Primaria A');
      expect(rows[0]).toHaveTextContent('Música: 1º Primaria B');
      expect(rows[0]).toHaveTextContent('20');
      expect(rows[0]).toHaveTextContent('20 h');
      expect(rows[0]).toHaveTextContent(texts.statuses.FITS);
      expect(rows[1]).toHaveTextContent('Pérez, Eva');
      expect(rows[1]).toHaveTextContent('22 h 30 min – 25 h');
      expect(rows[1]).toHaveTextContent(texts.statuses.MAY_EXCEED);
      expect(rows[2]).toHaveTextContent('Ruiz, Luis');
      expect(rows[2]).toHaveTextContent('23 h 20 min – 25 h');
      expect(rows[2]).toHaveTextContent(texts.statuses.EXCEEDS);
    });

    it('shows a professor without load with a dash instead of hours and without subjects', async () => {
      loaded([sofia]);
      renderPage(width);

      await screen.findByText('Vega, Sofía');

      const [row] = items();
      expect(row).toHaveTextContent(texts.statuses.NO_LOAD);
      expect(row).toHaveTextContent(texts.noHours);
      expect(row).toHaveTextContent(es.professors.noSubjects);
      expect(within(row as HTMLElement).queryByRole('status')).not.toBeInTheDocument();
    });

    it('says the status with its text and an icon that is hidden from the screen readers', async () => {
      loaded([ana]);
      renderPage(width);

      await screen.findByText('García, Ana');

      const label = within(items()[0] as HTMLElement).getByText(texts.statuses.FITS);
      expect(label.parentElement?.querySelector('[aria-hidden="true"]')).not.toBeNull();
    });

    it('shows the warnings of a professor in a region with its name, in red and with their text', async () => {
      loaded([eva]);
      renderPage(width);

      await screen.findByText('Pérez, Eva');

      const region = screen.getByRole('status', { name: 'Avisos de Pérez, Eva' });
      const lines = within(region)
        .getAllByText(/./)
        .map((line) => line.textContent);
      expect(lines).toEqual([
        'Puede pasar de 23 h según las sesiones que le toquen',
        'En «Primaria» tiene 22 sesiones y solo puede dar 20',
        '3 asignaciones en 6º Primaria, que no tiene calendario, no se cuentan',
        'Da clase en 2 calendarios: los solapes entre ellos los comprueba la generación',
      ]);
      expect(
        within(region).getByText('En «Primaria» tiene 22 sesiones y solo puede dar 20'),
      ).toHaveClass('text-danger');
    });

    it('writes the warning of a professor over 23 hours in red and the singular of one assignment', async () => {
      loaded([
        luis,
        {
          ...sofia,
          id: 'p-x',
          lastName: 'Zapata',
          warnings: [
            {
              code: 'COURSE_WITHOUT_CALENDAR',
              course: { id: 'course-6', name: '6º Primaria' },
              assignmentCount: 1,
            },
          ],
        },
      ]);
      renderPage(width);

      await screen.findByText('Ruiz, Luis');

      expect(screen.getByText('Pasa de 23 h aunque le toquen las sesiones más cortas')).toHaveClass(
        'text-danger',
      );
      expect(
        screen.getByText('1 asignación en 6º Primaria, que no tiene calendario, no se cuenta'),
      ).toBeInTheDocument();
    });

    it('links to the availability of the professor and to the matrix of each course where they teach', async () => {
      const user = userEvent.setup();
      loaded([eva]);
      renderPage(width);

      await screen.findByText('Pérez, Eva');

      const availability = screen.getByRole('link', {
        name: 'Editar la disponibilidad de Pérez, Eva',
      });
      expect(availability).toHaveAttribute('href', '/profesores/p-eva/disponibilidad');
      expect(screen.getByRole('link', { name: 'Profesores de 3º Primaria' })).toHaveAttribute(
        'href',
        '/cursos/course-3/profesores',
      );
      const sixth = screen.getByRole('link', { name: 'Profesores de 6º Primaria' });
      expect(sixth).toHaveAttribute('href', '/cursos/course-6/profesores');

      await user.click(sixth);
      expect(await screen.findByTestId('matrix-page')).toBeInTheDocument();
    });

    it('opens the availability of the professor', async () => {
      const user = userEvent.setup();
      loaded([ana]);
      renderPage(width);

      await user.click(
        await screen.findByRole('link', { name: 'Editar la disponibilidad de García, Ana' }),
      );

      expect(await screen.findByTestId('availability-page')).toBeInTheDocument();
    });
  });

  describe('the courses with subjects without professor', () => {
    const missing = [
      { courseId: 'course-1', courseName: '1º Primaria', missingCount: 2 },
      { courseId: 'course-3', courseName: '3º Primaria', missingCount: 1 },
    ];

    it('warns above the professors, with the cells missing in each course and a link to its matrix', async () => {
      const user = userEvent.setup();
      loaded([ana], missing);
      renderPage();

      const notice = await screen.findByRole('region', { name: texts.unassigned.title });

      expect(notice).toHaveTextContent(texts.unassigned.intro);
      const first = within(notice).getByRole('link', { name: '1º Primaria: 2 sin profesor' });
      expect(first).toHaveAttribute('href', '/cursos/course-1/profesores');
      expect(
        within(notice).getByRole('link', { name: '3º Primaria: 1 sin profesor' }),
      ).toHaveAttribute('href', '/cursos/course-3/profesores');
      expect(
        notice.compareDocumentPosition(screen.getByRole('table')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.queryByText(texts.unassigned.allAssigned)).not.toBeInTheDocument();

      await user.click(first);
      expect(await screen.findByTestId('matrix-page')).toBeInTheDocument();
    });

    it('lists the courses in the order the server sends them', async () => {
      loaded([ana], missing);
      renderPage();

      const notice = await screen.findByRole('region', { name: texts.unassigned.title });

      expect(
        within(notice)
          .getAllByRole('link')
          .map((link) => link.textContent),
      ).toEqual(['1º Primaria: 2 sin profesor', '3º Primaria: 1 sin profesor']);
    });

    it('says that every subject has a professor when no course is missing one', async () => {
      loaded([ana]);
      renderPage();

      expect(await screen.findByText(texts.unassigned.allAssigned)).toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: texts.unassigned.title }),
      ).not.toBeInTheDocument();
    });

    it('does not say that every subject has a professor when the school has no professors', async () => {
      loaded([]);
      renderPage();

      await screen.findByText(texts.empty);

      expect(screen.queryByText(texts.unassigned.allAssigned)).not.toBeInTheDocument();
    });

    it('warns even when the school has no professors yet', async () => {
      loaded([], missing);
      renderPage();

      expect(
        await screen.findByRole('region', { name: texts.unassigned.title }),
      ).toBeInTheDocument();
      expect(screen.getByText(texts.empty)).toBeInTheDocument();
    });

    it('says it in English with its own text', async () => {
      await i18n.changeLanguage('en');
      loaded([ana], missing);
      renderPage();

      const notice = await screen.findByRole('region', { name: 'Professors missing' });

      expect(
        within(notice).getByRole('link', { name: '1º Primaria: 2 without a professor' }),
      ).toBeInTheDocument();
    });
  });

  describe('filters and count', () => {
    /** Los nombres de los profesores que se ven, en el orden de la tabla. */
    function shown(): string[] {
      return within(screen.getByRole('table'))
        .getAllByRole('rowheader')
        .map((header) => header.textContent);
    }

    const searchBox = () => screen.getByRole('searchbox', { name: texts.filters.search });
    const statusSelect = () => screen.getByRole('combobox', { name: texts.filters.status });
    const subjectSelect = () => screen.getByRole('combobox', { name: texts.filters.subject });
    const onlyWarnings = () =>
      screen.getByRole('checkbox', { name: texts.filters.onlyWithWarnings });
    const count = () => screen.getByTestId('professors-summary-count');

    it('shows the filters and how many professors there are', async () => {
      loaded(all);
      renderPage();

      await screen.findByRole('table');

      expect(screen.getByRole('search', { name: texts.filters.legend })).toBeInTheDocument();
      expect(searchBox()).toBeInTheDocument();
      expect(count()).toHaveTextContent('4 profesores');
      expect(shown()).toEqual(['García, Ana', 'Pérez, Eva', 'Ruiz, Luis', 'Vega, Sofía']);
    });

    it('uses the singular with one professor', async () => {
      loaded([ana]);
      renderPage();

      await screen.findByRole('table');

      expect(count()).toHaveTextContent('1 profesor');
      expect(count()).not.toHaveTextContent('1 profesores');
    });

    it('filters by status, with the four statuses as options', async () => {
      const user = userEvent.setup();
      loaded(all);
      renderPage();
      await screen.findByRole('table');

      expect(
        within(statusSelect())
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        texts.filters.all,
        texts.statuses.NO_LOAD,
        texts.statuses.FITS,
        texts.statuses.MAY_EXCEED,
        texts.statuses.EXCEEDS,
      ]);

      await user.selectOptions(statusSelect(), texts.statuses.EXCEEDS);

      expect(shown()).toEqual(['Ruiz, Luis']);
      expect(count()).toHaveTextContent('1 profesor');
    });

    it('filters by the subject, offering the subjects any professor teaches by name', async () => {
      const user = userEvent.setup();
      loaded(all);
      renderPage();
      await screen.findByRole('table');

      expect(
        within(subjectSelect())
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([texts.filters.allSubjects, 'Inglés', 'Lengua', 'Mates', 'Música']);

      await user.selectOptions(subjectSelect(), 'Inglés');

      expect(shown()).toEqual(['García, Ana', 'Pérez, Eva']);
      expect(count()).toHaveTextContent('2 profesores');
    });

    it('searches by name and last name without capitals or accents, but not by subject', async () => {
      const user = userEvent.setup();
      loaded(all);
      renderPage();
      await screen.findByRole('table');

      await user.type(searchBox(), 'PEREZ');
      expect(shown()).toEqual(['Pérez, Eva']);

      await user.clear(searchBox());
      await user.type(searchBox(), 'ingles');
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText(texts.noMatches)).toBeInTheDocument();
    });

    it('keeps only the professors with warnings', async () => {
      const user = userEvent.setup();
      loaded(all);
      renderPage();
      await screen.findByRole('table');

      await user.click(onlyWarnings());

      expect(shown()).toEqual(['Pérez, Eva', 'Ruiz, Luis']);
    });

    it('combines the filters and clears all of them from the empty result, with the focus on the search', async () => {
      const user = userEvent.setup();
      loaded(all);
      renderPage();
      await screen.findByRole('table');
      await user.selectOptions(statusSelect(), texts.statuses.FITS);
      await user.click(onlyWarnings());

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(count()).toHaveTextContent('0 profesores');
      expect(screen.getByText(texts.noMatches)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: texts.filters.clear }));

      expect(shown()).toHaveLength(4);
      expect(searchBox()).toHaveFocus();
      expect(statusSelect()).toHaveValue('');
      expect(onlyWarnings()).not.toBeChecked();
    });

    it('does not offer to clear the filters when none is active', async () => {
      loaded(all);
      renderPage();

      await screen.findByRole('table');

      expect(screen.queryByRole('button', { name: texts.filters.clear })).not.toBeInTheDocument();
    });

    it('filters the cards of a phone the same way', async () => {
      const user = userEvent.setup();
      loaded(all);
      renderPage(PHONE);
      await screen.findByRole('list', { name: texts.list });

      await user.selectOptions(statusSelect(), texts.statuses.NO_LOAD);

      const cards = within(screen.getByRole('list', { name: texts.list })).getAllByRole('listitem');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveTextContent('Vega, Sofía');
    });

    it('does not filter the notice of the courses without professor', async () => {
      const user = userEvent.setup();
      loaded(all, [{ courseId: 'course-1', courseName: '1º Primaria', missingCount: 2 }]);
      renderPage();
      await screen.findByRole('table');

      await user.type(searchBox(), 'nadie');

      expect(screen.getByRole('region', { name: texts.unassigned.title })).toBeInTheDocument();
    });

    it('says it in English with its own plural', async () => {
      await i18n.changeLanguage('en');
      loaded([ana]);
      renderPage();

      await screen.findByRole('table');

      expect(count()).toHaveTextContent('1 professor');
      expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
    });
  });

  describe.each([
    ['a wide screen', DESKTOP],
    ['a phone', PHONE],
  ])('the detail of a professor on %s', (_name, width) => {
    const isWide = width === DESKTOP;
    const detailButton = (name: string) =>
      screen.getByRole('button', { name: `Detalle de ${name}` });
    const detailOf = (name: string) => screen.queryByRole('region', { name: `Detalle de ${name}` });

    it('has a button for each professor with load and none for the one without', async () => {
      loaded(all);
      renderPage(width);
      await screen.findByText('García, Ana');

      for (const name of ['García, Ana', 'Pérez, Eva', 'Ruiz, Luis']) {
        expect(detailButton(name)).toHaveAttribute('aria-expanded', 'false');
        expect(detailButton(name)).toHaveTextContent(texts.detail.button);
      }
      expect(
        screen.queryByRole('button', { name: 'Detalle de Vega, Sofía' }),
      ).not.toBeInTheDocument();
      expect(detailOf('García, Ana')).not.toBeInTheDocument();
    });

    it('opens the detail of a professor, which the button controls, and closes it with the same button', async () => {
      const user = userEvent.setup();
      loaded(all);
      renderPage(width);
      await screen.findByText('García, Ana');

      await user.click(detailButton('García, Ana'));

      const region = detailOf('García, Ana');
      expect(region).toBeInTheDocument();
      expect(detailButton('García, Ana')).toHaveAttribute('aria-expanded', 'true');
      expect(detailButton('García, Ana')).toHaveAttribute('aria-controls', region?.id);
      expect(region).toHaveTextContent('Inglés · 1º Primaria A · 5 sesiones');

      await user.click(detailButton('García, Ana'));

      expect(detailOf('García, Ana')).not.toBeInTheDocument();
      expect(detailButton('García, Ana')).toHaveAttribute('aria-expanded', 'false');
    });

    it('opens only one at a time: the first closes when another opens', async () => {
      const user = userEvent.setup();
      loaded(all);
      renderPage(width);
      await screen.findByText('García, Ana');

      await user.click(detailButton('García, Ana'));
      await user.click(detailButton('Pérez, Eva'));

      expect(detailOf('García, Ana')).not.toBeInTheDocument();
      expect(detailButton('García, Ana')).toHaveAttribute('aria-expanded', 'false');
      expect(detailOf('Pérez, Eva')).toBeInTheDocument();
      expect(screen.getAllByRole('region', { name: /^Detalle de / })).toHaveLength(1);
    });

    it(
      isWide
        ? 'puts the detail in the row after the one of the professor, across all the columns'
        : 'puts the detail inside the card of the professor',
      async () => {
        const user = userEvent.setup();
        loaded(all);
        renderPage(width);
        await screen.findByText('García, Ana');

        await user.click(detailButton('Pérez, Eva'));

        const region = detailOf('Pérez, Eva') as HTMLElement;
        if (isWide) {
          const row = screen.getByText('Pérez, Eva').closest('tr') as HTMLElement;
          const next = row.nextElementSibling as HTMLElement;
          expect(next).toContainElement(region);
          expect(next.querySelector('td')).toHaveAttribute('colspan', '7');
        } else {
          expect(region.closest('li')).toHaveTextContent('Pérez, Eva');
          expect(within(region.closest('li') as HTMLElement).getAllByRole('region')).toHaveLength(
            1,
          );
        }
      },
    );
  });

  describe('loading the detail', () => {
    const detailButton = (name: string) =>
      screen.getByRole('button', { name: `Detalle de ${name}` });
    const openAna = async (user: ReturnType<typeof userEvent.setup>) => {
      loaded(all);
      renderPage();
      await screen.findByText('García, Ana');
      await user.click(detailButton('García, Ana'));
    };

    it('asks for the calendars once per visit and for the availability of the professor each time it opens', async () => {
      const user = userEvent.setup();
      await openAna(user);
      await screen.findByRole('table', { name: 'Disponibilidad de García, Ana en «Primaria»' });

      await user.click(detailButton('Pérez, Eva'));
      await user.click(detailButton('García, Ana'));

      await waitFor(() => {
        expect(availability).toHaveBeenCalledTimes(3);
      });
      expect(calendars).toHaveBeenCalledTimes(1);
      expect(availability.mock.calls.map(([, professorId]) => professorId)).toEqual([
        'p-ana',
        'p-eva',
        'p-ana',
      ]);
    });

    it('asks for nothing until a professor is opened', async () => {
      loaded(all);
      renderPage();
      await screen.findByText('García, Ana');

      expect(calendars).not.toHaveBeenCalled();
      expect(availability).not.toHaveBeenCalled();
    });

    it('draws the grid with the intervals of the professor and completes the length of the sessions', async () => {
      availability.mockImplementation((_fetch, professorId) =>
        Promise.resolve(
          availabilityOf(professorId, [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }]),
        ),
      );
      const user = userEvent.setup();
      await openAna(user);

      const table = await screen.findByRole('table', {
        name: 'Disponibilidad de García, Ana en «Primaria»',
      });
      expect(within(table).getAllByText('No disponible')).toHaveLength(1);
      expect(
        screen.getByText('Inglés · 1º Primaria A · 5 sesiones · «Primaria», sesiones de 60 min'),
      ).toBeInTheDocument();
    });

    it('shows an alert with Retry inside the detail when the availability fails, and asks only for it again', async () => {
      const user = userEvent.setup();
      availability.mockResolvedValueOnce({ status: 'unavailable' });
      await openAna(user);

      const region = await screen.findByRole('region', { name: 'Detalle de García, Ana' });
      expect(await within(region).findByRole('alert')).toHaveTextContent(
        texts.detail.availability.loadError,
      );
      expect(within(region).getByText('Total: 20 h')).toBeInTheDocument();

      await user.click(
        within(region).getByRole('button', { name: texts.detail.availability.retry }),
      );

      expect(
        await screen.findByRole('table', { name: 'Disponibilidad de García, Ana en «Primaria»' }),
      ).toBeInTheDocument();
      expect(availability).toHaveBeenCalledTimes(2);
      expect(calendars).toHaveBeenCalledTimes(1);
    });

    it('asks for the calendars again when they failed and Retry is pressed', async () => {
      const user = userEvent.setup();
      calendars.mockResolvedValueOnce({ status: 'unavailable' });
      await openAna(user);

      const region = await screen.findByRole('region', { name: 'Detalle de García, Ana' });
      await within(region).findByRole('alert');
      await user.click(
        within(region).getByRole('button', { name: texts.detail.availability.retry }),
      );

      expect(
        await screen.findByRole('table', { name: 'Disponibilidad de García, Ana en «Primaria»' }),
      ).toBeInTheDocument();
      expect(calendars).toHaveBeenCalledTimes(2);
    });

    it('never paints the availability of a professor in the detail of another one when the answer comes late', async () => {
      const user = userEvent.setup();
      const late = deferred<AvailabilityOutcome>();
      availability.mockImplementation((_fetch, professorId) =>
        professorId === 'p-ana' ? late.promise : Promise.resolve(availabilityOf(professorId)),
      );
      await openAna(user);

      await user.click(detailButton('Pérez, Eva'));
      await screen.findByRole('table', { name: 'Disponibilidad de Pérez, Eva en «Primaria»' });
      late.resolve(
        availabilityOf('p-ana', [
          { dayOfWeek: 1, startTime: '09:00', endTime: '14:00' },
          { dayOfWeek: 2, startTime: '09:00', endTime: '14:00' },
        ]),
      );
      await Promise.resolve();

      const table = screen.getByRole('table', {
        name: 'Disponibilidad de Pérez, Eva en «Primaria»',
      });
      expect(within(table).queryByText('No disponible')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Detalle de García, Ana' }),
      ).not.toBeInTheDocument();
    });

    it('closes the detail when a filter hides the professor, which stays closed when it shows again', async () => {
      const user = userEvent.setup();
      await openAna(user);
      await screen.findByRole('region', { name: 'Detalle de García, Ana' });

      const search = screen.getByRole('searchbox', { name: texts.filters.search });
      await user.type(search, 'perez');

      expect(screen.queryByRole('region', { name: /^Detalle de / })).not.toBeInTheDocument();

      await user.clear(search);

      expect(detailButton('García, Ana')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('region', { name: /^Detalle de / })).not.toBeInTheDocument();
    });

    it('keeps the detail open when a filter still shows the professor', async () => {
      const user = userEvent.setup();
      await openAna(user);
      await screen.findByRole('region', { name: 'Detalle de García, Ana' });

      await user.type(screen.getByRole('searchbox', { name: texts.filters.search }), 'garcia');

      expect(screen.getByRole('region', { name: 'Detalle de García, Ana' })).toBeInTheDocument();
    });

    it('shows nothing of its own when the session is no longer valid while the availability loads', async () => {
      const user = userEvent.setup();
      availability.mockResolvedValueOnce({ status: 'unauthenticated' });
      await openAna(user);

      await waitFor(() => {
        expect(availability).toHaveBeenCalled();
      });
      expect(
        within(screen.getByRole('region', { name: 'Detalle de García, Ana' })).queryByRole('alert'),
      ).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    const missing = [{ courseId: 'course-1', courseName: '1º Primaria', missingCount: 2 }];

    it.each([
      ['a wide screen', DESKTOP],
      ['a phone', PHONE],
    ])(
      'has no WCAG violations with the four statuses, the warnings and the notice on %s',
      async (_name, width) => {
        loaded(all, missing);
        const { container } = renderPage(width);
        await screen.findByText('García, Ana');

        expect(await wcagViolations(container)).toEqual([]);
      },
    );

    it('has no WCAG violations while loading, when it fails and when the school has no professors', async () => {
      get.mockReturnValue(new Promise(() => undefined));
      const loading = renderPage();
      expect(await wcagViolations(loading.container)).toEqual([]);
      loading.unmount();

      respond({ status: 'unavailable' });
      const failed = renderPage();
      await screen.findByRole('alert');
      expect(await wcagViolations(failed.container)).toEqual([]);
      failed.unmount();

      loaded([], missing);
      const empty = renderPage();
      await screen.findByText(texts.empty);
      expect(await wcagViolations(empty.container)).toEqual([]);
    });

    it.each([
      ['a wide screen', DESKTOP],
      ['a phone', PHONE],
    ])(
      'has no WCAG violations with the detail open, with its warnings, on %s',
      async (_name, width) => {
        const user = userEvent.setup();
        loaded(all, missing);
        const { container } = renderPage(width);
        await screen.findByText('García, Ana');

        await user.click(screen.getByRole('button', { name: 'Detalle de Pérez, Eva' }));
        await screen.findByRole('table', { name: 'Disponibilidad de Pérez, Eva en «Primaria»' });

        expect(await wcagViolations(container)).toEqual([]);
      },
    );

    it('has no WCAG violations with the detail open while it loads and when it fails', async () => {
      const user = userEvent.setup();
      availability.mockReturnValue(new Promise(() => undefined));
      loaded(all);
      const { container, unmount } = renderPage();
      await screen.findByText('García, Ana');
      await user.click(screen.getByRole('button', { name: 'Detalle de Pérez, Eva' }));
      await screen.findByRole('region', { name: 'Detalle de Pérez, Eva' });
      expect(await wcagViolations(container)).toEqual([]);
      unmount();

      availability.mockResolvedValue({ status: 'unavailable' });
      const failed = renderPage();
      await screen.findByText('García, Ana');
      await user.click(screen.getByRole('button', { name: 'Detalle de Pérez, Eva' }));
      await failed.findByRole('alert');
      expect(await wcagViolations(failed.container)).toEqual([]);
    });

    it('has no WCAG violations with the detail open in English', async () => {
      const user = userEvent.setup();
      await i18n.changeLanguage('en');
      loaded(all, missing);
      const { container } = renderPage();
      await screen.findByText('García, Ana');

      await user.click(screen.getByRole('button', { name: 'Detail of Pérez, Eva' }));
      await screen.findByRole('table', { name: 'Availability of Pérez, Eva in "Primaria"' });

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations with no result for the filters', async () => {
      const user = userEvent.setup();
      loaded(all);
      const { container } = renderPage();
      await screen.findByRole('table');

      await user.type(screen.getByRole('searchbox', { name: texts.filters.search }), 'nadie');

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations in English', async () => {
      await i18n.changeLanguage('en');
      loaded(all, missing);
      const { container } = renderPage();
      await screen.findByText('García, Ana');

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('gives the table its title as the name and a header for every row and column', async () => {
      loaded(all);
      renderPage();

      const table = await screen.findByRole('table', { name: texts.title });

      expect(within(table).getAllByRole('columnheader')).toHaveLength(7);
      expect(within(table).getAllByRole('rowheader')).toHaveLength(4);
    });
  });
});
