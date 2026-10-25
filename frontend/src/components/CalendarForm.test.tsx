import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import type { CreateCalendarInput } from '../services/calendarsService';
import {
  CalendarForm,
  type CalendarCoursesState,
  type CalendarFormValues,
  type CalendarSubmitResult,
} from './CalendarForm';

const texts = es.calendars.form;

const courses: CalendarCoursesState = {
  status: 'loaded',
  courses: [
    { id: 'course-1', name: '1º Primaria' },
    { id: 'course-2', name: '2º Primaria' },
    { id: 'course-3', name: 'Infantil 3 años' },
  ],
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

const saveButton = () => screen.getByRole('button', { name: texts.save });
const nameField = () => screen.getByLabelText(texts.name);
const timeField = (label: string) => screen.getByLabelText<HTMLInputElement>(label);
const setTime = (label: string, value: string) => {
  fireEvent.change(timeField(label), { target: { value } });
};
const setNumber = (label: string | RegExp, value: string) => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};

/** Las horas de la tabla, en el orden de las filas: `[inicio, fin]` por periodo. */
function tableTimes(): string[][] {
  return screen.getAllByRole('group', { name: /^(Sesión|Recreo) \d+$/ }).map((row) =>
    within(row)
      .getAllByDisplayValue(/^\d{2}:\d{2}$/)
      .map((input) => (input as HTMLInputElement).value),
  );
}

