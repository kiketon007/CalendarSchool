import { describe, expect, it } from 'vitest';
import { defaultLoadCalendar, lengthsByCourse, sessionLengthsOf } from './professorLoadDetail';

const session = (startTime: string, endTime: string) => ({
  type: 'SESSION' as const,
  startTime,
  endTime,
});
const breakAt = (startTime: string, endTime: string) => ({
  type: 'BREAK' as const,
  startTime,
  endTime,
});

describe('sessionLengthsOf', () => {
  it('gives the shortest and the longest session, in minutes', () => {
    expect(
      sessionLengthsOf([
        session('09:00', '10:00'),
        session('10:00', '10:45'),
        breakAt('10:45', '11:30'),
        session('11:30', '12:30'),
      ]),
    ).toEqual({ shortest: 45, longest: 60 });
  });

  it('gives the same value twice when every session lasts the same', () => {
    expect(sessionLengthsOf([session('09:00', '09:45'), session('10:00', '10:45')])).toEqual({
      shortest: 45,
      longest: 45,
    });
  });

  it('does not count the breaks, however long they are', () => {
    expect(sessionLengthsOf([session('09:00', '09:45'), breakAt('09:45', '11:15')])).toEqual({
      shortest: 45,
      longest: 45,
    });
  });

  it('is null without sessions', () => {
    expect(sessionLengthsOf([breakAt('09:00', '09:30')])).toBeNull();
    expect(sessionLengthsOf([])).toBeNull();
  });

  it('leaves out a session whose hours are not valid', () => {
    expect(sessionLengthsOf([session('xx', '10:00'), session('10:00', '10:50')])).toEqual({
      shortest: 50,
      longest: 50,
    });
  });
});

describe('lengthsByCourse', () => {
  const calendars = [
    {
      id: 'cal-1',
      name: 'Primaria',
      periods: [session('09:00', '10:00'), session('10:00', '10:45')],
      courses: [
        { id: 'c-1', name: '1º Primaria' },
        { id: 'c-2', name: '2º Primaria' },
      ],
    },
    {
      id: 'cal-2',
      name: 'Infantil',
      periods: [session('09:00', '09:30')],
      courses: [{ id: 'c-3', name: '3 años' }],
    },
  ];

  it('gives each course the name of its calendar and the lengths of its sessions', () => {
    const byCourse = lengthsByCourse(calendars);

    expect(byCourse.get('c-1')).toEqual({
      calendarName: 'Primaria',
      lengths: { shortest: 45, longest: 60 },
    });
    expect(byCourse.get('c-2')).toEqual(byCourse.get('c-1'));
    expect(byCourse.get('c-3')).toEqual({
      calendarName: 'Infantil',
      lengths: { shortest: 30, longest: 30 },
    });
  });

  it('has nothing for a course without a calendar', () => {
    expect(lengthsByCourse(calendars).get('c-9')).toBeUndefined();
  });

  it('is empty without calendars', () => {
    expect(lengthsByCourse([]).size).toBe(0);
  });
});

describe('defaultLoadCalendar', () => {
  const entry = (name: string, sessions: number) => ({
    calendar: { id: `cal-${name}`, name },
    sessions,
    available: 25,
    minMinutes: 0,
    maxMinutes: 0,
  });

  it('is the calendar with the most load', () => {
    expect(
      defaultLoadCalendar([entry('Primaria', 5), entry('Mixto', 12), entry('Largo', 3)])?.calendar
        .name,
    ).toBe('Mixto');
  });

  it('breaks a tie with the first one by name, in the Spanish way', () => {
    expect(
      defaultLoadCalendar([entry('Ñandú', 5), entry('Álamo', 5), entry('Zeta', 5)])?.calendar.name,
    ).toBe('Álamo');
  });

  it('does not change the list it receives', () => {
    const entries = [entry('B', 1), entry('A', 9)];

    defaultLoadCalendar(entries);

    expect(entries.map(({ calendar }) => calendar.name)).toEqual(['B', 'A']);
  });

  it('is undefined without entries', () => {
    expect(defaultLoadCalendar([])).toBeUndefined();
  });
});
