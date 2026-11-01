import type { ProfessorSubject } from '../../domain/assignment/courseAssignments.js';
import type { ProfessorsSummaryRepository } from '../../domain/professor/professorsSummaryRepository.js';
import {
  MAX_TEACHING_MINUTES,
  teachingLoadOf,
  type TeachingLoad,
  type TeachingRef,
} from '../../domain/professor/teachingLoad.js';
import { byName, compareText } from '../courses/courseOrdering.js';
import { bySubjectCourseClass } from './sortProfessorSubjects.js';

/** La carga lectiva de un profesor con lo que imparte y los cursos en los que da clase. */
export interface ProfessorLoad extends TeachingLoad {
  /** UUIDv7. */
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Una entrada por asignatura y clase, en el orden del listado de profesores. */
  readonly subjects: readonly ProfessorSubject[];
  /** Los cursos en los que da clase, por nombre. */
  readonly courses: readonly TeachingRef[];
}

/** Un curso con asignaturas que siguen sin profesor en alguna de sus clases. */
export interface UnassignedCourse {
  readonly courseId: string;
  readonly courseName: string;
  /** Las celdas (asignatura, clase) del curso sin profesor; siempre al menos una. */
  readonly missingCount: number;
}

/** El resumen de carga de los profesores de un colegio. */
export interface ProfessorsSummary {
  readonly maxTeachingMinutes: number;
  readonly professors: readonly ProfessorLoad[];
  readonly unassigned: readonly UnassignedCourse[];
}

/**
 * Caso de uso: el resumen de carga lectiva de los profesores del colegio y de las asignaturas sin profesor
 * (US-PROF-SUMMARY). Es una lectura: no registra eventos y no cambia nada. Calcula en cada petición, con
 * `teachingLoadOf`, el rango de minutos, el estado y los avisos de cada profesor (también de los que no tienen
 * asignaciones) y las celdas sin profesor de cada curso. El colegio lo toma el router de la identidad de la petición
 * y nunca de lo que envía el cliente; un fallo de la base de datos llega tal cual al manejador de errores.
 */
export class GetProfessorsSummary {
  constructor(
    private readonly dependencies: {
      professorsSummaryRepository: Pick<ProfessorsSummaryRepository, 'read'>;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<ProfessorsSummary> {
    const { professors, courses } =
      await this.dependencies.professorsSummaryRepository.read(schoolId);
    const calendarOf = new Map(courses.map(({ id, calendar }) => [id, calendar]));

    const loads = professors
      .map((professor): ProfessorLoad => {
        const subjects = [...professor.subjects].sort(bySubjectCourseClass);
        const load = teachingLoadOf(
          subjects.map(({ courseId, courseName, sessionsPerWeek }) => ({
            courseId,
            courseName,
            calendar: calendarOf.get(courseId) ?? null,
            sessionsPerWeek,
          })),
          professor.unavailable,
          compareText,
        );
        const taught = new Map(
          subjects.map(({ courseId, courseName }) => [
            courseId,
            { id: courseId, name: courseName },
          ]),
        );
        return {
          id: professor.id,
          firstName: professor.firstName,
          lastName: professor.lastName,
          subjects,
          courses: [...taught.values()].sort(byName),
          ...load,
        };
      })
      .sort((a, b) => compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName));

    const unassigned = courses
      .map(({ id, name, classCount, subjects }) => ({
        courseId: id,
        courseName: name,
        missingCount: subjects.reduce(
          (missing, { assignmentCount }) => missing + Math.max(0, classCount - assignmentCount),
          0,
        ),
      }))
      .filter(({ missingCount }) => missingCount > 0)
      .sort((a, b) => compareText(a.courseName, b.courseName));

    return { maxTeachingMinutes: MAX_TEACHING_MINUTES, professors: loads, unassigned };
  }
}
