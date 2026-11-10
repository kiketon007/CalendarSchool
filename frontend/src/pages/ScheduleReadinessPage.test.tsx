import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { scheduleDraftService } from '../services/scheduleDraftService';
import { scheduleGenerationService, type Generation } from '../services/scheduleGenerationService';
import {
  scheduleReadinessService,
  type ReadinessIssue,
  type ScheduleReadiness,
  type ScheduleReadinessOutcome,
} from '../services/scheduleReadinessService';
import {
  scheduleService,
  type ScheduleOverviewOutcome,
  type ScheduleSummary,
} from '../services/scheduleService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { ScheduleReadinessPage } from './ScheduleReadinessPage';

const texts = es.schedule.readiness;
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

const ref = (name: string, id = `id-${name}`) => ({ id, name });
const eva = { id: 'p-eva', firstName: 'Eva', lastName: 'García' };
const pedro = { id: 'p-pedro', firstName: 'Pedro', lastName: 'Soto' };

/** Un problema de cada código bloqueante, con lo que lleva cada uno. */
const blocking: ReadinessIssue[] = [
  { code: 'SCHOOL_WITHOUT_COURSES' },
  { code: 'COURSE_WITHOUT_CALENDAR', course: ref('6º Primaria', 'course-6') },
  {
    code: 'WORKLOAD_EXCEEDS_SLOTS',
    course: ref('1º Primaria', 'course-1'),
    assigned: 31,
    available: 30,
  },
  {
    code: 'BLOCK_LARGER_THAN_LOAD',
    course: ref('1º Primaria', 'course-1'),
    subject: ref('Plástica', 'subject-art'),
  },
  {
    code: 'SUBJECT_DOES_NOT_FIT',
    course: ref('1º Primaria', 'course-1'),
    subject: ref('Música', 'subject-music'),
  },
  {
    code: 'SUBJECT_DOES_NOT_FIT_WITH_PROFESSOR',
    course: ref('1º Primaria', 'course-1'),
    subject: ref('Inglés', 'subject-english'),
    schoolClass: ref('A', 'class-a'),
    professor: eva,
  },
  {
    code: 'CLASSES_WITHOUT_PROFESSOR',
    course: ref('1º Primaria', 'course-1'),
    subject: ref('Lengua', 'subject-language'),
    classes: [ref('B', 'class-b'), ref('C', 'class-c')],
    missingCount: 2,
  },
  { code: 'EXCEEDS_MAX_HOURS', professor: pedro },
  {
    code: 'AVAILABILITY_INSUFFICIENT',
    professor: eva,
    calendar: ref('Primaria', 'cal-1'),
    sessions: 22,
    available: 20,
  },
];

/** Un problema de cada código de aviso. */
const warnings: ReadinessIssue[] = [
  {
    code: 'SUBJECT_INACTIVE',
    subject: ref('Francés', 'subject-french'),
    courses: [ref('2º Primaria', 'course-2'), ref('5º Primaria', 'course-5')],
  },
  { code: 'COURSE_WITHOUT_CLASSES', course: ref('2 años', 'course-2y') },
  { code: 'COURSE_WITHOUT_SUBJECTS', course: ref('3 años', 'course-3y') },
  {
    code: 'WORKLOAD_BELOW_SLOTS',
    course: ref('4º Primaria', 'course-4'),
    assigned: 25,
    available: 30,
  },
  { code: 'MAY_EXCEED_MAX_HOURS', professor: pedro },
  { code: 'SEVERAL_CALENDARS', professor: pedro, count: 2 },
  {
    code: 'SLOTS_OUTSIDE_CALENDAR',
    course: ref('1º Primaria', 'course-1'),
    subject: ref('Música', 'subject-music'),
    count: 2,
  },
  {
    code: 'PREFERRED_SLOTS_FORBIDDEN',
    course: ref('1º Primaria', 'course-1'),
    subject: ref('Música', 'subject-music'),
    count: 1,
  },
];

const readyReadiness: ScheduleReadiness = { ready: true, blocking: [], warnings: [] };
const fullReadiness: ScheduleReadiness = { ready: false, blocking, warnings };

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

/** Estando en el oficial, enseña el aviso con el que se llegó. */
function OfficialStub() {
  const location = useLocation();
  return (
    <div data-testid="official-page">
      {(location.state as { notice?: string } | null)?.notice ?? ''}
    </div>
  );
}

