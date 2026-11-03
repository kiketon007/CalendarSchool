import { describe, expect, it } from 'vitest';
import {
  problemOf,
  professor,
  subject,
  type FixtureCalendars,
  type FixtureCourse,
  type FixtureProfessor,
} from '../../../test/support/scheduleProblemFixtures.js';
import { generationInputOf } from './generationInput.js';
import type { GenerationInput, ScheduleEntry } from './scheduleSolver.js';
import { validateSchedule } from './validateSchedule.js';

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string) => collator.compare(a, b);

const calendars: FixtureCalendars = {
  Corto: {
    periods: [
      ['S', 540, 600],
      ['S', 600, 660],
      ['S', 660, 720],
    ],
  },
  // 45 minutos desde las 9:30: se solapa en hora con la 2.ª sesión de «Corto».
  Medio: {
    periods: [
      ['S', 570, 615],
      ['S', 615, 660],
      ['S', 660, 705],
    ],
  },
  // Tres sesiones, un recreo y dos: la 3.ª y la 4.ª están separadas por el recreo.
  Recreo: {
    periods: [
      ['S', 540, 585],
      ['S', 585, 630],
      ['S', 630, 675],
      ['B', 675, 705],
      ['S', 705, 750],
      ['S', 750, 795],
    ],
  },
  // Una sesión de 23 horas y media a la semana no cabe en un calendario: se usan 5 sesiones largas.
  Larga: { periods: [['S', 480, 760]] },
};

const inputOf = (courses: FixtureCourse[], professors: FixtureProfessor[]): GenerationInput =>
  generationInputOf(problemOf(calendars, courses, professors), compareNames);

/** Una entrada de la lección `subject` de la clase A del curso, en `day` y `session`. */
function entry(
  input: GenerationInput,
  courseName: string,
  subjectName: string,
  day: number,
  session: number,
  overrides: Partial<ScheduleEntry> = {},
): ScheduleEntry {
  const lesson = input.lessons.find(
    (candidate) => candidate.courseName === courseName && candidate.subjectName === subjectName,
  );
  const cell = input.courses
    .find(({ id }) => id === lesson?.courseId)
    ?.cells.find(({ sessionNumber }) => sessionNumber === session);
  if (lesson === undefined || cell === undefined) {
    throw new Error(`no existe ${courseName} ${subjectName} ${String(session)}`);
  }
  return {
    courseId: lesson.courseId,
    classId: lesson.classId,
    subjectId: lesson.subjectId,
    professorId: lesson.professorId,
    dayOfWeek: day,
    sessionNumber: session,
    startMinute: cell.startMinute,
    endMinute: cell.endMinute,
    ...overrides,
  };
}

const rulesOf = (input: GenerationInput, entries: readonly ScheduleEntry[]) =>
  validateSchedule(input, entries).map(({ rule }) => rule);

