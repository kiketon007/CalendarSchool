import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { sessionService, type SessionData } from '../services/sessionService';
import {
  slotsService,
  type SlotsOutcome,
  type SubjectSlotRule,
  type UpdateSlotsOutcome,
} from '../services/slotsService';
import { SessionProvider } from '../session/SessionProvider';
import { ForbiddenSlotsPage } from './ForbiddenSlotsPage';

const texts = es.slots;

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';

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

/** Una jornada de seis sesiones con el recreo tras la 3ª. */
const periods: NonNullable<SubjectSlotRule['calendar']>['periods'] = [
  { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
  { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
  { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
  { type: 'BREAK', startTime: '11:15', endTime: '11:45' },
  { type: 'SESSION', startTime: '11:45', endTime: '12:30' },
  { type: 'SESSION', startTime: '12:30', endTime: '13:15' },
  { type: 'SESSION', startTime: '13:15', endTime: '14:00' },
];

const rule: SubjectSlotRule = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  subject: {
    id: SUBJECT_ID,
    name: 'Religión',
    code: 'REL',
    color: 'purple',
    sessionsPerWeek: 3,
    maxPerDay: null,
    blockSize: null,
  },
  calendar: { id: 'calendar-1', name: 'Jornada', periods },
  slots: [{ dayOfWeek: 1, sessionNumber: 1 }],
  outsideCalendarCount: 0,
  warnings: [],
};

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
}

describe('ForbiddenSlotsPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof slotsService.get>;
  let update: MockInstance<typeof slotsService.update>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionOf('ADMIN') });
    get = vi
      .spyOn(slotsService, 'get')
      .mockResolvedValue({ status: 'loaded', slotRule: rule } satisfies SlotsOutcome);
    update = vi
      .spyOn(slotsService, 'update')
      .mockResolvedValue({ status: 'updated', slotRule: rule } satisfies UpdateSlotsOutcome);
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    update.mockRestore();
  });

  function renderPage({ strict = false } = {}) {
    const tree = (
      <MemoryRouter initialEntries={[`/cursos/${COURSE_ID}/carga/${SUBJECT_ID}/prohibidas`]}>
        <SessionProvider>
          <Routes>
            <Route
              path="/cursos/:courseId/carga/:subjectId/prohibidas"
              element={<ForbiddenSlotsPage />}
            />
            <Route path="/cursos/:courseId/carga" element={<p>Carga del curso</p>} />
            <Route path="/calendarios" element={<p>Calendarios</p>} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const heading = () =>
    screen.findByRole('heading', {
      level: 1,
      name: 'Franjas prohibidas de Religión en 1º Primaria',
    });
  const cellName = (day: string, session: number, start: string, end: string) =>
    es.slots.grid.cell
      .replace('{{day}}', day)
      .replace('{{number}}', String(session))
      .replace('{{start}}', start)
      .replace('{{end}}', end);
  const cell = (day: string, session: number, start: string, end: string) =>
    screen.getByRole('button', { name: cellName(day, session, start, end) });
  const dayButton = (day: string) =>
    screen.getByRole('button', { name: es.slots.grid.selectDay.replace('{{day}}', day) });
  const saveButton = () => screen.getByRole('button', { name: texts.save });

  describe('as an administrator', () => {
    it('asks once for the rule of the pair in the route, also in strict mode', async () => {
      renderPage({ strict: true });

      await heading();

      expect(get).toHaveBeenCalledExactlyOnceWith(expect.anything(), COURSE_ID, SUBJECT_ID);
    });

    it('shows a status while it loads, and no grid', () => {
      get.mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows an alert with Retry when it fails, and asks again when pressed', async () => {
      const user = userEvent.setup();
      get.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      await user.click(await screen.findByRole('button', { name: texts.retry }));

      await heading();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('says that the subject is not taught in the course, with a link to the workload', async () => {
      get.mockResolvedValue({ status: 'notFound' });
      renderPage();

      expect(await screen.findByText(texts.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.backToWorkload })).toHaveAttribute(
        'href',
        `/cursos/${COURSE_ID}/carga`,
      );
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows the title, the grid with its break and the cells that are marked', async () => {
      renderPage();

      await heading();

      expect(
        screen.getByRole('table', { name: 'Franjas prohibidas de Religión en 1º Primaria' }),
      ).toBeVisible();
      expect(screen.getByText('Recreo 11:15–11:45')).toBeVisible();
      expect(cell('Lunes', 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'true');
      expect(cell('Martes', 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('link', { name: texts.backToWorkload })).toHaveAttribute(
        'href',
        `/cursos/${COURSE_ID}/carga`,
      );
    });

    it('enables "Save" only with differences from what was loaded, and disables it again when undoing', async () => {
      const user = userEvent.setup();
      renderPage();
      await heading();
      expect(saveButton()).toBeDisabled();

      await user.click(cell('Martes', 2, '09:45', '10:30'));
      expect(saveButton()).toBeEnabled();

      await user.click(cell('Martes', 2, '09:45', '10:30'));
      expect(saveButton()).toBeDisabled();
    });

    it('sends one single request with the final state, even if "Save" is pressed twice', async () => {
      const user = userEvent.setup();
      renderPage();
      await heading();
      await user.click(dayButton('Miércoles'));

      await user.dblClick(saveButton());

      await waitFor(() => {
        expect(update).toHaveBeenCalledOnce();
      });
      expect(update.mock.calls[0]?.slice(1, 3)).toEqual([COURSE_ID, SUBJECT_ID]);
      const sent = update.mock.calls[0]?.[3] ?? [];
      expect(sent).toHaveLength(7);
      expect(sent).toContainEqual({ dayOfWeek: 1, sessionNumber: 1 });
      expect(sent.filter(({ dayOfWeek }) => dayOfWeek === 3)).toHaveLength(6);
    });

    it('stays on the page with what the server answered and says that it was saved', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue({
        status: 'updated',
        slotRule: { ...rule, slots: [{ dayOfWeek: 2, sessionNumber: 2 }] },
      });
      renderPage();
      await heading();
      await user.click(cell('Martes', 2, '09:45', '10:30'));

      await user.click(saveButton());

      expect(await screen.findByText(texts.saved)).toBeVisible();
      expect(cell('Martes', 2, '09:45', '10:30')).toHaveAttribute('aria-pressed', 'true');
      expect(cell('Lunes', 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'false');
      expect(saveButton()).toBeDisabled();
    });

    describe('the warnings', () => {
      it('warns that the subject does not fit while cells are marked, before saving', async () => {
        const user = userEvent.setup();
        renderPage();
        await heading();
        expect(screen.queryByText(es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT)).toBeNull();

        await user.click(dayButton('Martes'));
        await user.click(dayButton('Miércoles'));
        await user.click(dayButton('Jueves'));

        expect(screen.getByRole('status', { name: 'Avisos de Religión' })).toHaveTextContent(
          es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT,
        );
        expect(update).not.toHaveBeenCalled();

        await user.click(dayButton('Jueves'));
        expect(screen.queryByText(es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT)).toBeNull();
      });

      it('warns that a block does not fit when the break cuts it', async () => {
        const user = userEvent.setup();
        get.mockResolvedValue({
          status: 'loaded',
          slotRule: {
            ...rule,
            subject: { ...rule.subject, sessionsPerWeek: 2, blockSize: 2 },
            slots: [],
          },
        });
        renderPage();
        await heading();

        // Se deja libre solo la 3ª y la 4ª sesión (a los dos lados del recreo) todos los días.
        for (const session of [1, 2, 5, 6]) {
          await user.click(
            screen.getByRole('button', {
              name: es.slots.grid.selectSession.replace('{{number}}', String(session)),
            }),
          );
        }

        expect(screen.getByText(es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT)).toBeVisible();
      });

      it('shows the notice of the cells outside the calendar, removes them on saving and the notice goes away', async () => {
        const user = userEvent.setup();
        get.mockResolvedValue({
          status: 'loaded',
          slotRule: {
            ...rule,
            slots: [],
            outsideCalendarCount: 5,
            warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 5 }],
          },
        });
        update.mockResolvedValue({ status: 'updated', slotRule: { ...rule, slots: [] } });
        renderPage();
        await heading();

        expect(
          screen.getByText('Hay 5 franjas fuera del calendario actual; se quitarán al guardar'),
        ).toBeVisible();
        // Quitarlas es un cambio: se puede guardar aunque no se haya tocado ninguna celda.
        expect(saveButton()).toBeEnabled();

        await user.click(saveButton());

        await waitFor(() => {
          expect(update).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            COURSE_ID,
            SUBJECT_ID,
            [],
          );
        });
        await waitFor(() => {
          expect(screen.queryByText(/fuera del calendario actual/)).not.toBeInTheDocument();
        });
      });

      it('uses the singular for one cell outside the calendar', async () => {
        get.mockResolvedValue({
          status: 'loaded',
          slotRule: {
            ...rule,
            outsideCalendarCount: 1,
            warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 1 }],
          },
        });
        renderPage();
        await heading();

        expect(
          screen.getByText('Hay 1 franja fuera del calendario actual; se quitará al guardar'),
        ).toBeVisible();
      });
    });

    describe('when the course has no calendar', () => {
      beforeEach(() => {
        get.mockResolvedValue({
          status: 'loaded',
          slotRule: { ...rule, calendar: null, slots: [], outsideCalendarCount: 0 },
        });
      });

      it('explains it with a link to the calendars, and shows neither the grid nor "Save"', async () => {
        renderPage();

        expect(await screen.findByText(texts.noCalendar)).toBeVisible();
        expect(screen.getByRole('link', { name: texts.calendarsLink })).toHaveAttribute(
          'href',
          '/calendarios',
        );
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: texts.save })).not.toBeInTheDocument();
      });
    });

    describe('when saving fails', () => {
      const markAndSave = async (user: ReturnType<typeof userEvent.setup>) => {
        renderPage();
        await heading();
        await user.click(cell('Martes', 2, '09:45', '10:30'));
        await user.click(saveButton());
      };

      it('shows that the subject is gone on a 404', async () => {
        update.mockResolvedValue({ status: 'notFound' });

        await markAndSave(userEvent.setup());

        expect(await screen.findByText(texts.notFound)).toBeVisible();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
      });

      it('says that the course no longer has a calendar on a 409, and loads the rule again', async () => {
        update.mockResolvedValue({ status: 'noCalendar' });

        await markAndSave(userEvent.setup());

        expect(await screen.findByText(texts.noCalendarSaved)).toBeVisible();
        await waitFor(() => {
          expect(get).toHaveBeenCalledTimes(2);
        });
      });

      it('loads the rule again and says that the calendar changed when a session no longer exists', async () => {
        update.mockResolvedValue({
          status: 'validationError',
          details: [{ field: 'slots[0].sessionNumber', code: 'OUT_OF_RANGE' }],
        });

        await markAndSave(userEvent.setup());

        expect(await screen.findByText(texts.calendarChanged)).toBeVisible();
        await waitFor(() => {
          expect(get).toHaveBeenCalledTimes(2);
        });
      });

      it('shows a general error and keeps what was marked on any other validation error', async () => {
        update.mockResolvedValue({
          status: 'validationError',
          details: [{ field: 'slots', code: 'INVALID_LENGTH' }],
        });

        await markAndSave(userEvent.setup());

        expect(await screen.findByText(texts.saveError)).toBeVisible();
        expect(cell('Martes', 2, '09:45', '10:30')).toHaveAttribute('aria-pressed', 'true');
      });

      it('tells that only administrators can change it on a 403, keeping what was marked', async () => {
        update.mockResolvedValue({ status: 'forbidden' });

        await markAndSave(userEvent.setup());

        const alerts = await screen.findAllByRole('alert');
        expect(alerts.map((alert) => alert.textContent)).toContain(texts.forbidden);
        expect(cell('Martes', 2, '09:45', '10:30')).toHaveAttribute('aria-pressed', 'true');
      });

      it('shows a general error on any other failure, keeps what was marked and lets it try again', async () => {
        update.mockResolvedValueOnce({ status: 'unavailable' });
        const user = userEvent.setup();

        await markAndSave(user);

        expect(await screen.findByText(texts.saveError)).toBeVisible();
        await user.click(saveButton());
        await waitFor(() => {
          expect(update).toHaveBeenCalledTimes(2);
        });
      });
    });

    it('has no WCAG 2.1 AA violations, with marked cells, a break and warnings', async () => {
      const user = userEvent.setup();
      const { container } = renderPage();
      await heading();
      await user.click(dayButton('Martes'));
      await user.click(dayButton('Miércoles'));
      await user.click(dayButton('Jueves'));
      expect(screen.getByText(es.workload.subjectWarnings.SUBJECT_DOES_NOT_FIT)).toBeVisible();

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('as a member', () => {
    beforeEach(() => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
    });

    it('shows the grid without buttons, the marked cells as text and says that only administrators can change it', async () => {
      renderPage();
      await heading();

      const table = screen.getByRole('table');
      expect(within(table).queryByRole('button')).not.toBeInTheDocument();
      expect(within(table).getAllByText(es.slots.grid.forbiddenMark)).toHaveLength(1);
      expect(screen.queryByRole('button', { name: texts.save })).not.toBeInTheDocument();
      expect(screen.getByText(texts.forbidden)).toBeVisible();
    });

    it('shows the warnings of the server and the notice of cells outside the calendar', async () => {
      get.mockResolvedValue({
        status: 'loaded',
        slotRule: {
          ...rule,
          outsideCalendarCount: 2,
          warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 2 }],
        },
      });
      renderPage();
      await heading();

      expect(screen.getByText(/Hay 2 franjas fuera del calendario actual/)).toBeVisible();
    });

    it('has no WCAG 2.1 AA violations', async () => {
      const { container } = renderPage();
      await heading();

      expect(await wcagViolations(container)).toEqual([]);
    });
  });
});
