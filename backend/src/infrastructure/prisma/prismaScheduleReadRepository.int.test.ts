import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaScheduleReadRepository } from './prismaScheduleReadRepository.js';

const repository = new PrismaScheduleReadRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const USER_ID = '0192f5a0-0000-7000-8000-0000000000a1';
const OTHER_USER_ID = '0192f5a0-0000-7000-8000-0000000000a2';
const CALENDAR_ID = '0192f5a0-0000-7000-8000-0000000000ca';
const COURSE_1 = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_2 = '0192f5a0-0000-7000-8000-0000000000d2';
const COURSE_UNUSED = '0192f5a0-0000-7000-8000-0000000000d3';
const CLASS_1A = '0192f5a0-0000-7000-8000-0000000000c1';
const CLASS_1B = '0192f5a0-0000-7000-8000-0000000000c2';
const CLASS_2A = '0192f5a0-0000-7000-8000-0000000000c3';
const CLASS_UNUSED = '0192f5a0-0000-7000-8000-0000000000c4';
const ENGLISH = '0192f5a0-0000-7000-8000-0000000000e1';
const MATHS = '0192f5a0-0000-7000-8000-0000000000e2';
const SUBJECT_UNUSED = '0192f5a0-0000-7000-8000-0000000000e3';
const ANA = '0192f5a0-0000-7000-8000-0000000000f1';
const LUIS = '0192f5a0-0000-7000-8000-0000000000f2';
const PROFESSOR_UNUSED = '0192f5a0-0000-7000-8000-0000000000f3';
const SCHEDULE_ID = '0192f5a0-0000-7000-8000-0000000000b1';

