import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { NewProfessor } from '../../domain/professor/professor.js';
import { ClassAlreadyHasTutor, ClassNotFound } from '../../domain/professor/professorErrors.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaProfessorRepository } from './prismaProfessorRepository.js';

const repository = new PrismaProfessorRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(3000 + ++sequence).padStart(12, '0')}`;

function newProfessor(
  firstName: string,
  lastName: string,
  position: NewProfessor['position'] = null,
): NewProfessor {
  return { id: nextId(), firstName, lastName, position };
}

/** Crea un curso del colegio con una clase y devuelve sus identificadores. */
async function createClass(schoolId: string, courseName: string, className: string) {
  const courseId = nextId();
  const classId = nextId();
  await testPrisma.course.create({
    data: {
      id: courseId,
      schoolId,
      name: courseName,
      normalizedName: courseName.toLowerCase(),
      classes: {
        create: [{ id: classId, name: className, normalizedName: className.toLowerCase() }],
      },
    },
  });
  return { courseId, classId };
}

const professorCount = () => testPrisma.professor.count();

describe('PrismaProfessorRepository', () => {
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
    it('stores a professor without class or position and returns it with no subjects and no class', async () => {
      const professor = newProfessor('José María', 'García López');

      const created = await repository.create(SCHOOL_ID, professor, null);

      expect(created).toEqual({
        id: professor.id,
        firstName: 'José María',
        lastName: 'García López',
        position: null,
        subjects: [],
        tutoredClass: null,
      });
      const stored = await testPrisma.professor.findUniqueOrThrow({ where: { id: professor.id } });
      expect(stored).toMatchObject({
        schoolId: SCHOOL_ID,
        firstName: 'José María',
        lastName: 'García López',
        position: null,
      });
    });

    it('stores the position', async () => {
      const professor = newProfessor('Ana', 'García', 'JEFE_ESTUDIOS');

      const created = await repository.create(SCHOOL_ID, professor, null);

      expect(created.position).toBe('JEFE_ESTUDIOS');
      const stored = await testPrisma.professor.findUniqueOrThrow({ where: { id: professor.id } });
      expect(stored.position).toBe('JEFE_ESTUDIOS');
    });

    it('assigns the class and returns it with its course', async () => {
      const { courseId, classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const professor = newProfessor('Ana', 'García');

      const created = await repository.create(SCHOOL_ID, professor, classId);

      expect(created.tutoredClass).toEqual({
        id: classId,
        name: 'A',
        courseId,
        courseName: '1º Primaria',
      });
      const stored = await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
      expect(stored.tutorId).toBe(professor.id);
    });

    it('throws ClassAlreadyHasTutor when the class has a tutor, keeps that tutor and creates nothing', async () => {
      const { classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const first = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, first, classId);

      await expect(
        repository.create(SCHOOL_ID, newProfessor('Luis', 'Pérez'), classId),
      ).rejects.toBeInstanceOf(ClassAlreadyHasTutor);

      expect(await professorCount()).toBe(1);
      const stored = await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
      expect(stored.tutorId).toBe(first.id);
    });

    it('throws ClassNotFound for a class of another school and creates nothing', async () => {
      const { classId } = await createClass(OTHER_SCHOOL_ID, '1º Primaria', 'A');

      await expect(
        repository.create(SCHOOL_ID, newProfessor('Ana', 'García'), classId),
      ).rejects.toBeInstanceOf(ClassNotFound);

      expect(await professorCount()).toBe(0);
      const stored = await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
      expect(stored.tutorId).toBeNull();
    });

    it('throws ClassNotFound for a class that does not exist and creates nothing', async () => {
      await expect(
        repository.create(SCHOOL_ID, newProfessor('Ana', 'García'), nextId()),
      ).rejects.toBeInstanceOf(ClassNotFound);

      expect(await professorCount()).toBe(0);
    });

    it('creates only one professor when two arrive at the same time for the same class', async () => {
      const { classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const first = newProfessor('Ana', 'García');
      const second = newProfessor('Luis', 'Pérez');

      const results = await Promise.allSettled([
        repository.create(SCHOOL_ID, first, classId),
        repository.create(SCHOOL_ID, second, classId),
      ]);

      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(({ status }) => status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
        ClassAlreadyHasTutor,
      );
      expect(await professorCount()).toBe(1);
      const winner = await testPrisma.professor.findFirstOrThrow();
      const stored = await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
      expect(stored.tutorId).toBe(winner.id);
    });

    it('allows two professors with the same name and last name', async () => {
      await repository.create(SCHOOL_ID, newProfessor('José', 'García López'), null);

      await expect(
        repository.create(SCHOOL_ID, newProfessor('José', 'García López'), null),
      ).resolves.toMatchObject({ firstName: 'José' });

      expect(await professorCount()).toBe(2);
    });

    it('does not let a professor tutor two classes: the unique index rejects it', async () => {
      const first = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const second = await createClass(SCHOOL_ID, '2º Primaria', 'A');
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, first.classId);

      await expect(
        testPrisma.schoolClass.update({
          where: { id: second.classId },
          data: { tutorId: professor.id },
        }),
      ).rejects.toThrow();
    });

    it('leaves the class without tutor when its professor is deleted from the database', async () => {
      const { classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, classId);

      await testPrisma.professor.delete({ where: { id: professor.id } });

      const stored = await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
      expect(stored.tutorId).toBeNull();
    });
  });

  describe('listBySchool', () => {
    it('returns only the professors of the school, with and without class', async () => {
      const { courseId, classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const tutor = newProfessor('Ana', 'García', 'DIRECTOR');
      await repository.create(SCHOOL_ID, tutor, classId);
      await repository.create(SCHOOL_ID, newProfessor('Luis', 'Pérez'), null);
      await repository.create(OTHER_SCHOOL_ID, newProfessor('Eva', 'Otra'), null);

      const professors = await repository.listBySchool(SCHOOL_ID);

      expect(professors).toHaveLength(2);
      const listedTutor = professors.find(({ id }) => id === tutor.id);
      expect(listedTutor).toEqual({
        id: tutor.id,
        firstName: 'Ana',
        lastName: 'García',
        position: 'DIRECTOR',
        subjects: [],
        tutoredClass: { id: classId, name: 'A', courseId, courseName: '1º Primaria' },
      });
      expect(professors.find(({ firstName }) => firstName === 'Luis')).toMatchObject({
        position: null,
        tutoredClass: null,
      });
      expect(professors.some(({ firstName }) => firstName === 'Eva')).toBe(false);
    });

    it('returns an empty list when the school has no professors', async () => {
      await repository.create(OTHER_SCHOOL_ID, newProfessor('Eva', 'Otra'), null);

      await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([]);
    });
  });
});

describe('PrismaProfessorRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaProfessorRepository(prisma) };
  }

  it.each([
    [
      'create',
      (repository: PrismaProfessorRepository) =>
        repository.create(SCHOOL_ID, newProfessor('Ana', 'García'), null),
    ],
    [
      'create with a class',
      (repository: PrismaProfessorRepository) =>
        repository.create(SCHOOL_ID, newProfessor('Ana', 'García'), nextId()),
    ],
    ['listBySchool', (repository: PrismaProfessorRepository) => repository.listBySchool(SCHOOL_ID)],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
