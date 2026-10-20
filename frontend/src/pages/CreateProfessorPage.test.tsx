import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { coursesService, type Course, type CoursesOutcome } from '../services/coursesService';
import {
  professorsService,
  type CreateProfessorOutcome,
  type Professor,
} from '../services/professorsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { CreateProfessorPage } from './CreateProfessorPage';

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

const CLASS_1A = '0192f5a0-0000-7000-8000-0000000000e1';
const CLASS_1B = '0192f5a0-0000-7000-8000-0000000000e2';
const CLASS_2A = '0192f5a0-0000-7000-8000-0000000000e3';

const TUTOR = { id: 'p0', firstName: 'Eva', lastName: 'Ruiz' };

function course(id: string, name: string, classes: Course['classes']): Course {
  return { id, name, createdAt: '2026-10-19T09:30:00.000Z', classes };
}

const courses: Course[] = [
  course('c1', '1º Primaria', [
    { id: CLASS_1A, name: 'A', tutor: null },
    { id: CLASS_1B, name: 'B', tutor: TUTOR },
  ]),
  course('c2', '2º Primaria', [{ id: CLASS_2A, name: 'A', tutor: null }]),
  course('c3', '3º Primaria', [{ id: 'x', name: 'A', tutor: TUTOR }]),
];

const created: Professor = {
  id: 'p1',
  firstName: 'Ana',
  lastName: 'García',
  position: null,
  subjects: [],
  tutoredClass: null,
};

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

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

