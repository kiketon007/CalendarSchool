import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import type { Course } from '../services/coursesService';
import { emptySubjectDraft, type SubjectDraft } from '../validation/subjectValidation';
import { SubjectForm, type CoursesState, type SubjectSubmitResult } from './SubjectForm';

const texts = es.subjects.form;

const course = (id: string, name: string): Course => ({
  id,
  name,
  createdAt: '2026-10-19T09:30:00.000Z',
  studentCount: 0,
  classes: [],
});

const FIRST = '0192f5a0-0000-7000-8000-0000000000d1';
const SECOND = '0192f5a0-0000-7000-8000-0000000000d2';
const THIRD = '0192f5a0-0000-7000-8000-0000000000d3';

const courses: Course[] = [
  course(FIRST, '1º Primaria'),
  course(SECOND, '2º Primaria'),
  course(THIRD, '3º Primaria'),
];

/** Reglas automáticas de WCAG 2.1 nivel AA. El contraste lo mide el navegador, no jsdom. */
async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

function renderForm(
  options: {
    courses?: CoursesState;
    result?: SubjectSubmitResult | Promise<SubjectSubmitResult>;
    initial?: SubjectDraft;
    failureMessage?: string;
    requireChanges?: boolean;
    ruleCounts?: Record<string, number>;
  } = {},
) {
  const onSubmit = vi
    .fn<(draft: SubjectDraft) => Promise<SubjectSubmitResult>>()
    .mockImplementation(() => Promise.resolve(options.result ?? { status: 'done' }));
  const onRetryCourses = vi.fn();
  const props = (state: CoursesState) => (
    <MemoryRouter>
      <SubjectForm
        initialValues={options.initial ?? emptySubjectDraft('blue')}
        courses={state}
        onRetryCourses={onRetryCourses}
        onSubmit={onSubmit}
        {...(options.failureMessage !== undefined && { failureMessage: options.failureMessage })}
        {...(options.requireChanges !== undefined && { requireChanges: options.requireChanges })}
        {...(options.ruleCounts !== undefined && { ruleCounts: options.ruleCounts })}
      />
    </MemoryRouter>
  );
  const view = render(props(options.courses ?? { status: 'loaded', courses }));
  return {
    onSubmit,
    onRetryCourses,
    container: view.container,
    rerenderWith: (state: CoursesState) => view.rerender(props(state)),
  };
}

const saveButton = () => screen.getByRole('button', { name: texts.save });
const nameInput = () => screen.getByLabelText(texts.name);
const codeInput = () => screen.getByLabelText(texts.code);
const typeSelect = () => screen.getByLabelText(texts.type);
const statusSelect = () => screen.getByLabelText(texts.status);
const descriptionInput = () => screen.getByLabelText(texts.description);
const courseBox = (name: string) => screen.getByRole('checkbox', { name });
const sessionsSelect = (courseName: string) =>
  screen.getByLabelText(texts.courses.sessions.replace('{{course}}', courseName));
const colorRadio = (name: string) => screen.getByRole('radio', { name });

/** Rellena lo mínimo para que el formulario sea válido: nombre, tipo y un curso. */
async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(nameInput(), 'Inglés');
  await user.selectOptions(typeSelect(), 'CORE');
  await user.click(courseBox('1º Primaria'));
}

