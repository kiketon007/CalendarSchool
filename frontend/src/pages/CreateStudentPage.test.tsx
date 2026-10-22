import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { coursesService, type Course } from '../services/coursesService';
import { studentsService, type Student } from '../services/studentsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { CreateStudentPage } from './CreateStudentPage';

const sessionData: SessionData = {
  session: { accessToken: 'signed.access.token', expiresIn: 900 },
  user: {
    id: '0192f5a0-0000-7000-8000-0000000000a1',
    email: 'jose.garcia@example.com',
    firstName: 'José María',
    lastName: 'García-López',
    role: 'MEMBER',
  },
  school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
};

const form = es.students.form;
const COURSE_1 = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_2 = '0192f5a0-0000-7000-8000-0000000000d2';
const CLASS_1A = '0192f5a0-0000-7000-8000-0000000000e1';
const CLASS_2A = '0192f5a0-0000-7000-8000-0000000000e3';

function course(id: string, name: string, classes: Course['classes']): Course {
  return { id, name, createdAt: '2026-10-19T09:30:00.000Z', studentCount: 0, classes };
}

const courses: Course[] = [
  course(COURSE_1, '1º Primaria', [{ id: CLASS_1A, name: 'A', tutor: null, studentCount: 0 }]),
  course(COURSE_2, '2º Primaria', [{ id: CLASS_2A, name: 'A', tutor: null, studentCount: 0 }]),
];

const created: Student = {
  id: 's1',
  firstName: 'Juan',
  lastName: 'García',
  course: { id: COURSE_1, name: '1º Primaria' },
  class: { id: CLASS_1A, name: 'A' },
  cafeteria: false,
  scholarship: null,
  foodType: null,
  observations: null,
};

function Destination() {
  const location = useLocation();
  const state = location.state as unknown;
  const { pathname } = location;
  return (
    <div data-testid="destination">
      {pathname} {JSON.stringify(state)}
    </div>
  );
}

