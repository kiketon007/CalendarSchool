import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { components } from '../api/generated/schema';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { calendarsService, type Calendar } from '../services/calendarsService';
import {
  professorAvailabilityService,
  type ProfessorUnavailability,
  type UpdateAvailabilityOutcome,
} from '../services/professorAvailabilityService';
import { professorsService } from '../services/professorsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { ProfessorAvailabilityPage } from './ProfessorAvailabilityPage';

type Professor = components['schemas']['Professor'];

const texts = es.availability;
const grid = es.slots.grid;
const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';

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

const professor: Professor = {
  id: PROFESSOR_ID,
  firstName: 'Ana',
  lastName: 'García',
  position: null,
  subjects: [],
  unavailableCount: 0,
  tutoredClass: null,
};

/** Seis sesiones de 45 minutos desde las 09:00 con un recreo de media hora tras la tercera. */
const PRIMARY_PERIODS: Calendar['periods'] = [
  { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
  { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
  { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
  { type: 'BREAK', startTime: '11:15', endTime: '11:45' },
  { type: 'SESSION', startTime: '11:45', endTime: '12:30' },
  { type: 'SESSION', startTime: '12:30', endTime: '13:15' },
  { type: 'SESSION', startTime: '13:15', endTime: '14:00' },
];

const calendar = (
  id: string,
  name: string,
  courses: number,
  periods: Calendar['periods'] = PRIMARY_PERIODS,
): Calendar => ({
  id,
  name,
  periods,
  courses: Array.from({ length: courses }, (_, index) => ({
    id: `${id}-c${String(index)}`,
    name: `Curso ${String(index)}`,
  })),
  createdAt: '2026-10-26T09:30:00.000Z',
});

const PRIMARY = calendar('cal-p', 'Primaria', 3);
/** Cuatro sesiones de una hora con un recreo tras la segunda. */
const INFANT = calendar('cal-i', 'Infantil', 1, [
  { type: 'SESSION', startTime: '09:00', endTime: '10:00' },
  { type: 'SESSION', startTime: '10:00', endTime: '11:00' },
  { type: 'BREAK', startTime: '11:00', endTime: '11:30' },
  { type: 'SESSION', startTime: '11:30', endTime: '12:30' },
  { type: 'SESSION', startTime: '12:30', endTime: '13:30' },
]);

const interval = (
  dayOfWeek: number,
  startTime: string,
  endTime: string,
): ProfessorUnavailability => ({
  dayOfWeek,
  startTime,
  endTime,
});

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

const dayName = (day: number) => grid.days[String(day) as '1'];
const cellName = (day: number, session: number, start: string, end: string) =>
  grid.cell
    .replace('{{day}}', dayName(day))
    .replace('{{number}}', String(session))
    .replace('{{start}}', start)
    .replace('{{end}}', end);
const cellButton = (day: number, session: number, start: string, end: string) =>
  screen.getByRole('button', { name: cellName(day, session, start, end) });
const dayButton = (day: number) =>
  screen.getByRole('button', { name: grid.selectDay.replace('{{day}}', dayName(day)) });
const sessionButton = (session: number) =>
  screen.getByRole('button', { name: grid.selectSession.replace('{{number}}', String(session)) });
const saveButton = () => screen.getByRole('button', { name: texts.save });

describe('ProfessorAvailabilityPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let getProfessor: MockInstance<typeof professorsService.get>;
  let getAvailability: MockInstance<typeof professorAvailabilityService.get>;
  let update: MockInstance<typeof professorAvailabilityService.update>;
  let listCalendars: MockInstance<typeof calendarsService.list>;
  let media: MatchMediaControl;

  function signInAs(role: 'ADMIN' | 'MEMBER') {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
  }

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    signInAs('ADMIN');
    getProfessor = vi
      .spyOn(professorsService, 'get')
      .mockResolvedValue({ status: 'loaded', professor });
    getAvailability = vi.spyOn(professorAvailabilityService, 'get');
    update = vi.spyOn(professorAvailabilityService, 'update');
    listCalendars = vi
      .spyOn(calendarsService, 'list')
      .mockResolvedValue({ status: 'loaded', calendars: [PRIMARY] });
    media = installMatchMedia(1280);
    availability([]);
  });

  afterEach(async () => {
    refresh.mockRestore();
    getProfessor.mockRestore();
    getAvailability.mockRestore();
    update.mockRestore();
    listCalendars.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function availability(unavailable: ProfessorUnavailability[]) {
    getAvailability.mockResolvedValue({
      status: 'loaded',
      availability: { professorId: PROFESSOR_ID, unavailable },
    });
  }

  function respondToUpdate(outcome: UpdateAvailabilityOutcome) {
    update.mockResolvedValue(outcome);
  }

  function renderPage(id = PROFESSOR_ID, strict = false) {
    const tree = (
      <MemoryRouter initialEntries={[`/profesores/${id}/disponibilidad`]}>
        <SessionProvider>
          <Routes>
            <Route path="/profesores/:id/disponibilidad" element={<ProfessorAvailabilityPage />} />
            <Route path="/profesores" element={<div data-testid="professors-page" />} />
            <Route path="/calendarios" element={<div data-testid="calendars-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  async function ready() {
    await screen.findByRole('heading', { level: 1 });
    await screen.findByRole('table');
  }

  describe('loading', () => {
    it('asks for the professor, the availability and the calendars once, also in strict mode', async () => {
      renderPage(PROFESSOR_ID, true);

      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
      await ready();

      expect(getProfessor).toHaveBeenCalledTimes(1);
      expect(getAvailability).toHaveBeenCalledTimes(1);
      expect(listCalendars).toHaveBeenCalledTimes(1);
      expect(getAvailability.mock.calls[0]?.[1]).toBe(PROFESSOR_ID);
    });

    it('shows the title with the name of the professor', async () => {
      renderPage();

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Disponibilidad de Ana García' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('professor-availability-page')).toBeInTheDocument();
    });

    it.each([
      ['the professor', () => getProfessor.mockResolvedValue({ status: 'unavailable' })],
      ['the availability', () => getAvailability.mockResolvedValue({ status: 'unavailable' })],
      ['the calendars', () => listCalendars.mockResolvedValue({ status: 'unavailable' })],
    ])('shows an alert with a button to retry when %s fails', async (_name, fail) => {
      const user = userEvent.setup();
      fail();
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);

      getProfessor.mockResolvedValue({ status: 'loaded', professor });
      availability([]);
      listCalendars.mockResolvedValue({ status: 'loaded', calendars: [PRIMARY] });
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it.each([
      ['the professor', () => getProfessor.mockResolvedValue({ status: 'notFound' })],
      ['the availability', () => getAvailability.mockResolvedValue({ status: 'notFound' })],
    ])(
      'says that the professor does not exist when %s is not found, with a link back',
      async (_name, gone) => {
        const user = userEvent.setup();
        gone();
        renderPage();

        expect(await screen.findByRole('heading', { name: texts.notFound })).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();

        await user.click(screen.getByRole('link', { name: texts.backToProfessors }));
        expect(screen.getByTestId('professors-page')).toBeInTheDocument();
      },
    );

    it('shows nothing of its own when the session is no longer valid: the layout redirects', async () => {
      getProfessor.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();

      await waitFor(() => {
        expect(getProfessor).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('the grid', () => {
    it('shows every cell available and 30 of 30 slots for a professor without intervals', async () => {
      renderPage();
      await ready();

      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
      expect(screen.getByText('30 de 30 franjas disponibles en «Primaria»')).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('is named after the professor and the calendar, with the breaks as separators', async () => {
      renderPage();
      await ready();

      expect(
        screen.getByRole('table', {
          name: 'Disponibilidad de Ana García en el calendario Primaria',
        }),
      ).toBeInTheDocument();
      expect(screen.getByText('Recreo 11:15–11:45')).toBeInTheDocument();
    });

    it('shows the cells that an interval covers as unavailable and counts them out', async () => {
      availability([interval(1, '09:00', '10:30')]);
      renderPage();
      await ready();

      expect(cellButton(1, 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'true');
      expect(cellButton(1, 2, '09:45', '10:30')).toHaveAttribute('aria-pressed', 'true');
      expect(cellButton(1, 3, '10:30', '11:15')).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('28 de 30 franjas disponibles en «Primaria»')).toBeInTheDocument();
    });

    it('shows a partially covered cell as partial, with the hours in its name, and does not count it', async () => {
      availability([interval(2, '11:00', '12:00')]);
      renderPage();
      await ready();

      const partial = screen.getByRole('button', {
        name: es.slots.grid.cellPartial
          .replace('{{day}}', dayName(2))
          .replace('{{number}}', '3')
          .replace('{{start}}', '10:30')
          .replace('{{end}}', '11:15')
          .replace('{{ranges}}', '11:00–12:00'),
      });
      expect(partial).toHaveAttribute('aria-pressed', 'mixed');
      expect(within(partial).getByText(grid.partialMark)).toBeInTheDocument();
      expect(screen.getByText('28 de 30 franjas disponibles en «Primaria»')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('marks a cell, counts it out and enables saving', async () => {
      const user = userEvent.setup();
      renderPage();
      await ready();

      await user.click(cellButton(1, 1, '09:00', '09:45'));

      expect(cellButton(1, 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText('29 de 30 franjas disponibles en «Primaria»')).toBeInTheDocument();
      expect(saveButton()).toBeEnabled();
    });

    it('removes only the part of the session from a marked cell, splitting the interval', async () => {
      const user = userEvent.setup();
      availability([interval(1, '09:00', '11:15')]);
      respondToUpdate({
        status: 'updated',
        availability: {
          professorId: PROFESSOR_ID,
          unavailable: [interval(1, '09:00', '09:45'), interval(1, '10:30', '11:15')],
        },
      });
      renderPage();
      await ready();

      await user.click(cellButton(1, 2, '09:45', '10:30'));
      await user.click(saveButton());

      expect(update).toHaveBeenCalledExactlyOnceWith(expect.anything(), PROFESSOR_ID, [
        interval(1, '09:00', '09:45'),
        interval(1, '10:30', '11:15'),
      ]);
    });

    it('marks and unmarks a whole day with its header', async () => {
      const user = userEvent.setup();
      renderPage();
      await ready();

      await user.click(dayButton(3));
      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(6);
      expect(screen.getByText('24 de 30 franjas disponibles en «Primaria»')).toBeInTheDocument();

      await user.click(dayButton(3));
      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
      expect(saveButton()).toBeDisabled();
    });

    it('marks and unmarks a whole session with its header', async () => {
      const user = userEvent.setup();
      renderPage();
      await ready();

      await user.click(sessionButton(2));
      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(5);

      await user.click(sessionButton(2));
      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
    });

    it('marks a partial cell as the whole session', async () => {
      const user = userEvent.setup();
      availability([interval(2, '11:00', '12:00')]);
      renderPage();
      await ready();

      await user.click(
        screen.getByRole('button', {
          name: new RegExp(`^${dayName(2)}, sesión 3 .*parcialmente`),
        }),
      );

      expect(cellButton(2, 3, '10:30', '11:15')).toHaveAttribute('aria-pressed', 'true');
    });

    it('enables saving only while the intervals differ from the saved ones', async () => {
      const user = userEvent.setup();
      availability([interval(1, '09:00', '09:45')]);
      renderPage();
      await ready();
      expect(saveButton()).toBeDisabled();

      await user.click(cellButton(1, 1, '09:00', '09:45'));
      expect(saveButton()).toBeEnabled();

      await user.click(cellButton(1, 1, '09:00', '09:45'));
      expect(saveButton()).toBeDisabled();
    });
  });

  describe('saving', () => {
    it('sends the final state, normalized, and stays on the page with the notice and the answer of the server', async () => {
      const user = userEvent.setup();
      respondToUpdate({
        status: 'updated',
        availability: {
          professorId: PROFESSOR_ID,
          unavailable: [interval(1, '09:00', '10:30')],
        },
      });
      renderPage();
      await ready();

      await user.click(cellButton(1, 1, '09:00', '09:45'));
      await user.click(cellButton(1, 2, '09:45', '10:30'));
      await user.click(saveButton());

      expect(update).toHaveBeenCalledExactlyOnceWith(expect.anything(), PROFESSOR_ID, [
        interval(1, '09:00', '10:30'),
      ]);
      expect(await screen.findByText('Disponibilidad de Ana García guardada')).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('does not send twice with a double click', async () => {
      const user = userEvent.setup();
      let finish: (outcome: UpdateAvailabilityOutcome) => void = () => undefined;
      update.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      renderPage();
      await ready();
      await user.click(cellButton(1, 1, '09:00', '09:45'));

      await user.dblClick(saveButton());
      finish({
        status: 'updated',
        availability: { professorId: PROFESSOR_ID, unavailable: [interval(1, '09:00', '09:45')] },
      });

      await waitFor(() => {
        expect(update).toHaveBeenCalledTimes(1);
      });
    });

    it('keeps what was marked and shows an alert when saving fails', async () => {
      const user = userEvent.setup();
      respondToUpdate({ status: 'unavailable' });
      renderPage();
      await ready();
      await user.click(cellButton(1, 1, '09:00', '09:45'));

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.saveError);
      expect(cellButton(1, 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'true');
      expect(saveButton()).toBeEnabled();
    });

    it('says that an hour is not valid on a 400, keeping what was marked', async () => {
      const user = userEvent.setup();
      respondToUpdate({
        status: 'validationError',
        details: [{ field: 'unavailable[0].dayOfWeek', code: 'OUT_OF_RANGE' }],
      });
      renderPage();
      await ready();
      await user.click(cellButton(1, 1, '09:00', '09:45'));

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.validationError);
    });

    it('shows the not-found view when the professor no longer exists', async () => {
      const user = userEvent.setup();
      respondToUpdate({ status: 'notFound' });
      renderPage();
      await ready();
      await user.click(cellButton(1, 1, '09:00', '09:45'));

      await user.click(saveButton());

      expect(await screen.findByRole('heading', { name: texts.notFound })).toBeInTheDocument();
    });
  });

  describe('intervals that the view does not show', () => {
    it('keeps them when something else is marked, and mentions them', async () => {
      const user = userEvent.setup();
      availability([interval(5, '15:00', '16:00')]);
      respondToUpdate({ status: 'unavailable' });
      renderPage();
      await ready();

      expect(
        screen.getByText(texts.outside.replace('{{ranges}}', 'Viernes 15:00–16:00')),
      ).toBeInTheDocument();

      await user.click(cellButton(1, 1, '09:00', '09:45'));
      await user.click(saveButton());

      expect(update).toHaveBeenCalledExactlyOnceWith(expect.anything(), PROFESSOR_ID, [
        interval(1, '09:00', '09:45'),
        interval(5, '15:00', '16:00'),
      ]);
    });

    it('does not mention anything when every interval is under some cell', async () => {
      availability([interval(1, '09:00', '09:45')]);
      renderPage();
      await ready();

      expect(screen.queryByText(/También no disponible/)).not.toBeInTheDocument();
    });
  });

  describe('available all', () => {
    it('empties the intervals at once when the view shows all of them', async () => {
      const user = userEvent.setup();
      availability([interval(1, '09:00', '10:30')]);
      renderPage();
      await ready();

      await user.click(screen.getByRole('button', { name: texts.availableAll }));

      expect(screen.queryByText(texts.confirmAllYes)).not.toBeInTheDocument();
      expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
      expect(saveButton()).toBeEnabled();
    });

    it('asks first when there are intervals that the view does not show, and keeps everything if cancelled', async () => {
      const user = userEvent.setup();
      availability([interval(1, '09:00', '10:30'), interval(5, '15:00', '16:00')]);
      renderPage();
      await ready();

      await user.click(screen.getByRole('button', { name: texts.availableAll }));

      expect(
        screen.getByText(texts.confirmAll.replace('{{ranges}}', 'Viernes 15:00–16:00')),
      ).toBeInTheDocument();
      expect(cellButton(1, 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByRole('button', { name: texts.cancel }));

      expect(screen.queryByText(texts.confirmAllYes)).not.toBeInTheDocument();
      expect(cellButton(1, 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'true');
      expect(saveButton()).toBeDisabled();
    });

    it('removes all the intervals, also the hidden ones, once confirmed', async () => {
      const user = userEvent.setup();
      availability([interval(1, '09:00', '10:30'), interval(5, '15:00', '16:00')]);
      respondToUpdate({
        status: 'updated',
        availability: { professorId: PROFESSOR_ID, unavailable: [] },
      });
      renderPage();
      await ready();

      await user.click(screen.getByRole('button', { name: texts.availableAll }));
      await user.click(screen.getByRole('button', { name: texts.confirmAllYes }));
      await user.click(saveButton());

      expect(update).toHaveBeenCalledExactlyOnceWith(expect.anything(), PROFESSOR_ID, []);
    });
  });

  describe('several calendars', () => {
    beforeEach(() => {
      listCalendars.mockResolvedValue({ status: 'loaded', calendars: [INFANT, PRIMARY] });
    });

    it('opens with the calendar that more courses follow and offers the others in a selector', async () => {
      renderPage();
      await ready();

      const select = screen.getByLabelText(texts.calendar);
      expect(select).toHaveValue('cal-p');
      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Infantil', 'Primaria']);
    });

    it('draws the sessions of the other calendar when it is chosen, without losing what was marked', async () => {
      const user = userEvent.setup();
      renderPage();
      await ready();
      await user.click(cellButton(1, 1, '09:00', '09:45'));

      await user.selectOptions(screen.getByLabelText(texts.calendar), 'cal-i');

      expect(
        screen.getByRole('table', {
          name: 'Disponibilidad de Ana García en el calendario Infantil',
        }),
      ).toBeInTheDocument();
      // 09:00–09:45 cubre parte de la 1ª sesión de Infantil (09:00–10:00): celda parcial.
      expect(
        screen.getByRole('button', { name: /^Lunes, sesión 1 \(09:00–10:00\): parcialmente/ }),
      ).toBeInTheDocument();
      expect(saveButton()).toBeEnabled();

      await user.selectOptions(screen.getByLabelText(texts.calendar), 'cal-p');
      expect(cellButton(1, 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'true');
    });

    it('does not offer the selector with a single calendar', async () => {
      listCalendars.mockResolvedValue({ status: 'loaded', calendars: [PRIMARY] });
      renderPage();
      await ready();

      expect(screen.queryByLabelText(texts.calendar)).not.toBeInTheDocument();
    });

    it('breaks a tie between calendars with the first by name', async () => {
      listCalendars.mockResolvedValue({
        status: 'loaded',
        calendars: [calendar('b', 'Primaria', 1), calendar('a', 'Ángeles', 1)],
      });
      renderPage();
      await ready();

      expect(screen.getByLabelText(texts.calendar)).toHaveValue('a');
    });
  });

  describe('a school without calendars', () => {
    it('explains it with a link to the calendars and draws no grid', async () => {
      const user = userEvent.setup();
      listCalendars.mockResolvedValue({ status: 'loaded', calendars: [] });
      renderPage();

      expect(await screen.findByText(texts.noCalendars)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: texts.save })).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: texts.calendarsLink }));
      expect(screen.getByTestId('calendars-page')).toBeInTheDocument();
    });
  });

  describe('the roles', () => {
    it.each(['ADMIN', 'MEMBER'] as const)('lets a %s mark and save', async (role) => {
      const user = userEvent.setup();
      signInAs(role);
      respondToUpdate({
        status: 'updated',
        availability: { professorId: PROFESSOR_ID, unavailable: [interval(1, '09:00', '09:45')] },
      });
      renderPage();
      await ready();

      await user.click(cellButton(1, 1, '09:00', '09:45'));
      await user.click(saveButton());

      expect(update).toHaveBeenCalledOnce();
    });
  });

  describe('accessibility', () => {
    it('has no violations with the three states, on a wide screen and on a phone', async () => {
      availability([interval(1, '09:00', '09:45'), interval(2, '11:00', '12:00')]);
      listCalendars.mockResolvedValue({ status: 'loaded', calendars: [INFANT, PRIMARY] });
      for (const width of [1280, 360]) {
        media.setWidth(width);
        const { container, unmount } = renderPage();
        await ready();

        expect(await wcagViolations(container)).toEqual([]);
        unmount();
      }
    });

    it('has no violations in the view without calendars', async () => {
      listCalendars.mockResolvedValue({ status: 'loaded', calendars: [] });
      const { container } = renderPage();
      await screen.findByText(texts.noCalendars);

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  it('is shown in English', async () => {
    await i18n.changeLanguage('en');
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Availability of Ana García' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
