import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import type { CourseDraft } from '../validation/courseValidation';
import { CourseForm, type CourseSubmitResult } from './CourseForm';

const form = es.courses.form;

const saved: CourseDraft = {
  name: '1º Primaria',
  classes: [
    { id: 'k1', name: 'A' },
    { id: 'k2', name: 'B' },
    { id: 'k3', name: 'C' },
  ],
};

function renderForm(
  options: {
    initialValues?: CourseDraft;
    classTutors?: Record<string, string | null>;
    classStudentCounts?: Record<string, number>;
    classAssignmentCounts?: Record<string, number>;
    requireChanges?: boolean;
    result?: CourseSubmitResult;
  } = {},
) {
  const onSubmit = vi
    .fn<(values: CourseDraft) => Promise<CourseSubmitResult>>()
    .mockResolvedValue(options.result ?? { status: 'done' });
  render(
    <MemoryRouter>
      <CourseForm
        initialValues={options.initialValues ?? saved}
        onSubmit={onSubmit}
        failureMessage="No se pudo guardar"
        requireChanges={options.requireChanges}
        classTutors={options.classTutors}
        classStudentCounts={options.classStudentCounts}
        classAssignmentCounts={options.classAssignmentCounts}
      />
    </MemoryRouter>,
  );
  return { onSubmit };
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
const removeButton = (number: number) =>
  screen.getByRole('button', { name: `Quitar la clase ${String(number)}` });

describe('CourseForm with the classes of an existing course', () => {
  it('starts with the name and one row per class', () => {
    renderForm();

    expect(nameField()).toHaveValue('1º Primaria');
    expect(classField(1)).toHaveValue('A');
    expect(classField(2)).toHaveValue('B');
    expect(classField(3)).toHaveValue('C');
  });

  it('sends the id of each existing class even if it is renamed or others are removed, and none for the new ones', async () => {
    const { onSubmit } = renderForm();

    await userEvent.clear(classField(1));
    await userEvent.type(classField(1), 'Grupo A');
    await userEvent.click(removeButton(2));
    await userEvent.click(screen.getByRole('button', { name: form.addClass }));
    await userEvent.type(classField(3), 'D');
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        name: '1º Primaria',
        classes: [{ id: 'k1', name: 'Grupo A' }, { id: 'k3', name: 'C' }, { name: 'D' }],
      });
    });
  });

  it('sends a new course without any id', async () => {
    const { onSubmit } = renderForm({ initialValues: { name: '', classes: [{ name: '' }] } });

    await userEvent.type(nameField(), '2º Primaria');
    await userEvent.type(classField(1), 'A');
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        name: '2º Primaria',
        classes: [{ name: 'A' }],
      });
    });
  });

  it('does not offer to remove the last row', async () => {
    renderForm();

    await userEvent.click(removeButton(3));
    await userEvent.click(removeButton(2));

    expect(screen.queryByRole('button', { name: /^Quitar la clase/ })).not.toBeInTheDocument();
    expect(classField(1)).toHaveValue('A');
  });
});

describe('CourseForm that requires changes', () => {
  it('keeps Save disabled until something really changes', async () => {
    renderForm({ requireChanges: true });

    expect(saveButton()).toBeDisabled();

    await userEvent.type(nameField(), ' Tarde');

    expect(saveButton()).toBeEnabled();
  });

  it.each([
    ['a space at the end of the name', () => userEvent.type(nameField(), ' ')],
    [
      'a change that is undone',
      async () => {
        await userEvent.type(classField(1), 'x');
        await userEvent.type(classField(1), '{Backspace}');
      },
    ],
  ])('keeps Save disabled after %s', async (_name, act) => {
    renderForm({ requireChanges: true });

    await act();

    expect(saveButton()).toBeDisabled();
  });

  it('enables Save when a class is removed or added', async () => {
    renderForm({ requireChanges: true });

    await userEvent.click(removeButton(3));
    expect(saveButton()).toBeEnabled();

    await userEvent.click(screen.getByRole('button', { name: form.addClass }));
    await userEvent.type(classField(3), 'C');
    // Quitada la `C` original y añadida otra `C` nueva: no es el mismo estado (el `id` no se conserva).
    expect(saveButton()).toBeEnabled();
  });

  it('does not require changes unless asked: Save is enabled from the start', () => {
    renderForm();

    expect(saveButton()).toBeEnabled();
  });
});