describe('CalendarForm', () => {
  let onSubmit: Mock<(values: CreateCalendarInput) => Promise<CalendarSubmitResult>>;
  let onRetryCourses: Mock<() => void>;

  beforeEach(() => {
    onSubmit = vi
      .fn<(values: CreateCalendarInput) => Promise<CalendarSubmitResult>>()
      .mockResolvedValue({ status: 'done' });
    onRetryCourses = vi.fn<() => void>();
  });

  function renderForm(
    options: {
      courses?: CalendarCoursesState;
      followedBy?: Record<string, string>;
      initialValues?: CalendarFormValues;
      requireChanges?: boolean;
    } = {},
  ) {
    return render(
      <MemoryRouter>
        <CalendarForm
          courses={options.courses ?? courses}
          followedBy={options.followedBy ?? {}}
          onRetryCourses={onRetryCourses}
          onSubmit={onSubmit}
          failureMessage={texts.errors.unavailable}
          initialValues={options.initialValues}
          requireChanges={options.requireChanges}
        />
      </MemoryRouter>,
    );
  }

  describe('the starting point', () => {
    it('starts with six contiguous sessions of 45 minutes from 09:00 and only the name missing', () => {
      renderForm();

      expect(tableTimes()).toEqual([
        ['09:00', '09:45'],
        ['09:45', '10:30'],
        ['10:30', '11:15'],
        ['11:15', '12:00'],
        ['12:00', '12:45'],
        ['12:45', '13:30'],
      ]);
      expect(nameField()).toHaveValue('');
      expect(saveButton()).toBeEnabled();
    });

    it('labels every time with its own session, so each field has an accessible name', () => {
      renderForm();

      expect(timeField('Inicio de la sesión 1')).toHaveValue('09:00');
      expect(timeField('Fin de la sesión 6')).toHaveValue('13:30');
    });

    it('shows the summary of the day: sessions a day and a week and the lective minutes', () => {
      renderForm();

      expect(
        screen.getByText(/6 sesiones al día · 30 a la semana · 270 minutos lectivos al día/),
      ).toBeVisible();
    });
  });

  describe('generating the sessions', () => {
    it('generates the primary day: 09:00, 6 sessions of 45 minutes and a break of 30 after the 3rd', async () => {
      renderForm();

      await userEvent.click(screen.getByLabelText(texts.generate.withBreak));
      setNumber(texts.generate.breakAfter, '3');
      setNumber(texts.generate.breakDuration, '30');
      await userEvent.click(screen.getByRole('button', { name: texts.generate.button }));

      expect(tableTimes()).toEqual([
        ['09:00', '09:45'],
        ['09:45', '10:30'],
        ['10:30', '11:15'],
        ['11:15', '11:45'],
        ['11:45', '12:30'],
        ['12:30', '13:15'],
        ['13:15', '14:00'],
      ]);
      expect(screen.getByRole('group', { name: 'Recreo 1' })).toBeVisible();
      expect(
        screen.getByText(/6 sesiones al día · 30 a la semana · 270 minutos lectivos al día/),
      ).toBeVisible();
    });

    it('replaces what was edited by hand', async () => {
      renderForm();
      setTime('Fin de la sesión 1', '09:30');

      await userEvent.click(screen.getByRole('button', { name: texts.generate.button }));

      expect(timeField('Fin de la sesión 1')).toHaveValue('09:45');
    });

    it('generates from another start, number and duration', async () => {
      renderForm();

      fireEvent.change(screen.getByLabelText(texts.generate.start), { target: { value: '08:30' } });
      setNumber(texts.generate.sessionCount, '2');
      setNumber(texts.generate.duration, '50');
      await userEvent.click(screen.getByRole('button', { name: texts.generate.button }));

      expect(tableTimes()).toEqual([
        ['08:30', '09:20'],
        ['09:20', '10:10'],
      ]);
    });

    it.each([
      ['no sessions', texts.generate.sessionCount, '0'],
      ['nine sessions', texts.generate.sessionCount, '9'],
      ['a session of 0 minutes', texts.generate.duration, '0'],
      ['a session of 91 minutes', texts.generate.duration, '91'],
    ])('does not generate with %s: it says so and keeps the table', async (_name, label, value) => {
      renderForm();
      setNumber(label, value);

      await userEvent.click(screen.getByRole('button', { name: texts.generate.button }));

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.generate.invalid);
      expect(tableTimes()).toHaveLength(6);
    });

    it('does not generate with an empty start', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText(texts.generate.start), { target: { value: '' } });

      await userEvent.click(screen.getByRole('button', { name: texts.generate.button }));

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.generate.invalid);
    });

    it('offers the break only between two sessions: after the session 1 to the one before the last', async () => {
      renderForm();
      await userEvent.click(screen.getByLabelText(texts.generate.withBreak));

      const select = screen.getByLabelText(texts.generate.breakAfter);

      expect(
        within(select)
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['1', '2', '3', '4', '5']);
    });
  });

  describe('editing the periods by hand', () => {
    it('lets a time be changed one at a time, as the infant day needs', async () => {
      renderForm();
      await userEvent.click(screen.getByLabelText(texts.generate.withBreak));
      setNumber(texts.generate.breakAfter, '3');
      await userEvent.click(screen.getByRole('button', { name: texts.generate.button }));

      setTime('Fin del recreo 1', '12:00');
      setTime('Inicio de la sesión 4', '12:00');
      setTime('Fin de la sesión 4', '12:30');

      expect(tableTimes().slice(3, 5)).toEqual([
        ['11:15', '12:00'],
        ['12:00', '12:30'],
      ]);
    });

    it('adds a session after the last period, starting where it ends and lasting 45 minutes', async () => {
      renderForm();
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addSession }));

      expect(tableTimes()).toHaveLength(7);
      expect(timeField('Inicio de la sesión 7')).toHaveValue('13:30');
      expect(timeField('Fin de la sesión 7')).toHaveValue('14:15');
    });

    it('does not offer a ninth session', async () => {
      renderForm();
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addSession }));
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addSession }));

      expect(tableTimes()).toHaveLength(8);
      expect(screen.getByRole('button', { name: texts.periods.addSession })).toBeDisabled();
    });

    it('adds a break after the last period, and no third one', async () => {
      renderForm();
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addBreak }));

      expect(timeField('Inicio del recreo 1')).toHaveValue('13:30');
      expect(timeField('Fin del recreo 1')).toHaveValue('14:00');
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addBreak }));
      expect(screen.getByRole('button', { name: texts.periods.addBreak })).toBeDisabled();
    });

    it('removes a period and renumbers the sessions that follow', async () => {
      renderForm();

      await userEvent.click(screen.getByRole('button', { name: 'Quitar la sesión 2' }));

      expect(tableTimes()).toHaveLength(5);
      expect(timeField('Inicio de la sesión 2')).toHaveValue('10:30');
      expect(screen.queryByLabelText('Inicio de la sesión 6')).not.toBeInTheDocument();
    });

    it('does not let the last period be removed', async () => {
      renderForm();
      for (let remaining = 6; remaining > 1; remaining -= 1) {
        await userEvent.click(screen.getByRole('button', { name: 'Quitar la sesión 1' }));
      }

      expect(tableTimes()).toHaveLength(1);
      expect(screen.queryByRole('button', { name: /^Quitar la sesión/ })).not.toBeInTheDocument();
    });
  });

  describe('validating before sending', () => {
    it('asks for the name, focusing it, and sends nothing', async () => {
      renderForm();

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.name.REQUIRED)).toBeVisible();
      expect(nameField()).toHaveFocus();
      expect(nameField()).toHaveAttribute('aria-invalid', 'true');
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('flags a session that ends before it starts under its own row, with the focus on it', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      setTime('Fin de la sesión 2', '09:00');

      await userEvent.click(saveButton());

      const error = await screen.findByText(texts.errors.time.INVALID_RANGE);
      expect(error).toBeVisible();
      expect(timeField('Fin de la sesión 2')).toHaveFocus();
      expect(timeField('Fin de la sesión 2')).toHaveAttribute('aria-describedby', error.id);
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('flags a session of more than 90 minutes and an overlap', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      setTime('Fin de la sesión 1', '10:31');
      setTime('Inicio de la sesión 3', '10:00');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.time.TOO_LONG)).toBeVisible();
      expect(screen.getByText(texts.errors.time.OVERLAP)).toBeVisible();
      expect(timeField('Fin de la sesión 1')).toHaveFocus();
    });

    it('flags a break at the end, which goes between two sessions', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addBreak }));

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.type.NOT_ALLOWED)).toBeVisible();
      expect(timeField('Inicio del recreo 1')).toHaveFocus();
    });

    it('puts a break that was added and moved between the two sessions it separates when saving', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addBreak }));
      setTime('Inicio del recreo 1', '11:15');
      setTime('Fin del recreo 1', '11:45');
      setTime('Inicio de la sesión 4', '11:45');
      setTime('Fin de la sesión 4', '12:30');
      setTime('Inicio de la sesión 5', '12:30');
      setTime('Fin de la sesión 5', '13:15');
      setTime('Inicio de la sesión 6', '13:15');
      setTime('Fin de la sesión 6', '14:00');

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit.mock.calls[0]?.[0].periods).toEqual([
        { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
        { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
        { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
        { type: 'BREAK', startTime: '11:15', endTime: '11:45' },
        { type: 'SESSION', startTime: '11:45', endTime: '12:30' },
        { type: 'SESSION', startTime: '12:30', endTime: '13:15' },
        { type: 'SESSION', startTime: '13:15', endTime: '14:00' },
      ]);
      expect(screen.queryByText(texts.errors.type.NOT_ALLOWED)).not.toBeInTheDocument();
      expect(tableTimes()[3]).toEqual(['11:15', '11:45']);
      expect(
        screen.getAllByRole('group', { name: /^(Sesión|Recreo) \d+$/ })[3],
      ).toHaveAccessibleName('Recreo 1');
    });

    it('leaves the table in the order of the day and flags the overlap on the row that is seen', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addBreak }));
      setTime('Inicio del recreo 1', '11:15');
      setTime('Fin del recreo 1', '11:45');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.time.OVERLAP)).toBeVisible();
      expect(onSubmit).not.toHaveBeenCalled();
      const rows = screen.getAllByRole('group', { name: /^(Sesión|Recreo) \d+$/ });
      expect(rows[3]).toHaveAccessibleName('Recreo 1');
      expect(rows[4]).toHaveAccessibleName('Sesión 4');
      expect(within(rows[4] as HTMLElement).getByText(texts.errors.time.OVERLAP)).toBeVisible();
      expect(timeField('Inicio de la sesión 4')).toHaveFocus();
    });

    it('keeps the order of the rows while a time is empty and flags that time', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      await userEvent.click(screen.getByRole('button', { name: texts.periods.addBreak }));
      setTime('Inicio del recreo 1', '11:15');
      setTime('Fin del recreo 1', '11:45');
      setTime('Inicio de la sesión 3', '');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.time.REQUIRED)).toBeVisible();
      const rows = screen.getAllByRole('group', { name: /^(Sesión|Recreo) \d+$/ });
      expect(rows[rows.length - 1]).toHaveAccessibleName('Recreo 1');
    });

    it('tells in the help of the periods that they are ordered by time when saving', () => {
      renderForm();

      expect(screen.getByText(texts.periods.hint)).toBeVisible();
      expect(texts.periods.hint).toContain('hora al guardar');
    });

    it('flags an empty time', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      setTime('Inicio de la sesión 3', '');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.time.REQUIRED)).toBeVisible();
      expect(timeField('Inicio de la sesión 3')).toHaveFocus();
    });

    it('clears the error of a time when it is edited', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      setTime('Fin de la sesión 2', '09:00');
      await userEvent.click(saveButton());
      await screen.findByText(texts.errors.time.INVALID_RANGE);

      setTime('Fin de la sesión 2', '10:30');

      expect(screen.queryByText(texts.errors.time.INVALID_RANGE)).not.toBeInTheDocument();
    });
  });

  describe('sending', () => {
    it('sends the name, the periods in order and the chosen courses in the order of the list', async () => {
      renderForm();
      await userEvent.type(nameField(), '  Primaria ');
      await userEvent.click(screen.getByLabelText('2º Primaria'));
      await userEvent.click(screen.getByLabelText('1º Primaria'));

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledOnce();
      });
      expect(onSubmit.mock.calls[0]?.[0]).toEqual({
        name: '  Primaria ',
        periods: [
          { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
          { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
          { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
          { type: 'SESSION', startTime: '11:15', endTime: '12:00' },
          { type: 'SESSION', startTime: '12:00', endTime: '12:45' },
          { type: 'SESSION', startTime: '12:45', endTime: '13:30' },
        ],
        courseIds: ['course-1', 'course-2'],
      });
    });

    it('sends without courses when none is chosen', async () => {
      renderForm();
      await userEvent.type(nameField(), 'Infantil');

      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledOnce();
      });
      expect(onSubmit.mock.calls[0]?.[0].courseIds).toEqual([]);
    });

    it('sends once with a double click and shows "Guardando…" while it waits', async () => {
      onSubmit.mockReturnValue(new Promise(() => undefined));
      renderForm();
      await userEvent.type(nameField(), 'Primaria');

      await userEvent.dblClick(saveButton());

      expect(onSubmit).toHaveBeenCalledOnce();
      expect(screen.getByRole('button', { name: texts.saving })).toBeDisabled();
    });

    it('shows the general warning and keeps what was written when the page says it failed', async () => {
      onSubmit.mockResolvedValue({ status: 'failed' });
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      setTime('Fin de la sesión 1', '09:40');

      await userEvent.click(saveButton());

      expect(await screen.findByRole('alert')).toHaveTextContent(texts.errors.unavailable);
      expect(nameField()).toHaveValue('Primaria');
      expect(timeField('Fin de la sesión 1')).toHaveValue('09:40');
      expect(saveButton()).toBeEnabled();
    });

    it('marks the name, with the focus, when the name is taken', async () => {
      onSubmit.mockResolvedValue({ status: 'nameTaken' });
      renderForm();
      await userEvent.type(nameField(), 'Primaria');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.alreadyExists)).toBeVisible();
      expect(nameField()).toHaveFocus();
    });

    it('maps the errors of the server to their fields', async () => {
      onSubmit.mockResolvedValue({
        status: 'validationError',
        details: [
          { field: 'name', code: 'INVALID_CHARACTERS' },
          { field: 'periods[2].endTime', code: 'TOO_LONG' },
        ],
      });
      renderForm();
      await userEvent.type(nameField(), 'Primaria');

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.name.INVALID_CHARACTERS)).toBeVisible();
      expect(screen.getByText(texts.errors.time.TOO_LONG)).toBeVisible();
      expect(nameField()).toHaveFocus();
    });

    it('says that a course no longer exists, with the focus on the courses, when the server says so', async () => {
      onSubmit.mockResolvedValue({
        status: 'validationError',
        details: [{ field: 'courseIds[0]', code: 'NOT_FOUND' }],
      });
      renderForm();
      await userEvent.type(nameField(), 'Primaria');
      await userEvent.click(screen.getByLabelText('1º Primaria'));

      await userEvent.click(saveButton());

      expect(await screen.findByText(texts.errors.course.NOT_FOUND)).toBeVisible();
      expect(screen.getByRole('group', { name: texts.courses.legend })).toHaveFocus();
    });
  });

  describe('editing an existing calendar', () => {
    const initialValues: CalendarFormValues = {
      name: 'Primaria',
      periods: [
        { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
        { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
        { type: 'BREAK', startTime: '10:30', endTime: '11:00' },
        { type: 'SESSION', startTime: '11:00', endTime: '11:45' },
      ],
      courseIds: ['course-1', 'course-2'],
    };
    const edit = { initialValues, requireChanges: true };
    const course = (name: string) => screen.getByRole<HTMLInputElement>('checkbox', { name });

    it('starts with the name, the periods in order and the courses of the calendar, and nothing to save', () => {
      renderForm(edit);

      expect(nameField()).toHaveValue('Primaria');
      expect(tableTimes()).toEqual([
        ['09:00', '09:45'],
        ['09:45', '10:30'],
        ['10:30', '11:00'],
        ['11:00', '11:45'],
      ]);
      expect(screen.getByRole('group', { name: 'Recreo 1' })).toBeVisible();
      expect(course('1º Primaria')).toBeChecked();
      expect(course('2º Primaria')).toBeChecked();
      expect(course('Infantil 3 años')).not.toBeChecked();
      expect(saveButton()).toBeDisabled();
    });

    it('does not count outer spaces in the name as a change, nor a time that is changed and put back', async () => {
      renderForm(edit);

      await userEvent.type(nameField(), '  ');
      setTime('Fin de la sesión 3', '12:00');
      expect(saveButton()).toBeEnabled();
      setTime('Fin de la sesión 3', '11:45');

      expect(saveButton()).toBeDisabled();
    });

    it('enables saving with a real change and disables it again when it is undone', async () => {
      renderForm(edit);

      await userEvent.type(nameField(), ' 1º ciclo');
      expect(saveButton()).toBeEnabled();
      await userEvent.clear(nameField());
      await userEvent.type(nameField(), 'Primaria');

      expect(saveButton()).toBeDisabled();
    });

    it('enables saving when a course is unchecked and shows that it will be left without a calendar', async () => {
      renderForm(edit);

      await userEvent.click(course('2º Primaria'));

      expect(saveButton()).toBeEnabled();
      const note = screen.getByText(texts.courses.willFree);
      expect(note).toBeVisible();
      expect(course('2º Primaria')).toHaveAccessibleDescription(texts.courses.willFree);
      expect(
        screen.queryByText(texts.courses.willFree, { selector: '#calendar-course-course-1-note' }),
      ).toBeNull();

      await userEvent.click(course('2º Primaria'));
      expect(screen.queryByText(texts.courses.willFree)).not.toBeInTheDocument();
      expect(saveButton()).toBeDisabled();
    });

    it('warns of a course that follows another calendar, which moves when it is checked', async () => {
      renderForm({ ...edit, followedBy: { 'course-3': 'Infantil' } });

      expect(course('Infantil 3 años')).toHaveAccessibleDescription(
        'Ahora sigue «Infantil»: se moverá',
      );
      await userEvent.click(course('Infantil 3 años'));
      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit.mock.calls[0]?.[0].courseIds).toEqual(['course-1', 'course-2', 'course-3']);
    });

    it('sends the final state of the calendar in one submission, with the periods in the order of the day', async () => {
      renderForm(edit);

      await userEvent.clear(nameField());
      await userEvent.type(nameField(), 'Primaria 1º ciclo');
      setTime('Inicio del recreo 1', '10:30');
      setTime('Fin del recreo 1', '10:45');
      setTime('Inicio de la sesión 3', '10:45');
      await userEvent.click(course('1º Primaria'));
      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit).toHaveBeenCalledWith({
        name: 'Primaria 1º ciclo',
        periods: [
          { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
          { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
          { type: 'BREAK', startTime: '10:30', endTime: '10:45' },
          { type: 'SESSION', startTime: '10:45', endTime: '11:45' },
        ],
        courseIds: ['course-2'],
      });
    });

    it('lets the generator replace the periods, as in the creation', async () => {
      renderForm(edit);

      setNumber(texts.generate.sessionCount, '2');
      await userEvent.click(screen.getByRole('button', { name: texts.generate.button }));

      expect(tableTimes()).toEqual([
        ['09:00', '09:45'],
        ['09:45', '10:30'],
      ]);
      expect(saveButton()).toBeEnabled();
    });

    it.each<[string, CalendarCoursesState]>([
      ['are loading', { status: 'loading' }],
      ['could not be loaded', { status: 'error' }],
    ])('keeps the courses of the calendar untouched while they %s', async (_name, state) => {
      renderForm({ ...edit, courses: state });

      expect(saveButton()).toBeDisabled();
      await userEvent.type(nameField(), ' nuevo');
      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit.mock.calls[0]?.[0].courseIds).toEqual(['course-1', 'course-2']);
    });

    it('drops a course of the calendar that no longer exists, which counts as a change', async () => {
      renderForm({
        ...edit,
        courses: { status: 'loaded', courses: [{ id: 'course-1', name: '1º Primaria' }] },
      });

      expect(saveButton()).toBeEnabled();
      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledTimes(1);
      });
      expect(onSubmit.mock.calls[0]?.[0].courseIds).toEqual(['course-1']);
    });

    it('does not require changes to save when the form is for a creation', () => {
      renderForm({ initialValues });

      expect(saveButton()).toBeEnabled();
    });

    it('has no accessibility violations', async () => {
      const view = renderForm({ ...edit, followedBy: { 'course-3': 'Infantil' } });
      await userEvent.click(course('2º Primaria'));

      expect(await wcagViolations(view.container)).toEqual([]);
    });
  });

  describe('the courses that follow the calendar', () => {
    it('lists a checkbox per course, all unchecked', () => {
      renderForm();

      for (const name of ['1º Primaria', '2º Primaria', 'Infantil 3 años']) {
        expect(screen.getByLabelText(name)).not.toBeChecked();
      }
    });

    it('warns that a course that follows another calendar will be moved', () => {
      renderForm({ followedBy: { 'course-2': 'Infantil' } });

      const checkbox = screen.getByLabelText('2º Primaria');
      const warning = screen.getByText('Ahora sigue «Infantil»: se moverá');

      expect(warning).toBeVisible();
      expect(checkbox).toHaveAttribute('aria-describedby', expect.stringContaining(warning.id));
      expect(screen.getByLabelText('1º Primaria')).not.toHaveAttribute('aria-describedby');
    });

    it('shows a status while the courses load, and lets the calendar be saved meanwhile', () => {
      renderForm({ courses: { status: 'loading' } });

      expect(screen.getByRole('status')).toHaveTextContent(texts.courses.loading);
      expect(saveButton()).toBeEnabled();
    });

    it('shows an error with Retry when the courses cannot be loaded', async () => {
      renderForm({ courses: { status: 'error' } });

      expect(screen.getByRole('alert')).toHaveTextContent(texts.courses.loadError);
      await userEvent.click(screen.getByRole('button', { name: texts.courses.retry }));

      expect(onRetryCourses).toHaveBeenCalledOnce();
    });

    it('says there are no courses yet, with a link to create one', () => {
      renderForm({ courses: { status: 'loaded', courses: [] } });

      expect(screen.getByText(texts.courses.none)).toBeVisible();
      expect(screen.getByRole('link', { name: texts.courses.createCourse })).toHaveAttribute(
        'href',
        '/cursos/nuevo',
      );
    });

    it('forgets a chosen course that disappears from the list', async () => {
      const view = renderForm();
      await userEvent.type(nameField(), 'Primaria');
      await userEvent.click(screen.getByLabelText('1º Primaria'));

      await act(async () => {
        view.rerender(
          <MemoryRouter>
            <CalendarForm
              courses={{ status: 'loaded', courses: [{ id: 'course-2', name: '2º Primaria' }] }}
              followedBy={{}}
              onRetryCourses={onRetryCourses}
              onSubmit={onSubmit}
              failureMessage={texts.errors.unavailable}
            />
          </MemoryRouter>,
        );
        await Promise.resolve();
      });
      await userEvent.click(saveButton());

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledOnce();
      });
      expect(onSubmit.mock.calls[0]?.[0].courseIds).toEqual([]);
    });
  });

  it('has a link to cancel that goes back to the list', () => {
    renderForm();

    expect(screen.getByRole('link', { name: texts.cancel })).toHaveAttribute(
      'href',
      '/calendarios',
    );
  });

  it('has no accessibility violations, with and without errors', async () => {
    const view = renderForm({ followedBy: { 'course-2': 'Infantil' } });
    expect(await wcagViolations(view.container)).toEqual([]);

    setTime('Fin de la sesión 2', '09:00');
    await userEvent.click(saveButton());
    await screen.findByText(texts.errors.time.INVALID_RANGE);

    expect(await wcagViolations(view.container)).toEqual([]);
  });
});
