import { sessionGroupsOf } from '../calendar/sessionGroups.js';
import { SCHOOL_DAYS_PER_WEEK } from '../workload/workloadWarnings.js';
import type {
  GenerationCell,
  GenerationCourse,
  GenerationInput,
  GenerationLesson,
  GenerationProfessor,
  GenerationUnit,
  Placement,
} from './scheduleSolver.js';
import type { ProblemCourse, SchedulingProblem } from './schedulingProblem.js';
import { unavailableCellsOf } from './unavailableCells.js';

const cellKey = (dayOfWeek: number, sessionNumber: number) => `${dayOfWeek}-${sessionNumber}`;

/** Las celdas de un curso: sus sesiones numeradas en orden (los recreos no cuentan), con su tramo entre recreos. */
function cellsOf(course: ProblemCourse): GenerationCell[] {
  const calendar = course.calendar;
  if (calendar === null) {
    return [];
  }
  const groupOfSession: number[] = [];
  sessionGroupsOf(calendar.periods.map(({ kind }) => kind)).forEach((size, group) => {
    for (let i = 0; i < size; i += 1) {
      groupOfSession.push(group);
    }
  });
  return calendar.periods
    .filter(({ kind }) => kind === 'SESSION')
    .map(({ startMinute, endMinute }, index) => ({
      sessionNumber: index + 1,
      startMinute,
      endMinute,
      group: groupOfSession[index] ?? 0,
    }));
}

/**
 * Convierte la foto del problema (US-ALGO-CHECK) en la entrada del motor (US-ALGO-RUN). Pura.
 *
 * - **Lecciones:** una por clase y asignatura **activa** del curso que tenga profesor en esa clase. No entran las
 *   inactivas, las clases sin profesor ni los cursos sin calendario (la comprobación previa ya bloquea lo segundo
 *   y lo tercero y la entrada no los inventa). Salen ordenadas por curso, clase y asignatura con `compareNames`.
 * - **Unidades:** con la carga `L` y el bloque `k`, `⌊L/k⌋` bloques de `k` sesiones y `L mod k` sueltas (sin bloque,
 *   `L` sueltas), la misma regla que `subjectWarnings`.
 * - **Dominio de cada unidad:** los emplazamientos `(día, primera sesión)` cuyas celdas son seguidas, del mismo
 *   tramo, no prohibidas (las celdas guardadas que ya no existen en el calendario se ignoran) y sin solape con un
 *   tramo no disponible del profesor.
 *
 * @param compareNames Orden de los nombres (la comparación del castellano de la aplicación).
 */
export function generationInputOf(
  problem: SchedulingProblem,
  compareNames: (a: string, b: string) => number,
): GenerationInput {
  const byName = (a: { name: string }, b: { name: string }) => compareNames(a.name, b.name);
  const professorById = new Map(problem.professors.map((professor) => [professor.id, professor]));

  const courses: GenerationCourse[] = [];
  const lessons: GenerationLesson[] = [];
  const units: GenerationUnit[] = [];
  const usedProfessors = new Map<string, GenerationProfessor>();

  for (const course of [...problem.courses].sort(byName)) {
    const calendar = course.calendar;
    if (calendar === null) {
      continue;
    }
    const cells = cellsOf(course);
    courses.push({ id: course.id, name: course.name, cells });
    const sessionsPerDay = cells.length;

    for (const schoolClass of [...course.classes].sort(byName)) {
      const subjects = course.subjects
        .filter(({ status }) => status === 'ACTIVE')
        .sort((a, b) => compareNames(a.subjectName, b.subjectName));
      for (const subject of subjects) {
        const teacher = subject.teachers.find(({ classId }) => classId === schoolClass.id);
        const professor =
          teacher === undefined ? undefined : professorById.get(teacher.professorId);
        if (professor === undefined) {
          continue;
        }

        const forbidden = subject.forbiddenCells.filter(
          ({ dayOfWeek, sessionNumber }) =>
            dayOfWeek >= 1 &&
            dayOfWeek <= SCHOOL_DAYS_PER_WEEK &&
            sessionNumber >= 1 &&
            sessionNumber <= sessionsPerDay,
        );
        const blocked = new Set([
          ...forbidden.map(({ dayOfWeek, sessionNumber }) => cellKey(dayOfWeek, sessionNumber)),
          ...unavailableCellsOf(calendar.periods, professor.unavailable).map(
            ({ dayOfWeek, sessionNumber }) => cellKey(dayOfWeek, sessionNumber),
          ),
        ]);

        const lessonIndex = lessons.length;
        lessons.push({
          index: lessonIndex,
          courseId: course.id,
          courseName: course.name,
          classId: schoolClass.id,
          className: schoolClass.name,
          subjectId: subject.subjectId,
          subjectName: subject.subjectName,
          professorId: professor.id,
          professorName: `${professor.firstName} ${professor.lastName}`,
          sessions: subject.sessionsPerWeek,
          maxPerDay: subject.maxPerDay ?? 1,
          blockSize: subject.blockSize,
          forbidden: forbidden.map(({ dayOfWeek, sessionNumber }) => ({
            dayOfWeek,
            sessionNumber,
          })),
        });
        if (!usedProfessors.has(professor.id)) {
          usedProfessors.set(professor.id, {
            id: professor.id,
            name: `${professor.firstName} ${professor.lastName}`,
            unavailable: professor.unavailable,
          });
        }

        const blockSize = subject.blockSize;
        const blocks = blockSize === null ? 0 : Math.floor(subject.sessionsPerWeek / blockSize);
        const loose =
          blockSize === null ? subject.sessionsPerWeek : subject.sessionsPerWeek % blockSize;
        const sizes = [
          ...Array.from({ length: blocks }, () => blockSize ?? 1),
          ...Array.from({ length: loose }, () => 1),
        ];
        for (const size of sizes) {
          const placements: Placement[] = [];
          for (let dayOfWeek = 1; dayOfWeek <= SCHOOL_DAYS_PER_WEEK; dayOfWeek += 1) {
            for (let first = 1; first + size - 1 <= sessionsPerDay; first += 1) {
              const run = cells.slice(first - 1, first - 1 + size);
              const sameGroup = run.every(({ group }) => group === run[0]?.group);
              const free = run.every(
                ({ sessionNumber }) => !blocked.has(cellKey(dayOfWeek, sessionNumber)),
              );
              if (sameGroup && free) {
                placements.push({ dayOfWeek, firstSession: first });
              }
            }
          }
          units.push({ index: units.length, lessonIndex, size, placements });
        }
      }
    }
  }

  return { courses, professors: [...usedProfessors.values()], lessons, units };
}