describe('ScheduleReadinessPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof scheduleReadinessService.get>;
  let generationCurrent: MockInstance<typeof scheduleGenerationService.current>;
  let overview: MockInstance<typeof scheduleService.overview>;
  let media: MatchMediaControl;

  function signInAs(role: 'ADMIN' | 'MEMBER') {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
  }

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    signInAs('MEMBER');
    get = vi.spyOn(scheduleReadinessService, 'get');
    // El panel de la generación pide la actual al montarse: por defecto, el colegio nunca ha generado.
    generationCurrent = vi.spyOn(scheduleGenerationService, 'current');
    generationCurrent.mockResolvedValue({ status: 'loaded', generation: null });
    // El resumen de los horarios: por defecto, el colegio no tiene ninguno.
    overview = vi.spyOn(scheduleService, 'overview').mockResolvedValue({
      status: 'loaded',
      overview: { draft: null, official: null, previousCount: 0 },
    });
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    get.mockRestore();
    generationCurrent.mockRestore();
    overview.mockRestore();
    vi.restoreAllMocks();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(width = DESKTOP, strict = false, state?: { notice: string }) {
    media.setWidth(width);
    const tree = (
      <MemoryRouter initialEntries={[{ pathname: '/horarios', state }]}>
        <SessionProvider>
          <Routes>
            <Route path="/horarios" element={<ScheduleReadinessPage />} />
            <Route path="/horarios/oficial" element={<OfficialStub />} />
            <Route path="/calendarios" element={<div data-testid="calendars-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function respond(outcome: ScheduleReadinessOutcome) {
    get.mockResolvedValue(outcome);
  }

  function loaded(readiness: ScheduleReadiness) {
    respond({ status: 'loaded', readiness });
  }

  describe('loading the readiness', () => {
    it('shows the title and what the page is for', async () => {
      loaded(readyReadiness);
      renderPage();

      expect(screen.getByRole('heading', { level: 1, name: texts.title })).toBeInTheDocument();
      expect(screen.getByText(texts.intro)).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByText(texts.loading)).not.toBeInTheDocument();
      });
    });

    it('asks for the readiness once, also in strict mode, and shows that it is loading', async () => {
      loaded(readyReadiness);
      renderPage(DESKTOP, true);

      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
      await waitFor(() => {
        expect(screen.queryByText(texts.loading)).not.toBeInTheDocument();
      });

      expect(get).toHaveBeenCalledTimes(1);
    });

    it('shows an alert with a button to retry when it fails, and asks again when it is pressed', async () => {
      const user = userEvent.setup();
      respond({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);

      loaded(readyReadiness);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      await waitFor(() => {
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      });
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('shows nothing of its own when the session is no longer valid: the layout redirects', async () => {
      respond({ status: 'unauthenticated' });
      renderPage();

      await waitFor(() => {
        expect(get).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('the verdict', () => {
    const verdict = () => screen.getByTestId('schedule-readiness-verdict');

    it('says that the school can generate, with the note that it does not guarantee a timetable', async () => {
      loaded(readyReadiness);
      renderPage();

      await screen.findByText(texts.verdict.ready);

      expect(verdict()).toHaveTextContent(texts.verdict.ready);
      expect(screen.getByText(texts.note)).toBeInTheDocument();
    });

    it('says how many problems prevent generating, in the plural', async () => {
      loaded(fullReadiness);
      renderPage();

      await screen.findByText('No se puede generar todavía: 9 problemas');

      expect(verdict()).not.toHaveTextContent(texts.verdict.ready);
      expect(screen.getByText(texts.note)).toBeInTheDocument();
    });

    it('uses the singular with one problem', async () => {
      loaded({ ready: false, blocking: [{ code: 'SCHOOL_WITHOUT_COURSES' }], warnings: [] });
      renderPage();

      expect(
        await screen.findByText('No se puede generar todavía: 1 problema'),
      ).toBeInTheDocument();
    });

    it('counts only the blocking problems: the warnings do not stop the generation', async () => {
      loaded({ ready: true, blocking: [], warnings });
      renderPage();

      await screen.findByText(texts.verdict.ready);

      expect(verdict()).toHaveTextContent(texts.verdict.ready);
    });

    it('says it with text and an icon hidden from the screen readers, never with color alone', async () => {
      loaded(readyReadiness);
      renderPage();

      await screen.findByText(texts.verdict.ready);

      expect(verdict().querySelector('[aria-hidden="true"]')).not.toBeNull();
    });

    it('says it in English with its own plural', async () => {
      await i18n.changeLanguage('en');
      loaded({ ready: false, blocking: [{ code: 'SCHOOL_WITHOUT_COURSES' }], warnings: [] });
      renderPage();

      expect(await screen.findByText('Not ready to generate yet: 1 problem')).toBeInTheDocument();
    });
  });

  describe('the groups of problems', () => {
    const blockingList = () => screen.getByRole('list', { name: 'Impiden generar (9)' });
    const warningsList = () => screen.getByRole('list', { name: 'Avisos (8)' });

    it('lists the blocking problems and then the warnings, each group with its count and in the order of the answer', async () => {
      loaded(fullReadiness);
      renderPage();

      await screen.findByRole('heading', { name: 'Impiden generar (9)' });

      const blockingItems = within(blockingList()).getAllByRole('listitem');
      expect(blockingItems).toHaveLength(9);
      expect(blockingItems[0]).toHaveTextContent('El colegio aún no tiene cursos.');
      expect(blockingItems[1]).toHaveTextContent(
        '6º Primaria tiene asignaturas y no tiene calendario.',
      );
      expect(blockingItems[8]).toHaveTextContent('García, Eva tiene en «Primaria» 22 sesiones');
      const warningItems = within(warningsList()).getAllByRole('listitem');
      expect(warningItems).toHaveLength(8);
      expect(warningItems[0]).toHaveTextContent('Francés está inactiva');
      expect(warningItems[3]).toHaveTextContent('4º Primaria tiene 25 sesiones para 30 franjas');
      expect(warningItems[7]).toHaveTextContent('1 franja preferida también está prohibida');
      expect(
        blockingList().compareDocumentPosition(warningsList()) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('says in each problem, with words, whether it prevents generating or is a warning', async () => {
      loaded(fullReadiness);
      renderPage();

      await screen.findByRole('heading', { name: 'Impiden generar (9)' });

      for (const item of within(blockingList()).getAllByRole('listitem')) {
        expect(item).toHaveTextContent(texts.kind.blocking);
      }
      for (const item of within(warningsList()).getAllByRole('listitem')) {
        expect(item).toHaveTextContent(texts.kind.warning);
      }
    });

    it('draws only the group of warnings when nothing prevents generating', async () => {
      loaded({ ready: true, blocking: [], warnings });
      renderPage();

      await screen.findByRole('heading', { name: 'Avisos (8)' });

      expect(screen.queryByRole('heading', { name: /^Impiden generar/ })).not.toBeInTheDocument();
    });

    it('draws only the group of blocking problems when there are no warnings', async () => {
      loaded({ ready: false, blocking: [{ code: 'SCHOOL_WITHOUT_COURSES' }], warnings: [] });
      renderPage();

      await screen.findByRole('heading', { name: 'Impiden generar (1)' });

      expect(screen.queryByRole('heading', { name: /^Avisos/ })).not.toBeInTheDocument();
    });

    it('draws no group when the school is ready and has no warnings', async () => {
      loaded(readyReadiness);
      renderPage();

      await screen.findByText(texts.verdict.ready);

      // El único h2 es el título del panel de la generación: ningún grupo de problemas.
      expect(
        screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
      ).toEqual([es.schedule.generation.title]);
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('goes to where a problem is fixed', async () => {
      const user = userEvent.setup();
      loaded({
        ready: false,
        blocking: [
          { code: 'COURSE_WITHOUT_CALENDAR', course: { id: 'course-6', name: '6º Primaria' } },
        ],
        warnings: [],
      });
      renderPage();

      await user.click(await screen.findByRole('link', { name: 'Calendarios' }));

      expect(await screen.findByTestId('calendars-page')).toBeInTheDocument();
    });

    it('says it in English', async () => {
      await i18n.changeLanguage('en');
      loaded({ ready: true, blocking: [], warnings: [warnings[1] as ReadinessIssue] });
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Warnings (1)' })).toBeInTheDocument();
      expect(screen.getByText('2 años has no classes.')).toBeInTheDocument();
    });
  });

  describe.each([DESKTOP, PHONE])('the layout of the theme (US-UI-REST_a) at %i px', (width) => {
    const verdict = () => screen.getByTestId('schedule-readiness-verdict');
    const follows = (first: Element, second: Element) =>
      Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

    it('opens with the page header: eyebrow, title with its id and the short description', async () => {
      loaded(readyReadiness);
      renderPage(width);

      const title = screen.getByRole('heading', { level: 1, name: texts.title });
      expect(title).toHaveAttribute('id', 'schedule-readiness-title');
      expect(screen.getByText(texts.eyebrow)).toHaveClass('cs-eyebrow');
      expect(screen.getByText(texts.intro)).toBeInTheDocument();
      expect(texts.intro).not.toMatch(/enlace/);
      await screen.findByText(texts.verdict.ready);
    });

    it('uses the container of the theme pages and keeps its test id', async () => {
      loaded(readyReadiness);
      renderPage(width);

      const page = screen.getByTestId('schedule-readiness-page');
      expect(page.tagName).toBe('MAIN');
      expect(page).toHaveClass('container-xxl');
      await screen.findByText(texts.verdict.ready);
    });

    it('draws a mint circle with a check before the verdict when it can generate', async () => {
      loaded(readyReadiness);
      renderPage(width);

      await screen.findByText(texts.verdict.ready);

      const circle = verdict().querySelector('.cs-verdict-icon');
      expect(circle).toHaveClass('cs-tone-mint');
      expect(circle).toHaveAttribute('aria-hidden', 'true');
      expect(circle).toHaveTextContent('✓');
    });

    it('draws a soft red circle with a cross before the verdict when it cannot', async () => {
      loaded(fullReadiness);
      renderPage(width);

      await screen.findByText('No se puede generar todavía: 9 problemas');

      const circle = verdict().querySelector('.cs-verdict-icon');
      expect(circle).toHaveClass('bg-danger-subtle');
      expect(circle).toHaveAttribute('aria-hidden', 'true');
      expect(circle).toHaveTextContent('✕');
      expect(verdict()).toHaveClass('text-danger-emphasis');
    });

    it('frames each group as a named region with rows of the theme and no nested cards', async () => {
      loaded(fullReadiness);
      renderPage(width);

      const blockingRegion = await screen.findByRole('region', { name: 'Impiden generar (9)' });
      const warningsRegion = screen.getByRole('region', { name: 'Avisos (8)' });

      for (const [region, count] of [
        [blockingRegion, 9],
        [warningsRegion, 8],
      ] as const) {
        expect(region).toHaveClass('cs-card');
        expect(region.querySelectorAll('li.cs-list-item')).toHaveLength(count);
        expect(region.querySelector('.card')).toBeNull();
        expect(within(region).getAllByRole('listitem')).toHaveLength(count);
      }
      expect(follows(blockingRegion, warningsRegion)).toBe(true);
    });

    it('keeps the group titles as h2 with the count inside', async () => {
      loaded(fullReadiness);
      renderPage(width);

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Impiden generar (9)' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 2, name: 'Avisos (8)' })).toBeInTheDocument();
    });

    it('draws no region when there are no problems', async () => {
      loaded(readyReadiness);
      renderPage(width);

      await screen.findByText(texts.verdict.ready);

      expect(screen.queryByRole('region', { name: /Impiden generar/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('region', { name: /Avisos/ })).not.toBeInTheDocument();
    });

    it('keeps the discarded notice and the official summary between the header and the verdict', async () => {
      overview.mockResolvedValue({
        status: 'loaded',
        overview: {
          draft: null,
          official: {
            id: 'official-1',
            status: 'OFFICIAL',
            generatedAt: '2026-11-04T08:00:00.000Z',
            placedSessions: 360,
            confirmedAt: '2026-11-04T09:00:00.000Z',
            confirmedBy: { firstName: 'Kiketon', lastName: 'RF' },
            replacedAt: null,
            score: null,
          },
          previousCount: 1,
        },
      });
      loaded(readyReadiness);
      renderPage(width, false, { notice: 'discarded' });

      const title = screen.getByRole('heading', { level: 1, name: texts.title });
      const notice = await screen.findByText(es.schedule.discard.done);
      const summary = await screen.findByText(/Kiketon RF/);
      await screen.findByText(texts.verdict.ready);

      expect(notice).toHaveAttribute('role', 'status');
      expect(follows(title, notice)).toBe(true);
      expect(follows(notice, summary)).toBe(true);
      expect(follows(summary, verdict())).toBe(true);
    });
  });

  describe('the official schedule (US-ALGO-CONFIRM)', () => {
    const summaryTexts = es.schedule.official.summary;
    const official: ScheduleSummary = {
      id: '0192f5a0-0000-7000-8000-0000000000a2',
      status: 'OFFICIAL',
      generatedAt: '2026-11-04T08:00:05.000Z',
      placedSessions: 290,
      confirmedAt: '2026-11-04T10:30:00.000Z',
      confirmedBy: { firstName: 'Ana', lastName: 'García' },
      replacedAt: null,
      score: null,
    };
    const withOfficial: ScheduleOverviewOutcome = {
      status: 'loaded',
      overview: { draft: null, official, previousCount: 0 },
    };
    const confirmedOn = new Intl.DateTimeFormat('es', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date('2026-11-04T10:30:00.000Z'));

    it.each(['ADMIN', 'MEMBER'] as const)('shows a %s who confirmed it and when', async (role) => {
      signInAs(role);
      loaded(readyReadiness);
      overview.mockResolvedValue(withOfficial);
      renderPage();

      expect(
        await screen.findByText(`Horario oficial: confirmado el ${confirmedOn} por Ana García`),
      ).toBeVisible();
      expect(screen.getByRole('link', { name: summaryTexts.view })).toHaveAttribute(
        'href',
        '/horarios/oficial',
      );
    });

    it.each(['ADMIN', 'MEMBER'] as const)(
      'links a %s to the previous schedules when some official was replaced (US-ALGO-CONFIRM_b)',
      async (role) => {
        signInAs(role);
        loaded(readyReadiness);
        overview.mockResolvedValue({
          status: 'loaded',
          overview: { draft: null, official, previousCount: 2 },
        });
        renderPage();

        expect(
          await screen.findByRole('link', { name: 'Horarios anteriores (2)' }),
        ).toHaveAttribute('href', '/horarios/anteriores');
      },
    );

    it('does not link to the previous schedules when none was replaced', async () => {
      loaded(readyReadiness);
      overview.mockResolvedValue(withOfficial);
      renderPage();

      await screen.findByRole('link', { name: summaryTexts.view });

      expect(screen.queryByRole('link', { name: /Horarios anteriores/u })).not.toBeInTheDocument();
    });

    it('says there is no official yet', async () => {
      loaded(readyReadiness);
      renderPage();

      expect(await screen.findByText(summaryTexts.none)).toBeVisible();
    });

    it('asks for the overview once, also in strict mode', async () => {
      loaded(readyReadiness);
      renderPage(DESKTOP, true);

      await screen.findByTestId('schedule-readiness-verdict');

      expect(overview).toHaveBeenCalledTimes(1);
    });

    it('warns when the overview cannot be loaded, without blocking the check or the panel, and asks again', async () => {
      const user = userEvent.setup();
      signInAs('ADMIN');
      loaded(readyReadiness);
      overview.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByText(summaryTexts.loadError)).toBeVisible();
      expect(await screen.findByTestId('schedule-readiness-verdict')).toBeVisible();
      expect(
        await screen.findByRole('button', { name: es.schedule.generation.generate }),
      ).toBeEnabled();
      await user.click(screen.getByRole('button', { name: summaryTexts.retry }));

      expect(await screen.findByText(summaryTexts.none)).toBeVisible();
      expect(overview).toHaveBeenCalledTimes(2);
    });

    it('announces that the draft was discarded when it comes from discarding it, and only then', async () => {
      loaded(readyReadiness);
      const discarded = renderPage(DESKTOP, false, { notice: 'discarded' });

      expect(await screen.findByText(es.schedule.discard.done)).toBeVisible();
      discarded.unmount();

      renderPage();
      await screen.findByTestId('schedule-readiness-verdict');
      expect(screen.queryByText(es.schedule.discard.done)).not.toBeInTheDocument();
    });

    it('has no WCAG violations with an official and with the notice', async () => {
      overview.mockResolvedValue(withOfficial);
      loaded(readyReadiness);
      const { container } = renderPage(DESKTOP, false, { notice: 'discarded' });
      await screen.findByText(es.schedule.discard.done);
      await screen.findByText(/Horario oficial: confirmado el/u);

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('the completed generation and the schedules (US-ALGO-CONFIRM)', () => {
    const SCHEDULE_ID = '0192f5a0-0000-7000-8000-0000000000a3';
    const completedGeneration: Generation = {
      id: '0192f5a0-0000-7000-8000-0000000000f1',
      status: 'COMPLETED',
      progress: 100,
      placed: 50,
      total: 50,
      improve: true,
      phase: 'SEARCHING',
      engine: 'BACKTRACKING',
      score: null,
      improvementCancelled: false,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      scheduleId: SCHEDULE_ID,
      createdAt: '2026-11-05T08:00:00.000Z',
      startedAt: '2026-11-05T08:00:01.000Z',
      finishedAt: '2026-11-05T08:00:30.000Z',
    };
    const summary = (status: 'DRAFT' | 'OFFICIAL'): ScheduleSummary => ({
      id: SCHEDULE_ID,
      status,
      generatedAt: '2026-11-05T08:00:30.000Z',
      placedSessions: 50,
      confirmedAt: status === 'OFFICIAL' ? '2026-11-05T09:00:00.000Z' : null,
      confirmedBy: status === 'OFFICIAL' ? { firstName: 'Ana', lastName: 'García' } : null,
      replacedAt: null,
      score: null,
    });
    const panelTexts = es.schedule.generation;

    it('lets an administrator confirm the draft of the generation from the summary, and goes to the official', async () => {
      const user = userEvent.setup();
      signInAs('ADMIN');
      loaded(readyReadiness);
      generationCurrent.mockResolvedValue({ status: 'loaded', generation: completedGeneration });
      overview.mockResolvedValue({
        status: 'loaded',
        overview: { draft: summary('DRAFT'), official: null, previousCount: 0 },
      });
      vi.spyOn(scheduleDraftService, 'getDraft').mockResolvedValue({
        status: 'loaded',
        schedule: null,
      });
      const confirm = vi.spyOn(scheduleService, 'confirm').mockResolvedValue({
        status: 'confirmed',
        schedule: summary('OFFICIAL'),
      });
      renderPage();

      await user.click(await screen.findByRole('button', { name: es.schedule.confirm.button }));
      const dialog = await screen.findByRole('dialog', { name: es.schedule.confirm.title });
      await user.click(within(dialog).getByRole('button', { name: es.schedule.confirm.confirm }));

      expect(await screen.findByTestId('official-page')).toHaveTextContent('confirmed');
      expect(confirm.mock.calls[0]?.[1]).toBe(SCHEDULE_ID);
    });

    it('does not offer a member to confirm it', async () => {
      loaded(readyReadiness);
      generationCurrent.mockResolvedValue({ status: 'loaded', generation: completedGeneration });
      overview.mockResolvedValue({
        status: 'loaded',
        overview: { draft: summary('DRAFT'), official: null, previousCount: 0 },
      });
      renderPage();

      expect(await screen.findByRole('link', { name: panelTexts.viewDraft })).toBeVisible();
      expect(
        screen.queryByRole('button', { name: es.schedule.confirm.button }),
      ).not.toBeInTheDocument();
    });

    it('says the generation is now the official one when its draft was confirmed', async () => {
      loaded(readyReadiness);
      generationCurrent.mockResolvedValue({ status: 'loaded', generation: completedGeneration });
      overview.mockResolvedValue({
        status: 'loaded',
        overview: { draft: null, official: summary('OFFICIAL'), previousCount: 0 },
      });
      renderPage();

      expect(await screen.findByText(panelTexts.isOfficial)).toBeVisible();
    });

    it('reads the schedules again when the generation that was running finishes', async () => {
      loaded(readyReadiness);
      generationCurrent.mockResolvedValue({
        status: 'loaded',
        generation: { ...completedGeneration, status: 'RUNNING', progress: 40, scheduleId: null },
      });
      vi.spyOn(scheduleGenerationService, 'get').mockResolvedValue({
        status: 'loaded',
        generation: completedGeneration,
      });
      overview.mockResolvedValueOnce({
        status: 'loaded',
        overview: { draft: null, official: null, previousCount: 0 },
      });
      overview.mockResolvedValueOnce({
        status: 'loaded',
        overview: { draft: summary('DRAFT'), official: null, previousCount: 0 },
      });
      renderPage();

      expect(
        await screen.findByRole('link', { name: panelTexts.viewDraft }, { timeout: 5000 }),
      ).toBeVisible();
      expect(overview).toHaveBeenCalledTimes(2);
    });
  });

  describe('generation panel', () => {
    const panelTexts = es.schedule.generation;
    const runningGeneration: Generation = {
      id: '0192f5a0-0000-7000-8000-0000000000f1',
      status: 'RUNNING',
      progress: 40,
      placed: 20,
      total: 50,
      improve: true,
      phase: 'SEARCHING',
      engine: 'BACKTRACKING',
      score: null,
      improvementCancelled: false,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      scheduleId: null,
      createdAt: '2026-11-04T08:00:00.000Z',
      startedAt: '2026-11-04T08:00:01.000Z',
      finishedAt: null,
    };

    it('shows an administrator the button to generate when nothing blocks', async () => {
      signInAs('ADMIN');
      loaded(readyReadiness);
      renderPage();

      expect(await screen.findByRole('button', { name: panelTexts.generate })).toBeEnabled();
      expect(screen.getByRole('heading', { level: 2, name: panelTexts.title })).toBeInTheDocument();
    });

    it('shows an administrator no button, and the explanation, when something blocks', async () => {
      signInAs('ADMIN');
      loaded(fullReadiness);
      renderPage();

      expect(await screen.findByText(panelTexts.blocked)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: panelTexts.generate })).not.toBeInTheDocument();
    });

    it('shows a member the state without any button', async () => {
      loaded(readyReadiness);
      renderPage();

      expect(await screen.findByText(panelTexts.adminsOnly)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: panelTexts.generate })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: panelTexts.cancel })).not.toBeInTheDocument();
    });

    it('does not show the panel while the readiness loads or when it fails', async () => {
      signInAs('ADMIN');
      get.mockReturnValue(new Promise(() => undefined));
      const loading = renderPage();
      expect(screen.queryByTestId('schedule-generation-panel')).not.toBeInTheDocument();
      loading.unmount();

      respond({ status: 'unavailable' });
      renderPage();
      await screen.findByRole('alert');

      expect(screen.queryByTestId('schedule-generation-panel')).not.toBeInTheDocument();
      expect(generationCurrent).not.toHaveBeenCalled();
    });

    it('resumes a generation in progress after a reload, without pressing anything', async () => {
      signInAs('ADMIN');
      loaded(readyReadiness);
      generationCurrent.mockResolvedValue({ status: 'loaded', generation: runningGeneration });
      vi.spyOn(scheduleGenerationService, 'get').mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(await screen.findByText('20 de 50 sesiones')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: panelTexts.cancel })).toBeEnabled();
    });

    it('shows a member the progress of a generation in progress, without cancel', async () => {
      loaded(readyReadiness);
      generationCurrent.mockResolvedValue({ status: 'loaded', generation: runningGeneration });
      vi.spyOn(scheduleGenerationService, 'get').mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(await screen.findByText('20 de 50 sesiones')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: panelTexts.cancel })).not.toBeInTheDocument();
    });

    it('asks again for the readiness when the server refuses to generate because it is not ready', async () => {
      const user = userEvent.setup();
      signInAs('ADMIN');
      get.mockResolvedValueOnce({ status: 'loaded', readiness: readyReadiness });
      get.mockResolvedValue({ status: 'loaded', readiness: fullReadiness });
      vi.spyOn(scheduleGenerationService, 'start').mockResolvedValue({ status: 'notReady' });
      renderPage();

      await user.click(await screen.findByRole('button', { name: panelTexts.generate }));

      await screen.findByRole('heading', { name: 'Impiden generar (9)' });
      expect(get).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('button', { name: panelTexts.generate })).not.toBeInTheDocument();
      expect(screen.getByText(panelTexts.blocked)).toBeInTheDocument();
    });

    it('does not ask for the generation again when the readiness is repeated', async () => {
      const user = userEvent.setup();
      signInAs('ADMIN');
      loaded(readyReadiness);
      vi.spyOn(scheduleGenerationService, 'start').mockResolvedValue({ status: 'notReady' });
      renderPage();

      await user.click(await screen.findByRole('button', { name: panelTexts.generate }));
      await waitFor(() => {
        expect(get).toHaveBeenCalledTimes(2);
      });

      expect(generationCurrent).toHaveBeenCalledTimes(1);
    });

    it('asks for the generation once, also in strict mode', async () => {
      signInAs('ADMIN');
      loaded(readyReadiness);
      renderPage(DESKTOP, true);

      await screen.findByRole('button', { name: panelTexts.generate });

      expect(generationCurrent).toHaveBeenCalledTimes(1);
    });
  });
});

describe('ScheduleReadinessPage accessibility', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof scheduleReadinessService.get>;
  let generationCurrent: MockInstance<typeof scheduleGenerationService.current>;
  let overview: MockInstance<typeof scheduleService.overview>;
  let media: MatchMediaControl;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
    get = vi.spyOn(scheduleReadinessService, 'get');
    generationCurrent = vi.spyOn(scheduleGenerationService, 'current');
    generationCurrent.mockResolvedValue({ status: 'loaded', generation: null });
    // El resumen de los horarios: por defecto, el colegio no tiene ninguno.
    overview = vi.spyOn(scheduleService, 'overview').mockResolvedValue({
      status: 'loaded',
      overview: { draft: null, official: null, previousCount: 0 },
    });
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    get.mockRestore();
    generationCurrent.mockRestore();
    overview.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(width = DESKTOP) {
    media.setWidth(width);
    return render(
      <MemoryRouter initialEntries={['/horarios']}>
        <SessionProvider>
          <Routes>
            <Route path="/horarios" element={<ScheduleReadinessPage />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  it.each([
    ['a wide screen', DESKTOP],
    ['a phone', PHONE],
  ])('has no WCAG violations with blocking problems and warnings on %s', async (_name, width) => {
    get.mockResolvedValue({ status: 'loaded', readiness: fullReadiness });
    const { container } = renderPage(width);
    await screen.findByRole('heading', { name: 'Impiden generar (9)' });

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no WCAG violations when the school is ready, while it loads and when it fails', async () => {
    get.mockResolvedValue({ status: 'loaded', readiness: readyReadiness });
    const ready = renderPage();
    await screen.findByText(texts.verdict.ready);
    expect(await wcagViolations(ready.container)).toEqual([]);
    ready.unmount();

    get.mockReturnValue(new Promise(() => undefined));
    const loading = renderPage();
    expect(await wcagViolations(loading.container)).toEqual([]);
    loading.unmount();

    get.mockResolvedValue({ status: 'unavailable' });
    const failed = renderPage();
    await screen.findByRole('alert');
    expect(await wcagViolations(failed.container)).toEqual([]);
  });

  it('has no WCAG violations in English', async () => {
    await i18n.changeLanguage('en');
    get.mockResolvedValue({ status: 'loaded', readiness: fullReadiness });
    const { container } = renderPage();
    await screen.findByRole('heading', { name: 'Prevent generating (9)' });

    expect(await wcagViolations(container)).toEqual([]);
  });

  it.each([
    ['an administrator with nothing blocking', 'ADMIN', readyReadiness, null],
    ['an administrator with blocking problems', 'ADMIN', fullReadiness, null],
    ['a member', 'MEMBER', readyReadiness, null],
    ['an administrator with a generation in progress', 'ADMIN', readyReadiness, 'RUNNING'],
  ] as const)(
    'has no WCAG violations at 360 px for %s, with the generation panel',
    async (_name, role, readiness, status) => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
      get.mockResolvedValue({ status: 'loaded', readiness });
      generationCurrent.mockResolvedValue({
        status: 'loaded',
        generation:
          status === null
            ? null
            : {
                id: '0192f5a0-0000-7000-8000-0000000000f1',
                status,
                progress: 40,
                placed: 20,
                total: 50,
                improve: true,
                phase: 'SEARCHING',
                engine: 'BACKTRACKING',
                score: null,
                improvementCancelled: false,
                errorCode: null,
                errorMessage: null,
                errorDetails: null,
                scheduleId: null,
                createdAt: '2026-11-04T08:00:00.000Z',
                startedAt: '2026-11-04T08:00:01.000Z',
                finishedAt: null,
              },
      });
      vi.spyOn(scheduleGenerationService, 'get').mockReturnValue(new Promise(() => undefined));
      const { container } = renderPage(PHONE);
      await screen.findByTestId('schedule-generation-panel');
      await waitFor(() => {
        expect(screen.queryByText(es.schedule.generation.loading)).not.toBeInTheDocument();
      });

      expect(await wcagViolations(container)).toEqual([]);
    },
  );

  it('gives the page a single h1 and an h2 for each group', async () => {
    get.mockResolvedValue({ status: 'loaded', readiness: fullReadiness });
    renderPage();

    await screen.findByRole('heading', { name: 'Impiden generar (9)' });

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    // Los dos grupos y el título del panel de la generación.
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });
});
