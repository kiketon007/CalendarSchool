import type { SchedulingProblem } from '../../src/domain/schedule/schedulingProblem.js';

/** Las 11 asignaturas de un curso de Primaria y sus sesiones a la semana: 30 en total. */
const SUBJECTS: readonly (readonly [string, number])[] = [
  ['Conocimiento del Medio', 2],
  ['Conocimiento del Medio en inglés', 1],
  ['Educación Física', 3],
  ['Plástica', 1],
  ['Inglés', 3],
  ['Lengua', 5],
  ['Matemáticas', 5],
  ['Música', 2],
  ['Religión', 2],
  ['Tutoría', 1],
  ['Valenciano', 5],
];

/** Seis sesiones de 45 minutos con un recreo tras la tercera: 30 franjas a la semana. */
const PERIODS = [
  { kind: 'SESSION', startMinute: 540, endMinute: 585 },
  { kind: 'SESSION', startMinute: 585, endMinute: 630 },
  { kind: 'SESSION', startMinute: 630, endMinute: 675 },
  { kind: 'BREAK', startMinute: 675, endMinute: 705 },
  { kind: 'SESSION', startMinute: 705, endMinute: 750 },
  { kind: 'SESSION', startMinute: 750, endMinute: 795 },
  { kind: 'SESSION', startMinute: 795, endMinute: 840 },
] as const;

/** Quién da cada asignatura en la clase `index`: el tutor, salvo los especialistas, compartidos entre clases. */
function professorOf(subject: string, index: number): string {
  switch (subject) {
    case 'Inglés':
    case 'Conocimiento del Medio en inglés':
      return `ingles-${String(index % 2)}`;
    case 'Educación Física':
      return `educacion-fisica-${String(index % 2)}`;
    case 'Música':
      return 'musica';
    case 'Religión':
      return 'religion';
    default:
      return `tutor-${String(index)}`;
  }
}

/**
 * Un colegio real y **sin ningún hueco libre**: 6 cursos de 2 clases, cada una con 30 sesiones para 30 franjas, un tutor
 * por clase y seis especialistas compartidos entre las 12 clases (dos de inglés, dos de educación física, música y
 * religión). Es el caso que el backtracking sin reinicios no resolvía (colocaba 28 de 360 sesiones en 30 s).
 */
export function tightSchoolProblem(): SchedulingProblem {
  const professorIds = new Set<string>();
  const courses = Array.from({ length: 6 }, (_, courseIndex) => {
    const classes = [0, 1].map((classIndex) => ({
      id: `class-${String(courseIndex * 2 + classIndex)}`,
      name: String.fromCharCode(65 + classIndex),
    }));
    return {
      id: `course-${String(courseIndex)}`,
      name: `${String(courseIndex + 1)}º Primaria`,
      calendar: { id: 'calendar', name: 'Primaria', periods: PERIODS },
      classes,
      subjects: SUBJECTS.map(([subjectName, sessionsPerWeek]) => ({
        subjectId: `${subjectName}-${String(courseIndex)}`,
        subjectName,
        status: 'ACTIVE' as const,
        sessionsPerWeek,
        maxPerDay: null,
        blockSize: null,
        forbiddenCells: [],
        preferredCells: [],
        teachers: classes.map((schoolClass, classIndex) => {
          const professorId = professorOf(subjectName, courseIndex * 2 + classIndex);
          professorIds.add(professorId);
          return { classId: schoolClass.id, professorId };
        }),
      })),
    };
  });
  return {
    courses,
    professors: [...professorIds].map((id) => ({
      id,
      firstName: id,
      lastName: 'Apellido',
      unavailable: [],
    })),
  };
}
