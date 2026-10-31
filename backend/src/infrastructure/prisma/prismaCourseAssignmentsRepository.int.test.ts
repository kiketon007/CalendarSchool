import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { AssignmentCell } from '../../domain/assignment/courseAssignments.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaCourseAssignmentsRepository } from './prismaCourseAssignmentsRepository.js';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(9700 + ++sequence).padStart(12, '0')}`;
const repository = new PrismaCourseAssignmentsRepository(testPrisma, nextId);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

const ids = {
  course: '0192f5a0-0000-7000-8000-0000000000d1',
  otherCourse: '0192f5a0-0000-7000-8000-0000000000d2',
  foreignCourse: '0192f5a0-0000-7000-8000-0000000000d3',
  classA: '0192f5a0-0000-7000-8000-0000000000c1',
  classB: '0192f5a0-0000-7000-8000-0000000000c2',
  otherCourseClass: '0192f5a0-0000-7000-8000-0000000000c3',
  english: '0192f5a0-0000-7000-8000-0000000000e1',
  language: '0192f5a0-0000-7000-8000-0000000000e2',
  notTaught: '0192f5a0-0000-7000-8000-0000000000e3',
  ana: '0192f5a0-0000-7000-8000-0000000000f1',
  luis: '0192f5a0-0000-7000-8000-0000000000f2',
  foreignProfessor: '0192f5a0-0000-7000-8000-0000000000f3',
};

const cell = (subjectId: string, classId: string, professorId: string): AssignmentCell => ({
  subjectId,
  classId,
  professorId,
});

const stored = async (courseId = ids.course) =>
  (await testPrisma.professorAssignment.findMany({ where: { courseId } }))
    .map(({ subjectId, classId, professorId }) => cell(subjectId, classId, professorId))
    .sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.classId.localeCompare(b.classId));

async function seedAssignments(...cells: AssignmentCell[]) {
  await testPrisma.professorAssignment.createMany({
    data: cells.map((entry) => ({
      id: nextId(),
      schoolId: SCHOOL_ID,
      courseId: ids.course,
      ...entry,
    })),
  });
}

