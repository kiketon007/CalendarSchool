import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { coursesService, type Course } from '../services/coursesService';
import { studentsService, type Student } from '../services/studentsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { EditStudentPage } from './EditStudentPage';

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

const STUDENT_ID = '0192f5a0-0000-7000-8000-0000000000b1';
const COURSE_1 = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_2 = '0192f5a0-0000-7000-8000-0000000000d2';
const CLASS_1A = '0192f5a0-0000-7000-8000-0000000000e1';
const CLASS_1B = '0192f5a0-0000-7000-8000-0000000000e2';
const CLASS_2A = '0192f5a0-0000-7000-8000-0000000000e3';

const juan: Student = {
  id: STUDENT_ID,
  firstName: 'Juan',
  lastName: 'García',
  course: { id: COURSE_1, name: '1º Primaria' },
  class: { id: CLASS_1A, name: 'A' },
  cafeteria: true,
  scholarship: true,
  foodType: 'Vegetariana',
  observations: 'Necesita apoyo',
};

const withoutCourse: Student = {
  ...juan,
  course: null,
  class: null,
  cafeteria: false,
  scholarship: null,
  foodType: null,
  observations: null,
};

const courses: Course[] = [
  {
    id: COURSE_1,
    name: '1º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    studentCount: 1,
    classes: [
      { id: CLASS_1A, name: 'A', tutor: null, studentCount: 1, assignmentCount: 0 },
      { id: CLASS_1B, name: 'B', tutor: null, studentCount: 0, assignmentCount: 0 },
    ],
  },
  {
    id: COURSE_2,
    name: '2º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    studentCount: 0,
    classes: [{ id: CLASS_2A, name: 'A', tutor: null, studentCount: 0, assignmentCount: 0 }],
  },
];

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

/** Dónde se acaba: ruta, búsqueda, estado de la navegación y si sustituyó la entrada del historial. */
function Destination() {
  const location = useLocation();
  const navigationType = useNavigationType();
  return (
    <div data-testid="destination">
      <span data-testid="pathname">{location.pathname}</span>
      <span data-testid="search">{location.search}</span>
      <span data-testid="state">{JSON.stringify(location.state as unknown)}</span>
      <span data-testid="navigation-type">{navigationType}</span>
    </div>
  );
}

const form = es.students.form;
const edit = es.students.edit;

