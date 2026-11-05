import { describe, expect, it } from 'vitest';
import type { ScheduleDetail, ScheduleDraftEntry } from '../services/scheduleDraftService';
import {
  classView,
  draftGaps,
  indexDraft,
  professorView,
  schoolDayView,
  sessionsOfClass,
  sessionsOfProfessor,
} from './scheduleDraftViews';

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

function entry(overrides: Partial<ScheduleDraftEntry> = {}): ScheduleDraftEntry {
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

const draft: ScheduleDetail = {
  id: 'schedule-1',
  status: 'DRAFT',
  generatedAt: '2026-11-04T08:00:05.000Z',
  placedSessions: 6,
  confirmedAt: null,
  confirmedBy: null,
  replacedAt: null,
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
    entry(),
    entry({ dayOfWeek: 2, sessionNumber: 2, startTime: '09:45', endTime: '10:30' }),
    entry({
      classId: 'class-1b',
      subjectId: 'maths',
      professorId: 'luis',
      sessionNumber: 3,
      startTime: '11:00',
      endTime: '11:45',
    }),
    entry({
      courseId: 'course-5',
      classId: 'class-5a',
      dayOfWeek: 1,
      sessionNumber: 2,
      startTime: '10:00',
      endTime: '11:00',
    }),
    entry({
      courseId: 'course-7',
      classId: 'class-7a',
      subjectId: 'maths',
      professorId: null,
      dayOfWeek: 3,
      sessionNumber: 4,
      startTime: '12:00',
      endTime: '12:45',
    }),
    entry({
      classId: 'class-1a',
      subjectId: 'maths',
      professorId: null,
      dayOfWeek: 5,
      sessionNumber: 9,
      startTime: '15:00',
      endTime: '15:45',
    }),
  ],
};
const index = indexDraft(draft);

describe('classView', () => {
  it('builds the rows of the calendar with the sessions numbered and the break between them', () => {
    const view = classView(index, 'class-1a');

    expect(view.kind).toBe('table');
    if (view.kind !== 'table') {
      return;
    }
    expect(view.table.calendar).toEqual({ id: 'calendar-short', name: 'Primaria' });
    expect(view.table.rows).toEqual([
      { kind: 'SESSION', sessionNumber: 1, startTime: '09:00', endTime: '09:45' },
      { kind: 'SESSION', sessionNumber: 2, startTime: '09:45', endTime: '10:30' },
      { kind: 'BREAK', startTime: '10:30', endTime: '11:00' },
      { kind: 'SESSION', sessionNumber: 3, startTime: '11:00', endTime: '11:45' },
    ]);
  });

  it('puts the days in the columns and each entry in its day and session', () => {
    const view = classView(index, 'class-1a');
    if (view.kind !== 'table') {
      throw new Error('se esperaba una tabla');
    }

    expect(view.table.columns.map(({ id }) => id)).toEqual(['1', '2', '3', '4', '5']);
    expect(view.table.cells.get('1:1')).toMatchObject({
      subject: { id: 'english' },
      professor: { id: 'ana' },
      className: 'A',
      courseName: '1º Primaria',
    });
    expect(view.table.cells.get('2:2')?.subject.name).toBe('Inglés');
    expect(view.table.cells.get('3:1')).toBeUndefined();
  });

  it('does not put the entries of other classes in the table', () => {
    const view = classView(index, 'class-1a');
    if (view.kind !== 'table') {
      throw new Error('se esperaba una tabla');
    }

    expect(view.table.cells.get('1:3')).toBeUndefined();
  });

  it('lists the entries whose session does not exist in the current calendar apart', () => {
    const view = classView(index, 'class-1a');
    if (view.kind !== 'table') {
      throw new Error('se esperaba una tabla');
    }

    expect(view.table.outside).toEqual([
      expect.objectContaining({
        dayOfWeek: 5,
        sessionNumber: 9,
        startTime: '15:00',
        endTime: '15:45',
        subject: expect.objectContaining({ id: 'maths' }) as unknown,
        professor: null,
      }),
    ]);
  });

  it('lists the sessions by day when the course lost its calendar', () => {
    const view = classView(index, 'class-7a');

    expect(view.kind).toBe('withoutCalendar');
    if (view.kind !== 'withoutCalendar') {
      return;
    }
    expect(view.entries.map(({ dayOfWeek, startTime }) => [dayOfWeek, startTime])).toEqual([
      [3, '12:00'],
    ]);
  });

  it('knows the course and the class of the view', () => {
    const view = classView(index, 'class-1b');

    expect(view.schoolClass).toEqual({ id: 'class-1b', name: 'B' });
    expect(view.course).toEqual({ id: 'course-1', name: '1º Primaria' });
  });

  it('counts the sessions of a class per week', () => {
    expect(sessionsOfClass(index, 'class-1a')).toBe(3);
    expect(sessionsOfClass(index, 'class-1b')).toBe(1);
    expect(sessionsOfClass(index, 'class-nope')).toBe(0);
  });
});

