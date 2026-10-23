import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Calendar } from '../../domain/calendar/calendar.js';
import {
  CalendarAlreadyExists,
  CalendarCoursesNotFound,
} from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { ValidationError } from '../validationError.js';
import { CreateCalendar } from './createCalendar.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1' } as const;
const COURSE_A = '0192f5a0-0000-7000-8000-0000000000d1';
const COURSE_B = '0192f5a0-0000-7000-8000-0000000000d2';

const body = {
  name: '  Primaria  ',
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
    { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
  ],
  courseIds: [COURSE_A, COURSE_B],
};

const created: Calendar = {
  id: 'id-1',
  name: 'Primaria',
  createdAt: new Date('2026-10-23T09:30:00Z'),
  periods: [
    { type: 'SESSION', startTime: '09:00', endTime: '09:45' },
    { type: 'BREAK', startTime: '09:45', endTime: '10:15' },
    { type: 'SESSION', startTime: '10:15', endTime: '11:00' },
  ],
  courses: [
    { id: COURSE_A, name: '1º Primaria' },
    { id: COURSE_B, name: '2º Primaria' },
  ],
};

describe('CreateCalendar', () => {
  let create: Mock<CalendarRepository['create']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: CreateCalendar;

  beforeEach(() => {
    create = vi.fn<CalendarRepository['create']>().mockResolvedValue(created);
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new CreateCalendar({
      calendarRepository: { create },
      idGenerator: { generate: () => 'id-1' },
      logger: { info, warn },
    });
  });

  it('stores the cleaned and normalized name under the school of the identity, with the periods and the courses', async () => {
    await expect(useCase.execute({ ...identity, body })).resolves.toBe(created);

    expect(create).toHaveBeenCalledExactlyOnceWith(
      'school-1',
      {
        id: 'id-1',
        name: 'Primaria',
        normalizedName: 'primaria',
        periods: body.periods,
      },
      [COURSE_A, COURSE_B],
    );
  });

  it('creates a calendar without courses when courseIds is absent', async () => {
    await useCase.execute({ ...identity, body: { name: 'Infantil', periods: [body.periods[0]] } });

    expect(create).toHaveBeenCalledWith('school-1', expect.anything(), []);
  });

  it('ignores a school sent in the body', async () => {
    await useCase.execute({ ...identity, body: { ...body, schoolId: 'otro' } });

    expect(create).toHaveBeenCalledWith('school-1', expect.anything(), expect.anything());
  });

  it('throws a ValidationError, without touching the repository or logging, for an invalid body', async () => {
    const error = await useCase
      .execute({ ...identity, body: { name: '', periods: [] } })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual([
      { field: 'name', code: 'REQUIRED' },
      { field: 'periods', code: 'REQUIRED' },
    ]);
    expect(create).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('turns the courses that are not in the school into NOT_FOUND errors at their positions, and logs the rejection', async () => {
    create.mockRejectedValue(new CalendarCoursesNotFound([1]));

    const error = await useCase.execute({ ...identity, body }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).details).toEqual([
      { field: 'courseIds[1]', code: 'NOT_FOUND' },
    ]);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'CALENDAR_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'course_not_found',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('lets CalendarAlreadyExists through and logs the rejection as a duplicate', async () => {
    create.mockRejectedValue(new CalendarAlreadyExists());

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      CalendarAlreadyExists,
    );

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'CALENDAR_CREATION_REJECTED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        reason: 'duplicate',
      },
      expect.any(String),
    );
    expect(info).not.toHaveBeenCalled();
  });

  it('logs CALENDAR_CREATED with the identifiers and the counts, never the names', async () => {
    await useCase.execute({ ...identity, body });

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'CALENDAR_CREATED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        calendar_id: 'id-1',
        session_count: 2,
        break_count: 1,
        course_count: 2,
      },
      expect.any(String),
    );
    const logged = JSON.stringify([info.mock.calls, warn.mock.calls]);
    expect(logged).not.toMatch(/Primaria/);
  });

  it('lets a database failure through without logging a creation', async () => {
    create.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute({ ...identity, body })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
