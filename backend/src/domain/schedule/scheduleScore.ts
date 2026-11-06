import type { GenerationInput, GenerationLesson, ScheduleEntry } from './scheduleSolver.js';

/**
 * La puntuación de un horario (US-ALGO-RUN_b): el desglose de las restricciones blandas. Cuanto menor, mejor.
 * `initialTotal` es la penalización del horario válido de partida; `scoreSchedule` lo iguala a `total` y quien mejora el
 * horario lo sustituye.
 */
export interface ScheduleScore {
  /** `10 · preferredMisses + 3 · professorGaps + 1 · consecutiveDays`. */
  readonly total: number;
  /** SC4: sesiones fuera de las celdas preferidas de su asignatura. */
  readonly preferredMisses: number;
  /** SC4: sesiones de las lecciones que tienen alguna celda preferida válida. */
  readonly preferredTotal: number;
  /** SC1: celdas libres de un profesor entre dos de sus sesiones del mismo día. */
  readonly professorGaps: number;
  /** SC3: pares de días contiguos en los que una lección tiene alguna sesión. */
  readonly consecutiveDays: number;
  readonly initialTotal: number;
}

/** Los pesos de la penalización (SC4 > SC1 > SC3). Constantes: configurarlos es otra historia. */
export const SCORE_WEIGHTS = { preferredMiss: 10, professorGap: 3, consecutiveDay: 1 } as const;

/** La penalización ponderada de unos recuentos. */
export const penaltyOf = (counts: {
  readonly preferredMisses: number;
  readonly professorGaps: number;
  readonly consecutiveDays: number;
}) =>
  SCORE_WEIGHTS.preferredMiss * counts.preferredMisses +
  SCORE_WEIGHTS.professorGap * counts.professorGaps +
  SCORE_WEIGHTS.consecutiveDay * counts.consecutiveDays;

const SCORE_FIELDS = [
  'total',
  'preferredMisses',
  'preferredTotal',
  'professorGaps',
  'consecutiveDays',
  'initialTotal',
] as const;

/** Si un valor desconocido (un JSON guardado) es una puntuación: los seis enteros no negativos y nada más. */
export function isScheduleScore(value: unknown): value is ScheduleScore {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    keys.length === SCORE_FIELDS.length &&
    SCORE_FIELDS.every((field) => {
      const number = record[field];
      return typeof number === 'number' && Number.isInteger(number) && number >= 0;
    })
  );
}

const key = (...parts: (string | number)[]) => parts.join('|');

/**
 * Puntúa un horario (US-ALGO-RUN_b). Pura, sin E/S y sin el estado del motor, para que la reutilice cualquier otro.
 *
 * - **SC4:** una sesión de una lección con celdas preferidas cuenta en `preferredTotal` y, si no está en una de ellas,
 *   en `preferredMisses`.
 * - **SC1:** por profesor y día, entre cada dos sesiones suyas consecutivas por hora, las celdas de los calendarios de
 *   los cursos en los que da clase que caen enteras entre las dos, una sola vez por intervalo `[inicio, fin)`. Un
 *   recreo no es una celda; antes de la primera y después de la última no hay hueco; una entrada sin profesor conocido
 *   no cuenta.
 * - **SC3:** por lección, los pares de días contiguos con alguna sesión.
 */
export function scoreSchedule(
  input: GenerationInput,
  entries: readonly ScheduleEntry[],
): ScheduleScore {
  const lessonOf = new Map<string, GenerationLesson>();
  for (const lesson of input.lessons) {
    lessonOf.set(key(lesson.classId, lesson.subjectId), lesson);
  }

  let preferredTotal = 0;
  let preferredMisses = 0;
  const daysOfLesson = new Map<number, Set<number>>();
  for (const entry of entries) {
    const lesson = lessonOf.get(key(entry.classId, entry.subjectId));
    if (lesson === undefined) {
      continue;
    }
    if (lesson.preferred.length > 0) {
      preferredTotal += 1;
      const inPreferred = lesson.preferred.some(
        ({ dayOfWeek, sessionNumber }) =>
          dayOfWeek === entry.dayOfWeek && sessionNumber === entry.sessionNumber,
      );
      if (!inPreferred) {
        preferredMisses += 1;
      }
    }
    const days = daysOfLesson.get(lesson.index) ?? new Set<number>();
    days.add(entry.dayOfWeek);
    daysOfLesson.set(lesson.index, days);
  }

  let consecutiveDays = 0;
  for (const days of daysOfLesson.values()) {
    for (let day = 1; day < 5; day += 1) {
      if (days.has(day) && days.has(day + 1)) {
        consecutiveDays += 1;
      }
    }
  }

  const professorGaps = professorGapsOf(input, entries);
  const total = penaltyOf({ preferredMisses, professorGaps, consecutiveDays });
  return {
    total,
    preferredMisses,
    preferredTotal,
    professorGaps,
    consecutiveDays,
    initialTotal: total,
  };
}

/** SC1: los huecos de todos los profesores (ver `scoreSchedule`). */
function professorGapsOf(input: GenerationInput, entries: readonly ScheduleEntry[]): number {
  const courseById = new Map(input.courses.map((course) => [course.id, course]));

  // Los intervalos distintos de las celdas de los calendarios de los cursos de cada profesor.
  const cellsOfProfessor = new Map<string, Map<string, { start: number; end: number }>>();
  for (const lesson of input.lessons) {
    const cells =
      cellsOfProfessor.get(lesson.professorId) ?? new Map<string, { start: number; end: number }>();
    for (const cell of courseById.get(lesson.courseId)?.cells ?? []) {
      cells.set(key(cell.startMinute, cell.endMinute), {
        start: cell.startMinute,
        end: cell.endMinute,
      });
    }
    cellsOfProfessor.set(lesson.professorId, cells);
  }

  const byProfessorDay = new Map<string, ScheduleEntry[]>();
  for (const entry of entries) {
    if (!cellsOfProfessor.has(entry.professorId)) {
      continue;
    }
    const slot = key(entry.professorId, entry.dayOfWeek);
    byProfessorDay.set(slot, [...(byProfessorDay.get(slot) ?? []), entry]);
  }

  let gaps = 0;
  for (const [slot, dayEntries] of byProfessorDay) {
    const professorId = slot.slice(0, slot.lastIndexOf('|'));
    const cells = [...(cellsOfProfessor.get(professorId)?.values() ?? [])];
    const sorted = [...dayEntries].sort(
      (a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute,
    );
    for (let i = 1; i < sorted.length; i += 1) {
      const from = sorted[i - 1]?.endMinute ?? 0;
      const to = sorted[i]?.startMinute ?? 0;
      gaps += cells.filter(({ start, end }) => start >= from && end <= to).length;
    }
  }
  return gaps;
}
