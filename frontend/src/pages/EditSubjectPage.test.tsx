import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { coursesService, type Course, type CoursesOutcome } from '../services/coursesService';
import { sessionService, type SessionData } from '../services/sessionService';
import {
  subjectsService,
  type Subject,
  type SubjectOutcome,
  type UpdateSubjectOutcome,
} from '../services/subjectsService';
import { SessionProvider } from '../session/SessionProvider';
import { EditSubjectPage } from './EditSubjectPage';

const texts = es.subjects.form;

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

const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const FIRST = '0192f5a0-0000-7000-8000-0000000000d1';
const SECOND = '0192f5a0-0000-7000-8000-0000000000d2';
const THIRD = '0192f5a0-0000-7000-8000-0000000000d3';

function course(id: string, name: string): Course {
  return { id, name, createdAt: '2026-10-19T09:30:00.000Z', studentCount: 0, classes: [] };
}

const courses: Course[] = [
  course(FIRST, '1º Primaria'),
  course(SECOND, '2º Primaria'),
  course(THIRD, '3º Primaria'),
];

const english: Subject = {
  id: SUBJECT_ID,
  name: 'Inglés',
  code: 'ING',
  type: 'CORE',
  status: 'ACTIVE',
  description: 'Lengua extranjera',
  color: 'green',
  createdAt: '2026-10-26T09:30:00.000Z',
  courses: [
    { id: FIRST, name: '1º Primaria', sessionsPerWeek: 3, constraintCount: 2 },
    { id: SECOND, name: '2º Primaria', sessionsPerWeek: 5, constraintCount: 0 },
  ],
};

const saved: Subject = { ...english, name: 'Inglés del servidor' };

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

