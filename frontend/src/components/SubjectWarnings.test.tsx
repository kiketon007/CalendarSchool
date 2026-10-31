import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { SubjectWarnings } from './SubjectWarnings';

const texts = es.workload.subjectWarnings;

describe('SubjectWarnings', () => {
  it('renders nothing without warnings', () => {
    const { container } = render(<SubjectWarnings subject="Inglés" warnings={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('is a status region named after the subject', () => {
    render(<SubjectWarnings subject="Inglés" warnings={[{ code: 'SUBJECT_DOES_NOT_FIT' }]} />);

    expect(screen.getByRole('status', { name: 'Avisos de Inglés' })).toHaveTextContent(
      texts.SUBJECT_DOES_NOT_FIT,
    );
  });

  it.each([
    ['BLOCK_LARGER_THAN_LOAD', texts.BLOCK_LARGER_THAN_LOAD],
    ['SUBJECT_DOES_NOT_FIT', texts.SUBJECT_DOES_NOT_FIT],
  ] as const)('shows the warning %s in red, with its text', (code, text) => {
    render(<SubjectWarnings subject="Inglés" warnings={[{ code }]} />);

    const warning = screen.getByText(text);
    expect(warning).toHaveClass('text-danger');
    expect(warning).not.toHaveClass('text-warning-emphasis');
  });

  it('shows the cells outside the calendar in red, with the plural of its count', () => {
    render(
      <SubjectWarnings
        subject="Inglés"
        warnings={[{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 5 }]}
      />,
    );

    expect(screen.getByText('Hay 5 franjas fuera del calendario actual')).toHaveClass(
      'text-danger',
    );
  });

  it.each([
    [1, '1 franja preferida está prohibida y se ignorará'],
    [3, '3 franjas preferidas están prohibidas y se ignorarán'],
  ])(
    'shows the preferred slots that are forbidden in red, with the plural of its count (%s)',
    (count, text) => {
      render(
        <SubjectWarnings
          subject="Inglés"
          warnings={[{ code: 'PREFERRED_SLOTS_FORBIDDEN', count }]}
        />,
      );

      expect(screen.getByText(text)).toHaveClass('text-danger');
    },
  );

  it('does not paint the codes that the screen already says in another way', () => {
    render(
      <SubjectWarnings
        subject="Inglés"
        warnings={[{ code: 'SLOTS_OUTSIDE_CALENDAR', count: 2 }, { code: 'SUBJECT_DOES_NOT_FIT' }]}
        omit={['SLOTS_OUTSIDE_CALENDAR']}
      />,
    );

    expect(screen.queryByText(/fuera del calendario/)).not.toBeInTheDocument();
    expect(screen.getByText(texts.SUBJECT_DOES_NOT_FIT)).toBeVisible();
  });
});
