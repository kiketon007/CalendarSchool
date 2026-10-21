import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { Pagination } from './Pagination';

const texts = es.pagination;
const LABEL = 'Paginación de profesores';

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

const previousButton = () => screen.getByRole('button', { name: texts.previous });
const nextButton = () => screen.getByRole('button', { name: texts.next });

/** Un padre que guarda la página, como hace una página real. */
function Stateful({ pageCount, initialPage = 1 }: { pageCount: number; initialPage?: number }) {
  const [page, setPage] = useState(initialPage);
  return <Pagination page={page} pageCount={pageCount} onPageChange={setPage} label={LABEL} />;
}

describe('Pagination', () => {
  it('draws nothing when there is a single page', () => {
    const { container } = render(
      <Pagination page={1} pageCount={1} onPageChange={vi.fn()} label={LABEL} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('is a navigation with the name it receives, with the indicator and both buttons', () => {
    render(<Pagination page={2} pageCount={3} onPageChange={vi.fn()} label={LABEL} />);

    expect(screen.getByRole('navigation', { name: LABEL })).toBeVisible();
    expect(screen.getByText('Página 2 de 3')).toBeVisible();
    expect(previousButton()).toBeEnabled();
    expect(nextButton()).toBeEnabled();
  });

  it('announces the indicator politely', () => {
    render(<Pagination page={1} pageCount={3} onPageChange={vi.fn()} label={LABEL} />);

    expect(screen.getByText('Página 1 de 3')).toHaveAttribute('aria-live', 'polite');
  });

  it('disables "Anterior" on the first page and "Siguiente" on the last one', () => {
    const { rerender } = render(
      <Pagination page={1} pageCount={3} onPageChange={vi.fn()} label={LABEL} />,
    );
    expect(previousButton()).toBeDisabled();
    expect(nextButton()).toBeEnabled();

    rerender(<Pagination page={3} pageCount={3} onPageChange={vi.fn()} label={LABEL} />);
    expect(previousButton()).toBeEnabled();
    expect(nextButton()).toBeDisabled();
  });

  it('asks for the page next to the current one', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageCount={3} onPageChange={onPageChange} label={LABEL} />);

    await userEvent.click(nextButton());
    await userEvent.click(previousButton());

    expect(onPageChange.mock.calls).toEqual([[3], [1]]);
  });

  it('keeps the focus on the pressed button while it stays enabled', async () => {
    render(<Stateful pageCount={4} />);

    await userEvent.click(nextButton());
    expect(screen.getByText('Página 2 de 4')).toBeVisible();
    expect(nextButton()).toHaveFocus();
  });

  it('moves the focus to "Anterior" when "Siguiente" is disabled by reaching the last page', async () => {
    render(<Stateful pageCount={2} />);

    await userEvent.click(nextButton());

    expect(nextButton()).toBeDisabled();
    expect(previousButton()).toHaveFocus();
  });

  it('moves the focus to "Siguiente" when "Anterior" is disabled by reaching the first page', async () => {
    render(<Stateful pageCount={2} initialPage={2} />);

    await userEvent.click(previousButton());

    expect(previousButton()).toBeDisabled();
    expect(nextButton()).toHaveFocus();
  });

  it.each([
    ['the first page', 1],
    ['an intermediate page', 2],
    ['the last page', 3],
  ])('has no accessibility violations on %s', async (_name, page) => {
    const { container } = render(
      <Pagination page={page} pageCount={3} onPageChange={vi.fn()} label={LABEL} />,
    );

    expect(await wcagViolations(container)).toEqual([]);
  });
});
