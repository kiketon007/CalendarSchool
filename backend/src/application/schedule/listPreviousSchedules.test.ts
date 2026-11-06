import { describe, expect, it, vi } from 'vitest';
import { DatabaseUnavailable } from '../databaseUnavailable.js';
import type {
  ScheduleReadRepository,
  StoredScheduleSummary,
} from '../../domain/schedule/scheduleRead.js';
import { ListPreviousSchedules } from './listPreviousSchedules.js';

const SCHOOL_ID = 'school-1';

function previous(id: string, replacedAt: string): StoredScheduleSummary {
  return {
    id,
    status: 'OFFICIAL',
    generatedAt: new Date('2026-11-04T08:00:05.000Z'),
    placedSessions: 290,
    confirmedAt: new Date('2026-11-04T10:30:00.000Z'),
    confirmedBy: { firstName: 'Ana', lastName: 'García' },
    replacedAt: new Date(replacedAt),
    score: {
      total: 134,
      preferredMisses: 8,
      preferredTotal: 50,
      professorGaps: 18,
      consecutiveDays: 6,
      initialTotal: 220,
    },
  };
}

function useCaseWith(schedules: StoredScheduleSummary[]) {
  const listPrevious = vi.fn<ScheduleReadRepository['listPrevious']>().mockResolvedValue(schedules);
  return {
    useCase: new ListPreviousSchedules({ scheduleReadRepository: { listPrevious } }),
    listPrevious,
  };
}

describe('ListPreviousSchedules', () => {
  it('asks the repository for the school of the session, once', async () => {
    const { useCase, listPrevious } = useCaseWith([]);

    await useCase.execute({ schoolId: SCHOOL_ID });

    expect(listPrevious).toHaveBeenCalledExactlyOnceWith(SCHOOL_ID);
  });

  it('returns the headers in the order the repository gives them', async () => {
    const newer = previous('official-2', '2026-11-06T09:00:00.000Z');
    const older = previous('official-1', '2026-11-05T09:00:00.000Z');
    const { useCase } = useCaseWith([newer, older]);

    await expect(useCase.execute({ schoolId: SCHOOL_ID })).resolves.toEqual([newer, older]);
  });

  it('returns an empty list when no official was replaced', async () => {
    const { useCase } = useCaseWith([]);

    await expect(useCase.execute({ schoolId: SCHOOL_ID })).resolves.toEqual([]);
  });

  it('lets the database unavailability through', async () => {
    const listPrevious = vi
      .fn<ScheduleReadRepository['listPrevious']>()
      .mockRejectedValue(new DatabaseUnavailable(new Error('down')));
    const useCase = new ListPreviousSchedules({ scheduleReadRepository: { listPrevious } });

    await expect(useCase.execute({ schoolId: SCHOOL_ID })).rejects.toBeInstanceOf(
      DatabaseUnavailable,
    );
  });
});
