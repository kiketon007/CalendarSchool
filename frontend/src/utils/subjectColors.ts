import type { components } from '../api/generated/schema';
import { SUBJECT_COLORS } from './subjectOptions';

type SubjectColor = components['schemas']['SubjectColor'];

/** Cómo se pinta un color de asignatura: el fondo, el texto que va encima y el borde de la muestra. */
export interface SubjectColorStyle {
  background: string;
  /** Color del texto sobre `background`, con contraste AA (al menos 4,5:1). */
  text: string;
  /** Borde de la muestra, con contraste de al menos 3:1 sobre blanco para que se vea sobre la página. */
  border: string;
}

/** Texto oscuro de Bootstrap: sobre fondos claros da más de 10:1 en todas las claves. */
const DARK_TEXT = '#212529';

/**
 * El aspecto de cada clave de la paleta cerrada. El servidor solo guarda la clave; el fondo y el texto viven
 * aquí, así que retocarlos no toca los datos. Un test exige el contraste AA de las 12 y que los fondos sean
 * distintos. El color nunca es la única pista: se muestra siempre con su nombre.
 */
export const SUBJECT_COLOR_STYLES: Record<SubjectColor, SubjectColorStyle> = {
  blue: { background: '#cfe2ff', text: DARK_TEXT, border: '#0d6efd' },
  indigo: { background: '#d6d4f8', text: DARK_TEXT, border: '#6610f2' },
  purple: { background: '#e5d4f3', text: DARK_TEXT, border: '#6f42c1' },
  pink: { background: '#fbd3e9', text: DARK_TEXT, border: '#d63384' },
  red: { background: '#f8d7da', text: DARK_TEXT, border: '#dc3545' },
  orange: { background: '#ffe0c2', text: DARK_TEXT, border: '#b85a0a' },
  yellow: { background: '#fff3cd', text: DARK_TEXT, border: '#8a6a00' },
  green: { background: '#d1e7dd', text: DARK_TEXT, border: '#198754' },
  teal: { background: '#cdf2e7', text: DARK_TEXT, border: '#0e7a5f' },
  cyan: { background: '#cff4fc', text: DARK_TEXT, border: '#087990' },
  brown: { background: '#e6d5c3', text: DARK_TEXT, border: '#7a4b21' },
  gray: { background: '#e2e3e5', text: DARK_TEXT, border: '#6c757d' },
};

/** Luminancia relativa de un color `#rgb` o `#rrggbb`, según WCAG 2.1. */
function luminance(hex: string): number {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(hex);
  if (!match) {
    throw new Error(`Color hexadecimal no válido: ${hex}`);
  }
  const digits = (match[1] ?? '').length === 3 ? [...(match[1] ?? '')].map((c) => c + c) : null;
  const full = digits ? digits.join('') : (match[1] ?? '');
  const [red, green, blue] = [0, 2, 4].map((start) => {
    const channel = parseInt(full.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

/**
 * Relación de contraste de WCAG 2.1 entre dos colores hexadecimales (de 1 a 21). No depende de cuál es el
 * texto y cuál el fondo.
 */
export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

/**
 * El color que se propone para una asignatura nueva: el primero de la paleta, en su orden, que no usa ninguna
 * de las asignaturas dadas, o el primero de la paleta si ya se usan todos (los colores pueden repetirse).
 */
export function defaultSubjectColor(usedColors: Iterable<SubjectColor>): SubjectColor {
  const used = new Set(usedColors);
  return SUBJECT_COLORS.find((color) => !used.has(color)) ?? SUBJECT_COLORS[0];
}
