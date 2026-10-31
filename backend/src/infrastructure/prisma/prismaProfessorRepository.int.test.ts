import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { NewProfessor } from '../../domain/professor/professor.js';
import { ProfessorAlreadyTutor } from '../../domain/course/courseErrors.js';
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
        unavailableCount: 0,
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
        unavailableCount: 0,
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

  describe('findById', () => {
    it('returns the professor of the school with its class and course', async () => {
      const { courseId, classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const tutor = newProfessor('Ana', 'García', 'DIRECTOR');
      await repository.create(SCHOOL_ID, tutor, classId);

      await expect(repository.findById(SCHOOL_ID, tutor.id)).resolves.toEqual({
        id: tutor.id,
        firstName: 'Ana',
        lastName: 'García',
        position: 'DIRECTOR',
        subjects: [],
        unavailableCount: 0,
        tutoredClass: { id: classId, name: 'A', courseId, courseName: '1º Primaria' },
      });
    });

    it('counts the unavailable intervals of the professor, in findById, in the list and after an update', async () => {
      const counted = newProfessor('Ana', 'García');
      const other = newProfessor('Luis', 'Pérez');
      await repository.create(SCHOOL_ID, counted, null);
      await repository.create(SCHOOL_ID, other, null);
      await testPrisma.professorUnavailability.createMany({
        data: [
          {
            id: nextId(),
            schoolId: SCHOOL_ID,
            professorId: counted.id,
            dayOfWeek: 1,
            startMinute: 540,
            endMinute: 600,
          },
          {
            id: nextId(),
            schoolId: SCHOOL_ID,
            professorId: counted.id,
            dayOfWeek: 2,
            startMinute: 540,
            endMinute: 600,
          },
        ],
      });

      await expect(repository.findById(SCHOOL_ID, counted.id)).resolves.toMatchObject({
        unavailableCount: 2,
      });
      const listed = await repository.listBySchool(SCHOOL_ID);
      expect(listed.map(({ id, unavailableCount }) => [id, unavailableCount]).sort()).toEqual(
        [
          [counted.id, 2],
          [other.id, 0],
        ].sort(),
      );
      const updated = await repository.update(SCHOOL_ID, counted.id, {
        firstName: 'Ana María',
        lastName: 'García',
        position: null,
        classId: undefined,
      });
      expect(updated?.before.unavailableCount).toBe(2);
      expect(updated?.after.unavailableCount).toBe(2);
    });

    it('returns null for a professor of another school and for one that does not exist', async () => {
      const other = newProfessor('Eva', 'Otra');
      await repository.create(OTHER_SCHOOL_ID, other, null);

      await expect(repository.findById(SCHOOL_ID, other.id)).resolves.toBeNull();
      await expect(repository.findById(SCHOOL_ID, nextId())).resolves.toBeNull();
    });
  });

  describe('update', () => {
    const tutorOfClass = async (classId: string) =>
      (await testPrisma.schoolClass.findUniqueOrThrow({ where: { id: classId } })).tutorId;

    /** Un profesor con clase en un curso nuevo. */
    async function tutorWithClass(
      firstName: string,
      lastName: string,
      courseName: string,
      className: string,
      schoolId = SCHOOL_ID,
    ) {
      const classRow = await createClass(schoolId, courseName, className);
      const professor = newProfessor(firstName, lastName);
      await repository.create(schoolId, professor, classRow.classId);
      return { professor, ...classRow };
    }

    it('changes the name and the position and leaves the tutorship alone when classId is absent', async () => {
      const { professor, classId } = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');

      const result = await repository.update(SCHOOL_ID, professor.id, {
        firstName: 'Ana María',
        lastName: 'García Gil',
        position: 'DIRECTOR',
      });

      expect(result?.before).toMatchObject({
        firstName: 'Ana',
        lastName: 'García',
        position: null,
      });
      expect(result?.after).toMatchObject({
        firstName: 'Ana María',
        lastName: 'García Gil',
        position: 'DIRECTOR',
        tutoredClass: { id: classId },
      });
      expect(result?.replacedTutor).toBeNull();
      expect(await tutorOfClass(classId)).toBe(professor.id);
    });

    it('removes the position with null', async () => {
      const professor = newProfessor('Ana', 'García', 'DIRECTOR');
      await repository.create(SCHOOL_ID, professor, null);

      const result = await repository.update(SCHOOL_ID, professor.id, {
        firstName: 'Ana',
        lastName: 'García',
        position: null,
      });

      expect(result?.after.position).toBeNull();
    });

    it('moves the professor to a free class and frees the old one', async () => {
      const { professor, classId: oldClassId } = await tutorWithClass(
        'Ana',
        'García',
        '1º Primaria',
        'A',
      );
      const free = await createClass(SCHOOL_ID, '1º Primaria bis', 'B');

      const result = await repository.update(SCHOOL_ID, professor.id, {
        firstName: 'Ana',
        lastName: 'García',
        position: null,
        classId: free.classId,
      });

      expect(result?.after.tutoredClass).toEqual({
        id: free.classId,
        name: 'B',
        courseId: free.courseId,
        courseName: '1º Primaria bis',
      });
      expect(result?.replacedTutor).toBeNull();
      expect(await tutorOfClass(free.classId)).toBe(professor.id);
      expect(await tutorOfClass(oldClassId)).toBeNull();
    });

    it('gives a class to a professor who had none', async () => {
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, null);
      const free = await createClass(SCHOOL_ID, '1º Primaria', 'A');

      const result = await repository.update(SCHOOL_ID, professor.id, {
        firstName: 'Ana',
        lastName: 'García',
        position: null,
        classId: free.classId,
      });

      expect(result?.before.tutoredClass).toBeNull();
      expect(result?.after.tutoredClass?.id).toBe(free.classId);
    });

    it('leaves the professor without class with null and the class without tutor', async () => {
      const { professor, classId } = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');

      const result = await repository.update(SCHOOL_ID, professor.id, {
        firstName: 'Ana',
        lastName: 'García',
        position: null,
        classId: null,
      });

      expect(result?.after.tutoredClass).toBeNull();
      expect(result?.replacedTutor).toBeNull();
      expect(await tutorOfClass(classId)).toBeNull();
    });

    it('changes nothing in the tutorship when the class is the one the professor already tutors', async () => {
      const { professor, classId } = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');

      const result = await repository.update(SCHOOL_ID, professor.id, {
        firstName: 'Ana',
        lastName: 'García',
        position: null,
        classId,
      });

      expect(result?.after.tutoredClass?.id).toBe(classId);
      expect(result?.replacedTutor).toBeNull();
      expect(await tutorOfClass(classId)).toBe(professor.id);
    });

    it('takes the class of another professor, who is left without class and is returned as replaced', async () => {
      const ana = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');
      const luis = await tutorWithClass('Luis', 'Pérez', '2º Primaria', 'A');

      const result = await repository.update(SCHOOL_ID, ana.professor.id, {
        firstName: 'Ana',
        lastName: 'García',
        position: null,
        classId: luis.classId,
      });

      expect(result?.after.tutoredClass?.id).toBe(luis.classId);
      expect(result?.replacedTutor).toEqual({
        id: luis.professor.id,
        firstName: 'Luis',
        lastName: 'Pérez',
      });
      expect(await tutorOfClass(luis.classId)).toBe(ana.professor.id);
      expect(await tutorOfClass(ana.classId)).toBeNull();
      expect((await repository.findById(SCHOOL_ID, luis.professor.id))?.tutoredClass).toBeNull();
    });

    it('throws ClassNotFound for a class of another school and changes nothing', async () => {
      const { professor, classId } = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');
      const foreign = await createClass(OTHER_SCHOOL_ID, '1º Primaria', 'A');

      await expect(
        repository.update(SCHOOL_ID, professor.id, {
          firstName: 'Otro',
          lastName: 'Nombre',
          position: 'DIRECTOR',
          classId: foreign.classId,
        }),
      ).rejects.toBeInstanceOf(ClassNotFound);

      expect(await repository.findById(SCHOOL_ID, professor.id)).toMatchObject({
        firstName: 'Ana',
        position: null,
        tutoredClass: { id: classId },
      });
      expect(await tutorOfClass(foreign.classId)).toBeNull();
    });

    it('throws ClassNotFound for a class that does not exist', async () => {
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, null);

      await expect(
        repository.update(SCHOOL_ID, professor.id, {
          firstName: 'Ana',
          lastName: 'García',
          position: null,
          classId: nextId(),
        }),
      ).rejects.toBeInstanceOf(ClassNotFound);
    });

    it('returns null and changes nothing for a professor of another school or one that does not exist', async () => {
      const other = newProfessor('Eva', 'Otra');
      await repository.create(OTHER_SCHOOL_ID, other, null);

      await expect(
        repository.update(SCHOOL_ID, other.id, { firstName: 'X', lastName: 'Y', position: null }),
      ).resolves.toBeNull();
      await expect(
        repository.update(SCHOOL_ID, nextId(), { firstName: 'X', lastName: 'Y', position: null }),
      ).resolves.toBeNull();
      expect(await repository.findById(OTHER_SCHOOL_ID, other.id)).toMatchObject({
        firstName: 'Eva',
      });
    });

    it('saves everything or nothing: a failure while assigning the class leaves the professor and the classes as they were', async () => {
      const { professor, classId } = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');
      const free = await createClass(SCHOOL_ID, '2º Primaria', 'B');
      // Un disparador que rechaza cualquier cambio del tutor de una clase hace fallar la asignación.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_tutor_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tutor_id IS NOT NULL THEN RAISE EXCEPTION 'fallo forzado'; END IF; RETURN NEW; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_tutor_change BEFORE UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION reject_tutor_change()',
      );

      try {
        await expect(
          repository.update(SCHOOL_ID, professor.id, {
            firstName: 'Cambiado',
            lastName: 'Cambiado',
            position: 'DIRECTOR',
            classId: free.classId,
          }),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_tutor_change ON classes');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_tutor_change()');
      }

      expect(await repository.findById(SCHOOL_ID, professor.id)).toMatchObject({
        firstName: 'Ana',
        lastName: 'García',
        position: null,
        tutoredClass: { id: classId },
      });
      expect(await tutorOfClass(free.classId)).toBeNull();
    });

    it('ends with a single tutor and no error when two professors ask for the same free class at the same time', async () => {
      const ana = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');
      const luis = await tutorWithClass('Luis', 'Pérez', '2º Primaria', 'A');
      const free = await createClass(SCHOOL_ID, '3º Primaria', 'A');
      const ask = (professor: NewProfessor, name: string) =>
        repository.update(SCHOOL_ID, professor.id, {
          firstName: name,
          lastName: 'X',
          position: null,
          classId: free.classId,
        });

      const results = await Promise.allSettled([
        ask(ana.professor, 'Ana'),
        ask(luis.professor, 'Luis'),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      const tutor = await tutorOfClass(free.classId);
      expect([ana.professor.id, luis.professor.id]).toContain(tutor);
      // Solo queda una clase con tutor: la que ganó la última edición; la del otro profesor quedó libre.
      expect(await testPrisma.schoolClass.count({ where: { tutorId: { not: null } } })).toBe(1);
    });

    it('swaps two classes when two professors ask for the class of the other at the same time, without deadlock', async () => {
      const ana = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');
      const luis = await tutorWithClass('Luis', 'Pérez', '2º Primaria', 'A');
      let anaClass = ana.classId;
      let luisClass = luis.classId;

      for (let round = 0; round < 5; round += 1) {
        const results = await Promise.allSettled([
          repository.update(SCHOOL_ID, ana.professor.id, {
            firstName: 'Ana',
            lastName: 'García',
            position: null,
            classId: luisClass,
          }),
          repository.update(SCHOOL_ID, luis.professor.id, {
            firstName: 'Luis',
            lastName: 'Pérez',
            position: null,
            classId: anaClass,
          }),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        [anaClass, luisClass] = [luisClass, anaClass];
        expect(await tutorOfClass(anaClass)).toBe(ana.professor.id);
        expect(await tutorOfClass(luisClass)).toBe(luis.professor.id);
      }
    });

    it('answers ProfessorAlreadyTutor and changes nothing when a course edit gives the professor a class at the same time', async () => {
      const ana = await tutorWithClass('Ana', 'García', '1º Primaria', 'A');
      const free = await createClass(SCHOOL_ID, '2º Primaria', 'B');
      const other = await createClass(SCHOOL_ID, '3º Primaria', 'C');
      // Una escritura que no comparte los bloqueos (como la edición de un curso) asigna a Ana otra clase
      // justo antes de que la edición del profesor libere la suya.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION steal_tutor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tutor_id IS NULL AND OLD.tutor_id IS NOT NULL THEN UPDATE classes SET tutor_id = OLD.tutor_id WHERE id = '${other.classId}'; END IF; RETURN NEW; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        `CREATE TRIGGER steal_tutor AFTER UPDATE ON classes FOR EACH ROW WHEN (OLD.id = '${ana.classId}') EXECUTE FUNCTION steal_tutor()`,
      );

      try {
        await expect(
          repository.update(SCHOOL_ID, ana.professor.id, {
            firstName: 'Ana',
            lastName: 'García',
            position: null,
            classId: free.classId,
          }),
        ).rejects.toBeInstanceOf(ProfessorAlreadyTutor);
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER steal_tutor ON classes');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION steal_tutor()');
      }

      expect(await tutorOfClass(ana.classId)).toBe(ana.professor.id);
      expect(await tutorOfClass(free.classId)).toBeNull();
      expect(await tutorOfClass(other.classId)).toBeNull();
    });
  });

  describe('delete', () => {
    const exists = async (professorId: string) =>
      (await testPrisma.professor.count({ where: { id: professorId } })) === 1;

    it('deletes a professor with no class and reports no freed class', async () => {
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, null);

      await expect(repository.delete(SCHOOL_ID, professor.id)).resolves.toEqual({
        freedClass: null,
      });

      expect(await exists(professor.id)).toBe(false);
    });

    it('deletes a professor with a class, leaves the class without tutor and returns it', async () => {
      const { courseId, classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, classId);

      const deleted = await repository.delete(SCHOOL_ID, professor.id);

      expect(deleted).toEqual({
        freedClass: { id: classId, name: 'A', courseName: '1º Primaria' },
      });
      expect(await exists(professor.id)).toBe(false);
      const schoolClass = await testPrisma.schoolClass.findUniqueOrThrow({
        where: { id: classId },
      });
      expect(schoolClass).toMatchObject({ courseId, name: 'A', tutorId: null });
      expect(await testPrisma.course.count({ where: { id: courseId } })).toBe(1);
    });

    it('does not touch the other professors or their classes', async () => {
      const first = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const second = await createClass(SCHOOL_ID, '2º Primaria', 'A');
      const ana = newProfessor('Ana', 'García');
      const luis = newProfessor('Luis', 'Pérez');
      await repository.create(SCHOOL_ID, ana, first.classId);
      await repository.create(SCHOOL_ID, luis, second.classId);

      await repository.delete(SCHOOL_ID, ana.id);

      expect((await repository.findById(SCHOOL_ID, luis.id))?.tutoredClass?.id).toBe(
        second.classId,
      );
    });

    it('returns null and deletes nothing for a professor of another school or one that does not exist', async () => {
      const other = newProfessor('Eva', 'Otra');
      await repository.create(OTHER_SCHOOL_ID, other, null);

      await expect(repository.delete(SCHOOL_ID, other.id)).resolves.toBeNull();
      await expect(repository.delete(SCHOOL_ID, nextId())).resolves.toBeNull();
      expect(await exists(other.id)).toBe(true);
    });

    it('lets only one of two simultaneous deletes delete the professor', async () => {
      const { classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, classId);

      const results = await Promise.all([
        repository.delete(SCHOOL_ID, professor.id),
        repository.delete(SCHOOL_ID, professor.id),
      ]);

      expect(results.filter((result) => result !== null)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
      expect(await exists(professor.id)).toBe(false);
    });

    it('serializes an edit and a delete that arrive at the same time, whoever goes first', async () => {
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, null);

      const [deleted, edited] = await Promise.all([
        repository.delete(SCHOOL_ID, professor.id),
        repository.update(SCHOOL_ID, professor.id, {
          firstName: 'Nueva',
          lastName: 'García',
          position: null,
        }),
      ]);

      // Van una detrás de la otra por el bloqueo: el borrado siempre encuentra al profesor (la edición no
      // lo borra), y la edición lo encuentra solo si va primero. En ningún caso queda a medias.
      expect(deleted).not.toBeNull();
      expect(edited === null || edited.after.firstName === 'Nueva').toBe(true);
      expect(await exists(professor.id)).toBe(false);
    });

    it('saves nothing when the delete fails: the professor and the tutorship stay as they were', async () => {
      const { classId } = await createClass(SCHOOL_ID, '1º Primaria', 'A');
      const professor = newProfessor('Ana', 'García');
      await repository.create(SCHOOL_ID, professor, classId);
      // Un disparador que rechaza el borrado de cualquier profesor hace fallar la operación.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_professor_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_professor_delete BEFORE DELETE ON professors FOR EACH ROW EXECUTE FUNCTION reject_professor_delete()',
      );

      try {
        await expect(repository.delete(SCHOOL_ID, professor.id)).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_professor_delete ON professors');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_professor_delete()');
      }

      expect(await repository.findById(SCHOOL_ID, professor.id)).toMatchObject({
        tutoredClass: { id: classId },
      });
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
    ['delete', (repository: PrismaProfessorRepository) => repository.delete(SCHOOL_ID, nextId())],
    [
      'findById',
      (repository: PrismaProfessorRepository) => repository.findById(SCHOOL_ID, nextId()),
    ],
    [
      'update',
      (repository: PrismaProfessorRepository) =>
        repository.update(SCHOOL_ID, nextId(), {
          firstName: 'Ana',
          lastName: 'García',
          position: null,
        }),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
