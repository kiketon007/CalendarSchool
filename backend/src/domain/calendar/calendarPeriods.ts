import type { CalendarPeriod } from './calendar.js';
import { parseClock } from './clock.js';

/** Máximo de sesiones de la jornada. */
export const MAX_SESSIONS = 8;
/** Máximo de recreos de la jornada. */
export const MAX_BREAKS = 2;
/** Duración máxima de un periodo, sesión o recreo, en minutos. */
export const MAX_PERIOD_MINUTES = 90;

/** Un campo inválido y por qué, con la forma de los errores de validación de la API. */
export interface PeriodIssue {
  readonly field: string;
  readonly code:
    'REQUIRED' | 'INVALID_LENGTH' | 'NOT_ALLOWED' | 'INVALID_RANGE' | 'TOO_LONG' | 'OVERLAP';
}

/**
 * Valida la lista de periodos de un calendario, cuyas horas ya están bien escritas (`HH:MM`), y devuelve un
 * error por campo inválido: primero los de la lista entera (`periods`) y después los de cada periodo, en
 * su orden (`type`, `startTime`, `endTime`). Las reglas son: de 1 a 8 sesiones y como mucho 2 recreos; un
 * recreo va entre dos sesiones; cada periodo acaba después de empezar y dura como máximo 90 minutos; y
 * ninguno empieza antes de que acabe el anterior (pueden ser contiguos o dejar un hueco). Un periodo que
 * ya es inválido por sí mismo no se compara con el siguiente.
 */
export function validatePeriods(periods: readonly CalendarPeriod[]): PeriodIssue[] {
  const issues: PeriodIssue[] = [];

  const sessions = periods.filter(({ type }) => type === 'SESSION').length;
  const breaks = periods.length - sessions;
  if (sessions === 0) {
    issues.push({ field: 'periods', code: 'REQUIRED' });
  } else if (sessions > MAX_SESSIONS || breaks > MAX_BREAKS) {
    issues.push({ field: 'periods', code: 'INVALID_LENGTH' });
  }

  // Fin del periodo anterior si era válido por sí mismo; `null` si no hay anterior o no se puede comparar.
  let previousEnd: number | null = null;
  periods.forEach((period, index) => {
    const prefix = `periods[${String(index)}]`;

    if (
      period.type === 'BREAK' &&
      (periods[index - 1]?.type !== 'SESSION' || periods[index + 1]?.type !== 'SESSION')
    ) {
      issues.push({ field: `${prefix}.type`, code: 'NOT_ALLOWED' });
    }

    const start = parseClock(period.startTime);
    const end = parseClock(period.endTime);
    if (start === null || end === null) {
      previousEnd = null;
      return;
    }

    if (previousEnd !== null && start < previousEnd) {
      issues.push({ field: `${prefix}.startTime`, code: 'OVERLAP' });
    }
    if (end <= start) {
      issues.push({ field: `${prefix}.endTime`, code: 'INVALID_RANGE' });
      previousEnd = null;
    } else if (end - start > MAX_PERIOD_MINUTES) {
      issues.push({ field: `${prefix}.endTime`, code: 'TOO_LONG' });
      previousEnd = null;
    } else {
      previousEnd = end;
    }
  });

  return issues;
}
