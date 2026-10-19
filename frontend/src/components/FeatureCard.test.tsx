import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { FeatureCard } from './FeatureCard';
import { CalendarIcon } from './icons/CalendarIcon';

const schedules = es.onboarding.features.schedules;

function renderCard(to?: string) {
  return render(
    <MemoryRouter>
      <FeatureCard textKey="onboarding.features.schedules" icon={<CalendarIcon />} to={to} />
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

describe('FeatureCard', () => {
  describe('without a route', () => {
    it('is a block named by its heading, with the description and the coming soon badge', () => {
      renderCard();

      const card = screen.getByRole('article', { name: schedules.name });
      expect(screen.getByRole('heading', { level: 3, name: schedules.name })).toBeInTheDocument();
      expect(card).toHaveTextContent(schedules.description);
      expect(card).toHaveTextContent(es.onboarding.comingSoon);
    });

    it('is not interactive: no links, no buttons and nothing focusable', () => {
      const { container } = renderCard();

      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      expect(container.querySelector('a, button, [tabindex]')).toBeNull();
    });

    it('hides the icon from the accessibility tree', () => {
      const { container } = renderCard();

      const icon = container.querySelector('svg');
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('focusable', 'false');
    });

    it('has no accessibility violations', async () => {
      const { container } = renderCard();

      expect(await wcagViolations(container)).toEqual([]);
    });
  });

  describe('with a route', () => {
    it('is a link to that route named and described by the feature, without the badge', () => {
      renderCard('/destino');

      const link = screen.getByRole('link', { name: new RegExp(schedules.name) });
      expect(link).toHaveAttribute('href', '/destino');
      expect(link).toHaveTextContent(schedules.description);
      expect(link).not.toHaveTextContent(es.onboarding.comingSoon);
    });

    it('hides the icon from the accessibility tree', () => {
      const { container } = renderCard('/destino');

      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    it('has no accessibility violations', async () => {
      const { container } = renderCard('/destino');

      expect(await wcagViolations(container)).toEqual([]);
    });
  });
});
