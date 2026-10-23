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
  type CalendarsOutcome,
  type CreateCalendarOutcome,
} from '../services/calendarsService';
import { coursesService, type Course, type CoursesOutcome } from '../services/coursesService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { CreateCalendarPage } from './CreateCalendarPage';

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

const courses: Course[] = [course('c1', '1º Primaria'), course('c2', '2º Primaria')];

const created: Calendar = {
  id: 'cal-1',
  name: 'Primaria',
  createdAt: '2026-10-23T09:30:00.000Z',
  periods: [{ type: 'SESSION', startTime: '09:00', endTime: '09:45' }],
  courses: [],
};

const infant: Calendar = {
  ...created,
  id: 'cal-2',
  name: 'Infantil',
  courses: [{ id: 'c2', name: '2º Primaria' }],
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

describe('CreateCalendarPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let listCourses: MockInstance<typeof coursesService.list>;
  let listCalendars: MockInstance<typeof calendarsService.list>;
  let create: MockInstance<typeof calendarsService.create>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    listCourses = vi
      .spyOn(coursesService, 'list')
      .mockResolvedValue({ status: 'loaded', courses } satisfies CoursesOutcome);
    listCalendars = vi
      .spyOn(calendarsService, 'list')
      .mockResolvedValue({ status: 'loaded', calendars: [infant] } satisfies CalendarsOutcome);
    create = vi
      .spyOn(calendarsService, 'create')
      .mockResolvedValue({ status: 'created', calendar: created } satisfies CreateCalendarOutcome);
  });

  afterEach(() => {
    refresh.mockRestore();
    listCourses.mockRestore();
    listCalendars.mockRestore();
    create.mockRestore();
  });

  function renderPage(strict = false) {
    const tree = (
      <MemoryRouter initialEntries={['/calendarios/nuevo']}>
        <SessionProvider>
          <Routes>
            <Route path="/calendarios/nuevo" element={<CreateCalendarPage />} />
            <Route path="/calendarios" element={<Destination />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const nameField = () => screen.getByLabelText(texts.name);
  const saveButton = () => screen.getByRole('button', { name: texts.save });

  describe('loading what the form offers', () => {
    it('asks once for the courses and once for the calendars, also in strict mode', async () => {
      renderPage(true);

      await screen.findByLabelText('1º Primaria');

      expect(listCourses).toHaveBeenCalledOnce();
      expect(listCalendars).toHaveBeenCalledOnce();
    });

    it('offers the courses and warns about the one that follows another calendar', async () => {
      renderPage();

      expect(await screen.findByLabelText('1º Primaria')).toBeVisible();
      expect(await screen.findByText('Ahora sigue «Infantil»: se moverá')).toBeVisible();
      expect(screen.getByLabelText('2º Primaria')).toHaveAccessibleDescription(
        'Ahora sigue «Infantil»: se moverá',
      );
    });

    it('shows a status while the courses load', async () => {
      listCourses.mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(await screen.findByRole('status')).toHaveTextContent(texts.courses.loading);
    });

    it('shows an error with Retry when the courses fail, and asks again', async () => {
      listCourses.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.courses.loadError);
      await userEvent.click(screen.getByRole('button', { name: texts.courses.retry }));

      expect(await screen.findByLabelText('1º Primaria')).toBeVisible();
      expect(listCourses).toHaveBeenCalledTimes(2);
    });

    it('still lets the calendar be created when the calendars cannot be read: it just does not warn', async () => {
      listCalendars.mockResolvedValue({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByLabelText('2º Primaria')).toBeVisible();
      expect(screen.queryByText(/se moverá/)).not.toBeInTheDocument();
    });
  });

  describe('creating the calendar', () => {
    it('sends it once, goes to the list replacing the entry, and carries the name for the notice', async () => {
      renderPage();
      await screen.findByLabelText('1º Primaria');
      await userEvent.type(nameField(), 'Primaria');
      await userEvent.click(screen.getByLabelText('1º Primaria'));

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(screen.getByTestId('destination')).toHaveTextContent(
          '/calendarios {"calendarCreated":"Primaria"} REPLACE',
        );
      });
      expect(create).toHaveBeenCalledOnce();
      expect(create.mock.calls[0]?.[1]).toMatchObject({ name: 'Primaria', courseIds: ['c1'] });
    });

    it('uses the name that the server saved for the notice, not the one typed', async () => {
      create.mockResolvedValue({
        status: 'created',
        calendar: { ...created, name: 'Primaria y Secundaria' },
      });
      renderPage();
      await screen.findByLabelText('1º Primaria');
      await userEvent.type(nameField(), '  primaria   y secundaria ');

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(screen.getByTestId('destination')).toHaveTextContent('Primaria y Secundaria');
      });
    });

    it('marks the name, with the focus, on a 409', async () => {
      create.mockResolvedValue({ status: 'alreadyExists' });
      renderPage();
      await screen.findByLabelText('1º Primaria');
      await userEvent.type(nameField(), 'Primaria');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.alreadyExists)).toBeVisible();
      expect(nameField()).toHaveFocus();
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });

    it('marks the fields that the server rejects', async () => {
      create.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'periods[1].endTime', code: 'TOO_LONG' }],
      });
      renderPage();
      await screen.findByLabelText('1º Primaria');
      await userEvent.type(nameField(), 'Primaria');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.time.TOO_LONG)).toBeVisible();
      expect(screen.getByLabelText('Fin de la sesión 2')).toHaveFocus();
    });

    it('asks for the courses again, keeping what was written, when the server says a course is gone', async () => {
      create.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'courseIds[0]', code: 'NOT_FOUND' }],
      });
      renderPage();
      await screen.findByLabelText('1º Primaria');
      await userEvent.type(nameField(), 'Primaria');
      fireEvent.change(screen.getByLabelText('Fin de la sesión 1'), { target: { value: '09:40' } });
      await userEvent.click(screen.getByLabelText('1º Primaria'));
      listCourses.mockResolvedValue({ status: 'loaded', courses: [courses[1] as Course] });

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.course.NOT_FOUND)).toBeVisible();
      await waitFor(() => {
        expect(listCourses).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.queryByLabelText('1º Primaria')).not.toBeInTheDocument();
      });
      expect(nameField()).toHaveValue('Primaria');
      expect(screen.getByLabelText('Fin de la sesión 1')).toHaveValue('09:40');
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });

    it('shows that only administrators can create calendars on a 403, keeping what was written', async () => {
      create.mockResolvedValue({ status: 'forbidden' });
      renderPage();
      await screen.findByLabelText('1º Primaria');
      await userEvent.type(nameField(), 'Primaria');

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.forbidden);
      expect(nameField()).toHaveValue('Primaria');
    });

    it('shows the general warning on any other failure, keeping what was written', async () => {
      create.mockResolvedValue({ status: 'unavailable' });
      renderPage();
      await screen.findByLabelText('1º Primaria');
      await userEvent.type(nameField(), 'Primaria');

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.unavailable);
      expect(nameField()).toHaveValue('Primaria');
      expect(saveButton()).toBeEnabled();
    });

    it('does nothing more when the session is lost: the layout redirects', async () => {
      create.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();
      await screen.findByLabelText('1º Primaria');
      await userEvent.type(nameField(), 'Primaria');

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(create).toHaveBeenCalledOnce();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });
  });

  it('shows the title of the page', () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: texts.title })).toBeVisible();
  });
});
