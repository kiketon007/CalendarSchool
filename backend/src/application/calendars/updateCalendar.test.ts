import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Calendar } from '../../domain/calendar/calendar.js';
import {
  CalendarAlreadyExists,
  CalendarCoursesNotFound,
  CalendarNotFound,
} from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { UpdateCalendar } from './updateCalendar.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1', calendarId: 'cal-1' } as const;
const COURSE_A = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_B = '0192f5a0-0000-7000-8000-0000000000d2';
const COURSE_C = '0192f5a0-0000-7000-8000-0000000000d3';

const PERIODS = [
  { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
  { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
  { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
] as const;

const before: Calendar = {
  id: 'cal-1',
  name: 'Primaria',
  createdAt: new Date('2026-10-23T09:30:00Z'),
  periods: PERIODS,
  courses: [
    { id: COURSE_A, name: '2º Primaria' },
    { id: COURSE_B, name: '10º Primaria' },
  ],
};

/** Cuerpo que no cambia nada respecto a `before`. */
const sameBody = {
  name: 'Primaria',
  periods: PERIODS,
  courseIds: [COURSE_A, COURSE_B],
};

describe('UpdateCalendar', () => {
  let update: Mock<CalendarRepository['update']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: UpdateCalendar;

  /** El repositorio devuelve cómo era y cómo queda; los tests fijan lo que queda. */
  function answerWith(after: Partial<Calendar>) {
    update.mockResolvedValue({ before, after: { ...before, ...after } });
  }

  beforeEach(() => {
    update = vi.fn<CalendarRepository['update']>();
    answerWith({});
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new UpdateCalendar({
      calendarRepository: { update },
      logger: { info, warn },
    });
  });

  it('saves the cleaned and normalized final state under the school and the calendar of the request', async () => {
    const result = await useCase.execute({
      ...identity,
      body: { ...sameBody, name: '  Primaria   1º ' },
    });

    expect(update).toHaveBeenCalledExactlyOnceWith(
      'school-1',
      'cal-1',
      { name: 'Primaria 1º', normalizedName: 'primaria 1º', periods: PERIODS },
      [COURSE_A, COURSE_B],
    );
    expect(result.id).toBe('cal-1');
  });

  it('returns the calendar as it was saved, with its courses in natural order', async () => {
    answerWith({
      courses: [
        { id: COURSE_B, name: '10º Primaria' },
        { id: COURSE_A, name: '2º Primaria' },
      ],
    });

    const result = await useCase.execute({ ...identity, body: sameBody });

    expect(result.courses.map(({ name }) => name)).toEqual(['2º Primaria', '10º Primaria']);
  });

  it('answers a missing courseIds as an empty list', async () => {
    await useCase.execute({ ...identity, body: { name: 'Primaria', periods: PERIODS } });

    expect(update).toHaveBeenCalledWith('school-1', 'cal-1', expect.anything(), []);
  });

  it('throws ValidationError without reaching the repository and without logging anything', async () => {
    await expect(useCase.execute({ ...identity, body: { ...sameBody, name: '' } })).rejects.toEqual(
      new ValidationError([{ field: 'name', code: 'REQUIRED' }]),
    );

    expect(update).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('throws CalendarNotFound and logs why when the calendar is not in the school', async () => {
    update.mockResolvedValue(null);

    await expect(useCase.execute({ ...identity, body: sameBody })).rejects.toBeInstanceOf(
      CalendarNotFound,
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'CALENDAR_UPDATE_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        calendar_id: 'cal-1',
        reason: 'not_found',
      },
      expect.any(String),
    );
  });

  it('turns the missing courses into a 400 on each courseIds[i] and logs course_not_found', async () => {
    update.mockRejectedValue(new CalendarCoursesNotFound([1]));

    await expect(useCase.execute({ ...identity, body: sameBody })).rejects.toEqual(
      new ValidationError([{ field: 'courseIds[1]', code: 'NOT_FOUND' }]),
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ event: 'CALENDAR_UPDATE_REJECTED', reason: 'course_not_found' }),
      expect.any(String),
    );
  });

  it('logs duplicate and lets CalendarAlreadyExists through', async () => {
    update.mockRejectedValue(new CalendarAlreadyExists());

    await expect(useCase.execute({ ...identity, body: sameBody })).rejects.toBeInstanceOf(
      CalendarAlreadyExists,
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        event: 'CALENDAR_UPDATE_REJECTED',
        calendar_id: 'cal-1',
        reason: 'duplicate',
      }),
      expect.any(String),
    );
  });

  it('lets a database failure through without logging a rejection', async () => {
    update.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body: sameBody })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );

    expect(warn).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  describe('CALENDAR_UPDATED', () => {
    const event = () => info.mock.calls[0]?.[0] as Record<string, unknown>;

    it('lists no changed field, and no course added or removed, when nothing changed', async () => {
      await useCase.execute({ ...identity, body: sameBody });

      expect(info).toHaveBeenCalledExactlyOnceWith(
        {
          event: 'CALENDAR_UPDATED',
          school_id: 'school-1',
          actor_id: 'actor-1',
          calendar_id: 'cal-1',
          changed_fields: [],
          session_count: 2,
          break_count: 1,
          courses_added: 0,
          courses_removed: 0,
        },
        expect.any(String),
      );
    });

    it('lists name when only the name changed, even if it is only the capital letters', async () => {
      answerWith({ name: 'PRIMARIA' });

      await useCase.execute({ ...identity, body: { ...sameBody, name: 'PRIMARIA' } });

      expect(event().changed_fields).toEqual(['name']);
    });

    it('lists periods when a time, a type or the number of periods changed', async () => {
      answerWith({
        periods: [
          { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
          { type: 'BREAK', startTime: '09:45', endTime: '10:30' },
          { type: 'SESSION', startTime: '10:30', endTime: '11:15' },
          { type: 'SESSION', startTime: '11:15', endTime: '12:00' },
        ],
      });

      await useCase.execute({ ...identity, body: sameBody });

      expect(event().changed_fields).toEqual(['periods']);
      expect(event().session_count).toBe(3);
      expect(event().break_count).toBe(1);
    });

    it('lists courses, counting the added and the removed ones, when the set of courses changed', async () => {
      answerWith({
        courses: [
          { id: COURSE_A, name: '2º Primaria' },
          { id: COURSE_C, name: '3º Primaria' },
        ],
      });

      await useCase.execute({ ...identity, body: sameBody });

      expect(event().changed_fields).toEqual(['courses']);
      expect(event().courses_added).toBe(1);
      expect(event().courses_removed).toBe(1);
    });

    it('does not list courses when only their order differs', async () => {
      answerWith({
        courses: [
          { id: COURSE_B, name: '10º Primaria' },
          { id: COURSE_A, name: '2º Primaria' },
        ],
      });

      await useCase.execute({ ...identity, body: sameBody });

      expect(event().changed_fields).toEqual([]);
    });

    it('lists the three fields in a fixed order when everything changed', async () => {
      answerWith({
        name: 'Otra',
        periods: [{ type: 'SESSION', startTime: '09:00', endTime: '09:30' }],
        courses: [],
      });

      await useCase.execute({ ...identity, body: sameBody });

      expect(event().changed_fields).toEqual(['name', 'periods', 'courses']);
      expect(event().courses_removed).toBe(2);
    });

    it('never puts a name of the calendar or of a course in the log', async () => {
      answerWith({ name: 'Secundaria Especial' });
      update.mockRejectedValueOnce(new CalendarAlreadyExists());

      await expect(useCase.execute({ ...identity, body: sameBody })).rejects.toThrow();
      await useCase.execute({ ...identity, body: sameBody });

      const logged = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
      expect(logged).not.toContain('Primaria');
      expect(logged).not.toContain('Secundaria');
    });
  });
});
