import type { TFunction } from 'i18next';

/** Lo que se pierde al guardar un cambio, en número de reglas de reparto y de asignaciones de profesores. */
export interface LostItems {
  readonly rules: number;
  readonly assignments: number;
}

/**
 * Las piezas de lo que se pierde, ya traducidas y con su plural (US-PROF-ASSIGN_b), unidas con la conjunción del
 * idioma («sus 2 reglas y sus 3 asignaciones de profesores»), sin las que son 0. `total` es cuántas cosas se
 * pierden en conjunto: lo usa la frase que la rodea para poner el verbo en singular solo con una. `null` si no se
 * pierde nada, para que no se pinte ningún aviso.
 */
export function lostItemsText(
  t: TFunction,
  language: string,
  { rules, assignments }: LostItems,
): { items: string; total: number } | null {
  const pieces = [
    ...(rules > 0 ? [t('lost.rules', { count: rules })] : []),
    ...(assignments > 0 ? [t('lost.assignments', { count: assignments })] : []),
  ];
  if (pieces.length === 0) {
    return null;
  }
  return {
    items: new Intl.ListFormat(language, { type: 'conjunction' }).format(pieces),
    total: rules + assignments,
  };
}