const GENERATED_AT = new Date('2026-11-04T08:00:05.000Z');
const CONFIRMED_AT = new Date('2026-11-05T09:10:00.000Z');
const REPLACED_AT = new Date('2026-11-06T09:10:00.000Z');
const OFFICIAL_ID = '0192f5a0-0000-7000-8000-0000000000b2';
const OLD_OFFICIAL_ID = '0192f5a0-0000-7000-8000-0000000000b3';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(9900 + ++sequence).padStart(12, '0')}`;

async function seedSchool(schoolId: string, userId: string, name: string, email: string) {
  await testPrisma.school.create({
    data: { id: schoolId, name, normalizedName: name, municipalityCode: '46250' },
  });
  await testPrisma.user.create({
    data: {
      id: userId,
      schoolId,
      email,
      passwordHash: '$2b$12$'.padEnd(60, 'x'),
      firstName: 'Nombre',
      lastName: 'Apellido',
      role: 'ADMIN',
    },
  });
}

interface EntryData {
  courseId: string;
  classId: string;
  subjectId: string;
  professorId: string | null;
  dayOfWeek: number;
  sessionNumber: number;
  startMinute: number;
  endMinute: number;
}

function entry(overrides: Partial<EntryData> = {}): EntryData {
  return {
    courseId: COURSE_1,
    classId: CLASS_1A,
    subjectId: ENGLISH,
    professorId: ANA,
    dayOfWeek: 1,
    sessionNumber: 1,
    startMinute: 540,
    endMinute: 585,
    ...overrides,
  };
}

async function storeDraft(entries: EntryData[], schoolId = SCHOOL_ID, createdById = USER_ID) {
  await testPrisma.schedule.create({
    data: {
      id: SCHEDULE_ID,
      schoolId,
      status: 'DRAFT',
      engine: 'BACKTRACKING',
      placedSessions: entries.length,
      generatedAt: GENERATED_AT,
      createdById,
    },
  });
  await testPrisma.scheduleEntry.createMany({
    data: entries.map((data) => ({ id: nextId(), scheduleId: SCHEDULE_ID, ...data })),
  });
}

/** Un horario oficial del colegio, confirmado por `USER_ID` (vigente salvo que se le dé `replacedAt`). */
async function storeOfficial(
  id: string,
  entries: EntryData[],
  overrides: { schoolId?: string; confirmedById?: string; replacedAt?: Date | null } = {},
) {
  const schoolId = overrides.schoolId ?? SCHOOL_ID;
  await testPrisma.schedule.create({
    data: {
      id,
      schoolId,
      status: 'OFFICIAL',
      engine: 'BACKTRACKING',
      placedSessions: entries.length,
      generatedAt: GENERATED_AT,
      createdById: overrides.confirmedById ?? USER_ID,
      confirmedAt: CONFIRMED_AT,
      confirmedById: overrides.confirmedById ?? USER_ID,
      replacedAt: overrides.replacedAt ?? null,
    },
  });
  await testPrisma.scheduleEntry.createMany({
    data: entries.map((data) => ({ id: nextId(), scheduleId: id, ...data })),
  });
}

describe('PrismaScheduleReadRepository', () => {
  beforeEach(async () => {
    sequence = 0;
    await seedSchool(SCHOOL_ID, USER_ID, 'ceipuno', 'uno@ceipuno.es');
    await seedSchool(OTHER_SCHOOL_ID, OTHER_USER_ID, 'ceipdos', 'dos@ceipdos.es');
    await testPrisma.calendar.create({
      data: {
        id: CALENDAR_ID,
        schoolId: SCHOOL_ID,
        name: 'Primaria',
        normalizedName: 'primaria',
        periods: {
          create: [
            { id: nextId(), position: 1, kind: 'SESSION', startMinute: 540, endMinute: 585 },
            { id: nextId(), position: 2, kind: 'SESSION', startMinute: 585, endMinute: 630 },
            { id: nextId(), position: 3, kind: 'BREAK', startMinute: 630, endMinute: 660 },
            { id: nextId(), position: 4, kind: 'SESSION', startMinute: 660, endMinute: 705 },
          ],
        },
      },
    });
    for (const [id, name, calendarId] of [
      [COURSE_1, '1º Primaria', CALENDAR_ID],
      [COURSE_2, '2º Primaria', CALENDAR_ID],
      [COURSE_UNUSED, '3º Primaria', CALENDAR_ID],
    ] as const) {
      await testPrisma.course.create({
        data: {
          id,
          schoolId: SCHOOL_ID,
          name,
          normalizedName: name.toLowerCase(),
          calendarId,
        },
      });
    }
    await testPrisma.schoolClass.createMany({
      data: [
        { id: CLASS_1A, courseId: COURSE_1, name: 'A', normalizedName: 'a' },
        { id: CLASS_1B, courseId: COURSE_1, name: 'B', normalizedName: 'b' },
        { id: CLASS_2A, courseId: COURSE_2, name: 'A', normalizedName: 'a' },
        { id: CLASS_UNUSED, courseId: COURSE_UNUSED, name: 'A', normalizedName: 'a' },
      ],
    });
    for (const [id, name, code, color] of [
      [ENGLISH, 'Inglés', 'ING', 'blue'],
      [MATHS, 'Matemáticas', null, 'red'],
      [SUBJECT_UNUSED, 'Música', 'MUS', 'green'],
    ] as const) {
      await testPrisma.subject.create({
        data: {
          id,
          schoolId: SCHOOL_ID,
          name,
          normalizedName: name.toLowerCase(),
          code,
          normalizedCode: code?.toLowerCase() ?? null,
          type: 'CORE',
          status: 'ACTIVE',
          color,
        },
      });
    }
    await testPrisma.professor.createMany({
      data: [
        { id: ANA, schoolId: SCHOOL_ID, firstName: 'Ana', lastName: 'García' },
        { id: LUIS, schoolId: SCHOOL_ID, firstName: 'Luis', lastName: 'Pérez' },
        { id: PROFESSOR_UNUSED, schoolId: SCHOOL_ID, firstName: 'Eva', lastName: 'Soto' },
      ],
    });
  });

  describe('find the draft', () => {
    it('returns null when the school has no draft', async () => {
      await expect(repository.find(SCHOOL_ID, 'draft')).resolves.toBeNull();
    });

    it('returns the draft with its header', async () => {
      await storeDraft([entry()]);

      const draft = await repository.find(SCHOOL_ID, 'draft');

      expect(draft).toMatchObject({ id: SCHEDULE_ID, placedSessions: 1 });
      expect(draft?.generatedAt).toEqual(GENERATED_AT);
    });

    it('returns every course, class, subject and professor once and only those with entries', async () => {
      await storeDraft([
        entry(),
        entry({ sessionNumber: 2, startMinute: 585, endMinute: 630 }),
        entry({ classId: CLASS_1B, subjectId: MATHS, professorId: LUIS }),
        entry({ courseId: COURSE_2, classId: CLASS_2A, subjectId: MATHS, professorId: LUIS }),
      ]);

      const draft = await repository.find(SCHOOL_ID, 'draft');

      expect(draft?.entries).toHaveLength(4);
      expect(draft?.courses.map(({ id }) => id).sort()).toEqual([COURSE_1, COURSE_2].sort());
      expect(
        draft?.courses
          .find(({ id }) => id === COURSE_1)
          ?.classes.map(({ id }) => id)
          .sort(),
      ).toEqual([CLASS_1A, CLASS_1B].sort());
      expect(draft?.subjects.map(({ id }) => id).sort()).toEqual([ENGLISH, MATHS].sort());
      expect(draft?.professors.map(({ id }) => id).sort()).toEqual([ANA, LUIS].sort());
      expect(draft?.courses.map(({ id }) => id)).not.toContain(COURSE_UNUSED);
      expect(draft?.subjects.map(({ id }) => id)).not.toContain(SUBJECT_UNUSED);
      expect(draft?.professors.map(({ id }) => id)).not.toContain(PROFESSOR_UNUSED);
    });

    it('returns the entries with their ids, cell and stored minutes', async () => {
      await storeDraft([
        entry({ dayOfWeek: 3, sessionNumber: 2, startMinute: 585, endMinute: 630 }),
      ]);

      const draft = await repository.find(SCHOOL_ID, 'draft');

      expect(draft?.entries).toEqual([
        {
          courseId: COURSE_1,
          classId: CLASS_1A,
          subjectId: ENGLISH,
          professorId: ANA,
          dayOfWeek: 3,
          sessionNumber: 2,
          startMinute: 585,
          endMinute: 630,
        },
      ]);
    });

    it('returns the subject with its code and color, and the professor with the name', async () => {
      await storeDraft([entry(), entry({ subjectId: MATHS, professorId: LUIS, dayOfWeek: 2 })]);

      const draft = await repository.find(SCHOOL_ID, 'draft');

      expect(draft?.subjects.find(({ id }) => id === ENGLISH)).toEqual({
        id: ENGLISH,
        name: 'Inglés',
        code: 'ING',
        color: 'blue',
      });
      expect(draft?.subjects.find(({ id }) => id === MATHS)).toEqual({
        id: MATHS,
        name: 'Matemáticas',
        code: null,
        color: 'red',
      });
      expect(draft?.professors.find(({ id }) => id === LUIS)).toEqual({
        id: LUIS,
        firstName: 'Luis',
        lastName: 'Pérez',
      });
    });

    it('returns the current calendar of the course with its periods in the order of the day', async () => {
      await storeDraft([entry()]);

      const draft = await repository.find(SCHOOL_ID, 'draft');

      expect(draft?.courses[0]?.calendar).toEqual({
        id: CALENDAR_ID,
        name: 'Primaria',
        periods: [
          { kind: 'SESSION', startMinute: 540, endMinute: 585 },
          { kind: 'SESSION', startMinute: 585, endMinute: 630 },
          { kind: 'BREAK', startMinute: 630, endMinute: 660 },
          { kind: 'SESSION', startMinute: 660, endMinute: 705 },
        ],
      });
    });

    it('returns a course without calendar when it lost it after the draft was generated', async () => {
      await storeDraft([entry()]);
      await testPrisma.course.update({ where: { id: COURSE_1 }, data: { calendarId: null } });

      const draft = await repository.find(SCHOOL_ID, 'draft');

      expect(draft?.courses[0]?.calendar).toBeNull();
      expect(draft?.entries).toHaveLength(1);
    });

    it('keeps the entries of a professor who was deleted, with a null professor', async () => {
      await storeDraft([entry(), entry({ professorId: LUIS, dayOfWeek: 2 })]);
      await testPrisma.professor.delete({ where: { id: LUIS } });

      const draft = await repository.find(SCHOOL_ID, 'draft');

      expect(draft?.entries.map(({ professorId }) => professorId).sort()).toEqual([ANA, null]);
      expect(draft?.professors.map(({ id }) => id)).toEqual([ANA]);
    });

    it('does not return the draft of another school', async () => {
      await storeDraft([entry()]);

      await expect(repository.find(OTHER_SCHOOL_ID, 'draft')).resolves.toBeNull();
    });

    it('does not return a schedule that is not a draft', async () => {
      await storeDraft([entry()]);
      await testPrisma.schedule.update({
        where: { id: SCHEDULE_ID },
        data: { status: 'OFFICIAL', confirmedAt: new Date(), confirmedById: USER_ID },
      });

      await expect(repository.find(SCHOOL_ID, 'draft')).resolves.toBeNull();
    });

    it('returns a draft without entries with empty lists', async () => {
      await storeDraft([]);

      const draft = await repository.find(SCHOOL_ID, 'draft');

      expect(draft).toMatchObject({
        id: SCHEDULE_ID,
        courses: [],
        subjects: [],
        professors: [],
        entries: [],
      });
    });
  });

  describe('find the official (US-ALGO-CONFIRM)', () => {
    it('returns null when the school has no official', async () => {
      await storeDraft([entry()]);

      await expect(repository.find(SCHOOL_ID, 'official')).resolves.toBeNull();
    });

    it('returns the current official with who and when confirmed it', async () => {
      await storeOfficial(OFFICIAL_ID, [entry(), entry({ dayOfWeek: 2 })]);

      const official = await repository.find(SCHOOL_ID, 'official');

      expect(official).toMatchObject({
        id: OFFICIAL_ID,
        status: 'OFFICIAL',
        placedSessions: 2,
        generatedAt: GENERATED_AT,
        confirmedAt: CONFIRMED_AT,
        confirmedBy: { firstName: 'Nombre', lastName: 'Apellido' },
        replacedAt: null,
      });
      expect(official?.entries).toHaveLength(2);
      expect(official?.courses.map(({ id }) => id)).toEqual([COURSE_1]);
      expect(official?.subjects.map(({ id }) => id)).toEqual([ENGLISH]);
      expect(official?.professors.map(({ id }) => id)).toEqual([ANA]);
    });

    it('does not count a replaced official, and returns the current one next to it', async () => {
      await storeOfficial(OLD_OFFICIAL_ID, [entry({ professorId: LUIS })], {
        replacedAt: REPLACED_AT,
      });

      await expect(repository.find(SCHOOL_ID, 'official')).resolves.toBeNull();

      await storeOfficial(OFFICIAL_ID, [entry()]);
      const official = await repository.find(SCHOOL_ID, 'official');

      expect(official?.id).toBe(OFFICIAL_ID);
      expect(official?.professors.map(({ id }) => id)).toEqual([ANA]);
    });

    it('does not mix the draft and the official of the school', async () => {
      await storeDraft([entry({ dayOfWeek: 3 })]);
      await storeOfficial(OFFICIAL_ID, [entry()]);

      const draft = await repository.find(SCHOOL_ID, 'draft');
      const official = await repository.find(SCHOOL_ID, 'official');

      expect(draft).toMatchObject({ id: SCHEDULE_ID, status: 'DRAFT' });
      expect(official).toMatchObject({ id: OFFICIAL_ID, status: 'OFFICIAL' });
      expect(draft?.entries.map(({ dayOfWeek }) => dayOfWeek)).toEqual([3]);
      expect(official?.entries.map(({ dayOfWeek }) => dayOfWeek)).toEqual([1]);
    });

    it('does not return the official of another school', async () => {
      await storeOfficial(OFFICIAL_ID, [entry()], {
        schoolId: OTHER_SCHOOL_ID,
        confirmedById: OTHER_USER_ID,
      });

      await expect(repository.find(SCHOOL_ID, 'official')).resolves.toBeNull();
    });

    it('leaves the confirmation empty in a draft', async () => {
      await storeDraft([entry()]);

      await expect(repository.find(SCHOOL_ID, 'draft')).resolves.toMatchObject({
        status: 'DRAFT',
        confirmedAt: null,
        confirmedBy: null,
        replacedAt: null,
      });
    });
  });

  describe('overview (US-ALGO-CONFIRM)', () => {
    it('returns nothing when the school has no schedule', async () => {
      await expect(repository.overview(SCHOOL_ID)).resolves.toEqual({
        draft: null,
        official: null,
        previousCount: 0,
      });
    });

    it('returns the headers of the draft and of the current official, without their entries', async () => {
      await storeDraft([entry()]);
      await storeOfficial(OFFICIAL_ID, [entry(), entry({ dayOfWeek: 2 })]);

      const overview = await repository.overview(SCHOOL_ID);

      expect(overview.draft).toEqual({
        id: SCHEDULE_ID,
        status: 'DRAFT',
        generatedAt: GENERATED_AT,
        placedSessions: 1,
        confirmedAt: null,
        confirmedBy: null,
        replacedAt: null,
      });
      expect(overview.official).toEqual({
        id: OFFICIAL_ID,
        status: 'OFFICIAL',
        generatedAt: GENERATED_AT,
        placedSessions: 2,
        confirmedAt: CONFIRMED_AT,
        confirmedBy: { firstName: 'Nombre', lastName: 'Apellido' },
        replacedAt: null,
      });
    });

    it('counts the replaced officials, and does not return them as the current one', async () => {
      await storeOfficial(OLD_OFFICIAL_ID, [entry()], { replacedAt: REPLACED_AT });

      await expect(repository.overview(SCHOOL_ID)).resolves.toEqual({
        draft: null,
        official: null,
        previousCount: 1,
      });

      await storeOfficial(OFFICIAL_ID, [entry()]);
      const overview = await repository.overview(SCHOOL_ID);

      expect(overview.official?.id).toBe(OFFICIAL_ID);
      expect(overview.previousCount).toBe(1);
    });

    it('does not see the schedules of another school', async () => {
      await storeOfficial(OFFICIAL_ID, [entry()], {
        schoolId: OTHER_SCHOOL_ID,
        confirmedById: OTHER_USER_ID,
      });

      await expect(repository.overview(SCHOOL_ID)).resolves.toEqual({
        draft: null,
        official: null,
        previousCount: 0,
      });
    });
  });
});

describe('PrismaScheduleReadRepository with an unreachable database', () => {
  it('overview throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaScheduleReadRepository(prisma).overview(SCHOOL_ID),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });

  it('find throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaScheduleReadRepository(prisma).find(SCHOOL_ID, 'draft'),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
