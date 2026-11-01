import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { coursesService, type Course, type UpdateCourseOutcome } from '../services/coursesService';
import { professorsService, type Professor } from '../services/professorsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { EditCoursePage } from './EditCoursePage';

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

const course: Course = {
  id: 'c1',
  name: '1º Primaria',
  createdAt: '2026-10-19T09:30:00.000Z',
  studentCount: 0,
  classes: [
    { id: 'c1-A', name: 'A', tutor: null, studentCount: 0, assignmentCount: 0 },
    { id: 'c1-B', name: 'B', tutor: null, studentCount: 0, assignmentCount: 0 },
  ],
};

const form = es.courses.form;
const edit = es.courses.edit;

/** Muestra la ruta y el estado de la navegación para comprobar adónde va la página. */
function Destination() {
  const location = useLocation();
  const state: unknown = location.state;
  return <div data-testid="destination">{`${location.pathname} ${JSON.stringify(state)}`}</div>;
}

function renderPage({ strict = false, path = '/cursos/c1/editar' } = {}) {
  const tree = (
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Routes>
          <Route path="/cursos/:id/editar" element={<EditCoursePage />} />
          <Route path="/cursos" element={<Destination />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

const nameField = () => screen.getByLabelText(form.name);
const classField = (number: number) => screen.getByLabelText(`Clase ${String(number)}`);
const saveButton = () => screen.getByRole('button', { name: form.save });
const loaded = () => screen.findByRole('heading', { level: 1, name: edit.title });

describe('EditCoursePage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof coursesService.get>;
  let update: MockInstance<typeof coursesService.update>;
  let list: MockInstance<typeof professorsService.list>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi.spyOn(coursesService, 'get').mockResolvedValue({ status: 'loaded', course });
    update = vi
      .spyOn(coursesService, 'update')
      .mockResolvedValue({ status: 'updated', course: { ...course, name: '1º Primaria Tarde' } });
    // Sin profesores que elegir: la edición de estos tests no toca los tutores.
    list = vi
      .spyOn(professorsService, 'list')
      .mockResolvedValue({ status: 'loaded', professors: [] });
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    update.mockRestore();
    list.mockRestore();
  });

  describe('loading the course', () => {
    it('asks for the course of the address once, even in strict mode, and shows a status meanwhile', async () => {
      get.mockImplementation(() => new Promise(() => {}));

      renderPage({ strict: true });

      expect(await screen.findByRole('status')).toHaveTextContent(edit.loading);
      expect(get).toHaveBeenCalledTimes(1);
      expect(get.mock.calls[0]?.[1]).toBe('c1');
    });

    it('fills the form with the name and the classes of the course, with Save disabled', async () => {
      renderPage();

      await loaded();
      expect(nameField()).toHaveValue('1º Primaria');
      expect(classField(1)).toHaveValue('A');
      expect(classField(2)).toHaveValue('B');
      expect(saveButton()).toBeDisabled();
      expect(screen.getByRole('link', { name: form.cancel })).toHaveAttribute('href', '/cursos');
    });

    it('says that the course is not available, with a link to the list, on a 404', async () => {
      get.mockResolvedValue({ status: 'notFound' });

      renderPage();

      expect(await screen.findByText(edit.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: edit.backToCourses })).toHaveAttribute(
        'href',
        '/cursos',
      );
      expect(screen.queryByLabelText(form.name)).toBeNull();
    });

    it('shows an alert with "Reintentar" when the course cannot be loaded, and retries', async () => {
      get.mockResolvedValueOnce({ status: 'unavailable' });

      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(edit.loadError);
      await userEvent.click(screen.getByRole('button', { name: es.courses.retry }));
      await loaded();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('does nothing visible when the session is no longer valid (the layout redirects)', async () => {
      get.mockResolvedValue({ status: 'unauthenticated' });

      renderPage();

      await waitFor(() => {
        expect(get).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByLabelText(form.name)).toBeNull();
    });
  });

  describe('Save', () => {
    it('stays disabled for a space at the end or a change that is undone, and enables with a real change', async () => {
      renderPage();
      await loaded();

      await userEvent.type(nameField(), ' ');
      expect(saveButton()).toBeDisabled();

      await userEvent.type(classField(2), 'x');
      expect(saveButton()).toBeEnabled();
      await userEvent.type(classField(2), '{Backspace}');
      expect(saveButton()).toBeDisabled();
    });

    it('sends the id of the existing classes and none for the new one, then goes to the list with the notice', async () => {
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');
      await userEvent.clear(classField(1));
      await userEvent.type(classField(1), 'Grupo A');
      await userEvent.click(screen.getByRole('button', { name: form.addClass }));
      await userEvent.type(classField(3), 'C');

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(update).toHaveBeenCalledTimes(1);
      });
      expect(update.mock.calls[0]?.[1]).toBe('c1');
      expect(update.mock.calls[0]?.[2]).toEqual({
        name: '1º Primaria Tarde',
        classes: [
          { id: 'c1-A', name: 'Grupo A', tutorId: null },
          { id: 'c1-B', name: 'B', tutorId: null },
          { name: 'C', tutorId: null },
        ],
      });
      expect(await screen.findByTestId('destination')).toHaveTextContent(
        '/cursos {"courseUpdated":"1º Primaria Tarde"}',
      );
    });

    it('sends a single request when Save is pressed twice in a row, and disables it meanwhile', async () => {
      let resolve: (outcome: UpdateCourseOutcome) => void = () => undefined;
      update.mockReturnValue(
        new Promise<UpdateCourseOutcome>((done) => {
          resolve = done;
        }),
      );
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');

      await userEvent.dblClick(saveButton());

      expect(update).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: form.saving })).toBeDisabled();
      resolve({ status: 'updated', course });
      await screen.findByTestId('destination');
    });

    it('validates before sending: nothing is sent and the error shows under the field', async () => {
      renderPage();
      await loaded();
      await userEvent.clear(nameField());

      await userEvent.click(saveButton());

      expect(screen.getByText(form.errors.name.REQUIRED)).toBeVisible();
      expect(nameField()).toHaveFocus();
      expect(update).not.toHaveBeenCalled();
    });

    it('marks the fields that the server rejects, with the focus on the first', async () => {
      update.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'classes[1].name', code: 'INVALID_CHARACTERS' }],
      });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');

      await userEvent.click(saveButton());

      expect(await screen.findByText(form.errors.className.INVALID_CHARACTERS)).toBeVisible();
      expect(classField(2)).toHaveAttribute('aria-invalid', 'true');
      expect(classField(2)).toHaveFocus();
    });

    it('marks the name and gives it the focus when another course already has it', async () => {
      update.mockResolvedValue({ status: 'alreadyExists' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');

      await userEvent.click(saveButton());

      expect(await screen.findByText(form.errors.alreadyExists)).toBeVisible();
      expect(nameField()).toHaveFocus();
      expect(nameField()).toHaveValue('1º Primaria Tarde');
    });

    it('says that the course has changed, offers to reload it and shows the saved version after reloading', async () => {
      update.mockResolvedValue({ status: 'courseChanged' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');
      await userEvent.click(saveButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(edit.changed);
      expect(nameField()).toHaveValue('1º Primaria Tarde');

      get.mockResolvedValue({
        status: 'loaded',
        course: {
          ...course,
          name: 'Nombre ajeno',
          classes: [{ id: 'c1-A', name: 'A', tutor: null, studentCount: 0, assignmentCount: 0 }],
        },
      });
      await userEvent.click(screen.getByRole('button', { name: edit.reload }));

      await waitFor(() => {
        expect(nameField()).toHaveValue('Nombre ajeno');
      });
      expect(classField(1)).toHaveValue('A');
      expect(screen.queryByLabelText('Clase 2')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(saveButton()).toBeDisabled();
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('replaces the form with the "not available" message when saving gets a 404', async () => {
      update.mockResolvedValue({ status: 'notFound' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');

      await userEvent.click(saveButton());

      expect(await screen.findByText(edit.notFound)).toBeVisible();
      expect(screen.queryByLabelText(form.name)).toBeNull();
    });

    it('shows a general alert without technical details and keeps what was typed when saving fails', async () => {
      update.mockResolvedValue({ status: 'unavailable' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(edit.saveError);
      expect(nameField()).toHaveValue('1º Primaria Tarde');
      expect(saveButton()).toBeEnabled();
    });

    it('does not navigate or show anything when the session is no longer valid', async () => {
      update.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(update).toHaveBeenCalled();
      });
      expect(screen.queryByTestId('destination')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('students of the classes (US14_b)', () => {
    const withStudents: Course = {
      ...course,
      studentCount: 13,
      classes: [
        { id: 'c1-A', name: 'A', tutor: null, studentCount: 12, assignmentCount: 0 },
        { id: 'c1-B', name: 'B', tutor: null, studentCount: 0, assignmentCount: 0 },
      ],
    };

    it('shows the students of each class under its field, from the course that was loaded', async () => {
      get.mockResolvedValue({ status: 'loaded', course: withStudents });

      renderPage();
      await loaded();

      expect(screen.getByText('12 alumnos')).toBeVisible();
      expect(classField(1)).toHaveAccessibleDescription(/12 alumnos/);
      expect(classField(2)).not.toHaveAccessibleDescription();
      expect(saveButton()).toBeDisabled();
    });

    it('asks before removing the class with students, and saves without it once confirmed, sending no numbers', async () => {
      get.mockResolvedValue({ status: 'loaded', course: withStudents });
      renderPage();
      await loaded();

      await userEvent.click(screen.getByRole('button', { name: 'Quitar la clase 1' }));
      expect(await screen.findByRole('dialog', { name: '¿Quitar la clase A?' })).toHaveTextContent(
        'tiene 12 alumnos',
      );
      expect(update).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole('button', { name: form.removeDialog.confirm }));
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(update).toHaveBeenCalledOnce();
      });
      expect(update.mock.calls[0]?.[2]).toEqual({
        name: '1º Primaria',
        classes: [{ id: 'c1-B', name: 'B', tutorId: null }],
      });
    });

    it('uses the numbers of the course that is loaded again after reloading', async () => {
      get.mockResolvedValue({ status: 'loaded', course: withStudents });
      update.mockResolvedValue({ status: 'courseChanged' });
      renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');
      await userEvent.click(saveButton());
      await screen.findByRole('alert');

      get.mockResolvedValue({
        status: 'loaded',
        course: {
          ...withStudents,
          classes: [
            { id: 'c1-A', name: 'A', tutor: null, studentCount: 3, assignmentCount: 0 },
            { id: 'c1-B', name: 'B', tutor: null, studentCount: 0, assignmentCount: 0 },
          ],
        },
      });
      await userEvent.click(screen.getByRole('button', { name: edit.reload }));

      expect(await screen.findByText('3 alumnos')).toBeVisible();
      expect(screen.queryByText('12 alumnos')).toBeNull();
    });

    it('asks nothing for a course without students', async () => {
      renderPage();
      await loaded();

      await userEvent.click(screen.getByRole('button', { name: 'Quitar la clase 1' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(classField(1)).toHaveValue('B');
    });
  });

  describe('tutors of the classes while the professors are not available (read only)', () => {
    const tutored: Course = {
      ...course,
      classes: [
        {
          id: 'c1-A',
          name: 'A',
          tutor: { id: 'p1', firstName: 'Ana', lastName: 'García' },
          studentCount: 0,
          assignmentCount: 0,
        },
        { id: 'c1-B', name: 'B', tutor: null, studentCount: 0, assignmentCount: 0 },
      ],
    };

    it('shows the tutor of each class, or "no tutor", next to its field', async () => {
      list.mockResolvedValue({ status: 'unavailable' });
      get.mockResolvedValue({ status: 'loaded', course: tutored });
      renderPage();
      await loaded();

      expect(screen.getByText('Tutor: Ana García')).toBeVisible();
      expect(screen.getByText(es.courses.noTutor)).toBeVisible();
    });

    it('does not enable Save, and does not send the tutors when something else changes', async () => {
      list.mockResolvedValue({ status: 'unavailable' });
      get.mockResolvedValue({ status: 'loaded', course: tutored });
      renderPage();
      await loaded();
      expect(saveButton()).toBeDisabled();

      await userEvent.type(nameField(), ' Tarde');
      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(update).toHaveBeenCalledTimes(1);
      });
      expect(update.mock.calls[0]?.[2]).toEqual({
        name: '1º Primaria Tarde',
        classes: [
          { id: 'c1-A', name: 'A' },
          { id: 'c1-B', name: 'B' },
        ],
      });
    });

    it('has no WCAG violations with tutors', async () => {
      get.mockResolvedValue({ status: 'loaded', course: tutored });
      const { container } = renderPage();
      await loaded();

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('accessibility', () => {
    it('has no WCAG violations loaded', async () => {
      const { container } = renderPage();
      await loaded();

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations with validation errors', async () => {
      const { container } = renderPage();
      await loaded();
      await userEvent.clear(nameField());
      await userEvent.click(saveButton());

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations with the course not available', async () => {
      get.mockResolvedValue({ status: 'notFound' });
      const { container } = renderPage();
      await screen.findByText(edit.notFound);

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations with the course changed', async () => {
      update.mockResolvedValue({ status: 'courseChanged' });
      const { container } = renderPage();
      await loaded();
      await userEvent.type(nameField(), ' Tarde');
      await userEvent.click(saveButton());
      await screen.findByRole('alert');

      expect(await wcagViolations(container)).toEqual([]);
    });
  });
});

describe('EditCoursePage choosing the tutors', () => {
  const ANA = '0192f5a0-0000-7000-8000-0000000000f1';
  const LUIS = '0192f5a0-0000-7000-8000-0000000000f2';
  const MARTA = '0192f5a0-0000-7000-8000-0000000000f3';
  const tutoredCourse: Course = {
    ...course,
    classes: [
      {
        id: 'c1-A',
        name: 'A',
        tutor: { id: ANA, firstName: 'Ana', lastName: 'García' },
        studentCount: 0,
        assignmentCount: 0,
      },
      { id: 'c1-B', name: 'B', tutor: null, studentCount: 0, assignmentCount: 0 },
    ],
  };
  const professor = (
    id: string,
    firstName: string,
    lastName: string,
    tutoredClass: Professor['tutoredClass'] = null,
  ): Professor => ({
    id,
    firstName,
    lastName,
    position: null,
    subjects: [],
    unavailableCount: 0,
    tutoredClass,
  });
  const professors: Professor[] = [
    professor(ANA, 'Ana', 'García', {
      id: 'c1-A',
      name: 'A',
      courseId: 'c1',
      courseName: '1º Primaria',
    }),
    professor(LUIS, 'Luis', 'Pérez'),
    professor(MARTA, 'Marta', 'Sanz', {
      id: 'c2-A',
      name: 'A',
      courseId: 'c2',
      courseName: '2º Primaria',
    }),
  ];

  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof coursesService.get>;
  let update: MockInstance<typeof coursesService.update>;
  let list: MockInstance<typeof professorsService.list>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi
      .spyOn(coursesService, 'get')
      .mockResolvedValue({ status: 'loaded', course: tutoredCourse });
    update = vi
      .spyOn(coursesService, 'update')
      .mockResolvedValue({ status: 'updated', course: tutoredCourse });
    list = vi.spyOn(professorsService, 'list').mockResolvedValue({ status: 'loaded', professors });
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    update.mockRestore();
    list.mockRestore();
  });

  const tutorSelect = (number: number) =>
    screen.findByRole('combobox', { name: `Tutor de la clase ${String(number)}` });
  const optionTexts = (select: HTMLElement) =>
    within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);

  it('asks for the professors once, even in strict mode', async () => {
    renderPage({ strict: true });

    await tutorSelect(1);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('offers "Sin tutor", the professors without a class and those of this course with their class, never those of another course', async () => {
    renderPage();

    const select = await tutorSelect(2);

    expect(optionTexts(select)).toEqual([form.noTutorOption, 'Ana García · clase A', 'Luis Pérez']);
    expect(await tutorSelect(1)).toHaveValue(ANA);
    expect(select).toHaveValue('');
  });

  it('sends the chosen tutors with the course, null for the class left without one', async () => {
    renderPage();
    await userEvent.selectOptions(await tutorSelect(1), '');
    await userEvent.selectOptions(await tutorSelect(2), LUIS);

    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update.mock.calls[0]?.[2]).toEqual({
      name: '1º Primaria',
      classes: [
        { id: 'c1-A', name: 'A', tutorId: null },
        { id: 'c1-B', name: 'B', tutorId: LUIS },
      ],
    });
  });

  it('shows the tutor as read only with a notice and "Reintentar" when the professors fail, and shows the selects after retrying', async () => {
    list.mockResolvedValueOnce({ status: 'unavailable' });
    renderPage();

    expect(await screen.findByText(form.professorsUnavailable)).toBeVisible();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Tutor: Ana García')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: form.professorsRetry }));

    expect(await tutorSelect(1)).toHaveValue(ANA);
    expect(screen.queryByText(form.professorsUnavailable)).not.toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('still saves the course without touching the tutors while the professors are not available', async () => {
    list.mockResolvedValue({ status: 'unavailable' });
    renderPage();
    await screen.findByText(form.professorsUnavailable);
    await userEvent.type(nameField(), ' Tarde');

    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update.mock.calls[0]?.[2]).toEqual({
      name: '1º Primaria Tarde',
      classes: [
        { id: 'c1-A', name: 'A' },
        { id: 'c1-B', name: 'B' },
      ],
    });
  });

  it('on a 409 PROFESSOR_ALREADY_TUTOR warns, asks for the professors again and marks the row of the professor that is gone', async () => {
    update.mockResolvedValue({ status: 'professorAlreadyTutor' });
    renderPage();
    await userEvent.selectOptions(await tutorSelect(2), LUIS);
    // Mientras se editaba, otra persona hizo tutor de otro curso a Luis.
    list.mockResolvedValue({
      status: 'loaded',
      professors: [
        professors[0] as Professor,
        professor(LUIS, 'Luis', 'Pérez', {
          id: 'c2-B',
          name: 'B',
          courseId: 'c2',
          courseName: '2º Primaria',
        }),
      ],
    });

    await userEvent.click(saveButton());

    expect(await screen.findByText(form.errors.professorAlreadyTutor)).toBeVisible();
    expect(list).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(form.errors.tutorId.ALREADY_TUTOR)).toBeVisible();
    expect(await tutorSelect(2)).toHaveAttribute('aria-invalid', 'true');
    expect(await tutorSelect(2)).toHaveFocus();
    expect(await tutorSelect(1)).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('has no accessibility violations when the professors are not available', async () => {
    list.mockResolvedValue({ status: 'unavailable' });
    const { container } = renderPage();
    await screen.findByText(form.professorsUnavailable);

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no accessibility violations with the selects', async () => {
    const { container } = renderPage();
    await tutorSelect(1);

    expect(await wcagViolations(container)).toEqual([]);
  });
});
