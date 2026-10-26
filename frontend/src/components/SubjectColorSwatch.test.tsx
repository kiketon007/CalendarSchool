import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import es from '../i18n/es.json';
import '../i18n/i18n';
import { SUBJECT_COLOR_STYLES } from '../utils/subjectColors';
import { SUBJECT_COLORS } from '../utils/subjectOptions';
import { SubjectColorSwatch } from './SubjectColorSwatch';

describe('SubjectColorSwatch', () => {
  it('is an image named after the color, so the color is never the only clue', () => {
    render(<SubjectColorSwatch color="blue" />);

    expect(screen.getByRole('img', { name: 'Color: Azul' })).toBeInTheDocument();
  });

  it.each(SUBJECT_COLORS.map((color) => [color]))(
    'paints %s with the background and the border of its style, and names it in Spanish',
    (color) => {
      render(<SubjectColorSwatch color={color} />);

      const swatch = screen.getByRole('img', {
        name: `Color: ${es.subjects.colors[color]}`,
      });
      expect(swatch).toHaveStyle({
        backgroundColor: SUBJECT_COLOR_STYLES[color].background,
        borderColor: SUBJECT_COLOR_STYLES[color].border,
      });
    },
  );

  it('is hidden from assistive technology when it is decorative, because the name is written next to it', () => {
    const { container } = render(<SubjectColorSwatch color="teal" decorative />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstElementChild).not.toHaveAttribute('aria-label');
  });

  it('adds the class it is given, to size it where it is used', () => {
    render(<SubjectColorSwatch color="red" className="ms-2" />);

    expect(screen.getByRole('img')).toHaveClass('ms-2');
  });

  it('takes no space for text: the name goes next to the swatch, not inside it', () => {
    render(<SubjectColorSwatch color="gray" />);

    expect(screen.getByRole('img')).toBeEmptyDOMElement();
  });
});
