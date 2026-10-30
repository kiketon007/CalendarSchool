import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import {
  courseWorkloadService,
  type CourseWorkload,
  type CourseWorkloadOutcome,
  type UpdateCourseWorkloadOutcome,
} from '../services/courseWorkloadService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { CourseWorkloadPage } from './CourseWorkloadPage';

const texts = es.workload;

const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const ENGLISH = '0192f5a0-0000-7000-8000-0000000000e1';
const LANGUAGE = '0192f5a0-0000-7000-8000-0000000000e2';
const MUSIC = '0192f5a0-0000-7000-8000-0000000000e3';
const LATIN = '0192f5a0-0000-7000-8000-0000000000e4';

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

const workload: CourseWorkload = {
  course: { id: COURSE_ID, name: '1º Primaria' },
  calendar: { id: 'calendar-1', name: 'Jornada continua', sessionsPerDay: 6 },
  subjects: [
    {
      id: ENGLISH,
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
      sessionsPerWeek: 3,
    },
    {
      id: LANGUAGE,
      name: 'Lengua',
      code: null,
      color: 'red',
      status: 'ACTIVE',
      sessionsPerWeek: 5,
    },
    {
      id: LATIN,
      name: 'Latín',
      code: null,
      color: 'gray',
      status: 'INACTIVE',
      sessionsPerWeek: null,
    },
    {
      id: MUSIC,
      name: 'Música',
      code: 'MUS',
      color: 'pink',
      status: 'ACTIVE',
      sessionsPerWeek: null,
    },
  ],
  assignedSessions: 8,
  availableSessions: 30,
  warnings: [],
};

/** Reglas automáticas de WCAG 2.1 nivel AA. El contraste lo mide el navegador, no jsdom. */
async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
}

