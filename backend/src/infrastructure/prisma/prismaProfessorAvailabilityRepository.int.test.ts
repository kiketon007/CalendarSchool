import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { UnavailableInterval } from '../../domain/professor/availability.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaProfessorAvailabilityRepository } from './prismaProfessorAvailabilityRepository.js';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(8000 + ++sequence).padStart(12, '0')}`;
const repository = new PrismaProfessorAvailabilityRepository(testPrisma, nextId);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';
const OTHER_PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f2';
const FOREIGN_PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f3';

const interval = (
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
): UnavailableInterval => ({
  dayOfWeek,
  startMinute,
  endMinute,
});

async function seed(professorId: string, intervals: UnavailableInterval[], schoolId = SCHOOL_ID) {
  await testPrisma.professorUnavailability.createMany({
    data: intervals.map((entry) => ({ id: nextId(), schoolId, professorId, ...entry })),
  });
}

const stored = async (professorId: string) =>
  (
    await testPrisma.professorUnavailability.findMany({
      where: { professorId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    })
  ).map(({ dayOfWeek, startMinute, endMinute }) => interval(dayOfWeek, startMinute, endMinute));

describe('PrismaProfessorAvailabilityRepository', () => {
  beforeEach(async () => {
    sequence = 0;
    for (const [id, name] of [
      [SCHOOL_ID, 'ceipuno'],
      [OTHER_SCHOOL_ID, 'ceipdos'],
    ] as const) {
      await testPrisma.school.create({
        data: { id, name, normalizedName: name, municipalityCode: '46250' },
      });
    }
    await testPrisma.professor.createMany({
      data: [
        { id: PROFESSOR_ID, schoolId: SCHOOL_ID, firstName: 'Ana', lastName: 'García' },
        { id: OTHER_PROFESSOR_ID, schoolId: SCHOOL_ID, firstName: 'Luis', lastName: 'Pérez' },
        { id: FOREIGN_PROFESSOR_ID, schoolId: OTHER_SCHOOL_ID, firstName: 'Eva', lastName: 'Gil' },
      ],
    });
  });

  describe('find', () => {
    it('returns no intervals for a professor that is available always', async () => {
      await expect(repository.find(SCHOOL_ID, PROFESSOR_ID)).resolves.toEqual({
        professorId: PROFESSOR_ID,
        intervals: [],
      });
    });

    it('returns the intervals ordered by day and by start', async () => {
      await seed(PROFESSOR_ID, [
        interval(3, 600, 660),
        interval(1, 700, 760),
        interval(1, 540, 600),
      ]);

      await expect(repository.find(SCHOOL_ID, PROFESSOR_ID)).resolves.toEqual({
        professorId: PROFESSOR_ID,
        intervals: [interval(1, 540, 600), interval(1, 700, 760), interval(3, 600, 660)],
      });
    });

    it('does not return the intervals of another professor', async () => {
      await seed(OTHER_PROFESSOR_ID, [interval(2, 540, 600)]);

      const found = await repository.find(SCHOOL_ID, PROFESSOR_ID);

      expect(found?.intervals).toEqual([]);
    });

    it('returns null for a professor of another school, one that does not exist and a school that does not exist', async () => {
      await expect(repository.find(SCHOOL_ID, FOREIGN_PROFESSOR_ID)).resolves.toBeNull();
      await expect(repository.find(SCHOOL_ID, nextId())).resolves.toBeNull();
      await expect(repository.find(nextId(), PROFESSOR_ID)).resolves.toBeNull();
    });
  });

  describe('replace', () => {
    it('creates the intervals of a professor that had none', async () => {
      const result = await repository.replace(SCHOOL_ID, PROFESSOR_ID, [
        interval(1, 540, 630),
        interval(3, 540, 840),
      ]);

      expect(result).toEqual({
        kind: 'replaced',
        availability: {
          professorId: PROFESSOR_ID,
          intervals: [interval(1, 540, 630), interval(3, 540, 840)],
        },
      });
      await expect(stored(PROFESSOR_ID)).resolves.toEqual([
        interval(1, 540, 630),
        interval(3, 540, 840),
      ]);
    });

    it('stores the school and the professor of each row', async () => {
      await repository.replace(SCHOOL_ID, PROFESSOR_ID, [interval(1, 540, 630)]);

      await expect(testPrisma.professorUnavailability.findFirstOrThrow()).resolves.toMatchObject({
        schoolId: SCHOOL_ID,
        professorId: PROFESSOR_ID,
      });
    });

    it('replaces the intervals as a whole', async () => {
      await seed(PROFESSOR_ID, [interval(1, 540, 630), interval(2, 540, 630)]);

      const result = await repository.replace(SCHOOL_ID, PROFESSOR_ID, [
        interval(2, 540, 630),
        interval(4, 600, 660),
      ]);

      expect(result.kind).toBe('replaced');
      await expect(stored(PROFESSOR_ID)).resolves.toEqual([
        interval(2, 540, 630),
        interval(4, 600, 660),
      ]);
    });

    it('empties the intervals with an empty list', async () => {
      await seed(PROFESSOR_ID, [interval(1, 540, 630)]);

      const result = await repository.replace(SCHOOL_ID, PROFESSOR_ID, []);

      expect(result).toEqual({
        kind: 'replaced',
        availability: { professorId: PROFESSOR_ID, intervals: [] },
      });
      await expect(stored(PROFESSOR_ID)).resolves.toEqual([]);
    });

    it('does not write anything when the intervals are already stored, and keeps their dates', async () => {
      await seed(PROFESSOR_ID, [interval(1, 540, 630), interval(3, 540, 840)]);
      const before = await testPrisma.professorUnavailability.findMany({ orderBy: { id: 'asc' } });

      const result = await repository.replace(SCHOOL_ID, PROFESSOR_ID, [
        interval(1, 540, 630),
        interval(3, 540, 840),
      ]);

      expect(result.kind).toBe('unchanged');
      await expect(
        testPrisma.professorUnavailability.findMany({ orderBy: { id: 'asc' } }),
      ).resolves.toEqual(before);
    });

    it('reports unchanged for an empty list when there was nothing', async () => {
      await expect(repository.replace(SCHOOL_ID, PROFESSOR_ID, [])).resolves.toEqual({
        kind: 'unchanged',
        availability: { professorId: PROFESSOR_ID, intervals: [] },
      });
    });

    it('does not touch the intervals of the other professors', async () => {
      await seed(OTHER_PROFESSOR_ID, [interval(5, 540, 600)]);
      await seed(FOREIGN_PROFESSOR_ID, [interval(5, 540, 600)], OTHER_SCHOOL_ID);

      await repository.replace(SCHOOL_ID, PROFESSOR_ID, [interval(1, 540, 630)]);

      await expect(stored(OTHER_PROFESSOR_ID)).resolves.toEqual([interval(5, 540, 600)]);
      await expect(stored(FOREIGN_PROFESSOR_ID)).resolves.toEqual([interval(5, 540, 600)]);
    });

    it('answers notFound and writes nothing for a professor of another school', async () => {
      await expect(
        repository.replace(SCHOOL_ID, FOREIGN_PROFESSOR_ID, [interval(1, 540, 630)]),
      ).resolves.toEqual({ kind: 'notFound' });
      await expect(testPrisma.professorUnavailability.count()).resolves.toBe(0);
    });

    it('answers notFound for a professor that does not exist', async () => {
      await expect(repository.replace(SCHOOL_ID, nextId(), [])).resolves.toEqual({
        kind: 'notFound',
      });
    });
  });

  describe('races', () => {
    const ROUNDS = 5;

    it('keeps the whole state of one of two simultaneous saves, never a mix', async () => {
      const first = [interval(1, 540, 600), interval(1, 700, 760), interval(2, 540, 600)];
      const second = [interval(3, 800, 900), interval(4, 100, 200)];
      for (let round = 0; round < ROUNDS; round += 1) {
        const results = await Promise.allSettled([
          repository.replace(SCHOOL_ID, PROFESSOR_ID, first),
          repository.replace(SCHOOL_ID, PROFESSOR_ID, second),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        const now = await stored(PROFESSOR_ID);
        expect([first, second]).toContainEqual(now);
      }
    });

    it('either saves before the professor is deleted or finds it gone, without leaving orphans', async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        const professorId = nextId();
        await testPrisma.professor.create({
          data: { id: professorId, schoolId: SCHOOL_ID, firstName: 'Tmp', lastName: 'Prof' },
        });

        const results = await Promise.allSettled([
          repository.replace(SCHOOL_ID, professorId, [interval(1, 540, 630)]),
          testPrisma.professor.delete({ where: { id: professorId } }),
        ]);

        const save = results[0];
        expect(save?.status).toBe('fulfilled');
        if (save?.status === 'fulfilled') {
          expect(['replaced', 'notFound']).toContain(save.value.kind);
        }
        await expect(
          testPrisma.professorUnavailability.count({ where: { professorId } }),
        ).resolves.toBe(0);
      }
    });
  });
});

describe('PrismaProfessorAvailabilityRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaProfessorAvailabilityRepository(prisma) };
  }

  it.each([
    [
      'find',
      (unreachableRepository: PrismaProfessorAvailabilityRepository) =>
        unreachableRepository.find(SCHOOL_ID, PROFESSOR_ID),
    ],
    [
      'replace',
      (unreachableRepository: PrismaProfessorAvailabilityRepository) =>
        unreachableRepository.replace(SCHOOL_ID, PROFESSOR_ID, []),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository: unreachableRepository } = unreachable();

    await expect(operation(unreachableRepository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
