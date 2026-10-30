import type {
  CourseWorkload,
  CourseWorkloadChange,
  WorkloadWarning,
} from '../services/courseWorkloadService';

/** La fila de una asignatura mientras se edita la matriz: sus sesiones y sus dos reglas (`null`: sin ellas). */
export interface WorkloadDraftRow {
  /** `null` es «No se imparte». */
  sessionsPerWeek: number | null;
  maxPerDay: number | null;
  blockSize: number | null;
}

/** Lo elegido para cada asignatura mientras se edita la matriz. */
export type WorkloadDraft = Readonly<Record<string, WorkloadDraftRow>>;

/** Lo que muestra el balance, con los avisos de cada asignatura recalculados con el borrador. */
export interface WorkloadBalanceData extends Pick<
  CourseWorkload,
  'calendar' | 'assignedSessions' | 'availableSessions' | 'warnings'
> {
  subjectWarnings: Readonly<Record<string, readonly WorkloadWarning[]>>;
}

/** Los días lectivos de la semana: la jornada es la misma de lunes a viernes. */
const SCHOOL_DAYS_PER_WEEK = 5;

/** El borrador de partida: lo que el servidor devolvió, asignatura por asignatura. */
export function draftFrom(workload: CourseWorkload): WorkloadDraft {
  return Object.fromEntries(
    workload.subjects.map(({ id, sessionsPerWeek, maxPerDay, blockSize }) => [
      id,
      { sessionsPerWeek, maxPerDay, blockSize },
    ]),
  );
}

/**
 * La fila con otras sesiones. Una asignatura que deja de impartirse pierde sus reglas (`null`), porque el
 * servidor no admite reglas sin carga; si se vuelve a elegir un número, las reglas empiezan de cero.
 */
export function rowWithSessions(
  row: WorkloadDraftRow,
  sessionsPerWeek: number | null,
): WorkloadDraftRow {
  return sessionsPerWeek === null
    ? { sessionsPerWeek: null, maxPerDay: null, blockSize: null }
    : { ...row, sessionsPerWeek };
}

/**
 * Las filas que cambian respecto a lo cargado, **enteras** y en el orden del servidor: es lo único que se
 * envía, para no pisar lo que otra persona haya cambiado en otras asignaturas del curso.
 */
export function changesOf(workload: CourseWorkload, draft: WorkloadDraft): CourseWorkloadChange[] {
  return workload.subjects.flatMap(({ id, sessionsPerWeek, maxPerDay, blockSize }) => {
    const chosen = draft[id] ?? { sessionsPerWeek, maxPerDay, blockSize };
    return chosen.sessionsPerWeek === sessionsPerWeek &&
      chosen.maxPerDay === maxPerDay &&
      chosen.blockSize === blockSize
      ? []
      : [{ subjectId: id, ...chosen }];
  });
}

/**
 * Cuántas reglas se perderían al guardar para esa asignatura: las que tenía en el servidor si el borrador la
 * deja sin impartir. Si el usuario solo las vació a mano, ya no cuentan: no hay nada que avisar.
 */
export function rulesLostOf(workload: CourseWorkload, draft: WorkloadDraft, subjectId: string) {
  const loaded = workload.subjects.find(({ id }) => id === subjectId);
  if (loaded === undefined || loaded.sessionsPerWeek === null) {
    return 0;
  }
  return draft[subjectId]?.sessionsPerWeek === null ? loaded.constraintCount : 0;
}

/**
 * Avisos de una asignatura en el curso: la **misma regla** que `subjectWarnings` del backend
 * (`domain/workload/workloadWarnings.ts`). Con la carga `L`, el máximo `m` (1 sin regla) y el bloque `k`:
 * `BLOCK_LARGER_THAN_LOAD` si hay bloque y `L < k`, y `SUBJECT_DOES_NOT_FIT` (solo con calendario y sin el
 * aviso anterior) si hay bloques y ningún tramo sin recreo llega a `k`, o si hacen falta más de cinco días.
 */
export function subjectWarnings(
  row: WorkloadDraftRow,
  day: { sessionsPerDay: number; maxConsecutiveSessions: number } | null,
): WorkloadWarning[] {
  const { sessionsPerWeek: load, maxPerDay, blockSize } = row;
  if (load === null) {
    return [];
  }
  if (blockSize !== null && load < blockSize) {
    return [{ code: 'BLOCK_LARGER_THAN_LOAD' }];
  }
  if (day === null) {
    return [];
  }
  const blocks = blockSize === null ? 0 : Math.floor(load / blockSize);
  const loose = blockSize === null ? load : load % blockSize;
  const perDay = Math.min(maxPerDay ?? 1, day.sessionsPerDay);
  const stretchTooShort =
    blockSize !== null && blocks > 0 && day.maxConsecutiveSessions < blockSize;
  const daysNeeded = blocks + Math.ceil(loose / perDay);
  return stretchTooShort || daysNeeded > SCHOOL_DAYS_PER_WEEK
    ? [{ code: 'SUBJECT_DOES_NOT_FIT' }]
    : [];
}

/**
 * El balance con lo elegido en el borrador, para que se actualice mientras se edita. Calcula los avisos del
 * curso como el servidor (`workloadWarnings`): sin calendario, solo avisa de eso; con él, avisa si lo asignado
 * supera lo disponible. Y los de cada asignatura con `subjectWarnings`. Tras guardar, la página vuelve a mostrar
 * lo que contesta el servidor.
 */
export function draftBalance(workload: CourseWorkload, draft: WorkloadDraft): WorkloadBalanceData {
  const rowOf = (id: string, fallback: WorkloadDraftRow) => draft[id] ?? fallback;
  const rows = workload.subjects.map(({ id, sessionsPerWeek, maxPerDay, blockSize }) => ({
    id,
    row: rowOf(id, { sessionsPerWeek, maxPerDay, blockSize }),
  }));
  const assignedSessions = rows.reduce((total, { row }) => total + (row.sessionsPerWeek ?? 0), 0);
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
  return {
    calendar: workload.calendar,
    assignedSessions,
    availableSessions,
    warnings,
    subjectWarnings: Object.fromEntries(
      rows.map(({ id, row }) => [id, subjectWarnings(row, workload.calendar)]),
    ),
  };
}
