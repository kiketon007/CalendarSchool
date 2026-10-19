import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { CourseAlreadyExists } from '../../domain/course/courseErrors.js';
import type { NewCourse } from '../../domain/course/courseRepository.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaCourseRepository } from './prismaCourseRepository.js';

const repository = new PrismaCourseRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(2000 + ++sequence).padStart(12, '0')}`;

/** Curso nuevo con las clases indicadas; el nombre normalizado es el nombre en minúsculas. */
function newCourse(name: string, classNames: string[]): NewCourse {
  return {
    id: nextId(),
    name,
    normalizedName: name.toLowerCase(),
    classes: classNames.map((className) => ({
      id: nextId(),
      name: className,
      normalizedName: className.toLowerCase(),
    })),
  };
}

async function counts() {
  return {
    courses: await testPrisma.course.count(),
    classes: await testPrisma.schoolClass.count(),
  };
}

describe('PrismaCourseRepository', () => {
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
    it('stores the course and its classes and returns them in the order received, without tutor', async () => {
      const course = newCourse('1º Primaria', ['B', 'A', 'C']);

      const created = await repository.create(SCHOOL_ID, course);

      expect(created).toEqual({
        id: course.id,
        name: '1º Primaria',
        createdAt: expect.any(Date),
        classes: [
          { id: course.classes[0]?.id, name: 'B', tutor: null },
          { id: course.classes[1]?.id, name: 'A', tutor: null },
          { id: course.classes[2]?.id, name: 'C', tutor: null },
        ],
      });
      const stored = await testPrisma.course.findUniqueOrThrow({
        where: { id: course.id },
        include: { classes: true },
      });
      expect(stored.schoolId).toBe(SCHOOL_ID);
      // La fecha devuelta es la que guarda la base de datos, no la del reloj de la aplicación.
      expect(created.createdAt).toEqual(stored.createdAt);
      expect(stored.normalizedName).toBe('1º primaria');
      expect(stored.classes.map(({ name }) => name).sort()).toEqual(['A', 'B', 'C']);
      expect(stored.classes.every(({ courseId }) => courseId === course.id)).toBe(true);
    });

    it('throws CourseAlreadyExists when the school already has a course with that normalized name, and leaves nothing behind', async () => {
      await repository.create(SCHOOL_ID, newCourse('1º Primaria', ['A']));

      await expect(
        repository.create(SCHOOL_ID, newCourse('1º PRIMARIA', ['A', 'B'])),
      ).rejects.toBeInstanceOf(CourseAlreadyExists);

      expect(await counts()).toEqual({ courses: 1, classes: 1 });
    });

    it('creates a course with the same name in another school', async () => {
      await repository.create(SCHOOL_ID, newCourse('1º Primaria', ['A']));

      await expect(
        repository.create(OTHER_SCHOOL_ID, newCourse('1º Primaria', ['A'])),
      ).resolves.toMatchObject({ name: '1º Primaria' });

      expect(await counts()).toEqual({ courses: 2, classes: 2 });
    });

    it('leaves neither the course nor any class when a class cannot be stored', async () => {
      // Dos clases con el mismo nombre normalizado violan el índice único de `classes`: la
      // aplicación lo evita antes, pero el curso no debe quedar a medias si ocurriera.
      const course = newCourse('2º Primaria', ['A', 'a']);

      const attempt = repository.create(SCHOOL_ID, course);

      await expect(attempt).rejects.toThrow();
      await expect(attempt).rejects.not.toBeInstanceOf(CourseAlreadyExists);
      expect(await counts()).toEqual({ courses: 0, classes: 0 });
    });

    it('creates only one course when two identical requests arrive at the same time', async () => {
      const results = await Promise.allSettled([
        repository.create(SCHOOL_ID, newCourse('1º Primaria', ['A'])),
        repository.create(SCHOOL_ID, newCourse('1º Primaria', ['A'])),
      ]);

      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(({ status }) => status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
        CourseAlreadyExists,
      );
      expect(await counts()).toEqual({ courses: 1, classes: 1 });
    });
  });

  describe('listBySchool', () => {
    it('returns only the courses of the school, with their classes', async () => {
      await repository.create(SCHOOL_ID, newCourse('1º Primaria', ['A', 'B']));
      await repository.create(SCHOOL_ID, newCourse('2º Primaria', ['A']));
      await repository.create(OTHER_SCHOOL_ID, newCourse('3º Primaria', ['A']));

      const courses = await repository.listBySchool(SCHOOL_ID);

      expect(courses.map(({ name }) => name).sort()).toEqual(['1º Primaria', '2º Primaria']);
      const first = courses.find(({ name }) => name === '1º Primaria');
      expect(first?.classes.map(({ name }) => name).sort()).toEqual(['A', 'B']);
      const stored = await testPrisma.course.findFirstOrThrow({
        where: { schoolId: SCHOOL_ID, name: '1º Primaria' },
      });
      expect(first?.createdAt).toEqual(stored.createdAt);
      expect(courses.every(({ createdAt }) => createdAt instanceof Date)).toBe(true);
      expect(first?.classes.every(({ tutor }) => tutor === null)).toBe(true);
    });

    it('returns an empty list when the school has no courses', async () => {
      await repository.create(OTHER_SCHOOL_ID, newCourse('1º Primaria', ['A']));

      await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([]);
    });
  });
});

describe('PrismaCourseRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaCourseRepository(prisma) };
  }

  it.each([
    [
      'create',
      (repository: PrismaCourseRepository) =>
        repository.create(SCHOOL_ID, newCourse('1º Primaria', ['A'])),
    ],
    ['listBySchool', (repository: PrismaCourseRepository) => repository.listBySchool(SCHOOL_ID)],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
