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
  type CreateSubjectOutcome,
  type Subject,
  type SubjectsOutcome,
} from '../services/subjectsService';
import { SessionProvider } from '../session/SessionProvider';
import { CreateSubjectPage } from './CreateSubjectPage';

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

const FIRST = '0192f5a0-0000-7000-8000-0000000000d1';
const SECOND = '0192f5a0-0000-7000-8000-0000000000d2';

function course(id: string, name: string): Course {
  return { id, name, createdAt: '2026-10-19T09:30:00.000Z', studentCount: 0, classes: [] };
}

const courses: Course[] = [course(FIRST, '1º Primaria'), course(SECOND, '2º Primaria')];

function subject(name: string, color: Subject['color']): Subject {
  return {
    id: `id-${name}`,
    name,
    code: null,
    type: 'CORE',
    status: 'ACTIVE',
    description: null,
    color,
    createdAt: '2026-10-26T09:30:00.000Z',
    courses: [],
  };
}

const created: Subject = {
  ...subject('Inglés del servidor', 'blue'),
  courses: [{ id: FIRST, name: '1º Primaria', sessionsPerWeek: 3 }],
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

describe('CreateSubjectPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let listCourses: MockInstance<typeof coursesService.list>;
  let listSubjects: MockInstance<typeof subjectsService.list>;
  let create: MockInstance<typeof subjectsService.create>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    listCourses = vi
      .spyOn(coursesService, 'list')
      .mockResolvedValue({ status: 'loaded', courses } satisfies CoursesOutcome);
    listSubjects = vi
      .spyOn(subjectsService, 'list')
      .mockResolvedValue({ status: 'loaded', subjects: [] } satisfies SubjectsOutcome);
    create = vi
      .spyOn(subjectsService, 'create')
      .mockResolvedValue({ status: 'created', subject: created } satisfies CreateSubjectOutcome);
  });

  afterEach(() => {
    refresh.mockRestore();
    listCourses.mockRestore();
    listSubjects.mockRestore();
    create.mockRestore();
  });

  function renderPage(strict = false) {
    const tree = (
      <MemoryRouter initialEntries={['/asignaturas/nueva']}>
        <SessionProvider>
          <Routes>
            <Route path="/asignaturas/nueva" element={<CreateSubjectPage />} />
            <Route path="/asignaturas" element={<Destination />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const nameField = () => screen.getByLabelText(texts.name);
  const saveButton = () => screen.getByRole('button', { name: texts.save });

  /** Rellena lo mínimo para poder guardar: nombre, tipo y el primer curso. */
  async function fillValid(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText(texts.name), 'Inglés');
    await user.selectOptions(screen.getByLabelText(texts.type), 'CORE');
    await user.click(await screen.findByRole('checkbox', { name: '1º Primaria' }));
  }

  describe('loading what the form offers', () => {
    it('shows the title, asks once for the courses and once for the subjects, also in strict mode', async () => {
      renderPage(true);

      expect(screen.getByRole('heading', { level: 1, name: texts.title })).toBeInTheDocument();
      await screen.findByRole('checkbox', { name: '1º Primaria' });

      expect(listCourses).toHaveBeenCalledOnce();
      expect(listSubjects).toHaveBeenCalledOnce();
    });

    it('shows that it is loading until the subjects arrive, because the proposed color depends on them', () => {
      listSubjects.mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(screen.getByRole('status')).toHaveTextContent(es.subjects.loading);
      expect(screen.queryByLabelText(texts.name)).not.toBeInTheDocument();
    });

    it('offers the courses of the school', async () => {
      renderPage();

      expect(await screen.findByRole('checkbox', { name: '1º Primaria' })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: '2º Primaria' })).toBeInTheDocument();
    });

    it('proposes the first color that no subject of the school uses', async () => {
      listSubjects.mockResolvedValue({
        status: 'loaded',
        subjects: [subject('Inglés', 'blue'), subject('Música', 'indigo')],
      });
      renderPage();

      expect(await screen.findByRole('radio', { name: 'Morado' })).toBeChecked();
    });

    it('proposes the first color of the palette when the subjects cannot be read, and still serves', async () => {
      listSubjects.mockResolvedValue({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('radio', { name: 'Azul' })).toBeChecked();
      expect(nameField()).toBeEnabled();
    });

    it('says to create the courses first when the school has none', async () => {
      listCourses.mockResolvedValue({ status: 'loaded', courses: [] });
      renderPage();

      expect(await screen.findByText(texts.courses.none)).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('shows an alert with a button to retry when the courses fail, and asks again only for them', async () => {
      const user = userEvent.setup();
      listCourses.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();
      expect(await screen.findByText(texts.courses.loadError)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: texts.courses.retry }));

      expect(await screen.findByRole('checkbox', { name: '1º Primaria' })).toBeInTheDocument();
      expect(listCourses).toHaveBeenCalledTimes(2);
      expect(listSubjects).toHaveBeenCalledOnce();
    });
  });

  describe('saving', () => {
    it('sends what was filled in, with the empty code and description as null, and goes to the list with the name the server saved', async () => {
      const user = userEvent.setup();
      renderPage();
      await user.type(await screen.findByLabelText(texts.name), '  Inglés   2 ');
      await user.selectOptions(screen.getByLabelText(texts.type), 'ELECTIVE');
      await user.click(screen.getByRole('radio', { name: 'Verde' }));
      await user.click(await screen.findByRole('checkbox', { name: '2º Primaria' }));
      await user.selectOptions(
        screen.getByLabelText(texts.courses.sessions.replace('{{course}}', '2º Primaria')),
        '4',
      );

      await user.click(saveButton());

      expect(create).toHaveBeenCalledOnce();
      expect(create.mock.calls[0]?.[1]).toEqual({
        name: 'Inglés 2',
        code: null,
        type: 'ELECTIVE',
        status: 'ACTIVE',
        description: null,
        color: 'green',
        courses: [{ courseId: SECOND, sessionsPerWeek: 4 }],
      });
      expect((await screen.findByTestId('destination')).textContent).toBe(
        '/asignaturas {"subjectCreated":"Inglés del servidor"} REPLACE',
      );
    });

    it('marks the name, with the focus, when the name is taken, and keeps what was typed', async () => {
      const user = userEvent.setup();
      create.mockResolvedValue({ status: 'alreadyExists' });
      renderPage();
      await fillValid(user);

      await user.click(saveButton());

      expect(await screen.findByText(texts.errors.alreadyExists)).toBeInTheDocument();
      expect(nameField()).toHaveFocus();
      expect(nameField()).toHaveValue('Inglés');
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });

    it('marks the code, with the focus, when the code is taken', async () => {
      const user = userEvent.setup();
      create.mockResolvedValue({ status: 'codeAlreadyExists' });
      renderPage();
      await fillValid(user);
      await user.type(screen.getByLabelText(texts.code), 'ING');

      await user.click(saveButton());

      expect(await screen.findByText(texts.errors.codeAlreadyExists)).toBeInTheDocument();
      expect(screen.getByLabelText(texts.code)).toHaveFocus();
    });

    it('marks the fields the server rejects, without asking for the courses again', async () => {
      const user = userEvent.setup();
      create.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'description', code: 'INVALID_LENGTH' }],
      });
      renderPage();
      await fillValid(user);

      await user.click(saveButton());

      expect(
        await screen.findByText(texts.errors.description.INVALID_LENGTH.replace('{{max}}', '500')),
      ).toBeInTheDocument();
      expect(listCourses).toHaveBeenCalledOnce();
    });

    it('asks for the courses again, keeping what was typed, when a chosen course no longer exists', async () => {
      const user = userEvent.setup();
      create.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'courses[0].courseId', code: 'NOT_FOUND' }],
      });
      renderPage();
      await fillValid(user);

      await user.click(saveButton());

      await waitFor(() => {
        expect(listCourses).toHaveBeenCalledTimes(2);
      });
      expect(nameField()).toHaveValue('Inglés');
      expect(await screen.findByText(texts.errors.course.NOT_FOUND)).toBeInTheDocument();
      expect(listSubjects).toHaveBeenCalledOnce();
    });

    it('says that only administrators can create subjects on a 403', async () => {
      const user = userEvent.setup();
      create.mockResolvedValue({ status: 'forbidden' });
      renderPage();
      await fillValid(user);

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.forbidden);
    });

    it('shows a general alert, keeping what was typed, on any other failure', async () => {
      const user = userEvent.setup();
      create.mockResolvedValue({ status: 'unavailable' });
      renderPage();
      await fillValid(user);

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.unavailable);
      expect(nameField()).toHaveValue('Inglés');
      expect(saveButton()).toBeEnabled();
    });

    it('does nothing of its own when the session is no longer valid: the layout redirects', async () => {
      const user = userEvent.setup();
      create.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();
      await fillValid(user);

      await user.click(saveButton());

      await waitFor(() => {
        expect(create).toHaveBeenCalledOnce();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByTestId('destination')).not.toBeInTheDocument();
    });

    it('does not ask the server when the form is not valid', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByRole('checkbox', { name: '1º Primaria' });

      await user.click(saveButton());

      expect(create).not.toHaveBeenCalled();
      expect(screen.getByText(texts.errors.name.REQUIRED)).toBeInTheDocument();
    });
  });
});
