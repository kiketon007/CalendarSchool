import { MAX_TEACHING_MINUTES } from '../professor/teachingLoad.js';
import type {
  GenerationInput,
  InfeasibleCause,
  InfeasibleReason,
  ScheduleEntry,
  ScheduleSolver,
  SolveOptions,
  SolveOutcome,
} from './scheduleSolver.js';
import { validateSchedule } from './validateSchedule.js';

/** Tiempo máximo de la búsqueda por defecto: 120 s, el límite de la regla de diseño del backtracking. */
export const DEFAULT_LIMIT_MS = 120_000;
/** Cada cuántos nodos de la búsqueda se consultan el reloj y la cancelación. */
const CHECK_EVERY_NODES = 1024;
/** Los días de la semana lectiva. */
const DAYS = 5;
/** Máximo de emplazamientos de una unidad que cabe en el registro de deshacer (cinco días × 25 sesiones). */
const PLACEMENT_STRIDE = 128;

/** Las causas de poda que cuentan para explicar un `infeasible`, en el orden en que se desempata. */
const REASONS: readonly Exclude<InfeasibleReason, 'NO_FREE_CELLS'>[] = [
  'CLASS_BUSY',
  'PROFESSOR_BUSY',
  'DAILY_RULE',
  'MAX_HOURS',
];
const CLASS_BUSY = 0;
const PROFESSOR_BUSY = 1;
const DAILY_RULE = 2;
const MAX_HOURS = 3;
/** Poda por simetría entre unidades iguales: no explica nada al usuario, así que no se cuenta. */
const SYMMETRY = -1;

/** Una unidad lista para buscar: sus emplazamientos en arrays planos. */
interface SearchUnit {
  readonly index: number;
  readonly lesson: number;
  readonly classIndex: number;
  readonly professorIndex: number;
  readonly size: number;
  readonly days: readonly number[];
  readonly firsts: readonly number[];
  readonly starts: readonly number[];
  readonly ends: readonly number[];
  readonly minutes: readonly number[];
  /** La duración mínima entre sus emplazamientos, para la cota de HC7. */
  readonly minMinutes: number;
  /** Las demás unidades iguales de su lección (mismo tamaño). */
  readonly twins: readonly number[];
  readonly isBlock: boolean;
}

interface Frame {
  readonly unit: number;
  readonly candidates: readonly number[];
  next: number;
  /** Posición del registro de deshacer antes del emplazamiento actual, o -1 si no hay ninguno. */
  mark: number;
  /** Emplazamiento actual. */
  current: number;
}

/** Retrocesos del primer intento antes de reiniciar; cada reinicio multiplica el límite por {@link RESTART_GROWTH}. */
const FIRST_RESTART_AFTER = 100;
const RESTART_GROWTH = 1.5;

/** Generador pseudoaleatorio con semilla (mulberry32): los reinicios barajan los valores, pero siempre igual. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

const cededToEventLoop = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

/**
 * El motor de US-ALGO-RUN: backtracking con comprobación hacia delante (*forward checking*) sobre las unidades de
 * cada lección (bloques y sesiones sueltas), la variable más restringida primero (MRV ponderado, dom/wdeg), reinicios
 * con límite creciente y poda de simetrías entre unidades iguales de una lección. Cumple HC1–HC8: HC5 y HC2 por la propagación (una celda de una clase y un
 * intervalo de un profesor solo pueden estar ocupados una vez), HC3 con el uso diario de cada lección, HC4 y HC8 al
 * construir los dominios y HC7 con una cota (minutos colocados más la duración mínima de lo pendiente).
 *
 * **Determinista:** el orden de las unidades lo da la entrada, el desempate de MRV es el tamaño y el índice, y los
 * valores se prueban por día y sesión ascendentes; solo tras un reinicio se barajan, con una semilla fija. Cede el control al bucle de eventos cada
 * {@link CHECK_EVERY_NODES} nodos, al consultar el reloj y la cancelación. Antes de devolver `solved` valida el
 * horario con `validateSchedule`: si el motor se equivocara, lanza un error en lugar de entregar un horario inválido.
 */
