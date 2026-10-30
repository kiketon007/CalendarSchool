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
  calendar: {
    id: 'calendar-1',
    name: 'Jornada continua',
    sessionsPerDay: 6,
    maxConsecutiveSessions: 6,
    sessionGroups: [6],
  },
  subjects: [
    {
      id: ENGLISH,
      name: 'Inglés',
      code: 'ING',
      color: 'blue',
      status: 'ACTIVE',
      sessionsPerWeek: 3,
      maxPerDay: 2,
      blockSize: null,
      constraintCount: 1,
      forbiddenSlots: [],
      warnings: [],
    },
    {
      id: LANGUAGE,
      name: 'Lengua',
      code: null,
      color: 'red',
      status: 'ACTIVE',
      sessionsPerWeek: 5,
      maxPerDay: null,
      blockSize: null,
      constraintCount: 0,
      forbiddenSlots: [],
      warnings: [],
    },
    {
      id: LATIN,
      name: 'Latín',
      code: null,
      color: 'gray',
      status: 'INACTIVE',
      sessionsPerWeek: null,
      maxPerDay: null,
      blockSize: null,
      constraintCount: 0,
      forbiddenSlots: [],
      warnings: [],
    },
    {
      id: MUSIC,
      name: 'Música',
      code: 'MUS',
      color: 'pink',
      status: 'ACTIVE',
      sessionsPerWeek: null,
      maxPerDay: null,
      blockSize: null,
      constraintCount: 0,
      forbiddenSlots: [],
      warnings: [],
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
  const maxSelect = (subject: string) =>
    screen.getByRole('combobox', {
      name: texts.matrix.maxPerDaySelect.replace('{{subject}}', subject),
    });
  const blockSelect = (subject: string) =>
    screen.getByRole('combobox', {
      name: texts.matrix.blockSizeSelect.replace('{{subject}}', subject),
    });
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
          calendar: {
            id: 'c',
            name: 'Corta',
            sessionsPerDay: 1,
            maxConsecutiveSessions: 1,
            sessionGroups: [1],
          },
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
        { subjectId: ENGLISH, sessionsPerWeek: 4, maxPerDay: 2, blockSize: null },
        { subjectId: LANGUAGE, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
        { subjectId: MUSIC, sessionsPerWeek: 2, maxPerDay: null, blockSize: null },
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

    describe('the forbidden slots', () => {
      const slotsLink = (subject: string) =>
        screen.getByRole('link', {
          name: texts.matrix.slotsLinkLabel.replace('{{subject}}', subject),
        });
      const wholeDays = (days: number[]) =>
        days.flatMap((dayOfWeek) =>
          [1, 2, 3, 4, 5, 6].map((sessionNumber) => ({ dayOfWeek, sessionNumber })),
        );

      it('links each subject that is taught to its slots, with the number of cells when there are some', async () => {
        get.mockResolvedValue({
          status: 'loaded',
          workload: {
            ...workload,
            subjects: [
              {
                ...workload.subjects[0]!,
                forbiddenSlots: wholeDays([1, 3, 5]),
                constraintCount: 2,
              },
              ...workload.subjects.slice(1),
            ],
          },
        });
        renderPage();
        await heading();

        expect(slotsLink('Inglés')).toHaveAttribute(
          'href',
          `/cursos/${COURSE_ID}/carga/${ENGLISH}/prohibidas`,
        );
        expect(slotsLink('Inglés')).toHaveTextContent('Franjas prohibidas (18)');
        expect(slotsLink('Lengua')).toHaveTextContent(/^Franjas prohibidas$/);
      });

      it('does not link the subjects that are not taught in the course', async () => {
        renderPage();
        await heading();

        expect(
          screen.queryByRole('link', {
            name: texts.matrix.slotsLinkLabel.replace('{{subject}}', 'Música'),
          }),
        ).not.toBeInTheDocument();
        expect(screen.getAllByRole('link', { name: /^Franjas prohibidas de/ })).toHaveLength(2);
      });

      it('does not link anything without a calendar, and says that one must be assigned', async () => {
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

        expect(
          screen.queryByRole('link', { name: /^Franjas prohibidas de/ }),
        ).not.toBeInTheDocument();
        expect(screen.getAllByText(texts.matrix.noCalendarForSlots)).toHaveLength(2);
      });

      it('recalculates the warning of a subject with its forbidden slots while the sessions change', async () => {
        const user = userEvent.setup();
        get.mockResolvedValue({
          status: 'loaded',
          workload: {
            ...workload,
            subjects: [
              workload.subjects[0]!,
              {
                ...workload.subjects[1]!,
                sessionsPerWeek: 3,
                forbiddenSlots: wholeDays([1, 2]),
                constraintCount: 1,
              },
              ...workload.subjects.slice(2),
            ],
          },
        });
        renderPage();
        await heading();
        expect(screen.queryByRole('status', { name: 'Avisos de Lengua' })).not.toBeInTheDocument();

        await user.selectOptions(select('Lengua'), '4');

        expect(screen.getByRole('status', { name: 'Avisos de Lengua' })).toHaveTextContent(
          texts.subjectWarnings.SUBJECT_DOES_NOT_FIT,
        );
      });

      it('shows the warning of the cells outside the calendar with its number', async () => {
        get.mockResolvedValue({
          status: 'loaded',
          workload: {
            ...workload,
            subjects: [
              {
                ...workload.subjects[0]!,
                constraintCount: 2,
                warnings: [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 5 }],
              },
              ...workload.subjects.slice(1),
            ],
          },
        });
        renderPage();
        await heading();

        expect(screen.getByRole('status', { name: 'Avisos de Inglés' })).toHaveTextContent(
          'Hay 5 franjas fuera del calendario actual',
        );
      });
    });

    describe('the scheduling rules', () => {
      it('shows the maximum per day and the blocks of each subject, with their options', async () => {
        renderPage();
        await heading();

        expect(maxSelect('Inglés')).toHaveValue('2');
        expect(maxSelect('Lengua')).toHaveValue('');
        expect(blockSelect('Inglés')).toHaveValue('');
        expect(
          within(maxSelect('Inglés'))
            .getAllByRole('option')
            .map((option) => option.textContent),
        ).toEqual([texts.matrix.maxPerDayDefault, '2', '3', '4', '5']);
        expect(
          within(blockSelect('Inglés'))
            .getAllByRole('option')
            .map((option) => option.textContent),
        ).toEqual([texts.matrix.noBlocks, 'De 2', 'De 3']);
      });

      it('disables both selectors for a subject that is not taught', async () => {
        renderPage();
        await heading();

        expect(maxSelect('Música')).toBeDisabled();
        expect(blockSelect('Música')).toBeDisabled();
        expect(maxSelect('Inglés')).toBeEnabled();
      });

      it('clears the rules and disables the selectors when a subject stops being taught, and starts again from zero', async () => {
        const user = userEvent.setup();
        renderPage();
        await heading();

        await user.selectOptions(select('Inglés'), '');
        expect(maxSelect('Inglés')).toBeDisabled();
        expect(maxSelect('Inglés')).toHaveValue('');

        await user.selectOptions(select('Inglés'), '3');
        expect(maxSelect('Inglés')).toBeEnabled();
        expect(maxSelect('Inglés')).toHaveValue('');
      });

      it('warns that saving will delete the rules, tied to the sessions selector, and stops warning when it is taught again', async () => {
        const user = userEvent.setup();
        renderPage();
        await heading();
        expect(screen.queryByText(/Al guardar se borrará/)).not.toBeInTheDocument();

        await user.selectOptions(select('Inglés'), '');

        const notice = screen.getByText('Al guardar se borrará su regla en este curso');
        expect(select('Inglés')).toHaveAccessibleDescription(
          'Al guardar se borrará su regla en este curso',
        );
        expect(notice).toBeVisible();

        await user.selectOptions(select('Inglés'), '3');
        expect(screen.queryByText(/Al guardar se borrará/)).not.toBeInTheDocument();
      });

      it('does not warn about losing rules for a subject without any', async () => {
        const user = userEvent.setup();
        renderPage();
        await heading();

        await user.selectOptions(select('Lengua'), '');

        expect(screen.queryByText(/Al guardar se borrará/)).not.toBeInTheDocument();
      });

      it('recalculates the warnings of the subject while editing', async () => {
        const user = userEvent.setup();
        renderPage();
        await heading();
        expect(screen.queryByText(texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD)).toBeNull();

        await user.selectOptions(blockSelect('Inglés'), '3');
        expect(screen.queryByText(texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD)).toBeNull();

        await user.selectOptions(select('Inglés'), '2');
        expect(screen.getByText(texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD)).toBeVisible();

        await user.selectOptions(blockSelect('Inglés'), '');
        expect(screen.queryByText(texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD)).toBeNull();
      });

      it('warns that a subject does not fit when no stretch without a break reaches the block', async () => {
        const user = userEvent.setup();
        get.mockResolvedValue({
          status: 'loaded',
          workload: {
            ...workload,
            calendar: {
              id: 'c',
              name: 'Con recreo',
              sessionsPerDay: 3,
              maxConsecutiveSessions: 2,
              sessionGroups: [2, 1],
            },
          },
        });
        renderPage();
        await heading();

        await user.selectOptions(blockSelect('Inglés'), '3');

        expect(screen.getByText(texts.subjectWarnings.SUBJECT_DOES_NOT_FIT)).toBeVisible();
      });

      it('enables "Save" when only a rule changes, and sends the whole row', async () => {
        const user = userEvent.setup();
        renderPage();
        await heading();
        expect(saveButton()).toBeDisabled();

        await user.selectOptions(blockSelect('Inglés'), '2');
        expect(saveButton()).toBeEnabled();
        await user.click(saveButton());

        await waitFor(() => {
          expect(update).toHaveBeenCalledOnce();
        });
        expect(update.mock.calls[0]?.[2]).toEqual([
          { subjectId: ENGLISH, sessionsPerWeek: 3, maxPerDay: 2, blockSize: 2 },
        ]);
      });

      it('disables "Save" again when the rule is put back as it was', async () => {
        const user = userEvent.setup();
        renderPage();
        await heading();

        await user.selectOptions(maxSelect('Inglés'), '4');
        expect(saveButton()).toBeEnabled();
        await user.selectOptions(maxSelect('Inglés'), '2');

        expect(saveButton()).toBeDisabled();
      });

      it('sends null for a rule that is cleared', async () => {
        const user = userEvent.setup();
        renderPage();
        await heading();

        await user.selectOptions(maxSelect('Inglés'), '');
        await user.click(saveButton());

        await waitFor(() => {
          expect(update).toHaveBeenCalledOnce();
        });
        expect(update.mock.calls[0]?.[2]).toEqual([
          { subjectId: ENGLISH, sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
        ]);
      });

      it('shows the warnings of each subject as soon as it loads, with the same rule as the server', async () => {
        get.mockResolvedValue({
          status: 'loaded',
          workload: {
            ...workload,
            calendar: {
              id: 'c',
              name: 'Sin tramos',
              sessionsPerDay: 2,
              maxConsecutiveSessions: 1,
              sessionGroups: [1, 1],
            },
            subjects: [
              {
                ...workload.subjects[0]!,
                blockSize: 2,
                constraintCount: 2,
                warnings: [{ code: 'SUBJECT_DOES_NOT_FIT' }],
              },
              ...workload.subjects.slice(1),
            ],
          },
        });
        renderPage();
        await heading();

        expect(screen.getByRole('status', { name: 'Avisos de Inglés' })).toHaveTextContent(
          texts.subjectWarnings.SUBJECT_DOES_NOT_FIT,
        );
      });

      it('has no WCAG 2.1 AA violations with warnings and the notice of lost rules', async () => {
        const user = userEvent.setup();
        const { container } = renderPage();
        await heading();
        await user.selectOptions(blockSelect('Lengua'), '3');
        await user.selectOptions(select('Lengua'), '2');
        await user.selectOptions(select('Inglés'), '');

        expect(screen.getByText(texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD)).toBeVisible();
        expect(screen.getByText(/Al guardar se borrará/)).toBeVisible();
        expect(await wcagViolations(container)).toEqual([]);
      });
    });

    it('has no WCAG 2.1 AA violations', async () => {
      const { container } = renderPage();
      await heading();

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('as a member, the forbidden slots', () => {
    beforeEach(() => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
    });

    it('links each subject that is taught to its slots, and says nothing without a calendar link', async () => {
      get.mockResolvedValue({
        status: 'loaded',
        workload: {
          ...workload,
          subjects: [
            {
              ...workload.subjects[0]!,
              forbiddenSlots: [
                { dayOfWeek: 1, sessionNumber: 1 },
                { dayOfWeek: 2, sessionNumber: 2 },
              ],
              constraintCount: 2,
            },
            ...workload.subjects.slice(1),
          ],
        },
      });
      renderPage();
      await heading();

      const link = screen.getByRole('link', { name: 'Franjas prohibidas de Inglés' });
      expect(link).toHaveAttribute('href', `/cursos/${COURSE_ID}/carga/${ENGLISH}/prohibidas`);
      expect(link).toHaveTextContent('Franjas prohibidas (2)');
    });

    it('does not link anything when the course has no calendar', async () => {
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

      expect(
        screen.queryByRole('link', { name: /^Franjas prohibidas de/ }),
      ).not.toBeInTheDocument();
    });

    it('has no WCAG 2.1 AA violations with the links', async () => {
      const { container } = renderPage();
      await heading();

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('as a member', () => {
    it('shows the rules of each subject as text, with the singular and the plural', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      get.mockResolvedValue({
        status: 'loaded',
        workload: {
          ...workload,
          subjects: [
            { ...workload.subjects[0]!, maxPerDay: 3, blockSize: 2, constraintCount: 2 },
            { ...workload.subjects[1]!, maxPerDay: null, blockSize: 3, constraintCount: 1 },
          ],
        },
      });
      renderPage();
      await heading();

      const list = screen.getByRole('list', { name: 'Asignaturas que se imparten en 1º Primaria' });
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Inglés: 3 sesiones · como mucho 3 al día · en bloques de 2Franjas prohibidas',
        'Lengua: 5 sesiones · en bloques de 3Franjas prohibidas',
      ]);
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('shows the warnings of each subject without selectors', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      get.mockResolvedValue({
        status: 'loaded',
        workload: {
          ...workload,
          subjects: [
            {
              ...workload.subjects[0]!,
              blockSize: 2,
              constraintCount: 2,
              warnings: [{ code: 'BLOCK_LARGER_THAN_LOAD' }],
            },
            ...workload.subjects.slice(1),
          ],
        },
      });
      renderPage();
      await heading();

      expect(screen.getByRole('status', { name: 'Avisos de Inglés' })).toHaveTextContent(
        texts.subjectWarnings.BLOCK_LARGER_THAN_LOAD,
      );
    });

    it('has no WCAG 2.1 AA violations with rules and warnings', async () => {
      refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf('MEMBER') });
      get.mockResolvedValue({
        status: 'loaded',
        workload: {
          ...workload,
          subjects: [
            {
              ...workload.subjects[0]!,
              blockSize: 2,
              constraintCount: 2,
              warnings: [{ code: 'SUBJECT_DOES_NOT_FIT' }],
            },
            ...workload.subjects.slice(1),
          ],
        },
      });
      const { container } = renderPage();
      await heading();

      expect(await wcagViolations(container)).toEqual([]);
    });

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
      ).toEqual([
        'Inglés: 3 sesiones · como mucho 2 al díaFranjas prohibidas',
        'Lengua: 5 sesionesFranjas prohibidas',
      ]);
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

      expect(screen.getByText(/^Inglés: 1 sesión/)).toBeVisible();
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