describe('SubjectForm', () => {
  describe('opening it', () => {
    it('starts active, with the proposed color chosen and no course ticked', () => {
      renderForm({ initial: emptySubjectDraft('purple') });

      expect(nameInput()).toHaveValue('');
      expect(statusSelect()).toHaveValue('ACTIVE');
      expect(typeSelect()).toHaveValue('');
      expect(colorRadio('Morado')).toBeChecked();
      expect(colorRadio('Azul')).not.toBeChecked();
      for (const { name } of courses) {
        expect(courseBox(name)).not.toBeChecked();
      }
      expect(screen.queryByLabelText(/Sesiones a la semana en/u)).not.toBeInTheDocument();
    });

    it('offers the three types, the two statuses and the twelve colors of the palette, each with its name', () => {
      renderForm();

      expect(
        within(typeSelect())
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual([texts.typeChoose, 'Troncal', 'Optativa', 'Propia del centro']);
      expect(
        within(statusSelect())
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['Activa', 'Inactiva']);
      expect(screen.getAllByRole('radio')).toHaveLength(12);
      expect(screen.getByRole('radio', { name: 'Verde azulado' })).toBeInTheDocument();
    });

    it('does not show the color swatches to assistive technology: the name is written next to them', () => {
      renderForm();

      expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
  });

  describe('the courses', () => {
    it('shows the sessions of a course, 2 by default, when it is ticked, and hides them when it is not', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(courseBox('2º Primaria'));

      expect(courseBox('2º Primaria')).toBeChecked();
      expect(sessionsSelect('2º Primaria')).toHaveValue('2');
      expect(
        within(sessionsSelect('2º Primaria'))
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['1', '2', '3', '4', '5']);

      await user.click(courseBox('2º Primaria'));

      expect(screen.queryByLabelText(/Sesiones a la semana en/u)).not.toBeInTheDocument();
    });

    it('remembers the sessions of a course while it stays ticked, and goes back to 2 if it is ticked again', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(courseBox('1º Primaria'));
      await user.selectOptions(sessionsSelect('1º Primaria'), '5');
      await user.click(courseBox('2º Primaria'));

      expect(sessionsSelect('1º Primaria')).toHaveValue('5');

      await user.click(courseBox('1º Primaria'));
      await user.click(courseBox('1º Primaria'));

      expect(sessionsSelect('1º Primaria')).toHaveValue('2');
    });

    it('says to create the courses first, with a link to them, and does not let it save, when the school has none', () => {
      renderForm({ courses: { status: 'loaded', courses: [] } });

      expect(screen.getByText(texts.courses.none)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: texts.courses.goToCourses })).toHaveAttribute(
        'href',
        '/cursos',
      );
      expect(saveButton()).toBeDisabled();
    });

    it('says it is loading the courses, and does not let it save yet', () => {
      renderForm({ courses: { status: 'loading' } });

      expect(screen.getByRole('status')).toHaveTextContent(texts.courses.loading);
      expect(saveButton()).toBeDisabled();
    });

    it('shows an alert with a button to retry when the courses fail, and does not let it save', async () => {
      const user = userEvent.setup();
      const { onRetryCourses } = renderForm({ courses: { status: 'error' } });

      expect(screen.getByRole('alert')).toHaveTextContent(texts.courses.loadError);
      expect(saveButton()).toBeDisabled();

      await user.click(screen.getByRole('button', { name: texts.courses.retry }));

      expect(onRetryCourses).toHaveBeenCalledOnce();
    });

    it('does not send a ticked course that is gone when the list is reloaded', async () => {
      const user = userEvent.setup();
      const { onSubmit, rerenderWith } = renderForm();
      await fillValid(user);
      await user.click(courseBox('2º Primaria'));

      rerenderWith({ status: 'loaded', courses: [courses[1] as Course, courses[2] as Course] });
      await user.click(saveButton());

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(onSubmit.mock.calls[0]?.[0].courses).toEqual([
        { courseId: SECOND, sessionsPerWeek: 2 },
      ]);
    });
  });

  describe('saving', () => {
    it('sends what was filled in, with the courses in the order of the list and their sessions', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.type(nameInput(), 'Inglés');
      await user.type(codeInput(), 'ING');
      await user.selectOptions(typeSelect(), 'ELECTIVE');
      await user.selectOptions(statusSelect(), 'INACTIVE');
      await user.type(descriptionInput(), 'Lengua extranjera');
      await user.click(colorRadio('Verde'));
      // Se marcan en otro orden que el de la lista.
      await user.click(courseBox('3º Primaria'));
      await user.click(courseBox('1º Primaria'));
      await user.selectOptions(sessionsSelect('3º Primaria'), '4');
      await user.click(saveButton());

      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        name: 'Inglés',
        code: 'ING',
        type: 'ELECTIVE',
        status: 'INACTIVE',
        description: 'Lengua extranjera',
        color: 'green',
        courses: [
          { courseId: FIRST, sessionsPerWeek: 2 },
          { courseId: THIRD, sessionsPerWeek: 4 },
        ],
      });
    });

    it('does not send anything and shows each error under its field, with the focus on the first invalid', async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderForm();

      await user.click(saveButton());

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText(texts.errors.name.REQUIRED)).toBeInTheDocument();
      expect(screen.getByText(texts.errors.type.REQUIRED)).toBeInTheDocument();
      expect(screen.getByText(texts.errors.courses.REQUIRED)).toBeInTheDocument();
      expect(nameInput()).toHaveFocus();
      expect(nameInput()).toHaveAttribute('aria-invalid', 'true');
      expect(nameInput()).toHaveAccessibleDescription(
        expect.stringContaining(texts.errors.name.REQUIRED),
      );
    });

    it('puts the focus on the type when it is the first invalid field', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(nameInput(), 'Inglés');
      await user.click(courseBox('1º Primaria'));

      await user.click(saveButton());

      expect(typeSelect()).toHaveFocus();
    });

    it('puts the focus on the first course when only the courses are missing', async () => {
      const user = userEvent.setup();
      renderForm();
      await user.type(nameInput(), 'Inglés');
      await user.selectOptions(typeSelect(), 'CORE');

      await user.click(saveButton());

      expect(courseBox('1º Primaria')).toHaveFocus();
      expect(screen.getByText(texts.errors.courses.REQUIRED)).toBeInTheDocument();
    });

    it('marks a code with a space, and clears the error as soon as that field is typed in', async () => {
      const user = userEvent.setup();
      renderForm();
      await fillValid(user);
      await user.type(codeInput(), 'IN G');

      await user.click(saveButton());

      expect(screen.getByText(texts.errors.code.INVALID_CHARACTERS)).toBeInTheDocument();
      expect(codeInput()).toHaveFocus();

      await user.type(codeInput(), 'X');

      expect(screen.queryByText(texts.errors.code.INVALID_CHARACTERS)).not.toBeInTheDocument();
    });

    it('sends a single request when it is pressed twice in a row', async () => {
      const user = userEvent.setup();
      let finish: (result: SubjectSubmitResult) => void = () => undefined;
      const pending = new Promise<SubjectSubmitResult>((resolve) => {
        finish = resolve;
      });
      const { onSubmit } = renderForm({ result: pending });
      await fillValid(user);

      await user.dblClick(saveButton());

      expect(onSubmit).toHaveBeenCalledOnce();
      // Mientras guarda, el botón cambia de nombre y se deshabilita.
      expect(screen.getByRole('button', { name: texts.saving })).toBeDisabled();
      finish({ status: 'done' });
    });
  });

  describe('what the server answers', () => {
    it('shows an error under the name, with the focus, when the name is taken, and keeps what was typed', async () => {
      const user = userEvent.setup();
      renderForm({ result: { status: 'nameTaken' } });
      await fillValid(user);
      await user.type(codeInput(), 'ING');

      await user.click(saveButton());

      await waitFor(() => {
        expect(screen.getByText(texts.errors.alreadyExists)).toBeInTheDocument();
      });
      expect(nameInput()).toHaveFocus();
      expect(nameInput()).toHaveValue('Inglés');
      expect(codeInput()).toHaveValue('ING');
      expect(courseBox('1º Primaria')).toBeChecked();
    });

    it('shows an error under the code, with the focus, when the code is taken', async () => {
      const user = userEvent.setup();
      renderForm({ result: { status: 'codeTaken' } });
      await fillValid(user);
      await user.type(codeInput(), 'ING');

      await user.click(saveButton());

      await waitFor(() => {
        expect(screen.getByText(texts.errors.codeAlreadyExists)).toBeInTheDocument();
      });
      expect(codeInput()).toHaveFocus();
      expect(codeInput()).toHaveAccessibleDescription(
        new RegExp(texts.errors.codeAlreadyExists, 'u'),
      );
    });

    it('shows the errors of the fields the server rejects, and those of each course under its own course', async () => {
      const user = userEvent.setup();
      renderForm({
        result: {
          status: 'validationError',
          errors: {
            description: 'INVALID_LENGTH',
            rows: {
              0: { sessionsPerWeek: 'OUT_OF_RANGE' },
              1: { courseId: 'NOT_FOUND' },
            },
          },
        },
      });
      await fillValid(user);
      await user.click(courseBox('3º Primaria'));

      await user.click(saveButton());

      await waitFor(() => {
        expect(
          screen.getByText(texts.errors.description.INVALID_LENGTH.replace('{{max}}', '500')),
        ).toBeInTheDocument();
      });
      expect(sessionsSelect('1º Primaria')).toHaveAccessibleDescription(
        texts.errors.sessions.OUT_OF_RANGE,
      );
      expect(courseBox('3º Primaria')).toHaveAccessibleDescription(texts.errors.course.NOT_FOUND);
      expect(descriptionInput()).toHaveFocus();
    });

    it('shows a general alert, with the text it is given, and keeps what was typed, when saving fails', async () => {
      const user = userEvent.setup();
      renderForm({ result: { status: 'failed' }, failureMessage: 'No se pudo, de verdad' });
      await fillValid(user);

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo, de verdad');
      expect(nameInput()).toHaveValue('Inglés');
      expect(saveButton()).toBeEnabled();
    });

    it('uses the text of the creation for the general alert if the page gives none', async () => {
      const user = userEvent.setup();
      renderForm({ result: { status: 'failed' } });
      await fillValid(user);

      await user.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.unavailable);
    });
  });

  describe('accessibility', () => {
    it('has no WCAG 2.1 AA violations, empty', async () => {
      const { container } = renderForm();

      await expect(wcagViolations(container)).resolves.toEqual([]);
    });

    it('has no violations with errors under the fields and with a course ticked', async () => {
      const user = userEvent.setup();
      const { container } = renderForm();
      await user.click(courseBox('1º Primaria'));
      await user.click(saveButton());

      await expect(wcagViolations(container)).resolves.toEqual([]);
    });

    it('has no violations without courses or while they load', async () => {
      const empty = renderForm({ courses: { status: 'loaded', courses: [] } });
      await expect(wcagViolations(empty.container)).resolves.toEqual([]);
      empty.container.remove();

      const loading = renderForm({ courses: { status: 'loading' } });
      await expect(wcagViolations(loading.container)).resolves.toEqual([]);
    });
  });
});

