import type {
  ScheduleDraft,
  ScheduleDraftCourse,
  ScheduleDraftEntry,
  ScheduleDraftProfessor,
  ScheduleDraftSubject,
} from '../services/scheduleDraftService';

/** Los cinco días de la semana lectiva, de lunes (1) a viernes (5). */
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;

/** Una fila de la tabla: una sesión (con su número) o un recreo (sin celdas). */
export type DraftRow =
  | { kind: 'SESSION'; sessionNumber: number; startTime: string; endTime: string }
  | { kind: 'BREAK'; startTime: string; endTime: string };

/** Lo que va en una celda: la asignatura, el profesor, la clase y su curso. */
export interface DraftCell {
  subject: ScheduleDraftSubject;
  professor: ScheduleDraftProfessor | null;
  className: string;
  courseName: string;
}

/** Una sesión guardada, con los nombres ya resueltos y las horas con las que se generó. */
export interface ListedEntry extends DraftCell {
  dayOfWeek: number;
  sessionNumber: number;
  startTime: string;
  endTime: string;
}

export interface DraftColumn {
  id: string;
  label: string;
}

/**
 * Una tabla del horario. Las filas son los periodos del calendario **actual**; las celdas se buscan por
 * `<columna>:<sesión>`; `outside` son las entradas cuya sesión ya no existe en el calendario.
 */
export interface DraftTable {
  calendar: { id: string; name: string } | null;
  rows: DraftRow[];
  columns: DraftColumn[];
  cells: Map<string, DraftCell>;
  outside: ListedEntry[];
}

/** El borrador con sus listas indexadas por id para resolver cada entrada. */
export interface DraftIndex {
  draft: ScheduleDraft;
  courses: Map<string, ScheduleDraftCourse>;
  classes: Map<string, { id: string; name: string; course: ScheduleDraftCourse }>;
  subjects: Map<string, ScheduleDraftSubject>;
  professors: Map<string, ScheduleDraftProfessor>;
}

export function indexDraft(draft: ScheduleDraft): DraftIndex {
  const classes = new Map<string, { id: string; name: string; course: ScheduleDraftCourse }>();
  for (const course of draft.courses) {
    for (const schoolClass of course.classes) {
      classes.set(schoolClass.id, { ...schoolClass, course });
    }
  }
  return {
    draft,
    courses: new Map(draft.courses.map((course) => [course.id, course])),
    classes,
    subjects: new Map(draft.subjects.map((subject) => [subject.id, subject])),
    professors: new Map(draft.professors.map((professor) => [professor.id, professor])),
  };
}

/** Las filas de un calendario: las sesiones numeradas en su orden y los recreos entre ellas. */
export function rowsOf(
  periods: readonly { type: string; startTime: string; endTime: string }[],
): DraftRow[] {
  let sessionNumber = 0;
  return periods.map(({ type, startTime, endTime }) => {
    if (type === 'BREAK') {
      return { kind: 'BREAK', startTime, endTime };
    }
    sessionNumber += 1;
    return { kind: 'SESSION', sessionNumber, startTime, endTime };
  });
}

/** Una entrada con los nombres resueltos. Las referencias ya se comprobaron al leer la respuesta. */
function listed(index: DraftIndex, entry: ScheduleDraftEntry): ListedEntry | null {
  const schoolClass = index.classes.get(entry.classId);
  const subject = index.subjects.get(entry.subjectId);
  if (schoolClass === undefined || subject === undefined) {
    return null;
  }
  return {
    subject,
    professor:
      entry.professorId === null ? null : (index.professors.get(entry.professorId) ?? null),
    className: schoolClass.name,
    courseName: schoolClass.course.name,
    dayOfWeek: entry.dayOfWeek,
    sessionNumber: entry.sessionNumber,
    startTime: entry.startTime,
    endTime: entry.endTime,
  };
}

const byDayAndSession = (a: ListedEntry, b: ListedEntry) =>
  a.dayOfWeek - b.dayOfWeek || a.sessionNumber - b.sessionNumber;

function cellOf({ subject, professor, className, courseName }: ListedEntry): DraftCell {
  return { subject, professor, className, courseName };
}

/** Una tabla vacía de un calendario, con las columnas dadas. */
function emptyTable(
  calendar: NonNullable<ScheduleDraftCourse['calendar']>,
  columns: DraftColumn[],
): DraftTable {
  return {
    calendar: { id: calendar.id, name: calendar.name },
    rows: rowsOf(calendar.periods),
    columns,
    cells: new Map(),
    outside: [],
  };
}

const sessionCount = (calendar: NonNullable<ScheduleDraftCourse['calendar']>) =>
  calendar.periods.filter(({ type }) => type === 'SESSION').length;

const DAY_COLUMNS: DraftColumn[] = WEEKDAYS.map((day) => ({ id: String(day), label: String(day) }));

