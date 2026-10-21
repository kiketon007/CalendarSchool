import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { coursesService, type Course } from '../services/coursesService';
import { professorsService, type Professor } from '../services/professorsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { EditProfessorPage } from './EditProfessorPage';

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

const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';
const CLASS_1A = '0192f5a0-0000-7000-8000-0000000000e1';
const CLASS_1B = '0192f5a0-0000-7000-8000-0000000000e2';
const CLASS_2A = '0192f5a0-0000-7000-8000-0000000000e3';
const LUIS = { id: '0192f5a0-0000-7000-8000-0000000000f2', firstName: 'Luis', lastName: 'Pérez' };

const ana: Professor = {
  id: PROFESSOR_ID,
  firstName: 'Ana',
  lastName: 'García',
  position: 'DIRECTOR',
  subjects: [],
  tutoredClass: { id: CLASS_1A, name: 'A', courseId: 'c1', courseName: '1º Primaria' },
};

const courses: Course[] = [
  {
    id: 'c1',
    name: '1º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    classes: [
      {
        id: CLASS_1A,
        name: 'A',
        tutor: { id: PROFESSOR_ID, firstName: 'Ana', lastName: 'García' },
      },
      { id: CLASS_1B, name: 'B', tutor: null },
    ],
  },
  {
    id: 'c2',
    name: '2º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    classes: [{ id: CLASS_2A, name: 'A', tutor: LUIS }],
  },
];

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

function Destination() {
  const location = useLocation();
  return (
    <div data-testid="destination">
      {location.pathname} {JSON.stringify(location.state as unknown)}
    </div>
  );
}

