import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { CalendarPeriod } from '../../domain/calendar/calendar.js';
import {
  CalendarAlreadyExists,
  CalendarCoursesNotFound,
} from '../../domain/calendar/calendarErrors.js';
import type { NewCalendar } from '../../domain/calendar/calendarRepository.js';
import { testDatabaseUrl, testPrisma } from '../../../test/support/testPrisma.js';
import { createPrismaClient } from './createPrismaClient.js';
import { PrismaCalendarRepository } from './prismaCalendarRepository.js';
import { PrismaCourseRepository } from './prismaCourseRepository.js';

const repository = new PrismaCalendarRepository(testPrisma);
const courseRepository = new PrismaCourseRepository(testPrisma);

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';

let sequence = 0;
const nextId = () => `0192f5a0-0000-7000-8000-${String(5000 + ++sequence).padStart(12, '0')}`;

const session = (startTime: string, endTime: string): CalendarPeriod => ({
  type: 'SESSION',
  startTime,
  endTime,
});
const recess = (startTime: string, endTime: string): CalendarPeriod => ({
  type: 'BREAK',
  startTime,
  endTime,
});

const PRIMARY: CalendarPeriod[] = [
  session('09:00', '09:45'),
  session('09:45', '10:30'),
  recess('10:30', '11:00'),
  session('11:00', '11:45'),
];

function newCalendar(name: string, periods: CalendarPeriod[] = PRIMARY): NewCalendar {
  return { id: nextId(), name, normalizedName: name.toLowerCase(), periods };
}

async function createCourse(schoolId: string, name: string, calendarId?: string) {
  const id = nextId();
  await testPrisma.course.create({
    data: {
      id,
      schoolId,
      name,
      normalizedName: name.toLowerCase(),
      calendarId: calendarId ?? null,
    },
  });
  return id;
}

const calendarCount = () => testPrisma.calendar.count();
const periodCount = () => testPrisma.calendarPeriod.count();
const calendarOf = async (courseId: string) =>
  (await testPrisma.course.findUniqueOrThrow({ where: { id: courseId } })).calendarId;

