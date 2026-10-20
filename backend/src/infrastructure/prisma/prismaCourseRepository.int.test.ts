import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import {
  CourseAlreadyExists,
  CourseChanged,
  CourseNotFound,
} from '../../domain/course/courseErrors.js';
import type { NewCourse } from '../../domain/course/courseRepository.js';
import {
  planCourseUpdate,
  type CourseUpdatePlan,
  type RequestedCourse,
} from '../../domain/course/courseUpdate.js';
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

/** Clase del estado pedido: `existing` si lleva el `id` de una clase que ya tiene el curso. */
interface WantedClass {
  id: string;
  existing: boolean;
  name: string;
}

function requestedCourse(name: string, classes: WantedClass[]): RequestedCourse {
  return {
    name,
    normalizedName: name.toLowerCase(),
    classes: classes.map((schoolClass) => ({
      ...schoolClass,
      normalizedName: schoolClass.name.toLowerCase(),
    })),
  };
}

/** Una clase que el curso ya tiene, con el nombre pedido. */
const keep = (id: string | undefined, name: string): WantedClass => ({
  id: id ?? '',
  existing: true,
  name,
});

/** Una clase nueva con un `id` recién generado. */
const added = (name: string): WantedClass => ({ id: nextId(), existing: false, name });

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

  describe('findById', () => {
    it('returns the course of the school with its classes', async () => {
      const course = newCourse('1º Primaria', ['A', 'B']);
      await repository.create(SCHOOL_ID, course);

      const found = await repository.findById(SCHOOL_ID, course.id);

      expect(found).toMatchObject({ id: course.id, name: '1º Primaria' });
      expect(found?.classes.map(({ name }) => name).sort()).toEqual(['A', 'B']);
      expect(found?.classes.every(({ tutor }) => tutor === null)).toBe(true);
      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(found?.createdAt).toEqual(stored.createdAt);
    });

    it('returns null for a course of another school', async () => {
      const course = newCourse('1º Primaria', ['A']);
      await repository.create(OTHER_SCHOOL_ID, course);

      await expect(repository.findById(SCHOOL_ID, course.id)).resolves.toBeNull();
    });

    it('returns null for a course that does not exist', async () => {
      await expect(repository.findById(SCHOOL_ID, nextId())).resolves.toBeNull();
    });
  });

  describe('update', () => {
    /** Ejecuta la edición con la regla de dominio, como lo hace el caso de uso. */
    function edit(schoolId: string, courseId: string, requested: RequestedCourse) {
      return repository.update(schoolId, courseId, requested, (current) =>
        planCourseUpdate(current, requested),
      );
    }

    /** Crea «1º Primaria» con A, B y C y devuelve el curso y el `id` de cada clase por nombre. */
    async function createAbc() {
      const course = newCourse('1º Primaria', ['A', 'B', 'C']);
      await repository.create(SCHOOL_ID, course);
      const ids = Object.fromEntries(course.classes.map(({ id, name }) => [name, id]));
      return { course, ids: ids as Record<'A' | 'B' | 'C', string> };
    }

    async function storedClasses(courseId: string) {
      const classes = await testPrisma.schoolClass.findMany({ where: { courseId } });
      return Object.fromEntries(classes.map(({ id, name }) => [id, name]));
    }

    it('changes the name of the course and keeps its classes', async () => {
      const { course, ids } = await createAbc();
      const before = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });

      const { course: updated, plan } = await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria Tarde', [
          keep(ids.A, 'A'),
          keep(ids.B, 'B'),
          keep(ids.C, 'C'),
        ]),
      );

      expect(updated.name).toBe('1º Primaria Tarde');
      expect(updated.createdAt).toEqual(before.createdAt);
      expect(plan.courseRenamed).toBe(true);
      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(stored).toMatchObject({
        name: '1º Primaria Tarde',
        normalizedName: '1º primaria tarde',
      });
      expect(stored.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
      expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A', [ids.B]: 'B', [ids.C]: 'C' });
    });

    it('renames a class keeping its id', async () => {
      const { course, ids } = await createAbc();

      const { course: updated } = await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria', [
          keep(ids.A, 'Grupo A'),
          keep(ids.B, 'B'),
          keep(ids.C, 'C'),
        ]),
      );

      expect(updated.classes.find(({ id }) => id === ids.A)?.name).toBe('Grupo A');
      expect(await storedClasses(course.id)).toEqual({
        [ids.A]: 'Grupo A',
        [ids.B]: 'B',
        [ids.C]: 'C',
      });
      const stored = await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: ids.A } });
      expect(stored.normalizedName).toBe('grupo a');
    });

    it('removes the classes that are not requested and creates the new ones', async () => {
      const { course, ids } = await createAbc();
      const created = added('D');

      const { course: updated, plan } = await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A'), keep(ids.B, 'B'), created]),
      );

      expect(plan.removed).toEqual([ids.C]);
      expect(updated.classes.map(({ name }) => name).sort()).toEqual(['A', 'B', 'D']);
      expect(await storedClasses(course.id)).toEqual({
        [ids.A]: 'A',
        [ids.B]: 'B',
        [created.id]: 'D',
      });
    });

    it('swaps the names of two classes without breaking the unique index', async () => {
      const { course, ids } = await createAbc();

      await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'B'), keep(ids.B, 'A'), keep(ids.C, 'C')]),
      );

      expect(await storedClasses(course.id)).toEqual({
        [ids.A]: 'B',
        [ids.B]: 'A',
        [ids.C]: 'C',
      });
    });

    it('renames a class to the name of another that is removed in the same edit', async () => {
      const { course, ids } = await createAbc();

      await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'C'), keep(ids.B, 'B')]),
      );

      expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'C', [ids.B]: 'B' });
    });

    it('creates a class with the name of one removed in the same edit, with a new id', async () => {
      const { course, ids } = await createAbc();
      const again = added('C');

      await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A'), keep(ids.B, 'B'), again]),
      );

      const classes = await storedClasses(course.id);
      expect(classes).toEqual({ [ids.A]: 'A', [ids.B]: 'B', [again.id]: 'C' });
      expect(again.id).not.toBe(ids.C);
    });

    it('accepts a course name that only changes its capitals, which does not count against itself', async () => {
      const course = newCourse('1º primaria', ['A']);
      await repository.create(SCHOOL_ID, course);

      const { course: updated } = await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria', [keep(course.classes[0]?.id, 'A')]),
      );

      expect(updated.name).toBe('1º Primaria');
      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(stored.name).toBe('1º Primaria');
    });

    it('returns the course in its final state with the stored creation date', async () => {
      const { course, ids } = await createAbc();

      const { course: updated } = await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A'), added('D')]),
      );

      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(updated).toMatchObject({ id: course.id, createdAt: stored.createdAt });
      expect(updated.classes.map(({ name }) => name).sort()).toEqual(['A', 'D']);
      expect(updated.classes.every(({ tutor }) => tutor === null)).toBe(true);
    });

    it('writes nothing when the requested state is the stored one', async () => {
      const { course, ids } = await createAbc();
      const before = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });

      const { plan } = await edit(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A'), keep(ids.B, 'B'), keep(ids.C, 'C')]),
      );

      expect(plan).toEqual({ courseRenamed: false, removed: [], renamed: [], created: [] });
      const after = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it('throws CourseAlreadyExists when another course of the school has the name, and changes nothing', async () => {
      const { course, ids } = await createAbc();
      await repository.create(SCHOOL_ID, newCourse('6º Primaria', ['A']));

      await expect(
        edit(
          SCHOOL_ID,
          course.id,
          requestedCourse('6º PRIMARIA', [keep(ids.A, 'Grupo A'), keep(ids.B, 'B'), added('D')]),
        ),
      ).rejects.toBeInstanceOf(CourseAlreadyExists);

      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(stored.name).toBe('1º Primaria');
      expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A', [ids.B]: 'B', [ids.C]: 'C' });
    });

    it('allows a name that another school already has', async () => {
      const { course, ids } = await createAbc();
      await repository.create(OTHER_SCHOOL_ID, newCourse('6º Primaria', ['A']));

      await expect(
        edit(
          SCHOOL_ID,
          course.id,
          requestedCourse('6º Primaria', [keep(ids.A, 'A'), keep(ids.B, 'B'), keep(ids.C, 'C')]),
        ),
      ).resolves.toMatchObject({ course: { name: '6º Primaria' } });
    });

    it('throws CourseChanged for a class that the course no longer has, and changes nothing', async () => {
      const { course, ids } = await createAbc();
      await testPrisma.schoolClass.delete({ where: { id: ids.B } });

      await expect(
        edit(
          SCHOOL_ID,
          course.id,
          requestedCourse('1º Primaria Tarde', [keep(ids.A, 'Grupo A'), keep(ids.B, 'B')]),
        ),
      ).rejects.toBeInstanceOf(CourseChanged);

      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(stored.name).toBe('1º Primaria');
      expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A', [ids.C]: 'C' });
    });

    it('throws CourseChanged for a class of another course and touches neither course', async () => {
      const { course, ids } = await createAbc();
      const other = newCourse('2º Primaria', ['X']);
      await repository.create(SCHOOL_ID, other);
      const otherClassId = other.classes[0]?.id;

      await expect(
        edit(
          SCHOOL_ID,
          course.id,
          requestedCourse('1º Primaria', [keep(ids.A, 'A'), keep(otherClassId, 'Y')]),
        ),
      ).rejects.toBeInstanceOf(CourseChanged);

      expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A', [ids.B]: 'B', [ids.C]: 'C' });
      expect(await storedClasses(other.id)).toEqual({ [otherClassId ?? '']: 'X' });
    });

    it('throws CourseNotFound for a course of another school and changes nothing', async () => {
      const course = newCourse('1º Primaria', ['A']);
      await repository.create(OTHER_SCHOOL_ID, course);

      await expect(
        edit(SCHOOL_ID, course.id, requestedCourse('Otro', [keep(course.classes[0]?.id, 'A')])),
      ).rejects.toBeInstanceOf(CourseNotFound);

      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(stored.name).toBe('1º Primaria');
    });

    it('throws CourseNotFound for a course that does not exist', async () => {
      await expect(
        edit(SCHOOL_ID, nextId(), requestedCourse('Otro', [added('A')])),
      ).rejects.toBeInstanceOf(CourseNotFound);
      expect(await counts()).toEqual({ courses: 0, classes: 0 });
    });

    it('leaves the course as it was when a write fails halfway', async () => {
      const { course, ids } = await createAbc();
      // Un plan que, tras borrar A y renombrar B, crea una clase con el nombre normalizado de C: el índice
      // único de las clases lo rechaza en el último paso, cuando ya se ha escrito lo anterior.
      const brokenPlan = (): CourseUpdatePlan => ({
        courseRenamed: true,
        removed: [ids.A],
        renamed: [{ id: ids.B, name: 'X', normalizedName: 'x', normalizedNameChanged: true }],
        created: [{ id: nextId(), name: 'C', normalizedName: 'c' }],
      });

      const attempt = repository.update(
        SCHOOL_ID,
        course.id,
        requestedCourse('1º Primaria Tarde', [keep(ids.B, 'X')]),
        brokenPlan,
      );

      await expect(attempt).rejects.toThrow();
      await expect(attempt).rejects.not.toBeInstanceOf(CourseAlreadyExists);
      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(stored.name).toBe('1º Primaria');
      expect(await storedClasses(course.id)).toEqual({ [ids.A]: 'A', [ids.B]: 'B', [ids.C]: 'C' });
    });

    it('serializes two simultaneous edits: renaming a class that the other removes ends in CourseChanged or in its removal', async () => {
      const { course, ids } = await createAbc();

      const results = await Promise.allSettled([
        edit(
          SCHOOL_ID,
          course.id,
          requestedCourse('1º Primaria', [keep(ids.A, 'A'), keep(ids.C, 'C')]),
        ),
        edit(
          SCHOOL_ID,
          course.id,
          requestedCourse('1º Primaria', [
            keep(ids.A, 'A'),
            keep(ids.B, 'Grupo B'),
            keep(ids.C, 'C'),
          ]),
        ),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(CourseChanged);
        }
      }
      // Si el borrado va primero, el renombrado falla; si va segundo, el borrado quita la clase renombrada.
      const classes = await storedClasses(course.id);
      expect(Object.keys(classes).sort()).toEqual([ids.A, ids.C].sort());
    });
  });

  describe('impactOf', () => {
    it('counts the classes of the course and reports no students yet, without changing anything', async () => {
      const course = newCourse('1º Primaria', ['A', 'B', 'C']);
      await repository.create(SCHOOL_ID, course);

      await expect(repository.impactOf(SCHOOL_ID, course.id)).resolves.toEqual({
        classCount: 3,
        studentCount: 0,
      });

      expect(await counts()).toEqual({ courses: 1, classes: 3 });
    });

    it('returns null for a course of another school', async () => {
      const course = newCourse('1º Primaria', ['A']);
      await repository.create(OTHER_SCHOOL_ID, course);

      await expect(repository.impactOf(SCHOOL_ID, course.id)).resolves.toBeNull();
    });

    it('returns null for a course that does not exist', async () => {
      await expect(repository.impactOf(SCHOOL_ID, nextId())).resolves.toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes the course and its classes and returns what it deleted, leaving the other courses alone', async () => {
      const course = newCourse('1º Primaria', ['A', 'B', 'C']);
      const other = newCourse('2º Primaria', ['A', 'B']);
      await repository.create(SCHOOL_ID, course);
      await repository.create(SCHOOL_ID, other);

      await expect(repository.delete(SCHOOL_ID, course.id)).resolves.toEqual({
        classCount: 3,
        studentCount: 0,
      });

      expect(await testPrisma.course.findUnique({ where: { id: course.id } })).toBeNull();
      expect(await testPrisma.schoolClass.count({ where: { courseId: course.id } })).toBe(0);
      expect(await counts()).toEqual({ courses: 1, classes: 2 });
      expect(await repository.findById(SCHOOL_ID, other.id)).not.toBeNull();
    });

    it('returns null for a course of another school and deletes nothing', async () => {
      const course = newCourse('1º Primaria', ['A', 'B']);
      await repository.create(OTHER_SCHOOL_ID, course);

      await expect(repository.delete(SCHOOL_ID, course.id)).resolves.toBeNull();

      expect(await counts()).toEqual({ courses: 1, classes: 2 });
    });

    it('returns null for a course that does not exist, and for one that was already deleted', async () => {
      const course = newCourse('1º Primaria', ['A']);
      await repository.create(SCHOOL_ID, course);

      await expect(repository.delete(SCHOOL_ID, nextId())).resolves.toBeNull();
      await expect(repository.delete(SCHOOL_ID, course.id)).resolves.not.toBeNull();
      await expect(repository.delete(SCHOOL_ID, course.id)).resolves.toBeNull();
    });

    it('leaves the course and all its classes when deleting one of them fails', async () => {
      const course = newCourse('1º Primaria', ['A', 'B', 'C']);
      await repository.create(SCHOOL_ID, course);
      // Un disparador que rechaza el borrado de cualquier clase hace fallar la cascada a mitad del borrado.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_class_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_class_delete BEFORE DELETE ON classes FOR EACH ROW EXECUTE FUNCTION reject_class_delete()',
      );

      try {
        await expect(repository.delete(SCHOOL_ID, course.id)).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_class_delete ON classes');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_class_delete()');
      }

      expect(await counts()).toEqual({ courses: 1, classes: 3 });
    });

    it('lets only one of two simultaneous deletes delete the course', async () => {
      const course = newCourse('1º Primaria', ['A', 'B']);
      await repository.create(SCHOOL_ID, course);

      const results = await Promise.all([
        repository.delete(SCHOOL_ID, course.id),
        repository.delete(SCHOOL_ID, course.id),
      ]);

      expect(results.filter((result) => result !== null)).toEqual([
        { classCount: 2, studentCount: 0 },
      ]);
      expect(await counts()).toEqual({ courses: 0, classes: 0 });
    });

    it('serializes an edit and a delete of the same course: the edit that comes after the delete finds no course', async () => {
      const course = newCourse('1º Primaria', ['A', 'B']);
      await repository.create(SCHOOL_ID, course);
      const requested = requestedCourse('1º Primaria Tarde', [
        keep(course.classes[0]?.id, 'A'),
        keep(course.classes[1]?.id, 'B'),
      ]);

      const results = await Promise.allSettled([
        repository.delete(SCHOOL_ID, course.id),
        repository.update(SCHOOL_ID, course.id, requested, (current) =>
          planCourseUpdate(current, requested),
        ),
      ]);

      for (const result of results) {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(CourseNotFound);
        }
      }
      expect(results[0]).toMatchObject({ status: 'fulfilled' });
      expect(await counts()).toEqual({ courses: 0, classes: 0 });
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
    ['findById', (repository: PrismaCourseRepository) => repository.findById(SCHOOL_ID, nextId())],
    ['impactOf', (repository: PrismaCourseRepository) => repository.impactOf(SCHOOL_ID, nextId())],
    ['delete', (repository: PrismaCourseRepository) => repository.delete(SCHOOL_ID, nextId())],
    [
      'update',
      (repository: PrismaCourseRepository) => {
        const requested = requestedCourse('1º Primaria', [added('A')]);
        return repository.update(SCHOOL_ID, nextId(), requested, (current) =>
          planCourseUpdate(current, requested),
        );
      },
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