/** La vista de una clase: su tabla, o sus sesiones por día si su curso ya no tiene calendario. */
export type ClassView = {
  schoolClass: { id: string; name: string };
  course: { id: string; name: string };
} & ({ kind: 'table'; table: DraftTable } | { kind: 'withoutCalendar'; entries: ListedEntry[] });

export function classView(index: DraftIndex, classId: string): ClassView {
  const found = index.classes.get(classId);
  if (found === undefined) {
    throw new Error(`La clase ${classId} no está en el borrador`);
  }
  const { course, ...schoolClass } = found;
  const base = {
    schoolClass: { id: schoolClass.id, name: schoolClass.name },
    course: { id: course.id, name: course.name },
  };
  const entries = index.draft.entries
    .filter((entry) => entry.classId === classId)
    .map((entry) => listed(index, entry))
    .filter((entry): entry is ListedEntry => entry !== null)
    .sort(byDayAndSession);

  if (course.calendar === null) {
    return { ...base, kind: 'withoutCalendar', entries };
  }
  const table = emptyTable(course.calendar, DAY_COLUMNS);
  const sessions = sessionCount(course.calendar);
  for (const entry of entries) {
    if (entry.sessionNumber > sessions) {
      table.outside.push(entry);
    } else {
      table.cells.set(`${String(entry.dayOfWeek)}:${String(entry.sessionNumber)}`, cellOf(entry));
    }
  }
  return { ...base, kind: 'table', table };
}

/** Las sesiones a la semana de una clase. */
export function sessionsOfClass(index: DraftIndex, classId: string): number {
  return index.draft.entries.filter((entry) => entry.classId === classId).length;
}

/** La vista de un profesor: una tabla por calendario y, aparte, sus sesiones en cursos sin calendario. */
export interface ProfessorView {
  tables: DraftTable[];
  withoutCalendar: ListedEntry[];
}

export function professorView(index: DraftIndex, professorId: string): ProfessorView {
  const tables = new Map<string, DraftTable>();
  const sessionsByTable = new Map<string, number>();
  const withoutCalendar: ListedEntry[] = [];
  const entries = index.draft.entries
    .filter((entry) => entry.professorId === professorId)
    .map((entry) => ({ entry, view: listed(index, entry) }))
    .filter((pair): pair is { entry: ScheduleDraftEntry; view: ListedEntry } => pair.view !== null)
    .sort((a, b) => byDayAndSession(a.view, b.view));

  for (const { entry, view } of entries) {
    const calendar = index.courses.get(entry.courseId)?.calendar ?? null;
    if (calendar === null) {
      withoutCalendar.push(view);
      continue;
    }
    let table = tables.get(calendar.id);
    if (table === undefined) {
      table = emptyTable(calendar, DAY_COLUMNS);
      tables.set(calendar.id, table);
      sessionsByTable.set(calendar.id, sessionCount(calendar));
    }
    if (entry.sessionNumber > (sessionsByTable.get(calendar.id) ?? 0)) {
      table.outside.push(view);
    } else {
      table.cells.set(`${String(entry.dayOfWeek)}:${String(entry.sessionNumber)}`, cellOf(view));
    }
  }
  return { tables: [...tables.values()], withoutCalendar };
}

/** Las sesiones a la semana de un profesor. */
export function sessionsOfProfessor(index: DraftIndex, professorId: string): number {
  return index.draft.entries.filter((entry) => entry.professorId === professorId).length;
}

/** La vista de un día de todo el colegio: una tabla por calendario con las clases en las columnas. */
export interface SchoolDayView {
  tables: DraftTable[];
  /** Los cursos que ya no tienen calendario. */
  withoutCalendar: string[];
}

export function schoolDayView(index: DraftIndex, day: number): SchoolDayView {
  const tables = new Map<string, DraftTable>();
  const withoutCalendar: string[] = [];
  for (const course of index.draft.courses) {
    const { calendar } = course;
    if (calendar === null) {
      withoutCalendar.push(course.name);
      continue;
    }
    const table = tables.get(calendar.id) ?? emptyTable(calendar, []);
    tables.set(calendar.id, table);
    for (const schoolClass of course.classes) {
      table.columns.push({ id: schoolClass.id, label: `${course.name} ${schoolClass.name}` });
    }
  }
  for (const entry of index.draft.entries) {
    if (entry.dayOfWeek !== day) {
      continue;
    }
    const calendar = index.courses.get(entry.courseId)?.calendar ?? null;
    const table = calendar === null ? undefined : tables.get(calendar.id);
    const view = listed(index, entry);
    if (calendar === null || table === undefined || view === null) {
      continue;
    }
    if (entry.sessionNumber > sessionCount(calendar)) {
      table.outside.push(view);
    } else {
      table.cells.set(`${entry.classId}:${String(entry.sessionNumber)}`, cellOf(view));
    }
  }
  return { tables: [...tables.values()], withoutCalendar };
}
