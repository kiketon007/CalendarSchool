import { beforeEach, describe, expect, it } from 'vitest';
import { testPrisma } from '../../../test/support/testPrisma.js';

const SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000001';
const OTHER_SCHOOL_ID = '0192f5a0-0000-7000-8000-000000000002';
const CALENDAR_ID = '0192f5a0-0000-7000-8000-0000000000c1';
const COURSE_ID = '0192f5a0-0000-7000-8000-0000000000d1';

let sequence = 0;
function id() {
  sequence += 1;
  return `0192f5a0-0000-7000-8000-${String(3000 + sequence).padStart(12, '0')}`;
}

function period(overrides: Record<string, unknown> = {}) {
  return {
    id: id(),
    calendarId: CALENDAR_ID,
    position: 1,
    kind: 'SESSION' as const,
    startMinute: 540,
    endMinute: 585,
    ...overrides,
  };
}

describe('calendars schema', () => {
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
    await testPrisma.calendar.create({
      data: { id: CALENDAR_ID, schoolId: SCHOOL_ID, name: 'Primaria', normalizedName: 'primaria' },
    });
  });

  it('stores a calendar with its periods in order and defaults the dates', async () => {
    await testPrisma.calendarPeriod.createMany({
      data: [
        period({ position: 1 }),
        period({ position: 2, kind: 'BREAK', startMinute: 585, endMinute: 615 }),
        period({ position: 3, startMinute: 615, endMinute: 660 }),
      ],
    });

    const stored = await testPrisma.calendar.findUniqueOrThrow({
      where: { id: CALENDAR_ID },
      include: { periods: { orderBy: { position: 'asc' } } },
    });

    expect(stored.periods.map(({ kind, startMinute }) => [kind, startMinute])).toEqual([
      ['SESSION', 540],
      ['BREAK', 585],
      ['SESSION', 615],
    ]);
    expect(stored.createdAt).toBeInstanceOf(Date);
    expect(stored.updatedAt).toBeInstanceOf(Date);
  });

  it('accepts the whole day, from 00:00 to 23:59', async () => {
    await expect(
      testPrisma.calendarPeriod.create({ data: period({ startMinute: 0, endMinute: 1439 }) }),
    ).resolves.toMatchObject({ startMinute: 0, endMinute: 1439 });
  });

  describe('the CHECK of the minutes', () => {
    it.each([
      ['an end equal to the start', { startMinute: 540, endMinute: 540 }],
      ['an end before the start', { startMinute: 600, endMinute: 540 }],
      ['a negative start', { startMinute: -1, endMinute: 60 }],
      ['an end after 23:59', { startMinute: 1380, endMinute: 1440 }],
    ])('rejects %s', async (_name, minutes) => {
      await expect(testPrisma.calendarPeriod.create({ data: period(minutes) })).rejects.toThrow();
      await expect(testPrisma.calendarPeriod.count()).resolves.toBe(0);
    });
  });

  it('rejects two periods in the same position of a calendar', async () => {
    await testPrisma.calendarPeriod.create({ data: period({ position: 1 }) });

    await expect(
      testPrisma.calendarPeriod.create({
        data: period({ position: 1, startMinute: 600, endMinute: 640 }),
      }),
    ).rejects.toThrow();
  });

  it('rejects the same normalized name twice in a school but allows it in another one', async () => {
    await expect(
      testPrisma.calendar.create({
        data: { id: id(), schoolId: SCHOOL_ID, name: 'PRIMARIA', normalizedName: 'primaria' },
      }),
    ).rejects.toThrow();

    await expect(
      testPrisma.calendar.create({
        data: { id: id(), schoolId: OTHER_SCHOOL_ID, name: 'Primaria', normalizedName: 'primaria' },
      }),
    ).resolves.toMatchObject({ schoolId: OTHER_SCHOOL_ID });
  });

  it('deletes the periods with their calendar and leaves its courses without calendar', async () => {
    await testPrisma.calendarPeriod.create({ data: period() });
    await testPrisma.course.create({
      data: {
        id: COURSE_ID,
        schoolId: SCHOOL_ID,
        name: '1º Primaria',
        normalizedName: '1primaria',
        calendarId: CALENDAR_ID,
      },
    });

    await testPrisma.calendar.delete({ where: { id: CALENDAR_ID } });

    await expect(testPrisma.calendarPeriod.count()).resolves.toBe(0);
    await expect(
      testPrisma.course.findUniqueOrThrow({ where: { id: COURSE_ID } }),
    ).resolves.toMatchObject({ calendarId: null });
  });

  it('does not let a school be deleted while it has calendars', async () => {
    await expect(testPrisma.school.delete({ where: { id: SCHOOL_ID } })).rejects.toThrow();
  });
});
