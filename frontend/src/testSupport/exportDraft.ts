import type { ScheduleDetail, ScheduleDraftEntry } from '../services/scheduleDraftService';
import { indexDraft } from '../utils/scheduleDraftViews';

/**
 * El borrador de prueba de la exportación (US-ALGO-VIEW_b): dos calendarios (uno con recreo), una clase con una sesión
 * fuera del calendario actual, una profesora (Ana) con clase en los dos calendarios y en un curso sin calendario,
 * entradas sin profesor y un curso sin calendario.
 */
const SHORT = {
  id: 'calendar-short',
  name: 'Primaria',
  periods: [
    { type: 'SESSION' as const, startTime: '09:00', endTime: '09:45' },
    { type: 'SESSION' as const, startTime: '09:45', endTime: '10:30' },
    { type: 'BREAK' as const, startTime: '10:30', endTime: '11:00' },
    { type: 'SESSION' as const, startTime: '11:00', endTime: '11:45' },
  ],
};
const LONG = {
  id: 'calendar-long',
  name: 'Tercer ciclo',
  periods: [
    { type: 'SESSION' as const, startTime: '09:00', endTime: '10:00' },
    { type: 'SESSION' as const, startTime: '10:00', endTime: '11:00' },
  ],
};

export function exportEntry(overrides: Partial<ScheduleDraftEntry> = {}): ScheduleDraftEntry {
  return {
    courseId: 'course-1',
    classId: 'class-1a',
    subjectId: 'english',
    professorId: 'ana',
    dayOfWeek: 1,
    sessionNumber: 1,
    startTime: '09:00',
    endTime: '09:45',
    ...overrides,
  };
}

/** Las 23:30 locales del 4 de noviembre: la fecha de los nombres de fichero es la local, no la UTC. */
export const GENERATED_AT = new Date(2026, 10, 4, 23, 30).toISOString();

export const exportDraft: ScheduleDetail = {
  id: 'schedule-1',
  status: 'DRAFT',
  generatedAt: GENERATED_AT,
  placedSessions: 7,
  confirmedAt: null,
  confirmedBy: null,
  replacedAt: null,
  score: null,
  courses: [
    {
      id: 'course-1',
      name: '1º Primaria',
      calendar: SHORT,
      classes: [
        { id: 'class-1a', name: 'A' },
        { id: 'class-1b', name: 'B' },
      ],
    },
    {
      id: 'course-5',
      name: '5º Primaria',
      calendar: LONG,
      classes: [{ id: 'class-5a', name: 'A' }],
    },
    { id: 'course-7', name: '7º', calendar: null, classes: [{ id: 'class-7a', name: 'A' }] },
  ],
  subjects: [
    { id: 'english', name: 'Inglés', code: 'ING', color: 'blue' },
    { id: 'maths', name: 'Matemáticas', code: null, color: 'red' },
  ],
  professors: [
    { id: 'ana', firstName: 'Ana', lastName: 'García' },
    { id: 'luis', firstName: 'Luis', lastName: 'Pérez' },
  ],
  entries: [
    exportEntry(),
    exportEntry({ dayOfWeek: 2, sessionNumber: 2, startTime: '09:45', endTime: '10:30' }),
    exportEntry({
      classId: 'class-1b',
      subjectId: 'maths',
      professorId: 'luis',
      sessionNumber: 3,
      startTime: '11:00',
      endTime: '11:45',
    }),
    exportEntry({
      courseId: 'course-5',
      classId: 'class-5a',
      dayOfWeek: 1,
      sessionNumber: 2,
      startTime: '10:00',
      endTime: '11:00',
    }),
    exportEntry({
      courseId: 'course-7',
      classId: 'class-7a',
      subjectId: 'maths',
      professorId: null,
      dayOfWeek: 3,
      sessionNumber: 4,
      startTime: '12:00',
      endTime: '12:45',
    }),
    exportEntry({
      courseId: 'course-7',
      classId: 'class-7a',
      dayOfWeek: 4,
      sessionNumber: 1,
      startTime: '09:00',
      endTime: '09:45',
    }),
    exportEntry({
      subjectId: 'maths',
      professorId: null,
      dayOfWeek: 5,
      sessionNumber: 9,
      startTime: '15:00',
      endTime: '15:45',
    }),
  ],
};

export const exportIndex = indexDraft(exportDraft);
