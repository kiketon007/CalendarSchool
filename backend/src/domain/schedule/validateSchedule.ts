import { MAX_TEACHING_MINUTES } from '../professor/teachingLoad.js';
import type { GenerationInput, GenerationLesson, ScheduleEntry } from './scheduleSolver.js';

/** Qué regla rompe una violación: HC1 a HC8 o `CELL` (la entrada no es una celda del calendario de su curso). */
export type ViolatedRule = 'HC1' | 'HC2' | 'HC3' | 'HC4' | 'HC5' | 'HC6' | 'HC7' | 'HC8' | 'CELL';

/** Una regla rota, con las referencias que la explican. */
export interface Violation {
  readonly rule: ViolatedRule;
  /** Posición de la lección afectada en `GenerationInput.lessons`, si la hay. */
  readonly lessonIndex?: number;
  readonly classId?: string;
  readonly professorId?: string;
  readonly dayOfWeek?: number;
  readonly sessionNumber?: number;
}

const key = (...parts: (string | number)[]) => parts.join('|');

/**
 * Valida un horario contra las restricciones duras HC1 a HC8 (US-ALGO-RUN). Pura e **independiente del motor**: lo
 * recalcula todo desde las entradas y el problema, sin usar el estado de la búsqueda, así que sirve para cualquier
 * motor (OR-Tools) y como red de seguridad antes de guardar. Devuelve las violaciones, vacía si es válido.
 */
export function validateSchedule(
  input: GenerationInput,
  entries: readonly ScheduleEntry[],
): Violation[] {
  const violations: Violation[] = [];
  const lessonOf = new Map<string, GenerationLesson>();
  for (const lesson of input.lessons) {
    lessonOf.set(key(lesson.classId, lesson.subjectId), lesson);
  }
  const courseById = new Map(input.courses.map((course) => [course.id, course]));
  const professorById = new Map(input.professors.map((professor) => [professor.id, professor]));

  const byLesson = new Map<number, ScheduleEntry[]>();
  const classSlots = new Set<string>();
  const byProfessorDay = new Map<string, ScheduleEntry[]>();
  const minutesOf = new Map<string, number>();

  for (const entry of entries) {
    const where = {
      classId: entry.classId,
      dayOfWeek: entry.dayOfWeek,
      sessionNumber: entry.sessionNumber,
    };

    // La celda existe en el calendario del curso, con su hora.
    const cell = courseById
      .get(entry.courseId)
      ?.cells.find(({ sessionNumber }) => sessionNumber === entry.sessionNumber);
    if (
      cell === undefined ||
      cell.startMinute !== entry.startMinute ||
      cell.endMinute !== entry.endMinute ||
      entry.dayOfWeek < 1 ||
      entry.dayOfWeek > 5
    ) {
      violations.push({ rule: 'CELL', ...where });
    }

    // HC5: una asignatura por clase y hueco.
    const slot = key(entry.classId, entry.dayOfWeek, entry.sessionNumber);
    if (classSlots.has(slot)) {
      violations.push({ rule: 'HC5', ...where });
    }
    classSlots.add(slot);

    const lesson = lessonOf.get(key(entry.classId, entry.subjectId));
    if (lesson === undefined) {
      // Una entrada que no es de ninguna lección sobra: rompe la carga exacta.
      violations.push({ rule: 'HC1', ...where });
    } else {
      byLesson.set(lesson.index, [...(byLesson.get(lesson.index) ?? []), entry]);
      // HC6: el profesor de la asignación.
      if (entry.professorId !== lesson.professorId) {
        violations.push({ rule: 'HC6', lessonIndex: lesson.index, ...where });
      }
      // HC8: franjas prohibidas.
      if (
        lesson.forbidden.some(
          ({ dayOfWeek, sessionNumber }) =>
            dayOfWeek === entry.dayOfWeek && sessionNumber === entry.sessionNumber,
        )
      ) {
        violations.push({ rule: 'HC8', lessonIndex: lesson.index, ...where });
      }
    }

    const professorDay = key(entry.professorId, entry.dayOfWeek);
    byProfessorDay.set(professorDay, [...(byProfessorDay.get(professorDay) ?? []), entry]);
    minutesOf.set(
      entry.professorId,
      (minutesOf.get(entry.professorId) ?? 0) + (entry.endMinute - entry.startMinute),
    );

    // HC4: disponibilidad del profesor.
    const unavailable = professorById.get(entry.professorId)?.unavailable ?? [];
    if (
      unavailable.some(
        ({ dayOfWeek, startMinute, endMinute }) =>
          dayOfWeek === entry.dayOfWeek &&
          startMinute < entry.endMinute &&
          entry.startMinute < endMinute,
      )
    ) {
      violations.push({ rule: 'HC4', professorId: entry.professorId, ...where });
    }
  }

  // HC1 y HC3, lección a lección.
  for (const lesson of input.lessons) {
    const ofLesson = byLesson.get(lesson.index) ?? [];
    if (ofLesson.length !== lesson.sessions) {
      violations.push({ rule: 'HC1', lessonIndex: lesson.index, classId: lesson.classId });
    }
    if (!dailyRuleHolds(input, lesson, ofLesson)) {
      violations.push({ rule: 'HC3', lessonIndex: lesson.index, classId: lesson.classId });
    }
  }

  // HC2: un profesor, un sitio, por intervalos de hora y aunque los calendarios sean distintos.
  for (const [professorDay, ofDay] of byProfessorDay) {
    const sorted = [...ofDay].sort((a, b) => a.startMinute - b.startMinute);
    const overlap = sorted.some(
      (entry, index) => index > 0 && (sorted[index - 1]?.endMinute ?? 0) > entry.startMinute,
    );
    if (overlap) {
      const [professorId = '', day = '0'] = professorDay.split('|');
      violations.push({ rule: 'HC2', professorId, dayOfWeek: Number(day) });
    }
  }

  // HC7: máximo de 23 horas lectivas.
  for (const [professorId, minutes] of minutesOf) {
    if (minutes > MAX_TEACHING_MINUTES) {
      violations.push({ rule: 'HC7', professorId });
    }
  }

  return violations;
}

