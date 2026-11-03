import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaSchedulingProblemRepository } from './prismaSchedulingProblemRepository.js';

const repository = new PrismaSchedulingProblemRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(7000 + ++sequence).padStart(12, '0')}`;

type PeriodKind = 'SESSION' | 'BREAK';

/** Cada periodo dura 50 minutos y empieza a las 09:00 más 60 minutos por posición. */
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

async function createClass(courseId: string, name: string) {
  const id = nextId();
  await testPrisma.schoolClass.create({
    data: { id, courseId, name, normalizedName: name.toLowerCase() },
  });
  return id;
}

async function createSubject(
  schoolId: string,
  name: string,
  status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
) {
  const id = nextId();
  await testPrisma.subject.create({
    data: {
      id,
      schoolId,
      name,
      normalizedName: name.toLowerCase(),
      type: 'CORE',
      status,
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
  schoolId: string,
  subjectId: string,
  courseId: string,
  type: RuleType,
  value: { maxPerDay?: number; blockSize?: number; cells?: [number, number][] } = {},
) {
  await testPrisma.schedulingConstraint.create({
    data: {
      id: nextId(),
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
}

async function createProfessor(schoolId: string, firstName: string, lastName: string) {
  const id = nextId();
  await testPrisma.professor.create({ data: { id, schoolId, firstName, lastName } });
  return id;
}

async function assign(
  schoolId: string,
  professorId: string,
  subjectId: string,
  courseId: string,
  classId: string,
) {
  await testPrisma.professorAssignment.create({
    data: { id: nextId(), schoolId, professorId, subjectId, courseId, classId },
  });
}

async function makeUnavailable(
  schoolId: string,
  professorId: string,
  dayOfWeek: number,
  startMinute: number,
  endMinute: number,
) {
  await testPrisma.professorUnavailability.create({
    data: { id: nextId(), schoolId, professorId, dayOfWeek, startMinute, endMinute },
  });
}

const sortedCells = (cells: readonly { dayOfWeek: number; sessionNumber: number }[]) =>
  [...cells].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.sessionNumber - b.sessionNumber);

describe('PrismaSchedulingProblemRepository', () => {
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

  describe('read', () => {
    it('returns nothing for a school without courses or professors', async () => {
      await expect(repository.read(SCHOOL_ID)).resolves.toEqual({ courses: [], professors: [] });
    });

    it('returns a professor without assignments or unavailable intervals', async () => {
      const luis = await createProfessor(SCHOOL_ID, 'Luis', 'Ruiz');

      const { professors, courses } = await repository.read(SCHOOL_ID);

      expect(courses).toEqual([]);
      expect(professors).toEqual([
        { id: luis, firstName: 'Luis', lastName: 'Ruiz', unavailable: [] },
      ]);
    });

    it('returns the unavailable intervals of a professor in minutes', async () => {
      const ana = await createProfessor(SCHOOL_ID, 'Ana', 'García');
      await makeUnavailable(SCHOOL_ID, ana, 1, 540, 600);
      await makeUnavailable(SCHOOL_ID, ana, 3, 600, 690);

      const [professor] = (await repository.read(SCHOOL_ID)).professors;

      expect(professor?.unavailable).toHaveLength(2);
      expect(professor?.unavailable).toEqual(
        expect.arrayContaining([
          { dayOfWeek: 1, startMinute: 540, endMinute: 600 },
          { dayOfWeek: 3, startMinute: 600, endMinute: 690 },
        ]),
      );
    });

    it('returns a course with its calendar and periods in order, its classes and its subjects with their rules, slots and teachers', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Primaria', ['SESSION', 'BREAK', 'SESSION']);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const classA = await createClass(course, 'A');
      const classB = await createClass(course, 'B');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      await setRule(SCHOOL_ID, english, course, 'MAX_PER_DAY', { maxPerDay: 2 });
      await setRule(SCHOOL_ID, english, course, 'BLOCK', { blockSize: 2 });
      await setRule(SCHOOL_ID, english, course, 'FORBIDDEN_SLOTS', {
        cells: [
          [1, 1],
          [5, 2],
        ],
      });
      await setRule(SCHOOL_ID, english, course, 'PREFERRED_SLOTS', { cells: [[2, 1]] });
      const ana = await createProfessor(SCHOOL_ID, 'Ana', 'García');
      await assign(SCHOOL_ID, ana, english, course, classA);

      const { courses } = await repository.read(SCHOOL_ID);

      expect(courses).toHaveLength(1);
      const [read] = courses;
      expect(read?.id).toBe(course);
      expect(read?.name).toBe('1º Primaria');
      expect(read?.calendar).toEqual({
        id: calendar,
        name: 'Primaria',
        periods: [
          { kind: 'SESSION', startMinute: 540, endMinute: 590 },
          { kind: 'BREAK', startMinute: 600, endMinute: 650 },
          { kind: 'SESSION', startMinute: 660, endMinute: 710 },
        ],
      });
      expect(read?.classes).toHaveLength(2);
      expect(read?.classes).toEqual(
        expect.arrayContaining([
          { id: classA, name: 'A' },
          { id: classB, name: 'B' },
        ]),
      );
      expect(read?.subjects).toHaveLength(1);
      const [subject] = read?.subjects ?? [];
      expect(subject).toMatchObject({
        subjectId: english,
        subjectName: 'Inglés',
        status: 'ACTIVE',
        sessionsPerWeek: 3,
        maxPerDay: 2,
        blockSize: 2,
        teachers: [{ classId: classA, professorId: ana }],
      });
      expect(sortedCells(subject?.forbiddenCells ?? [])).toEqual([
        { dayOfWeek: 1, sessionNumber: 1 },
        { dayOfWeek: 5, sessionNumber: 2 },
      ]);
      expect(subject?.preferredCells).toEqual([{ dayOfWeek: 2, sessionNumber: 1 }]);
    });

    it('returns a subject without rules with null values and no slots', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 2);

      const [read] = (await repository.read(SCHOOL_ID)).courses;

      expect(read?.subjects[0]).toMatchObject({
        maxPerDay: null,
        blockSize: null,
        forbiddenCells: [],
        preferredCells: [],
        teachers: [],
      });
    });

    it('returns the inactive subjects with their status', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const french = await createSubject(SCHOOL_ID, 'Francés', 'INACTIVE');
      await teach(french, course, 2);

      const [read] = (await repository.read(SCHOOL_ID)).courses;

      expect(read?.subjects[0]).toMatchObject({ subjectName: 'Francés', status: 'INACTIVE' });
    });

    it('returns a course without calendar with a null calendar and a course without classes or subjects with empty lists', async () => {
      const course = await createCourse(SCHOOL_ID, '6º Primaria');

      expect((await repository.read(SCHOOL_ID)).courses).toEqual([
        { id: course, name: '6º Primaria', calendar: null, classes: [], subjects: [] },
      ]);
    });

    it('returns every teacher of a subject, one per class', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const classA = await createClass(course, 'A');
      const classB = await createClass(course, 'B');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      const ana = await createProfessor(SCHOOL_ID, 'Ana', 'García');
      const luis = await createProfessor(SCHOOL_ID, 'Luis', 'Ruiz');
      await assign(SCHOOL_ID, ana, english, course, classA);
      await assign(SCHOOL_ID, luis, english, course, classB);

      const [read] = (await repository.read(SCHOOL_ID)).courses;

      expect(read?.subjects[0]?.teachers).toHaveLength(2);
      expect(read?.subjects[0]?.teachers).toEqual(
        expect.arrayContaining([
          { classId: classA, professorId: ana },
          { classId: classB, professorId: luis },
        ]),
      );
    });

    it('does not read the courses or the professors of another school', async () => {
      const calendar = await createCalendar(OTHER_SCHOOL_ID, 'Otro', ['SESSION']);
      const course = await createCourse(OTHER_SCHOOL_ID, '1º Otro', calendar);
      const classA = await createClass(course, 'A');
      const english = await createSubject(OTHER_SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      const ana = await createProfessor(OTHER_SCHOOL_ID, 'Ana', 'García');
      await assign(OTHER_SCHOOL_ID, ana, english, course, classA);
      await makeUnavailable(OTHER_SCHOOL_ID, ana, 2, 540, 600);

      await expect(repository.read(SCHOOL_ID)).resolves.toEqual({ courses: [], professors: [] });
      const other = await repository.read(OTHER_SCHOOL_ID);
      expect(other.courses).toHaveLength(1);
      expect(other.professors).toHaveLength(1);
    });

    it('does not return a subject removed from the course, nor its teachers', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const classA = await createClass(course, 'A');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      const ana = await createProfessor(SCHOOL_ID, 'Ana', 'García');
      await assign(SCHOOL_ID, ana, english, course, classA);
      await testPrisma.subjectCourse.delete({
        where: { subjectId_courseId: { subjectId: english, courseId: course } },
      });

      const [read] = (await repository.read(SCHOOL_ID)).courses;

      expect(read?.subjects).toEqual([]);
    });
  });
});

describe('PrismaSchedulingProblemRepository with an unreachable database', () => {
  it('read throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaSchedulingProblemRepository(prisma).read(SCHOOL_ID),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