describe('EditStudentPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof studentsService.get>;
  let update: MockInstance<typeof studentsService.update>;
  let listCourses: MockInstance<typeof coursesService.list>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi.spyOn(studentsService, 'get').mockResolvedValue({ status: 'loaded', student: juan });
    update = vi
      .spyOn(studentsService, 'update')
      .mockResolvedValue({ status: 'updated', student: { ...juan, firstName: 'Juanito' } });
    listCourses = vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses });
  });

  afterEach(async () => {
    refresh.mockRestore();
    get.mockRestore();
    update.mockRestore();
    listCourses.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderPage(
    options: { id?: string; strict?: boolean; state?: unknown; viewport?: undefined } = {},
  ) {
    const id = options.id ?? STUDENT_ID;
    const tree = (
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/alumnos/${id}/editar`,
            ...(options.state !== undefined && { state: options.state }),
          },
        ]}
      >
        <SessionProvider>
          <Routes>
            <Route path="/alumnos/:id/editar" element={<EditStudentPage />} />
            <Route path="/alumnos" element={<Destination />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const firstName = () => screen.findByLabelText(form.firstName);
  const course = () => screen.getByLabelText(form.course);
  const classSelect = () => screen.getByLabelText(form.class);
  const save = () => screen.getByRole('button', { name: form.save });

  describe('loading', () => {
    it('asks for the student and the courses once, even in strict mode', async () => {
      renderPage({ strict: true });

      await firstName();
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0]?.[1]).toBe(STUDENT_ID);
      expect(listCourses).toHaveBeenCalledTimes(1);
    });

    it('shows a loading status while the student loads', async () => {
      get.mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(await screen.findByRole('status')).toHaveTextContent(edit.loading);
      expect(screen.getByRole('heading', { level: 1, name: edit.title })).toBeVisible();
    });

    it('fills the form with every data of the student, the sensitive ones included, and Save disabled', async () => {
      renderPage();

      expect(await firstName()).toHaveValue('Juan');
      expect(screen.getByLabelText(form.lastName)).toHaveValue('García');
      await waitFor(() => {
        expect(course()).toHaveValue(COURSE_1);
      });
      expect(classSelect()).toHaveValue(CLASS_1A);
      expect(screen.getByRole('radio', { name: form.cafeteriaYes })).toBeChecked();
      expect(screen.getByLabelText(form.scholarship)).toBeChecked();
      expect(screen.getByLabelText(form.foodType)).toHaveValue('Vegetariana');
      expect(screen.getByLabelText(form.observations)).toHaveValue('Necesita apoyo');
      expect(save()).toBeDisabled();
      expect(screen.queryByText(form.courseMissing)).not.toBeInTheDocument();
    });

    it('fills a student without course, without cafeteria and without texts, and explains that it has no course', async () => {
      get.mockResolvedValue({ status: 'loaded', student: withoutCourse });
      renderPage();

      await firstName();
      await waitFor(() => {
        expect(course()).toHaveValue('');
      });
      expect(screen.getByRole('radio', { name: form.cafeteriaNo })).toBeChecked();
      expect(screen.getByLabelText(form.observations)).toHaveValue('');
      expect(screen.getByText(form.courseMissing)).toBeVisible();
      expect(save()).toBeDisabled();
    });

    it('shows that the student does not exist, with a link to the list, on a 404', async () => {
      get.mockResolvedValue({ status: 'notFound' });
      renderPage();

      expect(await screen.findByText(edit.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: es.students.title })).toHaveAttribute(
        'href',
        '/alumnos',
      );
      expect(screen.queryByLabelText(form.firstName)).not.toBeInTheDocument();
    });

    it('shows an error with "Retry" that asks for the student again', async () => {
      get.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(edit.loadError);
      await userEvent.click(screen.getByRole('button', { name: es.students.retry }));

      expect(await firstName()).toHaveValue('Juan');
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('offers the courses to choose from, in the order of the server', async () => {
      renderPage();
      await firstName();

      await waitFor(() => {
        expect(
          Array.from((course() as HTMLSelectElement).options).map((option) => option.textContent),
        ).toEqual([form.courseChoose, '1º Primaria', '2º Primaria']);
      });
    });

    it('cannot be saved when the courses do not load, and says so', async () => {
      listCourses.mockResolvedValue({ status: 'unavailable' });
      renderPage();

      await firstName();
      expect(await screen.findByText(form.coursesLoadError)).toBeVisible();
      await userEvent.type(screen.getByLabelText(form.firstName), 'ito');
      expect(save()).toBeDisabled();
    });
  });

  describe('saving', () => {
    async function changeName() {
      await userEvent.type(await firstName(), 'ito');
    }

    it('sends one PUT with the final state, with the cafeteria as a boolean, even with a double click', async () => {
      update.mockReturnValue(new Promise(() => undefined));
      renderPage();
      await changeName();

      await userEvent.dblClick(save());

      expect(update).toHaveBeenCalledOnce();
      expect(update.mock.calls[0]?.[1]).toBe(STUDENT_ID);
      expect(update.mock.calls[0]?.[2]).toEqual({
        firstName: 'Juanito',
        lastName: 'García',
        courseId: COURSE_1,
        classId: CLASS_1A,
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Necesita apoyo',
      });
      expect(screen.getByRole('button', { name: form.saving })).toBeDisabled();
    });

    it('goes back to the list with the search it came from, replacing the entry, with the notice', async () => {
      renderPage({ state: { listSearch: '?comedor=si&pagina=2' } });
      await changeName();

      await userEvent.click(save());

      expect(await screen.findByTestId('pathname')).toHaveTextContent('/alumnos');
      expect(screen.getByTestId('search')).toHaveTextContent('?comedor=si&pagina=2');
      expect(screen.getByTestId('state')).toHaveTextContent('{"studentUpdated":"Juanito García"}');
      expect(screen.getByTestId('navigation-type')).toHaveTextContent('REPLACE');
    });

    it('goes back to the list without search when it comes without state, as after reloading', async () => {
      renderPage();
      await changeName();

      await userEvent.click(save());

      expect(await screen.findByTestId('pathname')).toHaveTextContent('/alumnos');
      expect(screen.getByTestId('search')).toBeEmptyDOMElement();
    });

    it.each([
      ['a text that is not a search', { listSearch: '//otro-sitio.example' }],
      ['a search that is not text', { listSearch: 3 }],
      ['another kind of state', 'comedor=si'],
    ])('goes back to the list without search when the state carries %s', async (_name, state) => {
      renderPage({ state });
      await changeName();

      await userEvent.click(save());

      expect(await screen.findByTestId('pathname')).toHaveTextContent('/alumnos');
      expect(screen.getByTestId('search')).toBeEmptyDOMElement();
    });

    it('moves to another course and class and sends them', async () => {
      renderPage();
      await firstName();
      await waitFor(() => {
        expect(course()).toHaveValue(COURSE_1);
      });

      await userEvent.selectOptions(course(), COURSE_2);
      await userEvent.selectOptions(classSelect(), CLASS_2A);
      await userEvent.click(save());

      await waitFor(() => {
        expect(update.mock.calls[0]?.[2]).toMatchObject({ courseId: COURSE_2, classId: CLASS_2A });
      });
    });

    it('assigns a course to a student that had none', async () => {
      get.mockResolvedValue({ status: 'loaded', student: withoutCourse });
      renderPage();
      await firstName();
      await waitFor(() => {
        expect(course()).toBeEnabled();
      });

      await userEvent.selectOptions(course(), COURSE_1);
      await userEvent.click(save());

      await waitFor(() => {
        expect(update.mock.calls[0]?.[2]).toMatchObject({
          courseId: COURSE_1,
          classId: '',
          cafeteria: false,
        });
      });
    });

    it('does not send anything and asks for the course of a student without it', async () => {
      get.mockResolvedValue({ status: 'loaded', student: withoutCourse });
      renderPage();
      await changeName();

      await userEvent.click(save());

      expect(update).not.toHaveBeenCalled();
      expect(screen.getByText(form.errors.courseId.REQUIRED)).toBeVisible();
      expect(course()).toHaveFocus();
    });

    it('shows the errors of the server under their fields and focuses the first one', async () => {
      update.mockResolvedValue({
        status: 'validationError',
        details: [
          { field: 'firstName', code: 'INVALID_CHARACTERS' },
          { field: 'observations', code: 'INVALID_LENGTH' },
        ],
      });
      renderPage();
      await changeName();

      await userEvent.click(save());

      expect(await screen.findByText(form.errors.firstName.INVALID_CHARACTERS)).toBeVisible();
      expect(
        screen.getByText('Las observaciones pueden tener hasta 5000 caracteres'),
      ).toBeVisible();
      expect(screen.getByLabelText(form.firstName)).toHaveFocus();
    });

    it.each([
      ['courseId', form.errors.courseId.NOT_FOUND, 'course'],
      ['classId', form.errors.classId.NOT_FOUND, 'class'],
    ])(
      'asks for the courses again and marks the %s that no longer exists, keeping what was typed',
      async (field, message) => {
        update.mockResolvedValue({
          status: 'validationError',
          details: [{ field, code: 'NOT_FOUND' }],
        });
        renderPage();
        await changeName();
        expect(listCourses).toHaveBeenCalledTimes(1);

        await userEvent.click(save());

        expect(await screen.findByText(message)).toBeVisible();
        await waitFor(() => {
          expect(listCourses).toHaveBeenCalledTimes(2);
        });
        expect(screen.getByLabelText(form.firstName)).toHaveValue('Juanito');
      },
    );

    it('shows that the student no longer exists when it disappears while editing', async () => {
      update.mockResolvedValue({ status: 'notFound' });
      renderPage();
      await changeName();

      await userEvent.click(save());

      expect(await screen.findByText(edit.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: es.students.title })).toBeVisible();
    });

    it('shows a general alert and keeps what was typed when saving fails, and allows trying again', async () => {
      update.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();
      await changeName();

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(edit.saveError);
      expect(screen.getByLabelText(form.firstName)).toHaveValue('Juanito');
      await userEvent.click(save());
      expect(await screen.findByTestId('pathname')).toHaveTextContent('/alumnos');
      expect(update).toHaveBeenCalledTimes(2);
    });
  });

  describe('Cancel', () => {
    it('goes back to the list with the same search, without asking and without saving', async () => {
      renderPage({ state: { listSearch: '?curso=abc&pagina=3' } });
      await userEvent.type(await firstName(), 'ito');

      await userEvent.click(screen.getByRole('link', { name: form.cancel }));

      expect(await screen.findByTestId('pathname')).toHaveTextContent('/alumnos');
      expect(screen.getByTestId('search')).toHaveTextContent('?curso=abc&pagina=3');
      expect(update).not.toHaveBeenCalled();
    });

    it('goes back to the list without search when there is no state', async () => {
      renderPage();
      await firstName();

      expect(screen.getByRole('link', { name: form.cancel })).toHaveAttribute('href', '/alumnos');
    });
  });

  it('has no accessibility violations loading, loaded, with errors, without course and not found', async () => {
    get.mockReturnValueOnce(new Promise(() => undefined));
    const loading = renderPage();
    expect(await wcagViolations(loading.container)).toEqual([]);
    loading.unmount();

    const loaded = renderPage();
    await firstName();
    expect(await wcagViolations(loaded.container)).toEqual([]);
    await userEvent.clear(screen.getByLabelText(form.firstName));
    await userEvent.click(save());
    expect(await screen.findByText(form.errors.firstName.REQUIRED)).toBeVisible();
    expect(await wcagViolations(loaded.container)).toEqual([]);
    loaded.unmount();

    get.mockResolvedValue({ status: 'loaded', student: withoutCourse });
    const missing = renderPage();
    await firstName();
    expect(await wcagViolations(missing.container)).toEqual([]);
    missing.unmount();

    get.mockResolvedValue({ status: 'notFound' });
    const gone = renderPage();
    await screen.findByText(edit.notFound);
    expect(await wcagViolations(gone.container)).toEqual([]);
  });
});
