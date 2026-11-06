import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { StrictMode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import {
  scheduleService,
  type PreviousSchedulesOutcome,
  type ScheduleSummary,
} from '../services/scheduleService';
import { sessionService, type SessionData } from '../services/sessionService';
import { SessionProvider } from '../session/SessionProvider';
import { PreviousSchedulesPage } from './PreviousSchedulesPage';

const texts = es.schedule.previous;

function sessionOf(role: 'ADMIN' | 'MEMBER'): SessionData {
  return {
    session: { accessToken: 'signed.access.token', expiresIn: 900 },
    user: {
      id: '0192f5a0-0000-7000-8000-0000000000a1',
      email: 'jose.garcia@example.com',
      firstName: 'José María',
      lastName: 'García-López',
      role,
    },
    school: { id: '0192f5a0-0000-7000-8000-000000000001', name: 'CEIP Lluís Vives' },
  };
}

const NEWER_ID = '0192f5a0-0000-7000-8000-0000000000b2';
const OLDER_ID = '0192f5a0-0000-7000-8000-0000000000b1';

const newer: ScheduleSummary = {
  id: NEWER_ID,
  status: 'OFFICIAL',
  generatedAt: '2026-11-04T08:00:05.000Z',
  placedSessions: 290,
  confirmedAt: '2026-11-05T10:30:00.000Z',
  confirmedBy: { firstName: 'Ana', lastName: 'García' },
  replacedAt: '2026-11-07T09:15:00.000Z',
};
const older: ScheduleSummary = {
  id: OLDER_ID,
  status: 'OFFICIAL',
  generatedAt: '2026-11-01T08:00:05.000Z',
  placedSessions: 1,
  confirmedAt: '2026-11-02T11:00:00.000Z',
  confirmedBy: { firstName: 'Luis', lastName: 'Pérez' },
  replacedAt: '2026-11-05T10:30:00.000Z',
};

const dateOf = (iso: string) =>
  new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('PreviousSchedulesPage', () => {
  let refresh: MockInstance<typeof sessionService.refresh>;
  let previous: MockInstance<typeof scheduleService.previous>;

  function signInAs(role: 'ADMIN' | 'MEMBER') {
    refresh.mockResolvedValue({ status: 'authenticated', data: sessionOf(role) });
  }

  beforeEach(() => {
    refresh = vi.spyOn(sessionService, 'refresh');
    signInAs('MEMBER');
    previous = vi.spyOn(scheduleService, 'previous');
  });

  afterEach(async () => {
    refresh.mockRestore();
    previous.mockRestore();
    await i18n.changeLanguage('es');
  });

  function renderPage(strict = false) {
    const tree = (
      <MemoryRouter initialEntries={['/horarios/anteriores']}>
        <SessionProvider>
          <Routes>
            <Route path="/horarios/anteriores" element={<PreviousSchedulesPage />} />
            <Route path="/horarios" element={<div data-testid="readiness-page" />} />
            <Route path="/horarios/anteriores/:id" element={<div data-testid="previous-page" />} />
          </Routes>
        </SessionProvider>
      </MemoryRouter>
    );
    return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  }

  function respond(outcome: PreviousSchedulesOutcome) {
    previous.mockResolvedValue(outcome);
  }

  it('shows the title and what these timetables are', async () => {
    respond({ status: 'loaded', schedules: [newer] });
    renderPage();

    expect(screen.getByTestId('previous-schedules-page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: texts.title })).toBeInTheDocument();
    expect(screen.getByText(texts.intro)).toBeInTheDocument();
    await screen.findByRole('list');
  });

  it('asks for the list once, also in strict mode, and shows that it is loading', async () => {
    respond({ status: 'loaded', schedules: [newer] });
    renderPage(true);

    expect(screen.getByRole('status')).toHaveTextContent(texts.loading);
    await screen.findByRole('list');
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('lists each one with who confirmed it, until when it was in force and its sessions, in order', async () => {
    respond({ status: 'loaded', schedules: [newer, older] });
    renderPage();

    const items = within(await screen.findByRole('list')).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(
      `Confirmado el ${dateOf(newer.confirmedAt ?? '')} por Ana García`,
    );
    expect(items[0]).toHaveTextContent(`Vigente hasta el ${dateOf(newer.replacedAt ?? '')}`);
    expect(items[0]).toHaveTextContent('290 sesiones');
    expect(items[1]).toHaveTextContent(
      `Confirmado el ${dateOf(older.confirmedAt ?? '')} por Luis Pérez`,
    );
    expect(items[1]).toHaveTextContent('1 sesión');
    expect(items[1]).not.toHaveTextContent('1 sesiones');
  });

  it('links each one to its page, with the date in the name of the link', async () => {
    respond({ status: 'loaded', schedules: [newer, older] });
    renderPage();
    await screen.findByRole('list');

    const first = screen.getByRole('link', {
      name: `Ver el horario confirmado el ${dateOf(newer.confirmedAt ?? '')}`,
    });
    const second = screen.getByRole('link', {
      name: `Ver el horario confirmado el ${dateOf(older.confirmedAt ?? '')}`,
    });

    expect(first).toHaveAttribute('href', `/horarios/anteriores/${NEWER_ID}`);
    expect(second).toHaveAttribute('href', `/horarios/anteriores/${OLDER_ID}`);
    expect(first).toHaveTextContent(texts.row.view);
  });

  it('goes to the page of the one that is opened', async () => {
    const user = userEvent.setup();
    respond({ status: 'loaded', schedules: [newer] });
    renderPage();

    await user.click(
      await screen.findByRole('link', {
        name: `Ver el horario confirmado el ${dateOf(newer.confirmedAt ?? '')}`,
      }),
    );

    expect(screen.getByTestId('previous-page')).toBeInTheDocument();
  });

  it('says there are none yet, without a list', async () => {
    respond({ status: 'loaded', schedules: [] });
    renderPage();

    expect(await screen.findByText(texts.empty)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('links back to Generate timetables', async () => {
    respond({ status: 'loaded', schedules: [] });
    renderPage();
    await screen.findByText(texts.empty);

    expect(screen.getByRole('link', { name: texts.back })).toHaveAttribute('href', '/horarios');
  });

  it('shows an alert with Try again when it fails, and shows the list when it works', async () => {
    const user = userEvent.setup();
    respond({ status: 'unavailable' });
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(texts.loadError);
    respond({ status: 'loaded', schedules: [newer] });
    await user.click(screen.getByRole('button', { name: texts.retry }));

    expect(await screen.findByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(previous).toHaveBeenCalledTimes(2);
  });

  it('does the same for an administrator', async () => {
    signInAs('ADMIN');
    respond({ status: 'loaded', schedules: [newer] });
    renderPage();

    expect(await screen.findByRole('list')).toBeInTheDocument();
    await waitFor(() => {
      expect(previous).toHaveBeenCalledTimes(1);
    });
  });

  it('writes the dates in English in the language of the interface', async () => {
    await i18n.changeLanguage('en');
    respond({ status: 'loaded', schedules: [newer] });
    renderPage();

    const [item] = within(await screen.findByRole('list')).getAllByRole('listitem');

    expect(item).toHaveTextContent('Confirmed on');
    expect(item).toHaveTextContent('In force until');
  });

  it('has no accessibility violations for an administrator either', async () => {
    signInAs('ADMIN');
    respond({ status: 'loaded', schedules: [newer, older] });
    const { container } = renderPage();
    await screen.findByRole('list');

    expect(await wcagViolations(container)).toEqual([]);
  });

  it('has no accessibility violations, with the list and without it', async () => {
    respond({ status: 'loaded', schedules: [newer, older] });
    const { container, unmount } = renderPage();
    await screen.findByRole('list');
    expect(await wcagViolations(container)).toEqual([]);
    unmount();

    respond({ status: 'loaded', schedules: [] });
    const empty = renderPage();
    await screen.findByText(texts.empty);
    expect(await wcagViolations(empty.container)).toEqual([]);
  });
});
