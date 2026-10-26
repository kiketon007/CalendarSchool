import { describe, expect, it } from 'vitest';
import { SUBJECT_COLOR_STYLES, contrastRatio, defaultSubjectColor } from './subjectColors';
import { SUBJECT_COLORS } from './subjectOptions';

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for the same color', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('does not depend on which color is the text', () => {
    expect(contrastRatio('#212529', '#cfe2ff')).toBeCloseTo(
      contrastRatio('#cfe2ff', '#212529'),
      10,
    );
  });

  it('matches the known value of WCAG for a mid grey on white (4.54:1)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('accepts the short form of a hexadecimal color and upper case', () => {
    expect(contrastRatio('#FFF', '#000')).toBeCloseTo(21, 5);
  });

  it('rejects a color that is not hexadecimal', () => {
    expect(() => contrastRatio('rojo', '#fff')).toThrow();
  });
});

describe('SUBJECT_COLOR_STYLES', () => {
  it('has a style for each color of the palette and for nothing else', () => {
    expect(Object.keys(SUBJECT_COLOR_STYLES).sort()).toEqual([...SUBJECT_COLORS].sort());
  });

  it.each(SUBJECT_COLORS.map((color) => [color]))(
    'gives %s a text color with at least AA contrast (4.5:1) over its background',
    (color) => {
      const { background, text } = SUBJECT_COLOR_STYLES[color];

      expect(contrastRatio(text, background)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('gives each color its own background, so two colors never look the same', () => {
    const backgrounds = SUBJECT_COLORS.map((color) => SUBJECT_COLOR_STYLES[color].background);

    expect(new Set(backgrounds).size).toBe(SUBJECT_COLORS.length);
  });

  it('gives each color a border that stands out from the page (3:1 over white), so the swatch is visible', () => {
    for (const color of SUBJECT_COLORS) {
      expect(contrastRatio(SUBJECT_COLOR_STYLES[color].border, '#ffffff')).toBeGreaterThanOrEqual(
        3,
      );
    }
  });
});

describe('defaultSubjectColor', () => {
  it('proposes the first color of the palette when the school uses none', () => {
    expect(defaultSubjectColor([])).toBe('blue');
  });

  it('proposes the first color that no subject uses, in the order of the palette', () => {
    expect(defaultSubjectColor(['blue', 'indigo'])).toBe('purple');
  });

  it('skips a free color only if a later one is also used: it never jumps over a free one', () => {
    expect(defaultSubjectColor(['indigo', 'purple'])).toBe('blue');
    expect(defaultSubjectColor(['blue', 'purple'])).toBe('indigo');
  });

  it('does not care about repeated colors or about the order they come in', () => {
    expect(defaultSubjectColor(['indigo', 'blue', 'blue', 'indigo'])).toBe('purple');
  });

  it('goes back to the first color of the palette when every color is used', () => {
    expect(defaultSubjectColor([...SUBJECT_COLORS])).toBe('blue');
    expect(defaultSubjectColor([...SUBJECT_COLORS, 'red', 'blue'])).toBe('blue');
  });

  it('accepts any iterable, like the set of colors of the loaded subjects', () => {
    expect(defaultSubjectColor(new Set(['blue', 'indigo', 'purple']))).toBe('pink');
  });
});
