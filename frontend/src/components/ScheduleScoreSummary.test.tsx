import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import es from '../i18n/es.json';
import i18n from '../i18n/i18n';
import type { ScheduleScore } from '../utils/scheduleScore';
import { ScheduleScoreSummary } from './ScheduleScoreSummary';

const texts = es.schedule.score;

const score: ScheduleScore = {
  total: 134,
  preferredMisses: 8,
  preferredTotal: 50,
  professorGaps: 18,
  consecutiveDays: 6,
  initialTotal: 220,
};

/** Reglas automáticas de WCAG 2.1 nivel AA. El contraste lo mide el navegador, no jsdom. */
async function wcagViolations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}

/** El valor (`dd`) que sigue al término (`dt`) con ese texto. */
function valueOf(term: string): string {
  const element = screen.getByText(term, { selector: 'dt' });
  const value = element.nextElementSibling;
  expect(value?.tagName).toBe('DD');
  return value?.textContent ?? '';
}

describe('ScheduleScoreSummary', () => {
  afterEach(async () => {
    await i18n.changeLanguage('es');
  });

  it('shows the four lines of the breakdown as a description list', () => {
    const { container } = render(<ScheduleScoreSummary score={score} />);

    expect(container.querySelectorAll('dl')).toHaveLength(1);
    expect(valueOf(texts.preferred.label)).toBe('42 de 50');
    expect(valueOf(texts.gaps.label)).toBe('18');
    expect(valueOf(texts.consecutive.label)).toBe('6');
    expect(valueOf(texts.penalty.label)).toBe('134 (antes de mejorar: 220; cuanto menos, mejor)');
  });

  it('lays the list out with the theme grid and no Bootstrap columns', () => {
    const { container } = render(<ScheduleScoreSummary score={score} />);

    const list = container.querySelector('dl');
    expect(list).toHaveClass('cs-score-list');
    expect(list).not.toHaveClass('row');
    expect(container.querySelector('[class*="col-"]')).toBeNull();
  });

  it('puts only the penalty number in bold and leaves its explanation in normal weight', () => {
    render(<ScheduleScoreSummary score={score} />);

    const value = screen.getByText(texts.penalty.label, { selector: 'dt' }).nextElementSibling;
    const strong = value?.querySelector('strong');
    expect(strong?.textContent).toBe('134');
    expect(value?.textContent).toBe('134 (antes de mejorar: 220; cuanto menos, mejor)');
  });

  it('bolds the penalty number also when it was not improved', () => {
    render(<ScheduleScoreSummary score={{ ...score, total: 220 }} />);

    const value = screen.getByText(texts.penalty.label, { selector: 'dt' }).nextElementSibling;
    expect(value?.querySelector('strong')?.textContent).toBe('220');
  });

  it('is a region with a name', () => {
    render(<ScheduleScoreSummary score={score} />);

    expect(screen.getByRole('region', { name: texts.title })).toBeInTheDocument();
  });

  it('does not show the preferred slots when no lesson has any', () => {
    render(<ScheduleScoreSummary score={{ ...score, preferredTotal: 0, preferredMisses: 0 }} />);

    expect(screen.queryByText(texts.preferred.label)).not.toBeInTheDocument();
    expect(screen.getByText(texts.gaps.label)).toBeInTheDocument();
  });

  it('says only that less is better when the penalty was not improved', () => {
    render(<ScheduleScoreSummary score={{ ...score, total: 220 }} />);

    expect(valueOf(texts.penalty.label)).toBe('220 (cuanto menos, mejor)');
    expect(screen.queryByText(/antes de mejorar/)).not.toBeInTheDocument();
  });

  it('counts the met slots as the total minus the misses, also when all are met or none', () => {
    const { rerender } = render(
      <ScheduleScoreSummary score={{ ...score, preferredMisses: 0, preferredTotal: 7 }} />,
    );
    expect(valueOf(texts.preferred.label)).toBe('7 de 7');

    rerender(<ScheduleScoreSummary score={{ ...score, preferredMisses: 7, preferredTotal: 7 }} />);
    expect(valueOf(texts.preferred.label)).toBe('0 de 7');
  });

  it('shows zeros as zeros', () => {
    render(
      <ScheduleScoreSummary
        score={{
          total: 0,
          preferredMisses: 0,
          preferredTotal: 0,
          professorGaps: 0,
          consecutiveDays: 0,
          initialTotal: 0,
        }}
      />,
    );

    expect(valueOf(texts.gaps.label)).toBe('0');
    expect(valueOf(texts.consecutive.label)).toBe('0');
    expect(valueOf(texts.penalty.label)).toBe('0 (cuanto menos, mejor)');
  });

  it('does not depend on color: every number is written with its label', () => {
    const { container } = render(<ScheduleScoreSummary score={score} />);

    const terms = within(container).getAllByText(/./, { selector: 'dt' });
    expect(terms).toHaveLength(4);
    expect(terms.every((term) => term.nextElementSibling?.tagName === 'DD')).toBe(true);
  });

  it('is translated to English', async () => {
    await i18n.changeLanguage('en');

    render(<ScheduleScoreSummary score={score} />);

    expect(valueOf(en.schedule.score.preferred.label)).toBe('42 of 50');
    expect(valueOf(en.schedule.score.penalty.label)).toBe(
      '134 (before improving: 220; lower is better)',
    );
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<ScheduleScoreSummary score={score} />);

    expect(await wcagViolations(container)).toEqual([]);
  });
});
