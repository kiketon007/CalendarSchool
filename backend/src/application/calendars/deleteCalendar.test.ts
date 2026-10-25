import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { CalendarNotFound } from '../../domain/calendar/calendarErrors.js';
import type { CalendarRepository } from '../../domain/calendar/calendarRepository.js';
import type { ApplicationLogger } from '../applicationLogger.js';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import { DeleteCalendar } from './deleteCalendar.js';

const identity = { schoolId: 'school-1', actorId: 'actor-1', calendarId: 'c1' } as const;

describe('DeleteCalendar', () => {
  let remove: Mock<CalendarRepository['delete']>;
  let info: Mock<ApplicationLogger['info']>;
  let warn: Mock<ApplicationLogger['warn']>;
  let useCase: DeleteCalendar;

  beforeEach(() => {
    remove = vi.fn<CalendarRepository['delete']>().mockResolvedValue({ courseCount: 2 });
    info = vi.fn<ApplicationLogger['info']>();
    warn = vi.fn<ApplicationLogger['warn']>();
    useCase = new DeleteCalendar({
      calendarRepository: { delete: remove },
      logger: { info, warn },
    });
  });

  it('deletes the calendar of the school of the identity and returns its id and the freed courses', async () => {
    await expect(useCase.execute(identity)).resolves.toEqual({ id: 'c1', courseCount: 2 });

    expect(remove).toHaveBeenCalledExactlyOnceWith('school-1', 'c1');
  });

  it('returns a course count of zero when no course followed the calendar', async () => {
    remove.mockResolvedValue({ courseCount: 0 });

    await expect(useCase.execute(identity)).resolves.toEqual({ id: 'c1', courseCount: 0 });
  });

  it('throws CalendarNotFound, without logging anything, when the calendar is not in the school', async () => {
    remove.mockResolvedValue(null);

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(CalendarNotFound);
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('logs CALENDAR_DELETED only with the identifiers and the course count', async () => {
    await useCase.execute(identity);

    expect(info).toHaveBeenCalledExactlyOnceWith(
      {
        event: 'CALENDAR_DELETED',
        school_id: 'school-1',
        actor_id: 'actor-1',
        calendar_id: 'c1',
        course_count: 2,
      },
      expect.any(String),
    );
  });

  it('lets a database failure through without logging a deletion', async () => {
    remove.mockRejectedValue(new DatabaseUnavailable(new Error('connection refused')));

    await expect(useCase.execute(identity)).rejects.toBeInstanceOf(DatabaseUnavailable);
    expect(info).not.toHaveBeenCalled();
  });
});
