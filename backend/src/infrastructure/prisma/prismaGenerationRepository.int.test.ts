import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { GenerationInProgress } from '../../domain/schedule/generationErrors.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaGenerationRepository } from './prismaGenerationRepository.js';

const repository = new PrismaGenerationRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const USER_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const OTHER_USER_ID = '0192f5a0-0000-7000-8000-0000000000a2';

const NOW = new Date('2026-11-04T10:00:00.000Z');
const at = (secondsAfter: number) => new Date(NOW.getTime() + secondsAfter * 1000);

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(9800 + ++sequence).padStart(12, '0')}`;

/** Inserta una generación directamente, con el estado y las fechas que pida el test. */
async function seed(overrides: Record<string, unknown> = {}) {
  return testPrisma.scheduleGeneration.create({
    data: { id: nextId(), schoolId: SCHOOL_ID, createdById: USER_ID, createdAt: NOW, ...overrides },
  });
}

const row = (id: string) => testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id } });

describe('PrismaGenerationRepository', () => {
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
    for (const [id, schoolId, email] of [
      [USER_ID, SCHOOL_ID, 'uno@ceipuno.es'],
      [OTHER_USER_ID, OTHER_SCHOOL_ID, 'dos@ceipdos.es'],
    ] as const) {
      await testPrisma.user.create({
        data: {
          id,
          schoolId,
          email,
          passwordHash: '$2b$12$'.padEnd(60, 'x'),
          firstName: 'Nombre',
          lastName: 'Apellido',
          role: 'ADMIN',
        },
      });
    }
  });

  describe('insert', () => {
    it('stores a queued generation with zero progress', async () => {
      const id = nextId();

      const generation = await repository.insert({
        id,
        schoolId: SCHOOL_ID,
        createdById: USER_ID,
        improve: true,
        now: NOW,
      });

      expect(generation).toEqual({
        id,
        schoolId: SCHOOL_ID,
        createdById: USER_ID,
        status: 'QUEUED',
        placed: 0,
        total: 0,
        improve: true,
        phase: 'SEARCHING',
        score: null,
        cancelRequested: false,
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
        scheduleId: null,
        createdAt: NOW,
        startedAt: null,
        finishedAt: null,
      });
      expect((await row(id)).cancelRequested).toBe(false);
    });

    it.each([true, false])('stores that the improvement was asked for (%s)', async (improve) => {
      const id = nextId();

      const generation = await repository.insert({
        id,
        schoolId: SCHOOL_ID,
        createdById: USER_ID,
        improve,
        now: NOW,
      });

      expect(generation.improve).toBe(improve);
      expect((await row(id)).improve).toBe(improve);
    });

    it.each(['QUEUED', 'RUNNING'] as const)(
      'throws GenerationInProgress while the school has one %s, without creating another',
      async (status) => {
        await seed({ status });

        await expect(
          repository.insert({
            id: nextId(),
            schoolId: SCHOOL_ID,
            createdById: USER_ID,
            improve: true,
            now: NOW,
          }),
        ).rejects.toBeInstanceOf(GenerationInProgress);
        await expect(testPrisma.scheduleGeneration.count()).resolves.toBe(1);
      },
    );

    it.each(['COMPLETED', 'FAILED', 'CANCELLED'] as const)(
      'accepts a new one when the previous is %s',
      async (status) => {
        await seed({ status });

        await expect(
          repository.insert({
            id: nextId(),
            schoolId: SCHOOL_ID,
            createdById: USER_ID,
            improve: true,
            now: NOW,
          }),
        ).resolves.toMatchObject({ status: 'QUEUED' });
      },
    );

    it('lets only one of two simultaneous inserts win', async () => {
      const results = await Promise.allSettled([
        repository.insert({
          id: nextId(),
          schoolId: SCHOOL_ID,
          createdById: USER_ID,
          improve: true,
          now: NOW,
        }),
        repository.insert({
          id: nextId(),
          schoolId: SCHOOL_ID,
          createdById: USER_ID,
          improve: true,
          now: NOW,
        }),
      ]);

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find((result) => result.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(GenerationInProgress);
    });

    it('accepts one in each school', async () => {
      await seed();

      await expect(
        repository.insert({
          id: nextId(),
          schoolId: OTHER_SCHOOL_ID,
          createdById: OTHER_USER_ID,
          improve: true,
          now: NOW,
        }),
      ).resolves.toMatchObject({ schoolId: OTHER_SCHOOL_ID });
    });
  });

  describe('reading the improvement columns', () => {
    it('gives the defaults to a row written without them, like one from before the improvement', async () => {
      const { id } = await seed({ status: 'RUNNING' });

      await expect(repository.findById(SCHOOL_ID, id)).resolves.toMatchObject({
        improve: true,
        phase: 'SEARCHING',
        score: null,
        cancelRequested: false,
      });
    });

    it('reads the cancel mark', async () => {
      const { id } = await seed({ status: 'COMPLETED', cancelRequested: true });

      await expect(repository.findCurrent(SCHOOL_ID)).resolves.toMatchObject({
        id,
        cancelRequested: true,
      });
    });

    it('reads as null a score saved with the wrong shape, without failing', async () => {
      const { id } = await seed({ status: 'RUNNING', score: { total: 3 } });

      await expect(repository.findById(SCHOOL_ID, id)).resolves.toMatchObject({ score: null });
    });

    it('claims a generation with its improve, phase and score', async () => {
      const { id } = await seed({ improve: false });

      await expect(repository.claim(id, at(3))).resolves.toMatchObject({
        improve: false,
        phase: 'SEARCHING',
        score: null,
      });
    });
  });

  describe('claim', () => {
    it('moves a queued generation to running, with its start and first heartbeat', async () => {
      const { id } = await seed();

      const claimed = await repository.claim(id, at(3));

      expect(claimed).toMatchObject({
        id,
        schoolId: SCHOOL_ID,
        status: 'RUNNING',
        startedAt: at(3),
      });
      expect((await row(id)).heartbeatAt).toEqual(at(3));
    });

    it('returns null the second time, so a Lambda retry does nothing', async () => {
      const { id } = await seed();
      await repository.claim(id, at(3));

      await expect(repository.claim(id, at(4))).resolves.toBeNull();
      expect((await row(id)).startedAt).toEqual(at(3));
    });

    it.each(['CANCELLED', 'COMPLETED', 'FAILED'] as const)(
      'returns null for a %s generation',
      async (status) => {
        const { id } = await seed({ status });

        await expect(repository.claim(id, at(3))).resolves.toBeNull();
        expect((await row(id)).status).toBe(status);
      },
    );

    it('returns null for a generation that does not exist', async () => {
      await expect(repository.claim(nextId(), at(3))).resolves.toBeNull();
    });

    it('lets only one of two simultaneous claims win', async () => {
      const { id } = await seed();

      const results = await Promise.all([repository.claim(id, at(3)), repository.claim(id, at(3))]);

      expect(results.filter((result) => result !== null)).toHaveLength(1);
    });
  });

  describe('saveProgress', () => {
    it('stores the progress and the heartbeat of a running generation', async () => {
      const { id } = await seed({ status: 'RUNNING', heartbeatAt: NOW });

      const result = await repository.saveProgress(
        id,
        { placed: 10, total: 50, phase: 'SEARCHING', score: null },
        at(5),
      );

      expect(result).toEqual({ cancelRequested: false });
      expect(await row(id)).toMatchObject({ placed: 10, total: 50, heartbeatAt: at(5) });
    });

    it('stores the phase and the score of the best schedule so far', async () => {
      const { id } = await seed({ status: 'RUNNING' });
      const score = {
        total: 12,
        preferredMisses: 1,
        preferredTotal: 6,
        professorGaps: 0,
        consecutiveDays: 2,
        initialTotal: 21,
      };

      await repository.saveProgress(
        id,
        { placed: 50, total: 50, phase: 'IMPROVING', score },
        at(5),
      );

      expect(await row(id)).toMatchObject({ phase: 'IMPROVING', score });
      await expect(repository.findById(SCHOOL_ID, id)).resolves.toMatchObject({
        phase: 'IMPROVING',
        score,
      });
    });

    it('leaves the score empty while the engine has none yet', async () => {
      const { id } = await seed({ status: 'RUNNING' });

      await repository.saveProgress(
        id,
        { placed: 1, total: 5, phase: 'SEARCHING', score: null },
        at(5),
      );

      expect((await row(id)).score).toBeNull();
    });

    it('never lowers the placed sessions', async () => {
      const { id } = await seed({ status: 'RUNNING', placed: 30, total: 50 });

      await repository.saveProgress(
        id,
        { placed: 12, total: 50, phase: 'SEARCHING', score: null },
        at(5),
      );

      expect((await row(id)).placed).toBe(30);
    });

    it('reports a requested cancellation', async () => {
      const { id } = await seed({ status: 'RUNNING', cancelRequested: true });

      await expect(
        repository.saveProgress(
          id,
          { placed: 1, total: 5, phase: 'SEARCHING', score: null },
          at(5),
        ),
      ).resolves.toEqual({
        cancelRequested: true,
      });
    });

    it.each(['FAILED', 'CANCELLED', 'COMPLETED'] as const)(
      'tells the worker to stop and changes nothing when the generation is %s',
      async (status) => {
        const { id } = await seed({ status, placed: 3, total: 9 });

        await expect(
          repository.saveProgress(
            id,
            { placed: 8, total: 9, phase: 'SEARCHING', score: null },
            at(5),
          ),
        ).resolves.toEqual({
          cancelRequested: true,
        });
        expect(await row(id)).toMatchObject({ status, placed: 3 });
      },
    );
  });

  describe('finish', () => {
    it('stores a failure with its code, message and structured details', async () => {
      const { id } = await seed({ status: 'RUNNING' });
      const errorDetails = {
        reason: 'PROFESSOR_BUSY' as const,
        lesson: {
          course: { id: nextId(), name: '1º Primaria' },
          class: { id: nextId(), name: 'A' },
          subject: { id: nextId(), name: 'Inglés' },
          professor: { id: nextId(), name: 'Ana López' },
        },
      };

      await repository.finish(
        id,
        {
          status: 'FAILED',
          placed: 4,
          total: 9,
          errorCode: 'INFEASIBLE',
          errorMessage: 'No se encontró un horario',
          errorDetails,
        },
        at(9),
      );

      expect(await row(id)).toMatchObject({
        status: 'FAILED',
        placed: 4,
        total: 9,
        errorCode: 'INFEASIBLE',
        errorMessage: 'No se encontró un horario',
        errorDetails,
        finishedAt: at(9),
      });
    });

    it('stores a failure without details', async () => {
      const { id } = await seed({ status: 'RUNNING' });

      await repository.finish(
        id,
        {
          status: 'FAILED',
          placed: 0,
          total: 0,
          errorCode: 'TIMEOUT',
          errorMessage: 'Se agotó el tiempo',
          errorDetails: null,
        },
        at(9),
      );

      expect(await row(id)).toMatchObject({ errorCode: 'TIMEOUT', errorDetails: null });
    });

    it('stores a cancellation', async () => {
      const { id } = await seed({ status: 'RUNNING' });

      await repository.finish(id, { status: 'CANCELLED', placed: 4, total: 9 }, at(9));

      expect(await row(id)).toMatchObject({
        status: 'CANCELLED',
        placed: 4,
        total: 9,
        errorCode: null,
        finishedAt: at(9),
      });
    });

    it('also finishes a queued generation, when it could not be launched', async () => {
      const { id } = await seed();

      await repository.finish(
        id,
        {
          status: 'FAILED',
          placed: 0,
          total: 0,
          errorCode: 'INTERNAL',
          errorMessage: 'No se pudo lanzar',
          errorDetails: null,
        },
        at(1),
      );

      expect(await row(id)).toMatchObject({
        status: 'FAILED',
        errorCode: 'INTERNAL',
        finishedAt: at(1),
      });
    });

    it('does not touch a generation that is no longer running', async () => {
      const { id } = await seed({ status: 'FAILED', errorCode: 'INTERNAL', finishedAt: at(1) });

      await repository.finish(id, { status: 'CANCELLED', placed: 4, total: 9 }, at(9));

      expect(await row(id)).toMatchObject({ status: 'FAILED', finishedAt: at(1) });
    });
  });

  describe('failStuck', () => {
    const cutoff = at(100);

    it('marks a running generation whose heartbeat is older than the cutoff', async () => {
      const { id } = await seed({ status: 'RUNNING', heartbeatAt: at(10) });

      await expect(repository.failStuck(SCHOOL_ID, cutoff, at(200))).resolves.toBe(1);

      expect(await row(id)).toMatchObject({
        status: 'FAILED',
        errorCode: 'INTERNAL',
        errorMessage: 'La generación se interrumpió',
        finishedAt: at(200),
      });
    });

    it('marks a queued generation created before the cutoff', async () => {
      const { id } = await seed({ createdAt: at(10) });

      await expect(repository.failStuck(SCHOOL_ID, cutoff, at(200))).resolves.toBe(1);
      expect((await row(id)).status).toBe('FAILED');
    });

    it('leaves a running generation with a recent heartbeat', async () => {
      const { id } = await seed({ status: 'RUNNING', heartbeatAt: at(150) });

      await expect(repository.failStuck(SCHOOL_ID, cutoff, at(200))).resolves.toBe(0);
      expect((await row(id)).status).toBe('RUNNING');
    });

    it('leaves a queued generation created after the cutoff', async () => {
      const { id } = await seed({ createdAt: at(150) });

      await expect(repository.failStuck(SCHOOL_ID, cutoff, at(200))).resolves.toBe(0);
      expect((await row(id)).status).toBe('QUEUED');
    });

    it.each(['COMPLETED', 'FAILED', 'CANCELLED'] as const)(
      'leaves a %s generation',
      async (status) => {
        const { id } = await seed({ status, createdAt: at(1), heartbeatAt: at(1) });

        await expect(repository.failStuck(SCHOOL_ID, cutoff, at(200))).resolves.toBe(0);
        expect((await row(id)).status).toBe(status);
      },
    );

    it('only touches the generations of the school', async () => {
      const { id } = await seed({
        schoolId: OTHER_SCHOOL_ID,
        createdById: OTHER_USER_ID,
        createdAt: at(1),
      });

      await expect(repository.failStuck(SCHOOL_ID, cutoff, at(200))).resolves.toBe(0);
      expect((await row(id)).status).toBe('QUEUED');
    });
  });

  describe('findCurrent', () => {
    it('returns null when the school never generated', async () => {
      await expect(repository.findCurrent(SCHOOL_ID)).resolves.toBeNull();
    });

    it('returns the generation in progress', async () => {
      await seed({ status: 'COMPLETED', createdAt: at(1) });
      const { id } = await seed({ status: 'RUNNING', createdAt: at(5) });

      await expect(repository.findCurrent(SCHOOL_ID)).resolves.toMatchObject({
        id,
        status: 'RUNNING',
      });
    });

    it('returns the latest one by creation date when none is in progress', async () => {
      await seed({ status: 'FAILED', createdAt: at(1) });
      const { id } = await seed({ status: 'COMPLETED', createdAt: at(9) });
      await seed({ status: 'CANCELLED', createdAt: at(4) });

      await expect(repository.findCurrent(SCHOOL_ID)).resolves.toMatchObject({ id });
    });

    it('does not return the generations of another school', async () => {
      await seed({ schoolId: OTHER_SCHOOL_ID, createdById: OTHER_USER_ID });

      await expect(repository.findCurrent(SCHOOL_ID)).resolves.toBeNull();
    });
  });

  describe('findById', () => {
    it('returns the generation of the school', async () => {
      const { id } = await seed({ status: 'COMPLETED' });

      await expect(repository.findById(SCHOOL_ID, id)).resolves.toMatchObject({
        id,
        status: 'COMPLETED',
      });
    });

    it('returns null for a generation of another school or that does not exist', async () => {
      const { id } = await seed();

      await expect(repository.findById(OTHER_SCHOOL_ID, id)).resolves.toBeNull();
      await expect(repository.findById(SCHOOL_ID, nextId())).resolves.toBeNull();
    });
  });

  describe('requestCancel', () => {
    it('cancels a queued generation directly', async () => {
      const { id } = await seed();

      const outcome = await repository.requestCancel(SCHOOL_ID, id, at(2));

      expect(outcome).toMatchObject({
        kind: 'requested',
        generation: { id, status: 'CANCELLED', finishedAt: at(2) },
      });
      expect((await row(id)).cancelRequested).toBe(true);
    });

    it('marks the request of a running generation, which the worker will see', async () => {
      const { id } = await seed({ status: 'RUNNING' });

      const outcome = await repository.requestCancel(SCHOOL_ID, id, at(2));

      expect(outcome).toMatchObject({ kind: 'requested', generation: { id, status: 'RUNNING' } });
      expect(await row(id)).toMatchObject({ cancelRequested: true, finishedAt: null });
    });

    it.each(['COMPLETED', 'FAILED', 'CANCELLED'] as const)(
      'says a %s generation is not cancellable and changes nothing',
      async (status) => {
        const { id } = await seed({ status });

        await expect(repository.requestCancel(SCHOOL_ID, id, at(2))).resolves.toEqual({
          kind: 'notCancellable',
        });
        expect(await row(id)).toMatchObject({ status, cancelRequested: false });
      },
    );

    it('says not found for another school and for an unknown id, changing nothing', async () => {
      const { id } = await seed();

      await expect(repository.requestCancel(OTHER_SCHOOL_ID, id, at(2))).resolves.toEqual({
        kind: 'notFound',
      });
      await expect(repository.requestCancel(SCHOOL_ID, nextId(), at(2))).resolves.toEqual({
        kind: 'notFound',
      });
      expect(await row(id)).toMatchObject({ status: 'QUEUED', cancelRequested: false });
    });
  });
});

describe('PrismaGenerationRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaGenerationRepository(prisma) };
  }

  it.each([
    [
      'insert',
      (r: PrismaGenerationRepository) =>
        r.insert({
          id: nextId(),
          schoolId: SCHOOL_ID,
          createdById: USER_ID,
          improve: true,
          now: NOW,
        }),
    ],
    ['claim', (r: PrismaGenerationRepository) => r.claim(nextId(), NOW)],
    [
      'saveProgress',
      (r: PrismaGenerationRepository) =>
        r.saveProgress(nextId(), { placed: 1, total: 2, phase: 'SEARCHING', score: null }, NOW),
    ],
    [
      'finish',
      (r: PrismaGenerationRepository) =>
        r.finish(nextId(), { status: 'CANCELLED', placed: 0, total: 0 }, NOW),
    ],
    ['failStuck', (r: PrismaGenerationRepository) => r.failStuck(SCHOOL_ID, NOW, NOW)],
    ['findCurrent', (r: PrismaGenerationRepository) => r.findCurrent(SCHOOL_ID)],
    ['findById', (r: PrismaGenerationRepository) => r.findById(SCHOOL_ID, nextId())],
    ['requestCancel', (r: PrismaGenerationRepository) => r.requestCancel(SCHOOL_ID, nextId(), NOW)],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository: unreachableRepository } = unreachable();

    await expect(operation(unreachableRepository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
