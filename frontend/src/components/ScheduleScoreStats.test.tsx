import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import type { ScheduleScore } from '../utils/scheduleScore';
import { ScheduleScoreStats } from './ScheduleScoreStats';

const labels = es.schedule.score.stats;

const score: ScheduleScore = {
  total: 305,
  preferredMisses: 8,
  preferredTotal: 50,
  professorGaps: 51,
  consecutiveDays: 152,
  initialTotal: 458,
};

/** Reglas automáticas de WCAG 2.1 nivel AA. El contraste lo mide el navegador, no jsdom. */
async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

/** La tarjeta que tiene esa etiqueta. */
function cardOf(label: string): HTMLElement {
  const card = screen.getByText(label).closest<HTMLElement>('.cs-stat-card');
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe('ScheduleScoreStats', () => {
  it('shows the three figures with their labels', () => {
    render(<ScheduleScoreStats score={score} />);

    expect(within(cardOf(labels.gaps)).getByText('51')).toBeInTheDocument();
    expect(within(cardOf(labels.consecutive)).getByText('152')).toBeInTheDocument();
    expect(within(cardOf(labels.penalty)).getByText('305')).toBeInTheDocument();
  });

  it('shows the current penalty, not the one before improving', () => {
    render(<ScheduleScoreStats score={score} />);

    expect(screen.queryByText('458')).not.toBeInTheDocument();
  });

  it('shows zeros as zeros', () => {
    render(
      <ScheduleScoreStats
        score={{ ...score, total: 0, professorGaps: 0, consecutiveDays: 0, initialTotal: 0 }}
      />,
    );

    expect(within(cardOf(labels.gaps)).getByText('0')).toBeInTheDocument();
    expect(within(cardOf(labels.consecutive)).getByText('0')).toBeInTheDocument();
    expect(within(cardOf(labels.penalty)).getByText('0')).toBeInTheDocument();
  });

  it('uses theme cards with one tone per figure', () => {
    render(<ScheduleScoreStats score={score} />);

    for (const [label, tone] of [
      [labels.gaps, 'lavender'],
      [labels.consecutive, 'peach'],
      [labels.penalty, 'mint'],
    ] as const) {
      const card = cardOf(label);
      expect(card).toHaveClass('cs-card');
      expect(card.querySelector('.cs-feature-icon')).toHaveClass(`cs-tone-${tone}`);
    }
  });

  it('puts the cards in one column and in three from md', () => {
    const { container } = render(<ScheduleScoreStats score={score} />);

    const row = container.firstElementChild;
    expect(row).toHaveClass('row-cols-1', 'row-cols-md-3');
  });

  it('draws decorative icons', () => {
    const { container } = render(<ScheduleScoreStats score={score} />);

    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(3);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('is hidden from assistive technologies, because it repeats the breakdown', () => {
    const { container } = render(<ScheduleScoreStats score={score} />);

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText(labels.gaps, { ignore: 'never' })).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(container.querySelector('a, button, input, select, textarea')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ScheduleScoreStats score={score} />);

    expect(await wcagViolations(container)).toEqual([]);
  });
});
