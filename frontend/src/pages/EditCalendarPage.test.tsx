import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import {
  calendarsService,
  type Calendar,
  type CalendarOutcome,
  type CalendarsOutcome,
  type UpdateCalendarOutcome,
} from '../services/calendarsService';
import { coursesService, type Course, type CoursesOutcome } from '../services/coursesService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { EditCalendarPage } from './EditCalendarPage';

const texts = es.calendars.form;

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

function course(id: string, name: string): Course {
  return { id, name, createdAt: '2026-10-19T09:30:00.000Z', studentCount: 0, classes: [] };
}

const courses: Course[] = [
  course('c1', '1º Primaria'),
  course('c2', '2º Primaria'),
  course('c3', '3º Primaria'),
];

const CALENDAR_ID = '0192f5a0-0000-7000-8000-0000000000c1';

const primary: Calendar = {
  id: CALENDAR_ID,
  name: 'Primaria',
  createdAt: '2026-10-23T09:30:00.000Z',
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
    { type: 'BREAK', startTime: '10:30', endTime: '11:00' },
    { type: 'SESSION', startTime: '11:00', endTime: '11:45' },
  ],
  courses: [
    { id: 'c1', name: '1º Primaria' },
    { id: 'c2', name: '2º Primaria' },
  ],
};

const infant: Calendar = {
  ...primary,
  id: 'cal-2',
  name: 'Infantil',
  courses: [{ id: 'c3', name: '3º Primaria' }],
};

/** Destino de la navegación: muestra la ruta, el estado y el tipo de navegación. */
function Destination() {
  const location = useLocation();
  const type = useNavigationType();
  return (
    <div data-testid="destination">
      {`${location.pathname} ${JSON.stringify(location.state as unknown)} ${type}`}
    </div>
  );
}

