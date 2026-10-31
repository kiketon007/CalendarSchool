import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_SESSIONS } from '../../domain/calendar/calendarPeriods.js';
import { testPrisma } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const OTHER_COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d2';
const RULE_ID = '0192f5a0-0000-7000-8000-000000005001';
const OTHER_RULE_ID = '0192f5a0-0000-7000-8000-000000005002';

function slot(overrides: Record<string, unknown> = {}) {
  return { constraintId: RULE_ID, dayOfWeek: 1, sessionNumber: 1, ...overrides };
}

interface ConstraintRow {
  conname: string;
  contype: string;
  def: string;
}

describe('scheduling_constraint_slots schema', () => {
  beforeEach(async () => {
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
        name: 'Religión',
        normalizedName: 'religion',
        type: 'CORE',
        status: 'ACTIVE',
        color: 'purple',
      },
    });
    await testPrisma.subjectCourse.createMany({
      data: [
        { subjectId: SUBJECT_ID, courseId: COURSE_ID, sessionsPerWeek: 2 },
        { subjectId: SUBJECT_ID, courseId: OTHER_COURSE_ID, sessionsPerWeek: 2 },
      ],
    });
    await testPrisma.schedulingConstraint.createMany({
      data: [
        {
          id: RULE_ID,
          schoolId: SCHOOL_ID,
          subjectId: SUBJECT_ID,
          courseId: COURSE_ID,
          type: 'FORBIDDEN_SLOTS',
        },
        {
          id: OTHER_RULE_ID,
          schoolId: SCHOOL_ID,
          subjectId: SUBJECT_ID,
          courseId: OTHER_COURSE_ID,
          type: 'FORBIDDEN_SLOTS',
        },
      ],
    });
  });

  it('uses the same maximum of sessions as the calendars, which the CHECK of the session repeats', () => {
    // Si US-BASE sube el límite de sesiones, hay que cambiar el CHECK con una migración.
    expect(MAX_SESSIONS).toBe(8);
  });

  describe('the constraints in pg_constraint', () => {
    async function constraints(): Promise<ConstraintRow[]> {
      return testPrisma.$queryRaw<ConstraintRow[]>`
        SELECT conname, contype::text AS contype, pg_get_constraintdef(oid) AS def
        FROM pg_constraint
        WHERE conrelid = 'scheduling_constraint_slots'::regclass`;
    }

    it.each([
      'scheduling_constraint_slots_day_of_week_check',
      'scheduling_constraint_slots_session_number_check',
    ])('has the CHECK %s', async (name) => {
      const found = (await constraints()).find((row) => row.conname === name);
      expect(found?.contype).toBe('c');
    });

    it('has the primary key (constraint_id, day_of_week, session_number)', async () => {
      const found = (await constraints()).find((row) => row.contype === 'p');
      expect(found?.def).toBe('PRIMARY KEY (constraint_id, day_of_week, session_number)');
    });

    it('has the foreign key to scheduling_constraints with ON DELETE CASCADE', async () => {
      const found = (await constraints()).find((row) => row.contype === 'f');
      expect(found?.def).toContain(
        'FOREIGN KEY (constraint_id) REFERENCES scheduling_constraints(id)',
      );
      expect(found?.def).toContain('ON DELETE CASCADE');
    });
  });

  describe('the values it stores', () => {
    it.each([1, 5])('accepts the day %i', async (dayOfWeek) => {
      await expect(
        testPrisma.schedulingConstraintSlot.create({ data: slot({ dayOfWeek }) }),
      ).resolves.toMatchObject({ dayOfWeek });
    });

    it.each([1, 8])('accepts the session %i', async (sessionNumber) => {
      await expect(
        testPrisma.schedulingConstraintSlot.create({ data: slot({ sessionNumber }) }),
      ).resolves.toMatchObject({ sessionNumber });
    });

    it.each([0, 6, -1])('rejects the day %i by its CHECK', async (dayOfWeek) => {
      await expect(
        testPrisma.schedulingConstraintSlot.create({ data: slot({ dayOfWeek }) }),
      ).rejects.toThrow(/scheduling_constraint_slots_day_of_week_check/);
    });

    it.each([0, 9, -1])('rejects the session %i by its CHECK', async (sessionNumber) => {
      await expect(
        testPrisma.schedulingConstraintSlot.create({ data: slot({ sessionNumber }) }),
      ).rejects.toThrow(/scheduling_constraint_slots_session_number_check/);
    });

    it('rejects a repeated cell by the primary key', async () => {
      await testPrisma.schedulingConstraintSlot.create({ data: slot() });

      await expect(testPrisma.schedulingConstraintSlot.create({ data: slot() })).rejects.toThrow(
        /scheduling_constraint_slots_pkey/,
      );
    });

    it('accepts the same cell in another rule', async () => {
      await testPrisma.schedulingConstraintSlot.create({ data: slot() });

      await expect(
        testPrisma.schedulingConstraintSlot.create({ data: slot({ constraintId: OTHER_RULE_ID }) }),
      ).resolves.toMatchObject({ constraintId: OTHER_RULE_ID });
    });

    it('rejects a cell of a rule that does not exist', async () => {
      await expect(
        testPrisma.schedulingConstraintSlot.create({
          data: slot({ constraintId: '0192f5a0-0000-7000-8000-00000000ffff' }),
        }),
      ).rejects.toThrow(/scheduling_constraint_slots_constraint_id_fkey/);
    });

    it('stores the creation date by default', async () => {
      const stored = await testPrisma.schedulingConstraintSlot.create({ data: slot() });

      expect(stored.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('the cascades', () => {
    beforeEach(async () => {
      await testPrisma.schedulingConstraintSlot.createMany({
        data: [slot(), slot({ dayOfWeek: 2 }), slot({ constraintId: OTHER_RULE_ID })],
      });
    });

    const slotsOf = (constraintId: string) =>
      testPrisma.schedulingConstraintSlot.count({ where: { constraintId } });

    it('deletes the cells of a rule with the rule and keeps the others', async () => {
      await testPrisma.schedulingConstraint.delete({ where: { id: RULE_ID } });

      await expect(slotsOf(RULE_ID)).resolves.toBe(0);
      await expect(slotsOf(OTHER_RULE_ID)).resolves.toBe(1);
    });

    it('deletes the cells when the subject stops being taught in the course', async () => {
      await testPrisma.subjectCourse.delete({
        where: { subjectId_courseId: { subjectId: SUBJECT_ID, courseId: COURSE_ID } },
      });

      await expect(slotsOf(RULE_ID)).resolves.toBe(0);
      await expect(slotsOf(OTHER_RULE_ID)).resolves.toBe(1);
    });

    it('deletes the cells when the subject is deleted', async () => {
      await testPrisma.subject.delete({ where: { id: SUBJECT_ID } });

      await expect(testPrisma.schedulingConstraintSlot.count()).resolves.toBe(0);
    });

    it('deletes the cells of a course when the course is deleted', async () => {
      await testPrisma.course.delete({ where: { id: COURSE_ID } });

      await expect(slotsOf(RULE_ID)).resolves.toBe(0);
      await expect(slotsOf(OTHER_RULE_ID)).resolves.toBe(1);
    });
  });

  describe('the two rules of slots of the same pair (forbidden and preferred)', () => {
    const PREFERRED_RULE_ID = '0192f5a0-0000-7000-8000-000000005003';

    beforeEach(async () => {
      await testPrisma.schedulingConstraint.create({
        data: {
          id: PREFERRED_RULE_ID,
          schoolId: SCHOOL_ID,
          subjectId: SUBJECT_ID,
          courseId: COURSE_ID,
          type: 'PREFERRED_SLOTS',
        },
      });
      // La misma celda en las dos reglas: la tabla no las confunde, la clave primaria incluye la regla.
      await testPrisma.schedulingConstraintSlot.createMany({
        data: [
          slot(),
          slot({ constraintId: PREFERRED_RULE_ID }),
          slot({ constraintId: OTHER_RULE_ID }),
        ],
      });
    });

    const slotsOf = (constraintId: string) =>
      testPrisma.schedulingConstraintSlot.count({ where: { constraintId } });

    it('stores the same cell once in each rule', async () => {
      await expect(slotsOf(RULE_ID)).resolves.toBe(1);
      await expect(slotsOf(PREFERRED_RULE_ID)).resolves.toBe(1);
    });

    it('deletes the cells of both rules when the subject is deleted', async () => {
      await testPrisma.subject.delete({ where: { id: SUBJECT_ID } });

      await expect(testPrisma.schedulingConstraintSlot.count()).resolves.toBe(0);
    });

    it('deletes the cells of both rules, and only those, when the subject stops being taught in the course', async () => {
      await testPrisma.subjectCourse.delete({
        where: { subjectId_courseId: { subjectId: SUBJECT_ID, courseId: COURSE_ID } },
      });

      await expect(slotsOf(RULE_ID)).resolves.toBe(0);
      await expect(slotsOf(PREFERRED_RULE_ID)).resolves.toBe(0);
      await expect(slotsOf(OTHER_RULE_ID)).resolves.toBe(1);
    });
  });
});
