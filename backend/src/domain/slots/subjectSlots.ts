import type { CalendarPeriod } from '../calendar/calendar.js';
import type { SubjectColor } from '../subject/subject.js';
import type { SlotCell } from '../workload/workloadWarnings.js';

/**
 * Las franjas prohibidas de una asignatura en un curso, con lo que hace falta para pintar la cuadrícula y
 * calcular los avisos (US19_c). Es lo que lee el repositorio: los avisos los calcula la aplicación.
 */
export interface SubjectSlotsSnapshot {
  readonly course: { readonly id: string; readonly name: string };
  readonly subject: {
    readonly id: string;
    readonly name: string;
    readonly code: string | null;
    readonly color: SubjectColor;
    readonly sessionsPerWeek: number;
    /** Máximo de sesiones sueltas al día (2 a 5), o `null` sin regla. */
    readonly maxPerDay: number | null;
    /** Tamaño del bloque de sesiones seguidas (2 o 3), o `null` sin regla. */
    readonly blockSize: number | null;
  };
  /** El calendario del curso con sus periodos en el orden de la jornada, o `null` si no tiene. */
  readonly calendar: {
    readonly id: string;
    readonly name: string;
    readonly periods: readonly CalendarPeriod[];
    /** Los tamaños de los tramos de sesiones seguidas entre recreos, en orden. */
    readonly sessionGroups: readonly number[];
  } | null;
  /** Las celdas prohibidas que existen en el calendario actual, por día y por sesión. */
  readonly cells: readonly SlotCell[];
  /** Cuántas celdas guardadas ya no existen en el calendario actual (sin calendario, todas). */
  readonly outsideCount: number;
}