describe('EditSubjectPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof subjectsService.get>;
  let listCourses: MockInstance<typeof coursesService.list>;
  let update: MockInstance<typeof subjectsService.update>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi
      .spyOn(subjectsService, 'get')
      .mockResolvedValue({ status: 'loaded', subject: english } satisfies SubjectOutcome);
    listCourses = vi
      .spyOn(coursesService, 'list')
      .mockResolvedValue({ status: 'loaded', courses } satisfies CoursesOutcome);
    update = vi
      .spyOn(subjectsService, 'update')
      .mockResolvedValue({ status: 'updated', subject: saved } satisfies UpdateSubjectOutcome);
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    listCourses.mockRestore();
    update.mockRestore();
  });

  function renderPage(strict = false, id = SUBJECT_ID) {
    const tree = (
      <MemoryRouter initialEntries={[`/asignaturas/${id}/editar`]}>
        <SessionProvider>
          <Routes>
            <Route path="/asignaturas/:id/editar" element={<EditSubjectPage />} />
            <Route path="/asignaturas" element={<Destination />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const nameField = () => screen.getByLabelText(texts.name);
  const codeField = () => screen.getByLabelText(texts.code);
  const saveButton = () => screen.getByRole('button', { name: texts.save });
  const loaded = () => screen.findByLabelText(texts.name);

  describe('loading', () => {
    it('asks once for the subject and once for the courses, also in strict mode', async () => {
      renderPage(true);

      await loaded();

      expect(get).toHaveBeenCalledOnce();
      expect(get.mock.calls[0]?.[1]).toBe(SUBJECT_ID);
      expect(listCourses).toHaveBeenCalledOnce();
    });

    it('shows a status while the subject loads, and no form', async () => {
      get.mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(await screen.findByRole('status')).toHaveTextContent(texts.loadingOne);
      expect(screen.queryByLabelText(texts.name)).not.toBeInTheDocument();
    });

    it('does not mount the form until the courses have answered, and then shows it', async () => {
      let answer: (outcome: CoursesOutcome) => void = () => undefined;
      listCourses.mockReturnValue(
        new Promise<CoursesOutcome>((resolve) => {
          answer = resolve;
        }),
      );
      renderPage();

      await waitFor(() => {
        expect(get).toHaveBeenCalledOnce();
      });
      expect(await screen.findByRole('status')).toHaveTextContent(texts.loadingOne);
      expect(screen.queryByLabelText(texts.name)).not.toBeInTheDocument();

      answer({ status: 'loaded', courses });

      expect(await loaded()).toBeVisible();
    });

    it('shows the form with the saved subject, its color and its courses, and nothing to save', async () => {
      renderPage();
      await loaded();

      expect(nameField()).toHaveValue('Inglés');
      expect(codeField()).toHaveValue('ING');
      expect(screen.getByLabelText(texts.type)).toHaveValue('CORE');
      expect(screen.getByLabelText(texts.status)).toHaveValue('ACTIVE');
      expect(screen.getByLabelText(texts.description)).toHaveValue('Lengua extranjera');
      expect(screen.getByRole('radio', { name: 'Verde' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: '1º Primaria' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: '2º Primaria' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: '3º Primaria' })).not.toBeChecked();
      expect(screen.getByLabelText('Sesiones a la semana en 2º Primaria')).toHaveValue('5');
      expect(saveButton()).toBeDisabled();
    });

    it('warns that the rules of a course will be deleted when it is unticked, and not for one without rules', async () => {
      const user = userEvent.setup();
      renderPage();
      await loaded();

      await user.click(screen.getByRole('checkbox', { name: '2º Primaria' }));
      expect(screen.queryByText(/Al guardar se borrar/)).not.toBeInTheDocument();

      await user.click(screen.getByRole('checkbox', { name: '1º Primaria' }));
      expect(screen.getByText('Al guardar se borrarán sus 2 reglas en 1º Primaria')).toBeVisible();
    });

    it('does not propose a color: the saved one stays even if another one is free', async () => {
      get.mockResolvedValue({ status: 'loaded', subject: { ...english, color: 'gray' } });
      renderPage();
      await loaded();

      expect(screen.getByRole('radio', { name: 'Gris' })).toBeChecked();
      expect(screen.getByRole('radio', { name: 'Azul' })).not.toBeChecked();
    });

    it('says that a subject without courses needs one to be saved', async () => {
      get.mockResolvedValue({ status: 'loaded', subject: { ...english, courses: [] } });
      renderPage();
      await loaded();

      expect(screen.getByText(texts.courses.emptySubject)).toBeVisible();
    });

    it('shows that the subject does not exist, with a link to the list, on a 404', async () => {
      get.mockResolvedValue({ status: 'notFound' });
      renderPage();

      expect(await screen.findByText(texts.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.backToList })).toHaveAttribute(
        'href',
        '/asignaturas',
      );
      expect(screen.queryByLabelText(texts.name)).not.toBeInTheDocument();
    });

    it('asks the service for a malformed id, which the backend answers with a 404', async () => {
      get.mockResolvedValue({ status: 'notFound' });
      renderPage(false, 'no-es-un-uuid');

      expect(await screen.findByText(texts.notFound)).toBeVisible();
      expect(get.mock.calls[0]?.[1]).toBe('no-es-un-uuid');
    });

    it('shows an error with Retry when the subject fails, and asks again', async () => {
      get.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadErrorOne);
      await userEvent.click(screen.getByRole('button', { name: es.subjects.retry }));

      await loaded();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('shows the form with an error and Retry for the courses when they fail, and Save stays disabled', async () => {
      listCourses.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByText(texts.courses.loadError)).toBeVisible();
      await userEvent.type(nameField(), ' nuevo');
      expect(saveButton()).toBeDisabled();

      await userEvent.click(screen.getByRole('button', { name: texts.courses.retry }));

      expect(await screen.findByRole('checkbox', { name: '1º Primaria' })).toBeChecked();
      expect(listCourses).toHaveBeenCalledTimes(2);
      expect(nameField()).toHaveValue('Inglés nuevo');
      expect(saveButton()).toBeEnabled();
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
      await userEvent.type(nameField(), 'inglés  avanzado');
      await userEvent.selectOptions(screen.getByLabelText(texts.status), 'INACTIVE');
      await userEvent.click(screen.getByRole('checkbox', { name: '2º Primaria' }));
      await userEvent.click(screen.getByRole('checkbox', { name: '3º Primaria' }));

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(screen.getByTestId('destination')).toHaveTextContent(
          '/asignaturas {"subjectUpdated":"Inglés del servidor"} REPLACE',
        );
      });
      expect(update).toHaveBeenCalledOnce();
      expect(update.mock.calls[0]?.[1]).toBe(SUBJECT_ID);
      expect(update.mock.calls[0]?.[2]).toEqual({
        name: 'inglés avanzado',
        code: 'ING',
        type: 'CORE',
        status: 'INACTIVE',
        description: 'Lengua extranjera',
        color: 'green',
        courses: [
          { courseId: FIRST, sessionsPerWeek: 3 },
          { courseId: THIRD, sessionsPerWeek: 2 },
        ],
      });
    });

    it('sends a removed code as null', async () => {
      renderPage();
      await loaded();
      await userEvent.clear(codeField());

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(update).toHaveBeenCalledOnce();
      });
      expect(update.mock.calls[0]?.[2].code).toBeNull();
    });

    it('marks the name, with the focus, on a 409 and keeps what was written', async () => {
      update.mockResolvedValue({ status: 'alreadyExists' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.alreadyExists)).toBeVisible();
      expect(nameField()).toHaveFocus();
      expect(nameField()).toHaveValue('Inglés 2');
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });

    it('marks the code, with the focus, on a 409 of the code', async () => {
      update.mockResolvedValue({ status: 'codeAlreadyExists' });
      renderPage();
      await loaded();
      await userEvent.type(codeField(), '2');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.codeAlreadyExists)).toBeVisible();
      expect(codeField()).toHaveFocus();
      expect(codeField()).toHaveValue('ING2');
    });

    it('marks the fields that the server rejects, also under a course', async () => {
      update.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'courses[0].sessionsPerWeek', code: 'OUT_OF_RANGE' }],
      });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.sessions.OUT_OF_RANGE)).toBeVisible();
      expect(screen.getByLabelText('Sesiones a la semana en 1º Primaria')).toHaveFocus();
    });

    it('asks for the courses again, keeping what was written, when the server says a course is gone', async () => {
      update.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'courses[0].courseId', code: 'NOT_FOUND' }],
      });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');
      listCourses.mockResolvedValue({ status: 'loaded', courses: [courses[1] as Course] });

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(listCourses).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(screen.queryByRole('checkbox', { name: '1º Primaria' })).not.toBeInTheDocument();
      });
      expect(nameField()).toHaveValue('Inglés 2');
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });

    it('shows that the subject does not exist when it is gone while saving', async () => {
      update.mockResolvedValue({ status: 'notFound' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.backToList })).toBeVisible();
      expect(screen.queryByLabelText(texts.name)).not.toBeInTheDocument();
    });

    it('shows that only administrators can modify subjects on a 403, keeping what was written', async () => {
      update.mockResolvedValue({ status: 'forbidden' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.forbiddenEdit);
      expect(nameField()).toHaveValue('Inglés 2');
    });

    it('shows the general warning on any other failure, keeping what was written', async () => {
      update.mockResolvedValue({ status: 'unavailable' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' 2');

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.unavailable);
      expect(nameField()).toHaveValue('Inglés 2');
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
