import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const OTHER_COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d2';
const CLASS_A = '0192f5a0-0000-7000-8000-0000000000c1';
const CLASS_B = '0192f5a0-0000-7000-8000-0000000000c2';
const OTHER_COURSE_CLASS = '0192f5a0-0000-7000-8000-0000000000c3';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const OTHER_SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e2';
const PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f1';
const OTHER_PROFESSOR_ID = '0192f5a0-0000-7000-8000-0000000000f2';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(9500 + ++sequence).padStart(12, '0')}`;

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    schoolId: SCHOOL_ID,
    professorId: PROFESSOR_ID,
    subjectId: SUBJECT_ID,
    courseId: COURSE_ID,
    classId: CLASS_A,
    ...overrides,
  };
}

interface ConstraintRow {
  conname: string;
  contype: string;
  def: string;
}

describe('professor_assignments schema', () => {
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
    for (const [courseId, name] of [
      [COURSE_ID, '1º Primaria'],
      [OTHER_COURSE_ID, '2º Primaria'],
    ] as const) {
      await testPrisma.course.create({
        data: { id: courseId, schoolId: SCHOOL_ID, name, normalizedName: name.toLowerCase() },
      });
    }
    await testPrisma.schoolClass.createMany({
      data: [
        { id: CLASS_A, courseId: COURSE_ID, name: 'A', normalizedName: 'a' },
        { id: CLASS_B, courseId: COURSE_ID, name: 'B', normalizedName: 'b' },
        { id: OTHER_COURSE_CLASS, courseId: OTHER_COURSE_ID, name: 'A', normalizedName: 'a' },
      ],
    });
    for (const [id, name] of [
      [SUBJECT_ID, 'Inglés'],
      [OTHER_SUBJECT_ID, 'Lengua'],
    ] as const) {
      await testPrisma.subject.create({
        data: {
          id,
          schoolId: SCHOOL_ID,
          name,
          normalizedName: name.toLowerCase(),
          type: 'CORE',
          status: 'ACTIVE',
          color: 'blue',
        },
      });
    }
    // «Inglés» se imparte en 1º y en 2º; «Lengua» solo en 2º.
    await testPrisma.subjectCourse.createMany({
      data: [
        { subjectId: SUBJECT_ID, courseId: COURSE_ID, sessionsPerWeek: 3 },
        { subjectId: SUBJECT_ID, courseId: OTHER_COURSE_ID, sessionsPerWeek: 3 },
        { subjectId: OTHER_SUBJECT_ID, courseId: OTHER_COURSE_ID, sessionsPerWeek: 5 },
      ],
    });
    await testPrisma.professor.createMany({
      data: [
        { id: PROFESSOR_ID, schoolId: SCHOOL_ID, firstName: 'Ana', lastName: 'García' },
        { id: OTHER_PROFESSOR_ID, schoolId: SCHOOL_ID, firstName: 'Luis', lastName: 'Pérez' },
      ],
    });
  });

  describe('the constraints in pg_constraint', () => {
    async function constraints(table: string): Promise<ConstraintRow[]> {
      return testPrisma.$queryRawUnsafe<ConstraintRow[]>(
        `SELECT conname, contype::text AS contype, pg_get_constraintdef(oid) AS def
         FROM pg_constraint WHERE conrelid = '${table}'::regclass`,
      );
    }

    it('has the foreign key (subject_id, course_id) to subject_courses with ON DELETE CASCADE', async () => {
      const found = (await constraints('professor_assignments')).find(
        (row) => row.contype === 'f' && row.def.includes('REFERENCES subject_courses'),
      );
      expect(found?.def).toContain(
        'FOREIGN KEY (subject_id, course_id) REFERENCES subject_courses(subject_id, course_id)',
      );
      expect(found?.def).toContain('ON DELETE CASCADE');
    });

    it('has the foreign key (class_id, course_id) to classes with ON DELETE CASCADE', async () => {
      const found = (await constraints('professor_assignments')).find(
        (row) => row.contype === 'f' && row.def.includes('REFERENCES classes'),
      );
      expect(found?.def).toContain(
        'FOREIGN KEY (class_id, course_id) REFERENCES classes(id, course_id)',
      );
      expect(found?.def).toContain('ON DELETE CASCADE');
    });

    it('has the foreign key to professors with ON DELETE CASCADE and the one to schools', async () => {
      const rows = await constraints('professor_assignments');
      const professors = rows.find((row) => row.def.includes('REFERENCES professors'));
      expect(professors?.def).toContain('FOREIGN KEY (professor_id) REFERENCES professors(id)');
      expect(professors?.def).toContain('ON DELETE CASCADE');
      expect(rows.find((row) => row.def.includes('REFERENCES schools'))?.def).toContain(
        'FOREIGN KEY (school_id) REFERENCES schools(id)',
      );
    });

    it('has the unique index (id, course_id) on classes that the foreign key needs', async () => {
      // Prisma lo crea como un índice único; el nombre importa porque la clave ajena lo usa.
      const index = await testPrisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'classes' AND indexname = 'classes_id_course_id_key'`;
      expect(index).toHaveLength(1);
      expect(index[0]?.indexdef).toContain('UNIQUE');
      expect(index[0]?.indexdef).toContain('(id, course_id)');
    });

    it('has the unique index (subject_id, class_id)', async () => {
      const index = await testPrisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'professor_assignments' AND indexdef LIKE '%UNIQUE%'`;
      expect(index.map(({ indexdef }) => indexdef).join('\n')).toContain('(subject_id, class_id)');
    });
  });

  describe('the values it stores', () => {
    it('stores an assignment of a subject taught in the course to a class of the course', async () => {
      await expect(
        testPrisma.professorAssignment.create({ data: assignment() }),
      ).resolves.toMatchObject({ professorId: PROFESSOR_ID, classId: CLASS_A });
    });

    it('stores the creation date by default', async () => {
      const stored = await testPrisma.professorAssignment.create({ data: assignment() });

      expect(stored.createdAt).toBeInstanceOf(Date);
    });

    it('accepts the same subject in two classes of the course, with the same or another professor', async () => {
      await testPrisma.professorAssignment.create({ data: assignment() });

      await expect(
        testPrisma.professorAssignment.create({
          data: assignment({ classId: CLASS_B, professorId: OTHER_PROFESSOR_ID }),
        }),
      ).resolves.toMatchObject({ classId: CLASS_B });
    });

    it('rejects a second professor for the same subject and class by the unique index', async () => {
      await testPrisma.professorAssignment.create({ data: assignment() });

      await expect(
        testPrisma.professorAssignment.create({
          data: assignment({ professorId: OTHER_PROFESSOR_ID }),
        }),
      ).rejects.toThrow(/professor_assignments_subject_id_class_id_key/);
    });

    it('rejects a class of another course by the foreign key (class_id, course_id)', async () => {
      await expect(
        testPrisma.professorAssignment.create({
          data: assignment({ classId: OTHER_COURSE_CLASS }),
        }),
      ).rejects.toThrow(/professor_assignments_class_id_course_id_fkey/);
    });

    it('rejects a subject that is not taught in the course by the foreign key (subject_id, course_id)', async () => {
      await expect(
        testPrisma.professorAssignment.create({
          data: assignment({ subjectId: OTHER_SUBJECT_ID }),
        }),
      ).rejects.toThrow(/professor_assignments_subject_id_course_id_fkey/);
    });

    it('rejects a professor that does not exist', async () => {
      await expect(
        testPrisma.professorAssignment.create({
          data: assignment({ professorId: '0192f5a0-0000-7000-8000-00000000ffff' }),
        }),
      ).rejects.toThrow(/professor_assignments_professor_id_fkey/);
    });
  });

  describe('the cascades', () => {
    const countOf = (where: Record<string, unknown>) =>
      testPrisma.professorAssignment.count({ where });

    beforeEach(async () => {
      await testPrisma.professorAssignment.createMany({
        data: [
          assignment(),
          assignment({ classId: CLASS_B }),
          assignment({ courseId: OTHER_COURSE_ID, classId: OTHER_COURSE_CLASS }),
          assignment({
            subjectId: OTHER_SUBJECT_ID,
            courseId: OTHER_COURSE_ID,
            classId: OTHER_COURSE_CLASS,
            professorId: OTHER_PROFESSOR_ID,
          }),
        ],
      });
    });

    it('deletes the assignments of a subject when it stops being taught in the course, and keeps the others', async () => {
      await testPrisma.subjectCourse.delete({
        where: { subjectId_courseId: { subjectId: SUBJECT_ID, courseId: COURSE_ID } },
      });

      await expect(countOf({ courseId: COURSE_ID })).resolves.toBe(0);
      await expect(countOf({ courseId: OTHER_COURSE_ID })).resolves.toBe(2);
    });

    it('deletes the assignments of a class when the class is deleted, and keeps the other class', async () => {
      await testPrisma.schoolClass.delete({ where: { id: CLASS_A } });

      await expect(countOf({ classId: CLASS_A })).resolves.toBe(0);
      await expect(countOf({ classId: CLASS_B })).resolves.toBe(1);
    });

    it('deletes the assignments of a course when the course is deleted', async () => {
      await testPrisma.course.delete({ where: { id: COURSE_ID } });

      await expect(countOf({ courseId: COURSE_ID })).resolves.toBe(0);
      await expect(countOf({ courseId: OTHER_COURSE_ID })).resolves.toBe(2);
    });

    it('deletes the assignments of a subject when the subject is deleted', async () => {
      await testPrisma.subject.delete({ where: { id: SUBJECT_ID } });

      await expect(countOf({ subjectId: SUBJECT_ID })).resolves.toBe(0);
      await expect(countOf({ subjectId: OTHER_SUBJECT_ID })).resolves.toBe(1);
    });

    it('deletes the assignments of a professor when the professor is deleted, and keeps the tutored class', async () => {
      await testPrisma.professor.delete({ where: { id: PROFESSOR_ID } });

      await expect(countOf({ professorId: PROFESSOR_ID })).resolves.toBe(0);
      await expect(countOf({ professorId: OTHER_PROFESSOR_ID })).resolves.toBe(1);
      await expect(testPrisma.schoolClass.count()).resolves.toBe(3);
    });
  });
});
