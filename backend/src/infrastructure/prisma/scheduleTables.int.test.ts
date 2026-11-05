import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const USER_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const CLASS_A = '0192f5a0-0000-7000-8000-0000000000c1';
const CLASS_B = '0192f5a0-0000-7000-8000-0000000000c2';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const OTHER_SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e2';
const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(9700 + ++sequence).padStart(12, '0')}`;

function generation(overrides: Record<string, unknown> = {}) {
  return { id: nextId(), schoolId: SCHOOL_ID, createdById: USER_ID, ...overrides };
}

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    schoolId: SCHOOL_ID,
    status: 'DRAFT' as const,
    engine: 'BACKTRACKING' as const,
    placedSessions: 0,
    createdById: USER_ID,
    ...overrides,
  };
}

/** Un horario oficial vigente (confirmado por `USER_ID`); con `replacedAt` es uno sustituido. */
function official(overrides: Record<string, unknown> = {}) {
  return schedule({
    status: 'OFFICIAL' as const,
    confirmedAt: new Date('2026-11-05T09:00:00.000Z'),
    confirmedById: USER_ID,
    ...overrides,
  });
}

function entry(scheduleId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    scheduleId,
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

interface IndexRow {
  indexdef: string;
}

describe('the schedule tables', () => {
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
    await testPrisma.user.create({
      data: {
        id: USER_ID,
        schoolId: SCHOOL_ID,
        email: 'admin@ceipuno.es',
        passwordHash: '$2b$12$'.padEnd(60, 'x'),
        firstName: 'Nombre',
        lastName: 'Apellido',
        role: 'ADMIN',
      },
    });
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
    for (const [id, name] of [
      [SUBJECT_ID, 'Inglés'],
      [OTHER_SUBJECT_ID, 'Lengua'],
    ] as const) {
      await testPrisma.subject.create({
        data: {
          id,
          schoolId: SCHOOL_ID,
          name,
          normalizedName: name.toLowerCase(),
          type: 'CORE',
          status: 'ACTIVE',
          color: 'blue',
        },
      });
    }
    await testPrisma.professor.create({
      data: { id: PROFESSOR_ID, schoolId: SCHOOL_ID, firstName: 'Ana', lastName: 'García' },
    });
  });

  describe('schedule_generations', () => {
    it('stores a new generation as queued, with zero progress and no cancellation requested', async () => {
      const stored = await testPrisma.scheduleGeneration.create({ data: generation() });

      expect(stored).toMatchObject({
        status: 'QUEUED',
        placed: 0,
        total: 0,
        cancelRequested: false,
        errorCode: null,
        errorDetails: null,
        scheduleId: null,
        startedAt: null,
        finishedAt: null,
        heartbeatAt: null,
      });
      expect(stored.createdAt).toBeInstanceOf(Date);
    });

    it.each(['QUEUED', 'RUNNING'] as const)(
      'rejects a second generation of the school while one is %s',
      async (status) => {
        await testPrisma.scheduleGeneration.create({ data: generation({ status }) });

        await expect(testPrisma.scheduleGeneration.create({ data: generation() })).rejects.toThrow(
          /schedule_generations_in_progress_key|Unique constraint/,
        );
      },
    );

    it.each(['COMPLETED', 'FAILED', 'CANCELLED'] as const)(
      'accepts a new generation when the previous one is %s',
      async (status) => {
        await testPrisma.scheduleGeneration.create({ data: generation({ status }) });

        await expect(
          testPrisma.scheduleGeneration.create({ data: generation() }),
        ).resolves.toMatchObject({ status: 'QUEUED' });
      },
    );

    it('accepts a generation in progress in each school', async () => {
      await testPrisma.scheduleGeneration.create({ data: generation() });

      await expect(
        testPrisma.scheduleGeneration.create({
          data: generation({ schoolId: OTHER_SCHOOL_ID, createdById: USER_ID }),
        }),
      ).resolves.toMatchObject({ schoolId: OTHER_SCHOOL_ID });
    });

    it('has the partial unique index on the school for the generations in progress', async () => {
      const rows = await testPrisma.$queryRaw<IndexRow[]>`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'schedule_generations' AND indexname = 'schedule_generations_in_progress_key'`;

      expect(rows[0]?.indexdef).toContain('UNIQUE');
      expect(rows[0]?.indexdef).toContain('(school_id)');
      expect(rows[0]?.indexdef).toMatch(/QUEUED.*RUNNING/);
    });

    it('keeps the generation, without schedule, when its schedule is deleted', async () => {
      const draft = await testPrisma.schedule.create({ data: schedule() });
      const stored = await testPrisma.scheduleGeneration.create({
        data: generation({ status: 'COMPLETED', scheduleId: draft.id }),
      });

      await testPrisma.schedule.delete({ where: { id: draft.id } });

      await expect(
        testPrisma.scheduleGeneration.findUniqueOrThrow({ where: { id: stored.id } }),
      ).resolves.toMatchObject({ scheduleId: null });
    });

    it('rejects an error code outside the known ones', async () => {
      await expect(
        testPrisma.$executeRaw`
          INSERT INTO schedule_generations (id, school_id, created_by_id, status, error_code)
          VALUES (${nextId()}::uuid, ${SCHOOL_ID}::uuid, ${USER_ID}::uuid, 'FAILED', 'OTHER')`,
      ).rejects.toThrow();
    });

    it('rejects negative progress by its CHECK', async () => {
      await expect(
        testPrisma.scheduleGeneration.create({ data: generation({ placed: -1 }) }),
      ).rejects.toThrow(/schedule_generations_progress_check/);
    });

    it.each(['schedule_generations', 'schedules'])(
      'has the foreign key of %s to schools with ON DELETE CASCADE',
      async (table) => {
        const rows = await testPrisma.$queryRaw<{ def: string }[]>`
          SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conrelid = ${table}::regclass AND contype = 'f'`;

        const found = rows.find((row) => row.def.includes('REFERENCES schools'));
        expect(found?.def).toContain('ON DELETE CASCADE');
      },
    );
  });

  describe('schedules', () => {
    it('stores a draft with the engine, the placed sessions and its creation date', async () => {
      const stored = await testPrisma.schedule.create({ data: schedule({ placedSessions: 300 }) });

      expect(stored).toMatchObject({
        status: 'DRAFT',
        engine: 'BACKTRACKING',
        placedSessions: 300,
      });
      expect(stored.generatedAt).toBeInstanceOf(Date);
    });

    it('rejects a second draft of the same school', async () => {
      await testPrisma.schedule.create({ data: schedule() });

      await expect(testPrisma.schedule.create({ data: schedule() })).rejects.toThrow(
        /schedules_draft_key|Unique constraint/,
      );
    });

    it('does not count an official schedule against the draft', async () => {
      await testPrisma.schedule.create({ data: official() });

      await expect(testPrisma.schedule.create({ data: schedule() })).resolves.toMatchObject({
        status: 'DRAFT',
      });
    });

    it('accepts a draft in each school', async () => {
      await testPrisma.schedule.create({ data: schedule() });

      await expect(
        testPrisma.schedule.create({ data: schedule({ schoolId: OTHER_SCHOOL_ID }) }),
      ).resolves.toMatchObject({ schoolId: OTHER_SCHOOL_ID });
    });

    it('has the partial unique index on the school for the drafts', async () => {
      const rows = await testPrisma.$queryRaw<IndexRow[]>`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'schedules' AND indexname = 'schedules_draft_key'`;

      expect(rows[0]?.indexdef).toContain('UNIQUE');
      expect(rows[0]?.indexdef).toContain('(school_id)');
      expect(rows[0]?.indexdef).toContain('DRAFT');
    });

    it('rejects negative placed sessions by its CHECK', async () => {
      await expect(
        testPrisma.schedule.create({ data: schedule({ placedSessions: -1 }) }),
      ).rejects.toThrow(/schedules_placed_sessions_check/);
    });

    describe('the confirmation (US-ALGO-CONFIRM)', () => {
      it('stores a confirmed official with when and who confirmed it, and not replaced', async () => {
        const stored = await testPrisma.schedule.create({ data: official() });

        expect(stored).toMatchObject({
          status: 'OFFICIAL',
          confirmedById: USER_ID,
          replacedAt: null,
        });
        expect(stored.confirmedAt).toEqual(new Date('2026-11-05T09:00:00.000Z'));
      });

      it('leaves the confirmation empty in a draft', async () => {
        const stored = await testPrisma.schedule.create({ data: schedule() });

        expect(stored).toMatchObject({ confirmedAt: null, confirmedById: null, replacedAt: null });
      });

      it('rejects a second current official of the same school', async () => {
        await testPrisma.schedule.create({ data: official() });

        await expect(testPrisma.schedule.create({ data: official() })).rejects.toThrow(
          /schedules_official_key|Unique constraint/,
        );
      });

      it('keeps the replaced officials next to the current one', async () => {
        const replacedAt = new Date('2026-11-06T09:00:00.000Z');
        await testPrisma.schedule.create({ data: official({ replacedAt }) });
        await testPrisma.schedule.create({ data: official({ replacedAt }) });

        await expect(testPrisma.schedule.create({ data: official() })).resolves.toMatchObject({
          status: 'OFFICIAL',
          replacedAt: null,
        });
        await expect(testPrisma.schedule.count({ where: { status: 'OFFICIAL' } })).resolves.toBe(3);
      });

      it('accepts a current official in each school', async () => {
        await testPrisma.schedule.create({ data: official() });

        await expect(
          testPrisma.schedule.create({ data: official({ schoolId: OTHER_SCHOOL_ID }) }),
        ).resolves.toMatchObject({ schoolId: OTHER_SCHOOL_ID });
      });

      it('has the partial unique index on the school for the current officials', async () => {
        const rows = await testPrisma.$queryRaw<IndexRow[]>`
          SELECT indexdef FROM pg_indexes
          WHERE tablename = 'schedules' AND indexname = 'schedules_official_key'`;

        expect(rows[0]?.indexdef).toContain('UNIQUE');
        expect(rows[0]?.indexdef).toContain('(school_id)');
        expect(rows[0]?.indexdef).toContain('OFFICIAL');
        expect(rows[0]?.indexdef).toContain('replaced_at IS NULL');
      });

      it('rejects a draft with a confirmation by its CHECK', async () => {
        const confirmedAt = new Date('2026-11-05T09:00:00.000Z');
        for (const data of [
          { confirmedAt },
          { confirmedById: USER_ID },
          { replacedAt: confirmedAt },
        ]) {
          await expect(testPrisma.schedule.create({ data: schedule(data) })).rejects.toThrow(
            /schedules_draft_unconfirmed_check/,
          );
        }
      });

      it('rejects an official without who or when it was confirmed by its CHECK', async () => {
        await expect(
          testPrisma.schedule.create({ data: official({ confirmedAt: null }) }),
        ).rejects.toThrow(/schedules_official_confirmed_check/);
        await expect(
          testPrisma.schedule.create({ data: official({ confirmedById: null }) }),
        ).rejects.toThrow(/schedules_official_confirmed_check/);
      });

      it('rejects a replacement before the confirmation by its CHECK', async () => {
        await expect(
          testPrisma.schedule.create({
            data: official({ replacedAt: new Date('2026-11-04T09:00:00.000Z') }),
          }),
        ).rejects.toThrow(/schedules_replaced_after_confirmed_check/);
      });

      it('does not let a user who confirmed a schedule be deleted', async () => {
        await testPrisma.schedule.create({ data: official() });

        await expect(testPrisma.user.delete({ where: { id: USER_ID } })).rejects.toThrow();
      });
    });
  });

  describe('schedule_entries', () => {
    let scheduleId: string;

    beforeEach(async () => {
      scheduleId = (await testPrisma.schedule.create({ data: schedule() })).id;
    });

    it('stores an entry with its hours and no room or role', async () => {
      const stored = await testPrisma.scheduleEntry.create({ data: entry(scheduleId) });

      expect(stored).toMatchObject({
        classId: CLASS_A,
        subjectId: SUBJECT_ID,
        professorId: PROFESSOR_ID,
        dayOfWeek: 1,
        sessionNumber: 1,
        startMinute: 540,
        endMinute: 585,
      });
    });

    it('allows the same professor in two classes at the same time (the solver guarantees it)', async () => {
      await testPrisma.scheduleEntry.create({ data: entry(scheduleId) });

      await expect(
        testPrisma.scheduleEntry.create({ data: entry(scheduleId, { classId: CLASS_B }) }),
      ).resolves.toMatchObject({ classId: CLASS_B });
    });

    it('rejects two entries of the same class on the same day and session', async () => {
      await testPrisma.scheduleEntry.create({ data: entry(scheduleId) });

      await expect(
        testPrisma.scheduleEntry.create({
          data: entry(scheduleId, { subjectId: OTHER_SUBJECT_ID }),
        }),
      ).rejects.toThrow(/Unique constraint|schedule_entries_schedule_id_class_id/);
    });

    it('accepts the same cell in another schedule', async () => {
      await testPrisma.scheduleEntry.create({ data: entry(scheduleId) });
      const other = await testPrisma.schedule.create({ data: official() });

      await expect(
        testPrisma.scheduleEntry.create({ data: entry(other.id) }),
      ).resolves.toMatchObject({ scheduleId: other.id });
    });

    it.each([1, 5])('accepts the day %i', async (dayOfWeek) => {
      await expect(
        testPrisma.scheduleEntry.create({ data: entry(scheduleId, { dayOfWeek }) }),
      ).resolves.toMatchObject({ dayOfWeek });
    });

    it.each([0, 6, -1])('rejects the day %i by its CHECK', async (dayOfWeek) => {
      await expect(
        testPrisma.scheduleEntry.create({ data: entry(scheduleId, { dayOfWeek }) }),
      ).rejects.toThrow(/schedule_entries_day_of_week_check/);
    });

    it.each([0, 9])('rejects the session %i by its CHECK', async (sessionNumber) => {
      await expect(
        testPrisma.scheduleEntry.create({ data: entry(scheduleId, { sessionNumber }) }),
      ).rejects.toThrow(/schedule_entries_session_number_check/);
    });

    it.each([
      ['an end equal to the start', 600, 600],
      ['an end before the start', 600, 540],
    ])('rejects %s by its CHECK', async (_name, startMinute, endMinute) => {
      await expect(
        testPrisma.scheduleEntry.create({ data: entry(scheduleId, { startMinute, endMinute }) }),
      ).rejects.toThrow(/schedule_entries_range_check/);
    });

    it('rejects a start before 00:00 and an end after 24:00 by their CHECKs', async () => {
      await expect(
        testPrisma.scheduleEntry.create({
          data: entry(scheduleId, { startMinute: -1, endMinute: 60 }),
        }),
      ).rejects.toThrow(/schedule_entries_start_minute_check/);
      await expect(
        testPrisma.scheduleEntry.create({
          data: entry(scheduleId, { startMinute: 1000, endMinute: 1441 }),
        }),
      ).rejects.toThrow(/schedule_entries_end_minute_check/);
    });

    it('rejects a class that is not of the course', async () => {
      const otherCourse = '0192f5a0-0000-7000-8000-0000000000d2';
      await testPrisma.course.create({
        data: { id: otherCourse, schoolId: SCHOOL_ID, name: '2º', normalizedName: '2º' },
      });

      await expect(
        testPrisma.scheduleEntry.create({ data: entry(scheduleId, { courseId: otherCourse }) }),
      ).rejects.toThrow(/schedule_entries_class_id_course_id_fkey/);
    });

    describe('the cascades', () => {
      const countOf = () => testPrisma.scheduleEntry.count({ where: { scheduleId } });

      beforeEach(async () => {
        await testPrisma.scheduleEntry.createMany({
          data: [
            entry(scheduleId),
            entry(scheduleId, { sessionNumber: 2, subjectId: OTHER_SUBJECT_ID }),
            entry(scheduleId, { classId: CLASS_B }),
          ],
        });
      });

      it('deletes the entries with their schedule', async () => {
        await testPrisma.schedule.delete({ where: { id: scheduleId } });

        await expect(testPrisma.scheduleEntry.count()).resolves.toBe(0);
      });

      it('deletes the entries of a class with the class and keeps the others', async () => {
        await testPrisma.schoolClass.delete({ where: { id: CLASS_B } });

        await expect(countOf()).resolves.toBe(2);
      });

      it('deletes the entries of a subject with the subject and keeps the others', async () => {
        await testPrisma.subject.delete({ where: { id: OTHER_SUBJECT_ID } });

        await expect(countOf()).resolves.toBe(2);
      });

      it('deletes the entries of a course with the course', async () => {
        await testPrisma.course.delete({ where: { id: COURSE_ID } });

        await expect(countOf()).resolves.toBe(0);
      });

      it('leaves the entries without professor when the professor is deleted', async () => {
        await testPrisma.professor.delete({ where: { id: PROFESSOR_ID } });

        await expect(countOf()).resolves.toBe(3);
        await expect(
          testPrisma.scheduleEntry.count({ where: { scheduleId, professorId: null } }),
        ).resolves.toBe(3);
      });
    });
  });
});