export class BacktrackingSolver implements ScheduleSolver {
  async solve(input: GenerationInput, options: SolveOptions = {}): Promise<SolveOutcome> {
    const { limitMs = DEFAULT_LIMIT_MS, now = Date.now, isCancelled, onProgress } = options;
    const units = searchUnitsOf(input);
    const lessons = input.lessons;
    const totalSessions = units.reduce((total, { size }) => total + size, 0);

    // Antes de buscar: una unidad sin ningún emplazamiento no tiene solución, y la causa es exacta.
    const withoutPlacement = units.find(({ days }) => days.length === 0);
    if (withoutPlacement !== undefined) {
      return {
        status: 'infeasible',
        cause: causeOf(input, withoutPlacement.lesson, 'NO_FREE_CELLS'),
      };
    }

    const alive = units.map(({ days }) => new Uint8Array(days.length).fill(1));
    const count = Int32Array.from(units.map(({ days }) => days.length));
    // Peso de cada unidad (dom/wdeg): sube cada vez que su dominio se vacía, y se conserva entre reinicios.
    const weight = new Float64Array(units.length).fill(1);
    const placement = new Int32Array(units.length).fill(-1);
    const dayLoose = new Uint8Array(lessons.length * DAYS);
    const dayBlock = new Uint8Array(lessons.length * DAYS);
    const professorMinutes = new Int32Array(input.professors.length);
    const professorPending = new Int32Array(input.professors.length);
    const emptied = new Int32Array(lessons.length);
    const kills = new Int32Array(lessons.length * REASONS.length);
    const trail: number[] = [];

    const unitsOfClass = new Map<number, number[]>();
    const unitsOfProfessor = new Map<number, number[]>();
    for (const unit of units) {
      unitsOfClass.set(unit.classIndex, [...(unitsOfClass.get(unit.classIndex) ?? []), unit.index]);
      unitsOfProfessor.set(unit.professorIndex, [
        ...(unitsOfProfessor.get(unit.professorIndex) ?? []),
        unit.index,
      ]);
      professorPending[unit.professorIndex] =
        (professorPending[unit.professorIndex] ?? 0) + unit.minMinutes;
    }
    const unitsOfLesson = new Map<number, number[]>();
    for (const unit of units) {
      unitsOfLesson.set(unit.lesson, [...(unitsOfLesson.get(unit.lesson) ?? []), unit.index]);
    }

    let placedSessions = 0;
    let maxPlaced = 0;

    /** Quita un emplazamiento del dominio de una unidad. Devuelve `true` si la deja sin ninguno. */
    const kill = (unit: number, p: number, reason: number): boolean => {
      const flags = alive[unit];
      const target = units[unit];
      if (flags === undefined || target === undefined || flags[p] === 0) {
        return false;
      }
      flags[p] = 0;
      count[unit] = (count[unit] ?? 0) - 1;
      trail.push(unit * PLACEMENT_STRIDE + p);
      if (reason !== SYMMETRY) {
        const slot = target.lesson * REASONS.length + reason;
        kills[slot] = (kills[slot] ?? 0) + 1;
      }
      if (count[unit] === 0) {
        weight[unit] = (weight[unit] ?? 1) + 1;
        if (reason !== SYMMETRY) {
          emptied[target.lesson] = (emptied[target.lesson] ?? 0) + 1;
        }
        return true;
      }
      return false;
    };

    /** Deshace el registro hasta `mark` y el estado de la unidad colocada. */
    const unplace = (unit: SearchUnit, p: number, mark: number, applied: boolean): void => {
      while (trail.length > mark) {
        const entry = trail.pop() ?? 0;
        const u = Math.floor(entry / PLACEMENT_STRIDE);
        const q = entry % PLACEMENT_STRIDE;
        const flags = alive[u];
        if (flags !== undefined) {
          flags[q] = 1;
        }
        count[u] = (count[u] ?? 0) + 1;
      }
      if (!applied) {
        return;
      }
      const day = (unit.days[p] ?? 1) - 1;
      const slot = unit.lesson * DAYS + day;
      if (unit.isBlock) {
        dayBlock[slot] = 0;
      } else {
        dayLoose[slot] = (dayLoose[slot] ?? 1) - 1;
      }
      professorMinutes[unit.professorIndex] =
        (professorMinutes[unit.professorIndex] ?? 0) - (unit.minutes[p] ?? 0);
      professorPending[unit.professorIndex] =
        (professorPending[unit.professorIndex] ?? 0) + unit.minMinutes;
      placement[unit.index] = -1;
      placedSessions -= unit.size;
    };

    /** Coloca una unidad y propaga. Si algún dominio se vacía o se pasa de horas, deja todo como estaba. */
    const place = (unit: SearchUnit, p: number): boolean => {
      const mark = trail.length;
      const day = unit.days[p] ?? 1;
      const professor = unit.professorIndex;
      const minutes = unit.minutes[p] ?? 0;

      // HC7: minutos colocados más la duración mínima de lo pendiente (sin esta unidad).
      const pendingOthers = (professorPending[professor] ?? 0) - unit.minMinutes;
      const placedAfter = (professorMinutes[professor] ?? 0) + minutes;
      if (placedAfter + pendingOthers > MAX_TEACHING_MINUTES) {
        const slot = unit.lesson * REASONS.length + MAX_HOURS;
        kills[slot] = (kills[slot] ?? 0) + 1;
        emptied[unit.lesson] = (emptied[unit.lesson] ?? 0) + 1;
        return false;
      }

      placement[unit.index] = p;
      placedSessions += unit.size;
      professorMinutes[professor] = placedAfter;
      professorPending[professor] = pendingOthers;
      const dayIndex = unit.lesson * DAYS + (day - 1);
      if (unit.isBlock) {
        dayBlock[dayIndex] = 1;
      } else {
        dayLoose[dayIndex] = (dayLoose[dayIndex] ?? 0) + 1;
      }

      const lesson = lessons[unit.lesson];
      const maxPerDay = lesson?.maxPerDay ?? 1;
      const first = unit.firsts[p] ?? 1;
      const start = unit.starts[p] ?? 0;
      const end = unit.ends[p] ?? 0;
      const key = day * PLACEMENT_STRIDE + first;

      // HC5: otras unidades de la misma clase en las mismas celdas.
      for (const v of unitsOfClass.get(unit.classIndex) ?? []) {
        const other = units[v];
        if (v === unit.index || other === undefined || placement[v] !== -1) {
          continue;
        }
        for (let q = 0; q < other.days.length; q += 1) {
          if (
            alive[v]?.[q] === 1 &&
            other.days[q] === day &&
            first < (other.firsts[q] ?? 0) + other.size &&
            (other.firsts[q] ?? 0) < first + unit.size &&
            kill(v, q, CLASS_BUSY)
          ) {
            unplace(unit, p, mark, true);
            return false;
          }
        }
      }

      // HC2 por intervalos de hora y HC7 sobre lo que queda de cada unidad pendiente del profesor.
      const slack = MAX_TEACHING_MINUTES - placedAfter - pendingOthers;
      for (const v of unitsOfProfessor.get(professor) ?? []) {
        const other = units[v];
        if (v === unit.index || other === undefined || placement[v] !== -1) {
          continue;
        }
        for (let q = 0; q < other.days.length; q += 1) {
          if (alive[v]?.[q] !== 1) {
            continue;
          }
          const overlaps =
            other.days[q] === day && (other.starts[q] ?? 0) < end && start < (other.ends[q] ?? 0);
          const tooLong = (other.minutes[q] ?? 0) - other.minMinutes > slack;
          const reason = overlaps ? PROFESSOR_BUSY : tooLong ? MAX_HOURS : null;
          if (reason !== null && kill(v, q, reason)) {
            unplace(unit, p, mark, true);
            return false;
          }
        }
      }

      // HC3: el reparto diario de la lección.
      for (const v of unitsOfLesson.get(unit.lesson) ?? []) {
        const other = units[v];
        if (v === unit.index || other === undefined || placement[v] !== -1) {
          continue;
        }
        const closed = unit.isBlock || other.isBlock || (dayLoose[dayIndex] ?? 0) >= maxPerDay;
        if (!closed) {
          continue;
        }
        for (let q = 0; q < other.days.length; q += 1) {
          if (alive[v]?.[q] === 1 && other.days[q] === day && kill(v, q, DAILY_RULE)) {
            unplace(unit, p, mark, true);
            return false;
          }
        }
      }

      // Simetría: las unidades iguales de una lección se colocan en orden creciente de emplazamiento.
      for (const v of unit.twins) {
        const other = units[v];
        if (other === undefined || placement[v] !== -1) {
          continue;
        }
        const after = v > unit.index;
        for (let q = 0; q < other.days.length; q += 1) {
          const otherKey = (other.days[q] ?? 0) * PLACEMENT_STRIDE + (other.firsts[q] ?? 0);
          if (
            alive[v]?.[q] === 1 &&
            (after ? otherKey <= key : otherKey >= key) &&
            kill(v, q, SYMMETRY)
          ) {
            unplace(unit, p, mark, true);
            return false;
          }
        }
      }
      return true;
    };

    const frames: Frame[] = [];
    const startedAt = now();
    let nodes = 0;
    let descend = true;
    let backtracks = 0;
    let restartAfter = FIRST_RESTART_AFTER;
    let restarts = 0;
    let random = seededRandom(0);

    for (;;) {
      if (nodes % CHECK_EVERY_NODES === 0) {
        if (isCancelled?.() === true) {
          return { status: 'cancelled' };
        }
        if (now() - startedAt >= limitMs) {
          return { status: 'timeout', placed: maxPlaced, total: totalSessions };
        }
        await cededToEventLoop();
      }
      nodes += 1;

      if (descend) {
        if (placedSessions === totalSessions) {
          break;
        }
        // MRV ponderado (dom/wdeg): la unidad pendiente con menos emplazamientos vivos por unidad de peso; sin
        // fallos todos pesan 1 y es MRV. Empate: la de mayor tamaño y después el índice.
        let best = -1;
        for (const unit of units) {
          if (placement[unit.index] !== -1) {
            continue;
          }
          const bestUnit = best === -1 ? undefined : units[best];
          const mine = (count[unit.index] ?? 0) * (best === -1 ? 1 : (weight[best] ?? 1));
          const theirs = best === -1 ? 0 : (count[best] ?? 0) * (weight[unit.index] ?? 1);
          if (
            bestUnit === undefined ||
            mine < theirs ||
            (mine === theirs && unit.size > bestUnit.size)
          ) {
            best = unit.index;
          }
        }
        const flags = alive[best] ?? new Uint8Array(0);
        const candidates: number[] = [];
        flags.forEach((flag, q) => {
          if (flag === 1) {
            candidates.push(q);
          }
        });
        if (restarts > 0) {
          // Tras un reinicio los valores se prueban en otro orden (con semilla fija) para no repetir el mismo camino.
          for (let i = candidates.length - 1; i > 0; i -= 1) {
            const j = Math.floor(random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j] ?? 0, candidates[i] ?? 0];
          }
        }
        frames.push({ unit: best, candidates, next: 0, mark: -1, current: -1 });
      }

      const frame = frames[frames.length - 1];
      if (frame === undefined) {
        break;
      }
      const unit = units[frame.unit];
      if (unit === undefined) {
        break;
      }
      if (frame.mark >= 0) {
        unplace(unit, frame.current, frame.mark, true);
        frame.mark = -1;
      }

      let advanced = false;
      while (frame.next < frame.candidates.length) {
        const p = frame.candidates[frame.next] ?? 0;
        frame.next += 1;
        const mark = trail.length;
        if (place(unit, p)) {
          frame.mark = mark;
          frame.current = p;
          advanced = true;
          break;
        }
      }

      if (advanced) {
        descend = true;
        if (placedSessions > maxPlaced) {
          maxPlaced = placedSessions;
          onProgress?.(maxPlaced, totalSessions);
        }
      } else {
        frames.pop();
        descend = false;
        if (frames.length === 0) {
          return { status: 'infeasible', cause: explainedCause(input, emptied, kills) };
        }
        backtracks += 1;
        if (backtracks >= restartAfter) {
          // Reinicio: se deshace todo y se vuelve a empezar con los pesos aprendidos, con un límite mayor.
          while (frames.length > 0) {
            const top = frames.pop();
            const topUnit = top === undefined ? undefined : units[top.unit];
            if (top !== undefined && topUnit !== undefined && top.mark >= 0) {
              unplace(topUnit, top.current, top.mark, true);
            }
          }
          backtracks = 0;
          restartAfter = Math.ceil(restartAfter * RESTART_GROWTH);
          restarts += 1;
          random = seededRandom(restarts);
          descend = true;
        }
      }
    }

