import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import type { Course } from '../services/coursesService';
import type { StudentFormValues } from '../validation/studentValidation';
import type { CoursesState } from './ProfessorForm';
import { StudentForm, type StudentSubmitResult } from './StudentForm';

const form = es.students.form;
const COURSE_1 = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_2 = '0192f5a0-0000-7000-8000-0000000000d2';
const CLASS_1A = '0192f5a0-0000-7000-8000-0000000000e1';
const CLASS_1B = '0192f5a0-0000-7000-8000-0000000000e2';
const CLASS_2A = '0192f5a0-0000-7000-8000-0000000000e3';

const courses: Course[] = [
  {
    id: COURSE_1,
    name: '1º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    studentCount: 0,
    classes: [
      { id: CLASS_1A, name: 'A', tutor: null, studentCount: 0 },
      { id: CLASS_1B, name: 'B', tutor: null, studentCount: 0 },
    ],
  },
  {
    id: COURSE_2,
    name: '2º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    studentCount: 0,
    classes: [{ id: CLASS_2A, name: 'A', tutor: null, studentCount: 0 }],
  },
];

const EMPTY: StudentFormValues = {
  firstName: '',
  lastName: '',
  courseId: '',
  classId: '',
  cafeteria: '',
  scholarship: false,
  foodType: '',
  observations: '',
};

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

function tree(options: {
  courses: CoursesState;
  onSubmit: (values: StudentFormValues) => Promise<StudentSubmitResult>;
  onRetryCourses?: () => void;
  failureMessage?: string;
}) {
  return (
    <MemoryRouter>
      <StudentForm
        initialValues={EMPTY}
        courses={options.courses}
        onSubmit={options.onSubmit}
        {...(options.onRetryCourses && { onRetryCourses: options.onRetryCourses })}
        {...(options.failureMessage !== undefined && { failureMessage: options.failureMessage })}
      />
    </MemoryRouter>
  );
}

function renderForm(
  options: {
    courses?: CoursesState;
    result?: StudentSubmitResult;
    onRetryCourses?: () => void;
    failureMessage?: string;
  } = {},
) {
  const onSubmit = vi
    .fn<(values: StudentFormValues) => Promise<StudentSubmitResult>>()
    .mockResolvedValue(options.result ?? { status: 'done' });
  const props = {
    courses: options.courses ?? ({ status: 'loaded', courses } as const),
    onSubmit,
    ...(options.onRetryCourses && { onRetryCourses: options.onRetryCourses }),
    ...(options.failureMessage !== undefined && { failureMessage: options.failureMessage }),
  };
  const view = render(tree(props));
  return {
    onSubmit,
    container: view.container,
    rerenderWith: (next: CoursesState) => {
      view.rerender(tree({ ...props, courses: next }));
    },
  };
}

const firstName = () => screen.getByLabelText(form.firstName);
const lastName = () => screen.getByLabelText(form.lastName);
const course = () => screen.getByLabelText(form.course);
const classSelect = () => screen.getByLabelText(form.class);
const yes = () => screen.getByRole('radio', { name: form.cafeteriaYes });
const no = () => screen.getByRole('radio', { name: form.cafeteriaNo });
const foodType = () => screen.getByLabelText(form.foodType);
const observations = () => screen.getByLabelText(form.observations);
const save = () => screen.getByRole('button', { name: form.save });
const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

/** Rellena lo mínimo para que el formulario sea válido. */
async function fillValid() {
  await userEvent.type(firstName(), 'Juan');
  await userEvent.type(lastName(), 'García');
  await userEvent.selectOptions(course(), COURSE_1);
  await userEvent.click(no());
}