describe('CourseForm with the tutors of the classes (read only)', () => {
  const classTutors = { k1: 'Ana García', k2: null, k3: 'Luis Pérez' };

  it('shows "Tutor: name" or "no tutor" under each class that already exists', () => {
    renderForm({ classTutors });

    for (const [number, text] of [
      [1, 'Tutor: Ana García'],
      [2, es.courses.noTutor],
      [3, 'Tutor: Luis Pérez'],
    ] as const) {
      const group = classField(number).closest('.mb-3') as HTMLElement;
      expect(within(group).getByText(text)).toBeVisible();
    }
  });

  it('describes the class field with its tutor, so a screen reader reads it', () => {
    renderForm({ classTutors });

    const described = classField(1).getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(described)).toHaveTextContent('Tutor: Ana García');
  });

  it('shows nothing for a new class and keeps the tutor of the others when one is removed', async () => {
    renderForm({ classTutors });

    await userEvent.click(removeButton(1));
    await userEvent.click(screen.getByRole('button', { name: form.addClass }));

    expect(screen.queryByText('Tutor: Ana García')).not.toBeInTheDocument();
    expect(screen.getByText('Tutor: Luis Pérez')).toBeVisible();
    const added = classField(3).closest('.mb-3') as HTMLElement;
    expect(within(added).queryByText(/Tutor:|Sin tutor/)).not.toBeInTheDocument();
  });

  it('shows no tutor text at all when the form has no tutors to show (creation)', () => {
    renderForm({ initialValues: { name: '', classes: [{ name: '' }] } });

    expect(screen.queryByText(es.courses.noTutor)).not.toBeInTheDocument();
  });

  it('does not count as a change and is not sent', async () => {
    const { onSubmit } = renderForm({ classTutors, requireChanges: true });

    expect(saveButton()).toBeDisabled();
    await userEvent.type(nameField(), ' Tarde');
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        name: '1º Primaria Tarde',
        classes: [
          { id: 'k1', name: 'A' },
          { id: 'k2', name: 'B' },
          { id: 'k3', name: 'C' },
        ],
      });
    });
  });

  it('keeps the tutor of a class that is renamed', async () => {
    renderForm({ classTutors });

    await userEvent.clear(classField(1));
    await userEvent.type(classField(1), 'Grupo A');

    expect(screen.getByText('Tutor: Ana García')).toBeVisible();
  });
});

