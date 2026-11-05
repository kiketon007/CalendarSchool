import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import type { ScheduleSummary } from '../services/scheduleService';
import { OfficialScheduleSummary } from './OfficialScheduleSummary';

const texts = es.schedule.official.summary;

const official: ScheduleSummary = {
  id: '0192f5a0-0000-7000-8000-0000000000a2',
  status: 'OFFICIAL',
  generatedAt: '2026-11-04T08:00:05.000Z',
  placedSessions: 290,
  confirmedAt: '2026-11-04T10:30:00.000Z',
  confirmedBy: { firstName: 'Ana', lastName: 'García' },
  replacedAt: null,
};

/** Reglas automáticas de WCAG 2.1 nivel AA. El contraste lo mide el navegador, no jsdom. */
async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

describe('OfficialScheduleSummary', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  function renderSummary(
    state: 'loading' | 'loaded' | 'error',
    schedule: ScheduleSummary | null,
    onRetry: () => void = () => undefined,
  ) {
    return render(
      <MemoryRouter>
        <OfficialScheduleSummary state={state} official={schedule} onRetry={onRetry} />
      </MemoryRouter>,
    );
  }

  const confirmedOn = new Intl.DateTimeFormat('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date('2026-11-04T10:30:00.000Z'));

  it('says when and by whom the official was confirmed, with a link to see it', () => {
    renderSummary('loaded', official);

    expect(
      screen.getByText(`Horario oficial: confirmado el ${confirmedOn} por Ana García`),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: texts.view })).toHaveAttribute(
      'href',
      '/horarios/oficial',
    );
  });

  it('says there is no official yet, without a link', () => {
    renderSummary('loaded', null);

    expect(screen.getByText(texts.none)).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('shows nothing while it loads', () => {
    const { container } = renderSummary('loading', null);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a warning with Try again when it fails, and asks again when it is pressed', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn<() => void>();
    renderSummary('error', null, onRetry);

    expect(screen.getByText(texts.loadError)).toBeVisible();
    await user.click(screen.getByRole('button', { name: texts.retry }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('writes the name of the person as plain text', () => {
    renderSummary('loaded', {
      ...official,
      confirmedBy: { firstName: '<b>Ana</b>', lastName: 'García' },
    });

    expect(screen.getByText(/<b>Ana<\/b> García/u)).toBeVisible();
    expect(document.querySelector('b')).toBeNull();
  });

  it('writes it in English', async () => {
    await i18n.changeLanguage('en');
    renderSummary('loaded', official);

    expect(screen.getByText(/Official timetable: confirmed on .* by Ana García/u)).toBeVisible();
    expect(screen.getByRole('link', { name: 'See the official timetable' })).toBeVisible();
  });

  it.each([
    ['with an official', 'loaded', official],
    ['without an official', 'loaded', null],
    ['when it fails', 'error', null],
  ] as const)('has no WCAG violations %s', async (_name, state, schedule) => {
    const { container } = renderSummary(state, schedule);

    expect(await wcagViolations(container)).toEqual([]);
  });
});