    const entries = entriesOf(input, units, placement);
    const violations = validateSchedule(input, entries);
    if (violations.length > 0) {
      throw new Error(
        `El motor produjo un horario inválido: ${violations.map(({ rule }) => rule).join(', ')}`,
      );
    }
    return { status: 'solved', entries };
  }
}

/** Las unidades de la entrada en arrays planos, con sus gemelas y los minutos de cada emplazamiento. */
function searchUnitsOf(input: GenerationInput): SearchUnit[] {
  const classIndexOf = new Map<string, number>();
  const professorIndexOf = new Map(input.professors.map(({ id }, index) => [id, index]));
  const courseById = new Map(input.courses.map((course) => [course.id, course]));

  return input.units.map((unit) => {
    const lesson = input.lessons[unit.lessonIndex];
    if (lesson === undefined) {
      throw new Error('Una unidad apunta a una lección que no existe');
    }
    if (!classIndexOf.has(lesson.classId)) {
      classIndexOf.set(lesson.classId, classIndexOf.size);
    }
    const cells = courseById.get(lesson.courseId)?.cells ?? [];
    const starts: number[] = [];
    const ends: number[] = [];
    const minutes: number[] = [];
    for (const { firstSession } of unit.placements) {
      const run = cells.slice(firstSession - 1, firstSession - 1 + unit.size);
      starts.push(run[0]?.startMinute ?? 0);
      ends.push(run[run.length - 1]?.endMinute ?? 0);
      minutes.push(
        run.reduce((total, { startMinute, endMinute }) => total + endMinute - startMinute, 0),
      );
    }
    const twins = input.units
      .filter(
        (other) =>
          other.index !== unit.index &&
          other.lessonIndex === unit.lessonIndex &&
          other.size === unit.size,
      )
      .map(({ index }) => index);
    return {
      index: unit.index,
      lesson: unit.lessonIndex,
      classIndex: classIndexOf.get(lesson.classId) ?? 0,
      professorIndex: professorIndexOf.get(lesson.professorId) ?? 0,
      size: unit.size,
      days: unit.placements.map(({ dayOfWeek }) => dayOfWeek),
      firsts: unit.placements.map(({ firstSession }) => firstSession),
      starts,
      ends,
      minutes,
      minMinutes: minutes.length === 0 ? 0 : Math.min(...minutes),
      twins,
      isBlock: unit.size > 1,
    };
  });
}

