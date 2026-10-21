import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { NewStudent } from '../../domain/student/student.js';
import { ClassNotFound, CourseNotFound } from '../../domain/student/studentErrors.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaCourseRepository } from './prismaCourseRepository.js';
import { PrismaStudentRepository } from './prismaStudentRepository.js';

const repository = new PrismaStudentRepository(testPrisma);
const courseRepository = new PrismaCourseRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(4000 + ++sequence).padStart(12, '0')}`;

function newStudent(firstName: string, lastName: string, overrides: Partial<NewStudent> = {}) {
  return {
    id: nextId(),
    firstName,
    lastName,
    cafeteria: false,
    scholarship: null,
    foodType: null,
    observations: null,
    ...overrides,
  } satisfies NewStudent;
}

/** Crea un curso del colegio con las clases dadas y devuelve sus identificadores. */
async function createCourse(schoolId: string, courseName: string, classNames: string[] = ['A']) {
  const courseId = nextId();
  const classes = classNames.map((name) => ({ id: nextId(), name }));
  await testPrisma.course.create({
    data: {
      id: courseId,
      schoolId,
      name: courseName,
      normalizedName: courseName.toLowerCase(),
      classes: {
        create: classes.map(({ id, name }) => ({ id, name, normalizedName: name.toLowerCase() })),
      },
    },
  });
  return { courseId, classes };
}

const studentCount = () => testPrisma.student.count();

describe('PrismaStudentRepository', () => {
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

  describe('create', () => {
    it('stores a student without class and without cafeteria and returns it with its course', async () => {
      const { courseId } = await createCourse(SCHOOL_ID, '1º Primaria');
      const student = newStudent('Juan', 'García');

      const created = await repository.create(SCHOOL_ID, student, courseId, null);

      expect(created).toEqual({
        id: student.id,
        firstName: 'Juan',
        lastName: 'García',
        course: { id: courseId, name: '1º Primaria' },
        class: null,
        cafeteria: false,
        scholarship: null,
        foodType: null,
        observations: null,
      });
      const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
      expect(stored).toMatchObject({ schoolId: SCHOOL_ID, courseId, classId: null });
    });

    it('stores the class, the scholarship, the food type and the observations and returns them', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria', ['A', 'B']);
      const student = newStudent('Ana', 'Álvarez', {
        cafeteria: true,
        scholarship: true,
        foodType: 'Alérgico a frutos secos',
        observations: 'Primera línea\nSegunda línea',
      });

      const created = await repository.create(SCHOOL_ID, student, courseId, classes[1]?.id ?? null);

      expect(created).toMatchObject({
        course: { id: courseId, name: '1º Primaria' },
        class: { id: classes[1]?.id, name: 'B' },
        cafeteria: true,
        scholarship: true,
        foodType: 'Alérgico a frutos secos',
        observations: 'Primera línea\nSegunda línea',
      });
      const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
      expect(stored).toMatchObject({ classId: classes[1]?.id, scholarship: true });
    });

    it('stores a cafeteria student with scholarship false', async () => {
      const { courseId } = await createCourse(SCHOOL_ID, '1º Primaria');

      const created = await repository.create(
        SCHOOL_ID,
        newStudent('Eva', 'Gil', { cafeteria: true, scholarship: false }),
        courseId,
        null,
      );

      expect(created).toMatchObject({ cafeteria: true, scholarship: false, foodType: null });
    });

    it('throws CourseNotFound for a course of another school and creates nothing', async () => {
      const { courseId } = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');

      await expect(
        repository.create(SCHOOL_ID, newStudent('Juan', 'García'), courseId, null),
      ).rejects.toBeInstanceOf(CourseNotFound);

      expect(await studentCount()).toBe(0);
    });

    it('throws CourseNotFound for a course that does not exist', async () => {
      await expect(
        repository.create(SCHOOL_ID, newStudent('Juan', 'García'), nextId(), null),
      ).rejects.toBeInstanceOf(CourseNotFound);

      expect(await studentCount()).toBe(0);
    });

    it('throws ClassNotFound for a class of another course of the same school', async () => {
      const first = await createCourse(SCHOOL_ID, '1º Primaria');
      const second = await createCourse(SCHOOL_ID, '2º Primaria');

      await expect(
        repository.create(
          SCHOOL_ID,
          newStudent('Juan', 'García'),
          first.courseId,
          second.classes[0]?.id ?? null,
        ),
      ).rejects.toBeInstanceOf(ClassNotFound);

      expect(await studentCount()).toBe(0);
    });

    it('throws ClassNotFound for a class of another school and for one that does not exist', async () => {
      const { courseId } = await createCourse(SCHOOL_ID, '1º Primaria');
      const other = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');

      for (const classId of [other.classes[0]?.id ?? '', nextId()]) {
        await expect(
          repository.create(SCHOOL_ID, newStudent('Juan', 'García'), courseId, classId),
        ).rejects.toBeInstanceOf(ClassNotFound);
      }

      expect(await studentCount()).toBe(0);
    });

    it('saves nothing when the insert fails', async () => {
      const { courseId } = await createCourse(SCHOOL_ID, '1º Primaria');
      // Un disparador que rechaza cualquier alta de alumno hace fallar la operación.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_student_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_student_insert BEFORE INSERT ON students FOR EACH ROW EXECUTE FUNCTION reject_student_insert()',
      );

      try {
        await expect(
          repository.create(SCHOOL_ID, newStudent('Juan', 'García'), courseId, null),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_student_insert ON students');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_student_insert()');
      }

      expect(await studentCount()).toBe(0);
    });

    it('lets two students be created in the same course at the same time', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria');

      const results = await Promise.all([
        repository.create(
          SCHOOL_ID,
          newStudent('Juan', 'García'),
          courseId,
          classes[0]?.id ?? null,
        ),
        repository.create(
          SCHOOL_ID,
          newStudent('Ana', 'Álvarez'),
          courseId,
          classes[0]?.id ?? null,
        ),
      ]);

      expect(results).toHaveLength(2);
      expect(await studentCount()).toBe(2);
    });

    it('never leaves a student with a class of a course that was deleted while creating it', async () => {
      // El alta toma el curso en modo compartido y el borrado lo bloquea en exclusivo: van una detrás de
      // otra. Gane quien gane, el alumno o no existe o se queda sin curso ni clase tras el borrado.
      for (let round = 0; round < 8; round += 1) {
        const { courseId, classes } = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const student = newStudent('Juan', `García ${String(round)}`);

        const [created, deleted] = await Promise.allSettled([
          repository.create(SCHOOL_ID, student, courseId, classes[0]?.id ?? null),
          courseRepository.delete(SCHOOL_ID, courseId),
        ]);

        expect(deleted.status).toBe('fulfilled');
        if (created.status === 'rejected') {
          expect(created.reason).toBeInstanceOf(CourseNotFound);
          expect(await testPrisma.student.findUnique({ where: { id: student.id } })).toBeNull();
        } else {
          expect(
            await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } }),
          ).toMatchObject({ courseId: null, classId: null });
        }
      }
    });
  });

  describe('listBySchool', () => {
    it('returns the students of the school with their course and class, and nothing else', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria');
      const withClass = newStudent('Juan', 'García', {
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Texto',
      });
      await repository.create(SCHOOL_ID, withClass, courseId, classes[0]?.id ?? null);

      const students = await repository.listBySchool(SCHOOL_ID);

      expect(students).toEqual([
        {
          id: withClass.id,
          firstName: 'Juan',
          lastName: 'García',
          course: { id: courseId, name: '1º Primaria' },
          class: { id: classes[0]?.id, name: 'A' },
          cafeteria: true,
          scholarship: true,
        },
      ]);
      expect(Object.keys(students[0] ?? {})).not.toContain('foodType');
      expect(Object.keys(students[0] ?? {})).not.toContain('observations');
    });

    it('does not return the students of another school', async () => {
      const mine = await createCourse(SCHOOL_ID, '1º Primaria');
      const theirs = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      await repository.create(SCHOOL_ID, newStudent('Juan', 'García'), mine.courseId, null);
      await repository.create(
        OTHER_SCHOOL_ID,
        newStudent('Otro', 'Colegio'),
        theirs.courseId,
        null,
      );

      const students = await repository.listBySchool(SCHOOL_ID);

      expect(students.map(({ firstName }) => firstName)).toEqual(['Juan']);
    });

    it('returns a student without course nor class once their course is deleted', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria');
      await repository.create(
        SCHOOL_ID,
        newStudent('Juan', 'García'),
        courseId,
        classes[0]?.id ?? null,
      );
      await courseRepository.delete(SCHOOL_ID, courseId);

      const students = await repository.listBySchool(SCHOOL_ID);

      expect(students).toMatchObject([{ firstName: 'Juan', course: null, class: null }]);
    });

    it('returns an empty list for a school without students', async () => {
      await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([]);
    });
  });
});

describe('PrismaStudentRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaStudentRepository(prisma) };
  }

  it.each([
    [
      'create',
      (repository: PrismaStudentRepository) =>
        repository.create(SCHOOL_ID, newStudent('Juan', 'García'), nextId(), null),
    ],
    ['listBySchool', (repository: PrismaStudentRepository) => repository.listBySchool(SCHOOL_ID)],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
