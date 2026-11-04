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
});
