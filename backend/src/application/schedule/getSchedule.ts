import { formatClock } from '../../domain/calendar/clock.js';
import type {
  ScheduleReadRepository,
  ScheduleSelector,
  StoredScheduleEntry,
} from '../../domain/schedule/scheduleRead.js';
import type { ScheduleScore } from '../../domain/schedule/scheduleScore.js';
import type { SubjectColor } from '../../domain/subject/subject.js';
import { byName, compareText } from '../courses/courseOrdering.js';

/** Un periodo de la jornada tal como lo ve la API: las horas en «HH:MM». */
export interface SchedulePeriodView {
  type: 'SESSION' | 'BREAK';
  startTime: string;
  endTime: string;
}

export interface ScheduleCourseView {
  id: string;
  name: string;
  calendar: { id: string; name: string; periods: SchedulePeriodView[] } | null;
  classes: { id: string; name: string }[];
}

export interface ScheduleEntryView {
  courseId: string;
  classId: string;
  subjectId: string;
  professorId: string | null;
  dayOfWeek: number;
  sessionNumber: number;
  startTime: string;
  endTime: string;
}

/** Un horario tal como lo devuelve la API (`ScheduleDetail` del contrato). */
export interface ScheduleDetailView {
  id: string;
  status: 'DRAFT' | 'OFFICIAL';
  generatedAt: Date;
  placedSessions: number;
  confirmedAt: Date | null;
  confirmedBy: { firstName: string; lastName: string } | null;
  replacedAt: Date | null;
  /** La puntuación al generarlo; `null` en un horario anterior a US-ALGO-RUN_b. */
  score: ScheduleScore | null;
  courses: ScheduleCourseView[];
  subjects: { id: string; name: string; code: string | null; color: SubjectColor }[];
  professors: { id: string; firstName: string; lastName: string }[];
  entries: ScheduleEntryView[];
}

/**
 * Caso de uso: un horario del colegio para verlo (US-ALGO-VIEW y US-ALGO-CONFIRM). Solo lee: devuelve el borrador o el
 * oficial vigente del colegio de la sesión, según `which`, o `null`, con las horas en «HH:MM» y todo ordenado con la comparación del castellano (cursos, clases y
 * asignaturas por nombre, profesores por apellidos y nombre, y las entradas por clase, día y sesión). El orden es de la
 * aplicación, no de la base de datos. No modifica lo que lee del repositorio.
 */
export class GetSchedule {
  constructor(
    private readonly dependencies: {
      scheduleReadRepository: Pick<ScheduleReadRepository, 'find'>;
    },
  ) {}

  async execute({
    schoolId,
    which,
  }: {
    schoolId: string;
    which: ScheduleSelector;
  }): Promise<ScheduleDetailView | null> {
    const draft = await this.dependencies.scheduleReadRepository.find(schoolId, which);
    if (draft === null) {
      return null;
    }

    const courses = [...draft.courses].sort(byName).map(({ id, name, calendar, classes }) => ({
      id,
      name,
      calendar:
        calendar === null
          ? null
          : {
              id: calendar.id,
              name: calendar.name,
              periods: calendar.periods.map(({ kind, startMinute, endMinute }) => ({
                type: kind,
                startTime: formatClock(startMinute),
                endTime: formatClock(endMinute),
              })),
            },
      classes: [...classes].sort(byName),
    }));

    // La posición de cada clase en el orden de los cursos y las clases ordena las entradas.
    const classRank = new Map<string, number>();
    for (const { classes } of courses) {
      for (const { id } of classes) {
        classRank.set(id, classRank.size);
      }
    }
    const byCell = (a: StoredScheduleEntry, b: StoredScheduleEntry) =>
      (classRank.get(a.classId) ?? 0) - (classRank.get(b.classId) ?? 0) ||
      a.dayOfWeek - b.dayOfWeek ||
      a.sessionNumber - b.sessionNumber;

    return {
      id: draft.id,
      status: draft.status,
      generatedAt: draft.generatedAt,
      placedSessions: draft.placedSessions,
      confirmedAt: draft.confirmedAt,
      confirmedBy: draft.confirmedBy,
      replacedAt: draft.replacedAt,
      score: draft.score,
      courses,
      subjects: [...draft.subjects].sort(byName),
      professors: [...draft.professors].sort(
        (a, b) => compareText(a.lastName, b.lastName) || compareText(a.firstName, b.firstName),
      ),
      entries: [...draft.entries].sort(byCell).map(({ startMinute, endMinute, ...entry }) => ({
        ...entry,
        startTime: formatClock(startMinute),
        endTime: formatClock(endMinute),
      })),
    };
  }
}