describe('CreateStudentPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let listCourses: MockInstance<typeof coursesService.list>;
  let create: MockInstance<typeof studentsService.create>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    listCourses = vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses });
    create = vi.spyOn(studentsService, 'create');
  });

  afterEach(async () => {
    refresh.mockRestore();
    listCourses.mockRestore();
    create.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderPage(options: { strict?: boolean } = {}) {
    const tree = (
      <MemoryRouter initialEntries={['/alumnos/nuevo']}>
        <SessionProvider>
          <Routes>
            <Route path="/alumnos/nuevo" element={<CreateStudentPage />} />
            <Route path="/alumnos" element={<Destination />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const firstName = () => screen.findByLabelText(form.firstName);
  const lastName = () => screen.getByLabelText(form.lastName);
  const courseSelect = () => screen.getByLabelText(form.course);
  const classSelect = () => screen.getByLabelText(form.class);
  const save = () => screen.getByRole('button', { name: form.save });

  async function fillValid() {
    await userEvent.type(await firstName(), 'Juan');
    await userEvent.type(lastName(), 'García');
    // Los cursos llegan después de montar: se espera a que se ofrezcan.
    await waitFor(() => {
      expect(courseSelect()).toBeEnabled();
    });
    await userEvent.selectOptions(courseSelect(), COURSE_1);
    await userEvent.click(screen.getByRole('radio', { name: form.cafeteriaNo }));
  }

  it('shows the title and asks for the courses once, also in strict mode', async () => {
    renderPage({ strict: true });

    expect(await screen.findByRole('heading', { level: 1, name: form.title })).toBeVisible();
    await waitFor(() => {
      expect(courseSelect()).toBeEnabled();
    });
    expect(listCourses).toHaveBeenCalledOnce();
  });

  it('offers the courses once they arrive and keeps the form disabled until then', async () => {
    let resolve: (value: Awaited<ReturnType<typeof coursesService.list>>) => void = () => undefined;
    listCourses.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    renderPage();

    await firstName();
    expect(courseSelect()).toBeDisabled();
    expect(save()).toBeDisabled();
    resolve({ status: 'loaded', courses });

    await waitFor(() => {
      expect(courseSelect()).toBeEnabled();
    });
  });

  it('creates the student and goes to the list with the name for the notice', async () => {
    create.mockResolvedValue({ status: 'created', student: created });
    renderPage();
    await fillValid();
    await userEvent.selectOptions(classSelect(), CLASS_1A);

    await userEvent.click(save());

    expect(await screen.findByTestId('destination')).toHaveTextContent(
      '/alumnos {"studentCreated":"Juan García"}',
    );
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[1]).toEqual({
      firstName: 'Juan',
      lastName: 'García',
      courseId: COURSE_1,
      classId: CLASS_1A,
      cafeteria: false,
      scholarship: false,
      foodType: '',
      observations: '',
    });
  });

  it('sends the scholarship and the food type of a student that eats at school', async () => {
    create.mockResolvedValue({ status: 'created', student: created });
    renderPage();
    await fillValid();
    await userEvent.click(screen.getByRole('radio', { name: form.cafeteriaYes }));
    await userEvent.click(screen.getByLabelText(form.scholarship));
    await userEvent.type(screen.getByLabelText(form.foodType), 'Vegetariana');

    await userEvent.click(save());

    await waitFor(() => {
      expect(create).toHaveBeenCalledOnce();
    });
    expect(create.mock.calls[0]?.[1]).toMatchObject({
      cafeteria: true,
      scholarship: true,
      foodType: 'Vegetariana',
    });
  });

  it('sends nothing when the form is not valid', async () => {
    renderPage();
    await firstName();

    await userEvent.type(await firstName(), 'Juan');
    await waitFor(() => {
      expect(courseSelect()).toBeEnabled();
    });
    await userEvent.click(save());

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(form.errors.lastName.REQUIRED)).toBeVisible();
  });

  it('marks the course with the focus and asks for the courses again when it no longer exists, keeping what was typed', async () => {
    create.mockResolvedValue({
      status: 'validationError',
      details: [{ field: 'courseId', code: 'NOT_FOUND' }],
    });
    renderPage();
    await fillValid();
    listCourses.mockResolvedValue({ status: 'loaded', courses: [courses[1] as Course] });

    await userEvent.click(save());

    expect(await screen.findByText(form.errors.courseId.NOT_FOUND)).toBeVisible();
    await waitFor(() => {
      expect(listCourses).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(courseSelect()).toHaveFocus();
    });
    expect(courseSelect()).toHaveValue('');
    expect(screen.getByLabelText(form.firstName)).toHaveValue('Juan');
    expect(screen.getByLabelText(form.lastName)).toHaveValue('García');
  });

  it('marks the class when it no longer exists, asking for the courses again', async () => {
    create.mockResolvedValue({
      status: 'validationError',
      details: [{ field: 'classId', code: 'NOT_FOUND' }],
    });
    renderPage();
    await fillValid();
    await userEvent.selectOptions(classSelect(), CLASS_1A);

    await userEvent.click(save());

    expect(await screen.findByText(form.errors.classId.NOT_FOUND)).toBeVisible();
    await waitFor(() => {
      expect(listCourses).toHaveBeenCalledTimes(2);
    });
    expect(classSelect()).toHaveFocus();
  });

  it('shows the fields that the server rejects', async () => {
    create.mockResolvedValue({
      status: 'validationError',
      details: [{ field: 'lastName', code: 'INVALID_CHARACTERS' }],
    });
    renderPage();
    await fillValid();

    await userEvent.click(save());

    expect(await screen.findByText(form.errors.lastName.INVALID_CHARACTERS)).toBeVisible();
    expect(lastName()).toHaveFocus();
    expect(listCourses).toHaveBeenCalledOnce();
  });

  it('shows a general error and keeps what was typed when the server is unavailable', async () => {
    create.mockResolvedValue({ status: 'unavailable' });
    renderPage();
    await fillValid();

    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent(form.errors.unavailable);
    expect(screen.getByLabelText(form.firstName)).toHaveValue('Juan');
    expect(courseSelect()).toHaveValue(COURSE_1);
  });

  it('does nothing more when the session is lost: the layout redirects', async () => {
    create.mockResolvedValue({ status: 'unauthenticated' });
    renderPage();
    await fillValid();

    await userEvent.click(save());

    await waitFor(() => {
      expect(create).toHaveBeenCalledOnce();
    });
    expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('explains that the courses could not be loaded, with "Retry", and loads them on retry', async () => {
    listCourses.mockResolvedValueOnce({ status: 'unavailable' });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(form.coursesLoadError);
    expect(save()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: es.students.retry }));

    await waitFor(() => {
      expect(courseSelect()).toBeEnabled();
    });
    expect(listCourses).toHaveBeenCalledTimes(2);
  });

  it('shows the form in English', async () => {
    await i18n.changeLanguage('en');
    renderPage();

    expect(await screen.findByLabelText('First name')).toBeVisible();
  });
});