describe('EditCalendarPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof calendarsService.get>;
  let listCourses: MockInstance<typeof coursesService.list>;
  let listCalendars: MockInstance<typeof calendarsService.list>;
  let update: MockInstance<typeof calendarsService.update>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi
      .spyOn(calendarsService, 'get')
      .mockResolvedValue({ status: 'loaded', calendar: primary } satisfies CalendarOutcome);
    listCourses = vi
      .spyOn(coursesService, 'list')
      .mockResolvedValue({ status: 'loaded', courses } satisfies CoursesOutcome);
    listCalendars = vi.spyOn(calendarsService, 'list').mockResolvedValue({
      status: 'loaded',
      calendars: [primary, infant],
    } satisfies CalendarsOutcome);
    update = vi.spyOn(calendarsService, 'update').mockResolvedValue({
      status: 'updated',
      calendar: { ...primary, name: 'Primaria 1º ciclo' },
    } satisfies UpdateCalendarOutcome);
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    listCourses.mockRestore();
    listCalendars.mockRestore();
    update.mockRestore();
  });

  function renderPage(strict = false, id = CALENDAR_ID) {
    const tree = (
      <MemoryRouter initialEntries={[`/calendarios/${id}/editar`]}>
        <SessionProvider>
          <Routes>
            <Route path="/calendarios/:id/editar" element={<EditCalendarPage />} />
            <Route path="/calendarios" element={<Destination />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const nameField = () => screen.getByLabelText(texts.name);
  const saveButton = () => screen.getByRole('button', { name: texts.save });
  const loaded = () => screen.findByLabelText('1º Primaria');

  describe('loading', () => {
    it('asks once for the calendar, once for the courses and once for the calendars, also in strict mode', async () => {
      renderPage(true);

      await loaded();

      expect(get).toHaveBeenCalledOnce();
      expect(get.mock.calls[0]?.[1]).toBe(CALENDAR_ID);
      expect(listCourses).toHaveBeenCalledOnce();
      expect(listCalendars).toHaveBeenCalledOnce();
    });

    it('shows a status while the calendar loads', async () => {
      get.mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(await screen.findByRole('status')).toHaveTextContent(texts.loadingOne);
      expect(screen.queryByLabelText(texts.name)).not.toBeInTheDocument();
    });

    it('shows the form with the saved calendar and nothing to save', async () => {
      renderPage();
      await loaded();

      expect(nameField()).toHaveValue('Primaria');
      expect(screen.getByLabelText('Inicio de la sesión 3')).toHaveValue('11:00');
      expect(screen.getByLabelText('Fin del recreo 1')).toHaveValue('11:00');
      expect(screen.getByLabelText('1º Primaria')).toBeChecked();
      expect(screen.getByLabelText('2º Primaria')).toBeChecked();
      expect(screen.getByLabelText('3º Primaria')).not.toBeChecked();
      expect(saveButton()).toBeDisabled();
    });

    it('warns only about the courses that follow another calendar, not about its own', async () => {
      renderPage();
      await loaded();

      expect(screen.getByLabelText('3º Primaria')).toHaveAccessibleDescription(
        'Ahora sigue «Infantil»: se moverá',
      );
      expect(screen.getByLabelText('1º Primaria')).not.toHaveAccessibleDescription();
      expect(screen.getAllByText(/se moverá/)).toHaveLength(1);
    });

    it('still lets the calendar be edited when the calendars cannot be read: it just does not warn', async () => {
      listCalendars.mockResolvedValue({ status: 'unavailable' });
      renderPage();

      await loaded();

      expect(screen.queryByText(/se moverá/)).not.toBeInTheDocument();
    });

    it('shows that the calendar does not exist, with a link to the list, on a 404', async () => {
      get.mockResolvedValue({ status: 'notFound' });
      renderPage();

      expect(await screen.findByText(texts.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.backToList })).toHaveAttribute(
        'href',
        '/calendarios',
      );
      expect(screen.queryByLabelText(texts.name)).not.toBeInTheDocument();
    });

    it('shows an error with Retry when the calendar fails, and asks again', async () => {
      get.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadErrorOne);
      await userEvent.click(screen.getByRole('button', { name: es.calendars.retry }));

      await loaded();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('shows an error with Retry when the courses fail, keeping the courses of the calendar untouched, and asks again', async () => {
      listCourses.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByText(texts.courses.loadError)).toBeVisible();
      await userEvent.type(nameField(), ' nuevo');
      await userEvent.click(saveButton());
      await waitFor(() => {
        expect(update).toHaveBeenCalledOnce();
      });
      expect(update.mock.calls[0]?.[2].courseIds).toEqual(['c1', 'c2']);
    });

    it('asks again for the courses with its Retry button', async () => {
      listCourses.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();
      await screen.findByText(texts.courses.loadError);

      await userEvent.click(screen.getByRole('button', { name: texts.courses.retry }));

      await loaded();
      expect(listCourses).toHaveBeenCalledTimes(2);
    });

    it('does nothing more when the session is lost: the layout redirects', async () => {
      get.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();

      await waitFor(() => {
        expect(get).toHaveBeenCalledOnce();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByText(texts.notFound)).not.toBeInTheDocument();
    });
  });

  describe('saving', () => {
    it('sends the final state once, goes to the list replacing the entry and carries the saved name for the notice', async () => {
      renderPage();
      await loaded();
      await userEvent.clear(nameField());
      await userEvent.type(nameField(), 'primaria  1º ciclo');
      await userEvent.click(screen.getByLabelText('2º Primaria'));
      await userEvent.click(screen.getByLabelText('3º Primaria'));

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(screen.getByTestId('destination')).toHaveTextContent(
          '/calendarios {"calendarUpdated":"Primaria 1º ciclo"} REPLACE',
        );
      });
      expect(update).toHaveBeenCalledOnce();
      expect(update.mock.calls[0]?.[1]).toBe(CALENDAR_ID);
      expect(update.mock.calls[0]?.[2]).toEqual({
        name: 'primaria  1º ciclo',
        periods: primary.periods,
        courseIds: ['c1', 'c3'],
      });
    });

    it('marks the name, with the focus, on a 409', async () => {
      update.mockResolvedValue({ status: 'alreadyExists' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.alreadyExists)).toBeVisible();
      expect(nameField()).toHaveFocus();
      expect(nameField()).toHaveValue('Primaria 2');
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });

    it('marks the fields that the server rejects', async () => {
      update.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'periods[1].endTime', code: 'TOO_LONG' }],
      });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.time.TOO_LONG)).toBeVisible();
      expect(screen.getByLabelText('Fin de la sesión 2')).toHaveFocus();
    });

    it('asks for the courses again, keeping what was written, when the server says a course is gone', async () => {
      update.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'courseIds[0]', code: 'NOT_FOUND' }],
      });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');
      fireEvent.change(screen.getByLabelText('Fin de la sesión 1'), { target: { value: '09:40' } });
      listCourses.mockResolvedValue({ status: 'loaded', courses: [courses[1] as Course] });

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.course.NOT_FOUND)).toBeVisible();
      await waitFor(() => {
        expect(listCourses).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.queryByLabelText('1º Primaria')).not.toBeInTheDocument();
      });
      expect(nameField()).toHaveValue('Primaria 2');
      expect(screen.getByLabelText('Fin de la sesión 1')).toHaveValue('09:40');
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });

    it('shows that the calendar does not exist when it is gone while saving', async () => {
      update.mockResolvedValue({ status: 'notFound' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.backToList })).toBeVisible();
      expect(screen.queryByLabelText(texts.name)).not.toBeInTheDocument();
    });

    it('shows that only administrators can modify calendars on a 403, keeping what was written', async () => {
      update.mockResolvedValue({ status: 'forbidden' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.forbiddenEdit);
      expect(nameField()).toHaveValue('Primaria 2');
    });

    it('shows the general warning on any other failure, keeping what was written', async () => {
      update.mockResolvedValue({ status: 'unavailable' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.unavailable);
      expect(nameField()).toHaveValue('Primaria 2');
      expect(saveButton()).toBeEnabled();
    });

    it('goes back to the general warning after a 403 when the next failure is a different one', async () => {
      update.mockResolvedValueOnce({ status: 'forbidden' });
      update.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');
      await userEvent.click(saveButton());
      await screen.findByText(texts.errors.forbiddenEdit);

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.unavailable)).toBeVisible();
    });

    it('does nothing more when the session is lost: the layout redirects', async () => {
      update.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(update).toHaveBeenCalledOnce();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });
  });

  it('shows the title of the page', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: texts.editTitle })).toBeVisible();
  });
});
