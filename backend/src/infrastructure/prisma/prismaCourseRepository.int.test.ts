import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import {
  CourseAlreadyExists,
  CourseChanged,
  CourseNotFound,
  ProfessorAlreadyTutor,
  TutorNotFound,
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
  /** Tutor pedido: ausente, no cambia; `null`, se quita; el `id` de un profesor, se asigna. */
  tutorId?: string | null;
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
const keep = (id: string | undefined, name: string, tutorId?: string | null): WantedClass => ({
  id: id ?? '',
  existing: true,
  name,
  ...(tutorId !== undefined && { tutorId }),
});

/** Una clase nueva con un `id` recién generado. */
const added = (name: string, tutorId?: string | null): WantedClass => ({
  id: nextId(),
  existing: false,
  name,
  ...(tutorId !== undefined && { tutorId }),
});

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
      return repository.update(schoolId, courseId, requested, (current, tutors) =>
        planCourseUpdate(current, requested, tutors),
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

      expect(plan).toEqual({
        courseRenamed: false,
        removed: [],
        renamed: [],
        created: [],
        tutorsChanged: [],
      });
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
        tutorsChanged: [],
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
    it('counts the classes of the course and reports no students when it has none, without changing anything', async () => {
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

  describe('tutors of the classes', () => {
    /** Crea un profesor del colegio y lo pone de tutor de la clase. */
    async function tutorOf(classId: string, firstName: string, lastName: string) {
      const id = nextId();
      await testPrisma.professor.create({ data: { id, schoolId: SCHOOL_ID, firstName, lastName } });
      await testPrisma.schoolClass.update({ where: { id: classId }, data: { tutorId: id } });
      return id;
    }

    /** Crea «1º Primaria» con A, B y C, con Ana García de tutora de la A. */
    async function createAbcTutoredA() {
      const course = newCourse('1º Primaria', ['A', 'B', 'C']);
      await repository.create(SCHOOL_ID, course);
      const ids = Object.fromEntries(course.classes.map(({ id, name }) => [name, id])) as Record<
        'A' | 'B' | 'C',
        string
      >;
      const tutorId = await tutorOf(ids.A, 'Ana', 'García');
      return { course, ids, tutorId };
    }

    it('returns the tutor of each class in the list and when reading one course, and null for the others', async () => {
      const { course, ids, tutorId } = await createAbcTutoredA();

      const [listed] = await repository.listBySchool(SCHOOL_ID);
      const read = await repository.findById(SCHOOL_ID, course.id);

      for (const found of [listed, read]) {
        const byId = Object.fromEntries((found?.classes ?? []).map((item) => [item.id, item]));
        expect(byId[ids.A]?.tutor).toEqual({ id: tutorId, firstName: 'Ana', lastName: 'García' });
        expect(byId[ids.B]?.tutor).toBeNull();
        expect(byId[ids.C]?.tutor).toBeNull();
      }
    });

    it('creates the classes of a new course without tutor', async () => {
      const created = await repository.create(SCHOOL_ID, newCourse('2º Primaria', ['A']));

      expect(created.classes.map(({ tutor }) => tutor)).toEqual([null]);
    });

    it('keeps the tutor of a class that is renamed in an edit, and returns it in the final course', async () => {
      const { course, ids, tutorId } = await createAbcTutoredA();
      const requested = requestedCourse('1º Primaria', [
        keep(ids.A, 'Grupo A'),
        keep(ids.B, 'B'),
        keep(ids.C, 'C'),
      ]);

      const { course: updated } = await repository.update(
        SCHOOL_ID,
        course.id,
        requested,
        (current) => planCourseUpdate(current, requested),
      );

      expect(updated.classes.find(({ id }) => id === ids.A)).toEqual({
        id: ids.A,
        name: 'Grupo A',
        tutor: { id: tutorId, firstName: 'Ana', lastName: 'García' },
      });
      const stored = await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: ids.A } });
      expect(stored.tutorId).toBe(tutorId);
    });

    it('keeps the tutors when only the name of the course changes and when an unrelated class is removed', async () => {
      const { course, ids, tutorId } = await createAbcTutoredA();
      const requested = requestedCourse('1º Primaria Tarde', [keep(ids.A, 'A'), keep(ids.B, 'B')]);

      await repository.update(SCHOOL_ID, course.id, requested, (current) =>
        planCourseUpdate(current, requested),
      );

      const stored = await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: ids.A } });
      expect(stored.tutorId).toBe(tutorId);
    });

    it('frees the tutor, who still exists, when the class is removed in an edit', async () => {
      const { course, ids, tutorId } = await createAbcTutoredA();
      const requested = requestedCourse('1º Primaria', [keep(ids.B, 'B'), keep(ids.C, 'C')]);

      await repository.update(SCHOOL_ID, course.id, requested, (current) =>
        planCourseUpdate(current, requested),
      );

      expect(await testPrisma.schoolClass.findUnique({ where: { id: ids.A } })).toBeNull();
      const professor = await testPrisma.professor.findUniqueOrThrow({ where: { id: tutorId } });
      expect(professor.firstName).toBe('Ana');
    });

    it('frees the tutors, who still exist, when the course is deleted', async () => {
      const { course, ids, tutorId } = await createAbcTutoredA();
      const otherTutor = await tutorOf(ids.B, 'Luis', 'Pérez');

      await expect(repository.delete(SCHOOL_ID, course.id)).resolves.toEqual({
        classCount: 3,
        studentCount: 0,
      });

      expect(await testPrisma.schoolClass.count({ where: { courseId: course.id } })).toBe(0);
      const professors = await testPrisma.professor.findMany({
        where: { id: { in: [tutorId, otherTutor] } },
      });
      expect(professors).toHaveLength(2);
      expect(
        await testPrisma.schoolClass.count({ where: { tutorId: { in: [tutorId, otherTutor] } } }),
      ).toBe(0);
    });
  });

  describe('tutors set from the edit (US09_b)', () => {
    function edit(courseId: string, requested: RequestedCourse, schoolId = SCHOOL_ID) {
      return repository.update(schoolId, courseId, requested, (current, tutors) =>
        planCourseUpdate(current, requested, tutors),
      );
    }

    async function createCourse(name: string, classNames: string[], schoolId = SCHOOL_ID) {
      const course = newCourse(name, classNames);
      await repository.create(schoolId, course);
      const ids = Object.fromEntries(
        course.classes.map(({ id, name: className }) => [className, id]),
      ) as Record<string, string>;
      return { course, ids };
    }

    async function professor(firstName: string, schoolId = SCHOOL_ID) {
      const id = nextId();
      await testPrisma.professor.create({ data: { id, schoolId, firstName, lastName: 'Test' } });
      return id;
    }

    async function tutorsByClass(courseId: string) {
      const classes = await testPrisma.schoolClass.findMany({ where: { courseId } });
      return Object.fromEntries(classes.map(({ id, tutorId }) => [id, tutorId]));
    }

    it('assigns, changes and removes the tutor of a class', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A', 'B']);
      const ana = await professor('Ana');
      const luis = await professor('Luis');

      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', ana), keep(ids.B, 'B')]),
      );
      expect(await tutorsByClass(course.id)).toEqual({
        [ids.A as string]: ana,
        [ids.B as string]: null,
      });

      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', luis), keep(ids.B, 'B')]),
      );
      expect((await tutorsByClass(course.id))[ids.A as string]).toBe(luis);

      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', null), keep(ids.B, 'B')]),
      );
      expect((await tutorsByClass(course.id))[ids.A as string]).toBeNull();
      expect(await testPrisma.professor.count({ where: { id: { in: [ana, luis] } } })).toBe(2);
    });

    it('moves the tutor from a class to another in one edit', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A', 'B']);
      const ana = await professor('Ana');
      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', ana), keep(ids.B, 'B')]),
      );

      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', null), keep(ids.B, 'B', ana)]),
      );

      expect(await tutorsByClass(course.id)).toEqual({
        [ids.A as string]: null,
        [ids.B as string]: ana,
      });
    });

    it('swaps the tutors of two classes in one edit', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A', 'B']);
      const ana = await professor('Ana');
      const luis = await professor('Luis');
      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', ana), keep(ids.B, 'B', luis)]),
      );

      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', luis), keep(ids.B, 'B', ana)]),
      );

      expect(await tutorsByClass(course.id)).toEqual({
        [ids.A as string]: luis,
        [ids.B as string]: ana,
      });
    });

    it('assigns the tutor of a class created in the same edit, and a null tutor counts as none', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A']);
      const ana = await professor('Ana');
      const withTutor = added('B', ana);
      const withoutTutor = added('C', null);

      const { course: updated } = await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A'), withTutor, withoutTutor]),
      );

      const tutors = await tutorsByClass(course.id);
      expect(tutors[withTutor.id]).toBe(ana);
      expect(tutors[withoutTutor.id]).toBeNull();
      expect(updated.classes.find(({ id }) => id === withTutor.id)?.tutor).toMatchObject({
        id: ana,
      });
    });

    it('passes the tutor of a removed class to another class', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A', 'B']);
      const ana = await professor('Ana');
      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', ana), keep(ids.B, 'B')]),
      );

      await edit(course.id, requestedCourse('1º Primaria', [keep(ids.B, 'B', ana)]));

      expect(await tutorsByClass(course.id)).toEqual({ [ids.B as string]: ana });
    });

    it('keeps the tutors when the request carries no tutorId and classes are renamed, added and removed', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A', 'B', 'C']);
      const ana = await professor('Ana');
      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', ana), keep(ids.B, 'B'), keep(ids.C, 'C')]),
      );

      await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'Grupo A'), keep(ids.B, 'B'), added('D')]),
      );

      expect((await tutorsByClass(course.id))[ids.A as string]).toBe(ana);
    });

    it('returns the final course with the new tutors', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A']);
      const ana = await professor('Ana');

      const { course: updated, plan } = await edit(
        course.id,
        requestedCourse('1º Primaria', [keep(ids.A, 'A', ana)]),
      );

      expect(plan.tutorsChanged).toEqual([{ classId: ids.A, tutorId: ana }]);
      expect(updated.classes[0]?.tutor).toEqual({ id: ana, firstName: 'Ana', lastName: 'Test' });
    });

    it('throws TutorNotFound with the index of the class for a professor of another school or that does not exist', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A', 'B']);
      const foreign = await professor('Marta', OTHER_SCHOOL_ID);

      await expect(
        edit(
          course.id,
          requestedCourse('1º Primaria', [keep(ids.A, 'A'), keep(ids.B, 'B', foreign)]),
        ),
      ).rejects.toMatchObject({ name: TutorNotFound.name, classIndex: 1 });
      await expect(
        edit(course.id, requestedCourse('1º Primaria', [keep(ids.A, 'A', nextId())])),
      ).rejects.toBeInstanceOf(TutorNotFound);
      expect(Object.values(await tutorsByClass(course.id))).toEqual([null, null]);
    });

    it('throws ProfessorAlreadyTutor for a professor of another course and writes nothing, not even the name', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A']);
      const { ids: otherIds } = await createCourse('2º Primaria', ['A']);
      const ana = await professor('Ana');
      await testPrisma.schoolClass.update({
        where: { id: otherIds.A as string },
        data: { tutorId: ana },
      });

      await expect(
        edit(course.id, requestedCourse('1º Primaria Tarde', [keep(ids.A, 'A', ana)])),
      ).rejects.toBeInstanceOf(ProfessorAlreadyTutor);

      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(stored.name).toBe('1º Primaria');
      expect((await tutorsByClass(course.id))[ids.A as string]).toBeNull();
      const other = await testPrisma.schoolClass.findUniqueOrThrow({
        where: { id: otherIds.A as string },
      });
      expect(other.tutorId).toBe(ana);
    });

    it('translates the unique index into ProfessorAlreadyTutor when the professor takes another class between reading and writing', async () => {
      const { course, ids } = await createCourse('1º Primaria', ['A']);
      const { ids: otherIds } = await createCourse('2º Primaria', ['A']);
      const ana = await professor('Ana');
      // La lectura que recibe la regla es la vieja: Ana aún no tutoriza nada, pero ya es tutora de otra clase.
      await testPrisma.schoolClass.update({
        where: { id: otherIds.A as string },
        data: { tutorId: ana },
      });
      const requested = requestedCourse('1º Primaria Tarde', [keep(ids.A, 'A', ana)]);

      await expect(
        repository.update(SCHOOL_ID, course.id, requested, (current) =>
          planCourseUpdate(current, requested, new Map([[ana, { id: ana, tutoredClassId: null }]])),
        ),
      ).rejects.toBeInstanceOf(ProfessorAlreadyTutor);

      const stored = await testPrisma.course.findUniqueOrThrow({ where: { id: course.id } });
      expect(stored.name).toBe('1º Primaria');
    });

    it('lets only one of two simultaneous edits of different courses give the same professor a class', async () => {
      const { course: first, ids: firstIds } = await createCourse('1º Primaria', ['A']);
      const { course: second, ids: secondIds } = await createCourse('2º Primaria', ['A']);
      const ana = await professor('Ana');

      const results = await Promise.allSettled([
        edit(first.id, requestedCourse('1º Primaria', [keep(firstIds.A, 'A', ana)])),
        edit(second.id, requestedCourse('2º Primaria', [keep(secondIds.A, 'A', ana)])),
      ]);

      expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(({ status }) => status === 'rejected');
      expect(rejected?.status === 'rejected' && rejected.reason).toBeInstanceOf(
        ProfessorAlreadyTutor,
      );
      expect(await testPrisma.schoolClass.count({ where: { tutorId: ana } })).toBe(1);
    });
  });

  describe('students of the course (US14)', () => {
    /** Crea un alumno directamente en la base de datos, en el curso y la clase indicados. */
    async function createStudent(courseId: string | null, classId: string | null, name = 'Juan') {
      const id = nextId();
      await testPrisma.student.create({
        data: {
          id,
          schoolId: SCHOOL_ID,
          courseId,
          classId,
          firstName: name,
          lastName: 'García',
          cafeteria: false,
        },
      });
      return id;
    }

    const storedStudent = (id: string) =>
      testPrisma.student.findUniqueOrThrow({
        where: { id },
        select: { courseId: true, classId: true },
      });

    /** Un curso «1º Primaria» con A y B, con dos alumnos en A y uno sin clase, y otro curso con uno. */
    async function courseWithStudents() {
      const course = newCourse('1º Primaria', ['A', 'B']);
      const other = newCourse('2º Primaria', ['A']);
      await repository.create(SCHOOL_ID, course);
      await repository.create(SCHOOL_ID, other);
      const [classA, classB] = course.classes.map(({ id }) => id) as [string, string];
      const students = [
        await createStudent(course.id, classA, 'Ana'),
        await createStudent(course.id, classA, 'Eva'),
        await createStudent(course.id, null, 'Luis'),
      ];
      const otherStudent = await createStudent(other.id, other.classes[0]?.id ?? null, 'Pau');
      return { course, other, classA, classB, students, otherStudent };
    }

    it('counts the students of the course, with and without class, and not those of another course', async () => {
      const { course } = await courseWithStudents();

      await expect(repository.impactOf(SCHOOL_ID, course.id)).resolves.toEqual({
        classCount: 2,
        studentCount: 3,
      });
      expect(await testPrisma.student.count()).toBe(4);
    });

    it('counts the students of the course that is deleted and leaves them without course and class', async () => {
      const { course, other, students, otherStudent } = await courseWithStudents();

      await expect(repository.delete(SCHOOL_ID, course.id)).resolves.toEqual({
        classCount: 2,
        studentCount: 3,
      });

      for (const id of students) {
        expect(await storedStudent(id)).toEqual({ courseId: null, classId: null });
      }
      expect(await storedStudent(otherStudent)).toEqual({
        courseId: other.id,
        classId: other.classes[0]?.id,
      });
    });

    it('reports no students for a course that only has students in another course', async () => {
      const { other } = await courseWithStudents();
      const empty = newCourse('3º Primaria', ['A']);
      await repository.create(SCHOOL_ID, empty);

      await expect(repository.impactOf(SCHOOL_ID, empty.id)).resolves.toEqual({
        classCount: 1,
        studentCount: 0,
      });
      await expect(repository.impactOf(SCHOOL_ID, other.id)).resolves.toMatchObject({
        studentCount: 1,
      });
    });

    it('does not delete any student when the delete of the course fails', async () => {
      const { course, students } = await courseWithStudents();
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

      expect(await testPrisma.student.count()).toBe(4);
      expect(await storedStudent(students[0] ?? '')).toMatchObject({ courseId: course.id });
    });

    it('leaves the students of a class that is removed in the course, without class', async () => {
      const { course, classA, classB, students } = await courseWithStudents();

      const requested = requestedCourse('1º Primaria', [keep(classB, 'B')]);

      await repository.update(SCHOOL_ID, course.id, requested, (current, tutors) =>
        planCourseUpdate(current, requested, tutors),
      );

      expect(await testPrisma.schoolClass.findUnique({ where: { id: classA } })).toBeNull();
      expect(await storedStudent(students[0] ?? '')).toEqual({
        courseId: course.id,
        classId: null,
      });
      expect(await storedStudent(students[1] ?? '')).toEqual({
        courseId: course.id,
        classId: null,
      });
      expect(await storedStudent(students[2] ?? '')).toEqual({
        courseId: course.id,
        classId: null,
      });
    });

    it('keeps the students of a class that is renamed in the same class', async () => {
      const { course, classA, classB, students } = await courseWithStudents();
      const requested = requestedCourse('1º Primaria', [
        keep(classA, 'Grupo A'),
        keep(classB, 'B'),
      ]);

      await repository.update(SCHOOL_ID, course.id, requested, (current, tutors) =>
        planCourseUpdate(current, requested, tutors),
      );

      expect(await storedStudent(students[0] ?? '')).toEqual({
        courseId: course.id,
        classId: classA,
      });
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
