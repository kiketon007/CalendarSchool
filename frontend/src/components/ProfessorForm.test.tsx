import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import type { Course } from '../services/coursesService';
import type { ProfessorFormValues } from '../validation/professorValidation';
import { ProfessorForm, type CoursesState, type ProfessorSubmitResult } from './ProfessorForm';

const ANA = { id: 'p-ana', firstName: 'Ana', lastName: 'García' };
const LUIS = { id: 'p-luis', firstName: 'Luis', lastName: 'Pérez' };

const courses: Course[] = [
  {
    id: 'k1',
    name: '1º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    classes: [
      { id: '0192f5a0-0000-7000-8000-0000000000e1', name: 'A', tutor: ANA },
      { id: '0192f5a0-0000-7000-8000-0000000000e2', name: 'B', tutor: null },
    ],
  },
  {
    id: 'k2',
    name: '2º Primaria',
    createdAt: '2026-10-19T09:30:00.000Z',
    classes: [{ id: '0192f5a0-0000-7000-8000-0000000000e3', name: 'A', tutor: LUIS }],
  },
];

const initial: ProfessorFormValues = {
  firstName: 'Ana',
  lastName: 'García',
  position: 'DIRECTOR',
  classId: '0192f5a0-0000-7000-8000-0000000000e1',
};

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
    result?: ProfessorSubmitResult;
    failureMessage?: string;
  } = {},
) {
  const onSubmit = vi
    .fn<(values: ProfessorFormValues) => Promise<ProfessorSubmitResult>>()
    .mockResolvedValue(options.result ?? { status: 'done' });
  const view = render(
    <MemoryRouter>
      <ProfessorForm
        initialValues={initial}
        courses={options.courses ?? { status: 'loaded', courses }}
        classMode="any"
        requireChanges
        onSubmit={onSubmit}
        {...(options.failureMessage !== undefined && { failureMessage: options.failureMessage })}
      />
    </MemoryRouter>,
  );
  return { onSubmit, container: view.container };
}

const classSelect = () => screen.getByLabelText(es.professors.form.class);
const saveButton = () => screen.getByRole('button', { name: es.professors.form.save });
const optionTexts = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((option) => option.textContent);

