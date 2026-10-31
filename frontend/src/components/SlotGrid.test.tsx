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

  describe('preferred mode', () => {
    const blocked = [cell(1, 1), cell(1, 2), cell(1, 3), cell(2, 1)];

    function PreferredHarness({
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
          caption="Franjas preferidas de Religión en 1º Primaria"
          periods={periods}
          cells={cells}
          editable={editable}
          mode="preferred"
          blockedCells={blocked}
          onChange={(next) => {
            setCells(next);
            onChange?.(next);
          }}
        />
      );
    }

    const forbiddenName = (day: number, session: number, start: string, end: string) =>
      texts.cellForbidden
        .replace('{{day}}', dayName(day))
        .replace('{{number}}', String(session))
        .replace('{{start}}', start)
        .replace('{{end}}', end);

    it('shows a forbidden cell as disabled, with the reason in its name, and an icon and a hidden text', () => {
      render(<PreferredHarness />);

      const forbidden = screen.getByRole('button', {
        name: forbiddenName(2, 1, '09:00', '09:45'),
      });

      expect(forbidden).toBeDisabled();
      expect(forbidden.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      expect(forbidden).toHaveTextContent(texts.forbiddenMark);
      expect(cellButton(2, 2, '09:45', '10:30')).toBeEnabled();
    });

    it('marks a free cell as preferred with its own icon and a hidden text, not the cross', () => {
      render(<PreferredHarness initial={[cell(3, 1)]} />);

      const preferred = cellButton(3, 1, '09:00', '09:45');

      expect(preferred).toHaveAttribute('aria-pressed', 'true');
      expect(preferred).toHaveTextContent(texts.preferredMark);
      expect(preferred).not.toHaveTextContent(texts.forbiddenMark);
      expect(preferred.querySelector('svg')).not.toBeNull();
    });

    it('does not mark a forbidden cell when it is clicked, nor report a change', async () => {
      const onChange = vi.fn();
      render(<PreferredHarness onChange={onChange} />);

      await userEvent.click(
        screen.getByRole('button', { name: forbiddenName(1, 1, '09:00', '09:45') }),
      );

      expect(onChange).not.toHaveBeenCalled();
    });

    it('shows a preferred cell that was forbidden after as ignored, and lets it be unmarked', async () => {
      const onChange = vi.fn();
      render(<PreferredHarness initial={[cell(2, 1), cell(3, 1)]} onChange={onChange} />);

      const ignored = cellButton(2, 1, '09:00', '09:45');

      expect(ignored).toBeEnabled();
      expect(ignored).toHaveAttribute('aria-pressed', 'true');
      expect(ignored).toHaveTextContent(texts.preferredForbiddenMark);
      await userEvent.click(ignored);
      expect(onChange).toHaveBeenLastCalledWith([cell(3, 1)]);
    });

    it('marks, from a day header, only the cells of the day that are not forbidden', async () => {
      const onChange = vi.fn();
      render(<PreferredHarness onChange={onChange} />);

      await userEvent.click(
        screen.getByRole('button', {
          name: texts.selectDayPreferred.replace('{{day}}', dayName(2)),
        }),
      );

      expect(onChange).toHaveBeenLastCalledWith([cell(2, 2), cell(2, 3)]);
    });

    it('does nothing from the header of a day that is entirely forbidden', () => {
      render(<PreferredHarness />);

      expect(
        screen.getByRole('button', {
          name: texts.selectDayPreferred.replace('{{day}}', dayName(1)),
        }),
      ).toBeDisabled();
    });

    it('marks, from a session header, the days where the session is not forbidden, and unmarks them', async () => {
      const onChange = vi.fn();
      render(<PreferredHarness onChange={onChange} />);
      const header = screen.getByRole('button', {
        name: texts.selectSessionPreferred.replace('{{number}}', '1'),
      });

      await userEvent.click(header);
      expect(onChange).toHaveBeenLastCalledWith([cell(3, 1), cell(4, 1), cell(5, 1)]);

      await userEvent.click(header);
      expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it('keeps an ignored preferred cell when a header marks the rest of its day', async () => {
      const onChange = vi.fn();
      render(<PreferredHarness initial={[cell(2, 1)]} onChange={onChange} />);

      await userEvent.click(
        screen.getByRole('button', {
          name: texts.selectDayPreferred.replace('{{day}}', dayName(2)),
        }),
      );

      expect(onChange).toHaveBeenLastCalledWith([cell(2, 1), cell(2, 2), cell(2, 3)]);
    });

    it('shows the three states as text without buttons when it is read only', () => {
      render(<PreferredHarness editable={false} initial={[cell(2, 1), cell(3, 1)]} />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getAllByText(texts.preferredMark)).toHaveLength(1);
      expect(screen.getAllByText(texts.preferredForbiddenMark)).toHaveLength(1);
      expect(screen.getAllByText(texts.forbiddenMark)).toHaveLength(3);
    });

    it.each([true, false])(
      'has no WCAG 2.1 AA violations, editable %s, with the three states',
      async (editable) => {
        const { container } = render(
          <PreferredHarness editable={editable} initial={[cell(2, 1), cell(3, 1), cell(5, 2)]} />,
        );

        expect(await wcagViolations(container)).toEqual([]);
      },
    );
  });
});

describe('SlotGrid in unavailable mode', () => {
  const partialOf = (target: SlotGridCell, label: string) => ({ cell: target, label });

  function renderGrid({
    cells = [],
    partialCells = [],
    editable = true,
  }: {
    cells?: SlotGridCell[];
    partialCells?: { cell: SlotGridCell; label: string }[];
    editable?: boolean;
  } = {}) {
    const onToggleCell = vi.fn<(target: SlotGridCell) => void>();
    const onToggleLine = vi.fn<(group: SlotGridCell[]) => void>();
    const view = render(
      <SlotGrid
        caption="Disponibilidad de Ana García en el calendario Primaria"
        periods={periods}
        cells={cells}
        partialCells={partialCells}
        editable={editable}
        mode="unavailable"
        onToggleCell={onToggleCell}
        onToggleLine={onToggleLine}
      />,
    );
    return { ...view, onToggleCell, onToggleLine };
  }

  const partialName = (day: number, session: number, start: string, end: string, ranges: string) =>
    texts.cellPartial
      .replace('{{day}}', dayName(day))
      .replace('{{number}}', String(session))
      .replace('{{start}}', start)
      .replace('{{end}}', end)
      .replace('{{ranges}}', ranges);

  it('shows a cell that is unavailable with a cross and its hidden text, pressed', () => {
    renderGrid({ cells: [cell(1, 1)] });

    const button = cellButton(1, 1, '09:00', '09:45');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(within(button).getByText(texts.unavailableMark)).toHaveClass('visually-hidden');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('shows an available cell as not pressed and without a mark', () => {
    renderGrid();

    const button = cellButton(2, 1, '09:00', '09:45');
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button.querySelector('svg')).toBeNull();
    expect(within(button).queryByText(texts.unavailableMark)).not.toBeInTheDocument();
  });

  it('shows a partial cell with its own icon, its text and the hours in its name, as mixed', () => {
    renderGrid({ partialCells: [partialOf(cell(3, 2), '09:50–10:10')] });

    const button = screen.getByRole('button', {
      name: partialName(3, 2, '09:45', '10:30', '09:50–10:10'),
    });
    expect(button).toHaveAttribute('aria-pressed', 'mixed');
    expect(within(button).getByText(texts.partialMark)).toHaveClass('visually-hidden');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('distinguishes the three states without relying on the colour', () => {
    renderGrid({ cells: [cell(1, 1)], partialCells: [partialOf(cell(1, 2), '09:50–10:10')] });

    const unavailable = cellButton(1, 1, '09:00', '09:45');
    const partial = screen.getByRole('button', {
      name: partialName(1, 2, '09:45', '10:30', '09:50–10:10'),
    });
    const available = cellButton(1, 3, '11:00', '11:45');
    expect(unavailable.textContent).toContain(texts.unavailableMark);
    expect(partial.textContent).toContain(texts.partialMark);
    expect(available.textContent).toBe('');
  });

  it('tells the toggle which cell was pressed, whatever its state', async () => {
    const user = userEvent.setup();
    const { onToggleCell } = renderGrid({
      cells: [cell(1, 1)],
      partialCells: [partialOf(cell(1, 2), '09:50–10:10')],
    });

    await user.click(cellButton(1, 1, '09:00', '09:45'));
    await user.click(
      screen.getByRole('button', { name: partialName(1, 2, '09:45', '10:30', '09:50–10:10') }),
    );
    await user.click(cellButton(2, 3, '11:00', '11:45'));

    expect(onToggleCell.mock.calls.map(([pressed]) => pressed)).toEqual([
      cell(1, 1),
      cell(1, 2),
      cell(2, 3),
    ]);
  });

  it('gives the toggle all the cells of a day when its header is pressed, partial and available ones too', async () => {
    const user = userEvent.setup();
    const { onToggleLine } = renderGrid({ cells: [cell(3, 1)] });

    await user.click(dayButton(3));

    expect(onToggleLine).toHaveBeenCalledExactlyOnceWith([cell(3, 1), cell(3, 2), cell(3, 3)]);
  });

  it('gives the toggle the cell of a session across the five days when its header is pressed', async () => {
    const user = userEvent.setup();
    const { onToggleLine } = renderGrid();

    await user.click(sessionButton(2));

    expect(onToggleLine).toHaveBeenCalledExactlyOnceWith(
      [1, 2, 3, 4, 5].map((day) => cell(day, 2)),
    );
  });

  it('does not take the headers to mean anything else: no cell button other than the sessions', () => {
    renderGrid();

    expect(
      screen.getAllByRole('button', { name: new RegExp(`^${texts.days['1']}, sesión`) }),
    ).toHaveLength(3);
  });

  it('draws the breaks as separators without buttons', () => {
    renderGrid();

    expect(screen.getByText('Recreo 10:30–11:00')).toBeInTheDocument();
  });

  it('shows the cells as text, without buttons, when it is not editable', () => {
    renderGrid({
      cells: [cell(1, 1)],
      partialCells: [partialOf(cell(2, 1), '09:10–09:20')],
      editable: false,
    });

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(texts.unavailableMark)).toBeInTheDocument();
    expect(screen.getByText(texts.partialMark)).toBeInTheDocument();
  });

  it('has no accessibility violations with the three states, editable or not', async () => {
    const editable = renderGrid({
      cells: [cell(1, 1)],
      partialCells: [partialOf(cell(1, 2), '09:50–10:10')],
    });
    expect(await wcagViolations(editable.container)).toEqual([]);
    editable.unmount();

    const readOnly = renderGrid({
      cells: [cell(1, 1)],
      partialCells: [partialOf(cell(1, 2), '09:50–10:10')],
      editable: false,
    });
    expect(await wcagViolations(readOnly.container)).toEqual([]);
  });

  it('does not change the forbidden and the preferred modes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(cellButton(1, 1, '09:00', '09:45'));

    expect(onChange).toHaveBeenCalledExactlyOnceWith([cell(1, 1)]);
  });
});
