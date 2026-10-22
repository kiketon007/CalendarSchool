import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { coursesService, type Course, type CreateCourseOutcome } from '../services/coursesService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { CreateCoursePage } from './CreateCoursePage';

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

const created: Course = {
  id: 'c1',
  name: '1º Primaria',
  createdAt: '2026-10-19T09:30:00.000Z',
  studentCount: 0,
  classes: [
    { id: 'c1-A', name: 'A', tutor: null, studentCount: 0 },
    { id: 'c1-B', name: 'B', tutor: null, studentCount: 0 },
  ],
};

const form = es.courses.form;

/** Muestra la ruta y el estado de la navegación para comprobar adónde va la página. */
function Destination() {
  const location = useLocation();
  const state: unknown = location.state;
  return <div data-testid="destination">{`${location.pathname} ${JSON.stringify(state)}`}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/cursos/nuevo']}>
      <SessionProvider>
        <Routes>
          <Route path="/cursos/nuevo" element={<CreateCoursePage />} />
          <Route path="/cursos" element={<Destination />} />
        </Routes>
      </SessionProvider>
    </MemoryRouter>,
  );
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
const addButton = () => screen.getByRole('button', { name: form.addClass });
const saveButton = () => screen.getByRole('button', { name: form.save });

async function fill(name: string, classNames: string[]) {
  await userEvent.type(nameField(), name);
  await userEvent.type(classField(1), classNames[0] ?? '');
  for (const [index, className] of classNames.slice(1).entries()) {
    await userEvent.click(addButton());
    await userEvent.type(classField(index + 2), className);
  }
}

