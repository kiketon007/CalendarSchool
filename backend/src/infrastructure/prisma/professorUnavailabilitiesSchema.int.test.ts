import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';
const OTHER_PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f2';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(9000 + ++sequence).padStart(12, '0')}`;

function interval(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    schoolId: SCHOOL_ID,
    professorId: PROFESSOR_ID,
    dayOfWeek: 1,
    startMinute: 540,
    endMinute: 585,
    ...overrides,
  };
}

interface ConstraintRow {
  conname: string;
  contype: string;
  def: string;
}

describe('professor_unavailabilities schema', () => {
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
      ],
    });
  });

  describe('the constraints in pg_constraint', () => {
    async function constraints(): Promise<ConstraintRow[]> {
      return testPrisma.$queryRaw<ConstraintRow[]>`
        SELECT conname, contype::text AS contype, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'professor_unavailabilities'::regclass`;
    }

    it.each([
      'professor_unavailabilities_day_of_week_check',
      'professor_unavailabilities_start_minute_check',
      'professor_unavailabilities_end_minute_check',
      'professor_unavailabilities_range_check',
    ])('has the CHECK %s', async (name) => {
      const found = (await constraints()).find((row) => row.conname === name);
      expect(found?.contype).toBe('c');
    });

    it('has the foreign key to professors with ON DELETE CASCADE', async () => {
      const found = (await constraints()).find(
        (row) => row.contype === 'f' && row.def.includes('REFERENCES professors'),
      );
      expect(found?.def).toContain('FOREIGN KEY (professor_id) REFERENCES professors(id)');
      expect(found?.def).toContain('ON DELETE CASCADE');
    });

    it('has the foreign key to schools', async () => {
      const found = (await constraints()).find(
        (row) => row.contype === 'f' && row.def.includes('REFERENCES schools'),
      );
      expect(found?.def).toContain('FOREIGN KEY (school_id) REFERENCES schools(id)');
    });
  });

  describe('the values it stores', () => {
    it.each([1, 5])('accepts the day %i', async (dayOfWeek) => {
      await expect(
        testPrisma.professorUnavailability.create({ data: interval({ dayOfWeek }) }),
      ).resolves.toMatchObject({ dayOfWeek });
    });

    it.each([0, 6, -1])('rejects the day %i by its CHECK', async (dayOfWeek) => {
      await expect(
        testPrisma.professorUnavailability.create({ data: interval({ dayOfWeek }) }),
      ).rejects.toThrow(/professor_unavailabilities_day_of_week_check/);
    });

    it('accepts an interval that covers the whole day', async () => {
      await expect(
        testPrisma.professorUnavailability.create({
          data: interval({ startMinute: 0, endMinute: 1439 }),
        }),
      ).resolves.toMatchObject({ startMinute: 0, endMinute: 1439 });
    });

    it('rejects a negative start by its CHECK', async () => {
      await expect(
        testPrisma.professorUnavailability.create({
          data: interval({ startMinute: -1, endMinute: 60 }),
        }),
      ).rejects.toThrow(/professor_unavailabilities_start_minute_check/);
    });

    it('rejects an end after 23:59 by its CHECK', async () => {
      await expect(
        testPrisma.professorUnavailability.create({
          data: interval({ startMinute: 1000, endMinute: 1440 }),
        }),
      ).rejects.toThrow(/professor_unavailabilities_end_minute_check/);
    });

    it.each([
      ['an end equal to the start', 600, 600],
      ['an end before the start', 600, 540],
    ])('rejects %s by its CHECK', async (_name, startMinute, endMinute) => {
      await expect(
        testPrisma.professorUnavailability.create({ data: interval({ startMinute, endMinute }) }),
      ).rejects.toThrow(/professor_unavailabilities_range_check/);
    });

    it('rejects an interval of a professor that does not exist', async () => {
      await expect(
        testPrisma.professorUnavailability.create({
          data: interval({ professorId: '0192f5a0-0000-7000-8000-00000000ffff' }),
        }),
      ).rejects.toThrow(/professor_unavailabilities_professor_id_fkey/);
    });

    it('rejects an interval of a school that does not exist', async () => {
      await expect(
        testPrisma.professorUnavailability.create({
          data: interval({ schoolId: '0192f5a0-0000-7000-8000-00000000ffff' }),
        }),
      ).rejects.toThrow(/professor_unavailabilities_school_id_fkey/);
    });

    it('stores the creation date by default', async () => {
      const stored = await testPrisma.professorUnavailability.create({ data: interval() });

      expect(stored.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('the cascade', () => {
    const countOf = (professorId: string) =>
      testPrisma.professorUnavailability.count({ where: { professorId } });

    beforeEach(async () => {
      await testPrisma.professorUnavailability.createMany({
        data: [
          interval(),
          interval({ dayOfWeek: 2 }),
          interval({ professorId: OTHER_PROFESSOR_ID }),
        ],
      });
    });

    it('deletes the intervals of a professor with the professor and keeps the others', async () => {
      await testPrisma.professor.delete({ where: { id: PROFESSOR_ID } });

      await expect(countOf(PROFESSOR_ID)).resolves.toBe(0);
      await expect(countOf(OTHER_PROFESSOR_ID)).resolves.toBe(1);
    });
  });
});
