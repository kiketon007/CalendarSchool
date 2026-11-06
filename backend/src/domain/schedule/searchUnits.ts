import type { GenerationInput, Placement, ScheduleEntry } from './scheduleSolver.js';

/** Una unidad lista para buscar: sus emplazamientos en arrays planos. */
export interface SearchUnit {
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

/** Las unidades de la entrada en arrays planos, con sus gemelas y los minutos de cada emplazamiento. */
export function searchUnitsOf(input: GenerationInput): SearchUnit[] {
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

/**
 * Las entradas del horario a partir de un emplazamiento por unidad (en el orden de `input.units`), una por sesión y
 * ordenadas por lección, día y sesión. Una unidad sin emplazamiento no genera entradas.
 */
export function entriesOfPlacements(
  input: GenerationInput,
  placements: readonly (Placement | undefined)[],
): ScheduleEntry[] {
  const courseById = new Map(input.courses.map((course) => [course.id, course]));
  const entries: { lesson: number; entry: ScheduleEntry }[] = [];
  for (const unit of input.units) {
    const lesson = input.lessons[unit.lessonIndex];
    const placement = placements[unit.index];
    if (lesson === undefined || placement === undefined) {
      continue;
    }
    const cells = courseById.get(lesson.courseId)?.cells ?? [];
    for (let offset = 0; offset < unit.size; offset += 1) {
      const sessionNumber = placement.firstSession + offset;
      const cell = cells[sessionNumber - 1];
      entries.push({
        lesson: unit.lessonIndex,
        entry: {
          courseId: lesson.courseId,
          classId: lesson.classId,
          subjectId: lesson.subjectId,
          professorId: lesson.professorId,
          dayOfWeek: placement.dayOfWeek,
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
