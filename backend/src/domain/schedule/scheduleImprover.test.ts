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
import { improveSchedule, type ImproveOptions } from './scheduleImprover.js';
import { scoreSchedule } from './scheduleScore.js';
import type { GenerationInput, Placement } from './scheduleSolver.js';
import { entriesOfPlacements } from './searchUnits.js';
import { validateSchedule } from './validateSchedule.js';

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
  // 45 minutos desde las 9:30: se solapa en hora con la 1.ª sesión de «Corto».
  Medio: {
    periods: [
      ['S', 570, 615],
      ['S', 615, 660],
      ['S', 660, 705],
    ],
  },
  // Una sesión larga de 345 minutos y una corta de 45.
  Mixto: {
    periods: [
      ['S', 480, 825],
      ['S', 825, 870],
    ],
  },
};

const inputOf = (courses: FixtureCourse[], professors: FixtureProfessor[]): GenerationInput =>
  generationInputOf(problemOf(calendars, courses, professors), compareNames);

/** Dónde empieza una unidad: `[curso, clase, asignatura, día, primera sesión, tamaño (1 por defecto)]`. */
type Start = [string, string, string, number, number, number?];

/** Los emplazamientos iniciales: cada empezar se asigna a la primera unidad libre de su lección y tamaño. */
function placementsOf(input: GenerationInput, starts: Start[]): Placement[] {
  const result: (Placement | undefined)[] = input.units.map(() => undefined);
  for (const [course, schoolClass, subjectName, dayOfWeek, firstSession, size = 1] of starts) {
    const unit = input.units.find(
      ({ index, lessonIndex, size: unitSize }) =>
        result[index] === undefined &&
        unitSize === size &&
        input.lessons[lessonIndex]?.courseName === course &&
        input.lessons[lessonIndex]?.className === schoolClass &&
        input.lessons[lessonIndex]?.subjectName === subjectName,
    );
    if (unit === undefined) {
      throw new Error(`no hay una unidad libre para ${course} ${subjectName}`);
    }
    result[unit.index] = { dayOfWeek, firstSession };
  }
  return result.map((placement) => {
    if (placement === undefined) {
      throw new Error('falta un emplazamiento inicial');
    }
    return placement;
  });
}

/** Un reloj que avanza una unidad en cada consulta. */
const countingClock = () => {
  let ticks = 0;
  return () => {
    ticks += 1;
    return ticks;
  };
};

/**
 * Mejora y comprueba lo que debe cumplirse siempre: el resultado es válido, la penalización que lleva la búsqueda
 * es la de `scoreSchedule` (oráculo) y no empeora la de partida.
 */
async function improve(
  input: GenerationInput,
  starts: Start[],
  options: Partial<ImproveOptions> = {},
) {
  const initial = placementsOf(input, starts);
  const result = await improveSchedule(input, initial, {
    budgetMs: 60_000,
    now: countingClock(),
    ...options,
  });
  const entries = entriesOfPlacements(input, result.placements);
  expect(validateSchedule(input, entries)).toEqual([]);
  const score = scoreSchedule(input, entries);
  expect(result.penalty).toBe(score.total);
  expect(result.counts).toEqual({
    misses: score.preferredMisses,
    gaps: score.professorGaps,
    pairs: score.consecutiveDays,
  });
  expect(result.initialPenalty).toBe(
    scoreSchedule(input, entriesOfPlacements(input, initial)).total,
  );
  expect(result.penalty).toBeLessThanOrEqual(result.initialPenalty);
  return { result, entries, score };
}

