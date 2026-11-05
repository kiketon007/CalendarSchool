import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { DraftEntry, ScheduleDraft } from '../../domain/schedule/scheduleRepository.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaScheduleRepository } from './prismaScheduleRepository.js';

const repository = new PrismaScheduleRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const USER_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const OTHER_USER_ID = '0192f5a0-0000-7000-8000-0000000000a2';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const CLASS_A = '0192f5a0-0000-7000-8000-0000000000c1';
const CLASS_B = '0192f5a0-0000-7000-8000-0000000000c2';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';

const NOW = new Date('2026-11-04T10:00:00.000Z');

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(9900 + ++sequence).padStart(12, '0')}`;

function entry(overrides: Partial<DraftEntry> = {}): DraftEntry {
  return {
    id: nextId(),
    courseId: COURSE_ID,
    classId: CLASS_A,
    subjectId: SUBJECT_ID,
    professorId: PROFESSOR_ID,
    dayOfWeek: 1,
    sessionNumber: 1,
    startMinute: 540,
    endMinute: 585,
    ...overrides,
  };
}

const BEFORE = new Date('2026-11-03T10:00:00.000Z');
const DRAFT_ID = '0192f5a0-0000-7000-8000-0000000000b1';
const OFFICIAL_ID = '0192f5a0-0000-7000-8000-0000000000b2';
const OLD_OFFICIAL_ID = '0192f5a0-0000-7000-8000-0000000000b3';
const NOT_A_SCHEDULE = '0192f5a0-0000-7000-8000-0000000000b9';

/** Un horario con una entrada: un borrador, o un oficial (vigente salvo que se le dé `replacedAt`). */
async function storeSchedule(
  id: string,
  {
    status = 'DRAFT',
    schoolId = SCHOOL_ID,
    userId = USER_ID,
    replacedAt = null,
  }: {
    status?: 'DRAFT' | 'OFFICIAL';
    schoolId?: string;
    userId?: string;
    replacedAt?: Date | null;
  } = {},
) {
  await testPrisma.schedule.create({
    data: {
      id,
      schoolId,
      status,
      engine: 'BACKTRACKING',
      placedSessions: 1,
      createdById: userId,
      ...(status === 'OFFICIAL' ? { confirmedAt: BEFORE, confirmedById: userId, replacedAt } : {}),
    },
  });
  if (schoolId === SCHOOL_ID) {
    await testPrisma.scheduleEntry.create({ data: { scheduleId: id, ...entry() } });
  }
}

/** Inserta una generación `RUNNING`, que es en la que el worker guarda el borrador. */
async function runningGeneration(schoolId = SCHOOL_ID, createdById = USER_ID) {
  return testPrisma.scheduleGeneration.create({
    data: {
      id: nextId(),
      schoolId,
      createdById,
      status: 'RUNNING',
      startedAt: NOW,
      heartbeatAt: NOW,
    },
  });
}

function draftOf(
  generationId: string,
  entries: DraftEntry[],
  overrides: Partial<ScheduleDraft> = {},
) {
  return {
    id: nextId(),
    schoolId: SCHOOL_ID,
    generationId,
    createdById: USER_ID,
    placedSessions: entries.length,
    total: entries.length,
    entries,
    ...overrides,
  } satisfies ScheduleDraft;
}

describe('PrismaScheduleRepository', () => {
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
    await testPrisma.course.create({
      data: {
        id: COURSE_ID,
        schoolId: SCHOOL_ID,
        name: '1º Primaria',
        normalizedName: '1º primaria',
      },
    });
    await testPrisma.schoolClass.createMany({
      data: [
        { id: CLASS_A, courseId: COURSE_ID, name: 'A', normalizedName: 'a' },
        { id: CLASS_B, courseId: COURSE_ID, name: 'B', normalizedName: 'b' },
      ],
    });
    await testPrisma.subject.create({
      data: {
        id: SUBJECT_ID,
        schoolId: SCHOOL_ID,
        name: 'Inglés',
        normalizedName: 'ingles',
        type: 'CORE',
        status: 'ACTIVE',
        color: 'blue',
      },
    });
    await testPrisma.professor.create({
      data: { id: PROFESSOR_ID, schoolId: SCHOOL_ID, firstName: 'Ana', lastName: 'García' },
    });
  });

  describe('replaceDraft', () => {
    it('stores the draft with its entries and completes the generation in the same transaction', async () => {
      const generation = await runningGeneration();
      const entries = [entry(), entry({ sessionNumber: 2 }), entry({ classId: CLASS_B })];
      const draft = draftOf(generation.id, entries, { total: 5 });

      await repository.replaceDraft(draft, NOW);

      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: draft.id } }),
      ).resolves.toMatchObject({
        schoolId: SCHOOL_ID,
        status: 'DRAFT',
        engine: 'BACKTRACKING',
        placedSessions: 3,
        createdById: USER_ID,
        generatedAt: NOW,
      });
      const stored = await testPrisma.scheduleEntry.findMany({ where: { scheduleId: draft.id } });
      expect(stored).toHaveLength(3);
      expect(stored).toContainEqual({ scheduleId: draft.id, ...entries[0] });
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: generation.id } }),
      ).resolves.toMatchObject({
        status: 'COMPLETED',
        scheduleId: draft.id,
        placed: 3,
        total: 5,
        finishedAt: NOW,
      });
    });

    it('stores a draft with thousands of entries, in batches', async () => {
      const generation = await runningGeneration();
      const classIds = Array.from({ length: 62 }, () => nextId());
      await testPrisma.schoolClass.createMany({
        data: classIds.map((id, index) => ({
          id,
          courseId: COURSE_ID,
          name: `X${index}`,
          normalizedName: `x${index}`,
        })),
      });
      const entries = classIds.flatMap((classId) =>
        Array.from({ length: 40 }, (_, cell) =>
          entry({ classId, dayOfWeek: (cell % 5) + 1, sessionNumber: Math.floor(cell / 5) + 1 }),
        ),
      );

      await repository.replaceDraft(draftOf(generation.id, entries), NOW);

      await expect(testPrisma.scheduleEntry.count()).resolves.toBe(2480);
    });

    it('replaces the previous draft of the school, with its entries', async () => {
      const first = await runningGeneration();
      const firstDraft = draftOf(first.id, [entry(), entry({ sessionNumber: 2 })]);
      await repository.replaceDraft(firstDraft, NOW);
      const second = await runningGeneration();
      const secondDraft = draftOf(second.id, [entry({ dayOfWeek: 3 })]);

      await repository.replaceDraft(secondDraft, NOW);

      await expect(testPrisma.schedule.findMany({ select: { id: true } })).resolves.toEqual([
        { id: secondDraft.id },
      ]);
      await expect(testPrisma.scheduleEntry.count()).resolves.toBe(1);
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: first.id } }),
      ).resolves.toMatchObject({ status: 'COMPLETED', scheduleId: null });
    });

    it('does not touch the official schedules nor the draft of another school', async () => {
      const official = await testPrisma.schedule.create({
        data: {
          id: nextId(),
          schoolId: SCHOOL_ID,
          status: 'OFFICIAL',
          engine: 'BACKTRACKING',
          placedSessions: 1,
          createdById: USER_ID,
          confirmedAt: NOW,
          confirmedById: USER_ID,
        },
      });
      await testPrisma.scheduleEntry.create({ data: { scheduleId: official.id, ...entry() } });
      const otherDraft = await testPrisma.schedule.create({
        data: {
          id: nextId(),
          schoolId: OTHER_SCHOOL_ID,
          status: 'DRAFT',
          engine: 'BACKTRACKING',
          placedSessions: 0,
          createdById: OTHER_USER_ID,
        },
      });
      const generation = await runningGeneration();

      await repository.replaceDraft(draftOf(generation.id, [entry({ dayOfWeek: 4 })]), NOW);

      await expect(
        testPrisma.scheduleEntry.count({ where: { scheduleId: official.id } }),
      ).resolves.toBe(1);
      await expect(
        testPrisma.schedule.findUnique({ where: { id: otherDraft.id } }),
      ).resolves.not.toBeNull();
      await expect(testPrisma.schedule.count()).resolves.toBe(3);
    });

    it('leaves the previous draft untouched, and nothing new, when an entry fails to insert', async () => {
      const first = await runningGeneration();
      const firstDraft = draftOf(first.id, [entry(), entry({ sessionNumber: 2 })]);
      await repository.replaceDraft(firstDraft, NOW);
      const second = await runningGeneration();
      // Dos entradas en la misma celda de la misma clase: la segunda viola HC5 a mitad de la inserción.
      const broken = draftOf(second.id, [entry(), entry({ id: nextId() })]);

      await expect(repository.replaceDraft(broken, NOW)).rejects.toThrow();

      await expect(testPrisma.schedule.findMany({ select: { id: true } })).resolves.toEqual([
        { id: firstDraft.id },
      ]);
      await expect(
        testPrisma.scheduleEntry.count({ where: { scheduleId: firstDraft.id } }),
      ).resolves.toBe(2);
      await expect(testPrisma.scheduleEntry.count()).resolves.toBe(2);
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: second.id } }),
      ).resolves.toMatchObject({ status: 'RUNNING', scheduleId: null });
    });

    it.each(['FAILED', 'CANCELLED', 'COMPLETED'] as const)(
      'saves nothing when the generation is no longer running (%s)',
      async (status) => {
        const generation = await testPrisma.scheduleGeneration.create({
          data: { id: nextId(), schoolId: SCHOOL_ID, createdById: USER_ID, status },
        });

        await expect(
          repository.replaceDraft(draftOf(generation.id, [entry()]), NOW),
        ).rejects.toThrow(/ya no está en curso/);

        await expect(testPrisma.schedule.count()).resolves.toBe(0);
        await expect(testPrisma.scheduleEntry.count()).resolves.toBe(0);
      },
    );
  });
});

describe('PrismaScheduleRepository confirmation (US-ALGO-CONFIRM)', () => {
  const repository = new PrismaScheduleRepository(testPrisma);

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
    await testPrisma.course.create({
      data: {
        id: COURSE_ID,
        schoolId: SCHOOL_ID,
        name: '1º Primaria',
        normalizedName: '1º primaria',
      },
    });
    await testPrisma.schoolClass.create({
      data: { id: CLASS_A, courseId: COURSE_ID, name: 'A', normalizedName: 'a' },
    });
    await testPrisma.subject.create({
      data: {
        id: SUBJECT_ID,
        schoolId: SCHOOL_ID,
        name: 'Inglés',
        normalizedName: 'ingles',
        type: 'CORE',
        status: 'ACTIVE',
        color: 'blue',
      },
    });
    await testPrisma.professor.create({
      data: { id: PROFESSOR_ID, schoolId: SCHOOL_ID, firstName: 'Ana', lastName: 'García' },
    });
  });

  describe('confirm', () => {
    it('promotes the draft to the official, with when and who confirmed it, keeping its entries', async () => {
      await storeSchedule(DRAFT_ID);

      const outcome = await repository.confirm(SCHOOL_ID, DRAFT_ID, USER_ID, NOW);

      expect(outcome).toEqual({
        kind: 'confirmed',
        replacedId: null,
        schedule: {
          id: DRAFT_ID,
          status: 'OFFICIAL',
          generatedAt: expect.any(Date) as Date,
          placedSessions: 1,
          confirmedAt: NOW,
          confirmedBy: { firstName: 'Nombre', lastName: 'Apellido' },
          replacedAt: null,
        },
      });
      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: DRAFT_ID } }),
      ).resolves.toMatchObject({
        status: 'OFFICIAL',
        confirmedAt: NOW,
        confirmedById: USER_ID,
        replacedAt: null,
      });
      await expect(
        testPrisma.scheduleEntry.count({ where: { scheduleId: DRAFT_ID } }),
      ).resolves.toBe(1);
    });

    it('replaces the current official and keeps it, with its entries, as replaced', async () => {
      await storeSchedule(OFFICIAL_ID, { status: 'OFFICIAL' });
      await storeSchedule(DRAFT_ID);

      const outcome = await repository.confirm(SCHOOL_ID, DRAFT_ID, USER_ID, NOW);

      expect(outcome).toMatchObject({ kind: 'confirmed', replacedId: OFFICIAL_ID });
      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: OFFICIAL_ID } }),
      ).resolves.toMatchObject({ status: 'OFFICIAL', replacedAt: NOW });
      await expect(
        testPrisma.scheduleEntry.count({ where: { scheduleId: OFFICIAL_ID } }),
      ).resolves.toBe(1);
      await expect(
        testPrisma.schedule.count({
          where: { schoolId: SCHOOL_ID, status: 'OFFICIAL', replacedAt: null },
        }),
      ).resolves.toBe(1);
    });

    it('does not touch the replaced officials that were already there', async () => {
      await storeSchedule(OLD_OFFICIAL_ID, { status: 'OFFICIAL', replacedAt: BEFORE });
      await storeSchedule(OFFICIAL_ID, { status: 'OFFICIAL' });
      await storeSchedule(DRAFT_ID);

      await repository.confirm(SCHOOL_ID, DRAFT_ID, USER_ID, NOW);

      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: OLD_OFFICIAL_ID } }),
      ).resolves.toMatchObject({ replacedAt: BEFORE });
    });

    it('says not found for an id that does not exist, and for the draft of another school', async () => {
      await storeSchedule(DRAFT_ID);

      await expect(repository.confirm(SCHOOL_ID, NOT_A_SCHEDULE, USER_ID, NOW)).resolves.toEqual({
        kind: 'notFound',
      });
      await expect(
        repository.confirm(OTHER_SCHOOL_ID, DRAFT_ID, OTHER_USER_ID, NOW),
      ).resolves.toEqual({ kind: 'notFound' });
      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: DRAFT_ID } }),
      ).resolves.toMatchObject({ status: 'DRAFT', confirmedAt: null });
    });

    it('says not a draft for the current official, and the attempt does not replace it', async () => {
      await storeSchedule(OFFICIAL_ID, { status: 'OFFICIAL' });

      await expect(repository.confirm(SCHOOL_ID, OFFICIAL_ID, USER_ID, NOW)).resolves.toEqual({
        kind: 'notDraft',
      });
      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: OFFICIAL_ID } }),
      ).resolves.toMatchObject({ replacedAt: null, confirmedAt: BEFORE });
    });

    it('says not a draft for a replaced official', async () => {
      await storeSchedule(OLD_OFFICIAL_ID, { status: 'OFFICIAL', replacedAt: BEFORE });

      await expect(repository.confirm(SCHOOL_ID, OLD_OFFICIAL_ID, USER_ID, NOW)).resolves.toEqual({
        kind: 'notDraft',
      });
    });

    it('lets only one of two simultaneous confirmations win', async () => {
      await storeSchedule(OFFICIAL_ID, { status: 'OFFICIAL' });
      await storeSchedule(DRAFT_ID);

      const outcomes = await Promise.all([
        repository.confirm(SCHOOL_ID, DRAFT_ID, USER_ID, NOW),
        repository.confirm(SCHOOL_ID, DRAFT_ID, USER_ID, NOW),
      ]);

      expect(outcomes.map(({ kind }) => kind).sort()).toEqual(['confirmed', 'notDraft']);
      await expect(
        testPrisma.schedule.count({
          where: { schoolId: SCHOOL_ID, status: 'OFFICIAL', replacedAt: null },
        }),
      ).resolves.toBe(1);
      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: OFFICIAL_ID } }),
      ).resolves.toMatchObject({ replacedAt: NOW });
    });

    it('keeps the official when a generation saves a new draft afterwards', async () => {
      await storeSchedule(DRAFT_ID);
      await repository.confirm(SCHOOL_ID, DRAFT_ID, USER_ID, NOW);
      const generation = await runningGeneration();

      await repository.replaceDraft(draftOf(generation.id, [entry({ dayOfWeek: 3 })]), NOW);

      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: DRAFT_ID } }),
      ).resolves.toMatchObject({ status: 'OFFICIAL', replacedAt: null });
      await expect(testPrisma.schedule.count({ where: { status: 'DRAFT' } })).resolves.toBe(1);
    });
  });

  describe('discard', () => {
    it('deletes the draft with its entries and keeps the generation, without schedule', async () => {
      await storeSchedule(DRAFT_ID);
      const generation = await testPrisma.scheduleGeneration.create({
        data: {
          id: nextId(),
          schoolId: SCHOOL_ID,
          createdById: USER_ID,
          status: 'COMPLETED',
          scheduleId: DRAFT_ID,
        },
      });

      await expect(repository.discard(SCHOOL_ID, DRAFT_ID)).resolves.toEqual({
        kind: 'discarded',
      });

      await expect(testPrisma.schedule.count()).resolves.toBe(0);
      await expect(testPrisma.scheduleEntry.count()).resolves.toBe(0);
      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: generation.id } }),
      ).resolves.toMatchObject({ status: 'COMPLETED', scheduleId: null });
    });

    it('does not touch the official of the school', async () => {
      await storeSchedule(OFFICIAL_ID, { status: 'OFFICIAL' });
      await storeSchedule(DRAFT_ID);

      await repository.discard(SCHOOL_ID, DRAFT_ID);

      await expect(
        testPrisma.schedule.findUniqueOrThrow({ where: { id: OFFICIAL_ID } }),
      ).resolves.toMatchObject({ status: 'OFFICIAL', replacedAt: null });
      await expect(
        testPrisma.scheduleEntry.count({ where: { scheduleId: OFFICIAL_ID } }),
      ).resolves.toBe(1);
    });

    it('never deletes an official one, current or replaced', async () => {
      await storeSchedule(OFFICIAL_ID, { status: 'OFFICIAL' });
      await storeSchedule(OLD_OFFICIAL_ID, { status: 'OFFICIAL', replacedAt: BEFORE });

      await expect(repository.discard(SCHOOL_ID, OFFICIAL_ID)).resolves.toEqual({
        kind: 'notDraft',
      });
      await expect(repository.discard(SCHOOL_ID, OLD_OFFICIAL_ID)).resolves.toEqual({
        kind: 'notDraft',
      });

      await expect(testPrisma.schedule.count()).resolves.toBe(2);
      await expect(testPrisma.scheduleEntry.count()).resolves.toBe(2);
    });

    it('says not found for an id that does not exist, and for the draft of another school', async () => {
      await storeSchedule(DRAFT_ID);

      await expect(repository.discard(SCHOOL_ID, NOT_A_SCHEDULE)).resolves.toEqual({
        kind: 'notFound',
      });
      await expect(repository.discard(OTHER_SCHOOL_ID, DRAFT_ID)).resolves.toEqual({
        kind: 'notFound',
      });
      await expect(testPrisma.schedule.count()).resolves.toBe(1);
    });
  });
});

describe('PrismaScheduleRepository with an unreachable database', () => {
  it('replaceDraft throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaScheduleRepository(prisma).replaceDraft(draftOf(nextId(), [entry()]), NOW),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });

  it.each(['confirm', 'discard'] as const)('%s throws DatabaseUnavailable', async (method) => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    const repository = new PrismaScheduleRepository(prisma);

    await expect(
      method === 'confirm'
        ? repository.confirm(SCHOOL_ID, DRAFT_ID, USER_ID, NOW)
        : repository.discard(SCHOOL_ID, DRAFT_ID),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
