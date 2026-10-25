import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma, testSchema } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000c1';
const CLASS_ID = '0192f5a0-0000-7000-8000-0000000000d1';

let sequence = 0;
function id() {
  sequence += 1;
  return `0192f5a0-0000-7000-8000-${String(2000 + sequence).padStart(12, '0')}`;
}

function student(overrides: Record<string, unknown> = {}) {
  return {
    id: id(),
    schoolId: SCHOOL_ID,
    courseId: COURSE_ID,
    classId: CLASS_ID,
    firstName: 'Juan',
    lastName: 'García',
    cafeteria: false,
    ...overrides,
  };
}

describe('students schema', () => {
  beforeEach(async () => {
    sequence = 0;
    await testPrisma.school.create({
      data: {
        id: SCHOOL_ID,
        name: 'CEIP Lluís Vives',
        normalizedName: 'ceiplluisvives',
        municipalityCode: '46250',
      },
    });
    await testPrisma.course.create({
      data: {
        id: COURSE_ID,
        schoolId: SCHOOL_ID,
        name: '1º Primaria',
        normalizedName: '1primaria',
        classes: { create: [{ id: CLASS_ID, name: 'A', normalizedName: 'a' }] },
      },
    });
  });

  it('stores a student with the optional fields empty and defaults the dates', async () => {
    const stored = await testPrisma.student.create({ data: student({ classId: null }) });

    expect(stored).toMatchObject({
      courseId: COURSE_ID,
      classId: null,
      cafeteria: false,
      scholarship: null,
      foodType: null,
      observations: null,
    });
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect(stored.updatedAt).toBeInstanceOf(Date);
  });

  it('stores a long observations text, with line breaks, and a food type of 255 characters', async () => {
    const observations = `${'a'.repeat(4990)}\n${'b'.repeat(9)}`;
    const stored = await testPrisma.student.create({
      data: student({
        cafeteria: true,
        scholarship: true,
        foodType: 'x'.repeat(255),
        observations,
      }),
    });

    expect(stored.foodType).toHaveLength(255);
    expect(stored.observations).toBe(observations);
  });

  it('stores a student without course, which is what is left when their course is deleted', async () => {
    const stored = await testPrisma.student.create({
      data: student({ courseId: null, classId: null }),
    });

    expect(stored.courseId).toBeNull();
  });

  it.each([
    ['a scholarship', { scholarship: true }],
    ['a refused scholarship', { scholarship: false }],
    ['a food type', { foodType: 'Sin gluten' }],
    ['a scholarship and a food type', { scholarship: true, foodType: 'Sin gluten' }],
  ])(
    'rejects %s without cafeteria, by the CHECK students_cafeteria_check',
    async (_name, extra) => {
      // Se exige el nombre de la restricción: un `toThrow()` a secas también aceptaría un fallo de clave ajena.
      await expect(
        testPrisma.student.create({ data: student({ cafeteria: false, ...extra }) }),
      ).rejects.toThrow(/students_cafeteria_check/);
      await expect(testPrisma.student.count()).resolves.toBe(0);
    },
  );

  it('rejects a student with cafeteria and no answer about the scholarship, by the CHECK students_scholarship_check', async () => {
    await expect(
      testPrisma.student.create({ data: student({ cafeteria: true, scholarship: null }) }),
    ).rejects.toThrow(/students_scholarship_check/);
    await expect(
      testPrisma.student.create({
        data: student({ cafeteria: true, scholarship: null, foodType: 'Sin gluten' }),
      }),
    ).rejects.toThrow(/students_scholarship_check/);
    await expect(testPrisma.student.count()).resolves.toBe(0);
  });

  it.each([
    ['with a scholarship', { scholarship: true }],
    ['without a scholarship', { scholarship: false }],
    ['with a scholarship and a food type', { scholarship: true, foodType: 'Sin gluten' }],
    ['without a scholarship and with a food type', { scholarship: false, foodType: 'Vegetariana' }],
  ])(
    'stores a student with cafeteria %s: the CHECKs do not reject valid answers',
    async (_name, extra) => {
      await expect(
        testPrisma.student.create({ data: student({ cafeteria: true, ...extra }) }),
      ).resolves.toMatchObject({ cafeteria: true, ...extra });
    },
  );

  it('rejects a student of a school, a course or a class that does not exist', async () => {
    const missing = '0192f5a0-0000-7000-8000-0000000000ff';

    await expect(
      testPrisma.student.create({ data: student({ schoolId: missing }) }),
    ).rejects.toThrow();
    await expect(
      testPrisma.student.create({ data: student({ courseId: missing }) }),
    ).rejects.toThrow();
    await expect(
      testPrisma.student.create({ data: student({ classId: missing }) }),
    ).rejects.toThrow();
  });

  it('leaves the student without course and class when the course is deleted', async () => {
    const { id: studentId } = await testPrisma.student.create({ data: student() });

    await testPrisma.course.delete({ where: { id: COURSE_ID } });

    const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: studentId } });
    expect(stored).toMatchObject({ courseId: null, classId: null });
  });

  it('leaves the student in the course without class when the class is deleted', async () => {
    const { id: studentId } = await testPrisma.student.create({ data: student() });

    await testPrisma.schoolClass.delete({ where: { id: CLASS_ID } });

    const stored = await testPrisma.student.findUniqueOrThrow({ where: { id: studentId } });
    expect(stored).toMatchObject({ courseId: COURSE_ID, classId: null });
  });

  it('has an index on the school, the course and the class', async () => {
    const indexes = await testPrisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = ${testSchema} AND tablename = 'students'`;
    const definitions = indexes.map(({ indexdef }) => indexdef).join('\n');

    expect(definitions).toContain('(school_id)');
    expect(definitions).toContain('(course_id)');
    expect(definitions).toContain('(class_id)');
  });
});