/**
 * HC3 de una lección: cada día tiene un bloque de `k` sesiones seguidas del mismo tramo y nada más, o como mucho
 * `maxPerDay` sueltas, y hay exactamente `⌊L/k⌋` días con bloque. Si un día de `k` seguidas podría ser un bloque o
 * `k` sueltas (con `k <= maxPerDay`), vale la lectura que cuadra con el número de bloques.
 */
function dailyRuleHolds(
  input: GenerationInput,
  lesson: GenerationLesson,
  entries: readonly ScheduleEntry[],
): boolean {
  const cells = input.courses.find(({ id }) => id === lesson.courseId)?.cells ?? [];
  const groupOf = (sessionNumber: number) =>
    cells.find((cell) => cell.sessionNumber === sessionNumber)?.group;
  const perDay = new Map<number, number[]>();
  for (const { dayOfWeek, sessionNumber } of entries) {
    perDay.set(
      dayOfWeek,
      [...(perDay.get(dayOfWeek) ?? []), sessionNumber].sort((a, b) => a - b),
    );
  }

  const blockSize = lesson.blockSize;
  const isBlock = (sessions: readonly number[]) =>
    blockSize !== null &&
    sessions.length === blockSize &&
    sessions.every(
      (session, index) =>
        index === 0 ||
        (session === (sessions[index - 1] ?? 0) + 1 &&
          groupOf(session) === groupOf(sessions[index - 1] ?? 0)),
    );

  let forced = 0;
  let candidates = 0;
  for (const sessions of perDay.values()) {
    const candidate = isBlock(sessions);
    if (candidate) {
      candidates += 1;
    }
    if (sessions.length > lesson.maxPerDay) {
      if (!candidate) {
        return false;
      }
      forced += 1;
    }
  }
  const blocks = blockSize === null ? 0 : Math.floor(lesson.sessions / blockSize);
  return forced <= blocks && blocks <= candidates;
}