describe('PrismaCalendarRepository', () => {
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
    it('stores the calendar with its periods in order, as minutes since midnight, and returns it', async () => {
      const calendar = newCalendar('Primaria');

      const created = await repository.create(SCHOOL_ID, calendar, []);

      expect(created).toMatchObject({
        id: calendar.id,
        name: 'Primaria',
        periods: PRIMARY,
        courses: [],
      });
      expect(created.createdAt).toBeInstanceOf(Date);
      const stored = await testPrisma.calendarPeriod.findMany({
        where: { calendarId: calendar.id },
        orderBy: { position: 'asc' },
      });
      expect(
        stored.map(({ position, kind, startMinute, endMinute }) => [
          position,
          kind,
          startMinute,
          endMinute,
        ]),
      ).toEqual([
        [1, 'SESSION', 540, 585],
        [2, 'SESSION', 585, 630],
        [3, 'BREAK', 630, 660],
        [4, 'SESSION', 660, 705],
      ]);
      await expect(
        testPrisma.calendar.findUniqueOrThrow({ where: { id: calendar.id } }),
      ).resolves.toMatchObject({ schoolId: SCHOOL_ID, normalizedName: 'primaria' });
    });

    it('assigns the courses to the calendar and returns them', async () => {
      const first = await createCourse(SCHOOL_ID, '1º Primaria');
      const second = await createCourse(SCHOOL_ID, '2º Primaria');
      const untouched = await createCourse(SCHOOL_ID, '3º Primaria');
      const calendar = newCalendar('Primaria');

      const created = await repository.create(SCHOOL_ID, calendar, [first, second]);

      expect([...created.courses].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
        { id: first, name: '1º Primaria' },
        { id: second, name: '2º Primaria' },
      ]);
      await expect(calendarOf(first)).resolves.toBe(calendar.id);
      await expect(calendarOf(second)).resolves.toBe(calendar.id);
      await expect(calendarOf(untouched)).resolves.toBeNull();
    });

    it('moves a course that followed another calendar, and leaves the other courses of that calendar', async () => {
      const old = newCalendar('Infantil');
      await repository.create(SCHOOL_ID, old, []);
      const moved = await createCourse(SCHOOL_ID, '1º Primaria', old.id);
      const stays = await createCourse(SCHOOL_ID, '2º Primaria', old.id);
      const calendar = newCalendar('Primaria');

      await repository.create(SCHOOL_ID, calendar, [moved]);

      await expect(calendarOf(moved)).resolves.toBe(calendar.id);
      await expect(calendarOf(stays)).resolves.toBe(old.id);
    });

    it('throws CalendarCoursesNotFound with the positions of the courses that are not in the school, writing nothing', async () => {
      const mine = await createCourse(SCHOOL_ID, '1º Primaria');
      const foreign = await createCourse(OTHER_SCHOOL_ID, '1º Primaria');
      const unknown = nextId();

      const error = await repository
        .create(SCHOOL_ID, newCalendar('Primaria'), [mine, foreign, unknown])
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CalendarCoursesNotFound);
      expect((error as CalendarCoursesNotFound).positions).toEqual([1, 2]);
      await expect(calendarCount()).resolves.toBe(0);
      await expect(periodCount()).resolves.toBe(0);
      await expect(calendarOf(mine)).resolves.toBeNull();
      await expect(calendarOf(foreign)).resolves.toBeNull();
    });

    it('throws CalendarAlreadyExists for the same normalized name in the school, creating nothing more', async () => {
      await repository.create(SCHOOL_ID, newCalendar('Primaria'), []);
      const course = await createCourse(SCHOOL_ID, '1º Primaria');

      await expect(
        repository.create(SCHOOL_ID, newCalendar('PRIMARIA'), [course]),
      ).rejects.toBeInstanceOf(CalendarAlreadyExists);

      await expect(calendarCount()).resolves.toBe(1);
      await expect(periodCount()).resolves.toBe(PRIMARY.length);
      await expect(calendarOf(course)).resolves.toBeNull();
    });

    it('lets two schools have a calendar with the same name', async () => {
      await repository.create(SCHOOL_ID, newCalendar('Primaria'), []);

      await expect(
        repository.create(OTHER_SCHOOL_ID, newCalendar('Primaria'), []),
      ).resolves.toMatchObject({ name: 'Primaria' });
    });

    it('creates nothing when the periods cannot be stored: no calendar and no course moved', async () => {
      const old = newCalendar('Infantil');
      await repository.create(SCHOOL_ID, old, []);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', old.id);
      // Un disparador que rechaza cualquier periodo hace fallar la operación a mitad.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_period() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_period BEFORE INSERT ON calendar_periods FOR EACH ROW EXECUTE FUNCTION reject_period()',
      );

      try {
        await expect(
          repository.create(SCHOOL_ID, newCalendar('Primaria'), [course]),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_period ON calendar_periods');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_period()');
      }

      await expect(calendarCount()).resolves.toBe(1);
      await expect(calendarOf(course)).resolves.toBe(old.id);
    });
  });

  describe('listBySchool', () => {
    it('returns the calendars of the school only, with their periods in order and their courses', async () => {
      const primary = newCalendar('Primaria');
      const infant = newCalendar('Infantil', [
        session('09:00', '09:45'),
        session('09:45', '10:30'),
      ]);
      await repository.create(SCHOOL_ID, primary, []);
      await repository.create(SCHOOL_ID, infant, []);
      await repository.create(OTHER_SCHOOL_ID, newCalendar('Ajeno'), []);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', primary.id);

      const calendars = await repository.listBySchool(SCHOOL_ID);

      expect(calendars).toHaveLength(2);
      const listedPrimary = calendars.find(({ id }) => id === primary.id);
      expect(listedPrimary?.periods).toEqual(PRIMARY);
      expect(listedPrimary?.courses).toEqual([{ id: course, name: '1º Primaria' }]);
      expect(calendars.find(({ id }) => id === infant.id)?.courses).toEqual([]);
      expect(calendars.some(({ name }) => name === 'Ajeno')).toBe(false);
    });

    it('returns an empty list for a school without calendars', async () => {
      await repository.create(OTHER_SCHOOL_ID, newCalendar('Ajeno'), []);

      await expect(repository.listBySchool(SCHOOL_ID)).resolves.toEqual([]);
    });
  });

  describe('at the same time as other writes', () => {
    it('lets only one of two simultaneous creations with the same name succeed', async () => {
      const results = await Promise.allSettled([
        repository.create(SCHOOL_ID, newCalendar('Primaria'), []),
        repository.create(SCHOOL_ID, newCalendar('primaria'), []),
      ]);

      const fulfilled = results.filter(({ status }) => status === 'fulfilled');
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(CalendarAlreadyExists);
      await expect(calendarCount()).resolves.toBe(1);
      await expect(periodCount()).resolves.toBe(PRIMARY.length);
    });

    it('finishes two creations with courses in common without error, each shared course in one of them', async () => {
      for (let round = 0; round < 6; round += 1) {
        const courses = await Promise.all(
          ['A', 'B', 'C'].map((letter) =>
            createCourse(SCHOOL_ID, `Curso ${letter} ${String(round)}`),
          ),
        );
        const first = newCalendar(`Primero ${String(round)}`);
        const second = newCalendar(`Segundo ${String(round)}`);

        const results = await Promise.allSettled([
          repository.create(SCHOOL_ID, first, courses),
          repository.create(SCHOOL_ID, second, [...courses].reverse()),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        for (const course of courses) {
          expect([first.id, second.id]).toContain(await calendarOf(course));
        }
      }
    });

    it('either assigns the course or finds it deleted, never an error or a dangling course', async () => {
      for (let round = 0; round < 8; round += 1) {
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`);
        const calendar = newCalendar(`Calendario ${String(round)}`);

        const [created, deleted] = await Promise.allSettled([
          repository.create(SCHOOL_ID, calendar, [course]),
          courseRepository.delete(SCHOOL_ID, course),
        ]);

        expect(deleted.status).toBe('fulfilled');
        if (created.status === 'rejected') {
          expect(created.reason).toBeInstanceOf(CalendarCoursesNotFound);
          await expect(testPrisma.calendar.count({ where: { id: calendar.id } })).resolves.toBe(0);
        } else {
          await expect(testPrisma.calendar.count({ where: { id: calendar.id } })).resolves.toBe(1);
        }
        await expect(testPrisma.course.count({ where: { id: course } })).resolves.toBe(0);
      }
    });
  });
});

describe('PrismaCalendarRepository with an unreachable database', () => {
  function unreachable() {
    const wrongCredentials = new URL(testDatabaseUrl);
    wrongCredentials.password = 'wrong-password';
    const prisma = createPrismaClient({ connectionString: wrongCredentials.toString() });
    return { prisma, repository: new PrismaCalendarRepository(prisma) };
  }

  it.each([
    [
      'create',
      (repository: PrismaCalendarRepository) =>
        repository.create(SCHOOL_ID, newCalendar('Primaria'), []),
    ],
    ['listBySchool', (repository: PrismaCalendarRepository) => repository.listBySchool(SCHOOL_ID)],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
