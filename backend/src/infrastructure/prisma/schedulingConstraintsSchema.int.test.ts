import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const OTHER_COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d2';

let sequence = 0;
function id() {
  sequence += 1;
  return `0192f5a0-0000-7000-8000-${String(5000 + sequence).padStart(12, '0')}`;
}

function constraint(overrides: Record<string, unknown> = {}) {
  return {
    id: id(),
    schoolId: SCHOOL_ID,
    subjectId: SUBJECT_ID,
    courseId: COURSE_ID,
    type: 'MAX_PER_DAY' as const,
    maxPerDay: 2,
    ...overrides,
  };
}

interface ConstraintRow {
  conname: string;
  contype: string;
  def: string;
}

describe('scheduling_constraints schema', () => {
  beforeEach(async () => {
    sequence = 0;
    await testPrisma.school.create({
      data: {
        id: SCHOOL_ID,
        name: 'ceipuno',
        normalizedName: 'ceipuno',
        municipalityCode: '46250',
      },
    });
    for (const [courseId, name] of [
      [COURSE_ID, '1º Primaria'],
      [OTHER_COURSE_ID, '2º Primaria'],
    ] as const) {
      await testPrisma.course.create({
        data: { id: courseId, schoolId: SCHOOL_ID, name, normalizedName: name.toLowerCase() },
      });
    }
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
    await testPrisma.subjectCourse.createMany({
      data: [
        { subjectId: SUBJECT_ID, courseId: COURSE_ID, sessionsPerWeek: 4 },
        { subjectId: SUBJECT_ID, courseId: OTHER_COURSE_ID, sessionsPerWeek: 3 },
      ],
    });
  });

  describe('the constraints in pg_constraint', () => {
    async function constraints(): Promise<ConstraintRow[]> {
      return testPrisma.$queryRaw<ConstraintRow[]>`
        SELECT conname, contype::text AS contype, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'scheduling_constraints'::regclass`;
    }

    it.each([
      'scheduling_constraints_max_per_day_check',
      'scheduling_constraints_block_check',
      'scheduling_constraints_slots_check',
    ])('has the CHECK %s', async (name) => {
      const found = (await constraints()).find((row) => row.conname === name);
      expect(found?.contype).toBe('c');
    });

    it('has the unique index (subject_id, course_id, type)', async () => {
      const [found] = await testPrisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE tablename = 'scheduling_constraints'
          AND indexname = 'scheduling_constraints_subject_id_course_id_type_key'`;
      expect(found?.indexdef).toContain('UNIQUE INDEX');
      expect(found?.indexdef).toContain('(subject_id, course_id, type)');
    });

    it('has the composite foreign key to subject_courses with ON DELETE CASCADE', async () => {
      const found = (await constraints()).find(
        (row) => row.contype === 'f' && row.def.includes('subject_courses'),
      );
      expect(found?.def).toContain(
        'FOREIGN KEY (subject_id, course_id) REFERENCES subject_courses(subject_id, course_id)',
      );
      expect(found?.def).toContain('ON DELETE CASCADE');
    });
  });

  describe('the values it stores', () => {
    it.each([2, 5])('accepts a MAX_PER_DAY of %i', async (maxPerDay) => {
      await expect(
        testPrisma.schedulingConstraint.create({ data: constraint({ maxPerDay }) }),
      ).resolves.toMatchObject({ type: 'MAX_PER_DAY', maxPerDay, blockSize: null });
    });

    it.each([2, 3])('accepts a BLOCK of %i', async (blockSize) => {
      await expect(
        testPrisma.schedulingConstraint.create({
          data: constraint({ type: 'BLOCK', maxPerDay: null, blockSize }),
        }),
      ).resolves.toMatchObject({ type: 'BLOCK', maxPerDay: null, blockSize });
    });

    it.each([1, 6])('rejects a MAX_PER_DAY of %i by its CHECK', async (maxPerDay) => {
      await expect(
        testPrisma.schedulingConstraint.create({ data: constraint({ maxPerDay }) }),
      ).rejects.toThrow(/scheduling_constraints_max_per_day_check/);
    });

    it('rejects a MAX_PER_DAY with a block_size', async () => {
      await expect(
        testPrisma.schedulingConstraint.create({ data: constraint({ blockSize: 2 }) }),
      ).rejects.toThrow(/scheduling_constraints_max_per_day_check/);
    });

    it.each([1, 4])('rejects a BLOCK of %i by its CHECK', async (blockSize) => {
      await expect(
        testPrisma.schedulingConstraint.create({
          data: constraint({ type: 'BLOCK', maxPerDay: null, blockSize }),
        }),
      ).rejects.toThrow(/scheduling_constraints_block_check/);
    });

    it('rejects a BLOCK with a max_per_day', async () => {
      await expect(
        testPrisma.schedulingConstraint.create({
          data: constraint({ type: 'BLOCK', maxPerDay: 2, blockSize: 2 }),
        }),
      ).rejects.toThrow(/scheduling_constraints_block_check/);
    });

    it.each(['FORBIDDEN_SLOTS', 'PREFERRED_SLOTS'] as const)(
      'rejects a value in a %s row',
      async (type) => {
        await expect(
          testPrisma.schedulingConstraint.create({ data: constraint({ type, maxPerDay: 2 }) }),
        ).rejects.toThrow(/scheduling_constraints_slots_check/);
        await expect(
          testPrisma.schedulingConstraint.create({
            data: constraint({ type, maxPerDay: null, blockSize: 2 }),
          }),
        ).rejects.toThrow(/scheduling_constraints_slots_check/);
        await expect(
          testPrisma.schedulingConstraint.create({ data: constraint({ type, maxPerDay: null }) }),
        ).resolves.toMatchObject({ type });
      },
    );

    it('rejects a second row of the same type for the same pair', async () => {
      await testPrisma.schedulingConstraint.create({ data: constraint() });

      await expect(
        testPrisma.schedulingConstraint.create({ data: constraint({ maxPerDay: 3 }) }),
      ).rejects.toThrow(/scheduling_constraints_subject_id_course_id_type_key/);
    });

    it('accepts both types for a pair, and the same type in another course', async () => {
      await testPrisma.schedulingConstraint.create({ data: constraint() });
      await testPrisma.schedulingConstraint.create({
        data: constraint({ type: 'BLOCK', maxPerDay: null, blockSize: 2 }),
      });
      await expect(
        testPrisma.schedulingConstraint.create({ data: constraint({ courseId: OTHER_COURSE_ID }) }),
      ).resolves.toMatchObject({ courseId: OTHER_COURSE_ID });
    });

    it('rejects a rule for a subject that is not taught in the course', async () => {
      await testPrisma.subjectCourse.delete({
        where: { subjectId_courseId: { subjectId: SUBJECT_ID, courseId: OTHER_COURSE_ID } },
      });

      await expect(
        testPrisma.schedulingConstraint.create({ data: constraint({ courseId: OTHER_COURSE_ID }) }),
      ).rejects.toThrow(/scheduling_constraints_subject_id_course_id_fkey/);
    });

    it('stores the dates by default', async () => {
      const stored = await testPrisma.schedulingConstraint.create({ data: constraint() });

      expect(stored.createdAt).toBeInstanceOf(Date);
      expect(stored.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('the cascades', () => {
    beforeEach(async () => {
      await testPrisma.schedulingConstraint.createMany({
        data: [
          constraint(),
          constraint({ type: 'BLOCK', maxPerDay: null, blockSize: 2 }),
          constraint({ courseId: OTHER_COURSE_ID }),
        ],
      });
    });

    it('deletes the rules of a pair with the pair and keeps the others', async () => {
      await testPrisma.subjectCourse.delete({
        where: { subjectId_courseId: { subjectId: SUBJECT_ID, courseId: COURSE_ID } },
      });

      const left = await testPrisma.schedulingConstraint.findMany();
      expect(left.map(({ courseId }) => courseId)).toEqual([OTHER_COURSE_ID]);
    });

    it('deletes the rules of a subject with the subject', async () => {
      await testPrisma.subject.delete({ where: { id: SUBJECT_ID } });

      await expect(testPrisma.schedulingConstraint.count()).resolves.toBe(0);
    });

    it('deletes the rules of a course with the course', async () => {
      await testPrisma.course.delete({ where: { id: COURSE_ID } });

      const left = await testPrisma.schedulingConstraint.findMany();
      expect(left.map(({ courseId }) => courseId)).toEqual([OTHER_COURSE_ID]);
    });

    it('does not let a school be deleted while it has rules', async () => {
      await expect(testPrisma.school.delete({ where: { id: SCHOOL_ID } })).rejects.toThrow();
    });
  });
});
