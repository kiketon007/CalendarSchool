import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { SUBJECT_COLORS } from '../../domain/subject/subject.js';
import {
  SubjectAlreadyExists,
  SubjectCodeAlreadyExists,
  SubjectCoursesNotFound,
} from '../../domain/subject/subjectErrors.js';
import type { NewSubject } from '../../domain/subject/subjectRepository.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { SubjectColor as PrismaSubjectColor } from './generated/client.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaCalendarRepository } from './prismaCalendarRepository.js';
import { PrismaCourseRepository } from './prismaCourseRepository.js';
import { PrismaSubjectRepository } from './prismaSubjectRepository.js';

const repository = new PrismaSubjectRepository(testPrisma);
const calendarRepository = new PrismaCalendarRepository(testPrisma);
const courseRepository = new PrismaCourseRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(6000 + ++sequence).padStart(12, '0')}`;

async function createCourse(schoolId: string, name: string) {
  const id = nextId();
  await testPrisma.course.create({
    data: { id, schoolId, name, normalizedName: name.toLowerCase() },
  });
  return id;
}

function newSubject(name: string, overrides: Partial<NewSubject> = {}): NewSubject {
  return {
    id: nextId(),
    name,
    normalizedName: name.toLowerCase(),
    code: null,
    normalizedCode: null,
    type: 'CORE',
    status: 'ACTIVE',
    description: null,
    color: 'blue',
    courses: [],
    ...overrides,
  };
}

const subjectCount = () => testPrisma.subject.count();
const rowCount = () => testPrisma.subjectCourse.count();

describe('PrismaSubjectRepository', () => {
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

  it('has exactly the colors of the palette of the database enum, in the same order', () => {
    expect(Object.values(PrismaSubjectColor)).toEqual([...SUBJECT_COLORS]);
  });

  describe('create', () => {
    it('stores the subject with its courses and sessions and returns it as stored', async () => {
      const first = await createCourse(SCHOOL_ID, '1º Primaria');
      const second = await createCourse(SCHOOL_ID, '2º Primaria');
      const subject = newSubject('Inglés', {
        code: 'ING',
        normalizedCode: 'ing',
        type: 'ELECTIVE',
        status: 'INACTIVE',
        description: 'Lengua extranjera',
        color: 'teal',
        courses: [
          { courseId: first, sessionsPerWeek: 3 },
          { courseId: second, sessionsPerWeek: 5 },
        ],
      });

      const created = await repository.create(SCHOOL_ID, subject);

      expect(created).toMatchObject({
        id: subject.id,
        name: 'Inglés',
        code: 'ING',
        type: 'ELECTIVE',
        status: 'INACTIVE',
        description: 'Lengua extranjera',
        color: 'teal',
      });
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(
        [...created.courses]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((course) => ({ ...course })),
      ).toEqual([
        { id: first, name: '1º Primaria', sessionsPerWeek: 3 },
        { id: second, name: '2º Primaria', sessionsPerWeek: 5 },
      ]);
      await expect(
        testPrisma.subject.findUniqueOrThrow({ where: { id: subject.id } }),
      ).resolves.toMatchObject({
        schoolId: SCHOOL_ID,
        normalizedName: 'inglés',
        normalizedCode: 'ing',
      });
    });

    it('stores a subject without code and without description as null, not as an empty text', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');

      const created = await repository.create(
        SCHOOL_ID,
        newSubject('Música', { courses: [{ courseId: course, sessionsPerWeek: 1 }] }),
      );

      expect(created).toMatchObject({ code: null, description: null });
      await expect(
        testPrisma.subject.findUniqueOrThrow({ where: { id: created.id } }),
      ).resolves.toMatchObject({ code: null, normalizedCode: null, description: null });
    });

    it('accepts several subjects without code in the same school', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const courses = [{ courseId: course, sessionsPerWeek: 2 }];

      await repository.create(SCHOOL_ID, newSubject('Música', { courses }));
      await repository.create(SCHOOL_ID, newSubject('Plástica', { courses }));

      await expect(subjectCount()).resolves.toBe(2);
    });

    it('lets two subjects share a course', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');

      await repository.create(
        SCHOOL_ID,
        newSubject('Inglés', { courses: [{ courseId: course, sessionsPerWeek: 3 }] }),
      );
      await repository.create(
        SCHOOL_ID,
        newSubject('Música', { courses: [{ courseId: course, sessionsPerWeek: 1 }] }),
      );

      await expect(rowCount()).resolves.toBe(2);
    });

    it('throws SubjectCoursesNotFound with the positions of the courses that are not in the school, and stores nothing', async () => {
      const own = await createCourse(SCHOOL_ID, '1º Primaria');
      const foreign = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const missing = nextId();

      const error = await repository
        .create(
          SCHOOL_ID,
          newSubject('Inglés', {
            courses: [
              { courseId: foreign, sessionsPerWeek: 3 },
              { courseId: own, sessionsPerWeek: 3 },
              { courseId: missing, sessionsPerWeek: 3 },
            ],
          }),
        )
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(SubjectCoursesNotFound);
      expect((error as SubjectCoursesNotFound).positions).toEqual([0, 2]);
      await expect(subjectCount()).resolves.toBe(0);
      await expect(rowCount()).resolves.toBe(0);
    });

    it('throws SubjectAlreadyExists for the same name in the school, and stores nothing more', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      await repository.create(SCHOOL_ID, newSubject('Inglés'));

      await expect(
        repository.create(
          SCHOOL_ID,
          newSubject('INGLÉS', { courses: [{ courseId: course, sessionsPerWeek: 3 }] }),
        ),
      ).rejects.toBeInstanceOf(SubjectAlreadyExists);

      await expect(subjectCount()).resolves.toBe(1);
      await expect(rowCount()).resolves.toBe(0);
    });

    it('throws SubjectCodeAlreadyExists for the same code, whatever its case', async () => {
      await repository.create(
        SCHOOL_ID,
        newSubject('Inglés', { code: 'ING', normalizedCode: 'ing' }),
      );

      await expect(
        repository.create(
          SCHOOL_ID,
          newSubject('Inglés 2', { code: 'ing', normalizedCode: 'ing' }),
        ),
      ).rejects.toBeInstanceOf(SubjectCodeAlreadyExists);

      await expect(subjectCount()).resolves.toBe(1);
    });

    it('answers for the name when the name and the code are both taken', async () => {
      await repository.create(
        SCHOOL_ID,
        newSubject('Inglés', { code: 'ING', normalizedCode: 'ing' }),
      );

      await expect(
        repository.create(SCHOOL_ID, newSubject('inglés', { code: 'ING', normalizedCode: 'ing' })),
      ).rejects.toBeInstanceOf(SubjectAlreadyExists);
    });

    it('allows the same name and the same code in another school', async () => {
      await repository.create(
        SCHOOL_ID,
        newSubject('Inglés', { code: 'ING', normalizedCode: 'ing' }),
      );

      await expect(
        repository.create(
          OTHER_SCHOOL_ID,
          newSubject('Inglés', { code: 'ING', normalizedCode: 'ing' }),
        ),
      ).resolves.toMatchObject({ name: 'Inglés' });
      await expect(subjectCount()).resolves.toBe(2);
    });

    it('stores nothing when the rows of the courses fail halfway', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_subject_course() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_subject_course BEFORE INSERT ON subject_courses FOR EACH ROW EXECUTE FUNCTION reject_subject_course()',
      );

      try {
        await expect(
          repository.create(
            SCHOOL_ID,
            newSubject('Inglés', { courses: [{ courseId: course, sessionsPerWeek: 3 }] }),
          ),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_subject_course ON subject_courses');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_subject_course()');
      }

      await expect(subjectCount()).resolves.toBe(0);
      await expect(rowCount()).resolves.toBe(0);
    });
  });

  describe('concurrency', () => {
    it('lets only one of two simultaneous creations with the same name succeed', async () => {
      for (let round = 0; round < 6; round += 1) {
        const name = `Inglés ${String(round)}`;

        const results = await Promise.allSettled([
          repository.create(SCHOOL_ID, newSubject(name)),
          repository.create(SCHOOL_ID, newSubject(name)),
        ]);

        const rejected = results.filter(({ status }) => status === 'rejected');
        expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SubjectAlreadyExists);
        await expect(testPrisma.subject.count({ where: { name } })).resolves.toBe(1);
      }
    });

    it('lets only one of two simultaneous creations with the same code succeed', async () => {
      for (let round = 0; round < 6; round += 1) {
        const code = `C${String(round)}`;
        const withCode = (name: string) =>
          newSubject(name, { code, normalizedCode: code.toLowerCase() });

        const results = await Promise.allSettled([
          repository.create(SCHOOL_ID, withCode(`Primera ${String(round)}`)),
          repository.create(SCHOOL_ID, withCode(`Segunda ${String(round)}`)),
        ]);

        const rejected = results.filter(({ status }) => status === 'rejected');
        expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          SubjectCodeAlreadyExists,
        );
        await expect(
          testPrisma.subject.count({ where: { normalizedCode: code.toLowerCase() } }),
        ).resolves.toBe(1);
      }
    });

    it('finishes two creations with courses in common without error, each with all its courses', async () => {
      for (let round = 0; round < 6; round += 1) {
        const courses = await Promise.all(
          ['A', 'B', 'C'].map((letter) =>
            createCourse(SCHOOL_ID, `Curso ${letter} ${String(round)}`),
          ),
        );
        const rows = courses.map((courseId) => ({ courseId, sessionsPerWeek: 2 }));
        const first = newSubject(`Primera ${String(round)}`, { courses: rows });
        const second = newSubject(`Segunda ${String(round)}`, { courses: [...rows].reverse() });

        const results = await Promise.allSettled([
          repository.create(SCHOOL_ID, first),
          repository.create(SCHOOL_ID, second),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        for (const id of [first.id, second.id]) {
          await expect(testPrisma.subjectCourse.count({ where: { subjectId: id } })).resolves.toBe(
            3,
          );
        }
      }
    });

    it('either creates the subject or finds the course deleted, never an error or a dangling row', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const subject = newSubject(`Asignatura ${String(round)}`, {
          courses: [{ courseId: course, sessionsPerWeek: 3 }],
        });

        const [created, deleted] = await Promise.allSettled([
          repository.create(SCHOOL_ID, subject),
          courseRepository.delete(SCHOOL_ID, course),
        ]);

        expect(deleted.status).toBe('fulfilled');
        if (created.status === 'rejected') {
          expect(created.reason).toBeInstanceOf(SubjectCoursesNotFound);
          await expect(testPrisma.subject.count({ where: { id: subject.id } })).resolves.toBe(0);
        } else {
          // El alta confirmó antes del borrado: la asignatura se queda, sin ese curso.
          await expect(testPrisma.subject.count({ where: { id: subject.id } })).resolves.toBe(1);
        }
        await expect(testPrisma.course.count({ where: { id: course } })).resolves.toBe(0);
        await expect(
          testPrisma.subjectCourse.count({ where: { subjectId: subject.id } }),
        ).resolves.toBe(0);
      }
    });

    it('finishes a creation and the edition of a calendar that takes the course away without error', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const calendar = {
          id: nextId(),
          name: `Calendario ${String(round)}`,
          normalizedName: `calendario ${String(round)}`,
          periods: [{ type: 'SESSION' as const, startTime: '09:00', endTime: '09:45' }],
        };
        await calendarRepository.create(SCHOOL_ID, calendar, [course]);
        const subject = newSubject(`Asignatura ${String(round)}`, {
          courses: [{ courseId: course, sessionsPerWeek: 4 }],
        });

        const results = await Promise.allSettled([
          repository.create(SCHOOL_ID, subject),
          // La edición deja al curso sin calendario: escribe en la fila del curso que el alta bloquea.
          calendarRepository.update(
            SCHOOL_ID,
            calendar.id,
            {
              name: calendar.name,
              normalizedName: calendar.normalizedName,
              periods: calendar.periods,
            },
            [],
          ),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        await expect(
          testPrisma.subjectCourse.count({ where: { subjectId: subject.id, courseId: course } }),
        ).resolves.toBe(1);
        await expect(
          testPrisma.course.findUniqueOrThrow({ where: { id: course } }),
        ).resolves.toMatchObject({ calendarId: null });
      }
    });
  });

  describe('concurrency of update', () => {
    /** Edita la asignatura dejándola como `subject` con los cambios por encima. */
    const edit = (subject: NewSubject, changes: Partial<NewSubject> = {}) => {
      const { id, ...state } = subject;
      return repository.update(SCHOOL_ID, id, { ...state, ...changes });
    };
    const rows = (courseIds: readonly string[], sessionsPerWeek: number) =>
      courseIds.map((courseId) => ({ courseId, sessionsPerWeek }));
    const storedRows = (subjectId: string) =>
      testPrisma.subjectCourse.findMany({
        where: { subjectId },
        orderBy: { courseId: 'asc' },
        select: { courseId: true, sessionsPerWeek: true },
      });

    it('leaves the state of one of two simultaneous editions of the same subject, never a mix', async () => {
      for (let round = 0; round < 8; round += 1) {
        const [a, b, c] = await Promise.all(
          ['A', 'B', 'C'].map((letter) =>
            createCourse(SCHOOL_ID, `Curso ${letter} ${String(round)}`),
          ),
        );
        const subject = newSubject(`Asignatura ${String(round)}`, {
          courses: rows([a as string, b as string], 3),
        });
        await repository.create(SCHOOL_ID, subject);
        const first = {
          name: `Primera ${String(round)}`,
          normalizedName: `primera ${String(round)}`,
          color: 'red' as const,
          courses: rows([a as string, b as string], 2),
        };
        const second = {
          name: `Segunda ${String(round)}`,
          normalizedName: `segunda ${String(round)}`,
          color: 'green' as const,
          courses: rows([b as string, c as string], 4),
        };

        const results = await Promise.allSettled([edit(subject, first), edit(subject, second)]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        const stored = await testPrisma.subject.findUniqueOrThrow({ where: { id: subject.id } });
        const winner = stored.name === first.name ? first : second;
        expect(stored).toMatchObject({ name: winner.name, color: winner.color });
        await expect(storedRows(subject.id)).resolves.toEqual(
          [...winner.courses].sort((x, y) => x.courseId.localeCompare(y.courseId)),
        );
      }
    });

    it('lets only one of two subjects take the same name at the same time', async () => {
      for (let round = 0; round < 6; round += 1) {
        const first = newSubject(`Primera ${String(round)}`);
        const second = newSubject(`Segunda ${String(round)}`);
        await repository.create(SCHOOL_ID, first);
        await repository.create(SCHOOL_ID, second);
        const shared = {
          name: `Compartida ${String(round)}`,
          normalizedName: `compartida ${String(round)}`,
        };

        const results = await Promise.allSettled([edit(first, shared), edit(second, shared)]);

        const rejected = results.filter(({ status }) => status === 'rejected');
        expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SubjectAlreadyExists);
        await expect(
          testPrisma.subject.count({ where: { normalizedName: shared.normalizedName } }),
        ).resolves.toBe(1);
      }
    });

    it('lets only one of two subjects take the same code at the same time', async () => {
      for (let round = 0; round < 6; round += 1) {
        const first = newSubject(`Primera ${String(round)}`);
        const second = newSubject(`Segunda ${String(round)}`);
        await repository.create(SCHOOL_ID, first);
        await repository.create(SCHOOL_ID, second);
        const code = `K${String(round)}`;
        const shared = { code, normalizedCode: code.toLowerCase() };

        const results = await Promise.allSettled([edit(first, shared), edit(second, shared)]);

        const rejected = results.filter(({ status }) => status === 'rejected');
        expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          SubjectCodeAlreadyExists,
        );
        await expect(
          testPrisma.subject.count({ where: { normalizedCode: code.toLowerCase() } }),
        ).resolves.toBe(1);
      }
    });

    it('either saves a requested course or finds it deleted, never another error', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const subject = newSubject(`Asignatura ${String(round)}`);
        await repository.create(SCHOOL_ID, subject);

        const [edited, deleted] = await Promise.allSettled([
          edit(subject, { courses: rows([course], 3) }),
          courseRepository.delete(SCHOOL_ID, course),
        ]);

        expect(deleted.status).toBe('fulfilled');
        if (edited.status === 'rejected') {
          expect(edited.reason).toBeInstanceOf(SubjectCoursesNotFound);
        }
        // Si la edición confirmó antes del borrado, la cascada se llevó la fila: nunca queda una fila colgada.
        await expect(storedRows(subject.id)).resolves.toEqual([]);
        await expect(testPrisma.subject.count({ where: { id: subject.id } })).resolves.toBe(1);
      }
    });

    it('either keeps a current course with new sessions or finds it deleted, never another error', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const subject = newSubject(`Asignatura ${String(round)}`, { courses: rows([course], 3) });
        await repository.create(SCHOOL_ID, subject);

        const [edited, deleted] = await Promise.allSettled([
          edit(subject, { courses: rows([course], 5) }),
          courseRepository.delete(SCHOOL_ID, course),
        ]);

        expect(deleted.status).toBe('fulfilled');
        if (edited.status === 'rejected') {
          expect(edited.reason).toBeInstanceOf(SubjectCoursesNotFound);
        }
        await expect(storedRows(subject.id)).resolves.toEqual([]);
      }
    });

    it('finishes an edition that drops a course and the deletion of that course without error', async () => {
      for (let round = 0; round < 8; round += 1) {
        const dropped = await createCourse(SCHOOL_ID, `Quitado ${String(round)}`);
        const kept = await createCourse(SCHOOL_ID, `Se queda ${String(round)}`);
        const subject = newSubject(`Asignatura ${String(round)}`, {
          courses: rows([dropped, kept], 3),
        });
        await repository.create(SCHOOL_ID, subject);

        const results = await Promise.allSettled([
          edit(subject, { courses: rows([kept], 2) }),
          courseRepository.delete(SCHOOL_ID, dropped),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        await expect(storedRows(subject.id)).resolves.toEqual(rows([kept], 2));
      }
    });

    it('finishes an edition, a creation and another edition with courses in common without error', async () => {
      for (let round = 0; round < 6; round += 1) {
        const courses = await Promise.all(
          ['A', 'B', 'C'].map((letter) =>
            createCourse(SCHOOL_ID, `Curso ${letter} ${String(round)}`),
          ),
        );
        const edited = newSubject(`Editada ${String(round)}`, { courses: rows(courses, 2) });
        const neighbour = newSubject(`Vecina ${String(round)}`, { courses: rows(courses, 3) });
        await repository.create(SCHOOL_ID, edited);
        await repository.create(SCHOOL_ID, neighbour);
        const created = newSubject(`Nueva ${String(round)}`, {
          courses: rows([...courses].reverse(), 4),
        });

        const results = await Promise.allSettled([
          edit(edited, { courses: rows([...courses].reverse(), 5) }),
          repository.create(SCHOOL_ID, created),
          edit(neighbour, { courses: rows(courses.slice(1), 1) }),
        ]);

        expect(results.map(({ status }) => status)).toEqual([
          'fulfilled',
          'fulfilled',
          'fulfilled',
        ]);
        await expect(storedRows(edited.id)).resolves.toHaveLength(3);
        await expect(storedRows(created.id)).resolves.toHaveLength(3);
        await expect(storedRows(neighbour.id)).resolves.toHaveLength(2);
      }
    });

    it('finishes an edition and the edition of a calendar that takes the course away without error', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const calendar = {
          id: nextId(),
          name: `Calendario ${String(round)}`,
          normalizedName: `calendario ${String(round)}`,
          periods: [{ type: 'SESSION' as const, startTime: '09:00', endTime: '09:45' }],
        };
        await calendarRepository.create(SCHOOL_ID, calendar, [course]);
        const subject = newSubject(`Asignatura ${String(round)}`, { courses: rows([course], 3) });
        await repository.create(SCHOOL_ID, subject);

        const results = await Promise.allSettled([
          edit(subject, { courses: rows([course], 4) }),
          // La edición deja al curso sin calendario: escribe en la fila del curso que `FOR SHARE` bloquea.
          calendarRepository.update(
            SCHOOL_ID,
            calendar.id,
            {
              name: calendar.name,
              normalizedName: calendar.normalizedName,
              periods: calendar.periods,
            },
            [],
          ),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        await expect(storedRows(subject.id)).resolves.toEqual(rows([course], 4));
        await expect(
          testPrisma.course.findUniqueOrThrow({ where: { id: course } }),
        ).resolves.toMatchObject({ calendarId: null });
      }
    });
  });

  describe('listBySchool', () => {
    it('returns the subjects of the school only, with their courses and sessions', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const foreignCourse = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      await repository.create(
        SCHOOL_ID,
        newSubject('Inglés', {
          code: 'ING',
          normalizedCode: 'ing',
          courses: [{ courseId: course, sessionsPerWeek: 4 }],
        }),
      );
      await repository.create(
        OTHER_SCHOOL_ID,
        newSubject('Francés', { courses: [{ courseId: foreignCourse, sessionsPerWeek: 2 }] }),
      );

      const subjects = await repository.listBySchool(SCHOOL_ID);

      expect(subjects).toHaveLength(1);
      expect(subjects[0]).toMatchObject({
        name: 'Inglés',
        code: 'ING',
        color: 'blue',
        courses: [{ id: course, name: '1º Primaria', sessionsPerWeek: 4 }],
      });
    });

    it('returns an empty list for a school without subjects', async () => {
      await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([]);
    });

    it('keeps a subject whose courses were all deleted, with an empty list of courses', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      await repository.create(
        SCHOOL_ID,
        newSubject('Inglés', { courses: [{ courseId: course, sessionsPerWeek: 3 }] }),
      );

      await testPrisma.course.delete({ where: { id: course } });

      await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([
        expect.objectContaining({ name: 'Inglés', courses: [] }),
      ]);
    });

    it('returns only what the API shows: no normalized name, no school and no update date', async () => {
      await repository.create(SCHOOL_ID, newSubject('Inglés'));

      const [subject] = await repository.listBySchool(SCHOOL_ID);

      expect(Object.keys(subject ?? {}).sort()).toEqual([
        'code',
        'color',
        'courses',
        'createdAt',
        'description',
        'id',
        'name',
        'status',
        'type',
      ]);
    });
  });

  describe('findById', () => {
    it('returns the subject of the school with its courses and sessions', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const subject = newSubject('Inglés', {
        code: 'ING',
        normalizedCode: 'ing',
        courses: [{ courseId: course, sessionsPerWeek: 4 }],
      });
      await repository.create(SCHOOL_ID, subject);

      await expect(repository.findById(SCHOOL_ID, subject.id)).resolves.toMatchObject({
        id: subject.id,
        name: 'Inglés',
        code: 'ING',
        courses: [{ id: course, name: '1º Primaria', sessionsPerWeek: 4 }],
      });
    });

    it('returns a subject without courses with an empty list', async () => {
      const subject = newSubject('Inglés');
      await repository.create(SCHOOL_ID, subject);

      await expect(repository.findById(SCHOOL_ID, subject.id)).resolves.toMatchObject({
        courses: [],
      });
    });

    it('returns null for a subject of another school and for one that does not exist', async () => {
      const foreign = newSubject('Francés');
      await repository.create(OTHER_SCHOOL_ID, foreign);

      await expect(repository.findById(SCHOOL_ID, foreign.id)).resolves.toBeNull();
      await expect(repository.findById(SCHOOL_ID, nextId())).resolves.toBeNull();
    });

    it('returns only what the API shows', async () => {
      const subject = newSubject('Inglés');
      await repository.create(SCHOOL_ID, subject);

      const found = await repository.findById(SCHOOL_ID, subject.id);

      expect(Object.keys(found ?? {}).sort()).toEqual([
        'code',
        'color',
        'courses',
        'createdAt',
        'description',
        'id',
        'name',
        'status',
        'type',
      ]);
    });
  });

  describe('update', () => {
    /** El estado final de una asignatura ya creada: lo mismo que se guardó, con los cambios por encima. */
    function finalState(subject: NewSubject, changes: Partial<NewSubject> = {}) {
      const { id: _id, ...state } = subject;
      return { ...state, ...changes };
    }

    it('saves every field and returns the subject as it was and as it is now', async () => {
      const subject = newSubject('Inglés', {
        code: 'ING',
        normalizedCode: 'ing',
        description: 'Lengua extranjera',
      });
      await repository.create(SCHOOL_ID, subject);

      const result = await repository.update(
        SCHOOL_ID,
        subject.id,
        finalState(subject, {
          name: 'Inglés avanzado',
          normalizedName: 'inglés avanzado',
          code: 'ING2',
          normalizedCode: 'ing2',
          type: 'ELECTIVE',
          status: 'INACTIVE',
          description: null,
          color: 'green',
        }),
      );

      expect(result?.before).toMatchObject({
        name: 'Inglés',
        code: 'ING',
        type: 'CORE',
        status: 'ACTIVE',
        description: 'Lengua extranjera',
        color: 'blue',
      });
      expect(result?.after).toMatchObject({
        id: subject.id,
        name: 'Inglés avanzado',
        code: 'ING2',
        type: 'ELECTIVE',
        status: 'INACTIVE',
        description: null,
        color: 'green',
      });
      expect(result?.after.createdAt).toEqual(result?.before.createdAt);
      await expect(
        testPrisma.subject.findUniqueOrThrow({ where: { id: subject.id } }),
      ).resolves.toMatchObject({ normalizedName: 'inglés avanzado', normalizedCode: 'ing2' });
    });

    it('lets the subject change only the capitalization of its own name and code', async () => {
      const subject = newSubject('Inglés', { code: 'ING', normalizedCode: 'ing' });
      await repository.create(SCHOOL_ID, subject);

      const result = await repository.update(
        SCHOOL_ID,
        subject.id,
        finalState(subject, { name: 'INGLÉS', normalizedName: 'inglés', code: 'ing' }),
      );

      expect(result?.after).toMatchObject({ name: 'INGLÉS', code: 'ing' });
    });

    it('removes the code, and then another subject can use it', async () => {
      const subject = newSubject('Inglés', { code: 'ING', normalizedCode: 'ing' });
      await repository.create(SCHOOL_ID, subject);

      const result = await repository.update(
        SCHOOL_ID,
        subject.id,
        finalState(subject, { code: null, normalizedCode: null }),
      );

      expect(result?.after.code).toBeNull();
      await expect(
        testPrisma.subject.findUniqueOrThrow({ where: { id: subject.id } }),
      ).resolves.toMatchObject({ code: null, normalizedCode: null });
      await expect(
        repository.create(
          SCHOOL_ID,
          newSubject('Inglés 2', { code: 'ING', normalizedCode: 'ing' }),
        ),
      ).resolves.toMatchObject({ code: 'ING' });
    });

    it('changes the sessions of a course, adds one and removes another, replacing the rows', async () => {
      const first = await createCourse(SCHOOL_ID, '1º Primaria');
      const second = await createCourse(SCHOOL_ID, '2º Primaria');
      const third = await createCourse(SCHOOL_ID, '3º Primaria');
      const subject = newSubject('Inglés', {
        courses: [
          { courseId: first, sessionsPerWeek: 3 },
          { courseId: second, sessionsPerWeek: 3 },
        ],
      });
      await repository.create(SCHOOL_ID, subject);

      const result = await repository.update(
        SCHOOL_ID,
        subject.id,
        finalState(subject, {
          courses: [
            { courseId: first, sessionsPerWeek: 2 },
            { courseId: third, sessionsPerWeek: 5 },
          ],
        }),
      );

      const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
      expect([...(result?.before.courses ?? [])].sort(byName)).toEqual([
        { id: first, name: '1º Primaria', sessionsPerWeek: 3 },
        { id: second, name: '2º Primaria', sessionsPerWeek: 3 },
      ]);
      expect([...(result?.after.courses ?? [])].sort(byName)).toEqual([
        { id: first, name: '1º Primaria', sessionsPerWeek: 2 },
        { id: third, name: '3º Primaria', sessionsPerWeek: 5 },
      ]);
      await expect(
        testPrisma.subjectCourse.findMany({
          where: { subjectId: subject.id },
          orderBy: { courseId: 'asc' },
          select: { courseId: true, sessionsPerWeek: true },
        }),
      ).resolves.toEqual([
        { courseId: first, sessionsPerWeek: 2 },
        { courseId: third, sessionsPerWeek: 5 },
      ]);
    });

    it('gives a subject that lost all its courses a new one', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const subject = newSubject('Inglés', { courses: [{ courseId: course, sessionsPerWeek: 3 }] });
      await repository.create(SCHOOL_ID, subject);
      await testPrisma.course.delete({ where: { id: course } });
      const other = await createCourse(SCHOOL_ID, '2º Primaria');

      const result = await repository.update(
        SCHOOL_ID,
        subject.id,
        finalState(subject, { courses: [{ courseId: other, sessionsPerWeek: 2 }] }),
      );

      expect(result?.before.courses).toEqual([]);
      expect(result?.after.courses).toEqual([
        { id: other, name: '2º Primaria', sessionsPerWeek: 2 },
      ]);
    });

    it('does not touch the courses or the other subjects that share them', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const subject = newSubject('Inglés', { courses: [{ courseId: course, sessionsPerWeek: 3 }] });
      const neighbour = newSubject('Francés', {
        courses: [{ courseId: course, sessionsPerWeek: 2 }],
      });
      await repository.create(SCHOOL_ID, subject);
      await repository.create(SCHOOL_ID, neighbour);

      await repository.update(
        SCHOOL_ID,
        subject.id,
        finalState(subject, { courses: [{ courseId: course, sessionsPerWeek: 5 }] }),
      );

      await expect(repository.findById(SCHOOL_ID, neighbour.id)).resolves.toMatchObject({
        courses: [{ id: course, sessionsPerWeek: 2 }],
      });
      await expect(testPrisma.course.count({ where: { id: course } })).resolves.toBe(1);
    });

    it('throws SubjectCoursesNotFound with the positions of the courses that are not in the school, and changes nothing', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const foreign = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const subject = newSubject('Inglés', { courses: [{ courseId: course, sessionsPerWeek: 3 }] });
      await repository.create(SCHOOL_ID, subject);

      const error = await repository
        .update(
          SCHOOL_ID,
          subject.id,
          finalState(subject, {
            name: 'Otro nombre',
            normalizedName: 'otro nombre',
            courses: [
              { courseId: course, sessionsPerWeek: 5 },
              { courseId: foreign, sessionsPerWeek: 2 },
              { courseId: nextId(), sessionsPerWeek: 2 },
            ],
          }),
        )
        .catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(SubjectCoursesNotFound);
      expect((error as SubjectCoursesNotFound).positions).toEqual([1, 2]);
      await expect(repository.findById(SCHOOL_ID, subject.id)).resolves.toMatchObject({
        name: 'Inglés',
        courses: [{ id: course, sessionsPerWeek: 3 }],
      });
    });

    it('returns null, and changes nothing, for a subject of another school or one that does not exist', async () => {
      const foreign = newSubject('Francés');
      await repository.create(OTHER_SCHOOL_ID, foreign);
      const state = finalState(foreign, { name: 'Cambiado', normalizedName: 'cambiado' });

      await expect(repository.update(SCHOOL_ID, foreign.id, state)).resolves.toBeNull();
      await expect(repository.update(SCHOOL_ID, nextId(), state)).resolves.toBeNull();

      await expect(repository.findById(OTHER_SCHOOL_ID, foreign.id)).resolves.toMatchObject({
        name: 'Francés',
      });
    });

    it('answers that the subject does not exist before looking at its courses', async () => {
      const subject = newSubject('Inglés');

      await expect(
        repository.update(
          SCHOOL_ID,
          nextId(),
          finalState(subject, { courses: [{ courseId: nextId(), sessionsPerWeek: 2 }] }),
        ),
      ).resolves.toBeNull();
    });

    it('throws SubjectAlreadyExists for the name of another subject, whatever its case, and changes nothing', async () => {
      const subject = newSubject('Inglés');
      await repository.create(SCHOOL_ID, subject);
      await repository.create(SCHOOL_ID, newSubject('Programación'));

      await expect(
        repository.update(
          SCHOOL_ID,
          subject.id,
          finalState(subject, { name: 'PROGRAMACIÓN', normalizedName: 'programación' }),
        ),
      ).rejects.toBeInstanceOf(SubjectAlreadyExists);

      await expect(repository.findById(SCHOOL_ID, subject.id)).resolves.toMatchObject({
        name: 'Inglés',
      });
    });

    it('throws SubjectCodeAlreadyExists for the code of another subject, whatever its case, and changes nothing', async () => {
      const subject = newSubject('Inglés', { code: 'ING', normalizedCode: 'ing' });
      await repository.create(SCHOOL_ID, subject);
      await repository.create(
        SCHOOL_ID,
        newSubject('Programación', { code: 'PRG', normalizedCode: 'prg' }),
      );

      await expect(
        repository.update(
          SCHOOL_ID,
          subject.id,
          finalState(subject, { code: 'prg', normalizedCode: 'prg' }),
        ),
      ).rejects.toBeInstanceOf(SubjectCodeAlreadyExists);

      await expect(repository.findById(SCHOOL_ID, subject.id)).resolves.toMatchObject({
        code: 'ING',
      });
    });

    it('allows the name and the code of a subject of another school', async () => {
      const subject = newSubject('Inglés');
      await repository.create(SCHOOL_ID, subject);
      await repository.create(
        OTHER_SCHOOL_ID,
        newSubject('Programación', { code: 'PRG', normalizedCode: 'prg' }),
      );

      await expect(
        repository.update(
          SCHOOL_ID,
          subject.id,
          finalState(subject, {
            name: 'Programación',
            normalizedName: 'programación',
            code: 'PRG',
            normalizedCode: 'prg',
          }),
        ),
      ).resolves.toMatchObject({ after: { name: 'Programación', code: 'PRG' } });
    });

    it('saves an identical state without error', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const subject = newSubject('Inglés', { courses: [{ courseId: course, sessionsPerWeek: 3 }] });
      await repository.create(SCHOOL_ID, subject);

      const result = await repository.update(SCHOOL_ID, subject.id, finalState(subject));

      expect(result?.after).toEqual(result?.before);
    });

    it('changes nothing when the rows of the courses fail halfway', async () => {
      const first = await createCourse(SCHOOL_ID, '1º Primaria');
      const second = await createCourse(SCHOOL_ID, '2º Primaria');
      const subject = newSubject('Inglés', {
        color: 'blue',
        courses: [{ courseId: first, sessionsPerWeek: 3 }],
      });
      await repository.create(SCHOOL_ID, subject);
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_subject_course() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_subject_course BEFORE INSERT ON subject_courses FOR EACH ROW EXECUTE FUNCTION reject_subject_course()',
      );

      try {
        await expect(
          repository.update(
            SCHOOL_ID,
            subject.id,
            finalState(subject, {
              name: 'Otro nombre',
              normalizedName: 'otro nombre',
              color: 'green',
              courses: [{ courseId: second, sessionsPerWeek: 2 }],
            }),
          ),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_subject_course ON subject_courses');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_subject_course()');
      }

      await expect(repository.findById(SCHOOL_ID, subject.id)).resolves.toMatchObject({
        name: 'Inglés',
        color: 'blue',
        courses: [{ id: first, sessionsPerWeek: 3 }],
      });
    });
  });
});

describe('PrismaSubjectRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaSubjectRepository(prisma) };
  }

  it.each([
    [
      'create',
      (unreachableRepository: PrismaSubjectRepository) =>
        unreachableRepository.create(SCHOOL_ID, newSubject('Inglés')),
    ],
    [
      'listBySchool',
      (unreachableRepository: PrismaSubjectRepository) =>
        unreachableRepository.listBySchool(SCHOOL_ID),
    ],
    [
      'findById',
      (unreachableRepository: PrismaSubjectRepository) =>
        unreachableRepository.findById(SCHOOL_ID, nextId()),
    ],
    [
      'update',
      (unreachableRepository: PrismaSubjectRepository) => {
        const { id, ...state } = newSubject('Inglés');
        return unreachableRepository.update(SCHOOL_ID, id, state);
      },
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository: unreachableRepository } = unreachable();

    await expect(operation(unreachableRepository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
