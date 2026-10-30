import type { CourseWorkload, CourseWorkloadChange } from '../services/courseWorkloadService';

/** Sesiones elegidas para cada asignatura mientras se edita la matriz: `null` es «No se imparte». */
export type WorkloadDraft = Readonly<Record<string, number | null>>;

/** Lo que muestra el balance. */
export type WorkloadBalanceData = Pick<
  CourseWorkload,
  'calendar' | 'assignedSessions' | 'availableSessions' | 'warnings'
>;

/** El borrador de partida: lo que el servidor devolvió, asignatura por asignatura. */
export function draftFrom(workload: CourseWorkload): WorkloadDraft {
  return Object.fromEntries(
    workload.subjects.map(({ id, sessionsPerWeek }) => [id, sessionsPerWeek]),
  );
}

/**
 * Las filas que cambian respecto a lo cargado, en el orden del servidor: es lo único que se envía, para no
 * pisar lo que otra persona haya cambiado en otras asignaturas del curso.
 */
export function changesOf(workload: CourseWorkload, draft: WorkloadDraft): CourseWorkloadChange[] {
  return workload.subjects.flatMap(({ id, sessionsPerWeek }) => {
    const chosen = draft[id] ?? null;
    return chosen === sessionsPerWeek ? [] : [{ subjectId: id, sessionsPerWeek: chosen }];
  });
}

/**
 * El balance con lo elegido en el borrador, para que se actualice mientras se edita. Calcula los avisos como el
 * servidor (`workloadWarnings`): sin calendario, solo avisa de eso; con él, avisa si lo asignado supera lo
 * disponible. Tras guardar, la página vuelve a mostrar lo que contesta el servidor.
 */
export function draftBalance(workload: CourseWorkload, draft: WorkloadDraft): WorkloadBalanceData {
  const assignedSessions = workload.subjects.reduce((total, { id }) => total + (draft[id] ?? 0), 0);
  const { availableSessions } = workload;
  const warnings: CourseWorkload['warnings'] =
    availableSessions === null
      ? [{ code: 'COURSE_WITHOUT_CALENDAR' }]
      : assignedSessions > availableSessions
        ? [
            {
              code: 'WORKLOAD_EXCEEDS_SLOTS',
              assigned: assignedSessions,
              available: availableSessions,
            },
          ]
        : [];
  return { calendar: workload.calendar, assignedSessions, availableSessions, warnings };
}