describe('StudentForm', () => {
  describe('fields', () => {
    it('starts empty, with no answer about the cafeteria and without scholarship and food type', () => {
      renderForm();

      expect(firstName()).toHaveValue('');
      expect(lastName()).toHaveValue('');
      expect(course()).toHaveValue('');
      expect(yes()).not.toBeChecked();
      expect(no()).not.toBeChecked();
      expect(screen.queryByLabelText(form.scholarship)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(form.foodType)).not.toBeInTheDocument();
      expect(observations()).toHaveValue('');
    });

    it('groups the cafeteria answers in a fieldset named by its legend', () => {
      renderForm();

      expect(screen.getByRole('group', { name: form.cafeteria })).toContainElement(yes());
      expect(screen.getByRole('group', { name: form.cafeteria })).toContainElement(no());
    });

    it('offers the courses in the order received after the "choose" option', () => {
      renderForm();

      expect(optionTexts(course())).toEqual([form.courseChoose, '1º Primaria', '2º Primaria']);
    });
  });

  describe('class according to the course', () => {
    it('is disabled, with a hint, until a course is chosen', () => {
      renderForm();

      expect(classSelect()).toBeDisabled();
      expect(screen.getByText(form.classChooseCourse)).toBeVisible();
    });

    it('offers only the classes of the chosen course, after "No class", and changes with the course', async () => {
      renderForm();

      await userEvent.selectOptions(course(), COURSE_1);
      expect(classSelect()).toBeEnabled();
      expect(optionTexts(classSelect())).toEqual([form.classNone, 'A', 'B']);

      await userEvent.selectOptions(course(), COURSE_2);
      expect(optionTexts(classSelect())).toEqual([form.classNone, 'A']);
    });

    it('goes back to "No class" when the course changes', async () => {
      renderForm();
      await userEvent.selectOptions(course(), COURSE_1);
      await userEvent.selectOptions(classSelect(), CLASS_1B);
      expect(classSelect()).toHaveValue(CLASS_1B);

      await userEvent.selectOptions(course(), COURSE_2);

      expect(classSelect()).toHaveValue('');
    });

    it('is disabled again when the course goes back to none', async () => {
      renderForm();
      await userEvent.selectOptions(course(), COURSE_1);

      await userEvent.selectOptions(course(), '');

      expect(classSelect()).toBeDisabled();
    });
  });

  describe('cafeteria, scholarship and food type', () => {
    it('shows the scholarship (unchecked) and the food type only with "Yes"', async () => {
      renderForm();

      await userEvent.click(yes());

      expect(screen.getByLabelText(form.scholarship)).not.toBeChecked();
      expect(foodType()).toHaveValue('');

      await userEvent.click(no());

      expect(screen.queryByLabelText(form.scholarship)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(form.foodType)).not.toBeInTheDocument();
    });

    it('sends the scholarship and the food type with "Yes"', async () => {
      const { onSubmit } = renderForm();
      await userEvent.type(firstName(), 'Juan');
      await userEvent.type(lastName(), 'García');
      await userEvent.selectOptions(course(), COURSE_1);
      await userEvent.selectOptions(classSelect(), CLASS_1A);
      await userEvent.click(yes());
      await userEvent.click(screen.getByLabelText(form.scholarship));
      await userEvent.type(foodType(), 'Vegetariana');
      await userEvent.type(observations(), 'Necesita apoyo');

      await userEvent.click(save());

      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        firstName: 'Juan',
        lastName: 'García',
        courseId: COURSE_1,
        classId: CLASS_1A,
        cafeteria: 'yes',
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Necesita apoyo',
      });
    });

    it('discards the scholarship and the food type when the answer changes to "No"', async () => {
      const { onSubmit } = renderForm();
      await fillValid();
      await userEvent.click(yes());
      await userEvent.click(screen.getByLabelText(form.scholarship));
      await userEvent.type(foodType(), 'Sin gluten');

      await userEvent.click(no());
      await userEvent.click(yes());

      expect(screen.getByLabelText(form.scholarship)).not.toBeChecked();
      expect(foodType()).toHaveValue('');
      await userEvent.click(no());
      await userEvent.click(save());
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ cafeteria: 'no', scholarship: false, foodType: '' }),
      );
    });
  });

  describe('observations and sensitive data', () => {
    it('counts the characters of the observations', async () => {
      renderForm();

      expect(screen.getByText('0 de 5000 caracteres')).toBeVisible();
      await userEvent.type(observations(), 'Hola');

      expect(screen.getByText('4 de 5000 caracteres')).toBeVisible();
    });

    it('links the sensitive-data help to the observations and, with "Yes", to the food type', async () => {
      renderForm();
      await userEvent.click(yes());

      const help = screen.getByText(form.sensitiveHelp);
      expect(observations().getAttribute('aria-describedby')).toContain(help.id);
      expect(foodType().getAttribute('aria-describedby')).toContain(help.id);
    });
  });

  describe('validation', () => {
    it('shows the errors, focuses the first invalid field and sends nothing', async () => {
      const { onSubmit } = renderForm();

      await userEvent.click(save());

      expect(screen.getByText(form.errors.firstName.REQUIRED)).toBeVisible();
      expect(screen.getByText(form.errors.lastName.REQUIRED)).toBeVisible();
      expect(screen.getByText(form.errors.courseId.REQUIRED)).toBeVisible();
      expect(screen.getByText(form.errors.cafeteria.REQUIRED)).toBeVisible();
      expect(firstName()).toHaveFocus();
      expect(firstName()).toHaveAttribute('aria-invalid', 'true');
      expect(firstName().getAttribute('aria-describedby')).toContain('student-firstName-error');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('focuses the cafeteria answer when it is the first invalid field', async () => {
      renderForm();
      await userEvent.type(firstName(), 'Juan');
      await userEvent.type(lastName(), 'García');
      await userEvent.selectOptions(course(), COURSE_1);

      await userEvent.click(save());

      expect(yes()).toHaveFocus();
    });

    it('validates a text field when it loses the focus', async () => {
      renderForm();

      await userEvent.type(firstName(), 'Ana<');
      await userEvent.tab();

      expect(screen.getByText(form.errors.firstName.INVALID_CHARACTERS)).toBeVisible();
    });

    it('does not show an error for a field that was not visited yet', async () => {
      renderForm();

      await userEvent.click(firstName());
      await userEvent.tab();

      expect(screen.getByText(form.errors.firstName.REQUIRED)).toBeVisible();
      expect(screen.queryByText(form.errors.lastName.REQUIRED)).not.toBeInTheDocument();
    });

    it('clears the error of a field when it is edited', async () => {
      renderForm();
      await userEvent.click(save());

      await userEvent.type(firstName(), 'Ana');

      expect(screen.queryByText(form.errors.firstName.REQUIRED)).not.toBeInTheDocument();
    });

    it('rejects observations of more than 5000 characters', async () => {
      const { onSubmit } = renderForm();
      await fillValid();
      await userEvent.click(observations());
      await userEvent.paste('a'.repeat(5001));

      await userEvent.click(save());

      expect(
        screen.getByText(form.errors.observations.INVALID_LENGTH.replace('{{max}}', '5000')),
      ).toBeVisible();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('submitting', () => {
    it('sends the cleaned values once and shows "Saving…" with the button disabled while it waits', async () => {
      const onSubmit = vi
        .fn<(values: StudentFormValues) => Promise<StudentSubmitResult>>()
        .mockReturnValue(new Promise(() => undefined));
      render(tree({ courses: { status: 'loaded', courses }, onSubmit }));
      await fillValid();

      await userEvent.dblClick(save());

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: form.saving })).toBeDisabled();
    });

    it('shows the errors of the server under their fields and focuses the first one', async () => {
      const { onSubmit } = renderForm({
        result: {
          status: 'validationError',
          errors: { lastName: 'INVALID_CHARACTERS', courseId: 'NOT_FOUND' },
        },
      });
      await fillValid();

      await userEvent.click(save());

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(await screen.findByText(form.errors.lastName.INVALID_CHARACTERS)).toBeVisible();
      expect(screen.getByText(form.errors.courseId.NOT_FOUND)).toBeVisible();
      expect(lastName()).toHaveFocus();
    });

    it('shows a general alert and keeps what was typed when saving fails, and allows trying again', async () => {
      const { onSubmit } = renderForm({ result: { status: 'failed' } });
      await fillValid();

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent(form.errors.unavailable);
      expect(firstName()).toHaveValue('Juan');
      expect(course()).toHaveValue(COURSE_1);
      await waitFor(() => {
        expect(save()).toBeEnabled();
      });
      await userEvent.click(save());
      expect(onSubmit).toHaveBeenCalledTimes(2);
    });

    it('uses the failure message that the page gives', async () => {
      renderForm({ result: { status: 'failed' }, failureMessage: 'Otro mensaje' });
      await fillValid();

      await userEvent.click(save());

      expect(await screen.findByRole('alert')).toHaveTextContent('Otro mensaje');
    });
  });

  describe('courses', () => {
    it('disables the course, the class and the save button while the courses load', () => {
      renderForm({ courses: { status: 'loading' } });

      expect(screen.getByText(form.coursesLoading)).toBeVisible();
      expect(course()).toBeDisabled();
      expect(classSelect()).toBeDisabled();
      expect(save()).toBeDisabled();
    });

    it('shows an error with "Retry", disables the course and the save button, and retries', async () => {
      const onRetryCourses = vi.fn();
      renderForm({ courses: { status: 'error' }, onRetryCourses });

      expect(screen.getByRole('alert')).toHaveTextContent(form.coursesLoadError);
      expect(course()).toBeDisabled();
      expect(save()).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: es.students.retry }));

      expect(onRetryCourses).toHaveBeenCalledOnce();
    });

    it('explains that there are no courses, with a link to create one, and disables saving', () => {
      renderForm({ courses: { status: 'loaded', courses: [] } });

      expect(screen.getByText(form.noCourses)).toBeVisible();
      expect(screen.getByRole('link', { name: form.createCourse })).toHaveAttribute(
        'href',
        '/cursos/nuevo',
      );
      expect(course()).toBeDisabled();
      expect(save()).toBeDisabled();
    });

    it('clears the course and the class when the course that was chosen is no longer offered, keeping the rest', async () => {
      const { rerenderWith } = renderForm();
      await userEvent.type(firstName(), 'Juan');
      await userEvent.selectOptions(course(), COURSE_1);
      await userEvent.selectOptions(classSelect(), CLASS_1A);

      rerenderWith({ status: 'loaded', courses: [courses[1] as Course] });

      expect(course()).toHaveValue('');
      expect(classSelect()).toBeDisabled();
      expect(firstName()).toHaveValue('Juan');
    });

    it('clears only the class when the class that was chosen is no longer offered', async () => {
      const { rerenderWith } = renderForm();
      await userEvent.selectOptions(course(), COURSE_1);
      await userEvent.selectOptions(classSelect(), CLASS_1B);

      rerenderWith({
        status: 'loaded',
        courses: [
          {
            ...(courses[0] as Course),
            classes: [{ id: CLASS_1A, name: 'A', tutor: null, studentCount: 0 }],
          },
        ],
      });

      expect(course()).toHaveValue(COURSE_1);
      expect(classSelect()).toHaveValue('');
    });

    it('keeps the "no longer exists" error of the course when it is cleared because it is gone', async () => {
      const { rerenderWith } = renderForm({
        result: { status: 'validationError', errors: { courseId: 'NOT_FOUND' } },
      });
      await fillValid();
      await userEvent.click(save());
      expect(await screen.findByText(form.errors.courseId.NOT_FOUND)).toBeVisible();

      rerenderWith({ status: 'loaded', courses: [courses[1] as Course] });

      expect(screen.getByText(form.errors.courseId.NOT_FOUND)).toBeVisible();
      expect(course()).toHaveValue('');
    });
  });

  it('has no accessibility violations empty, with errors, with "Yes" and loading', async () => {
    const empty = renderForm();
    expect(await wcagViolations(empty.container)).toEqual([]);
    await userEvent.click(save());
    expect(await wcagViolations(empty.container)).toEqual([]);
    await userEvent.click(yes());
    expect(await wcagViolations(empty.container)).toEqual([]);
    empty.rerenderWith({ status: 'loading' });
    expect(await wcagViolations(empty.container)).toEqual([]);
    empty.rerenderWith({ status: 'error' });
    expect(await wcagViolations(empty.container)).toEqual([]);
  });
});