describe('EditProfessorPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof professorsService.get>;
  let update: MockInstance<typeof professorsService.update>;
  let listCourses: MockInstance<typeof coursesService.list>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    get = vi
      .spyOn(professorsService, 'get')
      .mockResolvedValue({ status: 'loaded', professor: ana });
    update = vi
      .spyOn(professorsService, 'update')
      .mockResolvedValue({ status: 'updated', professor: ana, replacedTutor: null });
    listCourses = vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses });
  });

  afterEach(async () => {
    refresh.mockRestore();
    get.mockRestore();
    update.mockRestore();
    listCourses.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderPage(id = PROFESSOR_ID, strict = false) {
    const tree = (
      <MemoryRouter initialEntries={[`/profesores/${id}/editar`]}>
        <SessionProvider>
          <Routes>
            <Route path="/profesores/:id/editar" element={<EditProfessorPage />} />
            <Route path="/profesores" element={<Destination />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const firstName = () => screen.findByLabelText(es.professors.form.firstName);
  const classSelect = () => screen.getByLabelText(es.professors.form.class);
  const save = () => screen.getByRole('button', { name: es.professors.form.save });

  it('asks for the professor and the courses once, even in strict mode', async () => {
    renderPage(PROFESSOR_ID, true);

    await firstName();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[1]).toBe(PROFESSOR_ID);
    expect(listCourses).toHaveBeenCalledTimes(1);
  });

  it('shows a loading status while the professor loads', async () => {
    get.mockReturnValue(new Promise(() => undefined));
    renderPage();

    expect(await screen.findByText(es.professors.edit.loading)).toBeVisible();
  });

  it('shows the title and the form with the professor loaded, and Save disabled', async () => {
    renderPage();

    expect(await firstName()).toHaveValue('Ana');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(es.professors.edit.title);
    expect(screen.getByLabelText(es.professors.form.lastName)).toHaveValue('García');
    expect(screen.getByLabelText(es.professors.form.position)).toHaveValue('DIRECTOR');
    await waitFor(() => {
      expect(classSelect()).toHaveValue(CLASS_1A);
    });
    expect(save()).toBeDisabled();
    expect(screen.getByRole('link', { name: es.professors.form.cancel })).toHaveAttribute(
      'href',
      '/profesores',
    );
  });

  it('shows the not available view with a link to the list for a 404', async () => {
    get.mockResolvedValue({ status: 'notFound' });
    renderPage();

    expect(await screen.findByText(es.professors.edit.notFound)).toBeVisible();
    expect(screen.getByRole('link', { name: es.professors.title })).toHaveAttribute(
      'href',
      '/profesores',
    );
    expect(screen.queryByLabelText(es.professors.form.firstName)).not.toBeInTheDocument();
  });

  it('shows an error with Retry when the professor cannot be loaded, and asks again', async () => {
    get.mockResolvedValueOnce({ status: 'unavailable' });
    renderPage();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(es.professors.edit.loadError);
    await userEvent.click(screen.getByRole('button', { name: es.professors.retry }));

    expect(await firstName()).toHaveValue('Ana');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('saves the final values and goes back to the list with the notice', async () => {
    renderPage();
    await userEvent.type(await firstName(), 'María');

    await userEvent.click(save());

    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update.mock.calls[0]?.[1]).toBe(PROFESSOR_ID);
    expect(update.mock.calls[0]?.[2]).toEqual({
      firstName: 'AnaMaría',
      lastName: 'García',
      position: 'DIRECTOR',
      classId: CLASS_1A,
    });
    const destination = await screen.findByTestId('destination');
    expect(destination).toHaveTextContent('/profesores');
    expect(destination).toHaveTextContent('"professorUpdated":"Ana García"');
    expect(destination).not.toHaveTextContent('replacedTutor');
  });

  it('passes the name of the replaced tutor for the notice', async () => {
    update.mockResolvedValue({ status: 'updated', professor: ana, replacedTutor: LUIS });
    renderPage();
    await firstName();
    await waitFor(() => {
      expect(classSelect()).toHaveValue(CLASS_1A);
    });
    await userEvent.selectOptions(classSelect(), CLASS_2A);
    expect(screen.getByText(/dejará de ser tutor de 2º Primaria A/)).toBeVisible();

    await userEvent.click(save());

    const destination = await screen.findByTestId('destination');
    expect(destination).toHaveTextContent('"replacedTutor":"Luis Pérez"');
  });

  it('does not send the class when the courses are not available, so the tutorship is not touched', async () => {
    listCourses.mockResolvedValue({ status: 'unavailable' });
    renderPage();
    await userEvent.type(await firstName(), 'x');
    await waitFor(() => {
      expect(classSelect()).toBeDisabled();
    });

    await userEvent.click(save());

    await waitFor(() => {
      expect(update).toHaveBeenCalledOnce();
    });
    expect(update.mock.calls[0]?.[2]).toEqual({
      firstName: 'Anax',
      lastName: 'García',
      position: 'DIRECTOR',
    });
  });

  it('shows the not available view when the professor no longer exists at save time', async () => {
    update.mockResolvedValue({ status: 'notFound' });
    renderPage();
    await userEvent.type(await firstName(), 'x');

    await userEvent.click(save());

    expect(await screen.findByText(es.professors.edit.notFound)).toBeVisible();
  });

  it('marks the fields of a 400 and keeps what was typed', async () => {
    update.mockResolvedValue({
      status: 'validationError',
      details: [{ field: 'classId', code: 'NOT_FOUND' }],
    });
    renderPage();
    await userEvent.type(await firstName(), 'x');
    await waitFor(() => {
      expect(classSelect()).toBeEnabled();
    });

    await userEvent.click(save());

    expect(await screen.findByText(es.professors.form.errors.classId.NOT_FOUND)).toBeVisible();
    expect(screen.getByLabelText(es.professors.form.firstName)).toHaveValue('Anax');
  });

  it('shows the general error with role alert, keeps what was typed and allows retrying', async () => {
    update.mockResolvedValueOnce({ status: 'unavailable' });
    renderPage();
    await userEvent.type(await firstName(), 'x');

    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent(es.professors.edit.saveError);
    expect(screen.getByLabelText(es.professors.form.firstName)).toHaveValue('Anax');
    await userEvent.click(save());
    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(2);
    });
  });

  it('has no accessibility violations loading, loaded, not available and with an error', async () => {
    get.mockReturnValueOnce(new Promise(() => undefined));
    const loading = renderPage();
    await screen.findByText(es.professors.edit.loading);
    expect(await wcagViolations(loading.container)).toEqual([]);
    loading.unmount();

    const loaded = renderPage();
    await firstName();
    await waitFor(() => {
      expect(classSelect()).toBeEnabled();
    });
    expect(await wcagViolations(loaded.container)).toEqual([]);
    loaded.unmount();

    get.mockResolvedValue({ status: 'notFound' });
    const missing = renderPage();
    await screen.findByText(es.professors.edit.notFound);
    expect(await wcagViolations(missing.container)).toEqual([]);
  });
});
