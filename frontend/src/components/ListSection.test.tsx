import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { ListSection } from './ListSection';

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

describe('ListSection', () => {
  it('renders a section named by its h2', () => {
    render(
      <ListSection title="Todos los cursos" titleId="courses-list-title">
        <p>Contenido</p>
      </ListSection>,
    );

    const region = screen.getByRole('region', { name: 'Todos los cursos' });
    const heading = screen.getByRole('heading', { level: 2, name: 'Todos los cursos' });
    expect(region).toHaveAttribute('aria-labelledby', 'courses-list-title');
    expect(heading).toHaveAttribute('id', 'courses-list-title');
    expect(region).toContainElement(screen.getByText('Contenido'));
  });

  it('renders the counter only when it is given', () => {
    const { rerender } = render(
      <ListSection title="Todos los cursos" titleId="list-title" count="3 cursos">
        <p>Contenido</p>
      </ListSection>,
    );
    expect(screen.getByText('3 cursos')).toHaveClass('cs-list-count');

    rerender(
      <ListSection title="Todos los cursos" titleId="list-title">
        <p>Contenido</p>
      </ListSection>,
    );
    expect(screen.queryByText('3 cursos')).not.toBeInTheDocument();
    expect(document.querySelector('.cs-list-count')).toBeNull();
  });

  it('renders the toolbar only when it is given, inside the header', () => {
    const { rerender } = render(
      <ListSection
        title="Todos los cursos"
        titleId="list-title"
        toolbar={<input aria-label="Buscar" />}
      >
        <p>Contenido</p>
      </ListSection>,
    );
    const header = screen.getByRole('heading', { level: 2 }).closest('.cs-list-header');
    expect(header).toContainElement(screen.getByRole('textbox', { name: 'Buscar' }));

    rerender(
      <ListSection title="Todos los cursos" titleId="list-title">
        <p>Contenido</p>
      </ListSection>,
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('is the card itself when framed, with the content inside', () => {
    render(
      <ListSection title="Todos los cursos" titleId="list-title">
        <p>Contenido</p>
      </ListSection>,
    );

    const region = screen.getByRole('region', { name: 'Todos los cursos' });
    expect(region).toHaveClass('cs-card');
    expect(region).toContainElement(screen.getByText('Contenido'));
  });

  it('puts only the header on a card when it is not framed, with the content below', () => {
    render(
      <ListSection title="Tus calendarios" titleId="list-title" framed={false}>
        <p>Contenido</p>
      </ListSection>,
    );

    const region = screen.getByRole('region', { name: 'Tus calendarios' });
    const header = screen.getByRole('heading', { level: 2 }).closest('.cs-list-header');
    expect(region).not.toHaveClass('cs-card');
    expect(header).toHaveClass('cs-card');
    expect(header).not.toContainElement(screen.getByText('Contenido'));
    expect(region).toContainElement(screen.getByText('Contenido'));
  });

  it('renders the texts as plain text', () => {
    render(
      <ListSection title="<b>Cursos</b>" titleId="list-title" count="<b>3</b> cursos">
        <p>Contenido</p>
      </ListSection>,
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('<b>Cursos</b>');
    expect(screen.getByText('<b>3</b> cursos')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it.each([true, false])('has no accessibility violations (framed: %s)', async (framed) => {
    const { container } = render(
      <main>
        <h1>Página</h1>
        <ListSection
          title="Todos los cursos"
          titleId="list-title"
          count="2 cursos"
          toolbar={<input aria-label="Buscar por nombre" />}
          framed={framed}
        >
          <h3>Curso</h3>
        </ListSection>
      </main>,
    );

    expect(await wcagViolations(container)).toEqual([]);
  });
});
