import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { FeatureCard, type Tone } from './FeatureCard';
import { CalendarClockIcon } from './icons/CalendarClockIcon';

const schedules = es.onboarding.features.schedules;

function renderCard(tone: Tone = 'lavender') {
  return render(
    <MemoryRouter>
      <FeatureCard
        textKey="onboarding.features.schedules"
        icon={<CalendarClockIcon />}
        to="/destino"
        tone={tone}
      />
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
  it('is a link to its route named and described by the feature', () => {
    renderCard();

    const link = screen.getByRole('link', { name: new RegExp(schedules.name) });
    expect(link).toHaveAttribute('href', '/destino');
    expect(link).toHaveTextContent(schedules.description);
  });

  it('names the feature with an h3', () => {
    renderCard();

    expect(screen.getByRole('heading', { level: 3, name: schedules.name })).toBeInTheDocument();
  });

  it('is the only interactive element and has no coming soon badge', () => {
    const { container } = renderCard();

    expect(container.querySelectorAll('a, button, [tabindex]')).toHaveLength(1);
    expect(screen.queryByText(/próximamente/i)).toBeNull();
  });

  it.each<Tone>(['lavender', 'peach', 'mint', 'yellow'])(
    'paints the icon box with the %s tone',
    (tone) => {
      const { container } = renderCard(tone);

      const box = container.querySelector('.cs-feature-icon');
      expect(box).toHaveClass(`cs-tone-${tone}`);
      expect(box?.querySelector('svg')).not.toBeNull();
    },
  );

  it('hides the icon and the arrow from the accessibility tree', () => {
    const { container } = renderCard();

    const icons = container.querySelectorAll('svg');
    expect(icons).toHaveLength(2);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
      expect(icon).toHaveAttribute('focusable', 'false');
    }
  });

  it('does not nest a Bootstrap card in the link', () => {
    const { container } = renderCard();

    expect(container.querySelector('.card')).toBeNull();
    expect(screen.getByRole('link')).toHaveClass('cs-feature-card');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderCard();

    expect(await wcagViolations(container)).toEqual([]);
  });
});
