import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
      />
    </MemoryRouter>,
  );
  return { onSubmit };
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
