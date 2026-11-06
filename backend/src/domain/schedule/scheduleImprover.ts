import { MAX_TEACHING_MINUTES } from '../professor/teachingLoad.js';
import { SCORE_WEIGHTS, type ScheduleScore } from './scheduleScore.js';
import type { GenerationInput, ImprovementStop, Placement } from './scheduleSolver.js';
import { searchUnitsOf } from './searchUnits.js';

/** Los días de la semana lectiva. */
const DAYS = 5;
/** Cada cuántas evaluaciones se consultan el reloj y la cancelación (como los nodos de la fase 1). */
const CHECK_EVERY_EVALUATIONS = 1024;

/** Lo que se inyecta a la mejora: el tiempo, la cancelación y el aviso de la puntuación. */
export interface ImproveOptions {
  /** Tiempo máximo de la mejora, en milisegundos. Con 0 se para en la primera consulta. */
  readonly budgetMs: number;
  /** Reloj en milisegundos (`Date.now` por defecto). */
  readonly now?: () => number;
  /** Se consulta cada `checkEvery` evaluaciones. */
  readonly isCancelled?: () => boolean;
  /** La puntuación de partida y cada vez que baja la penalización. `total` nunca sube. */
  readonly onScore?: (score: ScheduleScore) => void;
  /** Cada cuántas evaluaciones se consultan el reloj y la cancelación (1024 por defecto). */
  readonly checkEvery?: number;
}

/** Los recuentos de la penalización: SC4 (fallos), SC1 (huecos) y SC3 (pares de días seguidos). */
export interface Counts {
  readonly misses: number;
  readonly gaps: number;
  readonly pairs: number;
}

export interface ImproveResult {
  /** Un emplazamiento por unidad, en el orden de `input.units`. */
  readonly placements: readonly Placement[];
  /** La penalización del horario de partida y la del final (la de `scoreSchedule`). */
  readonly initialPenalty: number;
  readonly penalty: number;
  /** El desglose del horario final: fallos de preferidas, huecos y pares de días seguidos. */
  readonly counts: Counts;
  /** Movimientos aceptados. */
  readonly moves: number;
  readonly stoppedBy: Exclude<ImprovementStop, 'SKIPPED'>;
  readonly elapsedMs: number;
}

const cededToEventLoop = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

/**
 * La fase de mejora de US-ALGO-RUN_b: una búsqueda local (ascenso de colina) que parte de un horario válido y lo va
 * cambiando mientras baje **estrictamente** la penalización de `scoreSchedule` sin romper HC1–HC8.
 *
 * - **Movimientos:** mover una unidad a otro emplazamiento de su dominio, o intercambiar los emplazamientos de dos
 *   unidades de la misma clase y el mismo tamaño (de lecciones distintas). Recorre las unidades en el orden de la
 *   entrada, prueba los movimientos en un orden fijo y acepta el primero que mejora; una pasada entera sin aceptar
 *   ninguno es la convergencia.
 * - **Duras, de forma incremental:** quita del estado las unidades que se mueven y comprueba solo lo que cambia: HC5
 *   (celdas de la clase), HC2 (intervalos del profesor ese día), HC3 (sueltas y bloques de la lección ese día) y HC7
 *   (minutos del profesor). HC4 y HC8 ya están en el dominio de cada unidad, y HC1 y HC6 no cambian al mover.
 * - **Variación de la penalización:** se compara solo lo que toca el movimiento (los huecos de los profesores y días
 *   afectados, los días de las lecciones afectadas y las preferidas de las unidades movidas).
 * - **Determinista:** sin azar; el reloj y la cancelación se consultan cada {@link CHECK_EVERY_EVALUATIONS}
 *   evaluaciones y entonces cede el control al bucle de eventos.
 */