describe('SubjectForm editing a subject', () => {
  /** La asignatura cargada: dos de los tres cursos, con sesiones distintas de las 2 por defecto. */
  const LOADED: SubjectDraft = {
    name: 'Inglés',
    code: 'ING',
    type: 'CORE',
    status: 'ACTIVE',
    description: 'Lengua extranjera',
    color: 'green',
    courses: [
      { courseId: FIRST, sessionsPerWeek: 3 },
      { courseId: SECOND, sessionsPerWeek: 5 },
    ],
  };
  const WITHOUT_COURSES: SubjectDraft = { ...LOADED, courses: [] };
  const emptyNotice = () => screen.queryByText(texts.courses.emptySubject);

  const edit = (options: Parameters<typeof renderForm>[0] = {}) =>
    renderForm({ initial: LOADED, requireChanges: true, ...options });

  describe('the rules that would be lost', () => {
    const lost = (count: number, course: string) =>
      es.subjects.form.courses[count === 1 ? 'loseRules_one' : 'loseRules_other']
        .replace('{{count}}', String(count))
        .replace('{{course}}', course);

    it('warns under a course with rules when it is unticked, tied to its checkbox, and stops when it is ticked again', async () => {
      const user = userEvent.setup();
      edit({ ruleCounts: { [FIRST]: 2, [SECOND]: 0 } });
      expect(screen.queryByText(/Al guardar se borrar/)).not.toBeInTheDocument();

      await user.click(courseBox('1º Primaria'));

      expect(screen.getByText(lost(2, '1º Primaria'))).toBeVisible();
      expect(courseBox('1º Primaria')).toHaveAccessibleDescription(lost(2, '1º Primaria'));

      await user.click(courseBox('1º Primaria'));
      expect(screen.queryByText(/Al guardar se borrar/)).not.toBeInTheDocument();
    });

    it('uses the singular for one rule', async () => {
      const user = userEvent.setup();
      edit({ ruleCounts: { [FIRST]: 1 } });

      await user.click(courseBox('1º Primaria'));

      expect(screen.getByText(lost(1, '1º Primaria'))).toBeVisible();
    });

    it('does not warn when the course has no rules, or when a course is ticked, or in a creation', async () => {
      const user = userEvent.setup();
      edit({ ruleCounts: { [FIRST]: 0 } });

      await user.click(courseBox('1º Primaria'));
      await user.click(courseBox('3º Primaria'));

      expect(screen.queryByText(/Al guardar se borrar/)).not.toBeInTheDocument();
    });

    it('does not warn in a creation, which has no rules to lose', async () => {
      const user = userEvent.setup();
      renderForm();

      await user.click(courseBox('1º Primaria'));
      await user.click(courseBox('1º Primaria'));

      expect(screen.queryByText(/Al guardar se borrar/)).not.toBeInTheDocument();
    });

    it('has no WCAG 2.1 AA violations with the notice', async () => {
      const user = userEvent.setup();
      const { container } = edit({ ruleCounts: { [FIRST]: 2 } });
      await user.click(courseBox('1º Primaria'));

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('opening it', () => {
    it('shows every field of the subject, its color chosen and its courses ticked with their sessions', () => {
      edit();

      expect(nameInput()).toHaveValue('Inglés');
      expect(codeInput()).toHaveValue('ING');
      expect(typeSelect()).toHaveValue('CORE');
      expect(statusSelect()).toHaveValue('ACTIVE');
      expect(descriptionInput()).toHaveValue('Lengua extranjera');
      expect(colorRadio('Verde')).toBeChecked();
      expect(courseBox('1º Primaria')).toBeChecked();
      expect(courseBox('2º Primaria')).toBeChecked();
      expect(courseBox('3º Primaria')).not.toBeChecked();
      expect(sessionsSelect('1º Primaria')).toHaveValue('3');
      expect(sessionsSelect('2º Primaria')).toHaveValue('5');
    });

    it('has Save disabled until something really changes', () => {
      edit();

      expect(saveButton()).toBeDisabled();
    });

    it('does not show the notice about a subject without courses', () => {
      edit();

      expect(emptyNotice()).not.toBeInTheDocument();
    });
  });

  describe('Save only with real changes', () => {
    it.each([
      ['the name', async (user: User) => user.type(nameInput(), ' avanzado')],
      ['the code', async (user: User) => user.type(codeInput(), '2')],
      [
        'the type',
        async (user: User) => {
          await user.selectOptions(typeSelect(), 'ELECTIVE');
        },
      ],
      [
        'the status',
        async (user: User) => {
          await user.selectOptions(statusSelect(), 'INACTIVE');
        },
      ],
      ['the description', async (user: User) => user.type(descriptionInput(), '.')],
      ['the color', async (user: User) => user.click(colorRadio('Rojo'))],
      [
        'the sessions of a course',
        async (user: User) => {
          await user.selectOptions(sessionsSelect('1º Primaria'), '4');
        },
      ],
      ['a course that is added', async (user: User) => user.click(courseBox('3º Primaria'))],
      ['a course that is removed', async (user: User) => user.click(courseBox('2º Primaria'))],
    ])('enables Save when %s changes', async (_name, change) => {
      const user = userEvent.setup();
      edit();

      await change(user);

      expect(saveButton()).toBeEnabled();
    });

    it('keeps Save disabled for a space at the end of the name or of the code', async () => {
      const user = userEvent.setup();
      edit();

      await user.type(nameInput(), '  ');
      await user.type(codeInput(), ' ');

      expect(saveButton()).toBeDisabled();
    });

    it('disables Save again when a change is undone', async () => {
      const user = userEvent.setup();
      edit();

      await user.selectOptions(sessionsSelect('1º Primaria'), '4');
      expect(saveButton()).toBeEnabled();
      await user.selectOptions(sessionsSelect('1º Primaria'), '3');

      expect(saveButton()).toBeDisabled();
    });

    it('disables Save again when the name is deleted and typed back', async () => {
      const user = userEvent.setup();
      edit();

      await user.clear(nameInput());
      await user.type(nameInput(), 'Inglés');

      expect(saveButton()).toBeDisabled();
    });
  });

  describe('ticking a course again', () => {
    it('gives back the sessions the subject had in a course that is ticked again', async () => {
      const user = userEvent.setup();
      edit();

      await user.selectOptions(sessionsSelect('2º Primaria'), '1');
      await user.click(courseBox('2º Primaria'));
      expect(screen.queryByLabelText(/Sesiones a la semana en 2º/u)).not.toBeInTheDocument();
      await user.click(courseBox('2º Primaria'));

      expect(sessionsSelect('2º Primaria')).toHaveValue('5');
      expect(saveButton()).toBeDisabled();
    });

    it('starts a course the subject did not have at 2 sessions', async () => {
      const user = userEvent.setup();
      edit();

      await user.click(courseBox('3º Primaria'));

      expect(sessionsSelect('3º Primaria')).toHaveValue('2');
    });

    it('disables Save again when a course that was added is unticked', async () => {
      const user = userEvent.setup();
      edit();

      await user.click(courseBox('3º Primaria'));
      expect(saveButton()).toBeEnabled();
      await user.click(courseBox('3º Primaria'));

      expect(saveButton()).toBeDisabled();
    });
  });

  describe('a subject without courses', () => {
    it('says at the start that at least one course has to be ticked, tied to the courses by aria-describedby', () => {
      edit({ initial: WITHOUT_COURSES });

      const notice = emptyNotice();
      expect(notice).toBeInTheDocument();
      expect(screen.getByRole('group', { name: texts.courses.legend })).toHaveAccessibleDescription(
        expect.stringContaining(texts.courses.emptySubject),
      );
    });

    it('does not say it when creating a subject, which starts with no courses', () => {
      renderForm();

      expect(emptyNotice()).not.toBeInTheDocument();
    });

    it('stops saying it once a course is ticked', async () => {
      const user = userEvent.setup();
      edit({ initial: WITHOUT_COURSES });

      await user.click(courseBox('1º Primaria'));

      expect(emptyNotice()).not.toBeInTheDocument();
    });

    it('does not send a change of the name alone: "Mark at least one course" with the focus there, nothing sent', async () => {
      const user = userEvent.setup();
      const { onSubmit } = edit({ initial: WITHOUT_COURSES });

      await user.type(nameInput(), ' 2');
      await user.click(saveButton());

      expect(await screen.findByText(texts.errors.courses.REQUIRED)).toBeInTheDocument();
      expect(courseBox('1º Primaria')).toHaveFocus();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('saves it once a course is ticked', async () => {
      const user = userEvent.setup();
      const { onSubmit } = edit({ initial: WITHOUT_COURSES });

      await user.click(courseBox('2º Primaria'));
      await user.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledOnce();
      });
      expect(onSubmit.mock.calls[0]?.[0].courses).toEqual([
        { courseId: SECOND, sessionsPerWeek: 2 },
      ]);
    });
  });

  describe('saving', () => {
    it('sends the final state: the cleaned texts and every ticked course in the order of the list', async () => {
      const user = userEvent.setup();
      const { onSubmit } = edit();

      await user.selectOptions(statusSelect(), 'INACTIVE');
      await user.click(courseBox('3º Primaria'));
      await user.selectOptions(sessionsSelect('1º Primaria'), '4');
      await user.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledOnce();
      });
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({
        ...LOADED,
        status: 'INACTIVE',
        courses: [
          { courseId: FIRST, sessionsPerWeek: 4 },
          { courseId: SECOND, sessionsPerWeek: 5 },
          { courseId: THIRD, sessionsPerWeek: 2 },
        ],
      });
    });

    it('sends only once if Save is pressed twice', async () => {
      const user = userEvent.setup();
      let finish: (result: SubjectSubmitResult) => void = () => undefined;
      const { onSubmit } = edit({
        result: new Promise<SubjectSubmitResult>((resolve) => {
          finish = resolve;
        }),
      });
      await user.type(nameInput(), ' 2');

      await user.click(saveButton());
      await user.click(screen.getByRole('button', { name: texts.saving }));
      finish({ status: 'done' });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledOnce();
      });
    });

    it('counts as a change, and does not send, a course of the subject that disappeared from the list', async () => {
      const user = userEvent.setup();
      const { onSubmit, rerenderWith } = edit();
      expect(saveButton()).toBeDisabled();

      rerenderWith({ status: 'loaded', courses: courses.filter(({ id }) => id !== SECOND) });

      expect(saveButton()).toBeEnabled();
      await user.click(saveButton());
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledOnce();
      });
      expect(onSubmit.mock.calls[0]?.[0].courses).toEqual([
        { courseId: FIRST, sessionsPerWeek: 3 },
      ]);
    });

    it('marks the code with the focus on a repeated code and keeps what was typed', async () => {
      const user = userEvent.setup();
      edit({ result: { status: 'codeTaken' } });

      await user.type(codeInput(), '2');
      await user.click(saveButton());

      expect(await screen.findByText(texts.errors.codeAlreadyExists)).toBeInTheDocument();
      expect(codeInput()).toHaveFocus();
      expect(codeInput()).toHaveValue('ING2');
    });

    it('keeps Save disabled while the courses load or failed, even with changes', async () => {
      const user = userEvent.setup();
      edit({ courses: { status: 'loading' } });

      await user.type(nameInput(), ' 2');

      expect(saveButton()).toBeDisabled();
    });
  });

  describe('accessibility', () => {
    it('has no WCAG 2.1 AA violations with the subject loaded', async () => {
      const { container } = edit();

      await expect(wcagViolations(container)).resolves.toEqual([]);
    });

    it('has no violations for a subject without courses, with the notice and with the error', async () => {
      const user = userEvent.setup();
      const { container } = edit({ initial: WITHOUT_COURSES });
      await expect(wcagViolations(container)).resolves.toEqual([]);

      await user.type(nameInput(), ' 2');
      await user.click(saveButton());
      await screen.findByText(texts.errors.courses.REQUIRED);

      await expect(wcagViolations(container)).resolves.toEqual([]);
    });
  });
});

type User = ReturnType<typeof userEvent.setup>;
