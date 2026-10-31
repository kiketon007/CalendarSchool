import type { CalendarPeriod } from '../../domain/calendar/calendar.js';
import type { SlotRuleType, SubjectSlotsSnapshot } from '../../domain/slots/subjectSlots.js';
import {
  preferredSlotsWarnings,
  subjectWarnings,
  type SlotCell,
  type WorkloadWarning,
} from '../../domain/workload/workloadWarnings.js';

/** Las franjas de una asignatura en un curso tal como las devuelve la API (`SubjectSlotRule`). */
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
  /** Las celdas prohibidas de la pareja, solo en las respuestas de las preferidas, para pintarlas. */
  readonly forbiddenSlots?: readonly SlotCell[];
  readonly outsideCalendarCount: number;
  readonly warnings: readonly WorkloadWarning[];
}

/**
 * Completa lo que leyó el repositorio con los avisos de la asignatura y le quita a la respuesta lo que solo sirve
 * para calcularlos (los tramos de sesiones). Si cabe o no lo deciden siempre las celdas **prohibidas**
 * (`subjectWarnings`, la misma regla que la carga del curso); con las preferidas se añaden las prohibidas de la
 * pareja (`forbiddenSlots`) y el aviso de contradicción (`preferredSlotsWarnings`), después de los demás.
 */
export function buildSubjectSlotRule(
  snapshot: SubjectSlotsSnapshot,
  type: SlotRuleType,
): SubjectSlotRule {
  const { course, subject, calendar, cells, outsideCount, forbiddenCells } = snapshot;
  return {
    course,
    subject,
    calendar:
      calendar === null
        ? null
        : { id: calendar.id, name: calendar.name, periods: calendar.periods },
    slots: cells,
    ...(type === 'PREFERRED_SLOTS' ? { forbiddenSlots: forbiddenCells } : {}),
    outsideCalendarCount: outsideCount,
    warnings: [
      ...subjectWarnings(
        subject,
        calendar === null ? null : { sessionGroups: calendar.sessionGroups },
        {
          cells: forbiddenCells,
          outsideCount,
        },
      ),
      ...(type === 'PREFERRED_SLOTS' ? preferredSlotsWarnings(cells, forbiddenCells) : []),
    ],
  };
}
