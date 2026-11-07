/**
 * Contraste de color según WCAG 2.1 (luminancia relativa y relación de contraste), para los tests
 * del tema: jsdom no calcula estilos, así que el contraste se comprueba sobre los valores
 * compilados de `theme.scss`.
 */

/** Luminancia relativa (0 negro, 1 blanco) de un color `#rgb` o `#rrggbb`. */
export function relativeLuminance(hex: string): number {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)?.[1];
  if (digits === undefined) {
    throw new Error(`Color no válido: «${hex}» (se espera #rgb o #rrggbb)`);
  }
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  const [red, green, blue] = [0, 2, 4].map((start) => {
    const channel = parseInt(full.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Relación de contraste (de 1 a 21) entre dos colores, sin importar el orden. */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}