describe('PrismaCourseAssignmentsRepository', () => {
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
    await testPrisma.professor.createMany({
      data: [
        { id: ids.ana, schoolId: SCHOOL_ID, firstName: 'Ana', lastName: 'García' },
        { id: ids.luis, schoolId: SCHOOL_ID, firstName: 'Luis', lastName: 'Pérez' },
        { id: ids.foreignProfessor, schoolId: OTHER_SCHOOL_ID, firstName: 'Eva', lastName: 'Gil' },
      ],
    });
    for (const [id, schoolId, name] of [
      [ids.course, SCHOOL_ID, '1º Primaria'],
      [ids.otherCourse, SCHOOL_ID, '2º Primaria'],
      [ids.foreignCourse, OTHER_SCHOOL_ID, '1º Primaria'],
    ] as const) {
      await testPrisma.course.create({
        data: { id, schoolId, name, normalizedName: name.toLowerCase() },
      });
    }
    await testPrisma.schoolClass.createMany({
      data: [
        { id: ids.classA, courseId: ids.course, name: 'A', normalizedName: 'a', tutorId: ids.ana },
        { id: ids.classB, courseId: ids.course, name: 'B', normalizedName: 'b' },
        { id: ids.otherCourseClass, courseId: ids.otherCourse, name: 'A', normalizedName: 'a' },
      ],
    });
    for (const [id, name, code] of [
      [ids.english, 'Inglés', 'ING'],
      [ids.language, 'Lengua', null],
      [ids.notTaught, 'Plástica', null],
    ] as const) {
      await testPrisma.subject.create({
        data: {
          id,
          schoolId: SCHOOL_ID,
          name,
          normalizedName: name.toLowerCase(),
          code,
          normalizedCode: code === null ? null : code.toLowerCase(),
          type: 'CORE',
          status: id === ids.language ? 'INACTIVE' : 'ACTIVE',
          color: 'blue',
        },
      });
    }
    await testPrisma.subjectCourse.createMany({
      data: [
        { subjectId: ids.english, courseId: ids.course, sessionsPerWeek: 3 },
        { subjectId: ids.language, courseId: ids.course, sessionsPerWeek: 5 },
        { subjectId: ids.english, courseId: ids.otherCourse, sessionsPerWeek: 2 },
      ],
    });
  });

  describe('find', () => {
    it('returns the subjects taught in the course with their sessions and status, also the inactive ones', async () => {
      const found = await repository.find(SCHOOL_ID, ids.course);

      expect(found?.course).toEqual({ id: ids.course, name: '1º Primaria' });
      expect(
        [...(found?.subjects ?? [])]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(({ name, code, status, sessionsPerWeek }) => [name, code, status, sessionsPerWeek]),
      ).toEqual([
        ['Inglés', 'ING', 'ACTIVE', 3],
        ['Lengua', null, 'INACTIVE', 5],
      ]);
    });

    it('does not return a subject that is not taught in the course', async () => {
      const found = await repository.find(SCHOOL_ID, ids.course);

      expect(found?.subjects.map(({ id }) => id)).not.toContain(ids.notTaught);
    });

    it('returns the classes of the course with their tutor or null', async () => {
      const found = await repository.find(SCHOOL_ID, ids.course);

      expect([...(found?.classes ?? [])].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { id: ids.classA, name: 'A', tutor: { id: ids.ana, firstName: 'Ana', lastName: 'García' } },
        { id: ids.classB, name: 'B', tutor: null },
      ]);
    });

    it('returns only the assignments of the course', async () => {
      await seedAssignments(cell(ids.english, ids.classA, ids.ana));
      await testPrisma.professorAssignment.create({
        data: {
          id: nextId(),
          schoolId: SCHOOL_ID,
          professorId: ids.luis,
          subjectId: ids.english,
          courseId: ids.otherCourse,
          classId: ids.otherCourseClass,
        },
      });

      const found = await repository.find(SCHOOL_ID, ids.course);

      expect(found?.assignments).toEqual([cell(ids.english, ids.classA, ids.ana)]);
    });

    it('returns empty lists for a course without subjects', async () => {
      const found = await repository.find(SCHOOL_ID, ids.otherCourse);

      expect(found?.classes).toHaveLength(1);
      expect(found?.assignments).toEqual([]);
    });

    it('returns null for a course of another school and for one that does not exist', async () => {
      await expect(repository.find(SCHOOL_ID, ids.foreignCourse)).resolves.toBeNull();
      await expect(repository.find(SCHOOL_ID, nextId())).resolves.toBeNull();
      await expect(repository.find(OTHER_SCHOOL_ID, ids.course)).resolves.toBeNull();
    });
  });

  describe('replace', () => {
    it('creates the assignments of a course that had none and answers with the matrix', async () => {
      const result = await repository.replace(SCHOOL_ID, ids.course, [
        cell(ids.english, ids.classA, ids.ana),
        cell(ids.english, ids.classB, ids.luis),
      ]);

      expect(result.kind).toBe('replaced');
      if (result.kind === 'replaced') {
        expect([result.added, result.removed, result.changed]).toEqual([2, 0, 0]);
        expect(result.assignments.assignments).toHaveLength(2);
      }
      await expect(stored()).resolves.toEqual([
        cell(ids.english, ids.classA, ids.ana),
        cell(ids.english, ids.classB, ids.luis),
      ]);
    });

    it('stores the school and the course of each row', async () => {
      await repository.replace(SCHOOL_ID, ids.course, [cell(ids.english, ids.classA, ids.ana)]);

      await expect(testPrisma.professorAssignment.findFirstOrThrow()).resolves.toMatchObject({
        schoolId: SCHOOL_ID,
        courseId: ids.course,
      });
    });

    it('applies the final state: deletes what is missing, changes the professor and creates the rest', async () => {
      await seedAssignments(
        cell(ids.english, ids.classA, ids.ana),
        cell(ids.english, ids.classB, ids.ana),
        cell(ids.language, ids.classA, ids.luis),
      );

      const result = await repository.replace(SCHOOL_ID, ids.course, [
        cell(ids.english, ids.classA, ids.ana),
        cell(ids.english, ids.classB, ids.luis),
        cell(ids.language, ids.classB, ids.ana),
      ]);

      expect(result.kind).toBe('replaced');
      if (result.kind === 'replaced') {
        expect([result.added, result.removed, result.changed]).toEqual([1, 1, 1]);
      }
      await expect(stored()).resolves.toEqual(
        [
          cell(ids.english, ids.classA, ids.ana),
          cell(ids.english, ids.classB, ids.luis),
          cell(ids.language, ids.classB, ids.ana),
        ].sort(
          (a, b) => a.subjectId.localeCompare(b.subjectId) || a.classId.localeCompare(b.classId),
        ),
      );
    });

    it('keeps the creation date of the rows that stay, also of the one that changes its professor', async () => {
      await seedAssignments(
        cell(ids.english, ids.classA, ids.ana),
        cell(ids.english, ids.classB, ids.ana),
      );
      const before = await testPrisma.professorAssignment.findMany({ orderBy: { classId: 'asc' } });

      await repository.replace(SCHOOL_ID, ids.course, [
        cell(ids.english, ids.classA, ids.ana),
        cell(ids.english, ids.classB, ids.luis),
      ]);

      const after = await testPrisma.professorAssignment.findMany({ orderBy: { classId: 'asc' } });
      expect(after.map(({ id, createdAt }) => [id, createdAt])).toEqual(
        before.map(({ id, createdAt }) => [id, createdAt]),
      );
      expect(after.map(({ professorId }) => professorId)).toEqual([ids.ana, ids.luis]);
    });

    it('empties the course with an empty list', async () => {
      await seedAssignments(cell(ids.english, ids.classA, ids.ana));

      const result = await repository.replace(SCHOOL_ID, ids.course, []);

      expect(result.kind).toBe('replaced');
      await expect(stored()).resolves.toEqual([]);
    });

    it('does not write anything when the state is already the stored one, and keeps the rows', async () => {
      await seedAssignments(
        cell(ids.english, ids.classA, ids.ana),
        cell(ids.language, ids.classB, ids.luis),
      );
      const before = await testPrisma.professorAssignment.findMany({ orderBy: { id: 'asc' } });

      const result = await repository.replace(SCHOOL_ID, ids.course, [
        cell(ids.language, ids.classB, ids.luis),
        cell(ids.english, ids.classA, ids.ana),
      ]);

      expect(result.kind).toBe('unchanged');
      await expect(
        testPrisma.professorAssignment.findMany({ orderBy: { id: 'asc' } }),
      ).resolves.toEqual(before);
    });

    it('reports unchanged for an empty list when there was nothing', async () => {
      const result = await repository.replace(SCHOOL_ID, ids.course, []);

      expect(result.kind).toBe('unchanged');
    });

    it('does not touch the assignments of other courses', async () => {
      await testPrisma.professorAssignment.create({
        data: {
          id: nextId(),
          schoolId: SCHOOL_ID,
          professorId: ids.luis,
          subjectId: ids.english,
          courseId: ids.otherCourse,
          classId: ids.otherCourseClass,
        },
      });

      await repository.replace(SCHOOL_ID, ids.course, [cell(ids.english, ids.classA, ids.ana)]);

      await expect(stored(ids.otherCourse)).resolves.toEqual([
        cell(ids.english, ids.otherCourseClass, ids.luis),
      ]);
    });

    describe('references', () => {
      it('reports a subject that is not taught in the course, by position, and writes nothing', async () => {
        await seedAssignments(cell(ids.english, ids.classA, ids.ana));

        const result = await repository.replace(SCHOOL_ID, ids.course, [
          cell(ids.english, ids.classA, ids.luis),
          cell(ids.notTaught, ids.classB, ids.ana),
        ]);

        expect(result).toEqual({
          kind: 'invalidReferences',
          references: [{ position: 1, field: 'subjectId' }],
        });
        await expect(stored()).resolves.toEqual([cell(ids.english, ids.classA, ids.ana)]);
      });

      it('reports a class of another course', async () => {
        const result = await repository.replace(SCHOOL_ID, ids.course, [
          cell(ids.english, ids.otherCourseClass, ids.ana),
        ]);

        expect(result).toEqual({
          kind: 'invalidReferences',
          references: [{ position: 0, field: 'classId' }],
        });
      });

      it('reports a professor of another school and one that does not exist', async () => {
        const result = await repository.replace(SCHOOL_ID, ids.course, [
          cell(ids.english, ids.classA, ids.foreignProfessor),
          cell(ids.language, ids.classA, nextId()),
        ]);

        expect(result).toEqual({
          kind: 'invalidReferences',
          references: [
            { position: 0, field: 'professorId' },
            { position: 1, field: 'professorId' },
          ],
        });
        await expect(stored()).resolves.toEqual([]);
      });

      it('reports every wrong field of an entry', async () => {
        const result = await repository.replace(SCHOOL_ID, ids.course, [
          cell(ids.notTaught, ids.otherCourseClass, ids.foreignProfessor),
        ]);

        expect(result).toEqual({
          kind: 'invalidReferences',
          references: [
            { position: 0, field: 'subjectId' },
            { position: 0, field: 'classId' },
            { position: 0, field: 'professorId' },
          ],
        });
      });
    });

    it('answers notFound and writes nothing for a course of another school or one that does not exist', async () => {
      await expect(
        repository.replace(SCHOOL_ID, ids.foreignCourse, [cell(ids.english, ids.classA, ids.ana)]),
      ).resolves.toEqual({ kind: 'notFound' });
      await expect(repository.replace(SCHOOL_ID, nextId(), [])).resolves.toEqual({
        kind: 'notFound',
      });
      await expect(testPrisma.professorAssignment.count()).resolves.toBe(0);
    });

    it('lets the course win over the references: a missing course is notFound even with wrong ids', async () => {
      await expect(
        repository.replace(SCHOOL_ID, nextId(), [cell(nextId(), nextId(), nextId())]),
      ).resolves.toEqual({ kind: 'notFound' });
    });
  });
});

