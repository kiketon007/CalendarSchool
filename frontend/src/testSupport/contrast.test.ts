import { describe, expect, it } from 'vitest';
import { contrastRatio, relativeLuminance } from './contrast';

describe('relativeLuminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
  });

  it('accepts the three-digit shorthand and uppercase', () => {
    expect(relativeLuminance('#FFF')).toBeCloseTo(1, 10);
    expect(relativeLuminance('#fFf')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
  });

  it('rejects anything that is not a hex colour', () => {
    expect(() => relativeLuminance('red')).toThrow('#rgb o #rrggbb');
    expect(() => relativeLuminance('#12345')).toThrow('#rgb o #rrggbb');
  });
});

describe('contrastRatio', () => {
  it('is 21 between black and white, in any order', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });

  it('is 1 between a colour and itself', () => {
    expect(contrastRatio('#5b5bd6', '#5b5bd6')).toBeCloseTo(1, 10);
  });

  it('matches the known values of the palette', () => {
    expect(contrastRatio('#94a3b8', '#ffffff')).toBeCloseTo(2.56, 2);
    expect(contrastRatio('#ffffff', '#5b5bd6')).toBeCloseTo(5.37, 2);
    expect(contrastRatio('#5b6478', '#f7f8fc')).toBeCloseTo(5.59, 2);
  });
});
