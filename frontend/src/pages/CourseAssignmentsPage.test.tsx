import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { components } from '../api/generated/schema';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  courseAssignmentsService,
  type CourseAssignments,
  type UpdateCourseAssignmentsOutcome,
} from '../services/courseAssignmentsService';
import { professorsService } from '../services/professorsService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import { CourseAssignmentsPage } from './CourseAssignmentsPage';

type Professor = components['schemas']['Professor'];

const texts = es.assignments;
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const DESKTOP = 1280;
const PHONE = 360;

function sessionOf(role: 'ADMIN' | 'MEMBER'): SessionData {
  return {
    session: { accessToken: 'signed.access.token', expiresIn: 900 },
    user: {
      id: '0192f5a0-0000-7000-8000-0000000000a1',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García-López',
      role,
    },
    school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
  };
}

const professor = (id: string, firstName: string, lastName: string): Professor => ({
  id,
  firstName,
  lastName,
  position: null,
  subjects: [],
  unavailableCount: 0,
  tutoredClass: null,
});

/** Ya en el orden del servicio: apellido y después nombre. */
const PROFESSORS = [
  professor('p-ana', 'Ana', 'García'),
  professor('p-luis', 'Luis', 'Pérez'),
  professor('p-eva', 'Eva', 'Ruiz'),
];

const MATRIX: CourseAssignments = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  subjects: [
    {
      id: 's-eng',
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
      sessionsPerWeek: 3,
    },
    {
      id: 's-lan',
      name: 'Lengua',
      code: null,
      color: 'green',
      status: 'ACTIVE',
      sessionsPerWeek: 5,
    },
    {
      id: 's-rel',
      name: 'Religión',
      code: null,
      color: 'red',
      status: 'INACTIVE',
      sessionsPerWeek: 1,
    },
  ],
  classes: [
    { id: 'k-a', name: 'A', tutor: { id: 'p-ana', firstName: 'Ana', lastName: 'García' } },
    { id: 'k-b', name: 'B', tutor: null },
  ],
  assignments: [],
};

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

const selectName = (subject: string, schoolClass: string) =>
  texts.select.replace('{{subject}}', subject).replace('{{class}}', schoolClass);
const cell = (subject: string, schoolClass: string) =>
  screen.getByRole('combobox', { name: selectName(subject, schoolClass) });
const saveButton = () => screen.getByRole('button', { name: texts.save });
const tutorButton = (schoolClass: string) =>
  screen.getByRole('button', { name: texts.assignTutorLabel.replace('{{class}}', schoolClass) });

