import type {
  CourseWorkload,
  CourseWorkloadSnapshot,
} from '../../domain/workload/courseWorkload.js';
import {
  SCHOOL_DAYS_PER_WEEK,
  subjectWarnings,
  workloadWarnings,
} from '../../domain/workload/workloadWarnings.js';
import { byName } from '../courses/courseOrdering.js';

/**
 * Completa lo que leyó el repositorio con el balance de la carga: las asignaturas por nombre con la
 * comparación del castellano (como el listado de asignaturas), las sesiones asignadas, las disponibles
 * (`sesiones al día × 5`, o `null` sin calendario), los avisos del curso y los de cada asignatura (US19_b,
 * con sus franjas prohibidas en US19_c). No modifica el original.
 */
export function buildCourseWorkload(snapshot: CourseWorkloadSnapshot): CourseWorkload {
  const assignedSessions = snapshot.subjects.reduce(
    (total, subject) => total + (subject.sessionsPerWeek ?? 0),
    0,
  );
  const availableSessions =
    snapshot.calendar === null ? null : snapshot.calendar.sessionsPerDay * SCHOOL_DAYS_PER_WEEK;
  return {
    course: snapshot.course,
    calendar: snapshot.calendar,
    subjects: [...snapshot.subjects].sort(byName).map(({ outsideSlotCount, ...subject }) => ({
      ...subject,
      warnings: subjectWarnings(subject, snapshot.calendar, {
        cells: subject.forbiddenSlots,
        outsideCount: outsideSlotCount,
      }),
    })),
    assignedSessions,
    availableSessions,
    warnings: workloadWarnings({ assignedSessions, availableSessions }),
  };
}
