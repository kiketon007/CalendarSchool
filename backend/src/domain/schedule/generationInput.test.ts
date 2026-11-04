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

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
const compareNames = (a: string, b: string) => collator.compare(a, b);

const calendars: FixtureCalendars = {
  // 3 sesiones de 60 minutos.
  Corto: {
    periods: [
      ['S', 540, 600],
      ['S', 600, 660],
      ['S', 660, 720],
    ],
  },
  // 3 sesiones de 45 minutos, un recreo y 2 sesiones: dos tramos de 3 y 2.
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
};

const inputOf = (courses: FixtureCourse[], professors: FixtureProfessor[]) =>
  generationInputOf(problemOf(calendars, courses, professors), compareNames);

describe('generationInputOf', () => {
  it('makes one lesson per class and active subject with a professor, and skips the rest', () => {
    const input = inputOf(
      [
        {
          name: '1º Primaria',
          calendar: 'Corto',
          classes: ['B', 'A'],
          subjects: [
            subject('Lengua', 5, { A: 'Ana Ruiz', B: 'Ana Ruiz' }),
            subject('Francés', 2, { A: 'Ana Ruiz', B: 'Ana Ruiz' }, { status: 'INACTIVE' }),
            subject('Inglés', 2, { A: 'Ana Ruiz' }),
          ],
        },
        {
          name: 'Sin calendario',
          calendar: null,
          classes: ['A'],
          subjects: [subject('Lengua', 5, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    expect(input.courses.map(({ name }) => name)).toEqual(['1º Primaria']);
    expect(
      input.lessons.map(({ className, subjectName }) => `${className} ${subjectName}`),
    ).toEqual(['A Inglés', 'A Lengua', 'B Lengua']);
    expect(input.professors.map(({ name }) => name)).toEqual(['Ana Ruiz']);
  });

  it('numbers the cells of a course in order, without the breaks, with the group of each one', () => {
    const input = inputOf([{ name: '1º', calendar: 'Recreo', classes: ['A'], subjects: [] }], []);

    expect(input.courses[0]?.cells).toEqual([
      { sessionNumber: 1, startMinute: 540, endMinute: 585, group: 0 },
      { sessionNumber: 2, startMinute: 585, endMinute: 630, group: 0 },
      { sessionNumber: 3, startMinute: 630, endMinute: 675, group: 0 },
      { sessionNumber: 4, startMinute: 705, endMinute: 750, group: 1 },
      { sessionNumber: 5, startMinute: 750, endMinute: 795, group: 1 },
    ]);
  });

  it('splits a lesson into blocks and loose sessions', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [
            subject('Lengua', 5, { A: 'Ana Ruiz' }, { blockSize: 2 }),
            subject('Mates', 3, { A: 'Ana Ruiz' }),
          ],
        },
      ],
      [professor('Ana Ruiz')],
    );

    const sizesOf = (name: string) =>
      input.units
        .filter(({ lessonIndex }) => input.lessons[lessonIndex]?.subjectName === name)
        .map(({ size }) => size);
    expect(sizesOf('Lengua')).toEqual([2, 2, 1]);
    expect(sizesOf('Mates')).toEqual([1, 1, 1]);
    expect(input.units.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('keeps the maximum per day, one without rule, and the size of the block in the lesson', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [
            subject('Lengua', 4, { A: 'Ana Ruiz' }, { maxPerDay: 2 }),
            subject('Mates', 3, { A: 'Ana Ruiz' }),
          ],
        },
      ],
      [professor('Ana Ruiz')],
    );

    expect(
      input.lessons.map(({ subjectName, maxPerDay, blockSize }) => [
        subjectName,
        maxPerDay,
        blockSize,
      ]),
    ).toEqual([
      ['Lengua', 2, null],
      ['Mates', 1, null],
    ]);
  });

  it('has every placement of a loose session when nothing is forbidden or unavailable', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    const placements = input.units[0]?.placements ?? [];
    expect(placements).toHaveLength(15);
    expect(placements[0]).toEqual({ dayOfWeek: 1, firstSession: 1 });
    expect(placements[14]).toEqual({ dayOfWeek: 5, firstSession: 3 });
  });

  it('leaves out of the domain the forbidden slots, the unavailable ones and the blocks that cross a break', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Recreo',
          classes: ['A'],
          subjects: [
            subject(
              'Lengua',
              2,
              { A: 'Ana Ruiz' },
              {
                blockSize: 2,
                forbidden: [
                  [1, 1],
                  [1, 2],
                  [1, 3],
                  [1, 4],
                  [1, 5],
                  [3, 9],
                ],
              },
            ),
          ],
        },
      ],
      // Ana no puede los martes de 9:00 a 9:45 (la 1.ª sesión) ni los miércoles entre las 12:30 y las 12:45.
      [
        professor('Ana Ruiz', [
          [2, 540, 585],
          [3, 750, 795],
        ]),
      ],
    );

    const block = input.units[0];
    expect(block?.size).toBe(2);
    const keys = (block?.placements ?? []).map(
      ({ dayOfWeek, firstSession }) => `${dayOfWeek}-${firstSession}`,
    );
    // Nada el lunes (todo prohibido), nada que empiece en la 3.ª (cruza el recreo), ni el martes con la 1.ª.
    expect(keys.filter((key) => key.startsWith('1-'))).toEqual([]);
    expect(keys.filter((key) => key.endsWith('-3'))).toEqual([]);
    expect(keys).not.toContain('2-1');
    expect(keys).toContain('2-2');
    expect(keys).toContain('2-4');
    // El miércoles no puede en la 5.ª: el bloque 4-5 sale, el 1-2 y el 2-3 no (3 cruza el recreo).
    expect(keys).not.toContain('3-4');
    expect(keys).toContain('3-1');
  });

  it('does not count as unavailable a session that only touches the interval', () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz' })],
        },
      ],
      // Hasta las 10:00 en punto: la 2.ª sesión empieza a las 10:00 y no se solapa.
      [professor('Ana Ruiz', [[1, 540, 600]])],
    );

    const keys = (input.units[0]?.placements ?? []).map(
      ({ dayOfWeek, firstSession }) => `${dayOfWeek}-${firstSession}`,
    );
    expect(keys).not.toContain('1-1');
    expect(keys).toContain('1-2');
  });

  it('sorts the courses, the classes and the subjects by name with the given comparison', () => {
    const input = inputOf(
      [
        {
          name: '10º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz' })],
        },
        {
          name: '2º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 1, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    expect(input.lessons.map(({ courseName }) => courseName)).toEqual(['2º', '10º']);
  });

  it('does not change what it receives', () => {
    const problem = problemOf(
      calendars,
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 2, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );
    const before = structuredClone(problem);

    generationInputOf(problem, compareNames);

    expect(problem).toEqual(before);
  });
});