describe('CreateProfessorPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let listCourses: MockInstance<typeof coursesService.list>;
  let create: MockInstance<typeof professorsService.create>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    listCourses = vi.spyOn(coursesService, 'list').mockResolvedValue({ status: 'loaded', courses });
    create = vi.spyOn(professorsService, 'create');
  });

  afterEach(async () => {
    refresh.mockRestore();
    listCourses.mockRestore();
    create.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/profesores/nuevo']}>
        <SessionProvider>
          <Routes>
            <Route path="/profesores/nuevo" element={<CreateProfessorPage />} />
            <Route path="/profesores" element={<Destination />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>,
    );
  }

  const firstName = () => screen.findByLabelText(es.professors.form.firstName);
  const lastName = () => screen.getByLabelText(es.professors.form.lastName);
  const position = () => screen.getByLabelText(es.professors.form.position);
  const classSelect = () => screen.getByLabelText(es.professors.form.class);
  const save = () => screen.getByRole('button', { name: es.professors.form.save });

  async function fill(first = 'Ana', last = 'García') {
    await userEvent.type(await firstName(), first);
    await userEvent.type(lastName(), last);
  }

  describe('form', () => {
    it('shows first name, last name, position and class, with the title and the Cancel link', async () => {
      renderPage();

      expect(await firstName()).toHaveValue('');
      expect(lastName()).toHaveValue('');
      expect(position()).toHaveValue('');
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(es.professors.form.title);
      expect(screen.getByRole('link', { name: es.professors.form.cancel })).toHaveAttribute(
        'href',
        '/profesores',
      );
    });

    it('offers the positions, with "no position" as the default', async () => {
      renderPage();
      await firstName();

      expect(
        within(position())
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([
        es.professors.form.positionNone,
        es.professors.positions.DIRECTOR,
        es.professors.positions.JEFE_ESTUDIOS,
      ]);
    });

    it('offers only the free classes, grouped by course, and no course without free classes', async () => {
      renderPage();

      await waitFor(() => {
        expect(classSelect()).toBeEnabled();
      });
      const groups = within(classSelect()).getAllByRole('group');
      expect(groups.map((group) => group.getAttribute('label'))).toEqual([
        '1º Primaria',
        '2º Primaria',
      ]);
      expect(
        within(groups[0] as HTMLElement)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['A']);
      expect(
        within(classSelect())
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([es.professors.form.classNone, 'A', 'A']);
      expect(classSelect()).toHaveValue('');
    });

    it('disables the class and says so while the courses load', async () => {
      listCourses.mockReturnValue(new Promise<CoursesOutcome>(() => undefined));

      renderPage();

      expect(await screen.findByText(es.professors.form.classesLoading)).toBeInTheDocument();
      expect(classSelect()).toBeDisabled();
      expect(save()).toBeEnabled();
    });

    it('asks for the courses once', async () => {
      renderPage();
      await waitFor(() => {
        expect(classSelect()).toBeEnabled();
      });

      expect(listCourses).toHaveBeenCalledTimes(1);
    });

    it('disables the class and says there are no free classes when all of them have a tutor', async () => {
      listCourses.mockResolvedValue({ status: 'loaded', courses: [courses[2] as Course] });

      renderPage();

      expect(await screen.findByText(es.professors.form.noFreeClasses)).toBeInTheDocument();
      expect(classSelect()).toBeDisabled();
    });

    it('disables the class and says there are no courses when the school has none', async () => {
      listCourses.mockResolvedValue({ status: 'loaded', courses: [] });

      renderPage();

      expect(await screen.findByText(es.professors.form.noCourses)).toBeInTheDocument();
      expect(classSelect()).toBeDisabled();
    });

    it('disables the class with a notice when the courses cannot be loaded, and still lets the professor be created', async () => {
      listCourses.mockResolvedValue({ status: 'unavailable' });
      create.mockResolvedValue({ status: 'created', professor: created });
      renderPage();

      expect(await screen.findByText(es.professors.form.classesLoadError)).toBeInTheDocument();
      expect(classSelect()).toBeDisabled();
      await fill();
      await userEvent.click(save());

      await waitFor(() => {
        expect(create).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('validation before sending', () => {
    it('shows the error of each invalid field, focuses the first one and sends nothing', async () => {
      renderPage();
      await userEvent.type(await firstName(), '<b>');

      await userEvent.click(save());

      expect(
        await screen.findByText(es.professors.form.errors.firstName.INVALID_CHARACTERS),
      ).toBeInTheDocument();
      expect(screen.getByText(es.professors.form.errors.lastName.REQUIRED)).toBeInTheDocument();
      expect(await firstName()).toHaveFocus();
      expect(await firstName()).toHaveAttribute('aria-invalid', 'true');
      expect(create).not.toHaveBeenCalled();
    });

    it('focuses the last name when only it is invalid', async () => {
      renderPage();
      await userEvent.type(await firstName(), 'Ana');

      await userEvent.click(save());

      expect(await screen.findByText(es.professors.form.errors.lastName.REQUIRED)).toBeVisible();
      expect(lastName()).toHaveFocus();
    });

    it('clears the error of a field when it is edited', async () => {
      renderPage();
      await userEvent.click(save());
      await screen.findByText(es.professors.form.errors.firstName.REQUIRED);

      await userEvent.type(await firstName(), 'A');

      expect(
        screen.queryByText(es.professors.form.errors.firstName.REQUIRED),
      ).not.toBeInTheDocument();
    });
  });

  describe('sending', () => {
    it('sends the values and goes back to the list with the name of the professor', async () => {
      create.mockResolvedValue({ status: 'created', professor: created });
      renderPage();
      await fill('  Ana  ', 'García');
      await userEvent.selectOptions(position(), 'DIRECTOR');
      await waitFor(() => {
        expect(classSelect()).toBeEnabled();
      });
      await userEvent.selectOptions(classSelect(), CLASS_2A);

      await userEvent.click(save());

      expect(create).toHaveBeenCalledWith(expect.any(Function), {
        firstName: '  Ana  ',
        lastName: 'García',
        position: 'DIRECTOR',
        classId: CLASS_2A,
      });
      const destination = await screen.findByTestId('destination');
      expect(destination).toHaveTextContent('/profesores');
      expect(destination).toHaveTextContent('"professorCreated":"Ana García"');
    });

    it('sends no position and no class when they are left empty', async () => {
      create.mockResolvedValue({ status: 'created', professor: created });
      renderPage();
      await fill();

      await userEvent.click(save());

      expect(create).toHaveBeenCalledWith(expect.any(Function), {
        firstName: 'Ana',
        lastName: 'García',
        position: '',
        classId: '',
      });
    });

    it('sends a single request when "Guardar" is pressed twice in a row, and disables it meanwhile', async () => {
      let finish: (outcome: CreateProfessorOutcome) => void = () => undefined;
      create.mockReturnValue(
        new Promise<CreateProfessorOutcome>((resolve) => {
          finish = resolve;
        }),
      );
      renderPage();
      await fill();

      await userEvent.dblClick(save());

      expect(create).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('button', { name: es.professors.form.saving })).toBeDisabled();
      finish({ status: 'created', professor: created });
      expect(await screen.findByTestId('destination')).toBeInTheDocument();
    });

    it('shows the errors that the server reports per field, with the focus on the first', async () => {
      create.mockResolvedValue({
        status: 'validationError',
        details: [
          { field: 'lastName', code: 'INVALID_LENGTH' },
          { field: 'classId', code: 'NOT_FOUND' },
        ],
      });
      renderPage();
      await fill();

      await userEvent.click(save());

      expect(
        await screen.findByText(
          es.professors.form.errors.lastName.INVALID_LENGTH.replace('{{max}}', '100'),
        ),
      ).toBeInTheDocument();
      expect(screen.getByText(es.professors.form.errors.classId.NOT_FOUND)).toBeInTheDocument();
      expect(lastName()).toHaveFocus();
    });

    it('marks the class and focuses it when it already has a tutor, keeping what was typed', async () => {
      create.mockResolvedValue({ status: 'classHasTutor' });
      renderPage();
      await fill();
      await waitFor(() => {
        expect(classSelect()).toBeEnabled();
      });
      await userEvent.selectOptions(classSelect(), CLASS_1A);

      await userEvent.click(save());

      expect(
        await screen.findByText(es.professors.form.errors.classId.alreadyHasTutor),
      ).toBeInTheDocument();
      expect(classSelect()).toHaveFocus();
      expect(classSelect()).toHaveAttribute('aria-invalid', 'true');
      expect(await firstName()).toHaveValue('Ana');
      expect(save()).toBeEnabled();
    });

    it('shows a general error and keeps what was typed when the server is not available', async () => {
      create.mockResolvedValue({ status: 'unavailable' });
      renderPage();
      await fill();

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(
        es.professors.form.errors.unavailable,
      );
      expect(await firstName()).toHaveValue('Ana');
      expect(save()).toBeEnabled();
    });

    it('does nothing more when the session is no longer valid', async () => {
      create.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();
      await fill();

      await userEvent.click(save());

      await waitFor(() => {
        expect(create).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has no WCAG violations empty, with errors, and without free classes', async () => {
      const empty = renderPage();
      await waitFor(() => {
        expect(classSelect()).toBeEnabled();
      });
      expect(await wcagViolations(empty.container)).toEqual([]);

      await userEvent.click(save());
      await screen.findByText(es.professors.form.errors.firstName.REQUIRED);
      expect(await wcagViolations(empty.container)).toEqual([]);
      empty.unmount();

      listCourses.mockResolvedValue({ status: 'loaded', courses: [courses[2] as Course] });
      const noFree = renderPage();
      await screen.findByText(es.professors.form.noFreeClasses);
      expect(await wcagViolations(noFree.container)).toEqual([]);
    });
  });
});
