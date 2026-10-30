import type { CalendarPeriodType } from './calendar.js';

/**
 * Los tamaños de los tramos de sesiones seguidas sin un recreo entre ellas, en el orden de la jornada. Un
 * recreo al principio o al final no deja un tramo vacío, y varios recreos seguidos cuentan como uno. La suma
 * es el número de sesiones de la jornada. Las sesiones de una asignatura que pide un bloque solo pueden ir
 * dentro de un mismo tramo.
 */
export function sessionGroupsOf(kinds: readonly CalendarPeriodType[]): number[] {
  const groups: number[] = [];
  let current = 0;
  for (const kind of kinds) {
    if (kind === 'SESSION') {
      current += 1;
    } else if (current > 0) {
      groups.push(current);
      current = 0;
    }
  }
  if (current > 0) {
    groups.push(current);
  }
  return groups;
}
