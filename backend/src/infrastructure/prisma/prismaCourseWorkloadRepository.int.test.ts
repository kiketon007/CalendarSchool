import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaCalendarRepository } from './prismaCalendarRepository.js';
import { PrismaCourseRepository } from './prismaCourseRepository.js';
import { PrismaCourseWorkloadRepository } from './prismaCourseWorkloadRepository.js';
import { PrismaSubjectRepository } from './prismaSubjectRepository.js';

const repository = new PrismaCourseWorkloadRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(7000 + ++sequence).padStart(12, '0')}`;

type PeriodKind = 'SESSION' | 'BREAK';

/** Un calendario cuya jornada es la lista de periodos dada, en orden. */
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

async function createSubject(
  schoolId: string,
  name: string,
  overrides: { status?: 'ACTIVE' | 'INACTIVE'; code?: string | null } = {},
) {
  const id = nextId();
  const code = overrides.code ?? null;
  await testPrisma.subject.create({
    data: {
      id,
      schoolId,
      name,
      normalizedName: name.toLowerCase(),
      code,
      normalizedCode: code === null ? null : code.toLowerCase(),
      type: 'CORE',
      status: overrides.status ?? 'ACTIVE',
      color: 'blue',
    },
  });
  return id;
}

async function teach(subjectId: string, courseId: string, sessionsPerWeek: number) {
  await testPrisma.subjectCourse.create({ data: { subjectId, courseId, sessionsPerWeek } });
}

/** Una regla de reparto escrita directamente en la base de datos. */
async function setRule(
  subjectId: string,
  courseId: string,
  schoolId: string,
  rule: { maxPerDay?: number; blockSize?: number },
) {
  if (rule.maxPerDay !== undefined) {
    await testPrisma.schedulingConstraint.create({
      data: {
        id: nextId(),
        schoolId,
        subjectId,
        courseId,
        type: 'MAX_PER_DAY',
        maxPerDay: rule.maxPerDay,
      },
    });
  }
  if (rule.blockSize !== undefined) {
    await testPrisma.schedulingConstraint.create({
      data: {
        id: nextId(),
        schoolId,
        subjectId,
        courseId,
        type: 'BLOCK',
        blockSize: rule.blockSize,
      },
    });
  }
}

/** Una fila de las reglas de franjas, que esta historia no escribe pero cuenta. */
async function setSlotsRule(
  subjectId: string,
  courseId: string,
  schoolId: string,
  type: 'FORBIDDEN_SLOTS' | 'PREFERRED_SLOTS',
  cells: [number, number][] = [],
) {
  await testPrisma.schedulingConstraint.create({
    data: {
      id: nextId(),
      schoolId,
      subjectId,
      courseId,
      type,
      slots: {
        create: cells.map(([dayOfWeek, sessionNumber]) => ({ dayOfWeek, sessionNumber })),
      },
    },
  });
}

const storedRules = async (courseId: string) =>
  (await testPrisma.schedulingConstraint.findMany({ where: { courseId } }))
    .map(({ subjectId, type, maxPerDay, blockSize }) => ({ subjectId, type, maxPerDay, blockSize }))
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.type.localeCompare(b.type));

const storedRows = async (courseId: string) =>
  (
    await testPrisma.subjectCourse.findMany({
      where: { courseId },
      orderBy: { subjectId: 'asc' },
    })
  ).map(({ subjectId, sessionsPerWeek }) => ({ subjectId, sessionsPerWeek }));

describe('PrismaCourseWorkloadRepository', () => {
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

  describe('findByCourse', () => {
    it('counts only the sessions of the calendar of the course, not its breaks', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Jornada continua', [
        'SESSION',
        'SESSION',
        'BREAK',
        'SESSION',
      ]);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.course).toEqual({ id: course, name: '1º Primaria' });
      expect(snapshot?.calendar).toEqual({
        id: calendar,
        name: 'Jornada continua',
        sessionsPerDay: 3,
        maxConsecutiveSessions: 2,
        sessionGroups: [2, 1],
      });
    });

    it('has no calendar when the course has none', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.calendar).toBeNull();
    });

    it('returns every subject of the school with its sessions in this course or null', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const other = await createCourse(SCHOOL_ID, '2º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés', { code: 'ING' });
      const music = await createSubject(SCHOOL_ID, 'Música');
      const art = await createSubject(SCHOOL_ID, 'Plástica');
      await teach(english, course, 3);
      await teach(english, other, 5);
      await teach(music, other, 2);

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      const bySubject = new Map(snapshot?.subjects.map((subject) => [subject.id, subject]));
      expect(bySubject.size).toBe(3);
      expect(bySubject.get(english)).toEqual({
        id: english,
        name: 'Inglés',
        code: 'ING',
        color: 'blue',
        status: 'ACTIVE',
        sessionsPerWeek: 3,
        maxPerDay: null,
        blockSize: null,
        constraintCount: 0,
        forbiddenSlots: [],
        preferredSlots: [],
        outsideSlotCount: 0,
      });
      expect(bySubject.get(music)?.sessionsPerWeek).toBeNull();
      expect(bySubject.get(art)?.sessionsPerWeek).toBeNull();
      expect(bySubject.get(art)?.code).toBeNull();
    });

    it('includes the inactive subjects with their status', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const latin = await createSubject(SCHOOL_ID, 'Latín', { status: 'INACTIVE' });
      await teach(latin, course, 2);

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.subjects).toEqual([
        expect.objectContaining({ id: latin, status: 'INACTIVE', sessionsPerWeek: 2 }),
      ]);
    });

    it('never returns the subjects of another school', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      await createSubject(OTHER_SCHOOL_ID, 'Inglés ajeno');

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.subjects).toEqual([]);
    });

    it('returns null for a course of another school or one that does not exist', async () => {
      const foreign = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');

      await expect(repository.findByCourse(SCHOOL_ID, foreign)).resolves.toBeNull();
      await expect(repository.findByCourse(SCHOOL_ID, nextId())).resolves.toBeNull();
    });
  });

  describe('applyChanges', () => {
    it('creates, updates and deletes rows and answers with the counts and the load as it ended', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Corta', ['SESSION', 'SESSION']);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const language = await createSubject(SCHOOL_ID, 'Lengua');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 3);
      await teach(language, course, 5);

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 4, maxPerDay: null, blockSize: null },
        { subjectId: music, sessionsPerWeek: 2, maxPerDay: null, blockSize: null },
        { subjectId: language, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toMatchObject({ kind: 'applied', added: 1, removed: 1, changed: 1 });
      if (result.kind !== 'applied') {
        throw new Error('expected applied');
      }
      expect(new Map(result.workload.subjects.map((s) => [s.id, s.sessionsPerWeek]))).toEqual(
        new Map([
          [english, 4],
          [language, null],
          [music, 2],
        ]),
      );
      expect(result.workload.calendar?.sessionsPerDay).toBe(2);
      await expect(storedRows(course)).resolves.toEqual(
        [
          { subjectId: english, sessionsPerWeek: 4 },
          { subjectId: music, sessionsPerWeek: 2 },
        ].sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
      );
    });

    it('does not touch the rows that are not in the changes, and keeps created_at when it updates', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const language = await createSubject(SCHOOL_ID, 'Lengua');
      await teach(english, course, 3);
      await teach(language, course, 5);
      const before = await testPrisma.subjectCourse.findMany({ where: { courseId: course } });
      const row = (rows: typeof before, subjectId: string) =>
        rows.find((candidate) => candidate.subjectId === subjectId)!;
      await new Promise((resolve) => setTimeout(resolve, 20));

      await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 4, maxPerDay: null, blockSize: null },
      ]);

      const after = await testPrisma.subjectCourse.findMany({ where: { courseId: course } });
      expect(row(after, language)).toEqual(row(before, language));
      expect(row(after, english).createdAt).toEqual(row(before, english).createdAt);
      expect(row(after, english).sessionsPerWeek).toBe(4);
      expect(row(after, english).updatedAt.getTime()).toBeGreaterThan(
        row(before, english).updatedAt.getTime(),
      );
    });

    it('does not count as a change the same sessions or quitting a subject that was not taught', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 3);

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
        { subjectId: music, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toMatchObject({ kind: 'applied', added: 0, removed: 0, changed: 0 });
      await expect(storedRows(course)).resolves.toEqual([
        { subjectId: english, sessionsPerWeek: 3 },
      ]);
    });

    it('leaves a subject without courses when its last course is removed from here', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const french = await createSubject(SCHOOL_ID, 'Francés');
      await teach(french, course, 2);

      await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: french, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
      ]);

      await expect(testPrisma.subject.count({ where: { id: french } })).resolves.toBe(1);
      await expect(testPrisma.subjectCourse.count()).resolves.toBe(0);
    });

    it('saves a load that does not fit the calendar', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Una sesión', ['SESSION']);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const language = await createSubject(SCHOOL_ID, 'Lengua');

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 5, maxPerDay: null, blockSize: null },
        { subjectId: language, sessionsPerWeek: 5, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toMatchObject({ kind: 'applied', added: 2 });
      await expect(storedRows(course)).resolves.toHaveLength(2);
    });

    it('changes the inactive subjects too', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const latin = await createSubject(SCHOOL_ID, 'Latín', { status: 'INACTIVE' });

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: latin, sessionsPerWeek: 2, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toMatchObject({ kind: 'applied', added: 1 });
    });

    it('reports the position of each subject that is not in the school and writes nothing', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const foreign = await createSubject(OTHER_SCHOOL_ID, 'Ajena');

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
        { subjectId: foreign, sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
        { subjectId: nextId(), sessionsPerWeek: null, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toEqual({ kind: 'subjectsNotFound', positions: [1, 2] });
      await expect(storedRows(course)).resolves.toEqual([]);
    });

    it('answers courseNotFound for a course of another school or one that does not exist', async () => {
      const foreign = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');

      await expect(
        repository.applyChanges(SCHOOL_ID, foreign, [
          { subjectId: english, sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
        ]),
      ).resolves.toEqual({ kind: 'courseNotFound' });
      await expect(
        repository.applyChanges(SCHOOL_ID, nextId(), [
          { subjectId: english, sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
        ]),
      ).resolves.toEqual({ kind: 'courseNotFound' });
      await expect(testPrisma.subjectCourse.count()).resolves.toBe(0);
    });

    it('writes nothing when a row fails halfway: the deletion that came first is undone', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 3);
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_workload_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_workload_row BEFORE INSERT ON subject_courses FOR EACH ROW EXECUTE FUNCTION reject_workload_row()',
      );

      try {
        await expect(
          repository.applyChanges(SCHOOL_ID, course, [
            { subjectId: english, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
            { subjectId: music, sessionsPerWeek: 2, maxPerDay: null, blockSize: null },
          ]),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_workload_row ON subject_courses');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_workload_row()');
      }

      await expect(storedRows(course)).resolves.toEqual([
        { subjectId: english, sessionsPerWeek: 3 },
      ]);
    });
  });
});

describe('PrismaCourseWorkloadRepository rules', () => {
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

  describe('findByCourse', () => {
    it('returns the maximum, the block and the number of rules of each subject in this course', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const other = await createCourse(SCHOOL_ID, '2º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const music = await createSubject(SCHOOL_ID, 'Música');
      const art = await createSubject(SCHOOL_ID, 'Plástica');
      await teach(english, course, 4);
      await teach(english, other, 4);
      await teach(music, course, 2);
      await setRule(english, course, SCHOOL_ID, { maxPerDay: 2, blockSize: 2 });
      await setRule(english, other, SCHOOL_ID, { maxPerDay: 3 });
      await setRule(music, course, SCHOOL_ID, { blockSize: 2 });

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      const rules = new Map(
        snapshot?.subjects.map(({ id, maxPerDay, blockSize, constraintCount }) => [
          id,
          { maxPerDay, blockSize, constraintCount },
        ]),
      );
      expect(rules.get(english)).toEqual({ maxPerDay: 2, blockSize: 2, constraintCount: 2 });
      expect(rules.get(music)).toEqual({ maxPerDay: null, blockSize: 2, constraintCount: 1 });
      expect(rules.get(art)).toEqual({ maxPerDay: null, blockSize: null, constraintCount: 0 });
    });

    it('counts every kind of rule in constraintCount, including the ones of the slots', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 4);
      await setSlotsRule(english, course, SCHOOL_ID, 'FORBIDDEN_SLOTS');
      await setRule(english, course, SCHOOL_ID, { maxPerDay: 2 });

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.subjects[0]).toMatchObject({
        maxPerDay: 2,
        blockSize: null,
        constraintCount: 2,
      });
    });

    it.each([
      ['no breaks', ['SESSION', 'SESSION', 'SESSION'], [3]],
      ['a break at the start', ['BREAK', 'SESSION', 'SESSION', 'SESSION'], [3]],
      ['the break after the first session', ['SESSION', 'BREAK', 'SESSION', 'SESSION'], [1, 2]],
      ['a break at the end', ['SESSION', 'SESSION', 'BREAK'], [2]],
      ['several consecutive breaks', ['SESSION', 'BREAK', 'BREAK', 'SESSION'], [1, 1]],
      ['two breaks', ['SESSION', 'SESSION', 'BREAK', 'SESSION', 'BREAK', 'SESSION'], [2, 1, 1]],
    ] as const)(
      'gives the groups of sessions between breaks with %s',
      async (_label, kinds, groups) => {
        const calendar = await createCalendar(SCHOOL_ID, 'Jornada', [...kinds]);
        const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);

        const snapshot = await repository.findByCourse(SCHOOL_ID, course);

        expect(snapshot?.calendar?.sessionGroups).toEqual(groups);
        expect(snapshot?.calendar?.sessionGroups.reduce((total, size) => total + size, 0)).toBe(
          snapshot?.calendar?.sessionsPerDay,
        );
      },
    );

    describe('the forbidden slots', () => {
      async function setup(kinds: ('SESSION' | 'BREAK')[] | null) {
        const calendar = kinds === null ? null : await createCalendar(SCHOOL_ID, 'Jornada', kinds);
        const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
        const religion = await createSubject(SCHOOL_ID, 'Religión');
        const english = await createSubject(SCHOOL_ID, 'Inglés');
        await teach(religion, course, 2);
        await teach(english, course, 3);
        return { course, religion, english };
      }
      const subjectOf = async (course: string, id: string) =>
        (await repository.findByCourse(SCHOOL_ID, course))?.subjects.find((s) => s.id === id);

      it('returns the cells inside the calendar by day and session, and counts the ones outside', async () => {
        const { course, religion } = await setup(['SESSION', 'SESSION', 'BREAK', 'SESSION']);
        await setSlotsRule(religion, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', [
          [3, 2],
          [1, 3],
          [1, 1],
          [2, 4],
          [5, 8],
        ]);

        const found = await subjectOf(course, religion);

        expect(found?.forbiddenSlots).toEqual([
          { dayOfWeek: 1, sessionNumber: 1 },
          { dayOfWeek: 1, sessionNumber: 3 },
          { dayOfWeek: 3, sessionNumber: 2 },
        ]);
        expect(found?.outsideSlotCount).toBe(2);
        expect(found?.constraintCount).toBe(1);
      });

      it('has none for a subject without a rule of slots, or only with the rule of the preferred ones', async () => {
        const { course, religion, english } = await setup(['SESSION', 'SESSION']);
        await setSlotsRule(english, course, SCHOOL_ID, 'PREFERRED_SLOTS', [[1, 1]]);

        for (const id of [religion, english]) {
          const found = await subjectOf(course, id);
          expect(found?.forbiddenSlots).toEqual([]);
          expect(found?.outsideSlotCount).toBe(0);
        }
      });

      it('returns no cells and counts every one as outside when the course has no calendar', async () => {
        const { course, religion } = await setup(null);
        await setSlotsRule(religion, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', [
          [1, 1],
          [2, 2],
          [3, 3],
        ]);

        const found = await subjectOf(course, religion);

        expect(found?.forbiddenSlots).toEqual([]);
        expect(found?.outsideSlotCount).toBe(3);
      });

      it('does not mix the cells of another course or of another subject', async () => {
        const { course, religion, english } = await setup(['SESSION', 'SESSION']);
        const other = await createCourse(SCHOOL_ID, '2º Primaria');
        await teach(religion, other, 2);
        await setSlotsRule(religion, other, SCHOOL_ID, 'FORBIDDEN_SLOTS', [[1, 1]]);
        await setSlotsRule(english, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', [[2, 2]]);

        expect((await subjectOf(course, religion))?.forbiddenSlots).toEqual([]);
        expect((await subjectOf(course, english))?.forbiddenSlots).toEqual([
          { dayOfWeek: 2, sessionNumber: 2 },
        ]);
      });
    });

    describe('the preferred slots', () => {
      async function setup(kinds: ('SESSION' | 'BREAK')[] | null) {
        const calendar = kinds === null ? null : await createCalendar(SCHOOL_ID, 'Jornada', kinds);
        const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
        const maths = await createSubject(SCHOOL_ID, 'Matemáticas');
        const english = await createSubject(SCHOOL_ID, 'Inglés');
        await teach(maths, course, 4);
        await teach(english, course, 3);
        return { course, maths, english };
      }
      const subjectOf = async (course: string, id: string) =>
        (await repository.findByCourse(SCHOOL_ID, course))?.subjects.find((s) => s.id === id);

      it('returns the preferred cells inside the calendar by day and session, apart from the forbidden ones', async () => {
        const { course, maths } = await setup(['SESSION', 'SESSION', 'BREAK', 'SESSION']);
        await setSlotsRule(maths, course, SCHOOL_ID, 'PREFERRED_SLOTS', [
          [3, 2],
          [1, 3],
          [1, 1],
        ]);
        await setSlotsRule(maths, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', [[2, 1]]);

        const found = await subjectOf(course, maths);

        expect(found?.preferredSlots).toEqual([
          { dayOfWeek: 1, sessionNumber: 1 },
          { dayOfWeek: 1, sessionNumber: 3 },
          { dayOfWeek: 3, sessionNumber: 2 },
        ]);
        expect(found?.forbiddenSlots).toEqual([{ dayOfWeek: 2, sessionNumber: 1 }]);
        expect(found?.constraintCount).toBe(2);
        expect(found?.outsideSlotCount).toBe(0);
      });

      it('adds the cells outside the calendar of the two rules of slots', async () => {
        const { course, maths } = await setup(['SESSION', 'SESSION']);
        await setSlotsRule(maths, course, SCHOOL_ID, 'PREFERRED_SLOTS', [
          [1, 1],
          [1, 3],
          [2, 4],
        ]);
        await setSlotsRule(maths, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', [
          [3, 1],
          [3, 6],
        ]);

        const found = await subjectOf(course, maths);

        expect(found?.preferredSlots).toEqual([{ dayOfWeek: 1, sessionNumber: 1 }]);
        expect(found?.forbiddenSlots).toEqual([{ dayOfWeek: 3, sessionNumber: 1 }]);
        expect(found?.outsideSlotCount).toBe(3);
      });

      it('has none for a subject without the rule, and does not mix other courses or subjects', async () => {
        const { course, maths, english } = await setup(['SESSION', 'SESSION']);
        const other = await createCourse(SCHOOL_ID, '2º Primaria');
        await teach(maths, other, 2);
        await setSlotsRule(maths, other, SCHOOL_ID, 'PREFERRED_SLOTS', [[1, 1]]);
        await setSlotsRule(english, course, SCHOOL_ID, 'PREFERRED_SLOTS', [[2, 2]]);

        expect((await subjectOf(course, maths))?.preferredSlots).toEqual([]);
        expect((await subjectOf(course, english))?.preferredSlots).toEqual([
          { dayOfWeek: 2, sessionNumber: 2 },
        ]);
      });

      it('returns no cells and counts every one as outside when the course has no calendar', async () => {
        const { course, maths } = await setup(null);
        await setSlotsRule(maths, course, SCHOOL_ID, 'PREFERRED_SLOTS', [
          [1, 1],
          [2, 2],
        ]);

        const found = await subjectOf(course, maths);

        expect(found?.preferredSlots).toEqual([]);
        expect(found?.outsideSlotCount).toBe(2);
      });
    });

    it.each([
      ['no breaks', ['SESSION', 'SESSION', 'SESSION'], 3, 3],
      ['a break at the start', ['BREAK', 'SESSION', 'SESSION', 'SESSION'], 3, 3],
      ['a break in the middle', ['SESSION', 'BREAK', 'SESSION', 'SESSION'], 3, 2],
      ['a break at the end', ['SESSION', 'SESSION', 'BREAK'], 2, 2],
      ['several consecutive breaks', ['SESSION', 'BREAK', 'BREAK', 'SESSION'], 2, 1],
      [
        'two stretches, the longest is the first',
        ['SESSION', 'SESSION', 'SESSION', 'BREAK', 'SESSION'],
        4,
        3,
      ],
    ] as const)(
      'gives the longest stretch of sessions without a break with %s',
      async (_label, kinds, sessionsPerDay, maxConsecutiveSessions) => {
        const calendar = await createCalendar(SCHOOL_ID, 'Jornada', [...kinds]);
        const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);

        const snapshot = await repository.findByCourse(SCHOOL_ID, course);

        expect(snapshot?.calendar).toMatchObject({ sessionsPerDay, maxConsecutiveSessions });
      },
    );
  });

  describe('applyChanges', () => {
    it('creates, changes and deletes each rule and counts them', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const music = await createSubject(SCHOOL_ID, 'Música');
      const art = await createSubject(SCHOOL_ID, 'Plástica');
      await teach(english, course, 4);
      await teach(music, course, 2);
      await teach(art, course, 3);
      await setRule(english, course, SCHOOL_ID, { maxPerDay: 2, blockSize: 2 });
      await setRule(music, course, SCHOOL_ID, { blockSize: 2 });

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        // Cambia el máximo y borra el bloque.
        { subjectId: english, sessionsPerWeek: 4, maxPerDay: 3, blockSize: null },
        // Crea el máximo y conserva el bloque.
        { subjectId: music, sessionsPerWeek: 2, maxPerDay: 2, blockSize: 2 },
        // Crea las dos.
        { subjectId: art, sessionsPerWeek: 3, maxPerDay: 2, blockSize: 3 },
      ]);

      expect(result).toMatchObject({
        kind: 'applied',
        added: 0,
        removed: 0,
        changed: 0,
        constraintsSet: 4,
        constraintsRemoved: 1,
      });
      const order = (a: { subjectId: string; type: string }, b: typeof a) =>
        a.subjectId.localeCompare(b.subjectId) || a.type.localeCompare(b.type);
      await expect(storedRules(course)).resolves.toEqual(
        [
          { subjectId: english, type: 'MAX_PER_DAY', maxPerDay: 3, blockSize: null },
          { subjectId: music, type: 'MAX_PER_DAY', maxPerDay: 2, blockSize: null },
          { subjectId: music, type: 'BLOCK', maxPerDay: null, blockSize: 2 },
          { subjectId: art, type: 'MAX_PER_DAY', maxPerDay: 2, blockSize: null },
          { subjectId: art, type: 'BLOCK', maxPerDay: null, blockSize: 3 },
        ].sort(order),
      );
      if (result.kind !== 'applied') {
        throw new Error('expected applied');
      }
      expect(result.workload.subjects.find((s) => s.id === art)).toMatchObject({
        maxPerDay: 2,
        blockSize: 3,
        constraintCount: 2,
      });
    });

    it('creates the rules of a pair that is new', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 4, maxPerDay: 2, blockSize: 2 },
      ]);

      expect(result).toMatchObject({ added: 1, constraintsSet: 2, constraintsRemoved: 0 });
      await expect(storedRules(course)).resolves.toHaveLength(2);
    });

    it('saves the rules in the school of the identity', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');

      await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 4, maxPerDay: 2, blockSize: null },
      ]);

      const stored = await testPrisma.schedulingConstraint.findMany();
      expect(stored.map(({ schoolId }) => schoolId)).toEqual([SCHOOL_ID]);
    });

    it('deletes the rules of a subject that stops being taught and counts all of them', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const other = await createCourse(SCHOOL_ID, '2º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 4);
      await teach(english, other, 4);
      await setRule(english, course, SCHOOL_ID, { maxPerDay: 2, blockSize: 2 });
      await setSlotsRule(english, course, SCHOOL_ID, 'PREFERRED_SLOTS');
      await setRule(english, other, SCHOOL_ID, { maxPerDay: 3 });

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toMatchObject({ removed: 1, constraintsSet: 0, constraintsRemoved: 3 });
      await expect(storedRules(course)).resolves.toEqual([]);
      await expect(storedRules(other)).resolves.toHaveLength(1);
    });

    it('counts the rule of forbidden slots among the ones that fall when the subject stops being taught, and deletes its cells', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const religion = await createSubject(SCHOOL_ID, 'Religión');
      await teach(religion, course, 2);
      await setSlotsRule(religion, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', [
        [1, 1],
        [2, 1],
      ]);

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: religion, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toMatchObject({ removed: 1, constraintsSet: 0, constraintsRemoved: 1 });
      await expect(testPrisma.schedulingConstraintSlot.count()).resolves.toBe(0);
    });

    it('counts both rules of slots among the ones that fall when the subject stops being taught, and deletes their cells', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const religion = await createSubject(SCHOOL_ID, 'Religión');
      await teach(religion, course, 2);
      await setSlotsRule(religion, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', [[1, 1]]);
      await setSlotsRule(religion, course, SCHOOL_ID, 'PREFERRED_SLOTS', [
        [1, 1],
        [2, 1],
      ]);

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: religion, sessionsPerWeek: null, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toMatchObject({ removed: 1, constraintsSet: 0, constraintsRemoved: 2 });
      await expect(testPrisma.schedulingConstraintSlot.count()).resolves.toBe(0);
    });

    it('does not touch the cells when it changes the sessions or the rules of the subject', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const religion = await createSubject(SCHOOL_ID, 'Religión');
      await teach(religion, course, 2);
      await setSlotsRule(religion, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', [[1, 1]]);

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: religion, sessionsPerWeek: 3, maxPerDay: 2, blockSize: null },
      ]);

      expect(result).toMatchObject({ changed: 1, constraintsSet: 1, constraintsRemoved: 0 });
      await expect(testPrisma.schedulingConstraintSlot.count()).resolves.toBe(1);
    });

    it('changes the sessions and the rules of a pair together', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      await setRule(english, course, SCHOOL_ID, { blockSize: 2 });

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 5, maxPerDay: 2, blockSize: 2 },
      ]);

      expect(result).toMatchObject({ changed: 1, constraintsSet: 1, constraintsRemoved: 0 });
      await expect(storedRows(course)).resolves.toEqual([
        { subjectId: english, sessionsPerWeek: 5 },
      ]);
      await expect(storedRules(course)).resolves.toHaveLength(2);
    });

    it('does not write the rules that do not change and counts none', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 4);
      await setRule(english, course, SCHOOL_ID, { maxPerDay: 2, blockSize: 2 });
      const before = await testPrisma.schedulingConstraint.findMany({ orderBy: { type: 'asc' } });
      await new Promise((resolve) => setTimeout(resolve, 20));

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 4, maxPerDay: 2, blockSize: 2 },
      ]);

      expect(result).toMatchObject({ constraintsSet: 0, constraintsRemoved: 0 });
      const after = await testPrisma.schedulingConstraint.findMany({ orderBy: { type: 'asc' } });
      expect(after).toEqual(before);
    });

    it('does not touch the rules of the subjects that are not in the changes', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 4);
      await teach(music, course, 2);
      await setRule(music, course, SCHOOL_ID, { blockSize: 2 });

      await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 5, maxPerDay: 2, blockSize: null },
      ]);

      const rules = await storedRules(course);
      expect(rules.filter(({ subjectId }) => subjectId === music)).toHaveLength(1);
    });

    it('writes no rule when a subject is not found', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 4, maxPerDay: 2, blockSize: null },
        { subjectId: nextId(), sessionsPerWeek: 3, maxPerDay: null, blockSize: null },
      ]);

      expect(result).toEqual({ kind: 'subjectsNotFound', positions: [1] });
      await expect(storedRules(course)).resolves.toEqual([]);
    });

    it('writes nothing when a rule fails halfway: the sessions and the other rules are undone', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      await setRule(english, course, SCHOOL_ID, { blockSize: 2 });
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_rule_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_rule_row BEFORE INSERT ON scheduling_constraints FOR EACH ROW EXECUTE FUNCTION reject_rule_row()',
      );

      try {
        await expect(
          repository.applyChanges(SCHOOL_ID, course, [
            { subjectId: english, sessionsPerWeek: 5, maxPerDay: 2, blockSize: null },
          ]),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe(
          'DROP TRIGGER reject_rule_row ON scheduling_constraints',
        );
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_rule_row()');
      }

      await expect(storedRows(course)).resolves.toEqual([
        { subjectId: english, sessionsPerWeek: 3 },
      ]);
      await expect(storedRules(course)).resolves.toEqual([
        { subjectId: english, type: 'BLOCK', maxPerDay: null, blockSize: 2 },
      ]);
    });
  });
});

describe('PrismaCourseWorkloadRepository concurrency', () => {
  const subjectRepository = new PrismaSubjectRepository(testPrisma);
  const courseRepository = new PrismaCourseRepository(testPrisma);
  const calendarRepository = new PrismaCalendarRepository(testPrisma);

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

  /** Edita la asignatura dejándola como era salvo por los cursos. */
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
      color: 'blue',
      courses,
    });

  it('keeps both changes when two requests change different subjects of the same course', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      const language = await createSubject(SCHOOL_ID, `Lengua ${String(round)}`);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: english, sessionsPerWeek: 2, maxPerDay: null, blockSize: null },
        ]),
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: language, sessionsPerWeek: 4, maxPerDay: null, blockSize: null },
        ]),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      await expect(storedRows(course)).resolves.toEqual(
        [
          { subjectId: english, sessionsPerWeek: 2 },
          { subjectId: language, sessionsPerWeek: 4 },
        ].sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
      );
    }
  });

  it('leaves the value of one of the two requests that change the same subject, never an error', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: english, sessionsPerWeek: 2, maxPerDay: null, blockSize: null },
        ]),
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: english, sessionsPerWeek: 4, maxPerDay: null, blockSize: null },
        ]),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      const rows = await storedRows(course);
      expect(rows).toHaveLength(1);
      expect([2, 4]).toContain(rows[0]?.sessionsPerWeek);
    }
  });

  it('finishes a change of the load and the edition of the same subject that drops the course', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      await teach(english, course, 3);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: english, sessionsPerWeek: 5, maxPerDay: null, blockSize: null },
        ]),
        editSubject(english, `Inglés ${String(round)}`, []),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      // Gana el último en confirmarse: la fila con las sesiones de la carga o ninguna fila, nunca otra cosa.
      const rows = await storedRows(course);
      expect(rows.length === 0 || rows[0]?.sessionsPerWeek === 5).toBe(true);
    }
  });

  it('finishes a change of the load and the edition of the same subject that changes its sessions', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      await teach(english, course, 3);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: english, sessionsPerWeek: 4, maxPerDay: null, blockSize: null },
        ]),
        editSubject(english, `Inglés ${String(round)}`, [{ courseId: course, sessionsPerWeek: 2 }]),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      const rows = await storedRows(course);
      expect(rows).toHaveLength(1);
      expect([4, 2]).toContain(rows[0]?.sessionsPerWeek);
    }
  });

  it('either applies a change or finds the course deleted when the course is deleted at the same time', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      await teach(english, course, 3);

      const [applied, deleted] = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: english, sessionsPerWeek: 5, maxPerDay: null, blockSize: null },
        ]),
        courseRepository.delete(SCHOOL_ID, course),
      ]);

      expect(deleted.status).toBe('fulfilled');
      expect(applied.status).toBe('fulfilled');
      if (applied.status === 'fulfilled') {
        expect(['applied', 'courseNotFound']).toContain(applied.value.kind);
      }
      // Si el cambio confirmó antes del borrado, la cascada se llevó la fila: nunca queda una colgada.
      await expect(testPrisma.course.count({ where: { id: course } })).resolves.toBe(0);
      await expect(testPrisma.subjectCourse.count({ where: { courseId: course } })).resolves.toBe(
        0,
      );
    }
  });

  it('either applies a change or finds the subject deleted when the subject is deleted at the same time', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      await teach(english, course, 3);

      const [applied, deleted] = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: english, sessionsPerWeek: 5, maxPerDay: null, blockSize: null },
        ]),
        subjectRepository.delete(SCHOOL_ID, english),
      ]);

      expect(deleted).toEqual({ status: 'fulfilled', value: true });
      expect(applied.status).toBe('fulfilled');
      if (applied.status === 'fulfilled') {
        expect(['applied', 'subjectsNotFound']).toContain(applied.value.kind);
      }
      await expect(testPrisma.subject.count({ where: { id: english } })).resolves.toBe(0);
      await expect(testPrisma.subjectCourse.count({ where: { courseId: course } })).resolves.toBe(
        0,
      );
    }
  });

  describe('with rules', () => {
    /** Ninguna regla puede quedar sin la pareja de su asignatura y su curso. */
    const orphanRules = () =>
      testPrisma.$queryRaw<{ id: string }[]>`
        SELECT r.id FROM scheduling_constraints r
        LEFT JOIN subject_courses p ON p.subject_id = r.subject_id AND p.course_id = r.course_id
        WHERE p.subject_id IS NULL`;

    const withRules = { maxPerDay: 2, blockSize: 2 } as const;

    it('finishes a change with rules and the edition of the same subject that drops the course', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
        await teach(english, course, 3);

        const results = await Promise.allSettled([
          repository.applyChanges(SCHOOL_ID, course, [
            { subjectId: english, sessionsPerWeek: 4, ...withRules },
          ]),
          editSubject(english, `Inglés ${String(round)}`, []),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        await expect(orphanRules()).resolves.toEqual([]);
        // O queda la pareja con sus dos reglas, o no queda ni pareja ni reglas.
        const rules = await testPrisma.schedulingConstraint.count({ where: { courseId: course } });
        const rows = await testPrisma.subjectCourse.count({ where: { courseId: course } });
        expect([
          [0, 0],
          [1, 2],
        ]).toContainEqual([rows, rules]);
      }
    });

    it('finishes a change with rules and the deletion of the subject', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
        await teach(english, course, 3);

        const [applied, deleted] = await Promise.allSettled([
          repository.applyChanges(SCHOOL_ID, course, [
            { subjectId: english, sessionsPerWeek: 4, ...withRules },
          ]),
          subjectRepository.delete(SCHOOL_ID, english),
        ]);

        expect(deleted).toEqual({ status: 'fulfilled', value: true });
        expect(applied.status).toBe('fulfilled');
        await expect(orphanRules()).resolves.toEqual([]);
        await expect(
          testPrisma.schedulingConstraint.count({ where: { courseId: course } }),
        ).resolves.toBe(0);
      }
    });

    it('finishes a change with rules and the deletion of the course', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
        await teach(english, course, 3);

        const [applied, deleted] = await Promise.allSettled([
          repository.applyChanges(SCHOOL_ID, course, [
            { subjectId: english, sessionsPerWeek: 4, ...withRules },
          ]),
          courseRepository.delete(SCHOOL_ID, course),
        ]);

        expect(deleted.status).toBe('fulfilled');
        expect(applied.status).toBe('fulfilled');
        if (applied.status === 'fulfilled') {
          expect(['applied', 'courseNotFound']).toContain(applied.value.kind);
        }
        await expect(orphanRules()).resolves.toEqual([]);
        await expect(
          testPrisma.schedulingConstraint.count({ where: { courseId: course } }),
        ).resolves.toBe(0);
      }
    });

    it('leaves the rules of one of two changes of the same subject, never an error or a mix of rows', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);

        const results = await Promise.allSettled([
          repository.applyChanges(SCHOOL_ID, course, [
            { subjectId: english, sessionsPerWeek: 2, maxPerDay: 2, blockSize: null },
          ]),
          repository.applyChanges(SCHOOL_ID, course, [
            { subjectId: english, sessionsPerWeek: 4, maxPerDay: null, blockSize: 2 },
          ]),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        await expect(orphanRules()).resolves.toEqual([]);
        // Gana el último en confirmarse: sus sesiones y sus reglas, nunca una mezcla.
        const rows = await storedRows(course);
        const rules = await storedRules(course);
        expect(rows).toHaveLength(1);
        if (rows[0]?.sessionsPerWeek === 2) {
          expect(rules).toEqual([
            { subjectId: english, type: 'MAX_PER_DAY', maxPerDay: 2, blockSize: null },
          ]);
        } else {
          expect(rules).toEqual([
            { subjectId: english, type: 'BLOCK', maxPerDay: null, blockSize: 2 },
          ]);
        }
      }
    });
  });

  it('finishes a change of the load and the edition of the calendar that takes the course away', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      const calendar = {
        id: nextId(),
        name: `Calendario ${String(round)}`,
        normalizedName: `calendario ${String(round)}`,
        periods: [{ type: 'SESSION' as const, startTime: '09:00', endTime: '09:45' }],
      };
      await calendarRepository.create(SCHOOL_ID, calendar, [course]);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [
          { subjectId: english, sessionsPerWeek: 4, maxPerDay: null, blockSize: null },
        ]),
        // La edición deja al curso sin calendario: escribe en la fila del curso que el cambio bloquea.
        calendarRepository.update(
          SCHOOL_ID,
          calendar.id,
          {
            name: calendar.name,
            normalizedName: calendar.normalizedName,
            periods: calendar.periods,
          },
          [],
        ),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      await expect(storedRows(course)).resolves.toEqual([
        { subjectId: english, sessionsPerWeek: 4 },
      ]);
      await expect(
        testPrisma.course.findUniqueOrThrow({ where: { id: course } }),
      ).resolves.toMatchObject({ calendarId: null });
    }
  });
});

describe('PrismaCourseWorkloadRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaCourseWorkloadRepository(prisma) };
  }

  it.each([
    [
      'findByCourse',
      (unreachableRepository: PrismaCourseWorkloadRepository) =>
        unreachableRepository.findByCourse(SCHOOL_ID, nextId()),
    ],
    [
      'applyChanges',
      (unreachableRepository: PrismaCourseWorkloadRepository) =>
        unreachableRepository.applyChanges(SCHOOL_ID, nextId(), [
          { subjectId: nextId(), sessionsPerWeek: 2, maxPerDay: null, blockSize: null },
        ]),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository: unreachableRepository } = unreachable();

    await expect(operation(unreachableRepository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