describe('improveSchedule', () => {
  it('moves the sessions to their preferred cells (SC4)', async () => {
    // Lengua prefiere la última sesión del lunes y del miércoles; la fase 1 la deja en la 1.ª de lunes y martes.
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [
            subject(
              'Lengua',
              2,
              { A: 'Ana Ruiz' },
              {
                preferred: [
                  [1, 3],
                  [3, 3],
                ],
              },
            ),
          ],
        },
      ],
      [professor('Ana Ruiz')],
    );

    const { result, score } = await improve(input, [
      ['1º', 'A', 'Lengua', 1, 1],
      ['1º', 'A', 'Lengua', 2, 1],
    ]);

    expect(result.initialPenalty).toBe(21);
    expect(score).toMatchObject({ total: 0, preferredMisses: 0, preferredTotal: 2 });
    expect(result.stoppedBy).toBe('CONVERGED');
    expect(result.moves).toBeGreaterThanOrEqual(2);
    expect([...result.placements].sort((a, b) => a.dayOfWeek - b.dayOfWeek)).toEqual([
      { dayOfWeek: 1, firstSession: 3 },
      { dayOfWeek: 3, firstSession: 3 },
    ]);
  });

  it('removes a gap of a professor by swapping inside a class without free cells (SC1)', async () => {
    // La clase tiene 15 celdas y 15 sesiones: Arte (2, especialista) y Tutoría (13, tutor). Arte está el lunes en la
    // 1.ª y la 3.ª, con la 2.ª (de Tutoría) en medio: solo un intercambio las junta.
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [
            subject('Arte', 2, { A: 'Ana Ruiz' }, { maxPerDay: 2 }),
            subject('Tutoría', 13, { A: 'Ben Pons' }, { maxPerDay: 3 }),
          ],
        },
      ],
      [professor('Ana Ruiz'), professor('Ben Pons')],
    );
    const tutoring: Start[] = [
      ['1º', 'A', 'Tutoría', 1, 2],
      ...[2, 3, 4, 5].flatMap((day): Start[] => [
        ['1º', 'A', 'Tutoría', day, 1],
        ['1º', 'A', 'Tutoría', day, 2],
        ['1º', 'A', 'Tutoría', day, 3],
      ]),
    ];

    const { result, entries, score } = await improve(input, [
      ['1º', 'A', 'Arte', 1, 1],
      ['1º', 'A', 'Arte', 1, 3],
      ...tutoring,
    ]);

    expect(result.initialPenalty).toBe(7);
    expect(score.professorGaps).toBe(0);
    expect(score.total).toBe(4);
    expect(entries).toHaveLength(15);
    expect(result.moves).toBeGreaterThan(0);
  });

  it('separates the consecutive days of a lesson (SC3)', async () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 3, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    const { result, score } = await improve(input, [
      ['1º', 'A', 'Lengua', 1, 1],
      ['1º', 'A', 'Lengua', 2, 1],
      ['1º', 'A', 'Lengua', 3, 1],
    ]);

    expect(result.initialPenalty).toBe(2);
    expect(score.consecutiveDays).toBe(0);
    expect(result.placements.map(({ dayOfWeek }) => dayOfWeek).sort()).toEqual([1, 3, 5]);
  });

  it('converges without moves when nothing improves', async () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 3, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );

    const { result } = await improve(input, [
      ['1º', 'A', 'Lengua', 1, 1],
      ['1º', 'A', 'Lengua', 3, 1],
      ['1º', 'A', 'Lengua', 5, 1],
    ]);

    expect(result).toMatchObject({ stoppedBy: 'CONVERGED', moves: 0, penalty: 0 });
  });

  it('reports the penalty it starts with and every time it drops, never up', async () => {
    const input = inputOf(
      [
        {
          name: '1º',
          calendar: 'Corto',
          classes: ['A'],
          subjects: [subject('Lengua', 3, { A: 'Ana Ruiz' })],
        },
      ],
      [professor('Ana Ruiz')],
    );
    const scores: number[] = [];

    const { result } = await improve(
      input,
      [
        ['1º', 'A', 'Lengua', 1, 1],
        ['1º', 'A', 'Lengua', 2, 1],
        ['1º', 'A', 'Lengua', 3, 1],
      ],
      { onScore: (score) => scores.push(score.total) },
    );

    expect(scores[0]).toBe(result.initialPenalty);
    expect(scores.at(-1)).toBe(result.penalty);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores).toHaveLength(result.moves + 1);
  });

  describe('stopping', () => {
    const lengua = () =>
      inputOf(
        [
          {
            name: '1º',
            calendar: 'Corto',
            classes: ['A'],
            subjects: [subject('Lengua', 3, { A: 'Ana Ruiz' })],
          },
        ],
        [professor('Ana Ruiz')],
      );
    const consecutive: Start[] = [
      ['1º', 'A', 'Lengua', 1, 1],
      ['1º', 'A', 'Lengua', 2, 1],
      ['1º', 'A', 'Lengua', 3, 1],
    ];

    it('stops with TIME_LIMIT when the budget is spent, keeping what it had', async () => {
      const { result } = await improve(lengua(), consecutive, { budgetMs: 3, checkEvery: 1 });

      expect(result.stoppedBy).toBe('TIME_LIMIT');
    });

    it('stops at once with TIME_LIMIT and no moves when there is no budget', async () => {
      const { result } = await improve(lengua(), consecutive, { budgetMs: 0 });

      expect(result).toMatchObject({ stoppedBy: 'TIME_LIMIT', moves: 0 });
      expect(result.penalty).toBe(result.initialPenalty);
    });

    it('stops with CANCELLED when the signal turns on, keeping what it had', async () => {
      let calls = 0;
      const { result } = await improve(lengua(), consecutive, {
        checkEvery: 1,
        isCancelled: () => {
          calls += 1;
          return calls > 2;
        },
      });

      expect(result.stoppedBy).toBe('CANCELLED');
    });

    it('stops with CANCELLED at once when it is already cancelled', async () => {
      const { result } = await improve(lengua(), consecutive, { isCancelled: () => true });

      expect(result).toMatchObject({ stoppedBy: 'CANCELLED', moves: 0 });
    });
  });

  describe('hard constraints', () => {
    it('does not use preferred cells where the professor cannot teach (HC4 wins)', async () => {
      // Ana no puede el lunes: sus preferidas del lunes ni siquiera están en el dominio de la unidad.
      const input = inputOf(
        [
          {
            name: '1º',
            calendar: 'Corto',
            classes: ['A'],
            subjects: [
              subject(
                'Lengua',
                1,
                { A: 'Ana Ruiz' },
                {
                  preferred: [
                    [1, 1],
                    [1, 2],
                  ],
                },
              ),
            ],
          },
        ],
        [professor('Ana Ruiz', [[1, 540, 720]])],
      );

      const { entries, score } = await improve(input, [['1º', 'A', 'Lengua', 2, 1]]);

      expect(entries.every(({ dayOfWeek }) => dayOfWeek !== 1)).toBe(true);
      expect(score.preferredMisses).toBe(score.preferredTotal);
      expect(score.preferredTotal).toBe(1);
    });

    it('does not put a professor in two places with different calendars (HC2)', async () => {
      // Mates prefiere el lunes a las 9:30 (1.ª sesión de «Medio»), que se solapa con Lengua en «Corto» (9:00-10:00).
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
            subjects: [subject('Mates', 1, { A: 'Ana Ruiz' }, { preferred: [[1, 1]] })],
          },
        ],
        [professor('Ana Ruiz')],
      );

      const { score } = await improve(input, [
        ['1º', 'A', 'Lengua', 1, 1],
        ['2º', 'A', 'Mates', 2, 1],
      ]);

      expect(score.preferredMisses).toBe(1);
    });

    it('keeps the maximum per day of a lesson (HC3)', async () => {
      // Dos sesiones sueltas, sin regla (máximo 1 al día), y las dos celdas preferidas son del lunes.
      const input = inputOf(
        [
          {
            name: '1º',
            calendar: 'Corto',
            classes: ['A'],
            subjects: [
              subject(
                'Lengua',
                2,
                { A: 'Ana Ruiz' },
                {
                  preferred: [
                    [1, 1],
                    [1, 2],
                  ],
                },
              ),
            ],
          },
        ],
        [professor('Ana Ruiz')],
      );

      const { score } = await improve(input, [
        ['1º', 'A', 'Lengua', 2, 1],
        ['1º', 'A', 'Lengua', 3, 1],
      ]);

      expect(score.preferredMisses).toBe(1);
    });

    it('keeps a block alone in its day (HC3)', async () => {
      // Un bloque de 2 y una suelta; todo el lunes es preferido: el bloque va al lunes y la suelta no puede.
      const input = inputOf(
        [
          {
            name: '1º',
            calendar: 'Corto',
            classes: ['A'],
            subjects: [
              subject(
                'Lengua',
                3,
                { A: 'Ana Ruiz' },
                {
                  blockSize: 2,
                  preferred: [
                    [1, 1],
                    [1, 2],
                    [1, 3],
                  ],
                },
              ),
            ],
          },
        ],
        [professor('Ana Ruiz')],
      );

      const { score } = await improve(input, [
        ['1º', 'A', 'Lengua', 3, 1, 2],
        ['1º', 'A', 'Lengua', 5, 1],
      ]);

      expect(score.preferredMisses).toBe(1);
    });

    describe('the limit of 23 hours (HC7)', () => {
      // «Mixto»: 345 minutos y 45 minutos al día. Ana lleva Lengua en las largas del lunes y el martes (690), y Mates
      // en las cortas del jueves y el viernes. Mates prefiere las largas de esos días. Moverse a las largas
      // suma 300 minutos por sesión.
      const input = (lengua: number) =>
        inputOf(
          [
            {
              name: '1º',
              calendar: 'Mixto',
              classes: ['A'],
              subjects: [
                subject(
                  'Lengua',
                  lengua,
                  { A: 'Ana Ruiz' },
                  {
                    // Solo caben en las largas de lunes a miércoles.
                    forbidden: [
                      [1, 2],
                      [2, 2],
                      [3, 2],
                      [4, 1],
                      [4, 2],
                      [5, 1],
                      [5, 2],
                    ],
                  },
                ),
              ],
            },
            {
              name: '2º',
              calendar: 'Mixto',
              classes: ['A'],
              subjects: [
                subject(
                  'Mates',
                  2,
                  { A: 'Ana Ruiz' },
                  {
                    preferred: [
                      [4, 1],
                      [5, 1],
                    ],
                  },
                ),
              ],
            },
          ],
          [professor('Ana Ruiz')],
        );

      it('reaches exactly 1380 minutes', async () => {
        const { score } = await improve(input(2), [
          ['1º', 'A', 'Lengua', 1, 1],
          ['1º', 'A', 'Lengua', 2, 1],
          ['2º', 'A', 'Mates', 4, 2],
          ['2º', 'A', 'Mates', 5, 2],
        ]);

        expect(score.preferredMisses).toBe(0);
      });

      it('does not pass 1380 minutes', async () => {
        const { score } = await improve(input(3), [
          ['1º', 'A', 'Lengua', 1, 1],
          ['1º', 'A', 'Lengua', 2, 1],
          ['1º', 'A', 'Lengua', 3, 1],
          ['2º', 'A', 'Mates', 4, 2],
          ['2º', 'A', 'Mates', 5, 2],
        ]);

        // Con 3 largas (1035) solo cabe una larga más: 1035 + 345 + 45 = 1425 > 1380.
        expect(score.preferredMisses).toBe(2);
      });
    });
  });
});
