import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

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

const fullHeader = (
  <PageHeader
    title="Cursos"
    titleId="courses-title"
    eyebrow="Gestión"
    description="Los cursos del colegio y sus clases."
    actions={<button type="button">Crear curso</button>}
  />
);

describe('PageHeader', () => {
  it('renders the eyebrow, the title, the description and the actions in that order', () => {
    render(fullHeader);

    const eyebrow = screen.getByText('Gestión');
    const title = screen.getByRole('heading', { level: 1, name: 'Cursos' });
    const description = screen.getByText('Los cursos del colegio y sus clases.');
    const action = screen.getByRole('button', { name: 'Crear curso' });

    expect(eyebrow).toHaveClass('cs-eyebrow');
    expect(title).toHaveAttribute('id', 'courses-title');
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(description).toHaveClass('text-body-secondary');
    expect(eyebrow.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      title.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      description.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('puts the actions in their own zone, away from the texts', () => {
    render(fullHeader);

    const zone = screen.getByRole('button', { name: 'Crear curso' }).parentElement;
    expect(zone).not.toContainElement(screen.getByRole('heading', { level: 1 }));
    expect(zone).toHaveClass('flex-shrink-0');
  });

  it('lets the page move the focus to the title through the ref', () => {
    const titleRef = createRef<HTMLHeadingElement>();
    render(<PageHeader title="Cursos" titleId="courses-title" titleRef={titleRef} />);

    titleRef.current?.focus();

    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('renders only the title when nothing else is given', () => {
    const { container } = render(<PageHeader title="Cursos" titleId="courses-title" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Cursos' })).toBeInTheDocument();
    expect(container.querySelector('.cs-eyebrow')).toBeNull();
    expect(container.querySelector('p')).toBeNull();
    // El título es lo único que hay dentro de la cabecera: ni un contenedor de acciones vacío.
    expect(container.firstElementChild?.children).toHaveLength(1);
    expect(container.firstElementChild?.firstElementChild?.children).toHaveLength(1);
  });

  it('shows markup in the texts as plain text', () => {
    const { container } = render(
      <PageHeader
        title="Curso <b>1º</b>"
        titleId="courses-title"
        eyebrow="<b>Gestión</b>"
        description="Con <b>negrita</b>"
      />,
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Curso <b>1º</b>');
    expect(screen.getByText('<b>Gestión</b>')).toBeInTheDocument();
    expect(screen.getByText('Con <b>negrita</b>')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(fullHeader);

    expect(await wcagViolations(container)).toEqual([]);
  });
});