describe('CourseWorkloadPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let get: MockInstance<typeof courseWorkloadService.get>;
  let update: MockInstance<typeof courseWorkloadService.update>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionOf('ADMIN') });
    get = vi
      .spyOn(courseWorkloadService, 'get')
      .mockResolvedValue({ status: 'loaded', workload } satisfies CourseWorkloadOutcome);
    update = vi
      .spyOn(courseWorkloadService, 'update')
      .mockResolvedValue({ status: 'updated', workload } satisfies UpdateCourseWorkloadOutcome);
  });

  afterEach(() => {
    refresh.mockRestore();
    get.mockRestore();
    update.mockRestore();
  });

  function renderPage({ strict = false, id = COURSE_ID } = {}) {
    const tree = (
      <MemoryRouter initialEntries={[`/cursos/${id}/carga`]}>
        <SessionProvider>
          <Routes>
            <Route path="/cursos/:id/carga" element={<CourseWorkloadPage />} />
            <Route path="/cursos" element={<p>Listado de cursos</p>} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  const heading = () => screen.findByRole('heading', { level: 1, name: /Carga horaria de/ });
  const select = (subject: string) =>
    screen.getByRole('combobox', { name: texts.matrix.select.replace('{{subject}}', subject) });
  const saveButton = () => screen.getByRole('button', { name: texts.save });

  describe('as an administrator', () => {
    it('asks once for the workload of the course in the route, also in strict mode', async () => {
      renderPage({ strict: true });

      await heading();

      expect(get).toHaveBeenCalledOnce();
      expect(get.mock.calls[0]?.[1]).toBe(COURSE_ID);
    });

    it('shows a status while it loads and no matrix', async () => {
      get.mockReturnValue(new Promise(() => undefined));
      renderPage();

      expect(await screen.findByRole('status')).toHaveTextContent(texts.loading);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows an alert with Retry when it fails, and asks again when pressed', async () => {
      const user = userEvent.setup();
      get.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);
      await user.click(screen.getByRole('button', { name: texts.retry }));

      expect(await heading()).toHaveTextContent('Carga horaria de 1º Primaria');
      expect(get).toHaveBeenCalledTimes(2);
    });

    it('says that the course does not exist, with a link to the courses', async () => {
      get.mockResolvedValue({ status: 'notFound' });
      renderPage();

      expect(await screen.findByText(texts.notFound)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.backToCourses })).toHaveAttribute(
        'href',
        '/cursos',
      );
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('shows the title, the balance and one row per subject in the order of the server', async () => {
      renderPage();

      expect(await heading()).toHaveTextContent('Carga horaria de 1º Primaria');
      expect(screen.getByText('8 de 30 sesiones a la semana')).toBeVisible();
      const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
      expect(rows.map((row) => within(row).getByRole('rowheader').textContent)).toEqual([
        expect.stringContaining('Inglés'),
        expect.stringContaining('Lengua'),
        expect.stringContaining('Latín'),
        expect.stringContaining('Música'),
      ]);
    });

    it('shows the color with its name, the code of the subject and "Inactive" when it is', async () => {
      renderPage();
      await heading();

      const english = screen.getByRole('rowheader', { name: /Inglés/ });
      expect(within(english).getByRole('img', { name: 'Color: Azul' })).toBeVisible();
      expect(within(english).getByText('Código ING')).toBeVisible();
      expect(
        within(screen.getByRole('rowheader', { name: /Latín/ })).getByText(texts.matrix.inactive),
      ).toBeVisible();
      expect(
        within(screen.getByRole('rowheader', { name: /Lengua/ })).queryByText(/Código/),
      ).toBeNull();
    });

    it('preselects the sessions of each subject and "Not taught" for the ones that are not in the course', async () => {
      renderPage();
      await heading();

      expect(select('Inglés')).toHaveValue('3');
      expect(select('Lengua')).toHaveValue('5');
      expect(select('Música')).toHaveValue('');
      expect(
        within(select('Música')).getByRole('option', { name: texts.matrix.notTaught }),
      ).toBeVisible();
      expect(
        within(select('Inglés'))
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([texts.matrix.notTaught, '1', '2', '3', '4', '5']);
    });

    it('recalculates the balance while editing, before saving', async () => {
      const user = userEvent.setup();
      renderPage();
      await heading();

      await user.selectOptions(select('Inglés'), '4');
      await user.selectOptions(select('Música'), '2');
      await user.selectOptions(select('Lengua'), '');

      expect(screen.getByText('6 de 30 sesiones a la semana')).toBeVisible();
      expect(update).not.toHaveBeenCalled();
    });

    it('warns when the load exceeds the sessions of the calendar, and stops warning when editing makes it fit', async () => {
      const user = userEvent.setup();
      get.mockResolvedValue({
        status: 'loaded',
        workload: {
          ...workload,
          calendar: { id: 'c', name: 'Corta', sessionsPerDay: 1 },
          availableSessions: 5,
          warnings: [{ code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 8, available: 5 }],
        },
      });
      renderPage();
      await heading();
      const warnings = () => screen.queryByRole('status', { name: texts.warnings.label });
      expect(screen.getByText('8 de 5 sesiones a la semana')).toBeVisible();
      expect(warnings()).toHaveTextContent(
        'La carga supera en 3 las sesiones del calendario Corta',
      );

      await user.selectOptions(select('Lengua'), '');
      expect(screen.getByText('3 de 5 sesiones a la semana')).toBeVisible();
      expect(warnings()).not.toBeInTheDocument();

      await user.selectOptions(select('Lengua'), '5');
      expect(warnings()).toHaveTextContent(
        'La carga supera en 3 las sesiones del calendario Corta',
      );
    });

    it('enables "Save" only with differences from what was loaded, and disables it again when undoing', async () => {
      const user = userEvent.setup();
      renderPage();
      await heading();
      expect(saveButton()).toBeDisabled();

      await user.selectOptions(select('Inglés'), '4');
      expect(saveButton()).toBeEnabled();

      await user.selectOptions(select('Inglés'), '3');
      expect(saveButton()).toBeDisabled();
    });

    it('sends one single request with only the rows that changed, even if "Save" is pressed twice', async () => {
      const user = userEvent.setup();
      renderPage();
      await heading();
      await user.selectOptions(select('Inglés'), '4');
      await user.selectOptions(select('Música'), '2');
      await user.selectOptions(select('Lengua'), '');

      await user.dblClick(saveButton());

      await waitFor(() => {
        expect(update).toHaveBeenCalledOnce();
      });
      expect(update.mock.calls[0]?.[1]).toBe(COURSE_ID);
      expect(update.mock.calls[0]?.[2]).toEqual([
        { subjectId: ENGLISH, sessionsPerWeek: 4 },
        { subjectId: LANGUAGE, sessionsPerWeek: null },
        { subjectId: MUSIC, sessionsPerWeek: 2 },
      ]);
    });

    it('stays on the page with what the server answered and says that it was saved', async () => {
      const user = userEvent.setup();
      const saved: CourseWorkload = {
        ...workload,
        subjects: workload.subjects.map((subject) =>
          subject.id === ENGLISH ? { ...subject, sessionsPerWeek: 4 } : subject,
        ),
        assignedSessions: 9,
      };
      update.mockResolvedValue({ status: 'updated', workload: saved });
      renderPage();
      await heading();
      await user.selectOptions(select('Inglés'), '4');

      await user.click(saveButton());

      expect(await screen.findByText('Carga de 1º Primaria guardada')).toBeVisible();
      expect(screen.getByText('9 de 30 sesiones a la semana')).toBeVisible();
      expect(select('Inglés')).toHaveValue('4');
      expect(saveButton()).toBeDisabled();
    });

    it('reloads the workload and says that a subject no longer exists when the server cannot find it', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'changes[0].subjectId', code: 'NOT_FOUND' }],
      });
      renderPage();
      await heading();
      await user.selectOptions(select('Inglés'), '4');

      await user.click(saveButton());

      expect(await screen.findByText(texts.someGone)).toBeVisible();
      await waitFor(() => {
        expect(get).toHaveBeenCalledTimes(2);
      });
      expect(await heading()).toBeVisible();
      expect(select('Inglés')).toHaveValue('3');
    });

    it('shows a general error and keeps what was edited when the server rejects other fields', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'changes[0].sessionsPerWeek', code: 'OUT_OF_RANGE' }],
      });
      renderPage();
      await heading();
      await user.selectOptions(select('Inglés'), '4');

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.saveError);
      expect(select('Inglés')).toHaveValue('4');
      expect(get).toHaveBeenCalledOnce();
    });

    it('shows that the course does not exist when it is gone while saving', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue({ status: 'notFound' });
      renderPage();
      await heading();
      await user.selectOptions(select('Inglés'), '4');

      await user.click(saveButton());

      expect(await screen.findByText(texts.notFound)).toBeVisible();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('tells that only administrators can change it on a 403, keeping what was edited', async () => {
      const user = userEvent.setup();
      update.mockResolvedValue({ status: 'forbidden' });
      renderPage();
      await heading();
      await user.selectOptions(select('Inglés'), '4');

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.forbidden);
      expect(select('Inglés')).toHaveValue('4');
    });

    it('shows a general error on any other failure, keeps what was edited and lets it try again', async () => {
      const user = userEvent.setup();
      update.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();
      await heading();
      await user.selectOptions(select('Inglés'), '4');

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.saveError);
      expect(select('Inglés')).toHaveValue('4');
      expect(saveButton()).toBeEnabled();

      await user.click(saveButton());

      expect(await screen.findByText('Carga de 1º Primaria guardada')).toBeVisible();
      expect(update).toHaveBeenCalledTimes(2);
    });

    it('invites to create subjects, without a matrix or "Save", in a school without any', async () => {
      get.mockResolvedValue({
        status: 'loaded',
        workload: { ...workload, subjects: [], assignedSessions: 0 },
      });
      renderPage();
      await heading();

      expect(screen.getByText(texts.noSubjects)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.createSubject })).toHaveAttribute(
        'href',
        '/asignaturas/nueva',
      );
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: texts.save })).not.toBeInTheDocument();
    });

    it('has no WCAG 2.1 AA violations', async () => {
      const { container } = renderPage();
      await heading();

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('as a member', () => {
    beforeEach(() => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
    });

    it('shows the balance and the subjects that are taught in the course, with their sessions, as text', async () => {
      renderPage();
      await heading();

      expect(screen.getByText('8 de 30 sesiones a la semana')).toBeVisible();
      const list = screen.getByRole('list', { name: 'Asignaturas que se imparten en 1º Primaria' });
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Inglés: 3 sesiones', 'Lengua: 5 sesiones']);
    });

    it('uses the singular for one session', async () => {
      get.mockResolvedValue({
        status: 'loaded',
        workload: {
          ...workload,
          subjects: [{ ...workload.subjects[0]!, sessionsPerWeek: 1 }],
          assignedSessions: 1,
        },
      });
      renderPage();
      await heading();

      expect(screen.getByText('Inglés: 1 sesión')).toBeVisible();
    });

    it('has no selectors, no "Save" and says that only administrators can change it', async () => {
      renderPage();
      await heading();

      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: texts.save })).not.toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.getByText(texts.forbidden)).toBeVisible();
    });

    it('says that the course has no subjects yet when none is taught in it', async () => {
      get.mockResolvedValue({
        status: 'loaded',
        workload: {
          ...workload,
          subjects: workload.subjects.map((subject) => ({ ...subject, sessionsPerWeek: null })),
          assignedSessions: 0,
        },
      });
      renderPage();
      await heading();

      expect(screen.getByText(texts.member.empty)).toBeVisible();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('shows the warning of a course without a calendar', async () => {
      get.mockResolvedValue({
        status: 'loaded',
        workload: {
          ...workload,
          calendar: null,
          availableSessions: null,
          warnings: [{ code: 'COURSE_WITHOUT_CALENDAR' }],
        },
      });
      renderPage();
      await heading();

      expect(screen.getByRole('status', { name: texts.warnings.label })).toHaveTextContent(
        texts.warnings.COURSE_WITHOUT_CALENDAR,
      );
    });

    it('has no WCAG 2.1 AA violations', async () => {
      const { container } = renderPage();
      await heading();

      expect(await wcagViolations(container)).toEqual([]);
    });
  });
});
