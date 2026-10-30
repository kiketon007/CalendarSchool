import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import type { CourseWorkload } from '../services/courseWorkloadService';
import { WorkloadBalance } from './WorkloadBalance';

const texts = es.workload;

type Balance = Pick<
  CourseWorkload,
  'calendar' | 'assignedSessions' | 'availableSessions' | 'warnings'
>;

const fits: Balance = {
  calendar: { id: 'c1', name: 'Jornada continua', sessionsPerDay: 6, maxConsecutiveSessions: 6 },
  assignedSessions: 8,
  availableSessions: 30,
  warnings: [],
};

const exceeds: Balance = {
  calendar: { id: 'c1', name: 'Jornada continua', sessionsPerDay: 6, maxConsecutiveSessions: 6 },
  assignedSessions: 31,
  availableSessions: 30,
  warnings: [{ code: 'WORKLOAD_EXCEEDS_SLOTS', assigned: 31, available: 30 }],
};

const withoutCalendar: Balance = {
  calendar: null,
  assignedSessions: 5,
  availableSessions: null,
  warnings: [{ code: 'COURSE_WITHOUT_CALENDAR' }],
};

function renderBalance(balance: Balance) {
  return render(
    <MemoryRouter>
      <WorkloadBalance workload={balance} />
    </MemoryRouter>,
  );
}

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

const bar = (container: HTMLElement) => container.querySelector<HTMLElement>('.progress-bar');

describe('WorkloadBalance', () => {
  it('says how many of the available sessions are assigned, as text', () => {
    renderBalance(fits);

    expect(screen.getByText('8 de 30 sesiones a la semana')).toBeVisible();
  });

  it('draws a decorative bar hidden from assistive technologies, filled in proportion', () => {
    const { container } = renderBalance(fits);

    const element = bar(container);
    expect(element).not.toBeNull();
    expect(element?.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(element?.style.width).toBe('27%');
    expect(element).not.toHaveClass('bg-danger');
  });

  it('fills the bar and turns it to the danger color when the load exceeds the sessions', () => {
    const { container } = renderBalance(exceeds);

    expect(screen.getByText('31 de 30 sesiones a la semana')).toBeVisible();
    expect(bar(container)?.style.width).toBe('100%');
    expect(bar(container)).toHaveClass('bg-danger');
  });

  it('warns by how much the load exceeds the sessions of the calendar, in a status region', () => {
    renderBalance(exceeds);

    const status = screen.getByRole('status', { name: texts.warnings.label });
    expect(status).toHaveTextContent(
      'La carga supera en 1 las sesiones del calendario Jornada continua',
    );
  });

  it('has no warnings region when nothing is wrong', () => {
    renderBalance(fits);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows no balance and no bar without a calendar, only what is assigned', () => {
    const { container } = renderBalance(withoutCalendar);

    expect(screen.getByText('5 sesiones asignadas a la semana')).toBeVisible();
    expect(screen.queryByText(/ de \d+ sesiones/)).not.toBeInTheDocument();
    expect(bar(container)).toBeNull();
  });

  it('uses the singular for one assigned session', () => {
    renderBalance({ ...withoutCalendar, assignedSessions: 1 });

    expect(screen.getByText('1 sesión asignada a la semana')).toBeVisible();
  });

  it('warns that the course has no calendar and links to the calendars', () => {
    renderBalance(withoutCalendar);

    const status = screen.getByRole('status', { name: texts.warnings.label });
    expect(status).toHaveTextContent(texts.warnings.COURSE_WITHOUT_CALENDAR);
    expect(
      within(status).getByRole('link', { name: texts.warnings.calendarsLink }),
    ).toHaveAttribute('href', '/calendarios');
  });

  it('draws an empty bar when nothing is assigned', () => {
    const { container } = renderBalance({ ...fits, assignedSessions: 0 });

    expect(screen.getByText('0 de 30 sesiones a la semana')).toBeVisible();
    expect(bar(container)?.style.width).toBe('0%');
  });

  it.each([
    ['a load that fits', fits],
    ['a load that exceeds the sessions', exceeds],
    ['a course without a calendar', withoutCalendar],
  ])('has no WCAG 2.1 AA violations with %s', async (_name, balance) => {
    const { container } = renderBalance(balance);

    expect(await wcagViolations(container)).toEqual([]);
  });
});
