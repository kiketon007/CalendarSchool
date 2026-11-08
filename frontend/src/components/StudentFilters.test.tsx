import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { StudentFilters } from './StudentFilters';

const filters = es.students.filters;

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

function renderFilters() {
  return render(
    <StudentFilters
      query=""
      onQueryChange={vi.fn()}
      searchRef={{ current: null }}
      filters={{ course: '', classId: '', cafeteria: 'all', scholarship: 'all' }}
      onFiltersChange={vi.fn()}
      courses={{ options: [{ id: 'c1', name: '1º Primaria' }], withoutCourse: false }}
      classes={{ options: [], withoutClass: false }}
    />,
  );
}

describe('StudentFilters', () => {
  it('keeps the visible label of the search field', () => {
    renderFilters();

    const search = screen.getByRole('searchbox', { name: filters.search });
    expect(screen.getByText(filters.search, { selector: 'label' })).not.toHaveClass(
      'visually-hidden',
    );
    expect(search).toHaveAttribute('maxLength', '100');
  });

  it('draws a decorative magnifier inside a wide search field', () => {
    renderFilters();

    const search = screen.getByRole('searchbox', { name: filters.search });
    const field = search.closest('.cs-search');
    expect(field).not.toBeNull();
    expect(field).toHaveClass('cs-search-wide');
    const icon = field?.querySelector('svg.cs-search-icon');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the label outside the field that holds the magnifier, so the icon centres on the control', () => {
    renderFilters();

    const label = screen.getByText(filters.search, { selector: 'label' });
    expect(label.closest('.cs-search')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderFilters();

    expect(await wcagViolations(container)).toEqual([]);
  });
});
