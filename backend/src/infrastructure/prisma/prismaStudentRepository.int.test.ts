import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { NewStudent, StudentChanges } from '../../domain/student/student.js';
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

/** Estado final de un alumno al editarlo: lo de `newStudent` sin el identificador. */
function changesFor(firstName: string, lastName: string, overrides: Partial<StudentChanges> = {}) {
  const { id: _id, ...changes } = newStudent(firstName, lastName, overrides);
  return changes satisfies StudentChanges;
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

  describe('update', () => {
    /** Alumno de «1º Primaria» A con comedor, beca y textos sensibles. */
    async function seedStudent() {
      const first = await createCourse(SCHOOL_ID, '1º Primaria', ['A', 'B']);
      const second = await createCourse(SCHOOL_ID, '2º Primaria', ['A']);
      const student = newStudent('Juan', 'García', {
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Diabetes tipo 1',
      });
      await repository.create(SCHOOL_ID, student, first.courseId, first.classes[0]?.id ?? null);
      return { first, second, student };
    }

    /** Los datos de `seedStudent`, para cambiar solo lo que cada test prueba. */
    const SAME_DATA = {
      cafeteria: true,
      scholarship: true,
      foodType: 'Vegetariana',
      observations: 'Diabetes tipo 1',
    } as const;

    it('changes the name and returns how the student was and how it is now', async () => {
      const { first, student } = await seedStudent();

      const result = await repository.update(
        SCHOOL_ID,
        student.id,
        changesFor('Juanito', 'García López', SAME_DATA),
        first.courseId,
        first.classes[0]?.id ?? null,
      );

      expect(result?.before).toMatchObject({ firstName: 'Juan', lastName: 'García' });
      expect(result?.after).toEqual({
        id: student.id,
        firstName: 'Juanito',
        lastName: 'García López',
        course: { id: first.courseId, name: '1º Primaria' },
        class: { id: first.classes[0]?.id, name: 'A' },
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Diabetes tipo 1',
      });
      await expect(repository.findById(SCHOOL_ID, student.id)).resolves.toEqual(result?.after);
    });

    it('moves the student to another course and class', async () => {
      const { second, student } = await seedStudent();

      const result = await repository.update(
        SCHOOL_ID,
        student.id,
        changesFor('Juan', 'García', SAME_DATA),
        second.courseId,
        second.classes[0]?.id ?? null,
      );

      expect(result?.before.course?.name).toBe('1º Primaria');
      expect(result?.after).toMatchObject({
        course: { id: second.courseId, name: '2º Primaria' },
        class: { id: second.classes[0]?.id, name: 'A' },
      });
    });

    it('changes the class inside the course and removes it', async () => {
      const { first, student } = await seedStudent();
      const keep = changesFor('Juan', 'García', SAME_DATA);

      const toB = await repository.update(
        SCHOOL_ID,
        student.id,
        keep,
        first.courseId,
        first.classes[1]?.id ?? null,
      );
      const none = await repository.update(SCHOOL_ID, student.id, keep, first.courseId, null);

      expect(toB?.after.class).toEqual({ id: first.classes[1]?.id, name: 'B' });
      expect(none?.after.class).toBeNull();
      expect(none?.after.course?.id).toBe(first.courseId);
    });

    it('leaves the scholarship and the food type null when the student stops eating at school', async () => {
      const { first, student } = await seedStudent();

      const result = await repository.update(
        SCHOOL_ID,
        student.id,
        changesFor('Juan', 'García', { observations: null }),
        first.courseId,
        first.classes[0]?.id ?? null,
      );

      expect(result?.after).toMatchObject({
        cafeteria: false,
        scholarship: null,
        foodType: null,
        observations: null,
      });
      const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
      expect(stored).toMatchObject({ cafeteria: false, scholarship: null, foodType: null });
    });

    it('assigns a course to a student whose course was deleted', async () => {
      const { first, second, student } = await seedStudent();
      await testPrisma.course.delete({ where: { id: first.courseId } });
      await expect(repository.findById(SCHOOL_ID, student.id)).resolves.toMatchObject({
        course: null,
        class: null,
      });

      const result = await repository.update(
        SCHOOL_ID,
        student.id,
        changesFor('Juan', 'García'),
        second.courseId,
        second.classes[0]?.id ?? null,
      );

      expect(result?.before).toMatchObject({ course: null, class: null });
      expect(result?.after).toMatchObject({
        course: { id: second.courseId, name: '2º Primaria' },
        class: { id: second.classes[0]?.id, name: 'A' },
      });
    });

    it('never touches the identifier, the school or the creation date', async () => {
      const { first, student } = await seedStudent();
      const before = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });

      await repository.update(
        SCHOOL_ID,
        student.id,
        changesFor('Juanito', 'García'),
        first.courseId,
        null,
      );

      const after = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
      expect(after).toMatchObject({ id: before.id, schoolId: SCHOOL_ID });
      expect(after.createdAt).toEqual(before.createdAt);
      expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
    });

    it('returns null for a student of another school and changes nothing', async () => {
      const { first, student } = await seedStudent();
      const before = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });

      const result = await repository.update(
        OTHER_SCHOOL_ID,
        student.id,
        changesFor('Otro', 'Nombre'),
        first.courseId,
        null,
      );

      expect(result).toBeNull();
      await expect(
        testPrisma.student.findUniqueOrThrow({ where: { id: student.id } }),
      ).resolves.toEqual(before);
    });

    it('returns null for an unknown student, even with a course that does not exist', async () => {
      const { first } = await seedStudent();

      await expect(
        repository.update(SCHOOL_ID, nextId(), changesFor('Juan', 'García'), first.courseId, null),
      ).resolves.toBeNull();
      await expect(
        repository.update(SCHOOL_ID, nextId(), changesFor('Juan', 'García'), nextId(), null),
      ).resolves.toBeNull();
    });

    it('throws CourseNotFound for a course of another school or one that does not exist, changing nothing', async () => {
      const { student } = await seedStudent();
      const other = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const before = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });

      for (const courseId of [other.courseId, nextId()]) {
        await expect(
          repository.update(SCHOOL_ID, student.id, changesFor('Otro', 'Nombre'), courseId, null),
        ).rejects.toBeInstanceOf(CourseNotFound);
      }

      await expect(
        testPrisma.student.findUniqueOrThrow({ where: { id: student.id } }),
      ).resolves.toEqual(before);
    });

    it('throws ClassNotFound for a class of another course, of another school or unknown, changing nothing', async () => {
      const { first, second, student } = await seedStudent();
      const other = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const before = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });

      for (const classId of [second.classes[0]?.id ?? '', other.classes[0]?.id ?? '', nextId()]) {
        await expect(
          repository.update(
            SCHOOL_ID,
            student.id,
            changesFor('Otro', 'Nombre'),
            first.courseId,
            classId,
          ),
        ).rejects.toBeInstanceOf(ClassNotFound);
      }

      await expect(
        testPrisma.student.findUniqueOrThrow({ where: { id: student.id } }),
      ).resolves.toEqual(before);
    });

    it('saves nothing when the update fails', async () => {
      const { first, student } = await seedStudent();
      const before = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
      // Un disparador que rechaza cualquier edición de alumno hace fallar la operación.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_student_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_student_update BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION reject_student_update()',
      );

      try {
        await expect(
          repository.update(
            SCHOOL_ID,
            student.id,
            changesFor('Otro', 'Nombre'),
            first.courseId,
            null,
          ),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_student_update ON students');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_student_update()');
      }

      await expect(
        testPrisma.student.findUniqueOrThrow({ where: { id: student.id } }),
      ).resolves.toEqual(before);
    });
  });

  describe('update at the same time as other writes', () => {
    it('either moves the student or finds the target course deleted, never an error or a dangling course', async () => {
      // La edición toma el curso destino en modo compartido y el borrado lo bloquea en exclusivo: van una
      // detrás de otra. Gane quien gane, o la edición no se aplica (`CourseNotFound`) o el alumno se queda
      // sin curso ni clase tras el borrado.
      for (let round = 0; round < 8; round += 1) {
        const origin = await createCourse(SCHOOL_ID, `Origen ${String(round)}`);
        const target = await createCourse(SCHOOL_ID, `Destino ${String(round)}`);
        const student = newStudent('Juan', `García ${String(round)}`);
        await repository.create(SCHOOL_ID, student, origin.courseId, origin.classes[0]?.id ?? null);

        const [updated, deleted] = await Promise.allSettled([
          repository.update(
            SCHOOL_ID,
            student.id,
            changesFor('Juan', `García ${String(round)}`),
            target.courseId,
            target.classes[0]?.id ?? null,
          ),
          courseRepository.delete(SCHOOL_ID, target.courseId),
        ]);

        expect(deleted.status).toBe('fulfilled');
        const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
        if (updated.status === 'rejected') {
          expect(updated.reason).toBeInstanceOf(CourseNotFound);
          expect(stored).toMatchObject({
            courseId: origin.courseId,
            classId: origin.classes[0]?.id,
          });
        } else {
          expect(stored).toMatchObject({ courseId: null, classId: null });
        }
      }
    });

    it('does not deadlock with the deletion of the course the student leaves', async () => {
      for (let round = 0; round < 8; round += 1) {
        const origin = await createCourse(SCHOOL_ID, `Origen ${String(round)}`);
        const target = await createCourse(SCHOOL_ID, `Destino ${String(round)}`);
        const student = newStudent('Juan', `García ${String(round)}`);
        await repository.create(SCHOOL_ID, student, origin.courseId, origin.classes[0]?.id ?? null);

        const [updated, deleted] = await Promise.allSettled([
          repository.update(
            SCHOOL_ID,
            student.id,
            changesFor('Juan', `García ${String(round)}`),
            target.courseId,
            target.classes[0]?.id ?? null,
          ),
          courseRepository.delete(SCHOOL_ID, origin.courseId),
        ]);

        expect(updated.status).toBe('fulfilled');
        expect(deleted.status).toBe('fulfilled');
        expect(
          await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } }),
        ).toMatchObject({ courseId: target.courseId, classId: target.classes[0]?.id });
      }
    });

    it('lets two edits of the same student finish one after the other, the last one wins', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria');
      const student = newStudent('Juan', 'García');
      await repository.create(SCHOOL_ID, student, courseId, classes[0]?.id ?? null);

      const results = await Promise.all(
        ['Primero', 'Segundo'].map((name) =>
          repository.update(
            SCHOOL_ID,
            student.id,
            changesFor(name, 'García'),
            courseId,
            classes[0]?.id ?? null,
          ),
        ),
      );

      expect(results.every((result) => result !== null)).toBe(true);
      const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
      expect(['Primero', 'Segundo']).toContain(stored.firstName);
      // Cada edición vio el estado en que la dejó la anterior: la segunda parte de la primera.
      const [first, second] = results;
      const laterBefore = [first?.before.firstName, second?.before.firstName];
      expect(laterBefore).toContain('Juan');
      expect(laterBefore.some((name) => name === 'Primero' || name === 'Segundo')).toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes the student and nothing else', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria');
      const classId = classes[0]?.id ?? null;
      const doomed = newStudent('Ana', 'García', {
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Alérgica a los frutos secos',
      });
      const stays = newStudent('Juan', 'López');
      await repository.create(SCHOOL_ID, doomed, courseId, classId);
      await repository.create(SCHOOL_ID, stays, courseId, classId);
      const before = await testPrisma.student.findUniqueOrThrow({ where: { id: stays.id } });

      await expect(repository.delete(SCHOOL_ID, doomed.id)).resolves.toBe(true);

      await expect(testPrisma.student.findUnique({ where: { id: doomed.id } })).resolves.toBeNull();
      await expect(
        testPrisma.student.findUniqueOrThrow({ where: { id: stays.id } }),
      ).resolves.toEqual(before);
      await expect(testPrisma.course.count({ where: { id: courseId } })).resolves.toBe(1);
      await expect(testPrisma.schoolClass.count({ where: { courseId } })).resolves.toBe(1);
    });

    it('deletes a student with no course and no class', async () => {
      const student = newStudent('Ana', 'García');
      const { courseId } = await createCourse(SCHOOL_ID, '1º Primaria');
      await repository.create(SCHOOL_ID, student, courseId, null);
      await testPrisma.course.delete({ where: { id: courseId } });

      await expect(repository.delete(SCHOOL_ID, student.id)).resolves.toBe(true);

      await expect(studentCount()).resolves.toBe(0);
    });

    it('returns false, deleting nothing, for a student of another school, an unknown one and one already deleted', async () => {
      const other = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const foreign = newStudent('Ana', 'García');
      await repository.create(OTHER_SCHOOL_ID, foreign, other.courseId, null);

      await expect(repository.delete(SCHOOL_ID, foreign.id)).resolves.toBe(false);
      await expect(repository.delete(SCHOOL_ID, nextId())).resolves.toBe(false);
      await expect(studentCount()).resolves.toBe(1);

      await expect(repository.delete(OTHER_SCHOOL_ID, foreign.id)).resolves.toBe(true);
      await expect(repository.delete(OTHER_SCHOOL_ID, foreign.id)).resolves.toBe(false);
    });

    it('deletes nothing when the deletion fails', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria');
      const student = newStudent('Ana', 'García');
      await repository.create(SCHOOL_ID, student, courseId, classes[0]?.id ?? null);
      const before = await testPrisma.student.findUniqueOrThrow({ where: { id: student.id } });
      // Un disparador que rechaza cualquier borrado de alumno hace fallar la operación.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_student_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_student_delete BEFORE DELETE ON students FOR EACH ROW EXECUTE FUNCTION reject_student_delete()',
      );

      try {
        await expect(repository.delete(SCHOOL_ID, student.id)).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_student_delete ON students');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_student_delete()');
      }

      await expect(
        testPrisma.student.findUniqueOrThrow({ where: { id: student.id } }),
      ).resolves.toEqual(before);
    });
  });

  describe('delete at the same time as other writes', () => {
    it('lets only one of two simultaneous deletions delete the student', async () => {
      const { courseId } = await createCourse(SCHOOL_ID, '1º Primaria');
      const student = newStudent('Ana', 'García');
      await repository.create(SCHOOL_ID, student, courseId, null);

      const results = await Promise.all([
        repository.delete(SCHOOL_ID, student.id),
        repository.delete(SCHOOL_ID, student.id),
      ]);

      expect([...results].sort()).toEqual([false, true]);
      await expect(studentCount()).resolves.toBe(0);
    });

    it('makes an edit that waits for the deletion find no student', async () => {
      for (let round = 0; round < 8; round += 1) {
        const { courseId, classes } = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const student = newStudent('Juan', `García ${String(round)}`);
        await repository.create(SCHOOL_ID, student, courseId, classes[0]?.id ?? null);

        const [updated, deleted] = await Promise.all([
          repository.update(
            SCHOOL_ID,
            student.id,
            changesFor('Otro', `García ${String(round)}`),
            courseId,
            classes[0]?.id ?? null,
          ),
          repository.delete(SCHOOL_ID, student.id),
        ]);

        // El borrado siempre encuentra al alumno (la edición no lo borra) y, si la edición esperó a que
        // el borrado confirmase, no encuentra la fila; si fue antes, el alumno editado se borra después.
        expect(deleted).toBe(true);
        expect(updated === null || updated.after.firstName === 'Otro').toBe(true);
        await expect(
          testPrisma.student.findUnique({ where: { id: student.id } }),
        ).resolves.toBeNull();
      }
    });

    it('does not deadlock with the deletion of the course of the student', async () => {
      for (let round = 0; round < 8; round += 1) {
        const { courseId, classes } = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const student = newStudent('Juan', `García ${String(round)}`);
        await repository.create(SCHOOL_ID, student, courseId, classes[0]?.id ?? null);

        const [deletedStudent, deletedCourse] = await Promise.allSettled([
          repository.delete(SCHOOL_ID, student.id),
          courseRepository.delete(SCHOOL_ID, courseId),
        ]);

        expect(deletedStudent).toEqual({ status: 'fulfilled', value: true });
        expect(deletedCourse.status).toBe('fulfilled');
        await expect(
          testPrisma.student.findUnique({ where: { id: student.id } }),
        ).resolves.toBeNull();
        await expect(testPrisma.course.count({ where: { id: courseId } })).resolves.toBe(0);
      }
    });
  });

  describe('findById', () => {
    it('returns the student with its course, its class and its sensitive data', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria', ['A', 'B']);
      const student = newStudent('Juan', 'García', {
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Necesita apoyo\ncon la lectura',
      });
      await repository.create(SCHOOL_ID, student, courseId, classes[1]?.id ?? null);

      await expect(repository.findById(SCHOOL_ID, student.id)).resolves.toEqual({
        id: student.id,
        firstName: 'Juan',
        lastName: 'García',
        course: { id: courseId, name: '1º Primaria' },
        class: { id: classes[1]?.id, name: 'B' },
        cafeteria: true,
        scholarship: true,
        foodType: 'Vegetariana',
        observations: 'Necesita apoyo\ncon la lectura',
      });
    });

    it('returns a student without class with class null', async () => {
      const { courseId } = await createCourse(SCHOOL_ID, '1º Primaria');
      const student = newStudent('Ana', 'Álvarez');
      await repository.create(SCHOOL_ID, student, courseId, null);

      await expect(repository.findById(SCHOOL_ID, student.id)).resolves.toMatchObject({
        course: { id: courseId, name: '1º Primaria' },
        class: null,
        foodType: null,
        observations: null,
      });
    });

    it('returns a student without course, whose course was deleted, with course and class null', async () => {
      const { courseId, classes } = await createCourse(SCHOOL_ID, '1º Primaria');
      const student = newStudent('Eva', 'García');
      await repository.create(SCHOOL_ID, student, courseId, classes[0]?.id ?? null);
      await testPrisma.course.delete({ where: { id: courseId } });

      await expect(repository.findById(SCHOOL_ID, student.id)).resolves.toMatchObject({
        id: student.id,
        course: null,
        class: null,
      });
    });

    it('returns null for a student of another school, as if it did not exist', async () => {
      const { courseId } = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const student = newStudent('Juan', 'García');
      await repository.create(OTHER_SCHOOL_ID, student, courseId, null);

      await expect(repository.findById(SCHOOL_ID, student.id)).resolves.toBeNull();
    });

    it('returns null for an unknown id', async () => {
      await expect(repository.findById(SCHOOL_ID, nextId())).resolves.toBeNull();
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
    [
      'update',
      (repository: PrismaStudentRepository) =>
        repository.update(SCHOOL_ID, nextId(), changesFor('Juan', 'García'), nextId(), null),
    ],
    ['findById', (repository: PrismaStudentRepository) => repository.findById(SCHOOL_ID, nextId())],
    ['delete', (repository: PrismaStudentRepository) => repository.delete(SCHOOL_ID, nextId())],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