describe('CreateCoursePage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let create: MockInstance<typeof coursesService.create>;

  beforeEach(() => {
    refresh = vi
      .spyOn(sessionService, 'refresh')
      .mockResolvedValue({ status: 'authenticated', data: sessionData });
    create = vi
      .spyOn(coursesService, 'create')
      .mockResolvedValue({ status: 'created', course: created });
  });

  afterEach(() => {
    refresh.mockRestore();
    create.mockRestore();
  });

  describe('the form', () => {
    it('shows the title, the name field and one class row', async () => {
      renderPage();

      expect(await screen.findByRole('heading', { level: 1, name: form.title })).toBeVisible();
      expect(nameField()).toHaveValue('');
      expect(classField(1)).toHaveValue('');
      expect(screen.queryByLabelText('Clase 2')).toBeNull();
    });

    it('does not offer to remove the only class', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });

      expect(screen.queryByRole('button', { name: /Quitar la clase/ })).toBeNull();
    });

    it('adds rows numbered in order and removes any of them, renumbering the rest', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await userEvent.click(addButton());
      await userEvent.click(addButton());
      await userEvent.type(classField(1), 'A');
      await userEvent.type(classField(2), 'B');
      await userEvent.type(classField(3), 'C');

      await userEvent.click(screen.getByRole('button', { name: 'Quitar la clase 2' }));

      expect(classField(1)).toHaveValue('A');
      expect(classField(2)).toHaveValue('C');
      expect(screen.queryByLabelText('Clase 3')).toBeNull();
    });

    it('gives the remove button of every row a name that identifies the row', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await userEvent.click(addButton());

      expect(screen.getByRole('button', { name: 'Quitar la clase 1' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Quitar la clase 2' })).toBeVisible();
    });

    it('allows up to 12 classes and then disables "Añadir clase"', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });

      for (let count = 1; count < 12; count += 1) {
        await userEvent.click(addButton());
      }

      expect(classField(12)).toBeVisible();
      expect(addButton()).toBeDisabled();
    });

    it('links "Cancelar" back to the list', async () => {
      renderPage();

      expect(await screen.findByRole('link', { name: form.cancel })).toHaveAttribute(
        'href',
        '/cursos',
      );
    });
  });

  describe('validation before sending', () => {
    it('shows the errors under their fields and sends nothing', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });

      await userEvent.click(saveButton());

      expect(screen.getByText(form.errors.name.REQUIRED)).toBeVisible();
      expect(screen.getByText(form.errors.className.REQUIRED)).toBeVisible();
      expect(create).not.toHaveBeenCalled();
    });

    it('marks the invalid fields with aria-invalid and ties each error to its field', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });

      await userEvent.click(saveButton());

      expect(nameField()).toHaveAttribute('aria-invalid', 'true');
      const nameError = screen.getByText(form.errors.name.REQUIRED);
      expect(nameField().getAttribute('aria-describedby')).toContain(nameError.id);
      expect(classField(1)).toHaveAttribute('aria-invalid', 'true');
      const rowError = screen.getByText(form.errors.className.REQUIRED);
      expect(classField(1).getAttribute('aria-describedby')).toContain(rowError.id);
    });

    it('moves the focus to the first invalid field', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await userEvent.type(nameField(), '1º Primaria');

      await userEvent.click(saveButton());

      expect(classField(1)).toHaveFocus();
    });

    it('marks the second class as repeated when it has the same name without regard to case or spaces', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A', ' a ']);

      await userEvent.click(saveButton());

      expect(classField(2)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(form.errors.className.DUPLICATE)).toBeVisible();
      expect(classField(1)).not.toHaveAttribute('aria-invalid', 'true');
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      ['a name with a forbidden character', '1º <b>', form.errors.name.INVALID_CHARACTERS],
      [
        'a name that is too long',
        'a'.repeat(101),
        form.errors.name.INVALID_LENGTH.replace('{{max}}', '100'),
      ],
    ])('rejects %s', async (_label, name, message) => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await userEvent.type(nameField(), name);
      await userEvent.type(classField(1), 'A');

      await userEvent.click(saveButton());

      expect(screen.getByText(message)).toBeVisible();
      expect(create).not.toHaveBeenCalled();
    });

    it('clears the error of a field as soon as it is edited', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await userEvent.click(saveButton());

      await userEvent.type(nameField(), '1');

      expect(screen.queryByText(form.errors.name.REQUIRED)).toBeNull();
      expect(nameField()).not.toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByText(form.errors.className.REQUIRED)).toBeVisible();
    });
  });

  describe('sending', () => {
    it('sends the name and the classes once and goes to the list with the name of the new course', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A', 'B']);

      await userEvent.click(saveButton());

      expect(create).toHaveBeenCalledExactlyOnceWith(expect.any(Function), {
        name: '1º Primaria',
        classNames: ['A', 'B'],
      });
      const destination = await screen.findByTestId('destination');
      expect(destination).toHaveTextContent('/cursos');
      expect(destination).toHaveTextContent('{"courseCreated":"1º Primaria"}');
    });

    it('sends a single request when "Guardar" is pressed twice in a row, and disables it meanwhile', async () => {
      let resolve: (outcome: CreateCourseOutcome) => void = () => undefined;
      create.mockReturnValue(
        new Promise<CreateCourseOutcome>((done) => {
          resolve = done;
        }),
      );
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A']);

      await userEvent.dblClick(saveButton());

      expect(create).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: form.saving })).toBeDisabled();
      resolve({ status: 'created', course: created });
      await screen.findByTestId('destination');
    });

    it('marks the fields that the server rejects, by position', async () => {
      create.mockResolvedValue({
        status: 'validationError',
        details: [
          { field: 'name', code: 'INVALID_CHARACTERS' },
          { field: 'classes[1].name', code: 'DUPLICATE' },
        ],
      });
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A', 'B']);

      await userEvent.click(saveButton());

      expect(await screen.findByText(form.errors.name.INVALID_CHARACTERS)).toBeVisible();
      expect(screen.getByText(form.errors.className.DUPLICATE)).toBeVisible();
      expect(classField(2)).toHaveAttribute('aria-invalid', 'true');
      expect(saveButton()).toBeEnabled();
    });

    it('marks the name when the course already exists, and keeps what was typed', async () => {
      create.mockResolvedValue({ status: 'alreadyExists' });
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A', 'B']);

      await userEvent.click(saveButton());

      expect(await screen.findByText(form.errors.alreadyExists)).toBeVisible();
      expect(nameField()).toHaveAttribute('aria-invalid', 'true');
      expect(nameField()).toHaveValue('1º Primaria');
      expect(classField(2)).toHaveValue('B');
    });

    it('stops showing "already exists" when the name is edited', async () => {
      create.mockResolvedValue({ status: 'alreadyExists' });
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A']);
      await userEvent.click(saveButton());
      await screen.findByText(form.errors.alreadyExists);

      await userEvent.type(nameField(), 'B');

      expect(screen.queryByText(form.errors.alreadyExists)).toBeNull();
    });

    it('shows a generic error in an alert, without technical details, keeps the form and allows trying again', async () => {
      create.mockResolvedValueOnce({ status: 'unavailable' });
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A']);

      await userEvent.click(saveButton());

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(form.errors.unavailable);
      expect(nameField()).toHaveValue('1º Primaria');
      expect(saveButton()).toBeEnabled();

      await userEvent.click(saveButton());

      expect(create).toHaveBeenCalledTimes(2);
      expect(await screen.findByTestId('destination')).toBeInTheDocument();
    });

    it('does nothing visible when the session is lost: the layout redirects', async () => {
      create.mockResolvedValue({ status: 'unauthenticated' });
      renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A']);

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(create).toHaveBeenCalled();
      });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByTestId('destination')).toBeNull();
      expect(saveButton()).toBeEnabled();
    });
  });

  describe('accessibility', () => {
    it('has no WCAG violations when empty', async () => {
      const { container } = renderPage();
      await screen.findByRole('heading', { level: 1 });

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations with errors in the name and in a class', async () => {
      const { container } = renderPage();
      await screen.findByRole('heading', { level: 1 });
      await userEvent.click(addButton());
      await userEvent.type(classField(1), 'A');
      await userEvent.type(classField(2), 'a');
      await userEvent.click(saveButton());
      await screen.findByText(form.errors.name.REQUIRED);

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('has no WCAG violations with the generic error', async () => {
      create.mockResolvedValue({ status: 'unavailable' });
      const { container } = renderPage();
      await screen.findByRole('heading', { level: 1 });
      await fill('1º Primaria', ['A']);
      await userEvent.click(saveButton());
      await screen.findByRole('alert');

      expect(await wcagViolations(container)).toEqual([]);
    });

    it('groups the classes in a fieldset named by its legend', async () => {
      renderPage();
      await screen.findByRole('heading', { level: 1 });

      const group = screen.getByRole('group', { name: form.classesLegend });

      expect(within(group).getByLabelText('Clase 1')).toBeVisible();
    });
  });
});
