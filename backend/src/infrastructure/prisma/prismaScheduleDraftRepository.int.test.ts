import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaScheduleDraftRepository } from './prismaScheduleDraftRepository.js';

const repository = new PrismaScheduleDraftRepository(testPrisma);

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

describe('PrismaScheduleDraftRepository', () => {
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

  describe('findDraft', () => {
    it('returns null when the school has no draft', async () => {
      await expect(repository.findDraft(SCHOOL_ID)).resolves.toBeNull();
    });

    it('returns the draft with its header', async () => {
      await storeDraft([entry()]);

      const draft = await repository.findDraft(SCHOOL_ID);

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

      const draft = await repository.findDraft(SCHOOL_ID);

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

      const draft = await repository.findDraft(SCHOOL_ID);

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

      const draft = await repository.findDraft(SCHOOL_ID);

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

      const draft = await repository.findDraft(SCHOOL_ID);

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

      const draft = await repository.findDraft(SCHOOL_ID);

      expect(draft?.courses[0]?.calendar).toBeNull();
      expect(draft?.entries).toHaveLength(1);
    });

    it('keeps the entries of a professor who was deleted, with a null professor', async () => {
      await storeDraft([entry(), entry({ professorId: LUIS, dayOfWeek: 2 })]);
      await testPrisma.professor.delete({ where: { id: LUIS } });

      const draft = await repository.findDraft(SCHOOL_ID);

      expect(draft?.entries.map(({ professorId }) => professorId).sort()).toEqual([ANA, null]);
      expect(draft?.professors.map(({ id }) => id)).toEqual([ANA]);
    });

    it('does not return the draft of another school', async () => {
      await storeDraft([entry()]);

      await expect(repository.findDraft(OTHER_SCHOOL_ID)).resolves.toBeNull();
    });

    it('does not return a schedule that is not a draft', async () => {
      await storeDraft([entry()]);
      await testPrisma.schedule.update({
        where: { id: SCHEDULE_ID },
        data: { status: 'OFFICIAL' },
      });

      await expect(repository.findDraft(SCHOOL_ID)).resolves.toBeNull();
    });

    it('returns a draft without entries with empty lists', async () => {
      await storeDraft([]);

      const draft = await repository.findDraft(SCHOOL_ID);

      expect(draft).toMatchObject({
        id: SCHEDULE_ID,
        courses: [],
        subjects: [],
        professors: [],
        entries: [],
      });
    });
  });
});

describe('PrismaScheduleDraftRepository with an unreachable database', () => {
  it('findDraft throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaScheduleDraftRepository(prisma).findDraft(SCHOOL_ID),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