describe('professorView', () => {
  it('builds one table with all the sessions of a professor who uses one calendar', () => {
    const view = professorView(index, 'ana');

    expect(view.tables).toHaveLength(2);
    const short = view.tables.find(({ calendar }) => calendar?.id === 'calendar-short');
    expect(short?.cells.get('1:1')).toMatchObject({ subject: { id: 'english' }, className: 'A' });
    expect(short?.cells.get('2:2')).toMatchObject({ subject: { id: 'english' } });
  });

  it('builds one table per calendar when the professor teaches in courses with different calendars', () => {
    const view = professorView(index, 'ana');

    expect(view.tables.map(({ calendar }) => calendar?.name)).toEqual(['Primaria', 'Tercer ciclo']);
    const long = view.tables[1];
    expect(long?.rows).toEqual([
      { kind: 'SESSION', sessionNumber: 1, startTime: '09:00', endTime: '10:00' },
      { kind: 'SESSION', sessionNumber: 2, startTime: '10:00', endTime: '11:00' },
    ]);
    expect(long?.cells.get('1:2')).toMatchObject({
      subject: { id: 'english' },
      className: 'A',
      courseName: '5º Primaria',
    });
  });

  it('shows the course and the class on every cell of a professor', () => {
    const view = professorView(index, 'luis');

    expect(view.tables).toHaveLength(1);
    expect(view.tables[0]?.cells.get('1:3')).toMatchObject({
      className: 'B',
      courseName: '1º Primaria',
      subject: { id: 'maths' },
    });
  });

  it('does not include entries without professor in any professor view', () => {
    const view = professorView(index, 'luis');

    expect(view.withoutCalendar).toEqual([]);
    expect(view.tables.flatMap(({ outside }) => outside)).toEqual([]);
  });

  it('lists apart the sessions in a course without calendar', () => {
    const lost = indexDraft({
      ...draft,
      entries: [
        ...draft.entries,
        entry({
          courseId: 'course-7',
          classId: 'class-7a',
          professorId: 'luis',
          dayOfWeek: 4,
          sessionNumber: 1,
          startTime: '09:00',
          endTime: '09:45',
        }),
      ],
    });

    const view = professorView(lost, 'luis');

    expect(view.withoutCalendar.map(({ dayOfWeek }) => dayOfWeek)).toEqual([4]);
  });

  it('counts the sessions of a professor per week', () => {
    expect(sessionsOfProfessor(index, 'ana')).toBe(3);
    expect(sessionsOfProfessor(index, 'luis')).toBe(1);
    expect(sessionsOfProfessor(index, 'nobody')).toBe(0);
  });
});

describe('schoolDayView', () => {
  it('builds one table per calendar with the classes of its courses in the columns', () => {
    const view = schoolDayView(index, 1);

    expect(view.tables.map(({ calendar }) => calendar?.name)).toEqual(['Primaria', 'Tercer ciclo']);
    expect(view.tables[0]?.columns).toEqual([
      { id: 'class-1a', label: '1º Primaria A' },
      { id: 'class-1b', label: '1º Primaria B' },
    ]);
    expect(view.tables[1]?.columns).toEqual([{ id: 'class-5a', label: '5º Primaria A' }]);
  });

  it('puts in each cell the subject and the professor of that class on that day', () => {
    const view = schoolDayView(index, 1);

    expect(view.tables[0]?.cells.get('class-1a:1')).toMatchObject({
      subject: { id: 'english' },
      professor: { id: 'ana' },
    });
    expect(view.tables[0]?.cells.get('class-1a:2')).toBeUndefined();
    expect(view.tables[1]?.cells.get('class-5a:2')).toMatchObject({ subject: { id: 'english' } });
  });

  it('shows another day of the week', () => {
    const view = schoolDayView(index, 2);

    expect(view.tables[0]?.cells.get('class-1a:2')).toMatchObject({ subject: { id: 'english' } });
    expect(view.tables[0]?.cells.get('class-1a:1')).toBeUndefined();
  });

  it('lists apart the courses that no longer have a calendar', () => {
    expect(schoolDayView(index, 1).withoutCalendar).toEqual(['7º']);
  });

  it('lists apart the entries of that day outside the calendar', () => {
    expect(schoolDayView(index, 5).tables[0]?.outside).toHaveLength(1);
    expect(schoolDayView(index, 1).tables[0]?.outside).toEqual([]);
  });
});

describe('draftGaps', () => {
  it('counts the sessions without professor, outside the current calendar and the courses without calendar', () => {
    expect(draftGaps(index)).toEqual({
      withoutProfessor: 2,
      outsideCalendar: 1,
      coursesWithoutCalendar: 1,
    });
  });

  it('is all zeros for a schedule that still matches the data', () => {
    const clean = indexDraft({
      ...draft,
      courses: draft.courses.filter(({ calendar }) => calendar !== null),
      entries: draft.entries.filter(
        ({ professorId, sessionNumber, courseId }) =>
          professorId !== null && sessionNumber <= 3 && courseId !== 'course-7',
      ),
    });

    expect(draftGaps(clean)).toEqual({
      withoutProfessor: 0,
      outsideCalendar: 0,
      coursesWithoutCalendar: 0,
    });
  });

  it('does not count as outside the sessions of a course without calendar, which are listed apart', () => {
    const onlyWithoutCalendar = indexDraft({
      ...draft,
      entries: draft.entries.filter(({ courseId }) => courseId === 'course-7'),
    });

    expect(draftGaps(onlyWithoutCalendar)).toMatchObject({
      outsideCalendar: 0,
      coursesWithoutCalendar: 1,
    });
  });

  it('counts a session that is both without professor and outside the calendar in both', () => {
    const both = indexDraft({
      ...draft,
      entries: draft.entries.filter(({ sessionNumber }) => sessionNumber === 9),
    });

    expect(draftGaps(both)).toMatchObject({ withoutProfessor: 1, outsideCalendar: 1 });
  });
});
