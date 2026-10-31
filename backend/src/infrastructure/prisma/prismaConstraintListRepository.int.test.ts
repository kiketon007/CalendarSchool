import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaConstraintListRepository } from './prismaConstraintListRepository.js';

const repository = new PrismaConstraintListRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(7000 + ++sequence).padStart(12, '0')}`;

type PeriodKind = 'SESSION' | 'BREAK';

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
      color: 'green',
    },
  });
  return id;
}

async function teach(subjectId: string, courseId: string, sessionsPerWeek: number) {
  await testPrisma.subjectCourse.create({ data: { subjectId, courseId, sessionsPerWeek } });
}

type RuleType = 'MAX_PER_DAY' | 'BLOCK' | 'FORBIDDEN_SLOTS' | 'PREFERRED_SLOTS';

async function setRule(
  subjectId: string,
  courseId: string,
  schoolId: string,
  type: RuleType,
  value: { maxPerDay?: number; blockSize?: number; cells?: [number, number][] } = {},
) {
  const id = nextId();
  await testPrisma.schedulingConstraint.create({
    data: {
      id,
      schoolId,
      subjectId,
      courseId,
      type,
      maxPerDay: value.maxPerDay ?? null,
      blockSize: value.blockSize ?? null,
      slots: {
        create: (value.cells ?? []).map(([dayOfWeek, sessionNumber]) => ({
          dayOfWeek,
          sessionNumber,
        })),
      },
    },
  });
  return id;
}

const sortedCells = (cells: readonly { dayOfWeek: number; sessionNumber: number }[]) =>
  [...cells].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sessionNumber - b.sessionNumber);

describe('PrismaConstraintListRepository', () => {
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

  describe('listBySchool', () => {
    it('returns an empty list when the school has no rules, even with subjects in courses', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);

      await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([]);
    });

    it('returns only the pairs that have some rule, with all of them and their values', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés', { code: 'ING' });
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 3);
      await teach(music, course, 2);
      const maxRule = await setRule(english, course, SCHOOL_ID, 'MAX_PER_DAY', { maxPerDay: 2 });
      const blockRule = await setRule(english, course, SCHOOL_ID, 'BLOCK', { blockSize: 2 });
      const forbiddenRule = await setRule(english, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', {
        cells: [
          [1, 1],
          [1, 2],
        ],
      });
      const preferredRule = await setRule(english, course, SCHOOL_ID, 'PREFERRED_SLOTS', {
        cells: [[3, 4]],
      });

      const pairs = await repository.listBySchool(SCHOOL_ID);

      expect(pairs).toHaveLength(1);
      const [pair] = pairs;
      expect(pair).toMatchObject({
        course: { id: course, name: '1º Primaria' },
        subject: { id: english, name: 'Inglés', code: 'ING', color: 'green', status: 'ACTIVE' },
        sessionsPerWeek: 3,
        calendar: null,
      });
      const byId = new Map(pair?.rules.map((rule) => [rule.id, rule]));
      expect(byId.size).toBe(4);
      expect(byId.get(maxRule)).toMatchObject({
        type: 'MAX_PER_DAY',
        maxPerDay: 2,
        blockSize: null,
      });
      expect(byId.get(blockRule)).toMatchObject({ type: 'BLOCK', maxPerDay: null, blockSize: 2 });
      expect(sortedCells(byId.get(forbiddenRule)?.slots ?? [])).toEqual([
        { dayOfWeek: 1, sessionNumber: 1 },
        { dayOfWeek: 1, sessionNumber: 2 },
      ]);
      expect(byId.get(preferredRule)?.slots).toEqual([{ dayOfWeek: 3, sessionNumber: 4 }]);
    });

    it('keeps all the stored cells, also those beyond the sessions of the calendar', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Corto', ['SESSION', 'SESSION']);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 2);
      await setRule(english, course, SCHOOL_ID, 'FORBIDDEN_SLOTS', {
        cells: [
          [1, 1],
          [1, 7],
        ],
      });

      const [pair] = await repository.listBySchool(SCHOOL_ID);

      expect(sortedCells(pair?.rules[0]?.slots ?? [])).toEqual([
        { dayOfWeek: 1, sessionNumber: 1 },
        { dayOfWeek: 1, sessionNumber: 7 },
      ]);
    });

    it('summarises the calendar of the course in the groups of sessions between breaks', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Con recreo', [
        'SESSION',
        'SESSION',
        'BREAK',
        'SESSION',
        'SESSION',
        'SESSION',
      ]);
      const withCalendar = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const withoutCalendar = await createCourse(SCHOOL_ID, '2º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, withCalendar, 3);
      await teach(english, withoutCalendar, 3);
      await setRule(english, withCalendar, SCHOOL_ID, 'MAX_PER_DAY', { maxPerDay: 2 });
      await setRule(english, withoutCalendar, SCHOOL_ID, 'MAX_PER_DAY', { maxPerDay: 3 });

      const pairs = await repository.listBySchool(SCHOOL_ID);

      expect(pairs.find(({ course }) => course.id === withCalendar)?.calendar).toEqual({
        sessionGroups: [2, 3],
      });
      expect(pairs.find(({ course }) => course.id === withoutCalendar)?.calendar).toBeNull();
    });

    it('returns an inactive subject without a code', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const history = await createSubject(SCHOOL_ID, 'Historia', { status: 'INACTIVE' });
      await teach(history, course, 1);
      await setRule(history, course, SCHOOL_ID, 'MAX_PER_DAY', { maxPerDay: 2 });

      const [pair] = await repository.listBySchool(SCHOOL_ID);

      expect(pair?.subject).toMatchObject({ code: null, status: 'INACTIVE' });
    });

    it('does not return the rules of another school', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      await setRule(english, course, SCHOOL_ID, 'MAX_PER_DAY', { maxPerDay: 2 });
      const otherCourse = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const otherEnglish = await createSubject(OTHER_SCHOOL_ID, 'Inglés');
      await teach(otherEnglish, otherCourse, 3);
      await setRule(otherEnglish, otherCourse, OTHER_SCHOOL_ID, 'BLOCK', { blockSize: 2 });

      const pairs = await repository.listBySchool(SCHOOL_ID);
      const otherPairs = await repository.listBySchool(OTHER_SCHOOL_ID);

      expect(pairs.map(({ subject }) => subject.id)).toEqual([english]);
      expect(otherPairs.map(({ subject }) => subject.id)).toEqual([otherEnglish]);
      expect(otherPairs[0]?.rules.map(({ type }) => type)).toEqual(['BLOCK']);
    });

    it('drops the rules of a subject removed from a course', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      await setRule(english, course, SCHOOL_ID, 'MAX_PER_DAY', { maxPerDay: 2 });
      await testPrisma.subjectCourse.delete({
        where: { subjectId_courseId: { subjectId: english, courseId: course } },
      });

      await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([]);
    });
  });
});

describe('PrismaConstraintListRepository with an unreachable database', () => {
  it('listBySchool throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaConstraintListRepository(prisma).listBySchool(SCHOOL_ID),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