describe('CourseAssignmentsPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let getMatrix: MockInstance<typeof courseAssignmentsService.get>;
  let update: MockInstance<typeof courseAssignmentsService.update>;
  let listProfessors: MockInstance<typeof professorsService.list>;
  let media: MatchMediaControl;

  function signInAs(role: 'ADMIN' | 'MEMBER') {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
  }

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    signInAs('ADMIN');
    getMatrix = vi
      .spyOn(courseAssignmentsService, 'get')
      .mockResolvedValue({ status: 'loaded', assignments: MATRIX });
    update = vi.spyOn(courseAssignmentsService, 'update');
    listProfessors = vi
      .spyOn(professorsService, 'list')
      .mockResolvedValue({ status: 'loaded', professors: PROFESSORS });
    media = installMatchMedia(DESKTOP);
  });

  afterEach(async () => {
    refresh.mockRestore();
    getMatrix.mockRestore();
    update.mockRestore();
    listProfessors.mockRestore();
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderPage(width = DESKTOP, strict = false) {
    media.setWidth(width);
    const tree = (
      <MemoryRouter initialEntries={[`/cursos/${COURSE_ID}/profesores`]}>
        <SessionProvider>
          <Routes>
            <Route path="/cursos/:id/profesores" element={<CourseAssignmentsPage />} />
            <Route path="/cursos" element={<div data-testid="courses-page" />} />
            <Route path="/cursos/:id/carga" element={<div data-testid="workload-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  async function ready(width = DESKTOP) {
    await screen.findByRole('heading', { level: 1 });
    await screen.findByRole(width === DESKTOP ? 'table' : 'list');
  }

  function respondToUpdate(outcome: UpdateCourseAssignmentsOutcome) {
    update.mockResolvedValue(outcome);
  }
  const storing = (
    assignments: CourseAssignments['assignments'],
  ): UpdateCourseAssignmentsOutcome => ({
    status: 'updated',
    assignments: { ...MATRIX, assignments },
  });

  describe('loading', () => {
    it('asks for the matrix and for the professors once, also in strict mode', async () => {
      renderPage(DESKTOP, true);

      expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
      await ready();

      expect(getMatrix).toHaveBeenCalledTimes(1);
      expect(listProfessors).toHaveBeenCalledTimes(1);
      expect(getMatrix.mock.calls[0]?.[1]).toBe(COURSE_ID);
    });

    it('shows the title with the name of the course', async () => {
      renderPage();

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Profesores de 1º Primaria' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('course-assignments-page')).toBeInTheDocument();
    });

    it.each([
      ['the matrix', () => getMatrix.mockResolvedValue({ status: 'unavailable' })],
      ['the professors', () => listProfessors.mockResolvedValue({ status: 'unavailable' })],
    ])('shows an alert with a button to retry when %s fails', async (_name, fail) => {
      const user = userEvent.setup();
      fail();
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);

      getMatrix.mockResolvedValue({ status: 'loaded', assignments: MATRIX });
      listProfessors.mockResolvedValue({ status: 'loaded', professors: PROFESSORS });
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await screen.findByRole('table')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says that the course does not exist when it is not found, with a link back', async () => {
      const user = userEvent.setup();
      getMatrix.mockResolvedValue({ status: 'notFound' });
      renderPage();

      expect(await screen.findByRole('heading', { name: texts.notFound })).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: texts.backToCourses }));
      expect(screen.getByTestId('courses-page')).toBeInTheDocument();
    });

    it('shows nothing of its own when the session is no longer valid: the layout redirects', async () => {
      getMatrix.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();

      await waitFor(() => {
        expect(getMatrix).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('the matrix on a wide screen', () => {
    it('has a column per class and a row per subject, with its sessions, its code and "Inactive"', async () => {
      renderPage();
      const table = await screen.findByRole('table', {
        name: 'Profesores de cada asignatura en cada clase de 1º Primaria',
      });

      expect(
        within(table)
          .getAllByRole('columnheader')
          .map((header) => header.textContent),
      ).toEqual([
        texts.subject,
        `Clase A${texts.assignTutor}`,
        `Clase B${texts.assignTutor}${texts.noTutor.replace('{{class}}', 'B')}`,
      ]);
      const rows = within(table).getAllByRole('rowheader');
      expect(rows[0]).toHaveTextContent('Inglés');
      expect(rows[0]).toHaveTextContent('Código ING');
      expect(rows[0]).toHaveTextContent('3 sesiones');
      expect(rows[1]).toHaveTextContent('5 sesiones');
      expect(rows[2]).toHaveTextContent('1 sesión');
      expect(rows[2]).toHaveTextContent(texts.inactive);
    });

    it('offers in every cell "Unassigned" and the professors by last name, marking the tutor', async () => {
      renderPage();
      await ready();

      const options = within(cell('Inglés', 'A')).getAllByRole('option');
      expect(options.map((option) => option.textContent)).toEqual([
        texts.unassigned,
        'García, Ana · tutor/a de A',
        'Pérez, Luis',
        'Ruiz, Eva',
      ]);
      expect(cell('Inglés', 'A')).toHaveValue('');
      expect(
        within(cell('Inglés', 'B'))
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toContain('García, Ana');
    });

    it('shows the assigned professors', async () => {
      getMatrix.mockResolvedValue({
        status: 'loaded',
        assignments: {
          ...MATRIX,
          assignments: [{ subjectId: 's-lan', classId: 'k-b', professorId: 'p-luis' }],
        },
      });
      renderPage();
      await ready();

      expect(cell('Lengua', 'B')).toHaveValue('p-luis');
      expect(cell('Lengua', 'A')).toHaveValue('');
    });

    it('does not draw the cards', async () => {
      renderPage();
      await ready();

      expect(
        screen.queryByRole('list', { name: texts.caption.replace('{{course}}', '1º Primaria') }),
      ).not.toBeInTheDocument();
    });
  });

  describe('the cards on a phone', () => {
    it('draws a card per class with its subjects and no table', async () => {
      renderPage(PHONE);
      await ready(PHONE);

      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const cards = screen.getAllByRole('heading', { level: 2 });
      expect(cards.map((heading) => heading.textContent)).toEqual(['Clase A', 'Clase B']);
      expect(cell('Inglés', 'A')).toBeInTheDocument();
      expect(cell('Religión', 'B')).toBeInTheDocument();
      expect(screen.getAllByText('3 sesiones')).toHaveLength(2);
    });

    it('edits and saves from the cards', async () => {
      const user = userEvent.setup();
      respondToUpdate(storing([{ subjectId: 's-eng', classId: 'k-b', professorId: 'p-eva' }]));
      renderPage(PHONE);
      await ready(PHONE);

      await user.selectOptions(cell('Inglés', 'B'), 'p-eva');
      await user.click(saveButton());

      expect(update).toHaveBeenCalledExactlyOnceWith(expect.anything(), COURSE_ID, [
        { subjectId: 's-eng', classId: 'k-b', professorId: 'p-eva' },
      ]);
    });
  });

  describe('the counts', () => {
    it('says how many cells are without professor and that nobody teaches yet', async () => {
      renderPage();
      await ready();

      expect(screen.getByText('Sin profesor: 6 de 6')).toHaveClass('text-danger');
      expect(screen.queryByText(/^En este curso/)).not.toBeInTheDocument();
    });

    it('recalculates them while editing: the sessions of each professor in the course', async () => {
      const user = userEvent.setup();
      renderPage();
      await ready();

      await user.selectOptions(cell('Lengua', 'A'), 'p-ana');
      await user.selectOptions(cell('Inglés', 'A'), 'p-ana');
      await user.selectOptions(cell('Inglés', 'B'), 'p-eva');

      expect(screen.getByText('Sin profesor: 3 de 6')).toBeInTheDocument();
      expect(
        screen.getByText('En este curso: García, Ana 8 sesiones · Ruiz, Eva 3 sesiones'),
      ).toBeInTheDocument();
    });

    it('does not paint the missing count in red when nothing is missing', async () => {
      getMatrix.mockResolvedValue({
        status: 'loaded',
        assignments: {
          ...MATRIX,
          subjects: [MATRIX.subjects[0] as CourseAssignments['subjects'][number]],
          assignments: [
            { subjectId: 's-eng', classId: 'k-a', professorId: 'p-ana' },
            { subjectId: 's-eng', classId: 'k-b', professorId: 'p-ana' },
          ],
        },
      });
      renderPage();
      await ready();

      expect(screen.getByText('Sin profesor: 0 de 2')).not.toHaveClass('text-danger');
    });
  });

  describe('assign the tutor', () => {
    it('fills only the empty cells of the class with its tutor', async () => {
      const user = userEvent.setup();
      getMatrix.mockResolvedValue({
        status: 'loaded',
        assignments: {
          ...MATRIX,
          assignments: [{ subjectId: 's-lan', classId: 'k-a', professorId: 'p-luis' }],
        },
      });
      renderPage();
      await ready();

      await user.click(tutorButton('A'));

      expect(cell('Inglés', 'A')).toHaveValue('p-ana');
      expect(cell('Religión', 'A')).toHaveValue('p-ana');
      expect(cell('Lengua', 'A')).toHaveValue('p-luis');
      expect(cell('Inglés', 'B')).toHaveValue('');
      expect(saveButton()).toBeEnabled();
    });

    it('is disabled for a class without tutor and says why', async () => {
      renderPage();
      await ready();

      const button = tutorButton('B');
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(texts.noTutor.replace('{{class}}', 'B'));
      expect(tutorButton('A')).toBeEnabled();
    });
  });

  describe('saving', () => {
    it('enables saving only while the matrix differs from the saved one', async () => {
      const user = userEvent.setup();
      renderPage();
      await ready();
      expect(saveButton()).toBeDisabled();

      await user.selectOptions(cell('Inglés', 'A'), 'p-ana');
      expect(saveButton()).toBeEnabled();

      await user.selectOptions(cell('Inglés', 'A'), '');
      expect(saveButton()).toBeDisabled();
    });

    it('sends the final state in the order of the matrix, stays on the page and shows the notice', async () => {
      const user = userEvent.setup();
      const stored = [
        { subjectId: 's-eng', classId: 'k-a', professorId: 'p-ana' },
        { subjectId: 's-lan', classId: 'k-b', professorId: 'p-luis' },
      ];
      respondToUpdate(storing(stored));
      renderPage();
      await ready();

      await user.selectOptions(cell('Lengua', 'B'), 'p-luis');
      await user.selectOptions(cell('Inglés', 'A'), 'p-ana');
      await user.click(saveButton());

      expect(update).toHaveBeenCalledExactlyOnceWith(expect.anything(), COURSE_ID, stored);
      expect(await screen.findByText('Profesores de 1º Primaria guardados')).toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
      expect(cell('Lengua', 'B')).toHaveValue('p-luis');
    });

    it('sends an empty list when everything is left unassigned', async () => {
      const user = userEvent.setup();
      getMatrix.mockResolvedValue({
        status: 'loaded',
        assignments: {
          ...MATRIX,
          assignments: [{ subjectId: 's-eng', classId: 'k-a', professorId: 'p-ana' }],
        },
      });
      respondToUpdate(storing([]));
      renderPage();
      await ready();

      await user.selectOptions(cell('Inglés', 'A'), '');
      await user.click(saveButton());

      expect(update).toHaveBeenCalledExactlyOnceWith(expect.anything(), COURSE_ID, []);
    });

    it('does not send twice with a double click', async () => {
      const user = userEvent.setup();
      let finish: (outcome: UpdateCourseAssignmentsOutcome) => void = () => undefined;
      update.mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      renderPage();
      await ready();
      await user.selectOptions(cell('Inglés', 'A'), 'p-ana');

      await user.dblClick(saveButton());
      finish(storing([{ subjectId: 's-eng', classId: 'k-a', professorId: 'p-ana' }]));

      await waitFor(() => {
        expect(update).toHaveBeenCalledTimes(1);
      });
    });

    it('keeps what was edited and shows an alert when saving fails', async () => {
      const user = userEvent.setup();
      respondToUpdate({ status: 'unavailable' });
      renderPage();
      await ready();
      await user.selectOptions(cell('Inglés', 'A'), 'p-ana');

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.saveError);
      expect(cell('Inglés', 'A')).toHaveValue('p-ana');
      expect(saveButton()).toBeEnabled();
    });

    it('asks for the matrix again and warns when a reference no longer exists', async () => {
      const user = userEvent.setup();
      respondToUpdate({
        status: 'validationError',
        details: [{ field: 'assignments[0].professorId', code: 'NOT_FOUND' }],
      });
      renderPage();
      await ready();
      await user.selectOptions(cell('Inglés', 'A'), 'p-ana');

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.changed);
      await waitFor(() => {
        expect(getMatrix).toHaveBeenCalledTimes(2);
      });
      expect(listProfessors).toHaveBeenCalledTimes(2);
    });

    it('shows the not-found view when the course no longer exists', async () => {
      const user = userEvent.setup();
      respondToUpdate({ status: 'notFound' });
      renderPage();
      await ready();
      await user.selectOptions(cell('Inglés', 'A'), 'p-ana');

      await user.click(saveButton());

      expect(await screen.findByRole('heading', { name: texts.notFound })).toBeInTheDocument();
    });
  });

  describe('a course without subjects', () => {
    it('explains it with a link to its workload and draws no matrix', async () => {
      const user = userEvent.setup();
      getMatrix.mockResolvedValue({
        status: 'loaded',
        assignments: { ...MATRIX, subjects: [], assignments: [] },
      });
      renderPage();

      expect(await screen.findByText(texts.noSubjects)).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: texts.save })).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: texts.workloadLink }));
      expect(screen.getByTestId('workload-page')).toBeInTheDocument();
    });
  });

  describe('the roles', () => {
    it.each(['ADMIN', 'MEMBER'] as const)('lets a %s edit and save', async (role) => {
      const user = userEvent.setup();
      signInAs(role);
      respondToUpdate(storing([{ subjectId: 's-eng', classId: 'k-a', professorId: 'p-ana' }]));
      renderPage();
      await ready();

      await user.selectOptions(cell('Inglés', 'A'), 'p-ana');
      await user.click(saveButton());

      expect(update).toHaveBeenCalledOnce();
    });
  });

  describe('accessibility', () => {
    it.each([
      ['a wide screen', DESKTOP],
      ['a phone', PHONE],
    ])('has no violations on %s', async (_name, width) => {
      getMatrix.mockResolvedValue({
        status: 'loaded',
        assignments: {
          ...MATRIX,
          assignments: [{ subjectId: 's-eng', classId: 'k-a', professorId: 'p-ana' }],
        },
      });
      const { container } = renderPage(width);
      await ready(width);

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no violations for a course without subjects', async () => {
      getMatrix.mockResolvedValue({
        status: 'loaded',
        assignments: { ...MATRIX, subjects: [], assignments: [] },
      });
      const { container } = renderPage();
      await screen.findByText(texts.noSubjects);

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  it('is shown in English', async () => {
    await i18n.changeLanguage('en');
    renderPage();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Professors of 1º Primaria' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});
