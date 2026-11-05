import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import { installMatchMedia, type MatchMediaControl } from '../testSupport/matchMedia';
import type { DraftCell, DraftTable, ListedEntry } from '../utils/scheduleDraftViews';
import { ScheduleGrid } from './ScheduleGrid';

const texts = es.schedule.draft;

const english = { id: 'english', name: 'Inglés', code: 'ING', color: 'blue' } as const;
const maths = { id: 'maths', name: 'Matemáticas', code: null, color: 'red' } as const;
const ana = { id: 'ana', firstName: 'Ana', lastName: 'García' };

function cell(overrides: Partial<DraftCell> = {}): DraftCell {
  return {
    subject: english,
    professor: ana,
    className: 'A',
    courseName: '1º Primaria',
    ...overrides,
  };
}

const DAY_COLUMNS = ['1', '2', '3', '4', '5'].map((id) => ({ id, label: id }));

function tableWith(overrides: Partial<DraftTable> = {}): DraftTable {
  return {
    calendar: { id: 'calendar-1', name: 'Primaria' },
    rows: [
      { kind: 'SESSION', sessionNumber: 1, startTime: '09:00', endTime: '09:45' },
      { kind: 'SESSION', sessionNumber: 2, startTime: '09:45', endTime: '10:30' },
      { kind: 'BREAK', startTime: '10:30', endTime: '11:00' },
      { kind: 'SESSION', sessionNumber: 3, startTime: '11:00', endTime: '11:45' },
    ],
    columns: DAY_COLUMNS,
    cells: new Map([['1:1', cell()]]),
    outside: [],
    ...overrides,
  };
}

describe('ScheduleGrid', () => {
  let media: MatchMediaControl;

  beforeEach(() => {
    media = installMatchMedia(1280);
  });

  afterEach(async () => {
    media.restore();
    await i18n.changeLanguage('es');
  });

  function renderGrid(
    table: DraftTable,
    props: { columnKind?: 'day' | 'class'; detail?: 'professor' | 'class'; width?: number } = {},
  ) {
    media.setWidth(props.width ?? 1280);
    return render(
      <ScheduleGrid
        caption="Horario de prueba"
        table={table}
        columnKind={props.columnKind ?? 'day'}
        detail={props.detail ?? 'professor'}
      />,
    );
  }

  it('is a table named by its caption, inside a scrollable container', () => {
    const { container } = renderGrid(tableWith());

    expect(screen.getByRole('table', { name: 'Horario de prueba' })).toBeInTheDocument();
    expect(container.querySelector('.table-responsive')).not.toBeNull();
  });

  it('contains the visually hidden texts in its scrollable container, so they never widen the page', () => {
    const { container } = renderGrid(tableWith());

    expect(container.querySelector('.table-responsive')).toHaveClass('position-relative');
  });

  it('has the five days as column headers with their full names on a wide screen', () => {
    renderGrid(tableWith());

    const names = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(names).toEqual(['Sesión', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']);
  });

  it('abbreviates the days on a small screen but keeps the full name for assistive technology', () => {
    renderGrid(tableWith(), { width: 360 });

    const headers = screen.getAllByRole('columnheader').slice(1);
    expect(headers.map((header) => header.textContent)).toEqual(
      ['L', 'M', 'X', 'J', 'V'].map(
        (short, index) =>
          `${short}${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'][index] ?? ''}`,
      ),
    );
    expect(screen.getByRole('columnheader', { name: 'Lunes' })).toBeInTheDocument();
  });

  it('has a row header for each session with its number and hours, and a separator for the break', () => {
    renderGrid(tableWith());

    const rows = screen.getAllByRole('rowheader');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Sesión 109:00–09:45',
      'Sesión 209:45–10:30',
      'Sesión 311:00–11:45',
    ]);
    expect(screen.getByText('Recreo 10:30–11:00')).toBeInTheDocument();
    const breakRow = screen.getByText('Recreo 10:30–11:00').closest('tr');
    expect(within(breakRow as HTMLElement).queryAllByRole('cell')).toHaveLength(1);
  });

  it('shows the subject, its code and the professor in a cell, with the color of the subject', () => {
    renderGrid(tableWith());

    const filled = screen.getByText('Inglés').closest('td');
    expect(filled).toHaveTextContent('Inglés');
    expect(filled).toHaveTextContent('ING');
    expect(filled).toHaveTextContent('García, Ana');
    expect(filled).toHaveStyle({ backgroundColor: '#cfe2ff' });
  });

  it('shows the course and the class instead of the professor in the professor view', () => {
    renderGrid(tableWith(), { detail: 'class' });

    expect(screen.getByText('Inglés').closest('td')).toHaveTextContent('1º Primaria · A');
    expect(screen.getByText('Inglés').closest('td')).not.toHaveTextContent('García');
  });

  it('writes Free in every cell without a session', () => {
    renderGrid(tableWith());

    // 3 sesiones × 5 días = 15 celdas, una con sesión.
    expect(screen.getAllByText(texts.grid.free)).toHaveLength(14);
  });

  it('writes No professor in a cell whose professor was deleted', () => {
    renderGrid(tableWith({ cells: new Map([['1:1', cell({ professor: null })]]) }));

    expect(screen.getByText(texts.grid.noProfessor)).toBeInTheDocument();
  });

  it('does not show the code when the subject has none', () => {
    renderGrid(tableWith({ cells: new Map([['1:1', cell({ subject: maths })]]) }));

    expect(screen.getByText('Matemáticas').closest('td')).toHaveStyle({
      backgroundColor: '#f8d7da',
    });
    expect(screen.getByText('Matemáticas').closest('td')?.textContent).not.toContain('(');
  });

  it('writes the names as text, never as markup', () => {
    renderGrid(
      tableWith({
        cells: new Map([['1:1', cell({ subject: { ...english, name: '<b>Inglés</b>' } })]]),
      }),
    );

    expect(screen.getByText('<b>Inglés</b>')).toBeInTheDocument();
    expect(document.querySelector('td b')).toBeNull();
  });

  it('uses the given columns, for example one per class', () => {
    renderGrid(
      tableWith({
        columns: [
          { id: 'class-1a', label: '1º Primaria A' },
          { id: 'class-1b', label: '1º Primaria B' },
        ],
        cells: new Map([['class-1b:2', cell({ subject: maths })]]),
      }),
      { columnKind: 'class' },
    );

    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Sesión',
      '1º Primaria A',
      '1º Primaria B',
    ]);
    expect(screen.getByText('Matemáticas')).toBeInTheDocument();
    expect(screen.getAllByText(texts.grid.free)).toHaveLength(5);
  });

  it('lists the sessions outside the current calendar below the table', () => {
    const outside: ListedEntry = {
      ...cell({ subject: maths, professor: null }),
      dayOfWeek: 5,
      sessionNumber: 9,
      startTime: '15:00',
      endTime: '15:45',
    };
    renderGrid(tableWith({ outside: [outside] }));

    const section = screen.getByRole('region', { name: texts.outside.title });
    expect(section).toHaveTextContent(texts.outside.intro);
    expect(section).toHaveTextContent('Viernes 15:00–15:45');
    expect(section).toHaveTextContent('Matemáticas');
  });

  it('shows no outside section when every session has its row', () => {
    renderGrid(tableWith());

    expect(screen.queryByRole('region', { name: texts.outside.title })).not.toBeInTheDocument();
  });
});
