/**
 * Los tamaños de los tramos de sesiones seguidas sin un recreo entre ellas, en el orden de la jornada: lo mismo
 * que calcula el backend (`domain/calendar/sessionGroups.ts`) para la carga del curso, pero a partir de los
 * periodos de un calendario. Un recreo al principio o al final no deja un tramo vacío y varios seguidos cuentan
 * como uno.
 */
export function sessionGroupsOf(periods: readonly { type: 'SESSION' | 'BREAK' }[]): number[] {
  const groups: number[] = [];
  let current = 0;
  for (const { type } of periods) {
    if (type === 'SESSION') {
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
