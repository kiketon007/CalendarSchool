import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaProfessorsSummaryRepository } from './prismaProfessorsSummaryRepository.js';

const repository = new PrismaProfessorsSummaryRepository(testPrisma);

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
      color: 'green',
    },
  });
  return id;
}

async function teach(subjectId: string, courseId: string, sessionsPerWeek: number) {
  await testPrisma.subjectCourse.create({ data: { subjectId, courseId, sessionsPerWeek } });
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

describe('PrismaProfessorsSummaryRepository', () => {
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
    it('returns nothing for a school without professors or courses', async () => {
      await expect(repository.read(SCHOOL_ID)).resolves.toEqual({ professors: [], courses: [] });
    });

    it('returns a professor without assignments or unavailable intervals', async () => {
      const luis = await createProfessor(SCHOOL_ID, 'Luis', 'Ruiz');

      const { professors, courses } = await repository.read(SCHOOL_ID);

      expect(courses).toEqual([]);
      expect(professors).toEqual([
        { id: luis, firstName: 'Luis', lastName: 'Ruiz', subjects: [], unavailable: [] },
      ]);
    });

    it('returns what a professor teaches, with the sessions of the subject in the course, and when they cannot', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Primaria', ['SESSION', 'SESSION']);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const classA = await createClass(course, 'A');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      const ana = await createProfessor(SCHOOL_ID, 'Ana', 'García');
      await assign(SCHOOL_ID, ana, english, course, classA);
      await makeUnavailable(SCHOOL_ID, ana, 1, 540, 600);

      const { professors } = await repository.read(SCHOOL_ID);

      expect(professors).toEqual([
        {
          id: ana,
          firstName: 'Ana',
          lastName: 'García',
          subjects: [
            {
              subjectId: english,
              subjectName: 'Inglés',
              courseId: course,
              courseName: '1º Primaria',
              classId: classA,
              className: 'A',
              sessionsPerWeek: 3,
            },
          ],
          unavailable: [{ dayOfWeek: 1, startMinute: 540, endMinute: 600 }],
        },
      ]);
    });

    it('returns the courses with the sessions of their calendar, without the breaks, in order', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Primaria', ['SESSION', 'BREAK', 'SESSION']);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);

      const { courses } = await repository.read(SCHOOL_ID);

      expect(courses).toEqual([
        {
          id: course,
          name: '1º Primaria',
          calendar: {
            id: calendar,
            name: 'Primaria',
            sessions: [
              { startMinute: 540, endMinute: 590 },
              { startMinute: 660, endMinute: 710 },
            ],
          },
          classCount: 0,
          subjects: [],
        },
      ]);
    });

    it('returns a course without calendar with a null calendar', async () => {
      const course = await createCourse(SCHOOL_ID, '6º Primaria');

      const { courses } = await repository.read(SCHOOL_ID);

      expect(courses).toEqual([
        { id: course, name: '6º Primaria', calendar: null, classCount: 0, subjects: [] },
      ]);
    });

    it('counts the classes of the course and, for every subject taught, the classes with a professor', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const classA = await createClass(course, 'A');
      const classB = await createClass(course, 'B');
      await createClass(course, 'C');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 3);
      await teach(music, course, 2);
      const ana = await createProfessor(SCHOOL_ID, 'Ana', 'García');
      const luis = await createProfessor(SCHOOL_ID, 'Luis', 'Ruiz');
      await assign(SCHOOL_ID, ana, english, course, classA);
      await assign(SCHOOL_ID, luis, english, course, classB);

      const [summary] = (await repository.read(SCHOOL_ID)).courses;

      expect(summary?.classCount).toBe(3);
      expect(summary?.subjects).toHaveLength(2);
      expect(summary?.subjects).toEqual(
        expect.arrayContaining([
          { subjectId: english, assignmentCount: 2 },
          { subjectId: music, assignmentCount: 0 },
        ]),
      );
    });

    it('shares the calendar of two courses and keeps the unassigned subjects out of the professors', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Primaria', ['SESSION']);
      const first = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const second = await createCourse(SCHOOL_ID, '2º Primaria', calendar);

      const { courses } = await repository.read(SCHOOL_ID);

      expect(courses).toHaveLength(2);
      expect(courses.map(({ id, calendar: read }) => [id, read?.id]).sort()).toEqual(
        [
          [first, calendar],
          [second, calendar],
        ].sort(),
      );
    });

    it('does not read the professors or the courses of another school', async () => {
      const calendar = await createCalendar(OTHER_SCHOOL_ID, 'Otro', ['SESSION']);
      const course = await createCourse(OTHER_SCHOOL_ID, '1º Otro', calendar);
      const classA = await createClass(course, 'A');
      const english = await createSubject(OTHER_SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      const ana = await createProfessor(OTHER_SCHOOL_ID, 'Ana', 'García');
      await assign(OTHER_SCHOOL_ID, ana, english, course, classA);
      await makeUnavailable(OTHER_SCHOOL_ID, ana, 2, 540, 600);

      await expect(repository.read(SCHOOL_ID)).resolves.toEqual({ professors: [], courses: [] });
      const other = await repository.read(OTHER_SCHOOL_ID);
      expect(other.professors).toHaveLength(1);
      expect(other.courses).toHaveLength(1);
    });

    it('stops teaching a subject when it is removed from the course: no assignment is left behind', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const classA = await createClass(course, 'A');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      await teach(english, course, 3);
      const ana = await createProfessor(SCHOOL_ID, 'Ana', 'García');
      await assign(SCHOOL_ID, ana, english, course, classA);
      await testPrisma.subjectCourse.delete({
        where: { subjectId_courseId: { subjectId: english, courseId: course } },
      });

      const { professors, courses } = await repository.read(SCHOOL_ID);

      expect(professors[0]?.subjects).toEqual([]);
      expect(courses[0]?.subjects).toEqual([]);
    });
  });
});

describe('PrismaProfessorsSummaryRepository with an unreachable database', () => {
  it('read throws DatabaseUnavailable', async () => {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });

    await expect(
      new PrismaProfessorsSummaryRepository(prisma).read(SCHOOL_ID),
    ).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