/** La causa de un `infeasible` a partir de una lección y un motivo. */
function causeOf(
  input: GenerationInput,
  lessonIndex: number,
  reason: InfeasibleReason,
): InfeasibleCause {
  const lesson = input.lessons[lessonIndex];
  if (lesson === undefined) {
    throw new Error('La causa apunta a una lección que no existe');
  }
  return {
    reason,
    course: { id: lesson.courseId, name: lesson.courseName },
    schoolClass: { id: lesson.classId, name: lesson.className },
    subject: { id: lesson.subjectId, name: lesson.subjectName },
    professor: { id: lesson.professorId, name: lesson.professorName },
  };
}

/**
 * La causa orientativa tras agotar la búsqueda: la lección que más veces se quedó sin opciones y la restricción que
 * más valores le quitó. No es una demostración de cuál es la restricción culpable.
 */
function explainedCause(
  input: GenerationInput,
  emptied: Int32Array,
  kills: Int32Array,
): InfeasibleCause {
  let lesson = 0;
  emptied.forEach((times, index) => {
    if (times > (emptied[lesson] ?? 0)) {
      lesson = index;
    }
  });
  let reason = 0;
  for (let r = 1; r < REASONS.length; r += 1) {
    if (
      (kills[lesson * REASONS.length + r] ?? 0) > (kills[lesson * REASONS.length + reason] ?? 0)
    ) {
      reason = r;
    }
  }
  return causeOf(input, lesson, REASONS[reason] ?? 'CLASS_BUSY');
}