describe('CourseForm choosing the tutor of each class', () => {
  const ANA = '0192f5a0-0000-7000-8000-0000000000f1';
  const LUIS = '0192f5a0-0000-7000-8000-0000000000f2';
  const MARTA = '0192f5a0-0000-7000-8000-0000000000f3';
  const options = [
    { id: ANA, label: 'Ana García · clase A' },
    { id: LUIS, label: 'Luis Pérez' },
    { id: MARTA, label: 'Marta Sanz' },
  ];
  const withTutors: CourseDraft = {
    name: '1º Primaria',
    classes: [
      { id: 'k1', name: 'A', tutorId: ANA },
      { id: 'k2', name: 'B', tutorId: null },
      { id: 'k3', name: 'C', tutorId: null },
    ],
  };
  const tutorSelect = (number: number) =>
    screen.getByRole('combobox', { name: `Tutor de la clase ${String(number)}` });

  type FormOptions = Parameters<typeof renderForm>[0] & {
    tutorOptions?: { id: string; label: string }[];
  };

  function renderWithTutors({ tutorOptions = options, ...rest }: FormOptions = {}) {
    const onSubmit = vi
      .fn<(values: CourseDraft) => Promise<CourseSubmitResult>>()
      .mockResolvedValue(rest?.result ?? { status: 'done' });
    const tree = (current: typeof tutorOptions | undefined) => (
      <MemoryRouter>
        <CourseForm
          initialValues={rest?.initialValues ?? withTutors}
          onSubmit={onSubmit}
          failureMessage="No se pudo guardar"
          requireChanges={rest?.requireChanges}
          tutorOptions={current}
        />
      </MemoryRouter>
    );
    const view = render(tree(tutorOptions));
    return {
      onSubmit,
      container: view.container,
      setOptions: (next: typeof tutorOptions | undefined) => {
        view.rerender(tree(next));
      },
    };
  }

  it('shows a select per row, also the new ones, labelled "Tutor" and named "Tutor de la clase N"', async () => {
    renderWithTutors();
    await userEvent.click(screen.getByRole('button', { name: form.addClass }));

    for (const number of [1, 2, 3, 4]) {
      expect(tutorSelect(number)).toBeVisible();
    }
    expect(screen.getAllByText(form.tutor)).toHaveLength(4);
  });

  it('starts at the saved tutor or at "Sin tutor" and offers every professor', () => {
    renderWithTutors();

    expect(tutorSelect(1)).toHaveValue(ANA);
    expect(tutorSelect(2)).toHaveValue('');
    expect(
      within(tutorSelect(2))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([form.noTutorOption, 'Ana García · clase A', 'Luis Pérez', 'Marta Sanz']);
  });

  it('sends the tutorId of every class, null for "Sin tutor", and the new class without tutor', async () => {
    const { onSubmit } = renderWithTutors();

    await userEvent.selectOptions(tutorSelect(1), '');
    await userEvent.selectOptions(tutorSelect(2), LUIS);
    await userEvent.click(screen.getByRole('button', { name: form.addClass }));
    await userEvent.type(classField(4), 'D');
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        name: '1º Primaria',
        classes: [
          { id: 'k1', name: 'A', tutorId: null },
          { id: 'k2', name: 'B', tutorId: LUIS },
          { id: 'k3', name: 'C', tutorId: null },
          { name: 'D', tutorId: null },
        ],
      });
    });
  });

  it('enables Save only when the tutor really changes: choosing the same one again is no change', async () => {
    renderWithTutors({ requireChanges: true });

    expect(saveButton()).toBeDisabled();
    await userEvent.selectOptions(tutorSelect(2), LUIS);
    expect(saveButton()).toBeEnabled();
    await userEvent.selectOptions(tutorSelect(2), '');
    expect(saveButton()).toBeDisabled();
    await userEvent.selectOptions(tutorSelect(1), ANA);
    expect(saveButton()).toBeDisabled();
  });

  it('marks DUPLICATE on the second row with the same professor, focuses it and sends nothing', async () => {
    const { onSubmit } = renderWithTutors();

    await userEvent.selectOptions(tutorSelect(3), ANA);
    await userEvent.click(saveButton());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(tutorSelect(3)).toHaveFocus();
    expect(tutorSelect(3)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(form.errors.tutorId.DUPLICATE)).toBeVisible();
    expect(tutorSelect(1)).not.toHaveAttribute('aria-invalid', 'true');
    expect(tutorSelect(1)).toHaveValue(ANA);
  });

  it('with no professors offers only "Sin tutor" and the link to create one', () => {
    renderWithTutors({ tutorOptions: [], initialValues: { ...saved } });

    expect(within(tutorSelect(1)).getAllByRole('option')).toHaveLength(1);
    expect(screen.getByText(form.noProfessors)).toBeVisible();
    expect(screen.getByRole('link', { name: form.createProfessor })).toHaveAttribute(
      'href',
      '/profesores/nuevo',
    );
  });

  it('without tutorOptions shows the read only tutor and sends no tutorId', async () => {
    const { onSubmit } = renderForm({
      initialValues: withTutors,
      classTutors: { k1: 'Ana García', k2: null, k3: null },
    });

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Tutor: Ana García')).toBeVisible();
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
        name: '1º Primaria',
        classes: [
          { id: 'k1', name: 'A' },
          { id: 'k2', name: 'B' },
          { id: 'k3', name: 'C' },
        ],
      });
    });
  });

  it('keeps what was typed and chosen when the options arrive after mounting', async () => {
    const { setOptions } = renderWithTutors({ tutorOptions: undefined });
    await userEvent.type(nameField(), ' Tarde');
    await userEvent.type(classField(2), 'x');

    setOptions(options);

    expect(nameField()).toHaveValue('1º Primaria Tarde');
    expect(classField(2)).toHaveValue('Bx');
    expect(tutorSelect(1)).toHaveValue(ANA);
  });

  it('marks the rows whose professor is no longer among the options after a tutorTaken, and focuses the first', async () => {
    const { onSubmit } = renderWithTutors({
      result: {
        status: 'tutorTaken',
        tutorOptions: [
          { id: LUIS, label: 'Luis Pérez' },
          { id: MARTA, label: 'Marta Sanz' },
        ],
      },
    });
    await userEvent.selectOptions(tutorSelect(2), LUIS);
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText(form.errors.professorAlreadyTutor)).toBeVisible();
    expect(screen.getByText(form.errors.tutorId.ALREADY_TUTOR)).toBeVisible();
    expect(tutorSelect(1)).toHaveFocus();
    expect(tutorSelect(1)).toHaveAttribute('aria-invalid', 'true');
    expect(tutorSelect(2)).not.toHaveAttribute('aria-invalid', 'true');
  });

  it('has no accessibility violations with the selects, with errors and without professors', async () => {
    const { container } = renderWithTutors();
    expect(await wcagViolations(container)).toEqual([]);

    await userEvent.selectOptions(tutorSelect(3), ANA);
    await userEvent.click(saveButton());
    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no accessibility violations without professors', async () => {
    const { container } = renderWithTutors({ tutorOptions: [] });

    expect(await wcagViolations(container)).toEqual([]);
  });
});

