import { formatClock } from '../../domain/calendar/clock.js';
import type {
  ScheduleDraftRepository,
  StoredDraftEntry,
} from '../../domain/schedule/scheduleDraft.js';
import type { SubjectColor } from '../../domain/subject/subject.js';
import { byName, compareText } from '../courses/courseOrdering.js';

/** Un periodo de la jornada tal como lo ve la API: las horas en «HH:MM». */
export interface ScheduleDraftPeriodView {
  type: 'SESSION' | 'BREAK';
  startTime: string;
  endTime: string;
}

export interface ScheduleDraftCourseView {
  id: string;
  name: string;
  calendar: { id: string; name: string; periods: ScheduleDraftPeriodView[] } | null;
  classes: { id: string; name: string }[];
}

export interface ScheduleDraftEntryView {
  courseId: string;
  classId: string;
  subjectId: string;
  professorId: string | null;
  dayOfWeek: number;
  sessionNumber: number;
  startTime: string;
  endTime: string;
}

/** El horario borrador tal como lo devuelve la API (`ScheduleDraft` del contrato). */
export interface ScheduleDraftView {
  id: string;
  status: 'DRAFT';
  generatedAt: Date;
  placedSessions: number;
  courses: ScheduleDraftCourseView[];
  subjects: { id: string; name: string; code: string | null; color: SubjectColor }[];
  professors: { id: string; firstName: string; lastName: string }[];
  entries: ScheduleDraftEntryView[];
}

/**
 * Caso de uso: el horario borrador del colegio para verlo (US-ALGO-VIEW). Solo lee: devuelve el borrador del colegio de
 * la sesión, o `null`, con las horas en «HH:MM» y todo ordenado con la comparación del castellano (cursos, clases y
 * asignaturas por nombre, profesores por apellidos y nombre, y las entradas por clase, día y sesión). El orden es de la
 * aplicación, no de la base de datos. No modifica lo que lee del repositorio.
 */
export class GetScheduleDraft {
  constructor(
    private readonly dependencies: {
      scheduleDraftRepository: Pick<ScheduleDraftRepository, 'findDraft'>;
    },
  ) {}

  async execute({ schoolId }: { schoolId: string }): Promise<ScheduleDraftView | null> {
    const draft = await this.dependencies.scheduleDraftRepository.findDraft(schoolId);
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
    const byCell = (a: StoredDraftEntry, b: StoredDraftEntry) =>
      (classRank.get(a.classId) ?? 0) - (classRank.get(b.classId) ?? 0) ||
      a.dayOfWeek - b.dayOfWeek ||
      a.sessionNumber - b.sessionNumber;

    return {
      id: draft.id,
      status: 'DRAFT',
      generatedAt: draft.generatedAt,
      placedSessions: draft.placedSessions,
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