describe('validateSchedule', () => {
  describe('with a small school', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [
            subject('Lengua', 2, { A: 'Ana Ruiz' }),
            subject('Mates', 1, { A: 'Ben Pons' }),
          ],
        },
      ],
      [professor('Ana Ruiz'), professor('Ben Pons')],
    );
    const valid = [
      entry(input, '1º', 'Lengua', 1, 1),
      entry(input, '1º', 'Lengua', 2, 1),
      entry(input, '1º', 'Mates', 1, 2),
    ];

    it('accepts a valid schedule, an empty slot is not a violation', () => {
      expect(validateSchedule(input, valid)).toEqual([]);
    });

    it('reports HC1 when a session is missing', () => {
      expect(rulesOf(input, valid.slice(1))).toEqual(['HC1']);
    });

    it('reports HC1 when a session is left over', () => {
      expect(rulesOf(input, [...valid, entry(input, '1º', 'Mates', 2, 2)])).toEqual(['HC1']);
    });

    it('reports HC1 for an entry of a subject that is not in the class', () => {
      const alien = { ...entry(input, '1º', 'Mates', 2, 2), subjectId: 'subject-Inglés' };

      expect(rulesOf(input, [...valid, alien])).toEqual(['HC1']);
    });

    it('reports HC3 when the loose sessions of a subject share a day without rule', () => {
      const sameDay = [valid[0], entry(input, '1º', 'Lengua', 1, 3), valid[2]] as ScheduleEntry[];

      expect(rulesOf(input, sameDay)).toEqual(['HC3']);
    });

    it('reports HC5 when two subjects take the same slot of a class', () => {
      const clash = [valid[0], valid[1], entry(input, '1º', 'Mates', 1, 1)] as ScheduleEntry[];

      expect(rulesOf(input, clash)).toEqual(['HC5']);
    });

    it('reports HC6 when the entry has another professor', () => {
      const other = [
        valid[0],
        valid[1],
        { ...valid[2], professorId: 'professor-Ana Ruiz' },
      ] as ScheduleEntry[];

      expect(rulesOf(input, other)).toEqual(['HC6']);
    });

    it('reports CELL when the slot is not in the calendar of the course', () => {
      const outside = [valid[0], valid[1], { ...valid[2], sessionNumber: 7 }] as ScheduleEntry[];

      expect(rulesOf(input, outside)).toEqual(['CELL']);
    });
  });

  it('reports HC2 for a professor in two courses with different calendars at overlapping hours', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz' })],
        },
        {
          name: '2º',
          calendar: 'Medio',
          classes: ['A'],
          subjects: [subject('Mates', 1, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    // 1º sesión 2 es de 10:00 a 11:00 y 2º sesión 1 de 9:30 a 10:15: se solapan aunque los números difieran.
    expect(
      rulesOf(input, [entry(input, '1º', 'Lengua', 1, 2), entry(input, '2º', 'Mates', 1, 1)]),
    ).toEqual(['HC2']);
    // 1º sesión 1 (9:00-10:00) y 2º sesión 2 (10:15-11:00) no se solapan.
    expect(
      rulesOf(input, [entry(input, '1º', 'Lengua', 1, 1), entry(input, '2º', 'Mates', 1, 2)]),
    ).toEqual([]);
  });

  it('does not report HC2 when two sessions only touch', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A', 'B'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz', B: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );
    const lengua = (className: string, session: number) => {
      const lesson = input.lessons.find((candidate) => candidate.className === className);
      const cell = input.courses[0]?.cells[session - 1];
      return {
        courseId: lesson?.courseId ?? '',
        classId: lesson?.classId ?? '',
        subjectId: lesson?.subjectId ?? '',
        professorId: lesson?.professorId ?? '',
        dayOfWeek: 1,
        sessionNumber: session,
        startMinute: cell?.startMinute ?? 0,
        endMinute: cell?.endMinute ?? 0,
      };
    };

    expect(validateSchedule(input, [lengua('A', 1), lengua('B', 2)])).toEqual([]);
    expect(rulesOf(input, [lengua('A', 1), lengua('B', 1)])).toEqual(['HC2']);
  });

  it('reports HC3 for a block that crosses the break and accepts it inside a group', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Recreo',
          classes: ['A'],
          subjects: [subject('Arte', 2, { A: 'Ana Ruiz' }, { blockSize: 2 })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    expect(
      rulesOf(input, [entry(input, '1º', 'Arte', 1, 3), entry(input, '1º', 'Arte', 1, 4)]),
    ).toEqual(['HC3']);
    expect(
      rulesOf(input, [entry(input, '1º', 'Arte', 1, 4), entry(input, '1º', 'Arte', 1, 5)]),
    ).toEqual([]);
    // Dos sueltas en días distintos no son un bloque.
    expect(
      rulesOf(input, [entry(input, '1º', 'Arte', 1, 1), entry(input, '1º', 'Arte', 2, 1)]),
    ).toEqual(['HC3']);
  });

  it('accepts loose sessions up to the maximum per day and rejects one more', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 3, { A: 'Ana Ruiz' }, { maxPerDay: 2 })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    expect(
      rulesOf(input, [
        entry(input, '1º', 'Lengua', 1, 1),
        entry(input, '1º', 'Lengua', 1, 2),
        entry(input, '1º', 'Lengua', 2, 1),
      ]),
    ).toEqual([]);
    expect(
      rulesOf(input, [
        entry(input, '1º', 'Lengua', 1, 1),
        entry(input, '1º', 'Lengua', 1, 2),
        entry(input, '1º', 'Lengua', 1, 3),
      ]),
    ).toEqual(['HC3']);
  });

  it('reports HC4 when a session overlaps an unavailable interval of the professor', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz', [[1, 570, 630]])],
    );

    expect(rulesOf(input, [entry(input, '1º', 'Lengua', 1, 1)])).toEqual(['HC4']);
    expect(rulesOf(input, [entry(input, '1º', 'Lengua', 2, 1)])).toEqual([]);
  });

  it('reports HC7 when a professor passes 23 hours', () => {
    // Cinco sesiones de 280 minutos: 1400 > 1380.
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Larga',
          classes: ['A'],
          subjects: [subject('Lengua', 5, { A: 'Ana Ruiz' }, { maxPerDay: null })],
        },
      ],
      [professor('Ana Ruiz')],
    );
    const week = [1, 2, 3, 4, 5].map((day) => entry(input, '1º', 'Lengua', day, 1));

    expect(rulesOf(input, week)).toEqual(['HC7']);
    expect(rulesOf(input, week.slice(0, 4))).toEqual(['HC1']);
  });

  it('reports HC8 for a session in a forbidden slot', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz' }, { forbidden: [[5, 3]] })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    expect(rulesOf(input, [entry(input, '1º', 'Lengua', 5, 3)])).toEqual(['HC8']);
    expect(rulesOf(input, [entry(input, '1º', 'Lengua', 5, 2)])).toEqual([]);
  });
});
