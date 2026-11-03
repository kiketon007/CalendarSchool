import type { SchedulingProblem } from '../../src/domain/schedule/schedulingProblem.js';

/** Generador pseudoaleatorio con semilla (mulberry32): el mismo número da siempre la misma secuencia. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomProblemShape {
  /** Número de cursos. */
  courses: number;
  /** Clases por curso. */
  classes: number;
  /** Asignaturas por curso. */
  subjects: number;
  /** Profesores del colegio. */
  professors: number;
  /** Probabilidad de que una asignatura tenga prohibida alguna celda o una regla de reparto. */
  rules: number;
  /** Fracción de las franjas de un curso que ocupa su carga (dos tercios por defecto). */
  fill?: number;
}

/** Los dos calendarios del colegio de pruebas: 5 sesiones de 45 minutos con un recreo, y 6 de 50. */
const CALENDARS = [
  [
    ['SESSION', 540, 585],
    ['SESSION', 585, 630],
    ['SESSION', 630, 675],
    ['BREAK', 675, 705],
    ['SESSION', 705, 750],
    ['SESSION', 750, 795],
  ],
  [
    ['SESSION', 540, 590],
    ['SESSION', 590, 640],
    ['SESSION', 640, 690],
    ['BREAK', 690, 720],
    ['SESSION', 720, 770],
    ['SESSION', 770, 820],
    ['SESSION', 820, 870],
  ],
] as const;

/**
 * Un colegio generado al azar con una semilla fija, con carga moderada (alrededor de dos tercios de las franjas) para
 * que casi siempre tenga solución, pero con profesores compartidos entre cursos y calendarios, bloques, máximos al día,
 * franjas prohibidas y disponibilidad. Sirve para las pruebas de propiedades del motor.
 */
export function randomSchedulingProblem(
  seed: number,
  shape: RandomProblemShape,
): SchedulingProblem {
  const random = seededRandom(seed);
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

  const professors = Array.from({ length: shape.professors }, (_, index) => ({
    id: `professor-${String(index)}`,
    firstName: `Profe${String(index)}`,
    lastName: 'Apellido',
    unavailable:
      random() < 0.3
        ? [{ dayOfWeek: int(1, 5), startMinute: 540, endMinute: 540 + int(1, 4) * 45 }]
        : [],
  }));

  let nextProfessor = int(0, shape.professors - 1);
  return {
    professors,
    courses: Array.from({ length: shape.courses }, (_, courseIndex) => {
      const periods = CALENDARS[courseIndex % CALENDARS.length] ?? CALENDARS[0];
      const sessionsPerDay = periods.filter(([kind]) => kind === 'SESSION').length;
      const classes = Array.from({ length: shape.classes }, (_, classIndex) => ({
        id: `class-${String(courseIndex)}-${String(classIndex)}`,
        name: `Clase ${String(classIndex)}`,
      }));
      const target = Math.floor(sessionsPerDay * 5 * (shape.fill ?? 2 / 3));
      const perSubject = Math.max(1, Math.floor(target / shape.subjects));
      return {
        id: `course-${String(courseIndex)}`,
        name: `Curso ${String(courseIndex)}`,
        calendar: {
          id: `calendar-${String(courseIndex % CALENDARS.length)}`,
          name: `Calendario ${String(courseIndex % CALENDARS.length)}`,
          periods: periods.map(([kind, startMinute, endMinute]) => ({
            kind,
            startMinute,
            endMinute,
          })),
        },
        classes,
        subjects: Array.from({ length: shape.subjects }, (_, subjectIndex) => {
          const sessionsPerWeek = Math.min(5, perSubject + (subjectIndex % 2));
          const withRule = random() < shape.rules;
          const blockSize = withRule && sessionsPerWeek >= 2 && random() < 0.5 ? 2 : null;
          return {
            subjectId: `subject-${String(courseIndex)}-${String(subjectIndex)}`,
            subjectName: `Asignatura ${String(subjectIndex)}`,
            status: 'ACTIVE' as const,
            sessionsPerWeek,
            maxPerDay: withRule && blockSize === null && random() < 0.5 ? 2 : null,
            blockSize,
            forbiddenCells: withRule
              ? [{ dayOfWeek: int(1, 5), sessionNumber: int(1, sessionsPerDay) }]
              : [],
            preferredCells: [],
            teachers: classes.map(({ id }) => {
              nextProfessor = (nextProfessor + 1) % shape.professors;
              return { classId: id, professorId: `professor-${String(nextProfessor)}` };
            }),
          };
        }),
      };
    }),
  };
}