export async function improveSchedule(
  input: GenerationInput,
  initial: readonly Placement[],
  options: ImproveOptions,
): Promise<ImproveResult> {
  const {
    budgetMs,
    now = Date.now,
    isCancelled,
    onScore,
    checkEvery = CHECK_EVERY_EVALUATIONS,
  } = options;
  const units = searchUnitsOf(input);
  const lessons = input.lessons;
  const courseById = new Map(input.courses.map((course) => [course.id, course]));
  const professorIndexOf = new Map(input.professors.map(({ id }, index) => [id, index]));

  // El emplazamiento actual de cada unidad, como posición en su lista (-1: quitada del estado).
  const placed = new Int32Array(units.length);
  units.forEach((unit, index) => {
    const start = initial[index];
    const position = unit.days.findIndex(
      (day, q) => day === start?.dayOfWeek && unit.firsts[q] === start.firstSession,
    );
    if (position < 0) {
      throw new Error('El emplazamiento inicial no está en el dominio de su unidad');
    }
    placed[index] = position;
  });

  const sessionStride = Math.max(0, ...input.courses.map(({ cells }) => cells.length)) + 2;
  const classCount = Math.max(-1, ...units.map(({ classIndex }) => classIndex)) + 1;
  const classOccupancy = new Int32Array(classCount * DAYS * sessionStride).fill(-1);
  const professorDay: number[][] = Array.from({ length: input.professors.length * DAYS }, () => []);
  const dayLoose = new Uint8Array(lessons.length * DAYS);
  const dayBlock = new Uint8Array(lessons.length * DAYS);
  const professorMinutes = new Int32Array(input.professors.length);

  // Los intervalos distintos de las celdas de los calendarios de los cursos de cada profesor, por hora de inicio.
  const professorCells = input.professors.map(() => new Map<string, [number, number]>());
  for (const lesson of lessons) {
    const professorIndex = professorIndexOf.get(lesson.professorId) ?? 0;
    for (const cell of courseById.get(lesson.courseId)?.cells ?? []) {
      professorCells[professorIndex]?.set(`${String(cell.startMinute)}-${String(cell.endMinute)}`, [
        cell.startMinute,
        cell.endMinute,
      ]);
    }
  }
  const cellStarts = professorCells.map((cells) =>
    [...cells.values()].sort((a, b) => a[0] - b[0]).map(([start]) => start),
  );
  const cellEnds = professorCells.map((cells) =>
    [...cells.values()].sort((a, b) => a[0] - b[0]).map(([, end]) => end),
  );

  // Las celdas preferidas de cada lección y los fallos de cada emplazamiento de cada unidad (SC4).
  const preferredKeys = lessons.map(
    ({ preferred }) =>
      new Set(
        preferred.map(({ dayOfWeek, sessionNumber }) => dayOfWeek * sessionStride + sessionNumber),
      ),
  );
  const missesAt = units.map((unit) =>
    unit.days.map((day, q) => {
      const preferred = preferredKeys[unit.lesson];
      if (preferred === undefined || preferred.size === 0) {
        return 0;
      }
      let misses = 0;
      for (let offset = 0; offset < unit.size; offset += 1) {
        if (!preferred.has(day * sessionStride + (unit.firsts[q] ?? 0) + offset)) {
          misses += 1;
        }
      }
      return misses;
    }),
  );

  const classSlot = (unit: number, day: number, session: number) =>
    ((units[unit]?.classIndex ?? 0) * DAYS + (day - 1)) * sessionStride + session;

  /** Quita una unidad del estado. */
  const remove = (u: number): void => {
    const unit = units[u];
    const p = placed[u] ?? -1;
    if (unit === undefined || p < 0) {
      return;
    }
    const day = unit.days[p] ?? 1;
    for (let offset = 0; offset < unit.size; offset += 1) {
      classOccupancy[classSlot(u, day, (unit.firsts[p] ?? 0) + offset)] = -1;
    }
    const list = professorDay[unit.professorIndex * DAYS + day - 1];
    const at = list?.indexOf(u) ?? -1;
    if (at >= 0) {
      list?.splice(at, 1);
    }
    const lessonDay = unit.lesson * DAYS + day - 1;
    if (unit.isBlock) {
      dayBlock[lessonDay] = 0;
    } else {
      dayLoose[lessonDay] = (dayLoose[lessonDay] ?? 1) - 1;
    }
    professorMinutes[unit.professorIndex] =
      (professorMinutes[unit.professorIndex] ?? 0) - (unit.minutes[p] ?? 0);
    placed[u] = -1;
  };

  /** Pone una unidad en un emplazamiento de su lista, sin comprobar nada. */
  const add = (u: number, p: number): void => {
    const unit = units[u];
    if (unit === undefined) {
      return;
    }
    const day = unit.days[p] ?? 1;
    for (let offset = 0; offset < unit.size; offset += 1) {
      classOccupancy[classSlot(u, day, (unit.firsts[p] ?? 0) + offset)] = u;
    }
    const list = professorDay[unit.professorIndex * DAYS + day - 1];
    if (list !== undefined) {
      // Ordenada por hora de inicio.
      let at = list.length;
      while (at > 0 && startOf(list[at - 1] ?? 0) > (unit.starts[p] ?? 0)) {
        at -= 1;
      }
      list.splice(at, 0, u);
    }
    const lessonDay = unit.lesson * DAYS + day - 1;
    if (unit.isBlock) {
      dayBlock[lessonDay] = 1;
    } else {
      dayLoose[lessonDay] = (dayLoose[lessonDay] ?? 0) + 1;
    }
    professorMinutes[unit.professorIndex] =
      (professorMinutes[unit.professorIndex] ?? 0) + (unit.minutes[p] ?? 0);
    placed[u] = p;
  };

  const startOf = (u: number) => units[u]?.starts[placed[u] ?? 0] ?? 0;
  const endOf = (u: number) => units[u]?.ends[placed[u] ?? 0] ?? 0;

  /** Si una unidad (ya quitada del estado) puede ir al emplazamiento `p` sin romper HC5, HC2, HC3 ni HC7. */
  const canAdd = (u: number, p: number): boolean => {
    const unit = units[u];
    if (unit === undefined) {
      return false;
    }
    const day = unit.days[p] ?? 1;
    for (let offset = 0; offset < unit.size; offset += 1) {
      if (classOccupancy[classSlot(u, day, (unit.firsts[p] ?? 0) + offset)] !== -1) {
        return false;
      }
    }
    const start = unit.starts[p] ?? 0;
    const end = unit.ends[p] ?? 0;
    for (const other of professorDay[unit.professorIndex * DAYS + day - 1] ?? []) {
      if (startOf(other) < end && start < endOf(other)) {
        return false;
      }
    }
    const lessonDay = unit.lesson * DAYS + day - 1;
    const maxPerDay = lessons[unit.lesson]?.maxPerDay ?? 1;
    const loose = dayLoose[lessonDay] ?? 0;
    const blocks = dayBlock[lessonDay] ?? 0;
    if (unit.isBlock ? loose > 0 || blocks > 0 : blocks > 0 || loose + 1 > maxPerDay) {
      return false;
    }
    return (
      (professorMinutes[unit.professorIndex] ?? 0) + (unit.minutes[p] ?? 0) <= MAX_TEACHING_MINUTES
    );
  };

  /** Las celdas de los calendarios de un profesor que caben enteras entre `from` y `to`. */
  const cellsBetween = (professorIndex: number, from: number, to: number): number => {
    const starts = cellStarts[professorIndex] ?? [];
    const ends = cellEnds[professorIndex] ?? [];
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((starts[middle] ?? 0) < from) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    let count = 0;
    for (let i = low; i < starts.length && (starts[i] ?? 0) < to; i += 1) {
      if ((ends[i] ?? 0) <= to) {
        count += 1;
      }
    }
    return count;
  };

  /** SC1: los huecos de un profesor un día (`day` desde 0). */
  const gapsOf = (professorIndex: number, day: number): number => {
    const list = professorDay[professorIndex * DAYS + day] ?? [];
    let gaps = 0;
    for (let i = 1; i < list.length; i += 1) {
      gaps += cellsBetween(professorIndex, endOf(list[i - 1] ?? 0), startOf(list[i] ?? 0));
    }
    return gaps;
  };

  /** SC3: los pares de días contiguos con alguna sesión de una lección. */
  const pairsOf = (lesson: number): number => {
    let pairs = 0;
    for (let day = 0; day < DAYS - 1; day += 1) {
      const here = (dayLoose[lesson * DAYS + day] ?? 0) + (dayBlock[lesson * DAYS + day] ?? 0);
      const next =
        (dayLoose[lesson * DAYS + day + 1] ?? 0) + (dayBlock[lesson * DAYS + day + 1] ?? 0);
      if (here > 0 && next > 0) {
        pairs += 1;
      }
    }
    return pairs;
  };

  const weighted = ({ misses, gaps, pairs }: Counts) =>
    SCORE_WEIGHTS.preferredMiss * misses +
    SCORE_WEIGHTS.professorGap * gaps +
    SCORE_WEIGHTS.consecutiveDay * pairs;

  /** La penalización de lo que tocan unas unidades (antes o después de moverlas), con los huecos de `keys`. */
  const touched = (
    movedUnits: readonly number[],
    positions: readonly number[],
    keys: readonly number[],
    touchedLessons: readonly number[],
  ): Counts => {
    let misses = 0;
    movedUnits.forEach((u, i) => {
      misses += missesAt[u]?.[positions[i] ?? 0] ?? 0;
    });
    let gaps = 0;
    for (const key of keys) {
      gaps += gapsOf(Math.floor(key / DAYS), key % DAYS);
    }
    let pairs = 0;
    for (const lesson of touchedLessons) {
      pairs += pairsOf(lesson);
    }
    return { misses, gaps, pairs };
  };

  /** Las claves únicas `profesor * 5 + día` de unos pares. */
  const uniqueKeys = (keys: readonly number[]): number[] => [...new Set(keys)];
  const keyOf = (u: number, p: number) =>
    (units[u]?.professorIndex ?? 0) * DAYS + ((units[u]?.days[p] ?? 1) - 1);

  // El estado inicial.
  units.forEach((_unit, u) => {
    add(u, placed[u] ?? 0);
  });
  let counts: Counts;
  {
    let misses = 0;
    units.forEach((_unit, u) => {
      misses += missesAt[u]?.[placed[u] ?? 0] ?? 0;
    });
    let gaps = 0;
    for (let professor = 0; professor < input.professors.length; professor += 1) {
      for (let day = 0; day < DAYS; day += 1) {
        gaps += gapsOf(professor, day);
      }
    }
    let pairs = 0;
    lessons.forEach((_lesson, lesson) => {
      pairs += pairsOf(lesson);
    });
    counts = { misses, gaps, pairs };
  }
  const initialPenalty = weighted(counts);
  // Las sesiones de las lecciones con preferidas cuentan para SC4 pase lo que pase: no cambian al mover.
  const preferredTotal = units.reduce(
    (total, unit) => total + ((lessons[unit.lesson]?.preferred.length ?? 0) > 0 ? unit.size : 0),
    0,
  );
  const scoreNow = (): ScheduleScore => ({
    total: weighted(counts),
    preferredMisses: counts.misses,
    preferredTotal,
    professorGaps: counts.gaps,
    consecutiveDays: counts.pairs,
    initialTotal: initialPenalty,
  });
  onScore?.(scoreNow());

  /** Suma a los recuentos lo que cambió un movimiento aceptado. */
  const accept = (before: Counts, after: Counts): void => {
    counts = {
      misses: counts.misses + after.misses - before.misses,
      gaps: counts.gaps + after.gaps - before.gaps,
      pairs: counts.pairs + after.pairs - before.pairs,
    };
  };

  /** Mueve una unidad al emplazamiento `q` si se puede y mejora. */
  const tryRelocate = (u: number, q: number): boolean => {
    const p = placed[u] ?? 0;
    const unit = units[u];
    if (unit === undefined) {
      return false;
    }
    const keys = uniqueKeys([keyOf(u, p), keyOf(u, q)]);
    const before = touched([u], [p], keys, [unit.lesson]);
    remove(u);
    if (!canAdd(u, q)) {
      add(u, p);
      return false;
    }
    add(u, q);
    const after = touched([u], [q], keys, [unit.lesson]);
    if (weighted(after) < weighted(before)) {
      accept(before, after);
      return true;
    }
    remove(u);
    add(u, p);
    return false;
  };

  /** Intercambia los emplazamientos de dos unidades de la misma clase y tamaño si se puede y mejora. */
  const trySwap = (u: number, v: number): boolean => {
    const first = units[u];
    const second = units[v];
    if (first === undefined || second === undefined) {
      return false;
    }
    const pu = placed[u] ?? 0;
    const pv = placed[v] ?? 0;
    // El emplazamiento de cada una debe estar en el dominio de la otra.
    const qu = first.days.findIndex(
      (day, q) => day === second.days[pv] && first.firsts[q] === second.firsts[pv],
    );
    const qv = second.days.findIndex(
      (day, q) => day === first.days[pu] && second.firsts[q] === first.firsts[pu],
    );
    if (qu < 0 || qv < 0) {
      return false;
    }
    const keys = uniqueKeys([keyOf(u, pu), keyOf(u, qu), keyOf(v, pv), keyOf(v, qv)]);
    const lessonsTouched = uniqueKeys([first.lesson, second.lesson]);
    const before = touched([u, v], [pu, pv], keys, lessonsTouched);
    remove(u);
    remove(v);
    if (canAdd(u, qu)) {
      add(u, qu);
      if (canAdd(v, qv)) {
        add(v, qv);
        const after = touched([u, v], [qu, qv], keys, lessonsTouched);
        if (weighted(after) < weighted(before)) {
          accept(before, after);
          return true;
        }
        remove(v);
      }
      remove(u);
    }
    add(u, pu);
    add(v, pv);
    return false;
  };

  const unitsOfClass = new Map<number, number[]>();
  for (const unit of units) {
    unitsOfClass.set(unit.classIndex, [...(unitsOfClass.get(unit.classIndex) ?? []), unit.index]);
  }

  const startedAt = now();
  let evaluations = 0;
  let moves = 0;
  let stoppedBy: ImproveResult['stoppedBy'] = 'CONVERGED';

  /** Consulta el reloj y la cancelación cada `checkEvery` evaluaciones. Devuelve por qué hay que parar, o `null`. */
  const check = async (): Promise<ImproveResult['stoppedBy'] | null> => {
    const due = evaluations % checkEvery === 0;
    evaluations += 1;
    if (!due) {
      return null;
    }
    if (isCancelled?.() === true) {
      return 'CANCELLED';
    }
    if (now() - startedAt >= budgetMs) {
      return 'TIME_LIMIT';
    }
    await cededToEventLoop();
    return null;
  };

  search: for (let improvedInPass = true; improvedInPass;) {
    improvedInPass = false;
    for (const unit of units) {
      const u = unit.index;
      for (let q = 0; q < unit.days.length; q += 1) {
        if (q === placed[u]) {
          continue;
        }
        const stop = await check();
        if (stop !== null) {
          stoppedBy = stop;
          break search;
        }
        if (tryRelocate(u, q)) {
          moves += 1;
          improvedInPass = true;
          onScore?.(scoreNow());
          break;
        }
      }
      for (const v of unitsOfClass.get(unit.classIndex) ?? []) {
        const other = units[v];
        if (
          v <= u ||
          other === undefined ||
          other.size !== unit.size ||
          other.lesson === unit.lesson
        ) {
          continue;
        }
        const stop = await check();
        if (stop !== null) {
          stoppedBy = stop;
          break search;
        }
        if (trySwap(u, v)) {
          moves += 1;
          improvedInPass = true;
          onScore?.(scoreNow());
        }
      }
    }
  }

  return {
    placements: units.map((unit, u) => ({
      dayOfWeek: unit.days[placed[u] ?? 0] ?? 1,
      firstSession: unit.firsts[placed[u] ?? 0] ?? 1,
    })),
    initialPenalty,
    penalty: weighted(counts),
    counts,
    moves,
    stoppedBy,
    elapsedMs: now() - startedAt,
  };
}
