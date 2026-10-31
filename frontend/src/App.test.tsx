import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { App } from './App';
import es from './i18n/es.json';
import './i18n/i18n';
import { calendarsService } from './services/calendarsService';
import { coursesService, type Course } from './services/coursesService';
import { slotsService } from './services/slotsService';
import { courseWorkloadService } from './services/courseWorkloadService';
import { professorsService } from './services/professorsService';
import { professorAvailabilityService } from './services/professorAvailabilityService';
import { studentsService } from './services/studentsService';
import { constraintsService } from './services/constraintsService';
import { subjectsService } from './services/subjectsService';
import { registrationService } from './services/registrationService';
import { sessionService, type SessionData } from './services/sessionService';
import { usersService } from './services/usersService';
import { SessionProvider } from './session/SessionProvider';

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

/** `App` dentro del router y del proveedor de sesión, como lo monta `main.tsx`. */
function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </MemoryRouter>,
  );
}

describe('App', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh').mockResolvedValue({ status: 'invalidSession' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the home page at the root path without redirecting', async () => {
    renderApp('/');

    expect(screen.getByTestId('home-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(refresh).toHaveBeenCalled();
    });
    expect(screen.getByTestId('home-page')).toBeInTheDocument();
  });

  describe('onboarding route', () => {
    it('renders the onboarding home page at /onboarding with an authenticated session', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp('/onboarding');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
    });

    it('redirects to the login page at /onboarding without a session', async () => {
      renderApp('/onboarding');

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
    });
  });

  describe('registration route', () => {
    beforeEach(() => {
      vi.spyOn(registrationService, 'listMunicipalities').mockResolvedValue([]);
    });

    it('renders the registration page at /registro', async () => {
      renderApp('/registro');

      expect(await screen.findByTestId('register-page')).toBeInTheDocument();
      expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    });
  });

  describe('login route', () => {
    it('renders the login page at /login without a session and without redirecting', async () => {
      renderApp('/login');

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
      expect(screen.queryByTestId('home-page')).not.toBeInTheDocument();
    });
  });

  describe('logging out', () => {
    /** Simula volver a `/onboarding` (el botón «Atrás» o un enlace guardado) tras cerrar sesión. */
    function GoToOnboarding() {
      const navigate = useNavigate();
      return (
        <button type="button" onClick={() => void navigate('/onboarding')}>
          volver a onboarding
        </button>
      );
    }

    function renderAppWithBackButton(path: string) {
      return render(
        <MemoryRouter initialEntries={[path]}>
          <SessionProvider>
            <App />
            <GoToOnboarding />
          </SessionProvider>
        </MemoryRouter>,
      );
    }

    beforeEach(() => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      vi.spyOn(sessionService, 'logout').mockResolvedValue({ status: 'loggedOut' });
    });

    it('goes from /onboarding to the login page and removes the header', async () => {
      renderApp('/onboarding');

      await userEvent.click(await screen.findByRole('button', { name: es.header.logout }));

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    });

    it('sends the user back to the login page when they return to /onboarding afterwards', async () => {
      renderAppWithBackButton('/onboarding');
      await userEvent.click(await screen.findByRole('button', { name: es.header.logout }));
      await screen.findByTestId('login-page');

      await userEvent.click(screen.getByRole('button', { name: 'volver a onboarding' }));

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('onboarding-page')).not.toBeInTheDocument();
    });

    it('does not show the header on a public page, even while there is a session', async () => {
      renderApp('/privacidad');

      expect(await screen.findByTestId('privacy-policy-page')).toBeInTheDocument();
      await waitFor(() => {
        expect(refresh).toHaveBeenCalled();
      });
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    });
  });

  describe('users route', () => {
    beforeEach(() => {
      vi.spyOn(usersService, 'list').mockResolvedValue({ status: 'loaded', users: [] });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it('renders the users page at /usuarios for an administrator, inside the layout', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp('/usuarios');

      expect(await screen.findByTestId('users-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('sends a member who opens /usuarios to /onboarding without any message', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });

      renderApp('/usuarios');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(screen.queryByTestId('users-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('sends a visitor without a session who opens /usuarios to the login page', async () => {
      renderApp('/usuarios');

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('users-page')).not.toBeInTheDocument();
    });

    it('links to /usuarios from the navigation of an administrator and not of a member', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      const admin = renderApp('/onboarding');
      await userEvent.click(await screen.findByRole('link', { name: es.header.users }));
      expect(await screen.findByTestId('users-page')).toBeInTheDocument();
      admin.unmount();

      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      renderApp('/onboarding');
      await screen.findByTestId('onboarding-page');
      expect(screen.queryByRole('link', { name: es.header.users })).not.toBeInTheDocument();
    });
  });

  describe('courses routes', () => {
    const savedCourse: Course = {
      id: '0192f5a0-0000-7000-8000-0000000000d1',
      name: '1º Primaria',
      createdAt: '2026-10-19T09:30:00.000Z',
      studentCount: 0,
      classes: [
        { id: '0192f5a0-0000-7000-8000-0000000000e1', name: 'A', tutor: null, studentCount: 0 },
      ],
    };
    const editPath = `/cursos/${savedCourse.id}/editar`;

    beforeEach(() => {
      vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses: [] });
      vi.spyOn(coursesService, 'get').mockResolvedValue({ status: 'loaded', course: savedCourse });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])('renders the list of courses at /cursos for %s, inside the layout', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });

      renderApp('/cursos');

      expect(await screen.findByTestId('courses-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])('renders the form to create a course at /cursos/nuevo for %s', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });

      renderApp('/cursos/nuevo');

      expect(await screen.findByTestId('create-course-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])('renders the form to edit a course at /cursos/:id/editar for %s', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });

      renderApp(editPath);

      expect(await screen.findByTestId('edit-course-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(await screen.findByLabelText(es.courses.form.name)).toHaveValue('1º Primaria');
    });

    it.each(['/cursos', '/cursos/nuevo', editPath])(
      'sends a visitor without a session who opens %s to the login page',
      async (path) => {
        renderApp(path);

        expect(await screen.findByTestId('login-page')).toBeInTheDocument();
        expect(screen.queryByTestId('courses-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('create-course-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('edit-course-page')).not.toBeInTheDocument();
      },
    );

    it('links to /cursos from the navigation of a member', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      renderApp('/onboarding');

      await userEvent.click(await screen.findByRole('link', { name: es.header.courses }));

      expect(await screen.findByTestId('courses-page')).toBeInTheDocument();
    });

    it('goes from the list to the form and back with the buttons of the pages', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      renderApp('/cursos');

      await userEvent.click(await screen.findByRole('link', { name: es.courses.create }));
      expect(await screen.findByTestId('create-course-page')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('link', { name: es.courses.form.cancel }));

      expect(await screen.findByTestId('courses-page')).toBeInTheDocument();
    });

    it('goes from the list to the edit page of a course and back with Cancel', async () => {
      vi.spyOn(coursesService, 'list').mockResolvedValue({
        status: 'loaded',
        courses: [savedCourse],
      });
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      renderApp('/cursos');

      await userEvent.click(await screen.findByRole('link', { name: 'Editar 1º Primaria' }));
      expect(await screen.findByTestId('edit-course-page')).toBeInTheDocument();
      await userEvent.click(await screen.findByRole('link', { name: es.courses.form.cancel }));

      expect(await screen.findByTestId('courses-page')).toBeInTheDocument();
    });

    it('keeps the "Gestión de horarios" card of the welcome screen as coming soon, not a link', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp('/onboarding');

      const card = await screen.findByRole('article', {
        name: es.onboarding.features.schedules.name,
      });
      expect(card).toHaveTextContent(es.onboarding.comingSoon);
      expect(within(card).queryByRole('link')).not.toBeInTheDocument();
    });
  });

  describe('professors routes', () => {
    beforeEach(() => {
      vi.spyOn(professorsService, 'list').mockResolvedValue({ status: 'loaded', professors: [] });
      vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses: [] });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])(
      'renders the list of professors at /profesores for %s, inside the layout',
      async (_who, data) => {
        refresh.mockResolvedValue({ status: 'authenticated', data });

        renderApp('/profesores');

        expect(await screen.findByTestId('professors-page')).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
      },
    );

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])('renders the form to create a professor at /profesores/nuevo for %s', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });

      renderApp('/profesores/nuevo');

      expect(await screen.findByTestId('create-professor-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])(
      'renders the edition of a professor at /profesores/:id/editar for %s',
      async (_who, data) => {
        refresh.mockResolvedValue({ status: 'authenticated', data });

        renderApp('/profesores/0192f5a0-0000-7000-8000-0000000000f1/editar');

        expect(await screen.findByTestId('edit-professor-page')).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
      },
    );

    it.each(['/profesores', '/profesores/nuevo', '/profesores/abc/editar'])(
      'sends a visitor without a session who opens %s to the login page',
      async (path) => {
        renderApp(path);

        expect(await screen.findByTestId('login-page')).toBeInTheDocument();
        expect(screen.queryByTestId('professors-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('create-professor-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('edit-professor-page')).not.toBeInTheDocument();
      },
    );

    it('links to /profesores from the navigation of a member and goes from the list to the form', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      renderApp('/onboarding');

      await userEvent.click(await screen.findByRole('link', { name: es.header.professors }));
      expect(await screen.findByTestId('professors-page')).toBeInTheDocument();
      await userEvent.click(await screen.findByRole('link', { name: es.professors.create }));

      expect(await screen.findByTestId('create-professor-page')).toBeInTheDocument();
    });
  });

  describe('students routes', () => {
    beforeEach(() => {
      vi.spyOn(studentsService, 'list').mockResolvedValue({ status: 'loaded', students: [] });
      vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses: [] });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])('renders the list of students at /alumnos for %s, inside the layout', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });

      renderApp('/alumnos');

      expect(await screen.findByTestId('students-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])('renders the form to create a student at /alumnos/nuevo for %s', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });

      renderApp('/alumnos/nuevo');

      expect(await screen.findByTestId('create-student-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])('renders the form to edit a student at /alumnos/:id/editar for %s', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });
      vi.spyOn(studentsService, 'get').mockResolvedValue({ status: 'notFound' });

      renderApp('/alumnos/0192f5a0-0000-7000-8000-0000000000b1/editar');

      expect(await screen.findByTestId('edit-student-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it.each(['/alumnos', '/alumnos/nuevo', '/alumnos/0192f5a0-0000-7000-8000-0000000000b1/editar'])(
      'sends a visitor without a session who opens %s to the login page',
      async (path) => {
        renderApp(path);

        expect(await screen.findByTestId('login-page')).toBeInTheDocument();
        expect(screen.queryByTestId('students-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('create-student-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('edit-student-page')).not.toBeInTheDocument();
      },
    );

    it('goes from the list to the edition of a student and keeps "Students" active in the navigation', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      vi.spyOn(studentsService, 'list').mockResolvedValue({
        status: 'loaded',
        students: [
          {
            id: '0192f5a0-0000-7000-8000-0000000000b1',
            firstName: 'Ana',
            lastName: 'Álvarez',
            course: null,
            class: null,
            cafeteria: false,
            scholarship: null,
          },
        ],
      });
      vi.spyOn(studentsService, 'get').mockResolvedValue({ status: 'notFound' });
      renderApp('/alumnos');

      await userEvent.click(await screen.findByRole('link', { name: 'Editar Álvarez, Ana' }));

      expect(await screen.findByTestId('edit-student-page')).toBeInTheDocument();
      expect(
        within(screen.getByRole('banner')).getByRole('link', { name: es.header.students }),
      ).toHaveAttribute('aria-current', 'page');
    });

    it('links to /alumnos from the navigation of a member and goes from the list to the form', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      renderApp('/onboarding');

      await userEvent.click(await screen.findByRole('link', { name: es.header.students }));
      expect(await screen.findByTestId('students-page')).toBeInTheDocument();
      await userEvent.click(await screen.findByRole('link', { name: es.students.create }));

      expect(await screen.findByTestId('create-student-page')).toBeInTheDocument();
    });
  });

  describe('privacy policy route', () => {
    it('renders the privacy policy at /privacidad without a session and without redirecting', async () => {
      renderApp('/privacidad');

      expect(await screen.findByTestId('privacy-policy-page')).toBeInTheDocument();
      await waitFor(() => {
        expect(refresh).toHaveBeenCalled();
      });
      expect(screen.getByTestId('privacy-policy-page')).toBeInTheDocument();
      expect(screen.queryByTestId('register-page')).not.toBeInTheDocument();
    });
  });

  describe('calendars routes', () => {
    beforeEach(() => {
      vi.spyOn(calendarsService, 'list').mockResolvedValue({ status: 'loaded', calendars: [] });
      vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses: [] });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])(
      'renders the list of calendars at /calendarios for %s, inside the layout',
      async (_who, data) => {
        refresh.mockResolvedValue({ status: 'authenticated', data });

        renderApp('/calendarios');

        expect(await screen.findByTestId('calendars-page')).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
      },
    );

    it('renders the form to create a calendar at /calendarios/nuevo for an administrator', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp('/calendarios/nuevo');

      expect(await screen.findByTestId('create-calendar-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('sends a member who opens /calendarios/nuevo to the welcome page, without any message', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });

      renderApp('/calendarios/nuevo');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(screen.queryByTestId('create-calendar-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('renders the form to edit a calendar at /calendarios/:id/editar for an administrator, inside the layout', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      vi.spyOn(calendarsService, 'get').mockResolvedValue({ status: 'notFound' });

      renderApp('/calendarios/cal-1/editar');

      expect(await screen.findByTestId('edit-calendar-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('sends a member who opens /calendarios/:id/editar to the welcome page, without any message or request', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      const get = vi.spyOn(calendarsService, 'get');

      renderApp('/calendarios/cal-1/editar');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-calendar-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(get).not.toHaveBeenCalled();
    });

    it.each(['/calendarios', '/calendarios/nuevo', '/calendarios/cal-1/editar'])(
      'sends a visitor without a session who opens %s to the login page',
      async (path) => {
        renderApp(path);

        expect(await screen.findByTestId('login-page')).toBeInTheDocument();
        expect(screen.queryByTestId('calendars-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('create-calendar-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('edit-calendar-page')).not.toBeInTheDocument();
      },
    );

    it('links to /calendarios from the navigation of a member, who sees no way to create one', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      renderApp('/onboarding');

      await userEvent.click(await screen.findByRole('link', { name: es.header.calendars }));

      expect(await screen.findByTestId('calendars-page')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: es.calendars.create })).not.toBeInTheDocument();
    });

    it('goes from the list to the edit page for an administrator and keeps "Calendar" active in the navigation', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      vi.spyOn(calendarsService, 'list').mockResolvedValue({
        status: 'loaded',
        calendars: [
          {
            id: 'cal-1',
            name: 'Primaria',
            createdAt: '2026-10-23T09:30:00.000Z',
            periods: [{ type: 'SESSION', startTime: '09:00', endTime: '09:45' }],
            courses: [],
          },
        ],
      });
      vi.spyOn(calendarsService, 'get').mockResolvedValue({ status: 'notFound' });
      renderApp('/calendarios');

      await userEvent.click(await screen.findByRole('link', { name: 'Editar Primaria' }));

      expect(await screen.findByTestId('edit-calendar-page')).toBeInTheDocument();
      expect(
        within(screen.getByRole('banner')).getByRole('link', { name: es.header.calendars }),
      ).toHaveAttribute('aria-current', 'page');
    });

    it('goes from the list to the form for an administrator and keeps "Calendar" active in the navigation', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      renderApp('/calendarios');

      await userEvent.click(await screen.findByRole('link', { name: es.calendars.create }));

      expect(await screen.findByTestId('create-calendar-page')).toBeInTheDocument();
      expect(
        within(screen.getByRole('banner')).getByRole('link', { name: es.header.calendars }),
      ).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('course workload route', () => {
    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])(
      'renders the workload of a course at /cursos/:id/carga for %s, inside the layout',
      async (_who, data) => {
        refresh.mockResolvedValue({ status: 'authenticated', data });
        const get = vi
          .spyOn(courseWorkloadService, 'get')
          .mockResolvedValue({ status: 'notFound' });

        renderApp('/cursos/course-1/carga');

        expect(await screen.findByTestId('course-workload-page')).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
        // La petición sale en un efecto de la página: se espera a ella en lugar de suponer que ya salió.
        await waitFor(() => {
          expect(get).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'course-1');
        });
      },
    );

    it('keeps "Courses" active in the navigation inside the workload of a course', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      vi.spyOn(courseWorkloadService, 'get').mockResolvedValue({ status: 'notFound' });

      renderApp('/cursos/course-1/carga');

      await screen.findByTestId('course-workload-page');
      expect(
        within(screen.getByRole('banner')).getByRole('link', { name: es.header.courses }),
      ).toHaveAttribute('aria-current', 'page');
    });

    it('sends a visitor without a session who opens it to the login page, without any request', async () => {
      const get = vi.spyOn(courseWorkloadService, 'get');

      renderApp('/cursos/course-1/carga');

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('course-workload-page')).not.toBeInTheDocument();
      expect(get).not.toHaveBeenCalled();
    });
  });

  describe('slots routes', () => {
    it.each([
      ['an administrator', 'ADMIN', 'prohibidas', 'FORBIDDEN_SLOTS'],
      ['a member', 'MEMBER', 'prohibidas', 'FORBIDDEN_SLOTS'],
      ['an administrator', 'ADMIN', 'preferidas', 'PREFERRED_SLOTS'],
      ['a member', 'MEMBER', 'preferidas', 'PREFERRED_SLOTS'],
    ] as const)(
      'renders the slots of a subject for %s at /cursos/:courseId/carga/:subjectId/%s, inside the layout',
      async (_who, role, segment, type) => {
        refresh.mockResolvedValue({
          status: 'authenticated',
          data: { ...sessionData, user: { ...sessionData.user, role } },
        });
        const get = vi.spyOn(slotsService, 'get').mockResolvedValue({ status: 'notFound' });

        renderApp(`/cursos/course-1/carga/subject-1/${segment}`);

        expect(await screen.findByTestId('subject-slots-page')).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
        await waitFor(() => {
          expect(get).toHaveBeenCalledExactlyOnceWith(
            expect.anything(),
            'course-1',
            'subject-1',
            type,
          );
        });
      },
    );

    it.each(['prohibidas', 'preferidas'])(
      'sends a visitor without a session who opens /%s to the login page, without any request',
      async (segment) => {
        const get = vi.spyOn(slotsService, 'get');

        renderApp(`/cursos/course-1/carga/subject-1/${segment}`);

        expect(await screen.findByTestId('login-page')).toBeInTheDocument();
        expect(get).not.toHaveBeenCalled();
      },
    );
  });

  describe('professor availability routes', () => {
    const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';

    beforeEach(() => {
      vi.spyOn(professorsService, 'get').mockResolvedValue({
        status: 'loaded',
        professor: {
          id: PROFESSOR_ID,
          firstName: 'Ana',
          lastName: 'García',
          position: null,
          subjects: [],
          unavailableCount: 0,
          tutoredClass: null,
        },
      });
      vi.spyOn(professorAvailabilityService, 'get').mockResolvedValue({
        status: 'loaded',
        availability: { professorId: PROFESSOR_ID, unavailable: [] },
      });
      vi.spyOn(calendarsService, 'list').mockResolvedValue({ status: 'loaded', calendars: [] });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])(
      'renders the availability of a professor at /profesores/:id/disponibilidad for %s, inside the layout',
      async (_who, data) => {
        refresh.mockResolvedValue({ status: 'authenticated', data });

        renderApp(`/profesores/${PROFESSOR_ID}/disponibilidad`);

        expect(await screen.findByTestId('professor-availability-page')).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
      },
    );

    it('sends a visitor without a session who opens it to the login page', async () => {
      renderApp(`/profesores/${PROFESSOR_ID}/disponibilidad`);

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('professor-availability-page')).not.toBeInTheDocument();
    });

    it('keeps "Professors" active in the navigation', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp(`/profesores/${PROFESSOR_ID}/disponibilidad`);

      await screen.findByTestId('professor-availability-page');
      expect(
        within(screen.getByRole('banner')).getByRole('link', { name: es.header.professors }),
      ).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('constraints routes', () => {
    beforeEach(() => {
      vi.spyOn(constraintsService, 'list').mockResolvedValue({
        status: 'loaded',
        constraints: [],
      });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])(
      'renders the list of constraints at /reglas for %s, inside the layout',
      async (_who, data) => {
        refresh.mockResolvedValue({ status: 'authenticated', data });

        renderApp('/reglas');

        expect(await screen.findByTestId('constraints-page')).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
      },
    );

    it('sends a visitor without a session who opens /reglas to the login page', async () => {
      renderApp('/reglas');

      expect(await screen.findByTestId('login-page')).toBeInTheDocument();
      expect(screen.queryByTestId('constraints-page')).not.toBeInTheDocument();
    });

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])('links to /reglas from the navigation of %s and marks it as current', async (_who, data) => {
      refresh.mockResolvedValue({ status: 'authenticated', data });
      renderApp('/onboarding');

      await userEvent.click(await screen.findByRole('link', { name: es.header.constraints }));

      expect(await screen.findByTestId('constraints-page')).toBeInTheDocument();
      expect(
        within(screen.getByRole('banner')).getByRole('link', { name: es.header.constraints }),
      ).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('subjects routes', () => {
    let listSubjects: MockInstance<typeof subjectsService.list>;

    beforeEach(() => {
      listSubjects = vi
        .spyOn(subjectsService, 'list')
        .mockResolvedValue({ status: 'loaded', subjects: [] });
      vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses: [] });
    });

    const memberSession: SessionData = {
      ...sessionData,
      user: { ...sessionData.user, role: 'MEMBER' },
    };

    it.each([
      ['an administrator', sessionData],
      ['a member', memberSession],
    ])(
      'renders the list of subjects at /asignaturas for %s, inside the layout',
      async (_who, data) => {
        refresh.mockResolvedValue({ status: 'authenticated', data });

        renderApp('/asignaturas');

        expect(await screen.findByTestId('subjects-page')).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
      },
    );

    it('renders the form to create a subject at /asignaturas/nueva for an administrator', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });

      renderApp('/asignaturas/nueva');

      expect(await screen.findByTestId('create-subject-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('sends a member who opens /asignaturas/nueva to the welcome page, without any message or request', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      renderApp('/asignaturas/nueva');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(screen.queryByTestId('create-subject-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(listSubjects).not.toHaveBeenCalled();
    });

    it('renders the form to edit a subject at /asignaturas/:id/editar for an administrator, inside the layout', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      const get = vi.spyOn(subjectsService, 'get').mockResolvedValue({ status: 'notFound' });

      renderApp('/asignaturas/sub-1/editar');

      expect(await screen.findByTestId('edit-subject-page')).toBeInTheDocument();
      expect(screen.getByRole('banner')).toBeInTheDocument();
      expect(get.mock.calls[0]?.[1]).toBe('sub-1');
    });

    it('sends a member who opens /asignaturas/:id/editar to the welcome page, without any message or request', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      const get = vi.spyOn(subjectsService, 'get');

      renderApp('/asignaturas/sub-1/editar');

      expect(await screen.findByTestId('onboarding-page')).toBeInTheDocument();
      expect(screen.queryByTestId('edit-subject-page')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(get).not.toHaveBeenCalled();
    });

    it.each(['/asignaturas', '/asignaturas/nueva', '/asignaturas/sub-1/editar'])(
      'sends a visitor without a session who opens %s to the login page',
      async (path) => {
        renderApp(path);

        expect(await screen.findByTestId('login-page')).toBeInTheDocument();
        expect(screen.queryByTestId('subjects-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('create-subject-page')).not.toBeInTheDocument();
        expect(screen.queryByTestId('edit-subject-page')).not.toBeInTheDocument();
      },
    );

    it('links to /asignaturas from the navigation of a member, who sees no way to create one', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: memberSession });
      renderApp('/onboarding');

      await userEvent.click(await screen.findByRole('link', { name: es.header.subjects }));

      expect(await screen.findByTestId('subjects-page')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: es.subjects.create })).not.toBeInTheDocument();
    });

    it('goes from the list to the form for an administrator and keeps "Subjects" active in the navigation', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      renderApp('/asignaturas');

      await userEvent.click(await screen.findByRole('link', { name: es.subjects.create }));

      expect(await screen.findByTestId('create-subject-page')).toBeInTheDocument();
      expect(
        within(screen.getByRole('banner')).getByRole('link', { name: es.header.subjects }),
      ).toHaveAttribute('aria-current', 'page');
    });

    it('goes from the list to the edition of a subject and keeps "Subjects" active in the navigation', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionData });
      listSubjects.mockResolvedValue({
        status: 'loaded',
        subjects: [
          {
            id: 'sub-1',
            name: 'Inglés',
            code: null,
            type: 'CORE',
            status: 'ACTIVE',
            description: null,
            color: 'blue',
            createdAt: '2026-10-26T09:30:00.000Z',
            courses: [],
          },
        ],
      });
      vi.spyOn(subjectsService, 'get').mockResolvedValue({ status: 'notFound' });
      renderApp('/asignaturas');

      await userEvent.click(await screen.findByRole('link', { name: 'Editar Inglés' }));

      expect(await screen.findByTestId('edit-subject-page')).toBeInTheDocument();
      expect(
        within(screen.getByRole('banner')).getByRole('link', { name: es.header.subjects }),
      ).toHaveAttribute('aria-current', 'page');
    });
  });
});
