import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaCalendarRepository } from './prismaCalendarRepository.js';
import { PrismaCourseRepository } from './prismaCourseRepository.js';
import { PrismaCourseWorkloadRepository } from './prismaCourseWorkloadRepository.js';
import { PrismaSubjectRepository } from './prismaSubjectRepository.js';

const repository = new PrismaCourseWorkloadRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(7000 + ++sequence).padStart(12, '0')}`;

type PeriodKind = 'SESSION' | 'BREAK';

/** Un calendario cuya jornada es la lista de periodos dada, en orden. */
async function createCalendar(schoolId: string, name: string, kinds: PeriodKind[]) {
  const id = nextId();
  await testPrisma.calendar.create({
    data: {
      id,
      schoolId,
      name,
      normalizedName: name.toLowerCase(),
      periods: {
        create: kinds.map((kind, position) => ({
          id: nextId(),
          position,
          kind,
          startMinute: 540 + position * 60,
          endMinute: 590 + position * 60,
        })),
      },
    },
  });
  return id;
}

async function createCourse(schoolId: string, name: string, calendarId: string | null = null) {
  const id = nextId();
  await testPrisma.course.create({
    data: { id, schoolId, name, normalizedName: name.toLowerCase(), calendarId },
  });
  return id;
}

async function createSubject(
  schoolId: string,
  name: string,
  overrides: { status?: 'ACTIVE' | 'INACTIVE'; code?: string | null } = {},
) {
  const id = nextId();
  const code = overrides.code ?? null;
  await testPrisma.subject.create({
    data: {
      id,
      schoolId,
      name,
      normalizedName: name.toLowerCase(),
      code,
      normalizedCode: code === null ? null : code.toLowerCase(),
      type: 'CORE',
      status: overrides.status ?? 'ACTIVE',
      color: 'blue',
    },
  });
  return id;
}

async function teach(subjectId: string, courseId: string, sessionsPerWeek: number) {
  await testPrisma.subjectCourse.create({ data: { subjectId, courseId, sessionsPerWeek } });
}

const storedRows = async (courseId: string) =>
  (
    await testPrisma.subjectCourse.findMany({
      where: { courseId },
      orderBy: { subjectId: 'asc' },
    })
  ).map(({ subjectId, sessionsPerWeek }) => ({ subjectId, sessionsPerWeek }));

describe('PrismaCourseWorkloadRepository', () => {
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

  describe('findByCourse', () => {
    it('counts only the sessions of the calendar of the course, not its breaks', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Jornada continua', [
        'SESSION',
        'SESSION',
        'BREAK',
        'SESSION',
      ]);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.course).toEqual({ id: course, name: '1º Primaria' });
      expect(snapshot?.calendar).toEqual({
        id: calendar,
        name: 'Jornada continua',
        sessionsPerDay: 3,
      });
    });

    it('has no calendar when the course has none', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.calendar).toBeNull();
    });

    it('returns every subject of the school with its sessions in this course or null', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const other = await createCourse(SCHOOL_ID, '2º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés', { code: 'ING' });
      const music = await createSubject(SCHOOL_ID, 'Música');
      const art = await createSubject(SCHOOL_ID, 'Plástica');
      await teach(english, course, 3);
      await teach(english, other, 5);
      await teach(music, other, 2);

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      const bySubject = new Map(snapshot?.subjects.map((subject) => [subject.id, subject]));
      expect(bySubject.size).toBe(3);
      expect(bySubject.get(english)).toEqual({
        id: english,
        name: 'Inglés',
        code: 'ING',
        color: 'blue',
        status: 'ACTIVE',
        sessionsPerWeek: 3,
      });
      expect(bySubject.get(music)?.sessionsPerWeek).toBeNull();
      expect(bySubject.get(art)?.sessionsPerWeek).toBeNull();
      expect(bySubject.get(art)?.code).toBeNull();
    });

    it('includes the inactive subjects with their status', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const latin = await createSubject(SCHOOL_ID, 'Latín', { status: 'INACTIVE' });
      await teach(latin, course, 2);

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.subjects).toEqual([
        expect.objectContaining({ id: latin, status: 'INACTIVE', sessionsPerWeek: 2 }),
      ]);
    });

    it('never returns the subjects of another school', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      await createSubject(OTHER_SCHOOL_ID, 'Inglés ajeno');

      const snapshot = await repository.findByCourse(SCHOOL_ID, course);

      expect(snapshot?.subjects).toEqual([]);
    });

    it('returns null for a course of another school or one that does not exist', async () => {
      const foreign = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');

      await expect(repository.findByCourse(SCHOOL_ID, foreign)).resolves.toBeNull();
      await expect(repository.findByCourse(SCHOOL_ID, nextId())).resolves.toBeNull();
    });
  });

  describe('applyChanges', () => {
    it('creates, updates and deletes rows and answers with the counts and the load as it ended', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Corta', ['SESSION', 'SESSION']);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const language = await createSubject(SCHOOL_ID, 'Lengua');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 3);
      await teach(language, course, 5);

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 4 },
        { subjectId: music, sessionsPerWeek: 2 },
        { subjectId: language, sessionsPerWeek: null },
      ]);

      expect(result).toMatchObject({ kind: 'applied', added: 1, removed: 1, changed: 1 });
      if (result.kind !== 'applied') {
        throw new Error('expected applied');
      }
      expect(new Map(result.workload.subjects.map((s) => [s.id, s.sessionsPerWeek]))).toEqual(
        new Map([
          [english, 4],
          [language, null],
          [music, 2],
        ]),
      );
      expect(result.workload.calendar?.sessionsPerDay).toBe(2);
      await expect(storedRows(course)).resolves.toEqual(
        [
          { subjectId: english, sessionsPerWeek: 4 },
          { subjectId: music, sessionsPerWeek: 2 },
        ].sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
      );
    });

    it('does not touch the rows that are not in the changes, and keeps created_at when it updates', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const language = await createSubject(SCHOOL_ID, 'Lengua');
      await teach(english, course, 3);
      await teach(language, course, 5);
      const before = await testPrisma.subjectCourse.findMany({ where: { courseId: course } });
      const row = (rows: typeof before, subjectId: string) =>
        rows.find((candidate) => candidate.subjectId === subjectId)!;
      await new Promise((resolve) => setTimeout(resolve, 20));

      await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 4 },
      ]);

      const after = await testPrisma.subjectCourse.findMany({ where: { courseId: course } });
      expect(row(after, language)).toEqual(row(before, language));
      expect(row(after, english).createdAt).toEqual(row(before, english).createdAt);
      expect(row(after, english).sessionsPerWeek).toBe(4);
      expect(row(after, english).updatedAt.getTime()).toBeGreaterThan(
        row(before, english).updatedAt.getTime(),
      );
    });

    it('does not count as a change the same sessions or quitting a subject that was not taught', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 3);

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 3 },
        { subjectId: music, sessionsPerWeek: null },
      ]);

      expect(result).toMatchObject({ kind: 'applied', added: 0, removed: 0, changed: 0 });
      await expect(storedRows(course)).resolves.toEqual([
        { subjectId: english, sessionsPerWeek: 3 },
      ]);
    });

    it('leaves a subject without courses when its last course is removed from here', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const french = await createSubject(SCHOOL_ID, 'Francés');
      await teach(french, course, 2);

      await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: french, sessionsPerWeek: null },
      ]);

      await expect(testPrisma.subject.count({ where: { id: french } })).resolves.toBe(1);
      await expect(testPrisma.subjectCourse.count()).resolves.toBe(0);
    });

    it('saves a load that does not fit the calendar', async () => {
      const calendar = await createCalendar(SCHOOL_ID, 'Una sesión', ['SESSION']);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar);
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const language = await createSubject(SCHOOL_ID, 'Lengua');

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 5 },
        { subjectId: language, sessionsPerWeek: 5 },
      ]);

      expect(result).toMatchObject({ kind: 'applied', added: 2 });
      await expect(storedRows(course)).resolves.toHaveLength(2);
    });

    it('changes the inactive subjects too', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const latin = await createSubject(SCHOOL_ID, 'Latín', { status: 'INACTIVE' });

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: latin, sessionsPerWeek: 2 },
      ]);

      expect(result).toMatchObject({ kind: 'applied', added: 1 });
    });

    it('reports the position of each subject that is not in the school and writes nothing', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const foreign = await createSubject(OTHER_SCHOOL_ID, 'Ajena');

      const result = await repository.applyChanges(SCHOOL_ID, course, [
        { subjectId: english, sessionsPerWeek: 3 },
        { subjectId: foreign, sessionsPerWeek: 3 },
        { subjectId: nextId(), sessionsPerWeek: null },
      ]);

      expect(result).toEqual({ kind: 'subjectsNotFound', positions: [1, 2] });
      await expect(storedRows(course)).resolves.toEqual([]);
    });

    it('answers courseNotFound for a course of another school or one that does not exist', async () => {
      const foreign = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');

      await expect(
        repository.applyChanges(SCHOOL_ID, foreign, [{ subjectId: english, sessionsPerWeek: 3 }]),
      ).resolves.toEqual({ kind: 'courseNotFound' });
      await expect(
        repository.applyChanges(SCHOOL_ID, nextId(), [{ subjectId: english, sessionsPerWeek: 3 }]),
      ).resolves.toEqual({ kind: 'courseNotFound' });
      await expect(testPrisma.subjectCourse.count()).resolves.toBe(0);
    });

    it('writes nothing when a row fails halfway: the deletion that came first is undone', async () => {
      const course = await createCourse(SCHOOL_ID, '1º Primaria');
      const english = await createSubject(SCHOOL_ID, 'Inglés');
      const music = await createSubject(SCHOOL_ID, 'Música');
      await teach(english, course, 3);
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_workload_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_workload_row BEFORE INSERT ON subject_courses FOR EACH ROW EXECUTE FUNCTION reject_workload_row()',
      );

      try {
        await expect(
          repository.applyChanges(SCHOOL_ID, course, [
            { subjectId: english, sessionsPerWeek: null },
            { subjectId: music, sessionsPerWeek: 2 },
          ]),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_workload_row ON subject_courses');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_workload_row()');
      }

      await expect(storedRows(course)).resolves.toEqual([
        { subjectId: english, sessionsPerWeek: 3 },
      ]);
    });
  });
});

describe('PrismaCourseWorkloadRepository concurrency', () => {
  const subjectRepository = new PrismaSubjectRepository(testPrisma);
  const courseRepository = new PrismaCourseRepository(testPrisma);
  const calendarRepository = new PrismaCalendarRepository(testPrisma);

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
  });

  /** Edita la asignatura dejándola como era salvo por los cursos. */
  const editSubject = (
    subjectId: string,
    name: string,
    courses: { courseId: string; sessionsPerWeek: number }[],
  ) =>
    subjectRepository.update(SCHOOL_ID, subjectId, {
      name,
      normalizedName: name.toLowerCase(),
      code: null,
      normalizedCode: null,
      type: 'CORE',
      status: 'ACTIVE',
      description: null,
      color: 'blue',
      courses,
    });

  it('keeps both changes when two requests change different subjects of the same course', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      const language = await createSubject(SCHOOL_ID, `Lengua ${String(round)}`);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: english, sessionsPerWeek: 2 }]),
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: language, sessionsPerWeek: 4 }]),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      await expect(storedRows(course)).resolves.toEqual(
        [
          { subjectId: english, sessionsPerWeek: 2 },
          { subjectId: language, sessionsPerWeek: 4 },
        ].sort((a, b) => a.subjectId.localeCompare(b.subjectId)),
      );
    }
  });

  it('leaves the value of one of the two requests that change the same subject, never an error', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: english, sessionsPerWeek: 2 }]),
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: english, sessionsPerWeek: 4 }]),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      const rows = await storedRows(course);
      expect(rows).toHaveLength(1);
      expect([2, 4]).toContain(rows[0]?.sessionsPerWeek);
    }
  });

  it('finishes a change of the load and the edition of the same subject that drops the course', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      await teach(english, course, 3);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: english, sessionsPerWeek: 5 }]),
        editSubject(english, `Inglés ${String(round)}`, []),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      // Gana el último en confirmarse: la fila con las sesiones de la carga o ninguna fila, nunca otra cosa.
      const rows = await storedRows(course);
      expect(rows.length === 0 || rows[0]?.sessionsPerWeek === 5).toBe(true);
    }
  });

  it('finishes a change of the load and the edition of the same subject that changes its sessions', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      await teach(english, course, 3);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: english, sessionsPerWeek: 4 }]),
        editSubject(english, `Inglés ${String(round)}`, [{ courseId: course, sessionsPerWeek: 2 }]),
      ]);

      expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      const rows = await storedRows(course);
      expect(rows).toHaveLength(1);
      expect([4, 2]).toContain(rows[0]?.sessionsPerWeek);
    }
  });

  it('either applies a change or finds the course deleted when the course is deleted at the same time', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      await teach(english, course, 3);

      const [applied, deleted] = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: english, sessionsPerWeek: 5 }]),
        courseRepository.delete(SCHOOL_ID, course),
      ]);

      expect(deleted.status).toBe('fulfilled');
      expect(applied.status).toBe('fulfilled');
      if (applied.status === 'fulfilled') {
        expect(['applied', 'courseNotFound']).toContain(applied.value.kind);
      }
      // Si el cambio confirmó antes del borrado, la cascada se llevó la fila: nunca queda una colgada.
      await expect(testPrisma.course.count({ where: { id: course } })).resolves.toBe(0);
      await expect(testPrisma.subjectCourse.count({ where: { courseId: course } })).resolves.toBe(
        0,
      );
    }
  });

  it('either applies a change or finds the subject deleted when the subject is deleted at the same time', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      await teach(english, course, 3);

      const [applied, deleted] = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: english, sessionsPerWeek: 5 }]),
        subjectRepository.delete(SCHOOL_ID, english),
      ]);

      expect(deleted).toEqual({ status: 'fulfilled', value: true });
      expect(applied.status).toBe('fulfilled');
      if (applied.status === 'fulfilled') {
        expect(['applied', 'subjectsNotFound']).toContain(applied.value.kind);
      }
      await expect(testPrisma.subject.count({ where: { id: english } })).resolves.toBe(0);
      await expect(testPrisma.subjectCourse.count({ where: { courseId: course } })).resolves.toBe(
        0,
      );
    }
  });

  it('finishes a change of the load and the edition of the calendar that takes the course away', async () => {
    for (let round = 0; round < 8; round += 1) {
      const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
      const english = await createSubject(SCHOOL_ID, `Inglés ${String(round)}`);
      const calendar = {
        id: nextId(),
        name: `Calendario ${String(round)}`,
        normalizedName: `calendario ${String(round)}`,
        periods: [{ type: 'SESSION' as const, startTime: '09:00', endTime: '09:45' }],
      };
      await calendarRepository.create(SCHOOL_ID, calendar, [course]);

      const results = await Promise.allSettled([
        repository.applyChanges(SCHOOL_ID, course, [{ subjectId: english, sessionsPerWeek: 4 }]),
        // La edición deja al curso sin calendario: escribe en la fila del curso que el cambio bloquea.
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
      await expect(storedRows(course)).resolves.toEqual([
        { subjectId: english, sessionsPerWeek: 4 },
      ]);
      await expect(
        testPrisma.course.findUniqueOrThrow({ where: { id: course } }),
      ).resolves.toMatchObject({ calendarId: null });
    }
  });
});

describe('PrismaCourseWorkloadRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaCourseWorkloadRepository(prisma) };
  }

  it.each([
    [
      'findByCourse',
      (unreachableRepository: PrismaCourseWorkloadRepository) =>
        unreachableRepository.findByCourse(SCHOOL_ID, nextId()),
    ],
    [
      'applyChanges',
      (unreachableRepository: PrismaCourseWorkloadRepository) =>
        unreachableRepository.applyChanges(SCHOOL_ID, nextId(), [
          { subjectId: nextId(), sessionsPerWeek: 2 },
        ]),
    ],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository: unreachableRepository } = unreachable();

    await expect(operation(unreachableRepository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
