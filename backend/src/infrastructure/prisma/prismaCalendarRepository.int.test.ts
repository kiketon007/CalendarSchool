import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseUnavailable } from '../../application/databaseUnavailable.js';
import type { CalendarPeriod } from '../../domain/calendar/calendar.js';
import {
  CalendarAlreadyExists,
  CalendarCoursesNotFound,
} from '../../domain/calendar/calendarErrors.js';
import type { CalendarChanges, NewCalendar } from '../../domain/calendar/calendarRepository.js';
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

/** Lo que deja una edición: nombre, nombre normalizado y periodos. */
function changes(name: string, periods: CalendarPeriod[] = PRIMARY): CalendarChanges {
  return { name, normalizedName: name.toLowerCase(), periods };
}

const SHORT_DAY: CalendarPeriod[] = [session('08:30', '09:30'), session('09:30', '10:30')];

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

  describe('findById', () => {
    it('returns the calendar of the school with its periods in order and its courses', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);

      const found = await repository.findById(SCHOOL_ID, calendar.id);

      expect(found).toMatchObject({
        id: calendar.id,
        name: 'Primaria',
        periods: PRIMARY,
        courses: [{ id: course, name: '1º Primaria' }],
      });
      expect(found?.createdAt).toBeInstanceOf(Date);
    });

    it('returns null for a calendar of another school and for one that does not exist', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);

      await expect(repository.findById(OTHER_SCHOOL_ID, calendar.id)).resolves.toBeNull();
      await expect(repository.findById(SCHOOL_ID, nextId())).resolves.toBeNull();
    });
  });

  describe('update', () => {
    it('renames the calendar and replaces all its periods in order, returning how it was and how it is', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);

      const result = await repository.update(
        SCHOOL_ID,
        calendar.id,
        changes('Primaria 1º ciclo', SHORT_DAY),
        [],
      );

      expect(result?.before).toMatchObject({ name: 'Primaria', periods: PRIMARY });
      expect(result?.after).toMatchObject({
        id: calendar.id,
        name: 'Primaria 1º ciclo',
        periods: SHORT_DAY,
      });
      expect(result?.after.createdAt).toEqual(result?.before.createdAt);
      const stored = await testPrisma.calendarPeriod.findMany({
        where: { calendarId: calendar.id },
        orderBy: { position: 'asc' },
      });
      expect(
        stored.map(({ position, startMinute, endMinute }) => [position, startMinute, endMinute]),
      ).toEqual([
        [1, 510, 570],
        [2, 570, 630],
      ]);
      await expect(periodCount()).resolves.toBe(SHORT_DAY.length);
    });

    it('lets the calendar change only the capital letters or spaces of its own name', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);

      const result = await repository.update(SCHOOL_ID, calendar.id, changes('PRIMARIA'), []);

      expect(result?.after.name).toBe('PRIMARIA');
    });

    it('leaves the calendar as it is when nothing changes', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);

      const result = await repository.update(SCHOOL_ID, calendar.id, changes('Primaria'), [course]);

      expect(result?.after).toEqual(result?.before);
    });

    it('adds courses, moves one from another calendar and frees the ones that are not asked for', async () => {
      const calendar = newCalendar('Primaria');
      const other = newCalendar('Infantil');
      await repository.create(SCHOOL_ID, calendar, []);
      await repository.create(SCHOOL_ID, other, []);
      const kept = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);
      const freed = await createCourse(SCHOOL_ID, '2º Primaria', calendar.id);
      const moved = await createCourse(SCHOOL_ID, '3º Primaria', other.id);
      const added = await createCourse(SCHOOL_ID, '4º Primaria');
      const bystander = await createCourse(SCHOOL_ID, 'Infantil 3 años', other.id);

      const result = await repository.update(SCHOOL_ID, calendar.id, changes('Primaria'), [
        kept,
        moved,
        added,
      ]);

      expect(result?.after.courses.map(({ id }) => id).sort()).toEqual([kept, moved, added].sort());
      await expect(calendarOf(freed)).resolves.toBeNull();
      await expect(calendarOf(moved)).resolves.toBe(calendar.id);
      await expect(calendarOf(bystander)).resolves.toBe(other.id);
    });

    it('leaves the calendar without courses when none is asked for', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const first = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);
      const second = await createCourse(SCHOOL_ID, '2º Primaria', calendar.id);

      const result = await repository.update(SCHOOL_ID, calendar.id, changes('Primaria'), []);

      expect(result?.after.courses).toEqual([]);
      await expect(calendarOf(first)).resolves.toBeNull();
      await expect(calendarOf(second)).resolves.toBeNull();
    });

    it('throws CalendarCoursesNotFound with the positions of the courses that are not in the school, changing nothing', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const own = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);
      const foreign = await createCourse(OTHER_SCHOOL_ID, 'Curso ajeno');

      const error = await repository
        .update(SCHOOL_ID, calendar.id, changes('Otra', SHORT_DAY), [own, foreign, nextId()])
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CalendarCoursesNotFound);
      expect((error as CalendarCoursesNotFound).positions).toEqual([1, 2]);
      await expect(repository.findById(SCHOOL_ID, calendar.id)).resolves.toMatchObject({
        name: 'Primaria',
        periods: PRIMARY,
        courses: [{ id: own }],
      });
      await expect(calendarOf(foreign)).resolves.toBeNull();
    });

    it('returns null, changing nothing, for a calendar of another school or one that does not exist', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const course = await createCourse(OTHER_SCHOOL_ID, 'Curso ajeno');

      await expect(
        repository.update(OTHER_SCHOOL_ID, calendar.id, changes('Otra', SHORT_DAY), [course]),
      ).resolves.toBeNull();
      await expect(
        repository.update(SCHOOL_ID, nextId(), changes('Otra', SHORT_DAY), []),
      ).resolves.toBeNull();

      await expect(repository.findById(SCHOOL_ID, calendar.id)).resolves.toMatchObject({
        name: 'Primaria',
        periods: PRIMARY,
      });
      await expect(calendarOf(course)).resolves.toBeNull();
    });

    it('throws CalendarAlreadyExists for the name of another calendar of the school, changing nothing', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      await repository.create(SCHOOL_ID, newCalendar('Infantil'), []);
      const course = await createCourse(SCHOOL_ID, '1º Primaria');

      await expect(
        repository.update(SCHOOL_ID, calendar.id, changes('Infantil', SHORT_DAY), [course]),
      ).rejects.toBeInstanceOf(CalendarAlreadyExists);

      await expect(repository.findById(SCHOOL_ID, calendar.id)).resolves.toMatchObject({
        name: 'Primaria',
        periods: PRIMARY,
        courses: [],
      });
      await expect(calendarOf(course)).resolves.toBeNull();
    });

    it('lets another school use the name of this calendar', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const foreign = newCalendar('Infantil');
      await repository.create(OTHER_SCHOOL_ID, foreign, []);

      await expect(
        repository.update(OTHER_SCHOOL_ID, foreign.id, changes('Primaria'), []),
      ).resolves.toMatchObject({ after: { name: 'Primaria' } });
    });

    it('changes nothing when the update of the courses fails halfway: name, periods and courses stay', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const kept = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);
      const added = await createCourse(SCHOOL_ID, '2º Primaria');
      // Un disparador que rechaza cualquier cambio de curso hace fallar la operación después de reescribir los periodos.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_course_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_course_update BEFORE UPDATE ON courses FOR EACH ROW EXECUTE FUNCTION reject_course_update()',
      );

      try {
        await expect(
          repository.update(SCHOOL_ID, calendar.id, changes('Otra', SHORT_DAY), [added]),
        ).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_course_update ON courses');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_course_update()');
      }

      await expect(repository.findById(SCHOOL_ID, calendar.id)).resolves.toMatchObject({
        name: 'Primaria',
        periods: PRIMARY,
        courses: [{ id: kept }],
      });
      await expect(calendarOf(added)).resolves.toBeNull();
    });
  });

  describe('delete', () => {
    it('deletes the calendar and its periods, leaves its courses alive and without calendar, and returns how many', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const first = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);
      const second = await createCourse(SCHOOL_ID, '2º Primaria', calendar.id);

      await expect(repository.delete(SCHOOL_ID, calendar.id)).resolves.toEqual({ courseCount: 2 });

      await expect(calendarCount()).resolves.toBe(0);
      await expect(periodCount()).resolves.toBe(0);
      await expect(
        testPrisma.course.count({ where: { id: { in: [first, second] } } }),
      ).resolves.toBe(2);
      await expect(calendarOf(first)).resolves.toBeNull();
      await expect(calendarOf(second)).resolves.toBeNull();
    });

    it('returns a count of zero for a calendar that no course followed', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);

      await expect(repository.delete(SCHOOL_ID, calendar.id)).resolves.toEqual({ courseCount: 0 });

      await expect(calendarCount()).resolves.toBe(0);
    });

    it('does not touch the other calendars of the school, their periods or their courses', async () => {
      const doomed = newCalendar('Primaria');
      const kept = newCalendar('Infantil', SHORT_DAY);
      await repository.create(SCHOOL_ID, doomed, []);
      await repository.create(SCHOOL_ID, kept, []);
      const freed = await createCourse(SCHOOL_ID, '1º Primaria', doomed.id);
      const stays = await createCourse(SCHOOL_ID, '1º Infantil', kept.id);

      await repository.delete(SCHOOL_ID, doomed.id);

      await expect(repository.findById(SCHOOL_ID, kept.id)).resolves.toMatchObject({
        name: 'Infantil',
        periods: SHORT_DAY,
        courses: [{ id: stays }],
      });
      await expect(periodCount()).resolves.toBe(SHORT_DAY.length);
      await expect(calendarOf(freed)).resolves.toBeNull();
    });

    it('returns null, deleting nothing, for a calendar of another school or one that does not exist', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);

      await expect(repository.delete(OTHER_SCHOOL_ID, calendar.id)).resolves.toBeNull();
      await expect(repository.delete(SCHOOL_ID, nextId())).resolves.toBeNull();

      await expect(calendarCount()).resolves.toBe(1);
      await expect(periodCount()).resolves.toBe(PRIMARY.length);
      await expect(calendarOf(course)).resolves.toBe(calendar.id);
    });

    it('returns null the second time the same calendar is deleted', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);

      await repository.delete(SCHOOL_ID, calendar.id);

      await expect(repository.delete(SCHOOL_ID, calendar.id)).resolves.toBeNull();
    });

    it('deletes nothing when the periods cannot be deleted: calendar, periods and courses stay', async () => {
      const calendar = newCalendar('Primaria');
      await repository.create(SCHOOL_ID, calendar, []);
      const course = await createCourse(SCHOOL_ID, '1º Primaria', calendar.id);
      // Un disparador que rechaza el borrado de cualquier periodo hace fallar la cascada a mitad.
      await testPrisma.$executeRawUnsafe(
        `CREATE FUNCTION reject_period_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo forzado'; END $$`,
      );
      await testPrisma.$executeRawUnsafe(
        'CREATE TRIGGER reject_period_delete BEFORE DELETE ON calendar_periods FOR EACH ROW EXECUTE FUNCTION reject_period_delete()',
      );

      try {
        await expect(repository.delete(SCHOOL_ID, calendar.id)).rejects.toThrow();
      } finally {
        await testPrisma.$executeRawUnsafe('DROP TRIGGER reject_period_delete ON calendar_periods');
        await testPrisma.$executeRawUnsafe('DROP FUNCTION reject_period_delete()');
      }

      await expect(repository.findById(SCHOOL_ID, calendar.id)).resolves.toMatchObject({
        name: 'Primaria',
        periods: PRIMARY,
        courses: [{ id: course }],
      });
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

    it('leaves a calendar edited by two people at once entirely as one of the two saved it', async () => {
      for (let round = 0; round < 8; round += 1) {
        const calendar = newCalendar(`Calendario ${String(round)}`);
        await repository.create(SCHOOL_ID, calendar, []);
        const courses = await Promise.all(
          ['A', 'B', 'C'].map((letter) =>
            createCourse(SCHOOL_ID, `Curso ${letter} ${String(round)}`),
          ),
        );
        const first = {
          changes: changes(`Primero ${String(round)}`, SHORT_DAY),
          courses: [courses[0], courses[1]] as string[],
        };
        const second = {
          changes: changes(`Segundo ${String(round)}`, PRIMARY),
          courses: [courses[2]] as string[],
        };

        const results = await Promise.allSettled([
          repository.update(SCHOOL_ID, calendar.id, first.changes, first.courses),
          repository.update(SCHOOL_ID, calendar.id, second.changes, second.courses),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        const stored = await repository.findById(SCHOOL_ID, calendar.id);
        const winner = stored?.name === first.changes.name ? first : second;
        expect(stored?.name).toBe(winner.changes.name);
        expect(stored?.periods).toEqual(winner.changes.periods);
        expect(stored?.courses.map(({ id }) => id).sort()).toEqual([...winner.courses].sort());
        await expect(periodCount()).resolves.toBe(winner.changes.periods.length);
        await testPrisma.course.updateMany({ data: { calendarId: null } });
        await testPrisma.calendar.deleteMany();
      }
    });

    it('either keeps the course in the edit or finds it deleted, never an error or a dangling course', async () => {
      for (let round = 0; round < 8; round += 1) {
        const calendar = newCalendar(`Calendario ${String(round)}`);
        await repository.create(SCHOOL_ID, calendar, []);
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`, calendar.id);

        const [edited, deleted] = await Promise.allSettled([
          repository.update(
            SCHOOL_ID,
            calendar.id,
            changes(`Editado ${String(round)}`, SHORT_DAY),
            [course],
          ),
          courseRepository.delete(SCHOOL_ID, course),
        ]);

        expect(deleted.status).toBe('fulfilled');
        if (edited.status === 'rejected') {
          expect(edited.reason).toBeInstanceOf(CalendarCoursesNotFound);
          await expect(repository.findById(SCHOOL_ID, calendar.id)).resolves.toMatchObject({
            name: `Calendario ${String(round)}`,
          });
        } else {
          await expect(repository.findById(SCHOOL_ID, calendar.id)).resolves.toMatchObject({
            name: `Editado ${String(round)}`,
            courses: [],
          });
        }
        await expect(testPrisma.course.count({ where: { id: course } })).resolves.toBe(0);
      }
    });

    it('finishes an edit and a creation with courses in common without error, each shared course in one of them', async () => {
      for (let round = 0; round < 6; round += 1) {
        const calendar = newCalendar(`Calendario ${String(round)}`);
        await repository.create(SCHOOL_ID, calendar, []);
        const courses = await Promise.all(
          ['A', 'B', 'C'].map((letter) =>
            createCourse(SCHOOL_ID, `Curso ${letter} ${String(round)}`, calendar.id),
          ),
        );
        const created = newCalendar(`Nuevo ${String(round)}`);

        const results = await Promise.allSettled([
          repository.update(
            SCHOOL_ID,
            calendar.id,
            changes(`Editado ${String(round)}`),
            [...courses].reverse(),
          ),
          repository.create(SCHOOL_ID, created, courses),
        ]);

        expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
        for (const course of courses) {
          expect([calendar.id, created.id]).toContain(await calendarOf(course));
        }
      }
    });

    it('lets only one of two simultaneous deletions of the same calendar succeed, with the count', async () => {
      for (let round = 0; round < 8; round += 1) {
        const calendar = newCalendar(`Calendario ${String(round)}`);
        await repository.create(SCHOOL_ID, calendar, []);
        const course = await createCourse(SCHOOL_ID, `Curso ${String(round)}`, calendar.id);

        const results = await Promise.all([
          repository.delete(SCHOOL_ID, calendar.id),
          repository.delete(SCHOOL_ID, calendar.id),
        ]);

        expect(results).toContainEqual({ courseCount: 1 });
        expect(results).toContainEqual(null);
        await expect(calendarOf(course)).resolves.toBeNull();
        await expect(calendarCount()).resolves.toBe(0);
      }
    });

    it('either edits the calendar before it is deleted or finds it gone, never an error or a dangling course', async () => {
      for (let round = 0; round < 8; round += 1) {
        const calendar = newCalendar(`Calendario ${String(round)}`);
        await repository.create(SCHOOL_ID, calendar, []);
        const kept = await createCourse(SCHOOL_ID, `Curso A ${String(round)}`, calendar.id);
        const added = await createCourse(SCHOOL_ID, `Curso B ${String(round)}`);

        const [deleted, edited] = await Promise.allSettled([
          repository.delete(SCHOOL_ID, calendar.id),
          repository.update(
            SCHOOL_ID,
            calendar.id,
            changes(`Editado ${String(round)}`, SHORT_DAY),
            [added],
          ),
        ]);

        expect(deleted.status).toBe('fulfilled');
        expect(edited.status).toBe('fulfilled');
        await expect(calendarCount()).resolves.toBe(0);
        await expect(periodCount()).resolves.toBe(0);
        await expect(calendarOf(kept)).resolves.toBeNull();
        await expect(calendarOf(added)).resolves.toBeNull();
      }
    });

    it('lets another calendar take a course of the deleted one: the course ends up in the other calendar', async () => {
      for (let round = 0; round < 8; round += 1) {
        const doomed = newCalendar(`Calendario ${String(round)}`);
        const other = newCalendar(`Otro ${String(round)}`);
        await repository.create(SCHOOL_ID, doomed, []);
        await repository.create(SCHOOL_ID, other, []);
        const moved = await createCourse(SCHOOL_ID, `Curso A ${String(round)}`, doomed.id);
        const stays = await createCourse(SCHOOL_ID, `Curso B ${String(round)}`, doomed.id);

        const [deleted, edited] = await Promise.allSettled([
          repository.delete(SCHOOL_ID, doomed.id),
          repository.update(SCHOOL_ID, other.id, changes(`Otro ${String(round)}`), [moved]),
        ]);

        expect(deleted.status).toBe('fulfilled');
        expect(edited.status).toBe('fulfilled');
        await expect(calendarOf(moved)).resolves.toBe(other.id);
        await expect(calendarOf(stays)).resolves.toBeNull();
        await expect(testPrisma.calendar.count({ where: { id: doomed.id } })).resolves.toBe(0);
        await testPrisma.course.updateMany({ data: { calendarId: null } });
        await testPrisma.calendar.deleteMany();
      }
    });

    it('finishes the deletion of a calendar and of one of its courses without error', async () => {
      for (let round = 0; round < 8; round += 1) {
        const calendar = newCalendar(`Calendario ${String(round)}`);
        await repository.create(SCHOOL_ID, calendar, []);
        const doomedCourse = await createCourse(SCHOOL_ID, `Curso A ${String(round)}`, calendar.id);
        const survivor = await createCourse(SCHOOL_ID, `Curso B ${String(round)}`, calendar.id);

        const [deleted, courseDeleted] = await Promise.allSettled([
          repository.delete(SCHOOL_ID, calendar.id),
          courseRepository.delete(SCHOOL_ID, doomedCourse),
        ]);

        expect(deleted.status).toBe('fulfilled');
        expect(courseDeleted.status).toBe('fulfilled');
        await expect(calendarCount()).resolves.toBe(0);
        await expect(testPrisma.course.count({ where: { id: doomedCourse } })).resolves.toBe(0);
        await expect(calendarOf(survivor)).resolves.toBeNull();
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
    [
      'findById',
      (repository: PrismaCalendarRepository) => repository.findById(SCHOOL_ID, nextId()),
    ],
    [
      'update',
      (repository: PrismaCalendarRepository) =>
        repository.update(SCHOOL_ID, nextId(), changes('Primaria'), []),
    ],
    ['delete', (repository: PrismaCalendarRepository) => repository.delete(SCHOOL_ID, nextId())],
  ])('%s throws DatabaseUnavailable', async (_name, operation) => {
    const { prisma, repository } = unreachable();

    await expect(operation(repository)).rejects.toBeInstanceOf(DatabaseUnavailable);

    await prisma.$disconnect();
  });
});
