import { describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma, testSchema } from '../../../test/support/testPrisma.js';
import { UuidV7IdGenerator } from '../uuidV7IdGenerator.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaAttemptRepository } from './prismaAttemptRepository.js';

const idGenerator = new UuidV7IdGenerator();
const repository = new PrismaAttemptRepository(testPrisma, idGenerator);

const WINDOW_MS = 15 * 60 * 1000;
const MAX = 5;
const KEY = 'register:203.0.113.7';
const T0 = new Date('2026-10-10T09:00:00.000Z');

/** Instante `milliseconds` después de T0. */
const at = (milliseconds: number) => new Date(T0.getTime() + milliseconds);
const minutes = (count: number) => count * 60 * 1000;

async function countAttempts(key?: string): Promise<number> {
  return testPrisma.rateLimitAttempt.count(key ? { where: { key } } : undefined);
}

describe('PrismaAttemptRepository', () => {
  describe('register', () => {
    it('accepts the attempts up to the maximum', async () => {
      for (let attempt = 0; attempt < MAX; attempt++) {
        await expect(repository.register(KEY, at(attempt * 1000), WINDOW_MS, MAX)).resolves.toEqual(
          { accepted: true },
        );
      }

      expect(await countAttempts(KEY)).toBe(MAX);
    });

    it('stores each accepted attempt with a UUIDv7 and its instant', async () => {
      await repository.register(KEY, T0, WINDOW_MS, MAX);

      const [stored] = await testPrisma.rateLimitAttempt.findMany();
      expect(stored).toMatchObject({ key: KEY, attemptedAt: T0 });
      expect(stored?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });

    it('rejects the attempt that exceeds the maximum without storing it', async () => {
      for (let attempt = 0; attempt < MAX; attempt++) {
        await repository.register(KEY, at(attempt * 1000), WINDOW_MS, MAX);
      }

      const result = await repository.register(KEY, at(MAX * 1000), WINDOW_MS, MAX);

      expect(result.accepted).toBe(false);
      expect(await countAttempts(KEY)).toBe(MAX);
    });

    it('reports the instant when the oldest attempt leaves the window', async () => {
      for (let attempt = 0; attempt < MAX; attempt++) {
        await repository.register(KEY, at(attempt * 1000), WINDOW_MS, MAX);
      }

      const result = await repository.register(KEY, at(minutes(1)), WINDOW_MS, MAX);

      expect(result).toEqual({ accepted: false, retryAt: at(WINDOW_MS) });
    });

    it('does not extend the block with the attempts rejected during it', async () => {
      for (let attempt = 0; attempt < MAX; attempt++) {
        await repository.register(KEY, at(attempt * 1000), WINDOW_MS, MAX);
      }

      await repository.register(KEY, at(minutes(2)), WINDOW_MS, MAX);
      await repository.register(KEY, at(minutes(3)), WINDOW_MS, MAX);
      const afterBlock = await repository.register(KEY, at(WINDOW_MS), WINDOW_MS, MAX);

      expect(afterBlock).toEqual({ accepted: true });
    });

    it('slides the window: an attempt stops counting once it is 15 minutes old', async () => {
      await repository.register(KEY, T0, WINDOW_MS, MAX);
      for (let attempt = 1; attempt < MAX; attempt++) {
        await repository.register(KEY, at(minutes(14)), WINDOW_MS, MAX);
      }

      const justBefore = await repository.register(KEY, at(WINDOW_MS - 1), WINDOW_MS, MAX);
      const atTheBoundary = await repository.register(KEY, at(WINDOW_MS), WINDOW_MS, MAX);

      expect(justBefore.accepted).toBe(false);
      expect(atTheBoundary).toEqual({ accepted: true });
    });

    it('counts each key separately', async () => {
      for (let attempt = 0; attempt < MAX; attempt++) {
        await repository.register(KEY, at(attempt * 1000), WINDOW_MS, MAX);
      }

      const otherIp = await repository.register('register:198.51.100.9', T0, WINDOW_MS, MAX);
      const otherOperation = await repository.register('login:203.0.113.7', T0, WINDOW_MS, MAX);

      expect(otherIp).toEqual({ accepted: true });
      expect(otherOperation).toEqual({ accepted: true });
    });

    it('applies the maximum it receives, so each operation can have its own', async () => {
      await repository.register(KEY, T0, WINDOW_MS, 1);

      const second = await repository.register(KEY, at(1000), WINDOW_MS, 1);

      expect(second.accepted).toBe(false);
    });

    it('deletes the expired attempts of the key and leaves those of other keys', async () => {
      const old = at(-minutes(30));
      await testPrisma.rateLimitAttempt.createMany({
        data: [
          { id: idGenerator.generate(), key: KEY, attemptedAt: old },
          { id: idGenerator.generate(), key: KEY, attemptedAt: at(-minutes(16)) },
          { id: idGenerator.generate(), key: 'register:198.51.100.9', attemptedAt: old },
        ],
      });

      await repository.register(KEY, T0, WINDOW_MS, MAX);

      expect(await countAttempts(KEY)).toBe(1);
      expect(await countAttempts('register:198.51.100.9')).toBe(1);
    });
  });
});

describe('PrismaAttemptRepository under concurrency', () => {
  it('accepts exactly the maximum when 10 simultaneous attempts share a key', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repository.register(KEY, T0, WINDOW_MS, MAX)),
    );

    expect(results.filter((result) => result.accepted)).toHaveLength(MAX);
    expect(results.filter((result) => !result.accepted)).toHaveLength(10 - MAX);
    expect(await countAttempts(KEY)).toBe(MAX);
  });

  it('shares the counter between two instances with their own connection pool', async () => {
    const otherInstancePrisma = createPrismaClient({
      connectionString: testDatabaseUrl,
      schema: testSchema,
    });
    const otherInstance = new PrismaAttemptRepository(otherInstancePrisma, idGenerator);

    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        await repository.register(KEY, at(attempt * 1000), WINDOW_MS, MAX);
        await otherInstance.register(KEY, at(attempt * 1000), WINDOW_MS, MAX);
      }
      // Seis intentos con un máximo de 5: el quinto es del segundo y el sexto se rechaza.
      const fromFirst = await repository.register(KEY, at(10_000), WINDOW_MS, MAX);
      const fromSecond = await otherInstance.register(KEY, at(10_000), WINDOW_MS, MAX);

      expect(fromFirst.accepted).toBe(false);
      expect(fromSecond.accepted).toBe(false);
      expect(await countAttempts(KEY)).toBe(MAX);
    } finally {
      await otherInstancePrisma.$disconnect();
    }
  });

  it('does not make different keys wait for each other', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        repository.register(`register:198.51.100.${index}`, T0, WINDOW_MS, MAX),
      ),
    );

    expect(results.every((result) => result.accepted)).toBe(true);
  });
});

describe('PrismaAttemptRepository with an unreachable database', () => {
  it('register throws DatabaseUnavailable, so no attempt is accepted', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaAttemptRepository(prisma, idGenerator).register(KEY, T0, WINDOW_MS, MAX),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
