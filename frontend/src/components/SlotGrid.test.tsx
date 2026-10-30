import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { SlotGrid, type SlotGridCell } from './SlotGrid';

const texts = es.slots.grid;

const periods = [
  { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
  { type: 'SESSION', startTime: '09:45', endTime: '10:30' },
  { type: 'BREAK', startTime: '10:30', endTime: '11:00' },
  { type: 'SESSION', startTime: '11:00', endTime: '11:45' },
] as const;

const cell = (dayOfWeek: number, sessionNumber: number): SlotGridCell => ({
  dayOfWeek,
  sessionNumber,
});

/** La cuadrícula controlada, como la usa la página. */
function Harness({
  initial = [],
  editable = true,
  onChange,
}: {
  initial?: SlotGridCell[];
  editable?: boolean;
  onChange?: (cells: SlotGridCell[]) => void;
}) {
  const [cells, setCells] = useState<SlotGridCell[]>(initial);
  return (
    <SlotGrid
      caption="Franjas prohibidas de Religión en 1º Primaria"
      periods={periods}
      cells={cells}
      editable={editable}
      onChange={(next) => {
        setCells(next);
        onChange?.(next);
      }}
    />
  );
}

const dayName = (day: number) => texts.days[String(day) as '1'];
const cellButton = (day: number, session: number, start: string, end: string) =>
  screen.getByRole('button', {
    name: texts.cell
      .replace('{{day}}', dayName(day))
      .replace('{{number}}', String(session))
      .replace('{{start}}', start)
      .replace('{{end}}', end),
  });
const dayButton = (day: number) =>
  screen.getByRole('button', { name: texts.selectDay.replace('{{day}}', dayName(day)) });
const sessionButton = (session: number) =>
  screen.getByRole('button', {
    name: texts.selectSession.replace('{{number}}', String(session)),
  });

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(' ')).join(', ')}`,
  );
}

describe('SlotGrid', () => {
  describe('the structure', () => {
    it('is a table with its caption, a column header per day and a row per period', () => {
      render(<Harness />);

      const table = screen.getByRole('table', {
        name: 'Franjas prohibidas de Religión en 1º Primaria',
      });
      const headers = within(table).getAllByRole('columnheader');
      const expectedNames = [texts.day, ...[1, 2, 3, 4, 5].map(dayName)];
      expect(headers).toHaveLength(expectedNames.length);
      headers.forEach((header, index) => {
        expect(header).toHaveTextContent(expectedNames[index]!);
      });
      expect(within(table).getAllByRole('row')).toHaveLength(1 + periods.length);
    });

    it('gives each session a row header with its number and hours', () => {
      render(<Harness />);

      expect(screen.getByRole('rowheader', { name: /Sesión 1/ })).toHaveTextContent('09:00–09:45');
      expect(screen.getByRole('rowheader', { name: /Sesión 2/ })).toHaveTextContent('09:45–10:30');
      expect(screen.getByRole('rowheader', { name: /Sesión 3/ })).toHaveTextContent('11:00–11:45');
    });

    it('shows the break as a separator row without any button', () => {
      render(<Harness />);

      const separator = screen.getByText('Recreo 10:30–11:00').closest('tr')!;

      expect(within(separator).queryByRole('button')).not.toBeInTheDocument();
      // Entre la 2ª y la 3ª sesión, en el orden de la jornada.
      const rows = screen.getAllByRole('row');
      expect(rows.indexOf(separator)).toBe(3);
    });

    it('has a short name for each day that is shown on narrow screens, and the hours in the row header', () => {
      render(<Harness />);

      const header = screen.getByRole('button', {
        name: texts.selectDay.replace('{{day}}', 'Miércoles'),
      });
      expect(header.querySelector('.d-sm-none')).toHaveTextContent(texts.daysShort['3']);
      expect(header.querySelector('.d-none.d-sm-inline')).toHaveTextContent('Miércoles');
      expect(screen.getByRole('rowheader', { name: /Sesión 1/ })).toHaveTextContent('09:00–09:45');
    });

    it('numbers the sessions in order without counting the breaks', () => {
      render(<Harness />);

      expect(cellButton(1, 3, '11:00', '11:45')).toBeInTheDocument();
    });
  });

  describe('editing', () => {
    it('has a button per cell with its name and aria-pressed', () => {
      render(<Harness initial={[cell(2, 1)]} />);

      expect(cellButton(1, 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'false');
      expect(cellButton(2, 1, '09:00', '09:45')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    });

    it('marks and unmarks a cell and reports the whole list ordered by day and session', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);

      await user.click(cellButton(3, 2, '09:45', '10:30'));
      await user.click(cellButton(1, 3, '11:00', '11:45'));

      expect(onChange).toHaveBeenLastCalledWith([cell(1, 3), cell(3, 2)]);

      await user.click(cellButton(3, 2, '09:45', '10:30'));

      expect(onChange).toHaveBeenLastCalledWith([cell(1, 3)]);
      expect(cellButton(3, 2, '09:45', '10:30')).toHaveAttribute('aria-pressed', 'false');
    });

    it('marks the whole column from the header of a day, and unmarks it when it was complete', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);

      await user.click(dayButton(1));
      expect(onChange).toHaveBeenLastCalledWith([cell(1, 1), cell(1, 2), cell(1, 3)]);

      await user.click(dayButton(1));
      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it('marks the missing cells of a column that was partly marked', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Harness initial={[cell(2, 2)]} onChange={onChange} />);

      await user.click(dayButton(2));

      expect(onChange).toHaveBeenLastCalledWith([cell(2, 1), cell(2, 2), cell(2, 3)]);
    });

    it('marks the row of a session in every day from its header, and unmarks it when it was complete', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Harness onChange={onChange} />);

      await user.click(sessionButton(2));
      expect(onChange).toHaveBeenLastCalledWith(
        [2, 2, 2, 2, 2].map((_, index) => cell(index + 1, 2)),
      );

      await user.click(sessionButton(2));
      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it('leaves the other cells alone when a header marks or unmarks', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<Harness initial={[cell(5, 3)]} onChange={onChange} />);

      await user.click(dayButton(1));
      await user.click(sessionButton(1));

      expect(onChange).toHaveBeenLastCalledWith([
        cell(1, 1),
        cell(1, 2),
        cell(1, 3),
        cell(2, 1),
        cell(3, 1),
        cell(4, 1),
        cell(5, 1),
        cell(5, 3),
      ]);
    });

    it('shows a marked cell with an icon and a hidden text, not only with a color', () => {
      render(<Harness initial={[cell(1, 1)]} />);

      const marked = cellButton(1, 1, '09:00', '09:45');
      const unmarked = cellButton(2, 1, '09:00', '09:45');

      expect(marked.querySelector('svg')).not.toBeNull();
      expect(marked.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(marked).toHaveTextContent(texts.forbiddenMark);
      expect(unmarked.querySelector('svg')).toBeNull();
      expect(unmarked).not.toHaveTextContent(texts.forbiddenMark);
    });
  });

  describe('read only', () => {
    it('has no buttons and shows the marked cells as text', () => {
      render(<Harness editable={false} initial={[cell(1, 1), cell(4, 3)]} />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getAllByText(texts.forbiddenMark)).toHaveLength(2);
      const row = screen.getByRole('rowheader', { name: /Sesión 1/ }).closest('tr')!;
      expect(within(row).getAllByRole('cell')[0]).toHaveTextContent(texts.forbiddenMark);
      expect(within(row).getAllByRole('cell')[1]).not.toHaveTextContent(texts.forbiddenMark);
    });

    it('does not call onChange', () => {
      const onChange = vi.fn();
      render(<Harness editable={false} onChange={onChange} />);

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it.each([true, false])(
      'has no WCAG 2.1 AA violations, editable %s, with marked cells',
      async (editable) => {
        const { container } = render(
          <Harness editable={editable} initial={[cell(1, 1), cell(2, 3), cell(5, 2)]} />,
        );

        expect(await wcagViolations(container)).toEqual([]);
      },
    );
  });
});
