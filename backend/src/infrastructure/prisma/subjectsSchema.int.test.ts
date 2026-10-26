import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const SUBJECT_ID = '0192f5a0-0000-7000-8000-0000000000e1';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';
const OTHER_COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d2';

let sequence = 0;
function id() {
  sequence += 1;
  return `0192f5a0-0000-7000-8000-${String(4000 + sequence).padStart(12, '0')}`;
}

function subject(overrides: Record<string, unknown> = {}) {
  return {
    id: id(),
    schoolId: SCHOOL_ID,
    name: 'Matemáticas',
    normalizedName: 'matematicas',
    type: 'CORE' as const,
    status: 'ACTIVE' as const,
    color: 'blue' as const,
    ...overrides,
  };
}

function subjectCourse(overrides: Record<string, unknown> = {}) {
  return { subjectId: SUBJECT_ID, courseId: COURSE_ID, sessionsPerWeek: 3, ...overrides };
}

describe('subjects schema', () => {
  beforeEach(async () => {
    sequence = 0;
    for (const [schoolId, name] of [
      [SCHOOL_ID, 'ceipuno'],
      [OTHER_SCHOOL_ID, 'ceipdos'],
    ] as const) {
      await testPrisma.school.create({
        data: { id: schoolId, name, normalizedName: name, municipalityCode: '46250' },
      });
    }
    for (const [courseId, name] of [
      [COURSE_ID, '1º Primaria'],
      [OTHER_COURSE_ID, '2º Primaria'],
    ] as const) {
      await testPrisma.course.create({
        data: { id: courseId, schoolId: SCHOOL_ID, name, normalizedName: name.toLowerCase() },
      });
    }
    await testPrisma.subject.create({
      data: subject({ id: SUBJECT_ID, name: 'Inglés', normalizedName: 'ingles' }),
    });
  });

  it('stores a subject with the optional columns empty and the dates by default', async () => {
    const stored = await testPrisma.subject.findUniqueOrThrow({ where: { id: SUBJECT_ID } });

    expect(stored).toMatchObject({
      code: null,
      normalizedCode: null,
      description: null,
      type: 'CORE',
      status: 'ACTIVE',
      color: 'blue',
    });
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect(stored.updatedAt).toBeInstanceOf(Date);
  });

  it('rejects a color, a type or a status that is not in its enum', async () => {
    await expect(
      testPrisma.subject.create({ data: subject({ color: 'magenta' }) }),
    ).rejects.toThrow();
    await expect(testPrisma.subject.create({ data: subject({ type: 'OTHER' }) })).rejects.toThrow();
    await expect(
      testPrisma.subject.create({ data: subject({ status: 'ARCHIVED' }) }),
    ).rejects.toThrow();
  });

  describe('the CHECK of the weekly sessions', () => {
    it.each([1, 5])('accepts %i sessions', async (sessionsPerWeek) => {
      await expect(
        testPrisma.subjectCourse.create({ data: subjectCourse({ sessionsPerWeek }) }),
      ).resolves.toMatchObject({ sessionsPerWeek });
    });

    it.each([0, 6, -1])(
      'rejects %i sessions, by the CHECK subject_courses_sessions_per_week_check',
      async (sessionsPerWeek) => {
        // Se exige el nombre de la restricción: un `toThrow()` a secas también aceptaría un fallo de clave ajena.
        await expect(
          testPrisma.subjectCourse.create({ data: subjectCourse({ sessionsPerWeek }) }),
        ).rejects.toThrow(/subject_courses_sessions_per_week_check/);
        await expect(testPrisma.subjectCourse.count()).resolves.toBe(0);
      },
    );
  });

  it('rejects the same course twice in a subject', async () => {
    await testPrisma.subjectCourse.create({ data: subjectCourse() });

    await expect(
      testPrisma.subjectCourse.create({ data: subjectCourse({ sessionsPerWeek: 2 }) }),
    ).rejects.toThrow(/subject_courses_pkey/);
  });

  it('rejects the same normalized name twice in a school but allows it in another one', async () => {
    await expect(
      testPrisma.subject.create({ data: subject({ name: 'INGLÉS', normalizedName: 'ingles' }) }),
    ).rejects.toThrow(/subjects_school_id_normalized_name_key/);

    await expect(
      testPrisma.subject.create({
        data: subject({ schoolId: OTHER_SCHOOL_ID, name: 'Inglés', normalizedName: 'ingles' }),
      }),
    ).resolves.toMatchObject({ schoolId: OTHER_SCHOOL_ID });
  });

  it('rejects the same normalized code twice in a school but allows it in another one', async () => {
    await testPrisma.subject.create({
      data: subject({ code: 'MAT', normalizedCode: 'mat' }),
    });

    await expect(
      testPrisma.subject.create({
        data: subject({
          name: 'Mates 2',
          normalizedName: 'mates2',
          code: 'mat',
          normalizedCode: 'mat',
        }),
      }),
    ).rejects.toThrow(/subjects_school_id_normalized_code_key/);

    await expect(
      testPrisma.subject.create({
        data: subject({
          schoolId: OTHER_SCHOOL_ID,
          code: 'MAT',
          normalizedCode: 'mat',
        }),
      }),
    ).resolves.toMatchObject({ schoolId: OTHER_SCHOOL_ID });
  });

  it('accepts several subjects of a school without code', async () => {
    await expect(
      testPrisma.subject.create({ data: subject({ name: 'Música', normalizedName: 'musica' }) }),
    ).resolves.toMatchObject({ code: null });
    await expect(
      testPrisma.subject.create({
        data: subject({ name: 'Plástica', normalizedName: 'plastica' }),
      }),
    ).resolves.toMatchObject({ code: null });
    await expect(testPrisma.subject.count({ where: { normalizedCode: null } })).resolves.toBe(3);
  });

  it('deletes the rows of a course when the course is deleted and keeps the subject', async () => {
    await testPrisma.subjectCourse.createMany({
      data: [subjectCourse(), subjectCourse({ courseId: OTHER_COURSE_ID, sessionsPerWeek: 2 })],
    });

    await testPrisma.course.delete({ where: { id: COURSE_ID } });

    await expect(testPrisma.subject.count({ where: { id: SUBJECT_ID } })).resolves.toBe(1);
    const left = await testPrisma.subjectCourse.findMany();
    expect(left.map(({ courseId }) => courseId)).toEqual([OTHER_COURSE_ID]);

    await testPrisma.course.delete({ where: { id: OTHER_COURSE_ID } });

    await expect(testPrisma.subjectCourse.count()).resolves.toBe(0);
    await expect(testPrisma.subject.count({ where: { id: SUBJECT_ID } })).resolves.toBe(1);
  });

  it('deletes the rows of a subject with it and keeps its courses', async () => {
    await testPrisma.subjectCourse.create({ data: subjectCourse() });

    await testPrisma.subject.delete({ where: { id: SUBJECT_ID } });

    await expect(testPrisma.subjectCourse.count()).resolves.toBe(0);
    await expect(testPrisma.course.count({ where: { id: COURSE_ID } })).resolves.toBe(1);
  });

  it('does not let a school be deleted while it has subjects', async () => {
    // Un colegio sin cursos: si los tuviera, saltaría antes la clave ajena de `courses`.
    await testPrisma.subject.create({ data: subject({ schoolId: OTHER_SCHOOL_ID }) });

    await expect(testPrisma.school.delete({ where: { id: OTHER_SCHOOL_ID } })).rejects.toThrow(
      /subjects_school_id_fkey/,
    );
  });
});
