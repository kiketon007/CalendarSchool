import type { components } from '../api/generated/schema';
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

/** Una celda prohibida: un día (1, lunes, a 5) y el número de la sesión en la jornada. */
export type SlotCell = components['schemas']['SlotCell'];

/** Las franjas prohibidas de una asignatura que hacen falta para sus avisos. */
export interface SlotsSummary {
  /** Las celdas prohibidas que existen en el calendario actual. */
  cells: readonly SlotCell[];
  /** Cuántas celdas guardadas ya no existen en el calendario (sin calendario, todas). */
  outsideCount: number;
}

const NO_SLOTS: SlotsSummary = { cells: [], outsideCount: 0 };

/** `true` si entre las sesiones libres hay `size` seguidas dentro de un mismo tramo (sin recreo entre ellas). */
function fitsBlock(groups: readonly number[], forbidden: ReadonlySet<number>, size: number) {
  let first = 1;
  for (const length of groups) {
    let run = 0;
    for (let session = first; session < first + length; session += 1) {
      run = forbidden.has(session) ? 0 : run + 1;
      if (run >= size) {
        return true;
      }
    }
    first += length;
  }
  return false;
}

/**
 * Avisos de una asignatura en el curso: la **misma regla** que `subjectWarnings` del backend
 * (`domain/workload/workloadWarnings.ts`), y los dos tests recorren la misma tabla
 * (`test-fixtures/subject-warnings.json`). Con la carga `L`, el máximo `m` (1 sin regla), el bloque `k`,
 * `b = ⌊L / k⌋` bloques y `r = L mod k` sesiones sueltas: `BLOCK_LARGER_THAN_LOAD` si hay bloque y `L < k`;
 * `SUBJECT_DOES_NOT_FIT` (solo con calendario y sin el aviso anterior) si no hay `b` días que puedan llevar
 * un bloque (`k` sesiones libres seguidas de un mismo tramo) y dejen, entre los demás, sitio para `r` sueltas
 * (cada día, hasta `min(m, libres)`); y `SLOTS_OUTSIDE_CALENDAR` con las celdas que ya no existen.
 */
export function subjectWarnings(
  row: WorkloadDraftRow,
  day: { sessionGroups: readonly number[] } | null,
  slots: SlotsSummary = NO_SLOTS,
): WorkloadWarning[] {
  const { sessionsPerWeek: load, maxPerDay, blockSize } = row;
  if (load === null) {
    return [];
  }
  const outside: WorkloadWarning[] =
    slots.outsideCount > 0 ? [{ code: 'SLOTS_OUTSIDE_CALENDAR', count: slots.outsideCount }] : [];
  if (blockSize !== null && load < blockSize) {
    return [{ code: 'BLOCK_LARGER_THAN_LOAD' }, ...outside];
  }
  if (day === null) {
    return outside;
  }

  const blocks = blockSize === null ? 0 : Math.floor(load / blockSize);
  const loose = blockSize === null ? load : load % blockSize;
  const sessions = day.sessionGroups.reduce((total, size) => total + size, 0);
  const forbidden = Array.from({ length: SCHOOL_DAYS_PER_WEEK }, () => new Set<number>());
  for (const { dayOfWeek, sessionNumber } of slots.cells) {
    forbidden[dayOfWeek - 1]?.add(sessionNumber);
  }
  const looseOf = forbidden.map((cells) => {
    const free = Array.from({ length: sessions }, (_, index) => index + 1).filter(
      (session) => !cells.has(session),
    ).length;
    return Math.min(maxPerDay ?? 1, free);
  });
  const canBlock = forbidden.map(
    (cells) => blockSize !== null && fitsBlock(day.sessionGroups, cells, blockSize),
  );

  // Se prueba cada reparto de los bloques entre los días que pueden llevarlos.
  let fits = false;
  for (let mask = 0; mask < 1 << SCHOOL_DAYS_PER_WEEK && !fits; mask += 1) {
    const chosen = forbidden.map((_, index) => (mask & (1 << index)) !== 0);
    if (
      chosen.filter(Boolean).length === blocks &&
      chosen.every((isBlock, index) => !isBlock || canBlock[index])
    ) {
      const room = looseOf.reduce(
        (total, loosePerDay, index) => total + (chosen[index] ? 0 : loosePerDay),
        0,
      );
      fits = room >= loose;
    }
  }
  return fits ? outside : [{ code: 'SUBJECT_DOES_NOT_FIT' }, ...outside];
}

/**
 * El balance con lo elegido en el borrador, para que se actualice mientras se edita. Calcula los avisos del
 * curso como el servidor (`workloadWarnings`): sin calendario, solo avisa de eso; con él, avisa si lo asignado
 * supera lo disponible. Y los de cada asignatura con `subjectWarnings`. Tras guardar, la página vuelve a mostrar
 * lo que contesta el servidor.
 */
export function draftBalance(workload: CourseWorkload, draft: WorkloadDraft): WorkloadBalanceData {
  const rowOf = (id: string, fallback: WorkloadDraftRow) => draft[id] ?? fallback;
  const rows = workload.subjects.map(
    ({ id, sessionsPerWeek, maxPerDay, blockSize, forbiddenSlots, warnings }) => ({
      id,
      row: rowOf(id, { sessionsPerWeek, maxPerDay, blockSize }),
      slots: {
        cells: forbiddenSlots,
        // Las celdas fuera del calendario no viajan: se saben por el aviso que mandó el servidor.
        outsideCount: warnings.find(({ code }) => code === 'SLOTS_OUTSIDE_CALENDAR')?.count ?? 0,
      },
    }),
  );
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
      rows.map(({ id, row, slots }) => [id, subjectWarnings(row, workload.calendar, slots)]),
    ),
  };
}