describe('CourseForm with the students of each class (US14_b)', () => {
  const dialogTexts = form.removeDialog;
  /** A tiene 12 alumnos, B ninguno y C uno. */
  const counts = { k1: 12, k2: 0, k3: 1 };

  const dialog = () => screen.queryByRole('dialog');
  const addButton = () => screen.getByRole('button', { name: form.addClass });

  it('shows the students of each existing class under its field, linked to it, and nothing with zero', () => {
    renderForm({ classStudentCounts: counts });

    expect(screen.getByText('12 alumnos')).toBeVisible();
    expect(screen.getByText('1 alumno')).toBeVisible();
    expect(classField(1)).toHaveAccessibleDescription('12 alumnos');
    expect(classField(3)).toHaveAccessibleDescription('1 alumno');
    expect(classField(2)).not.toHaveAccessibleDescription();
  });

  it('shows no numbers without the prop, as in the creation', () => {
    renderForm();

    expect(screen.queryByText(/alumno/)).not.toBeInTheDocument();
  });

  it('shows no number on a class added now', async () => {
    renderForm({ classStudentCounts: counts });

    await userEvent.click(addButton());

    expect(classField(4)).not.toHaveAccessibleDescription();
  });

  it('does not count the numbers as changes and does not send them', async () => {
    const { onSubmit } = renderForm({ classStudentCounts: counts, requireChanges: true });
    expect(saveButton()).toBeDisabled();

    await userEvent.type(classField(2), 'x');
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledOnce();
    });
    expect(onSubmit).toHaveBeenCalledWith({
      name: '1º Primaria',
      classes: [
        { id: 'k1', name: 'A' },
        { id: 'k2', name: 'Bx' },
        { id: 'k3', name: 'C' },
      ],
    });
  });

  it('asks before removing a class with students, naming it and its students', async () => {
    renderForm({ classStudentCounts: counts });

    await userEvent.click(removeButton(1));

    const open = await screen.findByRole('dialog', { name: '¿Quitar la clase A?' });
    expect(open).toHaveTextContent(
      'La clase A tiene 12 alumnos. Al guardar el curso quedarán en él sin clase.',
    );
    expect(screen.getByRole('button', { name: dialogTexts.cancel })).toHaveFocus();
    expect(classField(1)).toHaveValue('A');
  });

  it('asks too before removing a class with assignments of professors and no students', async () => {
    renderForm({ classStudentCounts: counts, classAssignmentCounts: { k2: 3 } });

    await userEvent.click(removeButton(2));

    const open = await screen.findByRole('dialog', { name: '¿Quitar la clase B?' });
    expect(open).toHaveTextContent(
      'Al guardar el curso se quitarán también sus 3 asignaciones de profesores.',
    );
    expect(open).not.toHaveTextContent('alumno');
  });

  it('says the students and the assignments when the class has both', async () => {
    renderForm({ classStudentCounts: counts, classAssignmentCounts: { k1: 1 } });

    await userEvent.click(removeButton(1));

    const open = await screen.findByRole('dialog', { name: '¿Quitar la clase A?' });
    expect(open).toHaveTextContent('La clase A tiene 12 alumnos.');
    expect(open).toHaveTextContent('se quitará también su asignación de profesor');
  });

  it('removes without asking a class with neither students nor assignments, and a class added now', async () => {
    renderForm({ classStudentCounts: counts, classAssignmentCounts: { k1: 2, k2: 0 } });

    await userEvent.click(removeButton(2));
    expect(dialog()).not.toBeInTheDocument();
    expect(classField(2)).toHaveValue('C');

    await userEvent.click(addButton());
    await userEvent.click(removeButton(3));
    expect(dialog()).not.toBeInTheDocument();
  });

  it.each([
    ['Cancel', () => userEvent.click(screen.getByRole('button', { name: dialogTexts.cancel }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
  ])(
    '%s keeps the row, sends nothing and returns the focus to its remove button',
    async (_name, close) => {
      const { onSubmit } = renderForm({ classStudentCounts: counts });
      await userEvent.click(removeButton(1));
      await screen.findByRole('dialog');

      await close();

      await waitFor(() => {
        expect(dialog()).not.toBeInTheDocument();
      });
      expect(classField(1)).toHaveValue('A');
      expect(removeButton(1)).toHaveFocus();
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );

  it('removes the row only when it is confirmed, sends nothing and moves the focus to "Añadir clase"', async () => {
    const { onSubmit } = renderForm({ classStudentCounts: counts });
    await userEvent.click(removeButton(1));

    await userEvent.click(await screen.findByRole('button', { name: dialogTexts.confirm }));

    await waitFor(() => {
      expect(addButton()).toHaveFocus();
    });
    expect(dialog()).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Clase 3')).not.toBeInTheDocument();
    expect(classField(1)).toHaveValue('B');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sends the form without the class that was confirmed as removed once it is saved', async () => {
    const { onSubmit } = renderForm({ classStudentCounts: counts });
    await userEvent.click(removeButton(1));
    await userEvent.click(await screen.findByRole('button', { name: dialogTexts.confirm }));
    await waitFor(() => {
      expect(dialog()).not.toBeInTheDocument();
    });

    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: '1º Primaria',
        classes: [
          { id: 'k2', name: 'B' },
          { id: 'k3', name: 'C' },
        ],
      });
    });
  });

  it('removes a class without students and a class added now without asking', async () => {
    renderForm({ classStudentCounts: counts });

    await userEvent.click(removeButton(2));
    expect(dialog()).not.toBeInTheDocument();
    expect(classField(2)).toHaveValue('C');

    await userEvent.click(addButton());
    await userEvent.click(removeButton(3));
    expect(dialog()).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Clase 3')).not.toBeInTheDocument();
  });

  it('never asks without the prop, even for classes that exist', async () => {
    renderForm();

    await userEvent.click(removeButton(1));

    expect(dialog()).not.toBeInTheDocument();
    expect(classField(1)).toHaveValue('B');
  });

  it('keeps each number with its class when another row is removed first', async () => {
    renderForm({ classStudentCounts: counts });
    await userEvent.click(removeButton(2)); // B, sin alumnos: sin diálogo

    await userEvent.click(removeButton(2)); // ahora la segunda fila es C, con un alumno

    expect(await screen.findByRole('dialog', { name: '¿Quitar la clase C?' })).toHaveTextContent(
      'La clase C tiene 1 alumno.',
    );
  });

  it('names the class with what is written now, or with its position when it is empty', async () => {
    renderForm({ classStudentCounts: counts });
    await userEvent.clear(classField(1));
    await userEvent.type(classField(1), 'Grupo A');

    await userEvent.click(removeButton(1));
    expect(await screen.findByRole('dialog', { name: '¿Quitar la clase Grupo A?' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: dialogTexts.cancel }));
    await waitFor(() => {
      expect(dialog()).not.toBeInTheDocument();
    });

    await userEvent.clear(classField(1));
    await userEvent.click(removeButton(1));
    expect(await screen.findByRole('dialog', { name: '¿Quitar la clase 1?' })).toBeVisible();
  });

  it('has no accessibility violations with the numbers and with the dialog open', async () => {
    renderForm({ classStudentCounts: counts });
    expect(await wcagViolations(document.body)).toEqual([]);

    await userEvent.click(removeButton(1));
    await screen.findByRole('dialog');

    expect(await wcagViolations(document.body)).toEqual([]);
  });
});