describe('PrismaCourseAssignmentsRepository races', () => {
  const ROUNDS = 5;

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
    await testPrisma.course.create({
      data: {
        id: ids.course,
        schoolId: SCHOOL_ID,
        name: '1º Primaria',
        normalizedName: '1º primaria',
      },
    });
    await testPrisma.schoolClass.createMany({
      data: [
        { id: ids.classA, courseId: ids.course, name: 'A', normalizedName: 'a' },
        { id: ids.classB, courseId: ids.course, name: 'B', normalizedName: 'b' },
      ],
    });
    await testPrisma.professor.createMany({
      data: [
        { id: ids.ana, schoolId: SCHOOL_ID, firstName: 'Ana', lastName: 'García' },
        { id: ids.luis, schoolId: SCHOOL_ID, firstName: 'Luis', lastName: 'Pérez' },
      ],
    });
    await testPrisma.subject.create({
      data: {
        id: ids.english,
        schoolId: SCHOOL_ID,
        name: 'Inglés',
        normalizedName: 'inglés',
        type: 'CORE',
        status: 'ACTIVE',
        color: 'blue',
      },
    });
    await testPrisma.subjectCourse.create({
      data: { subjectId: ids.english, courseId: ids.course, sessionsPerWeek: 3 },
    });
  });

  it('keeps the whole state of one of two simultaneous saves of the same course, never a mix', async () => {
    const first = [cell(ids.english, ids.classA, ids.ana), cell(ids.english, ids.classB, ids.ana)];
    const second = [cell(ids.english, ids.classA, ids.luis)];
    for (let round = 0; round < ROUNDS; round += 1) {
      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, ids.course, first),
        repository.replace(SCHOOL_ID, ids.course, second),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      expect([first, second].map((state) => JSON.stringify(state))).toContain(
        JSON.stringify(await stored()),
      );
    }
  });

  it('either saves a professor or finds it gone when it is deleted at the same time, without orphans', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const professor = nextId();
      await testPrisma.professor.create({
        data: { id: professor, schoolId: SCHOOL_ID, firstName: 'Tmp', lastName: 'Prof' },
      });

      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, ids.course, [cell(ids.english, ids.classA, professor)]),
        testPrisma.professor.delete({ where: { id: professor } }),
      ]);

      const save = results[0];
      expect(save?.status).toBe('fulfilled');
      if (save?.status === 'fulfilled') {
        expect(['replaced', 'invalidReferences']).toContain(save.value.kind);
      }
      await expect(
        testPrisma.professorAssignment.count({ where: { professorId: professor } }),
      ).resolves.toBe(0);
      await repository.replace(SCHOOL_ID, ids.course, []);
    }
  });

  it('either saves a subject or finds it gone when it stops being taught at the same time, without orphans', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const subject = nextId();
      await testPrisma.subject.create({
        data: {
          id: subject,
          schoolId: SCHOOL_ID,
          name: `Tmp ${String(round)}`,
          normalizedName: `tmp ${String(round)}`,
          type: 'CORE',
          status: 'ACTIVE',
          color: 'blue',
        },
      });
      await testPrisma.subjectCourse.create({
        data: { subjectId: subject, courseId: ids.course, sessionsPerWeek: 2 },
      });

      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, ids.course, [cell(subject, ids.classA, ids.ana)]),
        testPrisma.subjectCourse.delete({
          where: { subjectId_courseId: { subjectId: subject, courseId: ids.course } },
        }),
      ]);

      const save = results[0];
      expect(save?.status).toBe('fulfilled');
      await expect(
        testPrisma.professorAssignment.count({ where: { subjectId: subject } }),
      ).resolves.toBe(0);
      await repository.replace(SCHOOL_ID, ids.course, []);
    }
  });

  it('either saves a class or finds it gone when it is deleted at the same time, without orphans', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const schoolClass = nextId();
      await testPrisma.schoolClass.create({
        data: {
          id: schoolClass,
          courseId: ids.course,
          name: `T${String(round)}`,
          normalizedName: `t${String(round)}`,
        },
      });

      const results = await Promise.allSettled([
        repository.replace(SCHOOL_ID, ids.course, [cell(ids.english, schoolClass, ids.ana)]),
        testPrisma.schoolClass.delete({ where: { id: schoolClass } }),
      ]);

      expect(results[0]?.status).toBe('fulfilled');
      await expect(
        testPrisma.professorAssignment.count({ where: { classId: schoolClass } }),
      ).resolves.toBe(0);
      await repository.replace(SCHOOL_ID, ids.course, []);
    }
  });
});

describe('PrismaCourseAssignmentsRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaCourseAssignmentsRepository(prisma) };
  }

  it.each([
    [
      'find',
      (unreachableRepository: PrismaCourseAssignmentsRepository) =>
        unreachableRepository.find(SCHOOL_ID, ids.course),
    ],
    [
      'replace',
      (unreachableRepository: PrismaCourseAssignmentsRepository) =>
        unreachableRepository.replace(SCHOOL_ID, ids.course, []),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository: unreachableRepository } = unreachable();

    await expect(operation(unreachableRepository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