/** Las entradas del horario, una por sesión, ordenadas por lección, día y sesión. */
function entriesOf(
  input: GenerationInput,
  units: readonly SearchUnit[],
  placement: Int32Array,
): ScheduleEntry[] {
  const courseById = new Map(input.courses.map((course) => [course.id, course]));
  const entries: { lesson: number; entry: ScheduleEntry }[] = [];
  for (const unit of units) {
    const lesson = input.lessons[unit.lesson];
    const p = placement[unit.index] ?? -1;
    if (lesson === undefined || p < 0) {
      continue;
    }
    const cells = courseById.get(lesson.courseId)?.cells ?? [];
    for (let offset = 0; offset < unit.size; offset += 1) {
      const sessionNumber = (unit.firsts[p] ?? 1) + offset;
      const cell = cells[sessionNumber - 1];
      entries.push({
        lesson: unit.lesson,
        entry: {
          courseId: lesson.courseId,
          classId: lesson.classId,
          subjectId: lesson.subjectId,
          professorId: lesson.professorId,
          dayOfWeek: unit.days[p] ?? 1,
          sessionNumber,
          startMinute: cell?.startMinute ?? 0,
          endMinute: cell?.endMinute ?? 0,
        },
      });
    }
  }
  return entries
    .sort(
      (a, b) =>
        a.lesson - b.lesson ||
        a.entry.dayOfWeek - b.entry.dayOfWeek ||
        a.entry.sessionNumber - b.entry.sessionNumber,
    )
    .map(({ entry }) => entry);
}
