import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaCourseRepository } from './prismaCourseRepository.js';
import { PrismaCourseWorkloadRepository } from './prismaCourseWorkloadRepository.js';
import { PrismaSubjectRepository } from './prismaSubjectRepository.js';
import { PrismaSubjectSlotsRepository } from './prismaSubjectSlotsRepository.js';

const repository = new PrismaSubjectSlotsRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(8000 + ++sequence).padStart(12, '0')}`;

type PeriodKind = 'SESSION' | 'BREAK';

/** Un calendario cuya jornada es la lista de periodos dada, en orden, de una hora cada uno. */
async function createCalendar(schoolId: string, name: string, kinds: PeriodKind[]) {
  const id = nextId();
  await testPrisma.calendar.create({
    data: {
      id,
      schoolId,
      name,
      normalizedName: name.toLowerCase(),
      periods: {
        create: kinds.map((kind, position) => ({
          id: nextId(),
          position,
          kind,
          startMinute: 540 + position * 60,
          endMinute: 590 + position * 60,
        })),
      },
    },
  });
  return id;
}

async function createCourse(schoolId: string, name: string, calendarId: string | null = null) {
  const id = nextId();
  await testPrisma.course.create({
    data: { id, schoolId, name, normalizedName: name.toLowerCase(), calendarId },
  });
  return id;
}

async function createSubject(schoolId: string, name: string) {
  const id = nextId();
  await testPrisma.subject.create({
    data: {
      id,
      schoolId,
      name,
      normalizedName: name.toLowerCase(),
      type: 'CORE',
      status: 'ACTIVE',
      color: 'purple',
    },
  });
  return id;
}

async function teach(subjectId: string, courseId: string, sessionsPerWeek = 2) {
  await testPrisma.subjectCourse.create({ data: { subjectId, courseId, sessionsPerWeek } });
}

/** Una regla de franjas escrita directamente en la base de datos. */
async function setForbidden(
  subjectId: string,
  courseId: string,
  cells: [number, number][],
  schoolId = SCHOOL_ID,
) {
  await testPrisma.schedulingConstraint.create({
    data: {
      id: nextId(),
      schoolId,
      subjectId,
      courseId,
      type: 'FORBIDDEN_SLOTS',
      slots: { create: cells.map(([dayOfWeek, sessionNumber]) => ({ dayOfWeek, sessionNumber })) },
    },
  });
}

/** La regla de franjas preferidas escrita directamente en la base de datos. */
async function setPreferred(subjectId: string, courseId: string, cells: [number, number][]) {
  await testPrisma.schedulingConstraint.create({
    data: {
      id: nextId(),
      schoolId: SCHOOL_ID,
      subjectId,
      courseId,
      type: 'PREFERRED_SLOTS',
      slots: { create: cells.map(([dayOfWeek, sessionNumber]) => ({ dayOfWeek, sessionNumber })) },
    },
  });
}

const cell = (dayOfWeek: number, sessionNumber: number) => ({ dayOfWeek, sessionNumber });

const storedCells = async (
  courseId: string,
  subjectId: string,
  type: 'FORBIDDEN_SLOTS' | 'PREFERRED_SLOTS' = 'FORBIDDEN_SLOTS',
) =>
  (
    await testPrisma.schedulingConstraintSlot.findMany({
      where: { constraint: { courseId, subjectId, type } },
      orderBy: [{ dayOfWeek: 'asc' }, { sessionNumber: 'asc' }],
    })
  ).map(({ dayOfWeek, sessionNumber }) => cell(dayOfWeek, sessionNumber));

const storedRules = (courseId: string, subjectId: string) =>
  testPrisma.schedulingConstraint.findMany({ where: { courseId, subjectId } });

/** Un curso con un calendario de seis sesiones con el recreo tras la 3ª, y una asignatura que se imparte en él. */
async function setup(
  kinds: PeriodKind[] | null = [
    'SESSION',
    'SESSION',
    'SESSION',
    'BREAK',
    'SESSION',
    'SESSION',
    'SESSION',
  ],
) {
  const calendar = kinds === null ? null : await createCalendar(SCHOOL_ID, 'Jornada', kinds);
  const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
  const religion = await createSubject(SCHOOL_ID, 'Religión');
  await teach(religion, course);
  return { calendar, course, religion };
}

describe('PrismaSubjectSlotsRepository', () => {
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
  });

  describe('find', () => {
    it('returns the course, the subject with its rules, the calendar with its periods and the cells', async () => {
      const { calendar, course, religion } = await setup();
      await testPrisma.schedulingConstraint.create({
        data: {
          id: nextId(),
          schoolId: SCHOOL_ID,
          subjectId: religion,
          courseId: course,
          type: 'BLOCK',
          blockSize: 2,
        },
      });
      await setForbidden(religion, course, [
        [3, 2],
        [1, 1],
      ]);

      const found = await repository.find(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS');

      expect(found?.course).toEqual({ id: course, name: '1º Primaria' });
      expect(found?.subject).toEqual({
        id: religion,
        name: 'Religión',
        code: null,
        color: 'purple',
        sessionsPerWeek: 2,
        maxPerDay: null,
        blockSize: 2,
      });
      expect(found?.calendar).toMatchObject({
        id: calendar,
        name: 'Jornada',
        sessionGroups: [3, 3],
      });
      expect(found?.calendar?.periods.map(({ type }) => type)).toEqual([
        'SESSION',
        'SESSION',
        'SESSION',
        'BREAK',
        'SESSION',
        'SESSION',
        'SESSION',
      ]);
      expect(found?.calendar?.periods[0]).toEqual({
        type: 'SESSION',
        startTime: '09:00',
        endTime: '09:50',
      });
      expect(found?.cells).toEqual([cell(1, 1), cell(3, 2)]);
      expect(found?.forbiddenCells).toEqual(found?.cells);
      expect(found?.outsideCount).toBe(0);
    });

    it('returns the cells inside the calendar and counts the ones that are outside', async () => {
      const { course, religion } = await setup(['SESSION', 'SESSION', 'BREAK', 'SESSION']);
      await setForbidden(religion, course, [
        [1, 3],
        [1, 4],
        [2, 1],
        [5, 8],
      ]);

      const found = await repository.find(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS');

      expect(found?.cells).toEqual([cell(1, 3), cell(2, 1)]);
      expect(found?.outsideCount).toBe(2);
    });

    it('has no calendar and every cell outside when the course has none', async () => {
      const { course, religion } = await setup(null);
      await setForbidden(religion, course, [
        [1, 1],
        [2, 2],
      ]);

      const found = await repository.find(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS');

      expect(found?.calendar).toBeNull();
      expect(found?.cells).toEqual([]);
      expect(found?.outsideCount).toBe(2);
    });

    it('returns empty cells for a subject without a rule', async () => {
      const { course, religion } = await setup();

      const found = await repository.find(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS');

      expect(found?.cells).toEqual([]);
      expect(found?.outsideCount).toBe(0);
    });

    it('returns null for a pair that does not exist, a subject that is not taught in the course, and another school', async () => {
      const { course, religion } = await setup();
      const music = await createSubject(SCHOOL_ID, 'Música');
      const foreignCourse = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const foreignSubject = await createSubject(OTHER_SCHOOL_ID, 'Inglés');
      await teach(foreignSubject, foreignCourse);

      await expect(
        repository.find(SCHOOL_ID, course, music, 'FORBIDDEN_SLOTS'),
      ).resolves.toBeNull();
      await expect(
        repository.find(SCHOOL_ID, course, nextId(), 'FORBIDDEN_SLOTS'),
      ).resolves.toBeNull();
      await expect(
        repository.find(SCHOOL_ID, nextId(), religion, 'FORBIDDEN_SLOTS'),
      ).resolves.toBeNull();
      await expect(
        repository.find(SCHOOL_ID, foreignCourse, foreignSubject, 'FORBIDDEN_SLOTS'),
      ).resolves.toBeNull();
      await expect(
        repository.find(OTHER_SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS'),
      ).resolves.toBeNull();
    });
  });

  describe('replace', () => {
    it('creates the rule with its cells in the school of the identity and answers with them', async () => {
      const { course, religion } = await setup();

      const result = await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [
        cell(2, 1),
        cell(1, 1),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: true, slotCount: 2 });
      if (result.kind !== 'saved') {
        throw new Error('expected saved');
      }
      expect(result.snapshot.cells).toEqual([cell(1, 1), cell(2, 1)]);
      const rules = await storedRules(course, religion);
      expect(rules).toHaveLength(1);
      expect(rules[0]).toMatchObject({
        schoolId: SCHOOL_ID,
        type: 'FORBIDDEN_SLOTS',
        maxPerDay: null,
        blockSize: null,
      });
      await expect(storedCells(course, religion)).resolves.toEqual([cell(1, 1), cell(2, 1)]);
    });

    it('replaces the cells entirely and keeps the same rule', async () => {
      const { course, religion } = await setup();
      await setForbidden(religion, course, [
        [1, 1],
        [1, 2],
        [2, 1],
      ]);
      const [before] = await storedRules(course, religion);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [
        cell(1, 2),
        cell(5, 6),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: true, slotCount: 2 });
      await expect(storedCells(course, religion)).resolves.toEqual([cell(1, 2), cell(5, 6)]);
      const rules = await storedRules(course, religion);
      expect(rules.map(({ id }) => id)).toEqual([before?.id]);
    });

    it('deletes the rule and its cells with an empty list, and says that it changed', async () => {
      const { course, religion } = await setup();
      await setForbidden(religion, course, [[1, 1]]);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', []);

      expect(result).toMatchObject({ kind: 'saved', changed: true, slotCount: 0 });
      await expect(storedRules(course, religion)).resolves.toEqual([]);
      await expect(testPrisma.schedulingConstraintSlot.count()).resolves.toBe(0);
    });

    it('writes nothing with an empty list when there was no rule', async () => {
      const { course, religion } = await setup();

      const result = await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', []);

      expect(result).toMatchObject({ kind: 'saved', changed: false, slotCount: 0 });
      await expect(storedRules(course, religion)).resolves.toEqual([]);
    });

    it('writes nothing when the cells are the stored ones, whatever their order', async () => {
      const { course, religion } = await setup();
      await setForbidden(religion, course, [
        [1, 1],
        [2, 3],
      ]);
      const before = await testPrisma.schedulingConstraintSlot.findMany({
        orderBy: [{ dayOfWeek: 'asc' }],
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      const result = await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [
        cell(2, 3),
        cell(1, 1),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: false, slotCount: 2 });
      const after = await testPrisma.schedulingConstraintSlot.findMany({
        orderBy: [{ dayOfWeek: 'asc' }],
      });
      expect(after).toEqual(before);
    });

    it('removes the cells that were outside the calendar when it saves', async () => {
      const { course, religion } = await setup(['SESSION', 'SESSION']);
      await setForbidden(religion, course, [
        [1, 1],
        [1, 5],
        [2, 6],
      ]);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [
        cell(1, 1),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: true, slotCount: 1 });
      if (result.kind !== 'saved') {
        throw new Error('expected saved');
      }
      expect(result.snapshot.outsideCount).toBe(0);
      await expect(storedCells(course, religion)).resolves.toEqual([cell(1, 1)]);
    });

    it('counts as a change the removal of the cells that were outside, even with the same cells inside', async () => {
      const { course, religion } = await setup(['SESSION', 'SESSION']);
      await setForbidden(religion, course, [
        [1, 1],
        [2, 6],
      ]);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [
        cell(1, 1),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: true });
      await expect(storedCells(course, religion)).resolves.toEqual([cell(1, 1)]);
    });

    it('does not touch the other rules of the pair, nor the cells of another pair', async () => {
      const { course, religion } = await setup();
      const other = await createCourse(SCHOOL_ID, '2º Primaria');
      await teach(religion, other);
      await setForbidden(religion, other, [[3, 3]]);
      await testPrisma.schedulingConstraint.create({
        data: {
          id: nextId(),
          schoolId: SCHOOL_ID,
          subjectId: religion,
          courseId: course,
          type: 'MAX_PER_DAY',
          maxPerDay: 2,
        },
      });

      await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [cell(1, 1)]);
      await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', []);

      const rules = await storedRules(course, religion);
      expect(rules.map(({ type }) => type)).toEqual(['MAX_PER_DAY']);
      await expect(storedCells(other, religion)).resolves.toEqual([cell(3, 3)]);
    });

    it('answers notFound for a subject that is not taught in the course, another school, or a missing id', async () => {
      const { course, religion } = await setup();
      const music = await createSubject(SCHOOL_ID, 'Música');
      const foreignCourse = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');

      for (const [school, courseId, subjectId] of [
        [SCHOOL_ID, course, music],
        [SCHOOL_ID, course, nextId()],
        [SCHOOL_ID, nextId(), religion],
        [SCHOOL_ID, foreignCourse, religion],
        [OTHER_SCHOOL_ID, course, religion],
      ] as const) {
        await expect(
          repository.replace(school, courseId, subjectId, 'FORBIDDEN_SLOTS', [cell(1, 1)]),
        ).resolves.toEqual({ kind: 'notFound' });
      }
      await expect(testPrisma.schedulingConstraint.count()).resolves.toBe(0);
    });

    it('answers noCalendar for a course without a calendar and writes nothing', async () => {
      const { course, religion } = await setup(null);

      await expect(
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [cell(1, 1)]),
      ).resolves.toEqual({
        kind: 'noCalendar',
      });
      await expect(
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', []),
      ).resolves.toEqual({
        kind: 'noCalendar',
      });
      await expect(testPrisma.schedulingConstraint.count()).resolves.toBe(0);
    });

    it('answers outOfCalendar with the positions of the sessions that do not exist and writes nothing', async () => {
      const { course, religion } = await setup(['SESSION', 'SESSION', 'BREAK', 'SESSION']);
      await setForbidden(religion, course, [[1, 1]]);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [
        cell(1, 3),
        cell(2, 4),
        cell(3, 1),
        cell(4, 8),
      ]);

      expect(result).toEqual({ kind: 'outOfCalendar', positions: [1, 3] });
      await expect(storedCells(course, religion)).resolves.toEqual([cell(1, 1)]);
    });

    it('writes nothing when a cell fails halfway: the deletion that came first is undone', async () => {
      const { course, religion } = await setup();
      await setForbidden(religion, course, [
        [1, 1],
        [2, 2],
      ]);
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_slot_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_slot_row BEFORE INSERT ON scheduling_constraint_slots FOR EACH ROW EXECUTE FUNCTION reject_slot_row()',
      );

      try {
        await expect(
          repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [
            cell(3, 3),
            cell(4, 4),
          ]),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe(
          'DROP TRIGGER reject_slot_row ON scheduling_constraint_slots',
        );
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_slot_row()');
      }

      await expect(storedCells(course, religion)).resolves.toEqual([cell(1, 1), cell(2, 2)]);
    });

    it('does not create the rule when the cells fail', async () => {
      const { course, religion } = await setup();
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_slot_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_slot_row BEFORE INSERT ON scheduling_constraint_slots FOR EACH ROW EXECUTE FUNCTION reject_slot_row()',
      );

      try {
        await expect(
          repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [cell(1, 1)]),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe(
          'DROP TRIGGER reject_slot_row ON scheduling_constraint_slots',
        );
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_slot_row()');
      }

      await expect(storedRules(course, religion)).resolves.toEqual([]);
    });
  });
});

describe('PrismaSubjectSlotsRepository with the preferred slots', () => {
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
  });

  describe('find', () => {
    it('returns the preferred cells and, apart, the forbidden ones of the pair', async () => {
      const { course, religion } = await setup();
      await setPreferred(religion, course, [
        [3, 2],
        [1, 1],
      ]);
      await setForbidden(religion, course, [
        [1, 1],
        [5, 6],
      ]);

      const found = await repository.find(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS');

      expect(found?.cells).toEqual([cell(1, 1), cell(3, 2)]);
      expect(found?.forbiddenCells).toEqual([cell(1, 1), cell(5, 6)]);
      expect(found?.outsideCount).toBe(0);
    });

    it('asks for the forbidden cells of the pair when it reads the forbidden slots too', async () => {
      const { course, religion } = await setup();
      await setPreferred(religion, course, [[2, 2]]);
      await setForbidden(religion, course, [[1, 1]]);

      const found = await repository.find(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS');

      expect(found?.cells).toEqual([cell(1, 1)]);
      expect(found?.forbiddenCells).toEqual([cell(1, 1)]);
    });

    it('counts the preferred cells outside the calendar apart from the forbidden ones', async () => {
      const { course, religion } = await setup(['SESSION', 'SESSION', 'BREAK', 'SESSION']);
      await setPreferred(religion, course, [
        [1, 3],
        [1, 4],
        [5, 8],
      ]);
      await setForbidden(religion, course, [
        [2, 1],
        [2, 7],
      ]);

      const found = await repository.find(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS');

      expect(found?.cells).toEqual([cell(1, 3)]);
      expect(found?.outsideCount).toBe(2);
      expect(found?.forbiddenCells).toEqual([cell(2, 1)]);
    });

    it('has no calendar, no cells and no forbidden cells when the course has none', async () => {
      const { course, religion } = await setup(null);
      await setPreferred(religion, course, [[1, 1]]);

      const found = await repository.find(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS');

      expect(found?.calendar).toBeNull();
      expect(found?.cells).toEqual([]);
      expect(found?.forbiddenCells).toEqual([]);
      expect(found?.outsideCount).toBe(1);
    });

    it('returns null for a pair that does not exist', async () => {
      const { course } = await setup();

      await expect(
        repository.find(SCHOOL_ID, course, nextId(), 'PREFERRED_SLOTS'),
      ).resolves.toBeNull();
    });
  });

  describe('replace', () => {
    it('creates the preferred rule with its cells and does not create the forbidden one', async () => {
      const { course, religion } = await setup();

      const result = await repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', [
        cell(2, 1),
        cell(1, 1),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: true, slotCount: 2 });
      const rules = await storedRules(course, religion);
      expect(rules.map(({ type }) => type)).toEqual(['PREFERRED_SLOTS']);
      await expect(storedCells(course, religion, 'PREFERRED_SLOTS')).resolves.toEqual([
        cell(1, 1),
        cell(2, 1),
      ]);
    });

    it('replaces the preferred cells without touching the forbidden ones', async () => {
      const { course, religion } = await setup();
      await setForbidden(religion, course, [[3, 3]]);
      await setPreferred(religion, course, [[1, 1]]);

      await repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', [cell(2, 2)]);

      await expect(storedCells(course, religion, 'PREFERRED_SLOTS')).resolves.toEqual([cell(2, 2)]);
      await expect(storedCells(course, religion, 'FORBIDDEN_SLOTS')).resolves.toEqual([cell(3, 3)]);
    });

    it('saves a preferred cell that is also forbidden, and answers with both', async () => {
      const { course, religion } = await setup();
      await setForbidden(religion, course, [[1, 1]]);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', [
        cell(1, 1),
        cell(2, 1),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: true, slotCount: 2 });
      if (result.kind !== 'saved') {
        throw new Error('expected saved');
      }
      expect(result.snapshot.cells).toEqual([cell(1, 1), cell(2, 1)]);
      expect(result.snapshot.forbiddenCells).toEqual([cell(1, 1)]);
    });

    it('deletes only the preferred rule with an empty list', async () => {
      const { course, religion } = await setup();
      await setForbidden(religion, course, [[3, 3]]);
      await setPreferred(religion, course, [[1, 1]]);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', []);

      expect(result).toMatchObject({ kind: 'saved', changed: true, slotCount: 0 });
      expect((await storedRules(course, religion)).map(({ type }) => type)).toEqual([
        'FORBIDDEN_SLOTS',
      ]);
    });

    it('writes nothing when the cells are the stored ones, whatever their order', async () => {
      const { course, religion } = await setup();
      await setPreferred(religion, course, [
        [1, 1],
        [2, 2],
      ]);
      const before = await storedRules(course, religion);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', [
        cell(2, 2),
        cell(1, 1),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: false, slotCount: 2 });
      await expect(storedRules(course, religion)).resolves.toEqual(before);
    });

    it('removes the preferred cells that were outside the calendar when it saves', async () => {
      const { course, religion } = await setup(['SESSION', 'SESSION']);
      await setPreferred(religion, course, [
        [1, 1],
        [1, 5],
        [2, 6],
      ]);

      const result = await repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', [
        cell(1, 1),
      ]);

      expect(result).toMatchObject({ kind: 'saved', changed: true, slotCount: 1 });
      if (result.kind !== 'saved') {
        throw new Error('expected saved');
      }
      expect(result.snapshot.outsideCount).toBe(0);
      await expect(storedCells(course, religion, 'PREFERRED_SLOTS')).resolves.toEqual([cell(1, 1)]);
    });

    it('answers notFound, noCalendar and outOfCalendar without writing anything', async () => {
      const { course, religion } = await setup(['SESSION', 'SESSION']);
      const bare = await createCourse(SCHOOL_ID, '2º Primaria');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(music, bare);

      await expect(
        repository.replace(SCHOOL_ID, course, nextId(), 'PREFERRED_SLOTS', [cell(1, 1)]),
      ).resolves.toEqual({ kind: 'notFound' });
      await expect(
        repository.replace(SCHOOL_ID, bare, music, 'PREFERRED_SLOTS', [cell(1, 1)]),
      ).resolves.toEqual({ kind: 'noCalendar' });
      await expect(
        repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', [
          cell(1, 1),
          cell(1, 3),
        ]),
      ).resolves.toEqual({ kind: 'outOfCalendar', positions: [1] });
      await expect(testPrisma.schedulingConstraint.count()).resolves.toBe(0);
    });

    it('writes nothing when a cell fails halfway: the deletion that came first is undone', async () => {
      const { course, religion } = await setup();
      await setPreferred(religion, course, [
        [1, 1],
        [2, 2],
      ]);
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_slot_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_slot_row BEFORE INSERT ON scheduling_constraint_slots FOR EACH ROW EXECUTE FUNCTION reject_slot_row()',
      );

      try {
        await expect(
          repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', [
            cell(3, 3),
            cell(4, 4),
          ]),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe(
          'DROP TRIGGER reject_slot_row ON scheduling_constraint_slots',
        );
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_slot_row()');
      }

      await expect(storedCells(course, religion, 'PREFERRED_SLOTS')).resolves.toEqual([
        cell(1, 1),
        cell(2, 2),
      ]);
    });
  });
});

describe('PrismaSubjectSlotsRepository concurrency', () => {
  const subjectRepository = new PrismaSubjectRepository(testPrisma);
  const courseRepository = new PrismaCourseRepository(testPrisma);
  const workloadRepository = new PrismaCourseWorkloadRepository(testPrisma);
  const sixSessions: PeriodKind[] = [
    'SESSION',
    'SESSION',
    'SESSION',
    'SESSION',
    'SESSION',
    'SESSION',
  ];

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
  });

  /** Una asignatura que se imparte en un curso nuevo con calendario de seis sesiones. */
  async function pair(round: number) {
    const calendar = await createCalendar(SCHOOL_ID, `Jornada ${String(round)}`, sixSessions);
    const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`, calendar);
    const religion = await createSubject(SCHOOL_ID, `Religión ${String(round)}`);
    await teach(religion, course);
    return { course, religion };
  }

  const pairCount = (course: string, subject: string) =>
    testPrisma.subjectCourse.count({ where: { courseId: course, subjectId: subject } });

  /** Ninguna celda sin su regla ni regla sin su pareja: las claves ajenas lo garantizan y aquí se comprueba. */
  const orphans = () =>
    testPrisma.$queryRaw<{ n: bigint }[]>`
      SELECT (
        SELECT count(*) FROM scheduling_constraints r
        LEFT JOIN subject_courses p ON p.subject_id = r.subject_id AND p.course_id = r.course_id
        WHERE p.subject_id IS NULL
      ) + (
        SELECT count(*) FROM scheduling_constraint_slots s
        LEFT JOIN scheduling_constraints r ON r.id = s.constraint_id
        WHERE r.id IS NULL
      ) AS n`;

  const editSubject = (
    subjectId: string,
    name: string,
    courses: { courseId: string; sessionsPerWeek: number }[],
  ) =>
    subjectRepository.update(SCHOOL_ID, subjectId, {
      name,
      normalizedName: name.toLowerCase(),
      code: null,
      normalizedCode: null,
      type: 'CORE',
      status: 'ACTIVE',
      description: null,
      color: 'purple',
      courses,
    });

  it('leaves the whole list of one of two simultaneous saves of the same subject, never a mix', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { course, religion } = await pair(round);
      const first = [cell(1, 1), cell(1, 2), cell(1, 3)];
      const second = [cell(2, 4), cell(3, 5)];

      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', first),
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', second),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      const left = await storedCells(course, religion);
      expect([first, second]).toContainEqual(left);
    }
  });

  it('keeps the whole list of each rule when a preferred and a forbidden save of the same subject run together', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { course, religion } = await pair(round);
      const preferred = [cell(1, 1), cell(1, 2), cell(2, 3)];
      const forbidden = [cell(1, 1), cell(4, 4)];

      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', preferred),
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', forbidden),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      await expect(storedCells(course, religion, 'PREFERRED_SLOTS')).resolves.toEqual(preferred);
      await expect(storedCells(course, religion, 'FORBIDDEN_SLOTS')).resolves.toEqual(forbidden);
      await expect(orphans()).resolves.toEqual([{ n: 0n }]);
    }
  });

  it('finishes a preferred save and the removal of the subject from the workload of the course', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { course, religion } = await pair(round);

      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, course, religion, 'PREFERRED_SLOTS', [
          cell(1, 1),
          cell(3, 3),
        ]),
        workloadRepository.applyChanges(SCHOOL_ID, course, [
          { subjectId: religion, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
        ]),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      await expect(orphans()).resolves.toEqual([{ n: 0n }]);
      if ((await pairCount(course, religion)) === 0) {
        await expect(storedCells(course, religion, 'PREFERRED_SLOTS')).resolves.toEqual([]);
      }
    }
  });

  it('finishes a save and the edition of the subject that drops the course', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { course, religion } = await pair(round);

      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [
          cell(1, 1),
          cell(2, 2),
        ]),
        editSubject(religion, `Religión ${String(round)}`, []),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      await expect(orphans()).resolves.toEqual([{ n: 0n }]);
      // O queda la pareja con sus celdas (el guardado fue el último) o ni pareja ni celdas.
      const cells = await storedCells(course, religion);
      expect(
        (await pairCount(course, religion)) === 1
          ? cells.length === 2 || cells.length === 0
          : cells.length === 0,
      ).toBe(true);
    }
  });

  it('finishes a save and the removal of the subject from the workload of the course', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { course, religion } = await pair(round);

      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [cell(1, 1)]),
        workloadRepository.applyChanges(SCHOOL_ID, course, [
          { subjectId: religion, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
        ]),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      await expect(orphans()).resolves.toEqual([{ n: 0n }]);
      if ((await pairCount(course, religion)) === 0) {
        await expect(storedCells(course, religion)).resolves.toEqual([]);
      }
    }
  });

  it('finishes a save and the deletion of the subject', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { course, religion } = await pair(round);

      const [saved, deleted] = await Promise.allSettled([
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [cell(1, 1)]),
        subjectRepository.delete(SCHOOL_ID, religion),
      ]);

      expect(deleted).toEqual({ status: 'fulfilled', value: { assignmentCount: 0 } });
      expect(saved.status).toBe('fulfilled');
      await expect(orphans()).resolves.toEqual([{ n: 0n }]);
      await expect(storedCells(course, religion)).resolves.toEqual([]);
    }
  });

  it('either saves or finds the course deleted when the course is deleted at the same time', async () => {
    for (let round = 0; round < 8; round += 1) {
      const { course, religion } = await pair(round);

      const [saved, deleted] = await Promise.allSettled([
        repository.replace(SCHOOL_ID, course, religion, 'FORBIDDEN_SLOTS', [cell(1, 1)]),
        courseRepository.delete(SCHOOL_ID, course),
      ]);

      expect(deleted.status).toBe('fulfilled');
      expect(saved.status).toBe('fulfilled');
      if (saved.status === 'fulfilled') {
        expect(['saved', 'notFound']).toContain(saved.value.kind);
      }
      await expect(orphans()).resolves.toEqual([{ n: 0n }]);
      await expect(testPrisma.schedulingConstraintSlot.count()).resolves.toBe(0);
    }
  });
});

describe('PrismaSubjectSlotsRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaSubjectSlotsRepository(prisma) };
  }

  it.each([
    [
      'find',
      (repo: PrismaSubjectSlotsRepository) =>
        repo.find(SCHOOL_ID, nextId(), nextId(), 'PREFERRED_SLOTS'),
    ],
    [
      'replace',
      (repo: PrismaSubjectSlotsRepository) =>
        repo.replace(SCHOOL_ID, nextId(), nextId(), 'PREFERRED_SLOTS', []),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository: unreachableRepository } = unreachable();

    await expect(operation(unreachableRepository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
