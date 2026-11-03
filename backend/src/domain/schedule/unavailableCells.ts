import type { UnavailableInterval } from '../professor/availability.js';
import type { ProblemCell, ProblemPeriod } from './schedulingProblem.js';

/** Los días lectivos de la semana: de 1 (lunes) a 5 (viernes). */
const SCHOOL_DAYS = [1, 2, 3, 4, 5] as const;

/**
 * Las celdas de un calendario en las que un profesor no puede dar clase: la celda `(día, n)` no está disponible si la
 * sesión `n` del calendario (las sesiones se numeran por orden, sin contar los recreos) se solapa con algún tramo no
 * disponible de ese día. Un tramo `[a, b)` y una sesión `[s, e)` se solapan si `a < e` y `s < b`, la misma regla de
 * US-PROF-AVAIL y de `teachingLoadOf`: si solo se tocan en un extremo, no. Ordenadas por día y por sesión. Pura y sin
 * modificar los argumentos.
 */
export function unavailableCellsOf(
  periods: readonly ProblemPeriod[],
  intervals: readonly UnavailableInterval[],
): ProblemCell[] {
  const sessions = periods.filter(({ kind }) => kind === 'SESSION');
  const cells: ProblemCell[] = [];
  for (const dayOfWeek of SCHOOL_DAYS) {
    const ofDay = intervals.filter((interval) => interval.dayOfWeek === dayOfWeek);
    sessions.forEach((session, index) => {
      const blocked = ofDay.some(
        (interval) =>
          interval.startMinute < session.endMinute && session.startMinute < interval.endMinute,
      );
      if (blocked) {
        cells.push({ dayOfWeek, sessionNumber: index + 1 });
      }
    });
  }
  return cells;
}
