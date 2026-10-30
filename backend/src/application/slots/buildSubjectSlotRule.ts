import type { CalendarPeriod } from '../../domain/calendar/calendar.js';
import type { SubjectSlotsSnapshot } from '../../domain/slots/subjectSlots.js';
import {
  subjectWarnings,
  type SlotCell,
  type WorkloadWarning,
} from '../../domain/workload/workloadWarnings.js';

/** Las franjas prohibidas de una asignatura en un curso tal como las devuelve la API (`SubjectSlotRule`). */
export interface SubjectSlotRule {
  readonly course: SubjectSlotsSnapshot['course'];
  readonly subject: SubjectSlotsSnapshot['subject'];
  /** El calendario del curso con sus periodos en el orden de la jornada, o `null` si no tiene. */
  readonly calendar: {
    readonly id: string;
    readonly name: string;
    readonly periods: readonly CalendarPeriod[];
  } | null;
  readonly slots: readonly SlotCell[];
  readonly outsideCalendarCount: number;
  readonly warnings: readonly WorkloadWarning[];
}

/**
 * Completa lo que leyó el repositorio con los avisos de la asignatura (`subjectWarnings`, la misma regla que
 * la carga del curso) y le quita a la respuesta lo que solo sirve para calcularlos (los tramos de sesiones).
 */
export function buildSubjectSlotRule(snapshot: SubjectSlotsSnapshot): SubjectSlotRule {
  const { course, subject, calendar, cells, outsideCount } = snapshot;
  return {
    course,
    subject,
    calendar:
      calendar === null
        ? null
        : { id: calendar.id, name: calendar.name, periods: calendar.periods },
    slots: cells,
    outsideCalendarCount: outsideCount,
    warnings: subjectWarnings(
      subject,
      calendar === null ? null : { sessionGroups: calendar.sessionGroups },
      { cells, outsideCount },
    ),
  };
}