describe('ProfessorForm editing a professor (classMode "any")', () => {
  it('starts with the values it receives and Save disabled', () => {
    renderForm();

    expect(screen.getByLabelText(es.professors.form.firstName)).toHaveValue('Ana');
    expect(screen.getByLabelText(es.professors.form.lastName)).toHaveValue('García');
    expect(screen.getByLabelText(es.professors.form.position)).toHaveValue('DIRECTOR');
    expect(classSelect()).toHaveValue('0192f5a0-0000-7000-8000-0000000000e1');
    expect(saveButton()).toBeDisabled();
  });

  it('offers every class grouped by course, marking the ones that have another tutor', () => {
    renderForm();

    const groups = within(classSelect())
      .getAllByRole('group')
      .map((group) => [group.getAttribute('label'), optionTexts(group)]);
    expect(groups).toEqual([
      ['1º Primaria', ['A', 'B']],
      ['2º Primaria', ['A · tutor: Luis Pérez']],
    ]);
    expect(optionTexts(classSelect())[0]).toBe(es.professors.form.classNone);
  });

  it('enables Save only when something really changes, and not for spaces or an undone change', async () => {
    renderForm();
    const firstName = screen.getByLabelText(es.professors.form.firstName);

    await userEvent.type(firstName, ' ');
    expect(saveButton()).toBeDisabled();

    await userEvent.type(firstName, 'x');
    expect(saveButton()).toBeEnabled();

    await userEvent.type(firstName, '{Backspace}{Backspace}');
    expect(saveButton()).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText(es.professors.form.position), '');
    expect(saveButton()).toBeEnabled();
  });

  it('says who will lose the class when one with another tutor is chosen, linked to the field', async () => {
    renderForm();

    await userEvent.selectOptions(classSelect(), '0192f5a0-0000-7000-8000-0000000000e3');

    const notice = screen.getByText(
      es.professors.edit.replaceNotice
        .replace('{{tutor}}', 'Luis Pérez')
        .replace('{{course}}', '2º Primaria')
        .replace('{{className}}', 'A'),
    );
    expect(notice).toBeVisible();
    expect(classSelect().getAttribute('aria-describedby')).toContain(notice.id);
  });

  it('shows no notice for a free class, for the class of the professor or for no class', async () => {
    renderForm();

    await userEvent.selectOptions(classSelect(), '0192f5a0-0000-7000-8000-0000000000e2');
    expect(screen.queryByText(/dejará de ser tutor/)).not.toBeInTheDocument();
    await userEvent.selectOptions(classSelect(), '0192f5a0-0000-7000-8000-0000000000e1');
    expect(screen.queryByText(/dejará de ser tutor/)).not.toBeInTheDocument();
    await userEvent.selectOptions(classSelect(), '');
    expect(screen.queryByText(/dejará de ser tutor/)).not.toBeInTheDocument();
  });

  it('submits the final values once, also with a double click while the answer is pending', async () => {
    const { onSubmit } = renderForm();
    onSubmit.mockReturnValue(new Promise<ProfessorSubmitResult>(() => undefined));
    await userEvent.selectOptions(classSelect(), '0192f5a0-0000-7000-8000-0000000000e3');

    await userEvent.dblClick(saveButton());

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      ...initial,
      classId: '0192f5a0-0000-7000-8000-0000000000e3',
    });
    expect(screen.getByRole('button', { name: es.professors.form.saving })).toBeDisabled();
  });

  it('marks the fields of a validationError and focuses the first one', async () => {
    renderForm({
      result: { status: 'validationError', errors: { classId: 'NOT_FOUND' } },
    });
    await userEvent.selectOptions(classSelect(), '0192f5a0-0000-7000-8000-0000000000e2');

    await userEvent.click(saveButton());

    expect(await screen.findByText(es.professors.form.errors.classId.NOT_FOUND)).toBeVisible();
    expect(classSelect()).toHaveFocus();
    expect(classSelect()).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the failure message it receives with role alert and keeps what was typed', async () => {
    renderForm({ result: { status: 'failed' }, failureMessage: es.professors.edit.saveError });
    await userEvent.type(screen.getByLabelText(es.professors.form.firstName), 'x');

    await userEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(es.professors.edit.saveError);
    expect(screen.getByLabelText(es.professors.form.firstName)).toHaveValue('Anax');
  });

  it.each<[string, CoursesState, string]>([
    ['loading', { status: 'loading' }, es.professors.form.classesLoading],
    ['error', { status: 'error' }, es.professors.form.classesLoadError],
    ['with no classes', { status: 'loaded', courses: [] }, es.professors.form.noCourses],
  ])(
    'disables the class field with an explanation while the courses are %s',
    (_name, state, text) => {
      renderForm({ courses: state });

      expect(classSelect()).toBeDisabled();
      expect(screen.getByText(text)).toBeVisible();
    },
  );

  it('keeps the form usable when the courses are not available', async () => {
    const { onSubmit } = renderForm({ courses: { status: 'error' } });
    await userEvent.type(screen.getByLabelText(es.professors.form.firstName), 'x');

    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
  });

  it('has no accessibility violations loaded, with the notice and with errors', async () => {
    const { container } = renderForm();
    expect(await wcagViolations(container)).toEqual([]);

    await userEvent.selectOptions(classSelect(), '0192f5a0-0000-7000-8000-0000000000e3');
    expect(await wcagViolations(container)).toEqual([]);

    await userEvent.clear(screen.getByLabelText(es.professors.form.firstName));
    await userEvent.click(saveButton());
    expect(await screen.findByText(es.professors.form.errors.firstName.REQUIRED)).toBeVisible();
    expect(await wcagViolations(container)).toEqual([]);
  });
});
